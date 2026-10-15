// Trimming (spec §6.10, §6.19, P2): the pure edits behind edge drags, Q/W (trim to playhead) and E
// (extend edit). A trim moves one edge of some clips by the same number of frames:
// - regular: the clip changes `start`/`in` (in point) or `duration`/`out` (out point) and nothing
//   else moves; the neighbor clip bounds it (no overlap, no overwrite);
// - ripple: the in point keeps its timeline position (the clip's content slides under it), and every
//   clip after the edit point on every unlocked track shifts by the change in duration, so no gap
//   opens or closes. The shift stops at the largest one that keeps every track overlap-free.
// Linked partners trim with the clip (same delta) unless the caller trims one side only (Alt). Every
// limit is an interval of deltas, so the request is clamped, never refused: the 1-frame minimum,
// the media bounds (`in >= 0`, `out <= media.durationUs`; none for images, text, solids, captions),
// frame 0, the neighbor clip (regular), the ripple collisions (ripple), and each partner's own.
// `planTrim` does the delta-independent part once per gesture; `resolveTrim` turns a delta into one
// command (one undo step).
import type { Draft } from "immer";
import type { Command } from "../../core/commands/command.js";
import { framesToSourceUs, usPerFrame } from "../../core/document/time.js";
import { isMediaClip, type Clip, type ClipId, type Frame, type Keyframes, type MediaClip, type Project, type Rational, type TrackId } from "../../core/document/types.js";
import { clipInIndex, isClipLocked, lastClipStartingBy, linkedPartners, trackIndex } from "../model/queries.js";

export type TrimEdge = "in" | "out";

export interface TrimOptions {
  /** Ripple trim (spec §6.10: Ripple mode, or Mod while dragging). */
  ripple: boolean;
  /** Linked partners trim together (Linked selection on and no Alt). Default true. */
  linked?: boolean;
}

/** What stops a trim, in the order a tie between limits at the same delta is reported. */
export type TrimLimitReason = "mediaStart" | "mediaEnd" | "minDuration" | "neighbor" | "ripple" | "timelineStart";

const REASON_ORDER: readonly TrimLimitReason[] = ["mediaStart", "mediaEnd", "minDuration", "neighbor", "ripple", "timelineStart"];

export interface TrimLimit {
  reason: TrimLimitReason;
  /** The trimmed clip whose bound it is; for `ripple`, the clip that would collide. */
  clipId: ClipId;
  trackId: TrackId;
}

interface Bound {
  value: number;
  limit: TrimLimit | null;
}

export interface TrimPlan {
  project: Project;
  edge: TrimEdge;
  ripple: boolean;
  /** The clips the trim changes: the given ones first, then their linked partners. */
  trimmed: readonly Clip[];
  /** Clips the ripple shifts (none for a regular trim). */
  shifted: readonly Clip[];
  /** Per track: the start of its first shifted clip, before the shift. */
  firstShifted: ReadonlyMap<TrackId, Frame>;
  /** Trimmed and shifted ids: what the trim moves (snapping excludes them, spec §6.9). */
  moving: ReadonlySet<ClipId>;
  /** The lowest and highest delta every limit allows (`lo <= 0 <= hi`). */
  lo: Bound;
  hi: Bound;
  /** The deltas that put a trimmed clip's edge on its media bound. */
  mediaBounds: readonly number[];
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
  /** The trimmed edge sits on a media bound (spec §6.10: red edge, `Media start` / `Media end`). */
  mediaBound: "start" | "end" | null;
  /** The new version of every clip that changes. */
  changes: ReadonlyMap<ClipId, Clip>;
  /** One undo step, or null when nothing changes. */
  command: Command | null;
}

/** The timeline frame of a clip edge: its start, or its end (exclusive). */
export function edgeFrame(clip: Clip, edge: TrimEdge): Frame {
  return edge === "in" ? clip.start : clip.start + clip.duration;
}

/** Video and audio clips play a source that moves under them: media bounds, keyframes follow it. */
function hasSource(clip: Clip): clip is MediaClip {
  return clip.kind === "video" || clip.kind === "audio";
}

/** Frames of source before `in`: the most an in point can extend (largest k with in - k frames >= 0). */
export function headFrames(clip: MediaClip, fps: Rational): number {
  let k = Math.max(0, Math.floor(clip.in / (usPerFrame(fps) * clip.speed)));
  while (clip.in + framesToSourceUs(-(k + 1), clip.speed, fps) >= 0) k += 1;
  while (k > 0 && clip.in + framesToSourceUs(-k, clip.speed, fps) < 0) k -= 1;
  return k;
}

