// Splitting clips (spec §6.11, §6.19): the pure edit behind Split at playhead (`Mod+K`), Split all
// tracks (`Mod+Shift+K`) and the Razor tool. A split cuts each clip crossing the frame into two clips
// with the same properties: the left piece keeps the clip's id, the right piece gets a new one.
// `sliceClip` moves the source in/out, partitions keyframes and drops what belongs to the cut side
// (the left piece's fade out, transition out and text animation out, the right piece's in side): the
// transitions at the cut go with it, and a cut through a transition's frames removes it (Batch 36).
// Linked clips split together: the right pieces of one link group
// are linked to each other under a new group, a right piece with no partner split with it is unlinked.
// Clips on locked tracks never split; a frame on a clip's start or end splits nothing.
import type { Draft } from "immer";
import type { Command } from "../../core/commands/command.js";
import { isMediaClip, type Clip, type ClipId, type Frame, type MediaClip, type Project } from "../../core/document/types.js";
import { selectClips, type Selection } from "../../core/store/selection.js";
import { clipInIndex, isClipLocked, linkedPartners, trackIndex } from "../model/queries.js";
import { sliceClip } from "./move.js";

/** Which clips a split at a frame cuts (spec §6.11). */
export type SplitScope =
  /** The given clips (the selection, or a razor click), those under the frame only. */
  | { kind: "clips"; clipIds: readonly ClipId[] }
  /** With nothing selected: every clip under the frame on targeted unlocked tracks. */
  | { kind: "targeted" }
  /** `Mod+Shift+K`, Razor Shift+click: every clip under the frame on unlocked tracks. */
  | { kind: "all" };

export interface SplitResult {
  /** One undo step. */
  command: Command;
  /** Each split clip's id (now its left piece) and the id of its right piece. */
  pieces: ReadonlyMap<ClipId, ClipId>;
}

/** True when `frame` lies strictly inside the clip (a cut there leaves two clips of at least 1 frame). */
export function splitsAt(clip: Clip, frame: Frame): boolean {
  return clip.start < frame && frame < clip.start + clip.duration;
}

/**
 * The clips a split of `scope` at `frame` cuts, in track order then start: those under the frame on
 * unlocked tracks and, with `linked` (Linked selection on), their linked partners under it too.
 */
export function clipsToSplit(project: Project, frame: Frame, scope: SplitScope, options: { linked?: boolean } = {}): ClipId[] {
  const ids = new Set<ClipId>();
  const add = (clip: Clip | null | undefined) => {
    if (clip && splitsAt(clip, frame) && !isClipLocked(project, clip.id)) ids.add(clip.id);
  };
  if (scope.kind === "clips") {
    for (const id of scope.clipIds) add(project.clips[id]);
  } else {
    for (const track of project.tracks) {
      if (track.locked || (scope.kind === "targeted" && !track.targeted)) continue;
      add(clipInIndex(trackIndex(project, track), frame));
    }
  }
  if (options.linked !== false) for (const id of [...ids]) for (const partner of linkedPartners(project, id)) add(project.clips[partner]);
  const order = new Map(project.tracks.map((track, index) => [track.id, index]));
  const clips = [...ids].map((id) => project.clips[id] as Clip);
  clips.sort((a, b) => (order.get(a.trackId) ?? 0) - (order.get(b.trackId) ?? 0) || a.start - b.start);
  return clips.map((clip) => clip.id);
}

/**
 * Splits `clipIds` at `frame` (clips not under it, unknown or locked are skipped). One `clip.split`
 * command; null when nothing splits (e.g. the frame is on a clip edge, spec §6.19).
 */
export function splitClips(project: Project, clipIds: readonly ClipId[], frame: Frame, newId: () => string): SplitResult | null {
  const { fps } = project.settings;
  const lefts: Clip[] = [];
  const rights: Clip[] = [];
  const pieces = new Map<ClipId, ClipId>();
  for (const id of new Set(clipIds)) {
    const clip = project.clips[id];
    if (!clip || !splitsAt(clip, frame) || isClipLocked(project, id)) continue;
    const end = clip.start + clip.duration;
    const right = { ...sliceClip(clip, frame, end, fps), id: newId() } as Clip;
    const left = sliceClip(clip, clip.start, frame, fps);
    // A cut through a transition's frames takes the transition away (Batch 36: its other half goes
    // with `reconcileTransitions` after the command).
    if (isMediaClip(clip)) {
      if (clip.transitionOut && frame > end - clip.transitionOut.before) delete (right as MediaClip).transitionOut;
      if (clip.transitionIn && frame < clip.start + clip.transitionIn.after) delete (left as MediaClip).transitionIn;
    }
    lefts.push(left);
    rights.push(right);
    pieces.set(id, right.id);
  }
  if (lefts.length === 0) return null;
  relink(rights, newId);
  const label = lefts.length === 1 ? "Split clip" : "Split clips";
  return { command: splitCommand(label, lefts, rights), pieces };
}

/**
 * Right pieces cut from one link group become a link group of their own (they all start at the
 * split frame); a lone right piece is unlinked. Left pieces keep their ids and links. Rewrites `rights`.
 */
export function relink(rights: Clip[], newId: () => string): void {
  const byGroup = new Map<string, number[]>();
  rights.forEach((clip, i) => {
    if (clip.linkGroup === undefined) return;
    const list = byGroup.get(clip.linkGroup);
    if (list) list.push(i);
    else byGroup.set(clip.linkGroup, [i]);
  });
  for (const indexes of byGroup.values()) {
    const group = indexes.length > 1 ? newId() : undefined;
    for (const i of indexes) {
      const next = { ...(rights[i] as Clip) };
      if (group === undefined) delete next.linkGroup;
      else next.linkGroup = group;
      rights[i] = next;
    }
  }
}

function splitCommand(label: string, lefts: readonly Clip[], rights: readonly Clip[]): Command {
  return {
    id: "clip.split",
    label,
    affects: ["clips", "timeline"],
    run(draft) {
      lefts.forEach((left, i) => {
        const right = rights[i] as Clip;
        const track = draft.tracks.find((t) => t.id === left.trackId);
        const at = track ? track.clipIds.indexOf(left.id) : -1;
        if (!track || at === -1 || !draft.clips[left.id]) throw new Error(`clip.split: clip ${left.id} is not on track ${left.trackId}`);
        if (draft.clips[right.id]) throw new Error(`clip.split: clip ${right.id} already exists`);
        draft.clips[left.id] = left as Draft<Clip>;
        draft.clips[right.id] = right as Draft<Clip>;
        // The right piece starts where the left one ends: right after it in the start-sorted list.
        track.clipIds.splice(at + 1, 0, right.id);
      });
    },
  };
}

/**
 * The selection after a split (spec §6.11): both pieces of a selected clip stay selected; the primary
 * moves to the right piece of the primary clip. Clips split only as linked partners of selected ones
 * keep their selection state (a partner that was not selected stays out).
 */
export function selectionAfterSplit(selection: Selection, pieces: ReadonlyMap<ClipId, ClipId>): Selection {
  if (selection.kind !== "clips" || selection.clipIds.size === 0) return selection;
  const ids: ClipId[] = [];
  for (const id of selection.clipIds) {
    ids.push(id);
    const right = pieces.get(id);
    if (right !== undefined) ids.push(right);
  }
  const primary = selection.primary !== null ? (pieces.get(selection.primary) ?? selection.primary) : null;
  return selectClips(ids, primary);
}
