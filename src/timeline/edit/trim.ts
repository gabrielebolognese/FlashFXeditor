// Trimming (spec §6.10, §6.19, P2): the pure edits behind edge drags, the Slip, Slide and Rate stretch
// tools, rolling edits, Q/W (trim to playhead) and E (extend edit). Every edit moves clip edges (or a
// clip's source) by the same number of frames:
// - trim: the clip changes `start`/`in` (in point) or `duration`/`out` (out point) and nothing else
//   moves; the neighbor clip bounds it (no overlap, no overwrite);
// - ripple trim: the in point keeps its timeline position (the clip's content slides under it), and
//   every clip after the edit point on every unlocked track shifts by the change in duration, so no
//   gap opens or closes. The shift stops at the largest one that keeps every track overlap-free. A
//   dragged cue never pushes (spec §10.5): its trims are regular;
// - roll: the cut between two abutting clips moves: the left clip's out and the right clip's in
//   change together, so the total duration stays;
// - slip: `in` and `out` move by the same amount; position and duration stay;
// - slide: the clip moves while its abutting neighbors give and take the frames (the previous one's
//   out, the next one's in), so the total duration stays; a gap on a side grows or shrinks instead;
// - rate stretch: an edge moves and `speed` changes so the same `in`/`out` range fills the new
//   duration (§5.1: speed = source frames / duration; 0.25x to 4x, spec §14).
// Linked partners take the same edit (same delta) unless the caller edits one side only (Alt). Every
// limit is an interval of deltas, so the request is clamped, never refused: the 1-frame minimum, the
// media bounds (`in >= 0`, `out <= media.durationUs`; none for images, text, solids, captions), the
// speed range, frame 0, the neighbor clips (an edge whose facing neighbor edge does not move with it),
// the ripple collisions, and each partner's own. A `plan*` function does the delta-independent part
// once per gesture; `resolveTrim` turns a delta into one command (one undo step).
import type { Draft } from "immer";
import type { Command } from "../../core/commands/command.js";
import { framesToSourceUs, usPerFrame } from "../../core/document/time.js";
import { retimeKeyframes, shiftKeyframes } from "../../core/document/keyframes.js";
import { editDefaults } from "./editDefaults.js";
import { BOUND_SLACK_US, headFrames, reconciled, tailFrames } from "../../core/document/transitions.js";
import { isFreeze, isMediaClip, type CaptionClip, type Clip, type ClipId, type Frame, type MediaClip, type Project, type Rational, type TrackId } from "../../core/document/types.js";
import { loopTimeUs } from "../../media/decode/animation.js";
import { clipInIndex, isClipLocked, lastClipStartingBy, linkedPartners, trackIndex } from "../model/queries.js";

export type TrimEdge = "in" | "out";

/** The edits of spec §6.10 that move clip edges (or a source) by a number of frames. */
export type EditKind = "trim" | "roll" | "slip" | "slide" | "stretch";

/**
 * How an edit changes one clip: an edge trims (`in`, `out`), the whole clip moves (`move`: the slid
 * clip), its source slips under it (`slip`), or an edge moves and changes its speed (`stretchIn`,
 * `stretchOut`).
 */
export type ClipMove = "in" | "out" | "move" | "slip" | "stretchIn" | "stretchOut";

export interface TrimOptions {
  /** Ripple trim (spec §6.10: Ripple mode, or Mod while dragging). */
  ripple: boolean;
  /** Linked partners trim together (Linked selection on and no Alt). Default true. */
  linked?: boolean;
}

/** What stops an edit, in the order a tie between limits at the same delta is reported. */
export type TrimLimitReason = "mediaStart" | "mediaEnd" | "minDuration" | "minSpeed" | "maxSpeed" | "neighbor" | "ripple" | "timelineStart";

const REASON_ORDER: readonly TrimLimitReason[] = ["mediaStart", "mediaEnd", "minDuration", "minSpeed", "maxSpeed", "neighbor", "ripple", "timelineStart"];

/** The speed range of clips (spec §14: 0.25x to 4x). */
export const MIN_SPEED = 0.25;
export const MAX_SPEED = 4;

export interface TrimLimit {
  reason: TrimLimitReason;
  /** The edited clip whose bound it is; for `ripple`, the clip that would collide. */
  clipId: ClipId;
  trackId: TrackId;
}

interface Bound {
  value: number;
  limit: TrimLimit | null;
}