/** The longest duration a clip can have from its `in` without passing the media end (largest d with in + d frames <= durationUs). */
export function maxDurationFrames(clip: MediaClip, durationUs: number, fps: Rational): number {
  const room = durationUs - clip.in;
  if (room <= 0) return 0;
  let d = Math.floor(room / (usPerFrame(fps) * clip.speed));
  while (clip.in + framesToSourceUs(d + 1, clip.speed, fps) <= durationUs) d += 1;
  while (d > 0 && clip.in + framesToSourceUs(d, clip.speed, fps) > durationUs) d -= 1;
  return d;
}

/** Keeps the tighter bound; a tie goes to the reason first in `REASON_ORDER`. */
function tighter(current: Bound, value: number, limit: TrimLimit, side: "lo" | "hi"): Bound {
  if (side === "lo" ? value > current.value : value < current.value) return { value, limit };
  if (value === current.value && current.limit && REASON_ORDER.indexOf(limit.reason) < REASON_ORDER.indexOf(current.limit.reason)) return { value, limit };
  return current;
}

/**
 * The delta-independent part of a trim of `edge` on `clipIds` (and, with `linked`, their partners on
 * unlocked tracks): the clips it moves and the delta range every limit allows. Clips on locked tracks
 * are never trimmed or shifted (spec §6.12).
 */
export function planTrim(project: Project, clipIds: readonly ClipId[], edge: TrimEdge, options: TrimOptions): TrimPlan {
  const { fps } = project.settings;
  const ripple = options.ripple;
  const trimmed: Clip[] = [];
  const trimmedIds = new Set<ClipId>();
  const take = (id: ClipId) => {
    const clip = project.clips[id];
    if (!clip || trimmedIds.has(id) || isClipLocked(project, id)) return;
    trimmedIds.add(id);
    trimmed.push(clip);
  };
  for (const id of clipIds) take(id);
  if (options.linked !== false) for (const clip of [...trimmed]) for (const id of linkedPartners(project, clip.id)) take(id);

  let lo: Bound = { value: -Infinity, limit: null };
  let hi: Bound = { value: Infinity, limit: null };
  const mediaBounds: number[] = [];
  const tracks = new Map(project.tracks.map((track) => [track.id, track]));
  for (const clip of trimmed) {
    const at = (reason: TrimLimitReason): TrimLimit => ({ reason, clipId: clip.id, trackId: clip.trackId });
    const track = tracks.get(clip.trackId);
    if (!track) continue;
    const index = trackIndex(project, track);
    const position = lastClipStartingBy(index, clip.start);
    if (edge === "in") {
      hi = tighter(hi, clip.duration - 1, at("minDuration"), "hi");
      if (!ripple) {
        lo = tighter(lo, -clip.start, at("timelineStart"), "lo");
        const prev = index.clips[position - 1];
        if (prev && !trimmedIds.has(prev.id)) lo = tighter(lo, prev.start + prev.duration - clip.start, at("neighbor"), "lo");
      }
      if (hasSource(clip)) {
        const bound = -headFrames(clip, fps);
        mediaBounds.push(bound);
        lo = tighter(lo, bound, at("mediaStart"), "lo");
      }
    } else {
      lo = tighter(lo, 1 - clip.duration, at("minDuration"), "lo");
      if (!ripple) {
        const next = index.clips[position + 1];
        if (next && !trimmedIds.has(next.id)) hi = tighter(hi, next.start - (clip.start + clip.duration), at("neighbor"), "hi");
      }
      if (hasSource(clip)) {
        const media = project.media[clip.mediaId];
        const bound = media ? Math.max(0, maxDurationFrames(clip, media.durationUs, fps) - clip.duration) : 0;
        mediaBounds.push(bound);
        hi = tighter(hi, bound, at("mediaEnd"), "hi");
      }
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
        if (trimmedIds.has(clip.id)) continue;
        if (first === -1) first = i;
        shifted.push(clip);
      }
      if (first === -1) continue;
      const head = index.clips[first] as Clip;
      firstShifted.set(track.id, head.start);
      // A shift to the left is bounded by the clip before the first shifted one (or frame 0). A
      // trimmed clip there moves its edge with the shift, so it never limits.
      const prev = index.clips[first - 1];
      if (prev && trimmedIds.has(prev.id)) continue;
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
  const moving = new Set<ClipId>(trimmedIds);
  for (const clip of shifted) moving.add(clip.id);
  return { project, edge, ripple, trimmed, shifted, firstShifted, moving, lo, hi, mediaBounds };
}

/** Keyframes (relative to the clip start) moved by `frames`; out-of-range keys are kept for a later trim back. */
function shiftKeyframes(keyframes: Keyframes, frames: number): Keyframes {
  const result: Keyframes = {};
  for (const [prop, list] of Object.entries(keyframes)) result[prop] = list.map((key) => ({ ...key, frame: key.frame - frames }));
  return result;
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
      // A still holds its picture: its source range is just the duration (no media bounds).
      // TODO(batch 34): animated images (loop or hold).
      media.out = clip.in + framesToSourceUs(media.duration, clip.speed, fps);
    } else if (edge === "in") {
      media.in = clip.in + framesToSourceUs(delta, clip.speed, fps);
      // Keyframes follow the source (spec §6.10, "keyframes follow source" on for media clips):
      // a key stays on the source frame it was set on.
      // TODO(batch 42): the "keyframes follow source" setting.
      if (clip.keyframes) media.keyframes = shiftKeyframes(clip.keyframes, delta);
    } else {
      // Moved by the delta (not recomputed from `in`), so a trim and its reverse give back the same out.
      const durationUs = project.media[clip.mediaId]?.durationUs ?? clip.out;
      media.out = Math.min(durationUs, clip.out + framesToSourceUs(delta, clip.speed, fps));
    }
  }
  // Text, solids and images keep their keyframes on the clip start (spec §6.10: off for text clips).
  if ("fades" in clip) next.fades = { in: Math.min(clip.fades.in, next.duration), out: Math.min(clip.fades.out, next.duration) };
  // TODO(batch 36): shorten the transition on the trimmed side to the handle left, remove it when none is.
  // TODO(batch 32): caption words outside the new range.
  return next;
}

