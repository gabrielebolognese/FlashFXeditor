// Clip speed (spec §11 Speed section and quick-row speed chips, §5.1, §14, §6.19; Batch 27): constant
// speed changes of video and audio clips, and the Speed section's duration field.
// - Speed with the duration linked (the default): the source range stays (`in`/`out`) and the duration
//   follows, rounded to whole frames: a 10 s clip at 2x lasts 5 s. Keyframes scale with the duration
//   (the rate stretch's rule, Batch 14).
// - Speed unlinked: the duration stays and the source range follows from `in` (`out = in + duration *
//   speed`); when the media ends first the clip is shortened to it (§6.19 "clamp, warn": the result
//   reports `mediaEnd`).
// - A clip with less than one frame of media left after `in` at the new speed keeps its speed, linked
//   or not (`mediaEnd`): its `out` always follows `in` exactly.
// - The speed is kept as asked (0.25x..4x, §14), never rounded through the duration (the duration is
//   rounded instead, within the §5.2 one-frame invariant). A clip and its linked partners get the same
//   speed. Each keeps its start and is retimed from its own source range, so partners that differ (an L
//   cut, a speed set with Linked selection off) keep their own `in`/`out` and get their own duration.
//   Partners that start apart (a J cut) then show a sync offset ("Move into sync" puts them back).
// - Ripple: every clip after the clip's end on every unlocked track shifts by the largest change of
//   duration among the members (the ripple trim's rule, spec §6.10), so none of them runs into what
//   follows; a shift to the left stops where a track would overlap, and a gap stays (`ripple`).
//   Without ripple a faster clip leaves a gap and a slower one stops at the next clip: the speed stays
//   as asked and the out point comes in (`neighbor`).
// - The duration field: linked, a rate stretch of the out point (speed = speed x old / new duration,
//   clamped to 0.25x..4x); unlinked, and for freeze frames (no speed), a trim of the out point. Both
//   ripple with the option, and stop at the next clip without it.
// Freeze frames, images, text, solids and captions have no speed. Locked clips never change. Each call
// is one command (one undo step).
import type { Command } from "../../core/commands/command.js";
import { retimeKeyframes } from "../../core/document/keyframes.js";
import { framesToSourceUs, usPerFrame } from "../../core/document/time.js";
import { isMediaClip, type Clip, type ClipId, type MediaClip, type Project } from "../../core/document/types.js";
import { isClipLocked, lastClipStartingBy, linkedPartners, trackIndex, trackOf } from "../model/queries.js";
import { applyTrim, editCommand, hasSource, maxDurationFrames, MAX_SPEED, MIN_SPEED, planStretch, planTrim, resolveTrim, type TrimLimit } from "./trim.js";

export interface SpeedOptions {
  /** The duration follows the speed (spec §11 "duration link"); off, the duration stays and the source range follows. */
  link: boolean;
  /** Later clips shift by the change of duration (the Speed section's Ripple). */
  ripple: boolean;
  /** Linked partners change with the clips (Linked selection on). */
  linked: boolean;
}

export interface SpeedResult {
  /** One undo step, or null when nothing changes. */
  command: Command | null;
  /** What stopped the first clip short (`mediaEnd`, `neighbor`, `ripple`; the duration field also `minSpeed`, `maxSpeed`, `minDuration`), or null. */
  limit: TrimLimit | null;
}

/** A speed within the clip speed range (spec §14: 0.25x..4x). */
export function clampSpeed(speed: number): number {
  return Math.min(MAX_SPEED, Math.max(MIN_SPEED, speed));
}

/** Video and audio clips that play their source over time: the ones with a speed (not freeze frames). */
export const hasSpeed = hasSource;

const endOf = (clip: Clip) => clip.start + clip.duration;

/**
 * The clips of `ids` whose speed can change, each with its linked partners (with `linked`, or when the
 * partner is among `ids` too: a video and its sound change together, once), latest end first.
 */