/** A delta that puts a clip's source on its media start or end. */
export interface MediaBoundAt {
  delta: number;
  clipId: ClipId;
  side: "start" | "end";
}

export interface TrimPlan {
  project: Project;
  kind: EditKind;
  /** The dragged clip. */
  clipId: ClipId;
  /** Its dragged edge (a roll drags the left clip's out point; slips and slides use `in`). */
  edge: TrimEdge;
  ripple: boolean;
  /** The clips the edit changes: the given ones first, then their linked partners (and a slide's neighbors). */
  trimmed: readonly Clip[];
  /** How each of `trimmed` changes. */
  moves: ReadonlyMap<ClipId, ClipMove>;
  /** Clips the ripple shifts (none for other edits). */
  shifted: readonly Clip[];
  /** Per track: the start of its first shifted clip, before the shift. */
  firstShifted: ReadonlyMap<TrackId, Frame>;
  /** Edited and shifted ids: what the edit moves (snapping excludes them, spec §6.9). */
  moving: ReadonlySet<ClipId>;
  /** The lowest and highest delta every limit allows (`lo <= 0 <= hi`). */
  lo: Bound;
  hi: Bound;
  /** The deltas that put an edited clip's source on its media bound. */
  mediaBounds: readonly MediaBoundAt[];
}

export interface TrimResult {
  plan: TrimPlan;
  /** The requested delta, rounded to whole frames. */
  requested: number;
  /** The delta applied: the request clamped to the limits (0: nothing changes). */
  delta: number;
  /** Frames the shifted clips move (ripple; 0 otherwise). */
  shift: number;
  /** What clamped the request, or null when it fit. */
  limit: TrimLimit | null;
  /** The dragged clip's (else the first) source sits on a media bound (spec §6.10: `Media start` / `Media end`). */
  mediaBound: "start" | "end" | null;
  /** Every edited clip whose source sits on a media bound, and which one (its edge turns red). */
  bounds: ReadonlyMap<ClipId, "start" | "end">;
  /** The new version of every clip that changes. */
  changes: ReadonlyMap<ClipId, Clip>;
  /** One undo step, or null when nothing changes. */
  command: Command | null;
}

export { headFrames, tailFrames };

/** The timeline frame of a clip edge: its start, or its end (exclusive). */
export function edgeFrame(clip: Clip, edge: TrimEdge): Frame {
  return edge === "in" ? clip.start : clip.start + clip.duration;
}

/**
 * Video and audio clips play a source that moves under them: media bounds, slips, speed, keyframes
 * follow it. A freeze frame holds one source time (Batch 27): its edges trim like an image's.
 */
export function hasSource(clip: Clip): clip is MediaClip {
  return (clip.kind === "video" || clip.kind === "audio") && !isFreeze(clip);
}


/** The longest duration a clip can have from its `in` without passing the media end (largest d with in + d frames <= durationUs). */
export function maxDurationFrames(clip: MediaClip, durationUs: number, fps: Rational): number {
  const room = durationUs - clip.in;
  if (room <= 0) return 0;
  let d = Math.floor(room / (usPerFrame(fps) * clip.speed));
  // Within the rounding slack of the media end (BOUND_SLACK_US): `out` is clamped to it.
  while (clip.in + framesToSourceUs(d + 1, clip.speed, fps) <= durationUs + BOUND_SLACK_US) d += 1;
  while (d > 0 && clip.in + framesToSourceUs(d, clip.speed, fps) > durationUs + BOUND_SLACK_US) d -= 1;
  return d;
}


/** The durations a rate stretch allows (speed within 0.25x..4x, at least 1 frame), and what bounds the shortest. */
function stretchRange(clip: Clip, fps: Rational): { min: number; max: number; minReason: TrimLimitReason } {
  // The source frames the clip plays stay the same: duration * speed (§5.1).
  const span = clip.duration * (isMediaClip(clip) ? clip.speed : 1);
  const fastest = Math.ceil(span / MAX_SPEED - 1e-9);
  let max = Math.max(1, Math.floor(span / MIN_SPEED + 1e-9));
  // `in` and `out` stay, so they must stay within one source frame (at the new speed) of duration *
  // speed (§5.2): a source range off the frame grid (a frame rate conversion keeps one within a frame,
  // fpsConvert.ts) slows down only as far as that holds.
  const off = isMediaClip(clip) ? Math.abs(clip.out - clip.in - span * usPerFrame(fps)) : 0;
  if (off > 0) max = Math.min(max, Math.max(clip.duration, Math.floor((span * usPerFrame(fps)) / off - 1e-6)));
  return { min: Math.max(1, fastest), max, minReason: fastest > 1 ? "maxSpeed" : "minDuration" };
}

