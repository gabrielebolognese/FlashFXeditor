// Remove silence (spec §14, §6.11; Batch 38): the pure edits behind the quick row's Remove silence.
// - Targets: the audio clips the Audio section edits (`audioTargets`: the selected audio clips and the
//   audio linked to the selected video clips), unlocked and playing (a freeze frame has no sound). A link
//   group with a member on a locked track is left out: cutting only some of it would break sync.
// - analysis.worker gives each target's silent spans in media µs (padded, media/analysis/silence.ts);
//   `spanFrames` turns them into timeline frames of the clip, rounded inward (a cut never takes a frame
//   of the padding) and exact at the clip's ends.
// - Linked partners follow (video follows the audio analysis): a link group gets one set of ranges,
//   where every analysed member is silent, inside the frames every member covers (a J or L cut's
//   lead-in is never cut: the tracks would ripple apart), and each member loses the same ranges, so
//   every track of the group closes the same gaps and the group stays in sync.
// - Apply = `cutSilences` (each member replaced by its pieces between the ranges, through `sliceClip`:
//   source in/out, keyframes (volume keys included), fades and transitions at the new edges; a
//   member's first piece keeps its id; the pieces of one group between the same two cuts are linked to
//   each other, a lone piece is unlinked, as a split does), then `closeGaps` on the gaps it leaves (the
//   ripple of Ripple delete: what follows moves left, the other unlocked tracks follow, a collision
//   limits it). The controller runs both as one transaction: one undo step.
import type { Clip, ClipId, Frame, MediaClip, Project, Rational } from "../../core/document/types.js";
import { usPerFrame } from "../../core/document/time.js";
import type { SourceRange } from "../../media/analysis/silence.js";
import type { Command } from "../../core/commands/command.js";
import type { FrameRange } from "../model/inOut.js";
import { isClipLocked, linkGroupOf, type Gap } from "../model/queries.js";
import { closeGaps, type CloseResult } from "./gaps.js";
import { replaceClipsCommand } from "./liftExtract.js";
import { sliceClip } from "./move.js";
import { audioTargets } from "./volume.js";

export const REMOVE_SILENCE_LABEL = "Remove silence";

/**
 * Remove silence's parameters (spec §14: threshold dB, minimum silence ms, padding ms), remembered in the
 * app settings; whole dB and ms. Below about -42 dBFS the peaks only tell digital silence apart (see
 * media/analysis/silence.ts), so the threshold goes no lower than -60 dB.
 */
export const SILENCE_THRESHOLD = { min: -60, max: -10, default: -40 } as const;
export const SILENCE_MIN_MS = { min: 100, max: 5000, default: 500 } as const;
export const SILENCE_PADDING_MS = { min: 0, max: 1000, default: 150 } as const;

/** A parameter value clamped to its range and rounded to whole units; the default when it is not a number. */
export function clampSilenceParam(range: { min: number; max: number; default: number }, value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(range.max, Math.max(range.min, Math.round(value))) : range.default;
}

/** Rounding slack: a span edge within this of a frame boundary counts as on it. */
const EPSILON = 1e-6;

/** The clips Remove silence analyses for a selection (see the module comment). */
export function silenceTargets(project: Project, ids: Iterable<ClipId>): ClipId[] {
  return audioTargets(project, ids).filter((id) => {
    const clip = project.clips[id] as MediaClip;
    return clip.speed > 0 && linkGroupOf(project, id).every((member) => !isClipLocked(project, member));
  });
}

/** The part of its media a clip plays, for the analysis. */
export const sourceRange = (clip: MediaClip): SourceRange => ({ fromUs: clip.in, toUs: clip.out, speed: clip.speed });

/** Sorted, disjoint ranges with touching ones joined. */
function normalize(ranges: FrameRange[]): FrameRange[] {
  ranges.sort((a, b) => a.start - b.start);
  const out: FrameRange[] = [];
  for (const range of ranges) {
    const last = out[out.length - 1];
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else out.push({ ...range });
  }
  return out;
}

/** A clip's silent spans (media µs, flat pairs) as timeline frames: rounded inward, exact at its ends. */
export function spanFrames(clip: MediaClip, spans: readonly number[], fps: Rational): FrameRange[] {
  const perFrame = usPerFrame(fps) * clip.speed;
  const end = clip.start + clip.duration;
  const out: FrameRange[] = [];
  if (!(perFrame > 0)) return out;
  for (let i = 0; i + 1 < spans.length; i += 2) {
    const from = spans[i] as number;
    const to = spans[i + 1] as number;
    const start = from <= clip.in ? clip.start : Math.max(clip.start, Math.ceil(clip.start + (from - clip.in) / perFrame - EPSILON));
    const stop = to >= clip.out ? end : Math.min(end, Math.floor(clip.start + (to - clip.in) / perFrame + EPSILON));
    if (stop > start) out.push({ start, end: stop });
  }
  return normalize(out);
}

/** Where both range lists are. */
function intersect(a: readonly FrameRange[], b: readonly FrameRange[]): FrameRange[] {
  const out: FrameRange[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const x = a[i] as FrameRange;
    const y = b[j] as FrameRange;
    const start = Math.max(x.start, y.start);
    const end = Math.min(x.end, y.end);
    if (end > start) out.push({ start, end });
    if (x.end < y.end) i++;
    else j++;
  }
  return out;
}

/** The ranges inside [from, to). */
function within(ranges: readonly FrameRange[], from: Frame, to: Frame): FrameRange[] {
  const out: FrameRange[] = [];
  for (const range of ranges) {
    const start = Math.max(range.start, from);
    const stop = Math.min(range.end, to);
    if (stop > start) out.push({ start, end: stop });
  }
  return out;
}

