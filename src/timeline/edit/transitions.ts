// Transition edits (spec §6.15, §6.4, §11; Batch 36): the pure edits behind `Mod+Shift+D` (the default
// transition), the quick row's transition chips (clicked, or dragged onto a cut), the clip menu's Add
// transition rows, the Transition section and the drags of a transition block's edges. The model
// (handles, fitting, the mix, keeping transitions valid) is core/document/transitions.ts.
// - A transition is named by its cut (`Cut`: the left and the right clip). Every edit writes both
//   halves (the left clip's `transitionOut`, the right clip's `transitionIn`).
// - Linked audio crossfades automatically (spec §6.15): with `linked` (Linked selection on), an edit of
//   a cut also edits the cuts of the clips' linked partners at the same frame (the audio of a video
//   cut, the video of an audio cut). Audio transitions are crossfades (`crossDissolve`) whatever the
//   kind of the picture's.
// - A new transition is centered on the cut and takes the maximum the handles allow; with no handle at
//   all it repeats edge frames (`fitTransition`). A cut that has one keeps its frames and changes kind.
// - Edge drags (spec §6.15): symmetric by default (both sides grow or shrink by the drag), one side
//   with Alt. A side stops at the clip it covers and at its handle (`Media start` / `Media end`) unless
//   it already repeats frames; the transition keeps at least one frame.
// Each edit is one command (one undo step).
import type { Draft } from "immer";
import type { Command } from "../../core/commands/command.js";
import { canTransition, fitTransition, handleOf, sameTransition, TRANSITION_LABELS, transitionRoom } from "../../core/document/transitions.js";
import { isMediaClip, type ClipId, type Frame, type MediaClip, type Project, type Track, type TrackId, type Transition, type TransitionKind } from "../../core/document/types.js";
import { isClipLocked, linkedPartners, neighbors, trackIndex } from "../model/queries.js";
import { editDefaults } from "./editDefaults.js";

/** A cut between two abutting clips: where a transition sits. */
export interface Cut {
  left: ClipId;
  right: ClipId;
}

/** A cut that can hold a transition: the two clips abut on one unlocked track and are media of one kind. */
export interface ValidCut {
  left: MediaClip;
  right: MediaClip;
  /** The cut's frame (the right clip's start). */
  frame: Frame;
}

export function validCut(project: Project, cut: Cut): ValidCut | null {
  const left = project.clips[cut.left];
  const right = project.clips[cut.right];
  if (!left || !right || !isMediaClip(left) || !isMediaClip(right) || !canTransition(left, right)) return null;
  if (left.start + left.duration !== right.start || isClipLocked(project, left.id)) return null;
  return { left, right, frame: right.start };
}

/** The transition at a cut, or null. */
export function transitionAt(project: Project, cut: Cut): Transition | null {
  const valid = validCut(project, cut);
  return valid?.left.transitionOut && valid.left.transitionOut.id === valid.right.transitionIn?.id ? valid.left.transitionOut : null;
}

/** The cut of the transition with this id, or null. */
export function cutOfTransition(project: Project, id: string): Cut | null {
  for (const clipId in project.clips) {
    const clip = project.clips[clipId];
    if (!clip || !isMediaClip(clip) || clip.transitionOut?.id !== id) continue;
    const next = neighbors(project, clip.id).next;
    return next ? { left: clip.id, right: next.id } : null;
  }
  return null;
}

/**
 * The cut and, with `linked`, the cuts of its clips' linked partners at the same frame (the linked
 * audio of a picture cut, or the picture of an audio cut): the cuts one transition edit acts on.
 */
export function linkedCuts(project: Project, cut: Cut, linked: boolean): ValidCut[] {
  const first = validCut(project, cut);
  if (!first) return [];
  const cuts = [first];
  if (!linked) return cuts;
  const rights = new Set(linkedPartners(project, first.right.id));
  for (const id of linkedPartners(project, first.left.id)) {
    const partner = project.clips[id];
    if (!partner || partner.trackId === first.left.trackId || partner.start + partner.duration !== first.frame) continue;
    const next = neighbors(project, id).next;
    if (!next || !rights.has(next.id)) continue;
    const other = validCut(project, { left: id, right: next.id });
    if (other && !cuts.some((known) => known.left.trackId === other.left.trackId)) cuts.push(other);
  }
  return cuts;
}

const kindFor = (cut: ValidCut, kind: TransitionKind): TransitionKind => (cut.left.kind === "audio" ? "crossDissolve" : kind);