/** Keeps the tighter bound; a tie goes to the reason first in `REASON_ORDER`. */
function tighter(current: Bound, value: number, limit: TrimLimit, side: "lo" | "hi"): Bound {
  if (side === "lo" ? value > current.value : value < current.value) return { value, limit };
  if (value === current.value && current.limit && REASON_ORDER.indexOf(limit.reason) < REASON_ORDER.indexOf(current.limit.reason)) return { value, limit };
  return current;
}

const startMoves = (move: ClipMove | undefined) => move === "in" || move === "move" || move === "stretchIn";
const endMoves = (move: ClipMove | undefined) => move === "out" || move === "move" || move === "stretchOut";

/** Adds `move` for a clip that exists, is not on a locked track (spec §6.12) and has no move yet. */
function addMove(project: Project, moves: Map<ClipId, ClipMove>, clipId: ClipId, move: ClipMove): void {
  if (!project.clips[clipId] || moves.has(clipId) || isClipLocked(project, clipId)) return;
  moves.set(clipId, move);
}

/** The partners of every clip in `moves` (unless `linked` is false), with the move `of` gives. */
function addPartners(project: Project, moves: Map<ClipId, ClipMove>, linked: boolean | undefined, of: (move: ClipMove) => ClipMove | null): void {
  if (linked === false) return;
  for (const [id, move] of [...moves]) {
    const partnerMove = of(move);
    if (partnerMove) for (const partner of linkedPartners(project, id)) addMove(project, moves, partner, partnerMove);
  }
}

/**
 * The delta-independent part of an edit: the delta range every limit allows for `moves` (and, for a
 * ripple trim of `edge`, the clips it shifts). Clips on locked tracks are never edited or shifted.
 */
