// Lift and Extract (spec §6.11, §6.19, P2): the pure edits behind `;` and `'`. Both act on the marked
// range [start, end) of the targeted, unlocked tracks (spec §6.12 Target):
// - Lift removes the range and leaves a gap: clips inside it go, clips crossing an edge are trimmed
//   (`sliceClip`: source in/out, keyframes and the fades and transitions of the new edge), a clip
//   spanning the whole range is split in two (the right piece gets a new id; right pieces cut from one
//   link group are linked to each other, a lone one is unlinked, as a split does).
// - Extract is the lift, then the range closes on each of those tracks with the ripple of `closeGaps`
//   (Batch 15): what follows moves left by the range's length; the other unlocked tracks follow the
//   ripple, and a clip there that would collide limits it (the result names it).
// The controller runs Extract as a transaction (lift, then the close computed on the lifted document):
// one undo step either way. Locked tracks are never touched.
import type { Draft } from "immer";
import type { Command } from "../../core/commands/command.js";
import type { Clip, ClipId, Project, TrackId } from "../../core/document/types.js";
import type { FrameRange } from "../model/inOut.js";
import { clipsOverlapping, trackIndex, type Gap } from "../model/queries.js";
import { closeGaps, type CloseResult } from "./gaps.js";
import { sliceClip } from "./move.js";
import { relink } from "./split.js";

/** The tracks Lift and Extract act on: targeted and unlocked, in track order. */
export function rangeTracks(project: Project): TrackId[] {
  return project.tracks.filter((track) => track.targeted && !track.locked).map((track) => track.id);
}

/**
 * Lift (spec §6.11, `;`): removes [start, end) from the clips of `trackIds` (unlocked ones only),
 * leaving a gap. One command; null when no clip lies in the range there.
 */
export function liftRange(project: Project, range: FrameRange, newId: () => string, trackIds: readonly TrackId[] = rangeTracks(project)): Command | null {
  const { start, end } = range;
  if (end <= start) return null;
  const { fps } = project.settings;
  const changes = new Map<ClipId, Clip | null>();
  const rights: Clip[] = [];
  const ids = new Set(trackIds);
  for (const track of project.tracks) {
    if (!ids.has(track.id) || track.locked) continue;
    for (const clip of clipsOverlapping(trackIndex(project, track), start, end)) {
      const clipEnd = clip.start + clip.duration;
      if (clip.start >= start && clipEnd <= end) {
        changes.set(clip.id, null);
      } else if (clip.start < start && clipEnd > end) {
        changes.set(clip.id, sliceClip(clip, clip.start, start, fps));
        rights.push({ ...sliceClip(clip, end, clipEnd, fps), id: newId() } as Clip);
      } else if (clip.start < start) {
        changes.set(clip.id, sliceClip(clip, clip.start, start, fps));
      } else {
        changes.set(clip.id, sliceClip(clip, end, clipEnd, fps));
      }
    }
  }
  if (changes.size === 0) return null;
  relink(rights, newId);
  for (const right of rights) changes.set(right.id, right);
  return replaceClipsCommand(project, changes);
}

/**
 * One command (`edit.lift` by default) writing `changes` (null removes a clip; a new id adds one on its
 * track) and the id lists of the tracks they touch, sorted by start. Remove silence (Batch 38) uses it too.
 */
export function replaceClipsCommand(project: Project, changes: ReadonlyMap<ClipId, Clip | null>, commandId = "edit.lift", label = "Lift"): Command {
  const lists = new Map<TrackId, ClipId[]>();
  const final = (id: ClipId) => (changes.has(id) ? changes.get(id) : project.clips[id]);
  for (const track of project.tracks) {
    const ids = [...track.clipIds];
    let touched = false;
    for (const [id, clip] of changes) {
      if (clip === null && project.clips[id]?.trackId === track.id) touched = true;
      else if (clip?.trackId === track.id) {
        touched = true;
        if (!project.clips[id]) ids.push(id);
      }
    }
    if (!touched) continue;
    const kept = ids.filter((id) => final(id));
    kept.sort((a, b) => (final(a) as Clip).start - (final(b) as Clip).start);
    lists.set(track.id, kept);
  }
  const entries = [...changes];
  return {
    id: commandId,
    label,
    affects: ["clips", "timeline"],
    run(draft) {
      for (const [id, clip] of entries) {
        if (clip) draft.clips[id] = clip as Draft<Clip>;
        else delete draft.clips[id];
      }
      for (const [trackId, ids] of lists) {
        const track = draft.tracks.find((candidate) => candidate.id === trackId);
        if (!track) throw new Error(`${commandId}: track ${trackId} does not exist`);
        track.clipIds = [...ids];
      }
    },
  };
}

/** The gaps Extract closes: the range on each of `trackIds`. */
export function extractGaps(range: FrameRange, trackIds: readonly TrackId[]): Gap[] {
  return trackIds.map((trackId) => ({ trackId, start: range.start, end: range.end }));
}

/**
 * The close half of Extract (spec §6.11, `'`): on the lifted document, [start, end) closes on each of
 * `trackIds` (each a source track of the ripple, even an empty one); the other unlocked tracks follow
 * and may limit it (`limit`).
 */
export function closeExtracted(lifted: Project, range: FrameRange, trackIds: readonly TrackId[]): CloseResult {
  return closeGaps(lifted, extractGaps(range, trackIds), { sources: trackIds, id: "edit.extract", label: "Extract" });
}
