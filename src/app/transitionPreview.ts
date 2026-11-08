// The Transition section's alignment preview (Batch 46, the Batch 14 and 36 follow-ups): while the
// pointer rests on an alignment choice (Center, Start, End), the preview splits into the transition's
// first and last frames as that alignment would place it (`previewSplit`, as rolls and slips show
// theirs): what each side of the cut gives the transition. Nothing is committed; leaving the choice ends
// it. Hover writes a store, never React state (P1).
import { produce } from "immer";
import { alignedSides, type TransitionAlignment } from "../core/document/transitions.js";
import type { Frame, Project, TransitionKind } from "../core/document/types.js";
import { createStore } from "../core/store/createStore.js";
import { EMPTY_SELECTION, toSnapshot } from "../core/store/selection.js";
import { transitionAt, updateTransition, type Cut, type TransitionParams } from "../timeline/edit/transitions.js";

export interface AlignmentHover {
  cut: Cut;
  alignment: Exclude<TransitionAlignment, "custom">;
}

/** The alignment choice under the pointer, or null. */
export const alignmentHover = createStore<AlignmentHover | null>(null);

export function hoverAlignment(hover: AlignmentHover | null): void {
  const current = alignmentHover.getState();
  if (current?.cut.left === hover?.cut.left && current?.cut.right === hover?.cut.right && current?.alignment === hover?.alignment) return;
  alignmentHover.set(hover);
}

/**
 * The preview override for `hover` over `project` (PreviewView `override`): the document with the
 * transition aligned that way, shown split at its first (left) and last (right) frame. Null when the cut
 * has no transition any more.
 */
export function alignmentPreview(project: Project, hover: AlignmentHover | null): { project: Project; frame: Frame; previewSplit: { leftFrame: Frame; rightFrame: Frame } } | null {
  if (!hover) return null;
  const current = transitionAt(project, hover.cut);
  if (!current) return null;
  const command = updateTransition(project, hover.cut, alignedSides(current.before + current.after, hover.alignment));
  const context = { playhead: 0, selection: toSnapshot(EMPTY_SELECTION), newId: () => crypto.randomUUID() };
  const proposed = command ? produce(project, (draft) => command.run(draft, context)) : project;
  const left = proposed.clips[hover.cut.left];
  const aligned = transitionAt(proposed, hover.cut);
  if (!left || !aligned) return null;
  const cutFrame = left.start + left.duration;
  const first = cutFrame - aligned.before;
  const last = cutFrame + aligned.after - 1;
  return { project: proposed, frame: first, previewSplit: { leftFrame: first, rightFrame: Math.max(first, last) } };
}

/** The transition chip kind under the pointer (or focused), or null: the Preview row animates it (Batch 71 review, P1: a store, not React state). */
export const kindHover = createStore<TransitionKind | null>(null);

export function hoverKind(kind: TransitionKind | null): void {
  if (kindHover.getState() !== kind) kindHover.set(kind);
}

/** A transition field scrub in progress (Angle, Softness, Center): the values it shows live, before the release commits one command (P2). */
export interface TransitionLive {
  cut: Cut;
  patch: TransitionParams;
  linked: boolean;
}

export const transitionLive = createStore<TransitionLive | null>(null);


/**
 * The preview override for a live field scrub (PreviewView `override`): the document with the scrub's
 * values applied to the transition, at the frame being shown. Null when nothing is live or the cut has
 * no transition any more.
 */
export function transitionLivePreview(project: Project, live: TransitionLive | null, frame: Frame): { project: Project; frame: Frame } | null {
  if (!live || !transitionAt(project, live.cut)) return null;
  const command = updateTransition(project, live.cut, live.patch, { linked: live.linked });
  if (!command) return null;
  const context = { playhead: frame, selection: toSnapshot(EMPTY_SELECTION), newId: () => crypto.randomUUID() };
  return { project: produce(project, (draft) => command.run(draft, context)), frame };
}