function buildPlan(project: Project, kind: EditKind, clipId: ClipId, edge: TrimEdge, moves: ReadonlyMap<ClipId, ClipMove>, ripple: boolean): TrimPlan {
  const { fps } = project.settings;
  const trimmed: Clip[] = [];
  for (const id of moves.keys()) trimmed.push(project.clips[id] as Clip);

  let lo: Bound = { value: -Infinity, limit: null };
  let hi: Bound = { value: Infinity, limit: null };
  const mediaBounds: MediaBoundAt[] = [];
  const tracks = new Map(project.tracks.map((track) => [track.id, track]));
  for (const clip of trimmed) {
    const move = moves.get(clip.id) as ClipMove;
    const at = (reason: TrimLimitReason): TrimLimit => ({ reason, clipId: clip.id, trackId: clip.trackId });
    const track = tracks.get(clip.trackId);
    if (!track) continue;
    const index = trackIndex(project, track);
    const position = lastClipStartingBy(index, clip.start);
    const end = clip.start + clip.duration;
    // The neighbors: an edge stops at the facing edge of the clip next to it, unless that edge moves too.
    if (!ripple && startMoves(move)) {
      lo = tighter(lo, -clip.start, at("timelineStart"), "lo");
      const prev = index.clips[position - 1];
      if (prev && !endMoves(moves.get(prev.id))) lo = tighter(lo, prev.start + prev.duration - clip.start, at("neighbor"), "lo");
    }
    if (!ripple && endMoves(move)) {
      const next = index.clips[position + 1];
      if (next && !startMoves(moves.get(next.id))) hi = tighter(hi, next.start - end, at("neighbor"), "hi");
    }
    const media = hasSource(clip) ? project.media[clip.mediaId] : undefined;
    switch (move) {
      case "in":
        hi = tighter(hi, clip.duration - 1, at("minDuration"), "hi");
        if (hasSource(clip)) {
          const bound = -headFrames(clip, fps);
          mediaBounds.push({ delta: bound, clipId: clip.id, side: "start" });
          lo = tighter(lo, bound, at("mediaStart"), "lo");
        }
        break;
      case "out":
        lo = tighter(lo, 1 - clip.duration, at("minDuration"), "lo");
        if (hasSource(clip)) {
          const bound = media ? Math.max(0, maxDurationFrames(clip, media.durationUs, fps) - clip.duration) : 0;
          mediaBounds.push({ delta: bound, clipId: clip.id, side: "end" });
          hi = tighter(hi, bound, at("mediaEnd"), "hi");
        }
        break;
      case "slip":
        if (hasSource(clip)) {
          const head = -headFrames(clip, fps);
          const tail = media ? tailFrames(clip, media.durationUs, fps) : 0;
          mediaBounds.push({ delta: head, clipId: clip.id, side: "start" }, { delta: tail, clipId: clip.id, side: "end" });
          lo = tighter(lo, head, at("mediaStart"), "lo");
          hi = tighter(hi, tail, at("mediaEnd"), "hi");
        }
        break;
      case "stretchIn":
      case "stretchOut": {
        // The new duration is d - delta (in) or d + delta (out).
        const range = stretchRange(clip, fps);
        const d = clip.duration;
        if (move === "stretchIn") {
          hi = tighter(hi, d - range.min, at(range.minReason), "hi");
          lo = tighter(lo, d - range.max, at("minSpeed"), "lo");
        } else {
          lo = tighter(lo, range.min - d, at(range.minReason), "lo");
          hi = tighter(hi, range.max - d, at("minSpeed"), "hi");
        }
        break;
      }
      case "move":
        break;
    }
  }

  const shifted: Clip[] = [];
  const firstShifted = new Map<TrackId, Frame>();
  const primary = trimmed[0];
  if (ripple && primary) {
    // The edit point: the trimmed clip's edge on its own track, the dragged clip's edge elsewhere.
    const editPoint = edgeFrame(primary, edge);
    for (const track of project.tracks) {
      if (track.locked) continue;
      const index = trackIndex(project, track);
      let point = editPoint;
      let hasTrimmed = false;
      for (const clip of trimmed) {
        if (clip.trackId !== track.id) continue;
        point = hasTrimmed ? Math.min(point, edgeFrame(clip, edge)) : edgeFrame(clip, edge);
        hasTrimmed = true;
      }
      let first = -1;
      for (let i = lastClipStartingBy(index, point - 1) + 1; i < index.clips.length; i++) {
        const clip = index.clips[i] as Clip;
        if (moves.has(clip.id)) continue;
        if (first === -1) first = i;
        shifted.push(clip);
      }
      if (first === -1) continue;
      const head = index.clips[first] as Clip;
      firstShifted.set(track.id, head.start);
      // A shift to the left is bounded by the clip before the first shifted one (or frame 0). A
      // trimmed clip there moves its edge with the shift, so it never limits.
      const prev = index.clips[first - 1];
      if (prev && moves.has(prev.id)) continue;
      const gap = head.start - (prev ? prev.start + prev.duration : 0);
      const limit: TrimLimit = { reason: "ripple", clipId: head.id, trackId: track.id };
      // Out point: the shift is the delta; in point: the shift is minus the delta.
      if (edge === "out") lo = tighter(lo, -gap, limit, "lo");
      else hi = tighter(hi, gap, limit, "hi");
    }
  }
  // A valid document always allows 0 (no change).
  if (lo.value > 0) lo = { value: 0, limit: lo.limit };
  if (hi.value < 0) hi = { value: 0, limit: hi.limit };
  const moving = new Set<ClipId>(moves.keys());
  for (const clip of shifted) moving.add(clip.id);
  return { project, kind, clipId, edge, ripple, trimmed, moves, shifted, firstShifted, moving, lo, hi, mediaBounds };
}

/**
 * A trim of `edge` on `clipIds` and, with `linked`, their partners on unlocked tracks (spec §6.10):
 * regular, or ripple with `options.ripple`.
 */
export function planTrim(project: Project, clipIds: readonly ClipId[], edge: TrimEdge, options: TrimOptions): TrimPlan {
  const moves = new Map<ClipId, ClipMove>();
  for (const id of clipIds) addMove(project, moves, id, edge);
  addPartners(project, moves, options.linked, () => edge);
  // A dragged cue never pushes the cues after it (spec §10.5): its trims are regular.
  const ripple = options.ripple && project.clips[clipIds[0] ?? ""]?.kind !== "caption";
  return buildPlan(project, "trim", clipIds[0] ?? "", edge, moves, ripple);
}

/**
 * A rolling edit of the cut between `leftId` and the clip after it, `rightId` (spec §6.10): the left
 * clip's out and the right clip's in move together, and so do their partners' (a linked partner with
 * no clip against it trims alone, bounded by its neighbor). Limited by both media bounds.
 */