/** A link group (or a lone clip) and the ranges cut out of each of its members (inside all of them). */
export interface SilenceGroup {
  members: readonly ClipId[];
  ranges: readonly FrameRange[];
}

export interface SilencePlan {
  groups: readonly SilenceGroup[];
  /** Each range on each member's track (the overlay's hatched segments). */
  segments: readonly Gap[];
  /** Silences found (one per range of a group) and the frames they remove. */
  count: number;
  frames: Frame;
}

/**
 * The cuts for `targets` (`silenceTargets`): `rangesOf` gives a target's ranges (`spanFrames`), or null
 * while its analysis is not ready (its group then waits).
 */
export function silencePlan(project: Project, targets: readonly ClipId[], rangesOf: (clipId: ClipId) => readonly FrameRange[] | null): SilencePlan {
  const byGroup = new Map<string, { members: readonly ClipId[]; ranges: FrameRange[] | null }>();
  for (const id of targets) {
    const clip = project.clips[id];
    if (!clip) continue;
    const key = clip.linkGroup ?? `clip:${id}`;
    const ranges = rangesOf(id);
    const entry = byGroup.get(key);
    if (!entry) byGroup.set(key, { members: clip.linkGroup === undefined ? [id] : linkGroupOf(project, id), ranges: ranges ? [...ranges] : null });
    else if (entry.ranges) entry.ranges = ranges ? intersect(entry.ranges, ranges) : null;
  }
  const groups: SilenceGroup[] = [];
  const segments: Gap[] = [];
  let count = 0;
  let frames = 0;
  for (const entry of byGroup.values()) {
    if (!entry.ranges) continue;
    const members = entry.members.map((id) => project.clips[id]).filter((clip): clip is Clip => clip !== undefined);
    const from = Math.max(...members.map((clip) => clip.start));
    const to = Math.min(...members.map((clip) => clip.start + clip.duration));
    const ranges = within(entry.ranges, from, to);
    if (ranges.length === 0) continue;
    groups.push({ members: members.map((clip) => clip.id), ranges });
    count += ranges.length;
    for (const range of ranges) frames += range.end - range.start;
    for (const clip of members) for (const range of ranges) segments.push({ trackId: clip.trackId, ...range });
  }
  return { groups, segments, count, frames };
}

export interface SilenceCut {
  /** One undo step's first half (`clip.removeSilence`), or null when nothing is cut. */
  command: Command | null;
  /** The gaps the cut leaves, for `closeSilences`. */
  gaps: Gap[];
  /** Each member's pieces in order (none when all of it was silence). */
  pieces: ReadonlyMap<ClipId, readonly ClipId[]>;
}

/** Cuts the plan's ranges out of its groups' members, leaving gaps (see the module comment). */
export function cutSilences(project: Project, groups: readonly SilenceGroup[], newId: () => string): SilenceCut {
  const { fps } = project.settings;
  const changes = new Map<ClipId, Clip | null>();
  const pieces = new Map<ClipId, ClipId[]>();
  const gaps: Gap[] = [];
  for (const { members, ranges } of groups) {
    // The pieces of every member by segment (the part between cut `s - 1` and cut `s`).
    const bySegment = new Map<number, Clip[]>();
    let linkGroup: string | undefined;
    for (const id of members) {
      const clip = project.clips[id];
      if (!clip || isClipLocked(project, id)) continue;
      linkGroup ??= clip.linkGroup;
      const end = clip.start + clip.duration;
      const cut = within(ranges, clip.start, end);
      const kept: Clip[] = [];
      let cursor = clip.start;
      for (const range of [...cut, { start: end, end }]) {
        if (range.start > cursor) {
          const piece = sliceClip(clip, cursor, range.start, fps);
          kept.push(kept.length === 0 ? piece : ({ ...piece, id: newId() } as Clip));
        }
        cursor = range.end;
      }
      for (const range of cut) gaps.push({ trackId: clip.trackId, ...range });
      pieces.set(
        id,
        kept.map((piece) => piece.id),
      );
      if (cut.length > 0) {
        changes.set(id, null);
        for (const piece of kept) changes.set(piece.id, piece);
      }
      for (const piece of kept) {
        const segment = ranges.filter((range) => range.end <= piece.start).length;
        const list = bySegment.get(segment);
        if (list) list.push(piece);
        else bySegment.set(segment, [piece]);
      }
    }
    if (linkGroup === undefined) continue;
    // The first segment keeps the group's id; the others get one each; a lone piece is unlinked.
    const first = Math.min(...bySegment.keys());
    for (const [segment, list] of bySegment) {
      const group = list.length < 2 ? undefined : segment === first ? linkGroup : newId();
      for (const piece of list) {
        if (piece.linkGroup === group) continue;
        const next = { ...piece } as Clip;
        if (group === undefined) delete next.linkGroup;
        else next.linkGroup = group;
        changes.set(piece.id, next);
      }
    }
  }
  return { command: changes.size > 0 ? replaceClipsCommand(project, changes, "clip.removeSilence", REMOVE_SILENCE_LABEL) : null, gaps, pieces };
}

/** The second half on the cut document: the gaps close with the ripple of Ripple delete. */
export function closeSilences(cut: Project, gaps: readonly Gap[]): CloseResult {
  return closeGaps(cut, gaps, { id: "clip.removeSilence", label: REMOVE_SILENCE_LABEL });
}
