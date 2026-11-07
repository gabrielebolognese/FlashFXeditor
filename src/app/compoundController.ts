// Editing inside a compound clip (spec §21.10, Batch 63). `open` makes the timeline, the canvas and
// playback show the compound's sequence: the document store hands every view the sequence seen as a
// project (`DocumentStore.getState`) and runs commands on its tracks (`runInScope`), so nothing else
// changes. The open path, the playhead of each level left and the compound clips opened are session
// state (`SessionState.scope`); closing goes back to the level's playhead and selects the compound
// that was open. Opening and closing are not undoable; the edits inside are.
//
// Actions: `compound.open` (Mod+Alt+O; Enter on a selected compound clip, as `text.edit` declines it)
// and `compound.close` (Mod+Alt+U; Esc through `app.cancel`, after the gestures it cancels).
import type { ClipId, Frame, Project, SequenceId } from "../core/document/types.js";
import { EMPTY_SELECTION, selectClips } from "../core/store/selection.js";
import { NO_SCOPE, setPlayhead, setSelection, type ScopeState, type SessionStore } from "../core/store/sessionStore.js";
import type { DocumentStore } from "../core/store/DocumentStore.js";
import { showToast } from "../ui/toasts.js";
import { actions, documentStore, sessionStore } from "./services.js";

/** The inner frame an opened compound clip shows at project frame `frame` (clamped to the sequence). */
export function innerFrameAt(project: Project, clipId: ClipId, frame: Frame): Frame {
  const clip = project.clips[clipId];
  if (clip?.kind !== "compound") return 0;
  const sequence = project.sequences[clip.sequenceId];
  const inner = clip.offset + Math.min(clip.duration - 1, Math.max(0, frame - clip.start));
  return Math.max(0, Math.min(inner, (sequence?.duration ?? 1) - 1));
}

/** The breadcrumb: the project, then the name of each open compound. */
export function crumbs(project: Project, path: readonly SequenceId[]): string[] {
  return ["Project", ...path.map((id) => project.sequences[id]?.name ?? "Compound")];
}

/** Why the compound clip `clipId` cannot be opened, or null. */
export function openProblem(project: Project, clipId: ClipId | null): string | null {
  const clip = clipId === null ? undefined : project.clips[clipId];
  if (clip?.kind !== "compound") return "Select a compound clip";
  return project.sequences[clip.sequenceId] ? null : "Its sequence is missing";
}

/** Opens compound clip `clipId` of the shown level. False (with a toast) when it cannot be opened. */
export function openCompound(store: Pick<DocumentStore, "getState">, session: SessionStore, clipId: ClipId | null): boolean {
  const project = store.getState();
  const problem = openProblem(project, clipId);
  if (problem !== null || clipId === null) {
    showToast({ tone: "warning", message: "Can't open the compound", detail: problem ?? "Select a compound clip" });
    return false;
  }
  const clip = project.clips[clipId];
  if (clip?.kind !== "compound") return false;
  const state = session.state.getState();
  const inner = innerFrameAt(project, clipId, state.playhead);
  setSelection(session, EMPTY_SELECTION);
  setPlayhead(session, inner);
  session.state.set((current) => ({
    ...current,
    timeline: { ...current.timeline, scrollFrame: 0 },
    scope: { path: [...current.scope.path, clip.sequenceId], returns: [...current.scope.returns, state.playhead], opened: [...current.scope.opened, clipId] },
  }));
  return true;
}

/**
 * Closes levels until `depth` compounds stay open (0: the project; the default closes one). The
 * playhead goes back to where it was at that level and the compound clip that was open is selected.
 * False when nothing was open.
 */
export function closeCompound(session: SessionStore, depth?: number): boolean {
  const scope = session.state.getState().scope;
  const keep = Math.max(0, Math.min(depth ?? scope.path.length - 1, scope.path.length));
  if (keep >= scope.path.length) return false;
  const next: ScopeState = keep === 0 ? NO_SCOPE : { path: scope.path.slice(0, keep), returns: scope.returns.slice(0, keep), opened: scope.opened.slice(0, keep) };
  const playhead = scope.returns[keep];
  const opened = scope.opened[keep];
  // Selection and playhead first: the scope change then notifies the views once, on the final state.
  setSelection(session, opened === undefined ? EMPTY_SELECTION : selectClips([opened], opened));
  if (playhead !== undefined) setPlayhead(session, playhead);
  session.state.set((current) => ({ ...current, timeline: { ...current.timeline, scrollFrame: 0 }, scope: next }));
  return true;
}

/** Enter on a selected compound clip (`text.edit` hands over when it is not a text clip); false otherwise. */
export function openSelectedCompound(): boolean {
  const { kind, primary } = sessionStore.selection.getState();
  if (kind !== "clips" || primary === null || documentStore.getState().clips[primary]?.kind !== "compound") return false;
  return openCompound(documentStore, sessionStore, primary);
}

/** Registers the open and close actions and closes everything when the open sequence is gone. Returns a stop function. */
export function installCompoundController(): () => void {
  const stops = [
    actions.register("compound.open", () => openCompound(documentStore, sessionStore, sessionStore.selection.getState().primary)),
    actions.register("compound.close", () => closeCompound(sessionStore)),
    // Undo of the make (or any edit that removes a sequence) while it is open: back to the project.
    documentStore.subscribe(
      (state) => {
        const { path } = sessionStore.state.getState().scope;
        if (path.length === 0) return;
        const gone = path.findIndex((id) => state.sequences[id] === undefined);
        if (gone !== -1) closeCompound(sessionStore, gone);
      },
      { affects: ["clips", "tracks", "timeline"] },
    ),
  ];
  return () => {
    for (const stop of stops) stop();
  };
}
