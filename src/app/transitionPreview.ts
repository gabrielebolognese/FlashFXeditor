// The Transition section's alignment preview (Batch 46, the Batch 14 and 36 follow-ups): while the
// pointer rests on an alignment choice (Center, Start, End), the preview splits into the transition's
// first and last frames as that alignment would place it (`previewSplit`, as rolls and slips show
// theirs): what each side of the cut gives the transition. Nothing is committed; leaving the choice ends
// it. Hover writes a store, never React state (P1).
import { produce } from "immer";
import { alignedSides, type TransitionAlignment } from "../core/document/transitions.js";
import type { Frame, Project } from "../core/document/types.js";
import { createStore } from "../core/store/createStore.js";
import { EMPTY_SELECTION, toSnapshot } from "../core/store/selection.js";
import { transitionAt, updateTransition, type Cut } from "../timeline/edit/transitions.js";

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