export function planRoll(project: Project, leftId: ClipId, rightId: ClipId, options: { linked?: boolean } = {}): TrimPlan {
  const moves = new Map<ClipId, ClipMove>();
  addMove(project, moves, leftId, "out");
  addMove(project, moves, rightId, "in");
  addPartners(project, moves, options.linked, (move) => move);
  return buildPlan(project, "roll", leftId, "out", moves, false);
}

/** A slip of a video or audio clip and its partners (spec §6.10): `in` and `out` move by the delta (later source for > 0). */
export function planSlip(project: Project, clipId: ClipId, options: { linked?: boolean } = {}): TrimPlan {
  const moves = new Map<ClipId, ClipMove>();
  const slip = (id: ClipId) => {
    const clip = project.clips[id];
    if (clip && hasSource(clip)) addMove(project, moves, id, "slip");
  };
  slip(clipId);
  if (options.linked !== false) for (const id of [...moves.keys()]) for (const partner of linkedPartners(project, id)) slip(partner);
  return buildPlan(project, "slip", clipId, "in", moves, false);
}

/**
 * A slide of a clip and its partners (spec §6.10): each moves by the delta; the clip abutting it on the
 * left changes its out point and the one abutting it on the right its in point by the same delta, so
 * the track's total duration stays. A gap on a side takes the change instead (bounded by the clip
 * beyond it). Limited by the neighbors' media bounds and 1-frame minimum.
 */
export function planSlide(project: Project, clipId: ClipId, options: { linked?: boolean } = {}): TrimPlan {
  const slid = new Map<ClipId, ClipMove>();
  addMove(project, slid, clipId, "move");
  addPartners(project, slid, options.linked, () => "move");
  const moves = new Map(slid);
  for (const id of slid.keys()) {
    const clip = project.clips[id] as Clip;
    const track = project.tracks.find((candidate) => candidate.id === clip.trackId);
    if (!track) continue;
    const index = trackIndex(project, track);
    const position = lastClipStartingBy(index, clip.start);
    const prev = index.clips[position - 1];
    const next = index.clips[position + 1];
    if (prev && prev.start + prev.duration === clip.start) addMove(project, moves, prev.id, "out");
    if (next && next.start === clip.start + clip.duration) addMove(project, moves, next.id, "in");
  }
  return buildPlan(project, "slide", clipId, "in", moves, false);
}

/**
 * A rate stretch of `edge` (spec §6.10): the edge moves like a trim and the clip's speed changes so the
 * same `in`/`out` range fills the new duration (0.25x..4x); its partners stretch with it. Images, text,
 * solids, captions and freeze frames have no speed: their edge trims. The Rate stretch tool never
 * ripples; the Speed section's duration (Batch 27) does with its Ripple option.
 */
export function planStretch(project: Project, clipId: ClipId, edge: TrimEdge, options: { linked?: boolean; ripple?: boolean } = {}): TrimPlan {
  const moves = new Map<ClipId, ClipMove>();
  const stretch = (id: ClipId) => {
    const clip = project.clips[id];
    if (clip) addMove(project, moves, id, hasSource(clip) ? (edge === "in" ? "stretchIn" : "stretchOut") : edge);
  };
  stretch(clipId);
  if (options.linked !== false) for (const id of [...moves.keys()]) for (const partner of linkedPartners(project, id)) stretch(partner);
  return buildPlan(project, "stretch", clipId, edge, moves, options.ripple ?? false);
}

/** An edit as a gesture describes it (and the controller replays it on the current document). */
export interface EditSpec {
  kind: EditKind;
  clipId: ClipId;
  /** The dragged edge (trims and stretches); a roll's is the left clip's `out`. */
  edge: TrimEdge;
  /** A roll: the clip right of the cut. */
  rightId?: ClipId | null;
  ripple: boolean;
  linked: boolean;
}

/** The plan of an edit spec. */
export function planEdit(project: Project, spec: EditSpec): TrimPlan {
  switch (spec.kind) {
    case "trim":
      return planTrim(project, [spec.clipId], spec.edge, { ripple: spec.ripple, linked: spec.linked });
    case "roll":
      return planRoll(project, spec.clipId, spec.rightId ?? "", { linked: spec.linked });
    case "slip":
      return planSlip(project, spec.clipId, { linked: spec.linked });
    case "slide":
      return planSlide(project, spec.clipId, { linked: spec.linked });
    case "stretch":
      return planStretch(project, spec.clipId, spec.edge, { linked: spec.linked });
  }
}

