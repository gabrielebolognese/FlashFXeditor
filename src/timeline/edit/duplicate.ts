// Duplicate (spec §11 quick row, §18 Mod+D, §7.2 canvas menu; Batches 25 and 39).
// - Timeline (`duplicateClips`): the clips (the caller passes the selection, linked partners and
//   groups included) are copied onto their own tracks after the selection, at the first offset of at
//   least the selection's length where every copy fits between the clips there, without ripple. The
//   copies keep every field (source, transform, keyframes, label) and their relative times; clips that
//   shared a link group or a group share a new one (a lone copy is neither linked nor grouped), and a
//   transition goes along with a new id only when both its clips are copied (Batch 36: transitions
//   belong to cuts). Clips on locked tracks are not copied.
// - Canvas (`duplicateLayers`): the layers are copied at the same frames onto the video track right
//   above their own when it is unlocked, shown and free there, else onto a new track inserted there,
//   and moved by +20 project px on both axes (every position key too). Copies of layers grouped
//   together share a new group; they are never linked (a video's copy does not double its sound) and
//   carry no transitions.
// One command, one undo step.
import type { Draft } from "immer";
import type { Command } from "../../core/commands/command.js";
import { emptyTrack, nextTrackName } from "../../core/document/project.js";
import { isMediaClip, type Clip, type ClipId, type Frame, type Project, type Track } from "../../core/document/types.js";
import { clipsOverlapping, isClipLocked, trackIndex, trackOf } from "../model/queries.js";
import { regroup, withField } from "./move.js";
import { applyTransformWrite, isLayerClip, shiftedWrite, type LayerClip } from "./transform.js";

export interface DuplicateResult {
  command: Command;
  /** Each copied clip's id -> its copy's id, in the order given. */
  placed: ReadonlyMap<ClipId, ClipId>;
}

/** How far the canvas duplicate moves its copies (spec Batch 39 "+20 px on both axes"), project px. */
export const CANVAS_DUPLICATE_OFFSET = 20;

/** The first frame at or after `from` where `duration` frames fit between the clips of the clip's track. */
export function freeSpotAfter(project: Project, clip: Clip, from: Frame, duration: Frame): Frame {
  const track = trackOf(project, clip.trackId);
  if (!track) return from;
  let start = from;
  for (const other of trackIndex(project, track).clips) {
    const end = other.start + other.duration;
    if (end <= start) continue;
    if (other.start >= start + duration) break;
    start = Math.max(start, end);
  }
  return start;
}

/** The clips among `ids` that exist on unlocked tracks, once each. */
function copiable(project: Project, ids: Iterable<ClipId>): Clip[] {
  const clips: Clip[] = [];
  for (const id of new Set(ids)) {
    const clip = project.clips[id];
    if (clip && !isClipLocked(project, id)) clips.push(clip);
  }
  return clips;
}

/** The smallest offset of at least `from` at which every clip of `clips`, moved by it, overlaps nothing on its track. */
function freeOffset(project: Project, clips: readonly Clip[], from: number): number {
  const indexes = new Map(project.tracks.map((track) => [track.id, trackIndex(project, track)]));
  let offset = from;
  for (let moved = true; moved; ) {
    moved = false;
    for (const clip of clips) {
      const index = indexes.get(clip.trackId);
      if (!index) continue;
      for (const other of clipsOverlapping(index, clip.start + offset, clip.start + clip.duration + offset)) {
        offset = Math.max(offset, other.start + other.duration - clip.start);
        moved = true;
      }
    }
  }
  return offset;
}

/** Copies of `clips` with new ids, their shared link groups and groups renamed; transition pairs renamed or, with `transitions` false, dropped. */
function copies(clips: readonly Clip[], newId: () => string, options: { links: boolean; transitions: boolean }): Clip[] {
  const links = regroup(clips, "linkGroup", newId);
  const groups = regroup(clips, "group", newId);
  const outs = new Set<string>();
  const ins = new Set<string>();
  for (const clip of clips) {
    if (!isMediaClip(clip)) continue;
    if (clip.transitionOut) outs.add(clip.transitionOut.id);
    if (clip.transitionIn) ins.add(clip.transitionIn.id);
  }
  const renamed = new Map([...outs].filter((id) => options.transitions && ins.has(id)).map((id) => [id, newId()]));
  return clips.map((clip) => {
    let copy = { ...structuredClone(clip), id: newId() } as Clip;
    copy = withField(copy, "linkGroup", options.links && clip.linkGroup !== undefined ? links.get(clip.linkGroup) : undefined);
    copy = withField(copy, "group", clip.group !== undefined ? groups.get(clip.group) : undefined);
    if (isMediaClip(copy)) {
      for (const side of ["transitionIn", "transitionOut"] as const) {
        const transition = copy[side];
        const id = transition ? renamed.get(transition.id) : undefined;
        if (transition && id !== undefined) copy[side] = { ...transition, id };
        else delete copy[side];
      }
    }
    return copy;
  });
}

