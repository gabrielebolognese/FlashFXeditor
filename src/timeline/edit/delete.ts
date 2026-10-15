// Deleting clips (spec §6.11, §6.19, P2): the pure edits behind Delete (`Delete`/`Backspace`: the clips
// go, gaps stay) and Ripple delete (`Shift+Delete`/`Shift+Backspace`: the clips go and their spans
// close with the ripple of `closeGaps`, each track's by its own length, limited by collisions on the
// other tracks). Linked partners go with a clip unless Linked selection is off; clips on locked tracks
// are never deleted. Each is one command (one undo step).
// TODO(batch 36): a transition shared with a neighbor at a deleted clip's cut goes with the clip (the
// clip's own `transitionIn`/`transitionOut` go with its record already).
// TODO(batch 16): group members go with the clip.
import { removeClips } from "../../core/commands/basicCommands.js";
import type { Command } from "../../core/commands/command.js";
import type { Clip, ClipId, Project } from "../../core/document/types.js";
import { isClipLocked, linkedPartners, trackIndex, type Gap } from "../model/queries.js";
import { closeGaps, type CloseResult } from "./gaps.js";

/** The clips a delete of `ids` removes: those that exist on unlocked tracks and, with `linked`, their partners. */
export function deletionSet(project: Project, ids: Iterable<ClipId>, options: { linked?: boolean } = {}): ClipId[] {
  const result = new Set<ClipId>();
  for (const id of ids) {
    if (!project.clips[id] || isClipLocked(project, id)) continue;
    result.add(id);
    if (options.linked !== false) for (const partner of linkedPartners(project, id)) result.add(partner);
  }
  return [...result];
}

/** Delete (spec §6.11): removes the clips (and partners), leaving gaps. Null when nothing is deleted. */
export function deleteClips(project: Project, ids: Iterable<ClipId>, options: { linked?: boolean } = {}): Command | null {
  const gone = deletionSet(project, ids, options);
  return gone.length > 0 ? removeClips(gone) : null;
}

/**
 * The spans the removed clips leave on each track: runs of removed clips that touch (no kept clip and
 * no empty frame between them) form one span. Gaps that were already there are not part of it.
 */
export function removedSpans(project: Project, removed: ReadonlySet<ClipId>): Gap[] {
  const spans: Gap[] = [];
  for (const track of project.tracks) {
    let open: Gap | null = null;
    for (const clip of trackIndex(project, track).clips as readonly Clip[]) {
      if (!removed.has(clip.id)) {
        open = null;
        continue;
      }
      if (open && open.end === clip.start) {
        open.end = clip.start + clip.duration;
      } else {
        open = { trackId: track.id, start: clip.start, end: clip.start + clip.duration };
        spans.push(open);
      }
    }
  }
  return spans;
}

/**
 * Ripple delete (spec §6.11, §6.19): removes the clips (and partners) and closes each span they leave
 * by its own length; the other unlocked tracks move with the ripple and limit it where their clips
 * would collide (`result.limit`). One command. Null when nothing is deleted.
 */
export function rippleDelete(project: Project, ids: Iterable<ClipId>, options: { linked?: boolean } = {}): CloseResult | null {
  const gone = deletionSet(project, ids, options);
  if (gone.length === 0) return null;
  const removed = new Set(gone);
  return closeGaps(project, removedSpans(project, removed), { removed, id: "clip.rippleDelete", label: gone.length === 1 ? "Ripple delete clip" : "Ripple delete clips" });
}