/** Fades never outlast the clip. */
function clampFades(next: Clip & Record<string, unknown>, clip: Clip): void {
  if ("fades" in clip) next.fades = { in: Math.min(clip.fades.in, next.duration), out: Math.min(clip.fades.out, next.duration) };
}

/** The clip with its `edge` moved by `delta` frames (the delta is within the plan's limits). */
function trimmedClip(clip: Clip, edge: TrimEdge, delta: number, ripple: boolean, project: Project): Clip {
  const { fps } = project.settings;
  const next = { ...clip } as Clip & Record<string, unknown>;
  if (edge === "in") {
    if (!ripple) next.start = clip.start + delta;
    next.duration = clip.duration - delta;
  } else {
    next.duration = clip.duration + delta;
  }
  if (isMediaClip(clip)) {
    const media = next as MediaClip;
    if (clip.kind === "image") {
      // An image has no media bounds: its source range is just the duration. A still holds its picture;
      // an animated one loops (Batch 34), so an in trim moves `in` with the edge (the frames left in
      // place keep playing as they did), wrapped into one loop.
      const loopUs = project.media[clip.mediaId]?.durationUs ?? 0;
      if (edge === "in" && loopUs > 0) media.in = loopTimeUs(clip.in + framesToSourceUs(delta, clip.speed, fps), loopUs);
      media.out = media.in + framesToSourceUs(media.duration, clip.speed, fps);
    } else if (isFreeze(clip)) {
      // A freeze frame holds its source time for any duration: `in` and `out` stay.
    } else if (edge === "in") {
      // Never before the media start (a handle counted within the rounding slack, BOUND_SLACK_US).
      media.in = Math.max(0, clip.in + framesToSourceUs(delta, clip.speed, fps));
      // Keyframes follow the source (spec §6.10, "keyframes follow source", a setting on by default for
      // media clips): a key stays on the source frame it was set on; off, it stays on the clip start.
      if (clip.keyframes && editDefaults().keyframesFollowSource) media.keyframes = shiftKeyframes(clip.keyframes, delta);
    } else {
      // Moved by the delta (not recomputed from `in`), so a trim and its reverse give back the same out.
      const durationUs = project.media[clip.mediaId]?.durationUs ?? clip.out;
      media.out = Math.min(durationUs, clip.out + framesToSourceUs(delta, clip.speed, fps));
    }
  }
  // Text, solids and images keep their keyframes on the clip start (spec §6.10: off for text clips).
  clampFades(next, clip);
  // Transitions on a trimmed edge are shortened to the handle left, or removed when none is, by
  // `reconcileTransitions` (the document store after the command; `applyTrim` for the live preview).
  // A cue's words are relative to its start: an in trim cuts `delta` frames off its head (moving the
  // start, or sliding the rest under it in a ripple), so they are re-based. Words outside the new span
  // are kept (a trim back shows them again).
  if (clip.kind === "caption" && clip.words && edge === "in" && delta !== 0) {
    (next as CaptionClip).words = clip.words.map((word) => ({ ...word, start: word.start - delta, end: word.end - delta }));
  }
  return next;
}

/** A video or audio clip whose source moved `delta` frames later (keyframes stay on their source frames). */
function slippedClip(clip: MediaClip, delta: number, project: Project): Clip {
  const { fps } = project.settings;
  const next = { ...clip };
  const moved = framesToSourceUs(delta, clip.speed, fps);
  next.in = Math.max(0, clip.in + moved);
  next.out = Math.min(project.media[clip.mediaId]?.durationUs ?? clip.out + moved, clip.out + moved);
  if (clip.keyframes && editDefaults().keyframesFollowSource) next.keyframes = shiftKeyframes(clip.keyframes, delta);
  return next;
}

/** A video or audio clip with an edge moved by `delta` and the speed that keeps its `in`/`out` (§5.1). */
function stretchedClip(clip: MediaClip, move: "stretchIn" | "stretchOut", delta: number): Clip {
  const next = { ...clip } as MediaClip & Record<string, unknown>;
  const duration = move === "stretchIn" ? clip.duration - delta : clip.duration + delta;
  if (move === "stretchIn") next.start = clip.start + delta;
  next.duration = duration;
  // The source frames played stay duration * speed: 100 frames at 1x stretched to 200 play at 0.5x.
  next.speed = (clip.speed * clip.duration) / duration;
  // Keys scale with the duration; keys landing on one frame merge, eases and holds stay (Batch 35).
  if (clip.keyframes) next.keyframes = retimeKeyframes(clip.keyframes, duration / clip.duration);
  clampFades(next, clip);
  return next;
}