function trimLabel(plan: TrimPlan): string {
  if (plan.ripple) return "Ripple trim";
  return plan.trimmed.length === 1 ? "Trim clip" : "Trim clips";
}

/** Applies a trim of `plan` by `deltaFrames` (rounded, then clamped to the limits) as one command. */
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
  const atBound = plan.mediaBounds.includes(delta);
  const mediaBound = atBound ? (plan.edge === "in" ? "start" : "end") : null;
  const changes = new Map<ClipId, Clip>();
  if (delta !== 0) {
    for (const clip of plan.trimmed) changes.set(clip.id, trimmedClip(clip, plan.edge, delta, plan.ripple, plan.project));
    for (const clip of plan.shifted) changes.set(clip.id, { ...clip, start: clip.start + shift });
  }
  const command = changes.size > 0 ? trimCommand(options.label ?? trimLabel(plan), changes) : null;
  return { plan, requested, delta, shift, limit, mediaBound, changes, command };
}

/** Trims never reorder a track (shifts keep the order, limits keep every gap >= 0): only clips change. */
function trimCommand(label: string, changes: ReadonlyMap<ClipId, Clip>): Command {
  const entries = [...changes];
  return {
    id: "clip.trim",
    label,
    affects: ["clips", "timeline"],
    run(draft) {
      for (const [id, clip] of entries) {
        if (!draft.clips[id]) throw new Error(`clip.trim: clip ${id} does not exist`);
        draft.clips[id] = clip as Draft<Clip>;
      }
    },
  };
}

/** `trimEdge(doc, clipId, edge, deltaFrames, { ripple })` (spec §6.10): one clip edge and, unless `linked: false`, its partners. */
export function trimEdge(project: Project, clipId: ClipId, edge: TrimEdge, deltaFrames: number, options: TrimOptions): TrimResult {
  return resolveTrim(planTrim(project, [clipId], edge, options), deltaFrames);
}

/** The document a trim result leaves (the live preview and the overlay draw it during the drag). */
export function applyTrim(project: Project, result: TrimResult): Project {
  if (result.changes.size === 0) return project;
  const clips = { ...project.clips };
  for (const [id, clip] of result.changes) clips[id] = clip;
  return { ...project, clips };
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