/** One command writing `values` (by cut) on both halves of each cut; null when nothing changes. */
function writeCommand(id: string, label: string, writes: readonly { cut: ValidCut; value: Transition | null }[], coalesceKey?: string): Command | null {
  const changed = writes.filter(({ cut, value }) => !(value === null ? cut.left.transitionOut === undefined && cut.right.transitionIn === undefined : sameTransition(cut.left.transitionOut, value) && sameTransition(cut.right.transitionIn, value)));
  if (changed.length === 0) return null;
  const entries = changed.map(({ cut, value }) => ({ left: cut.left.id, right: cut.right.id, value }));
  return {
    id,
    label,
    ...(coalesceKey !== undefined && { coalesceKey }),
    affects: ["clips", "timeline", "composite", "audio"],
    run(draft) {
      for (const { left, right, value } of entries) {
        const a = draft.clips[left] as Draft<MediaClip> | undefined;
        const b = draft.clips[right] as Draft<MediaClip> | undefined;
        if (!a || !b) throw new Error(`${id}: the clips of cut ${left}|${right} do not exist`);
        if (value === null) {
          delete a.transitionOut;
          delete b.transitionIn;
        } else {
          a.transitionOut = { ...value };
          b.transitionIn = { ...value };
        }
      }
    },
  };
}

export interface AddTransitionResult {
  command: Command;
  /** The transition's cut and id (the first cut: the one asked for). */
  cut: Cut;
  id: string;
  /** Edge frames repeat on a side: the handles were too short. */
  repeated: boolean;
}

/**
 * Adds a `kind` transition at `cut` (spec §6.15): centered, `length` frames (default: the setting, 15) or the most
 * the handles allow; a cut that has one keeps its frames and takes the kind. With `linked`, the linked
 * cuts get a crossfade of the same frames. Null when the cut cannot hold one.
 */
export function addTransition(project: Project, cut: Cut, kind: TransitionKind, options: { length?: Frame; linked?: boolean; newId: () => string }): AddTransitionResult | null {
  const cuts = linkedCuts(project, cut, options.linked === true);
  const first = cuts[0];
  if (!first) return null;
  const length = options.length ?? editDefaults().transitionFrames;
  const writes: { cut: ValidCut; value: Transition }[] = [];
  let repeated = false;
  for (const target of cuts) {
    const existing = target.left.transitionOut?.id !== undefined && target.left.transitionOut.id === target.right.transitionIn?.id ? target.left.transitionOut : null;
    if (existing) {
      writes.push({ cut: target, value: { ...existing, kind: kindFor(target, kind) } });
      continue;
    }
    const fit = fitTransition(project, target.left, target.right, length);
    if (!fit) continue;
    if (target === first) repeated = fit.repeated;
    writes.push({ cut: target, value: { id: options.newId(), kind: kindFor(target, kind), before: fit.before, after: fit.after } });
  }
  const own = writes.find((write) => write.cut === first);
  if (!own) return null;
  const command = writeCommand("transition.add", `Add ${TRANSITION_LABELS[own.value.kind].toLowerCase()}`, writes);
  if (!command) return null;
  return { command, cut: { left: first.left.id, right: first.right.id }, id: own.value.id, repeated };
}

/**
 * Changes the transition at `cut` (and, with `linked`, its linked cuts'): its kind (pictures only) and
 * its sides (each kept within the clip it covers). Null when nothing changes or there is none.
 */
export function updateTransition(project: Project, cut: Cut, patch: { kind?: TransitionKind; before?: Frame; after?: Frame }, options: { linked?: boolean; label?: string; coalesceKey?: string } = {}): Command | null {
  const writes: { cut: ValidCut; value: Transition }[] = [];
  for (const target of linkedCuts(project, cut, options.linked === true)) {
    const current = target.left.transitionOut;
    if (!current || current.id !== target.right.transitionIn?.id) continue;
    const room = transitionRoom(target.left, target.right);
    let before = Math.min(room.before, Math.max(0, Math.round(patch.before ?? current.before)));
    let after = Math.min(room.after, Math.max(0, Math.round(patch.after ?? current.after)));
    // At least one frame: on the side that has room.
    if (before + after === 0) {
      if (room.after > 0) after = 1;
      else before = 1;
    }
    writes.push({ cut: target, value: { ...current, kind: patch.kind ? kindFor(target, patch.kind) : current.kind, before, after } });
  }
  const label = options.label ?? (patch.kind !== undefined ? "Change transition" : "Change transition duration");
  return writeCommand("transition.update", label, writes, options.coalesceKey);
}

/** Removes the transitions at `cuts` (and, with `linked`, at their linked cuts): one `transition.remove` command, or null. */
export function removeTransitions(project: Project, cuts: readonly Cut[], options: { linked?: boolean } = {}): Command | null {
  const writes: { cut: ValidCut; value: null }[] = [];
  for (const cut of cuts) {
    for (const target of linkedCuts(project, cut, options.linked === true)) {
      if (target.left.transitionOut || target.right.transitionIn) writes.push({ cut: target, value: null });
    }
  }
  return writeCommand("transition.remove", writes.length > 1 ? "Delete transitions" : "Delete transition", writes);
}

// --- Where a transition goes --------------------------------------------------------------------