function speedGroups(project: Project, ids: readonly ClipId[], linked: boolean): MediaClip[][] {
  const asked = new Set(ids);
  const seen = new Set<ClipId>();
  const take = (id: ClipId): MediaClip | null => {
    const clip = project.clips[id];
    if (!clip || seen.has(id) || !hasSpeed(clip) || isClipLocked(project, id)) return null;
    seen.add(id);
    return clip;
  };
  const groups: MediaClip[][] = [];
  for (const id of ids) {
    const first = take(id);
    if (!first) continue;
    const group = [first];
    for (const partner of linkedPartners(project, id)) {
      if (!linked && !asked.has(partner)) continue;
      const clip = take(partner);
      if (clip) group.push(clip);
    }
    groups.push(group);
  }
  // Later groups first: an earlier group's ripple then moves them with everything after it.
  return groups.sort((a, b) => endOf(b[0] as MediaClip) - endOf(a[0] as MediaClip));
}

/** The start of the first clip after `clip` on its track that is not in `group`, or null. */
function nextStart(project: Project, clip: Clip, group: ReadonlySet<ClipId>): number | null {
  const track = trackOf(project, clip.trackId);
  if (!track) return null;
  const index = trackIndex(project, track);
  for (let i = lastClipStartingBy(index, clip.start) + 1; i < index.clips.length; i++) {
    const next = index.clips[i] as Clip;
    if (!group.has(next.id)) return next.start;
  }
  return null;
}

function withChanges(project: Project, changes: ReadonlyMap<ClipId, Clip>): Project {
  if (changes.size === 0) return project;
  const clips = { ...project.clips };
  for (const [id, clip] of changes) clips[id] = clip;
  return { ...project, clips };
}

/**
 * One group at `speed`, on `project` (the document with the later groups already changed): each member
 * retimed from its own start and source range, and the ripple shift of what follows.
 */
function retimeGroup(project: Project, group: readonly MediaClip[], speed: number, options: SpeedOptions): { changes: Map<ClipId, Clip>; limit: TrimLimit | null } {
  const { fps } = project.settings;
  const at = (reason: TrimLimit["reason"], clip: Clip): TrimLimit => ({ reason, clipId: clip.id, trackId: clip.trackId });
  const sourceFrameUs = usPerFrame(fps) * speed;
  const ids = new Set(group.map((clip) => clip.id));
  const changes = new Map<ClipId, Clip>();
  let limit: TrimLimit | null = null;
  // The largest change of duration among the members (0 for one already at the speed): what follows
  // shifts by it, so no member runs into the clip after it, even when they end apart (an L cut).
  let delta = -Infinity;
  for (const clip of group) {
    if (clip.speed === speed) {
      delta = Math.max(delta, 0);
      continue;
    }
    const media = project.media[clip.mediaId];
    const room = media ? maxDurationFrames({ ...clip, speed }, media.durationUs, fps) : Infinity;
    if (room === 0) {
      // Not even one frame fits between `in` and the media end at this speed: the member keeps its
      // speed (§6.19 "clamp, warn"). Clamping `out` instead would leave `out - in` short of `duration x
      // speed`, which a later rate stretch to a slower speed turns into a §5.2 violation.
      limit ??= at("mediaEnd", clip);
      delta = Math.max(delta, 0);
      continue;
    }
    let clipLimit: TrimLimit | null = null;
    // Linked, the member's own source range stays (§5.1): the duration plays it at the new speed, to
    // the nearest frame. Unlinked, the duration stays and the source range follows from `in`.
    let duration = options.link ? Math.max(1, Math.round((clip.out - clip.in) / sourceFrameUs)) : clip.duration;
    if (duration > room) {
      duration = room;
      // Linked, only the rounding frame is lost: no warning. Unlinked, §6.19 "clamp, warn".
      if (!options.link) clipLimit = at("mediaEnd", clip);
    }
    if (!options.ripple) {
      // A longer clip stops at the next clip: the speed stays as asked and the out point comes in.
      const following = nextStart(project, clip, ids);
      if (following !== null && clip.start + duration > following) {
        duration = following - clip.start;
        clipLimit = at("neighbor", clip);
      }
    }
    limit ??= clipLimit;
    delta = Math.max(delta, duration - clip.duration);
    // `out` follows `in` exactly (so a later rate stretch keeps the §5.2 invariant); `duration <= room`
    // keeps it within the media.
    const out = clip.in + framesToSourceUs(duration, speed, fps);
    const next: MediaClip = { ...clip, speed, duration, out };
    // Keys scale with the duration; keys landing on one frame merge, eases and holds stay (Batch 35).
    if (clip.keyframes && duration !== clip.duration) next.keyframes = retimeKeyframes(clip.keyframes, duration / clip.duration);
    next.fades = { in: Math.min(clip.fades.in, duration), out: Math.min(clip.fades.out, duration) };
    // TODO(batch 36): shorten the transitions to the handles left.
    changes.set(clip.id, next);
  }

  if (options.ripple && delta !== 0 && changes.size > 0) {
    // The ripple trim's shift of the out point: what follows each member on its track, and what
    // follows the clip's end on every other unlocked track.
    const plan = planTrim(project, group.map((clip) => clip.id), "out", { ripple: true, linked: false });
    const shift = delta < 0 ? Math.max(delta, plan.lo.value) : delta;
    if (shift !== delta && plan.lo.limit) limit ??= plan.lo.limit;
    if (shift !== 0) for (const clip of plan.shifted) changes.set(clip.id, { ...clip, start: clip.start + shift });
  }
  return { changes, limit };
}