function editedClip(clip: Clip, move: ClipMove, delta: number, plan: TrimPlan): Clip {
  switch (move) {
    case "in":
    case "out":
      return trimmedClip(clip, move, delta, plan.ripple, plan.project);
    case "move":
      return { ...clip, start: clip.start + delta };
    case "slip":
      return hasSource(clip) ? slippedClip(clip, delta, plan.project) : clip;
    case "stretchIn":
    case "stretchOut":
      return hasSource(clip) ? stretchedClip(clip, move, delta) : clip;
  }
}

function editLabel(plan: TrimPlan): string {
  const count = (moves: readonly ClipMove[]) => [...plan.moves.values()].filter((move) => moves.includes(move)).length;
  switch (plan.kind) {
    case "roll":
      return "Rolling edit";
    case "slip":
      return count(["slip"]) === 1 ? "Slip clip" : "Slip clips";
    case "slide":
      return count(["move"]) === 1 ? "Slide clip" : "Slide clips";
    case "stretch":
      return count(["stretchIn", "stretchOut", "in", "out"]) === 1 ? "Rate stretch clip" : "Rate stretch clips";
    case "trim":
      if (plan.ripple) return "Ripple trim";
      return plan.trimmed.length === 1 ? "Trim clip" : "Trim clips";
  }
}

const COMMAND_IDS: Record<EditKind, string> = { trim: "clip.trim", roll: "clip.roll", slip: "clip.slip", slide: "clip.slide", stretch: "clip.rateStretch" };

/** Applies an edit of `plan` by `deltaFrames` (rounded, then clamped to the limits) as one command. */
export function resolveTrim(plan: TrimPlan, deltaFrames: number, options: { label?: string } = {}): TrimResult {
  const requested = Math.round(deltaFrames);
  let delta = requested;
  let limit: TrimLimit | null = null;
  if (delta < plan.lo.value) {
    delta = plan.lo.value;
    limit = plan.lo.limit;
  } else if (delta > plan.hi.value) {
    delta = plan.hi.value;
    limit = plan.hi.limit;
  }
  delta ||= 0;
  const shift = plan.ripple ? (plan.edge === "out" ? delta : -delta) || 0 : 0;
  const bounds = new Map<ClipId, "start" | "end">();
  for (const bound of plan.mediaBounds) if (bound.delta === delta && !bounds.has(bound.clipId)) bounds.set(bound.clipId, bound.side);
  const mediaBound = bounds.get(plan.clipId) ?? bounds.values().next().value ?? null;
  const changes = new Map<ClipId, Clip>();
  if (delta !== 0) {
    for (const clip of plan.trimmed) changes.set(clip.id, editedClip(clip, plan.moves.get(clip.id) as ClipMove, delta, plan));
    for (const clip of plan.shifted) changes.set(clip.id, { ...clip, start: clip.start + shift });
  }
  const command = changes.size > 0 ? editCommand(COMMAND_IDS[plan.kind], options.label ?? editLabel(plan), changes) : null;
  return { plan, requested, delta, shift, limit, mediaBound, bounds, changes, command };
}

/** Edits never reorder a track (shifts keep the order, limits keep every gap >= 0): only clips change. */
export function editCommand(id: string, label: string, changes: ReadonlyMap<ClipId, Clip>): Command {
  const entries = [...changes];
  return {
    id,
    label,
    affects: ["clips", "timeline"],
    run(draft) {
      for (const [clipId, clip] of entries) {
        if (!draft.clips[clipId]) throw new Error(`${id}: clip ${clipId} does not exist`);
        draft.clips[clipId] = clip as Draft<Clip>;
      }
    },
  };
}

/** `trimEdge(doc, clipId, edge, deltaFrames, { ripple })` (spec §6.10): one clip edge and, unless `linked: false`, its partners. */
export function trimEdge(project: Project, clipId: ClipId, edge: TrimEdge, deltaFrames: number, options: TrimOptions): TrimResult {
  return resolveTrim(planTrim(project, [clipId], edge, options), deltaFrames);
}

