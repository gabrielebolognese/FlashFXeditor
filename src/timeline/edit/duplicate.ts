// Duplicate (spec §11 quick row, §18 Mod+D): one clip copied onto its own track, in the first free span
// at or after the clip's end that holds it (after the track's last clip when none does), without ripple.
// The copy keeps every field (source, transform, keyframes, label) but is neither linked nor grouped:
// its partners are not copied with it. TODO(batch 39): selections of several clips with their links,
// groups and transitions; the canvas duplicate at +20 px.
import { addClip } from "../../core/commands/basicCommands.js";
import type { Command } from "../../core/commands/command.js";
import type { Clip, ClipId, Frame, Project } from "../../core/document/types.js";
import { isClipLocked, trackIndex, trackOf } from "../model/queries.js";

export interface DuplicateResult {
  command: Command;
  /** The copy's id (the selection moves to it). */
  clipId: ClipId;
}

/** The first frame at or after `from` where `duration` frames fit between the clips of the track. */
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

/** The copy of `clipId` placed after it (one undo step "Duplicate clip"), or null when it is gone or on a locked track. */
export function duplicateClip(project: Project, clipId: ClipId, newId: () => string): DuplicateResult | null {
  const clip = project.clips[clipId];
  if (!clip || isClipLocked(project, clipId)) return null;
  const copy = structuredClone(clip) as Clip;
  copy.id = newId();
  copy.start = freeSpotAfter(project, clip, clip.start + clip.duration, clip.duration);
  delete copy.linkGroup;
  delete copy.group;
  return { command: { ...addClip(copy), id: "clip.duplicate", label: "Duplicate clip" }, clipId: copy.id };
}