/** Inserts `clipId` into a drafted track's id list at its start-sorted place. */
function insertSorted(draft: Draft<Project>, track: Draft<Track>, clipId: ClipId, start: Frame): void {
  const at = track.clipIds.findIndex((other) => (draft.clips[other]?.start ?? 0) > start);
  track.clipIds.splice(at === -1 ? track.clipIds.length : at, 0, clipId);
}

/** The timeline duplicate of `ids` (see the header), or null when none of them can be copied. */
export function duplicateClips(project: Project, ids: Iterable<ClipId>, newId: () => string): DuplicateResult | null {
  const clips = copiable(project, ids);
  if (clips.length === 0) return null;
  const first = Math.min(...clips.map((clip) => clip.start));
  const last = Math.max(...clips.map((clip) => clip.start + clip.duration));
  const offset = freeOffset(project, clips, last - first);
  const made = copies(clips, newId, { links: true, transitions: true }).map((copy) => ({ ...copy, start: copy.start + offset }) as Clip);
  const placed = new Map(clips.map((clip, i) => [clip.id, (made[i] as Clip).id]));
  return {
    command: {
      id: "clip.duplicate",
      label: made.length === 1 ? "Duplicate clip" : "Duplicate clips",
      affects: ["clips", "timeline"],
      run(draft) {
        for (const copy of made) {
          const track = draft.tracks.find((candidate) => candidate.id === copy.trackId);
          if (!track) throw new Error(`clip.duplicate: track ${copy.trackId} does not exist`);
          draft.clips[copy.id] = structuredClone(copy) as Draft<Clip>;
          insertSorted(draft, track, copy.id, copy.start);
        }
      },
    },
    placed,
  };
}

/** Whether no clip of the drafted track lies in [start, end). */
function spanFree(draft: Draft<Project>, track: Draft<Track>, start: Frame, end: Frame): boolean {
  return track.clipIds.every((id) => {
    const other = draft.clips[id];
    return !other || other.start >= end || other.start + other.duration <= start;
  });
}

/** The canvas duplicate of the layers among `ids` (see the header), or null when none of them is a layer on an unlocked video track. */
export function duplicateLayers(project: Project, ids: Iterable<ClipId>, newId: () => string, offset = CANVAS_DUPLICATE_OFFSET): DuplicateResult | null {
  const order = new Map(project.tracks.map((track, index) => [track.id, index]));
  // The topmost layer first, so a copy never takes the track another original sits on above it.
  const clips = copiable(project, ids)
    .filter((clip): clip is LayerClip => isLayerClip(clip) && trackOf(project, clip.trackId)?.kind === "video")
    .sort((a, b) => (order.get(b.trackId) ?? 0) - (order.get(a.trackId) ?? 0) || a.start - b.start);
  if (clips.length === 0) return null;
  const made = copies(clips, newId, { links: false, transitions: false }).map((copy) => {
    const write = shiftedWrite(copy as LayerClip, offset, offset);
    if (!write) return copy;
    const moved = structuredClone(copy) as LayerClip;
    applyTransformWrite(moved as Draft<LayerClip>, write);
    return moved;
  });
  const trackIds = made.map(() => newId());
  const placed = new Map(clips.map((clip, i) => [clip.id, (made[i] as Clip).id]));
  return {
    command: {
      id: "clip.duplicate",
      label: made.length === 1 ? "Duplicate layer" : "Duplicate layers",
      affects: ["tracks", "clips", "timeline", "composite"],
      run(draft) {
        made.forEach((copy, i) => {
          const sourceAt = draft.tracks.findIndex((track) => track.id === copy.trackId);
          const video = draft.tracks.filter((track) => track.kind === "video");
          const above = video[video.findIndex((track) => track.id === copy.trackId) + 1];
          let target = above;
          if (!above || above.locked || above.hidden || above.muted || !spanFree(draft, above, copy.start, copy.start + copy.duration)) {
            draft.tracks.splice(sourceAt + 1, 0, emptyTrack(trackIds[i] as string, "video", nextTrackName(draft.tracks, "video")));
            target = draft.tracks[sourceAt + 1];
          }
          if (!target) throw new Error(`clip.duplicate: no track for ${copy.id}`);
          draft.clips[copy.id] = { ...structuredClone(copy), trackId: target.id } as Draft<Clip>;
          insertSorted(draft, target, copy.id, copy.start);
        });
      },
    },
    placed,
  };
}