/** `rollEdit(doc, leftId, rightId, deltaFrames)` (spec §6.10): the cut between two abutting clips moves by the delta. */
export function rollEdit(project: Project, leftId: ClipId, rightId: ClipId, deltaFrames: number, options: { linked?: boolean } = {}): TrimResult {
  return resolveTrim(planRoll(project, leftId, rightId, options), deltaFrames);
}

/** `slip(doc, clipId, deltaFrames)` (spec §6.10): the source moves `deltaFrames` later (earlier when < 0) under the clip. */
export function slip(project: Project, clipId: ClipId, deltaFrames: number, options: { linked?: boolean } = {}): TrimResult {
  return resolveTrim(planSlip(project, clipId, options), deltaFrames);
}

/** `slide(doc, clipId, deltaFrames)` (spec §6.10): the clip moves, its abutting neighbors trim to keep the total duration. */
export function slide(project: Project, clipId: ClipId, deltaFrames: number, options: { linked?: boolean } = {}): TrimResult {
  return resolveTrim(planSlide(project, clipId, options), deltaFrames);
}

/** `rateStretch(doc, clipId, edge, deltaFrames)` (spec §6.10, §5.1): speed from the new duration, `in`/`out` kept. */
export function rateStretch(project: Project, clipId: ClipId, edge: TrimEdge, deltaFrames: number, options: { linked?: boolean } = {}): TrimResult {
  return resolveTrim(planStretch(project, clipId, edge, options), deltaFrames);
}

/** The document a trim result leaves (the live preview and the overlay draw it during the drag). */
export function applyTrim(project: Project, result: TrimResult): Project {
  if (result.changes.size === 0) return project;
  const clips = { ...project.clips };
  for (const [id, clip] of result.changes) clips[id] = clip;
  // The transitions the edit shortens or removes (as the document store will after the command).
  return reconciled(project, { ...project, clips });
}

export interface PlayheadTrim {
  result: TrimResult;
  /** Where the playhead goes: after Q, the frame that was under it (now at the edit point). */
  playhead: Frame;
}

/**
 * `Q` (`side` "start") and `W` ("end") (spec §6.10): ripple trims of the edit point nearest the
 * playhead to the playhead. The clips under the playhead on targeted, unlocked tracks give the edit
 * point: the latest start (Q) or the earliest end (W). Those that have their start (end) there, and
 * their linked partners, get it moved to the playhead, and the ripple closes the gap on every
 * unlocked track (limited by collisions). Clips that start at the playhead have nothing to trim;
 * clips spanning the edit point (a music bed) are left alone. Null when nothing is under the playhead.
 */
export function trimToPlayhead(project: Project, playhead: Frame, side: "start" | "end", options: { linked?: boolean } = {}): PlayheadTrim | null {
  const under: Clip[] = [];
  for (const track of project.tracks) {
    if (!track.targeted || track.locked) continue;
    const clip = clipInIndex(trackIndex(project, track), playhead);
    if (clip && clip.start < playhead) under.push(clip);
  }
  if (under.length === 0) return null;
  const edge: TrimEdge = side === "start" ? "in" : "out";
  const point = side === "start" ? Math.max(...under.map((clip) => clip.start)) : Math.min(...under.map((clip) => clip.start + clip.duration));
  const ids = under.filter((clip) => edgeFrame(clip, edge) === point).map((clip) => clip.id);
  const plan = planTrim(project, ids, edge, { ripple: true, linked: options.linked ?? true });
  const result = resolveTrim(plan, playhead - point, { label: side === "start" ? "Ripple trim start to playhead" : "Ripple trim end to playhead" });
  return { result, playhead: side === "start" ? playhead - result.delta : playhead };
}

/**
 * `E` (spec §6.10): the clip's edge nearest the playhead (the in point on a tie) moves to the
 * playhead, as a regular trim with its linked partners. Null when the playhead is on an edge or the
 * clip is missing or locked.
 */
export function extendToPlayhead(project: Project, clipId: ClipId, playhead: Frame, options: { linked?: boolean } = {}): TrimResult | null {
  const clip = project.clips[clipId];
  if (!clip || isClipLocked(project, clipId)) return null;
  const end = clip.start + clip.duration;
  if (playhead === clip.start || playhead === end) return null;
  const edge: TrimEdge = Math.abs(playhead - clip.start) <= Math.abs(playhead - end) ? "in" : "out";
  const plan = planTrim(project, [clipId], edge, { ripple: false, linked: options.linked ?? true });
  return resolveTrim(plan, playhead - edgeFrame(clip, edge), { label: "Extend edit" });
}