/** The cuts of a track that can hold a transition, in order. */
export function cutsOf(project: Project, track: Track): ValidCut[] {
  const clips = trackIndex(project, track).clips;
  const cuts: ValidCut[] = [];
  for (let i = 1; i < clips.length; i++) {
    const left = clips[i - 1];
    const right = clips[i];
    if (!left || !right || left.start + left.duration !== right.start) continue;
    const cut = validCut(project, { left: left.id, right: right.id });
    if (cut) cuts.push(cut);
  }
  return cuts;
}

/**
 * Where `Mod+Shift+D` puts the default transition (spec §6.15): the selected edit point, else the cut
 * nearest to the playhead on the targeted unlocked tracks (picture tracks first on a tie). Null when
 * there is none.
 */
export function defaultTransitionCut(project: Project, editPoint: Cut | null, playhead: Frame): Cut | null {
  if (editPoint) return validCut(project, editPoint) ? editPoint : null;
  let best: ValidCut | null = null;
  let distance = Infinity;
  for (const track of project.tracks) {
    if (track.kind === "caption" || !track.targeted || track.locked) continue;
    for (const cut of cutsOf(project, track)) {
      const d = Math.abs(cut.frame - playhead);
      if (d < distance) {
        best = cut;
        distance = d;
      }
    }
  }
  return best ? { left: best.left.id, right: best.right.id } : null;
}

/** The cut at the start or end of `clipId` nearest to the playhead (the quick row's chips with a clip selected), or null. */
export function clipCut(project: Project, clipId: ClipId, playhead: Frame): Cut | null {
  const clip = project.clips[clipId];
  if (!clip) return null;
  const { prev, next } = neighbors(project, clipId);
  const before = prev && validCut(project, { left: prev.id, right: clip.id }) ? { left: prev.id, right: clip.id } : null;
  const after = next && validCut(project, { left: clip.id, right: next.id }) ? { left: clip.id, right: next.id } : null;
  if (!before || !after) return before ?? after;
  return Math.abs(clip.start - playhead) <= Math.abs(clip.start + clip.duration - playhead) ? before : after;
}

/** The cut on `trackId` nearest to `frame` within `reach` frames (a chip dropped on the timeline), or null. */
export function cutNear(project: Project, trackId: TrackId, frame: number, reach: number): Cut | null {
  const track = project.tracks.find((candidate) => candidate.id === trackId);
  if (!track) return null;
  let best: ValidCut | null = null;
  let distance = reach;
  for (const cut of cutsOf(project, track)) {
    const d = Math.abs(cut.frame - frame);
    if (d <= distance) {
      best = cut;
      distance = d;
    }
  }
  return best ? { left: best.left.id, right: best.right.id } : null;
}

// --- Edge drags ---------------------------------------------------------------------------------

export type TransitionEdge = "start" | "end";

export interface TransitionDrag {
  before: Frame;
  after: Frame;
  /** The dragged side stopped at its handle: `start` = the right clip's media start, `end` = the left clip's media end. */
  bound: "mediaStart" | "mediaEnd" | null;
}

/**
 * The sides after dragging the `edge` of the transition at `cut` by `delta` frames (spec §6.15): both
 * sides change by the drag (the block grows or shrinks around the cut), or only the dragged one with
 * `oneSided` (Alt). Each side stays within the clip it covers and its handle (unless it already
 * repeats frames: then within the clip only); the transition keeps at least one frame.
 */
export function dragTransitionEdge(project: Project, cut: Cut, edge: TransitionEdge, delta: number, oneSided: boolean): TransitionDrag | null {
  const valid = validCut(project, cut);
  const current = valid ? transitionAt(project, cut) : null;
  if (!valid || !current) return null;
  const grow = Math.round(edge === "end" ? delta : -delta);
  const room = transitionRoom(valid.left, valid.right);
  const head = handleOf(project, valid.right, "head");
  const tail = handleOf(project, valid.left, "tail");
  const maxBefore = current.before > head ? room.before : Math.min(room.before, head);
  const maxAfter = current.after > tail ? room.after : Math.min(room.after, tail);
  const changeBefore = !oneSided || edge === "start";
  const changeAfter = !oneSided || edge === "end";
  const wantBefore = changeBefore ? current.before + grow : current.before;
  const wantAfter = changeAfter ? current.after + grow : current.after;
  let before = Math.min(maxBefore, Math.max(0, wantBefore));
  let after = Math.min(maxAfter, Math.max(0, wantAfter));
  if (before + after === 0) {
    if (edge === "end") after = Math.min(1, maxAfter) || 0;
    else before = Math.min(1, maxBefore) || 0;
    if (before + after === 0) return { before: current.before, after: current.after, bound: null };
  }
  const dragged = edge === "start" ? "before" : "after";
  const stopped = dragged === "before" ? wantBefore > before && maxBefore === head && head < room.before : wantAfter > after && maxAfter === tail && tail < room.after;
  return { before, after, bound: stopped ? (dragged === "before" ? "mediaStart" : "mediaEnd") : null };
}