/**
 * Sets the speed of the video and audio clips among `ids` (and their partners, see `speedGroups`) to
 * `speed`, or to `speed(clip)` for each clip (an arrow step adds to each clip's own), clamped to
 * 0.25x..4x: one `clip.speed` command.
 */
export function setSpeeds(project: Project, ids: readonly ClipId[], speed: number | ((clip: MediaClip) => number), options: SpeedOptions): SpeedResult {
  let current = project;
  const changes = new Map<ClipId, Clip>();
  let limit: TrimLimit | null = null;
  for (const group of speedGroups(project, ids, options.linked)) {
    const members = group.map((clip) => current.clips[clip.id] as MediaClip);
    const primary = members[0] as MediaClip;
    const wanted = clampSpeed(typeof speed === "number" ? speed : speed(primary));
    const result = retimeGroup(current, members, wanted, options);
    limit ??= result.limit;
    current = withChanges(current, result.changes);
    for (const [id, clip] of result.changes) changes.set(id, clip);
  }
  return { command: changes.size > 0 ? editCommand("clip.speed", "Change speed", changes) : null, limit };
}

/**
 * The Speed section's duration (spec §11): each of `ids` (video and audio clips, freeze frames
 * included) gets `duration` frames from its start; linked, by a rate stretch of its out point (the
 * speed follows); unlinked or frozen, by a trim of its out point. Partners follow with `linked`;
 * later clips ripple with `ripple`. One `clip.speed` command ("Change duration").
 */
export function setSpeedDurations(project: Project, ids: readonly ClipId[], duration: number, options: SpeedOptions): SpeedResult {
  const wanted = Math.max(1, Math.round(duration));
  const order = ids
    .map((id) => project.clips[id])
    .filter((clip): clip is MediaClip => clip !== undefined && isMediaClip(clip) && clip.kind !== "image")
    .sort((a, b) => endOf(b) - endOf(a));
  let current = project;
  const changes = new Map<ClipId, Clip>();
  const done = new Set<ClipId>();
  let limit: TrimLimit | null = null;
  for (const { id } of order) {
    const clip = current.clips[id];
    if (!clip || done.has(id) || isClipLocked(current, id)) continue;
    const delta = wanted - clip.duration;
    if (delta === 0) continue;
    const plan = options.link && hasSpeed(clip) ? planStretch(current, id, "out", { linked: options.linked, ripple: options.ripple }) : planTrim(current, [id], "out", { ripple: options.ripple, linked: options.linked });
    for (const moved of plan.moves.keys()) done.add(moved);
    const result = resolveTrim(plan, delta);
    limit ??= result.limit;
    if (result.changes.size === 0) continue;
    current = applyTrim(current, result);
    for (const [changedId, changed] of result.changes) changes.set(changedId, changed);
  }
  return { command: changes.size > 0 ? editCommand("clip.speed", "Change duration", changes) : null, limit };
}
