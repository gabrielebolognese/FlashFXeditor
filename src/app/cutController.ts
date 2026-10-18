// Cutting and cleanup (spec §6.11, §6.7, §6.16): Split at playhead and Split all tracks, the Razor
// tool, Delete and Ripple delete (clips, a selected gap, or a selected marker), Close gap and Close all gaps (compact),
// clip rename (F2), label colors, and the clip and gap context menus. Every edit is one command (one
// undo step) built by the pure edits in `timeline/edit` (split, delete, gaps). Delete and F2 in the
// media panel go to the media panel's own actions; on its Captions tab Delete deletes the selected cues.
import { updateClip } from "../core/commands/basicCommands.js";
import type { CommandRun } from "../core/commands/CommandRegistry.js";
import { LABEL_COLORS, type ClipId, type LabelColor } from "../core/document/types.js";
import { createStore } from "../core/store/createStore.js";
import { EMPTY_SELECTION, selectedTrackIds, toSnapshot } from "../core/store/selection.js";
import { selectGap } from "../core/store/sessionStore.js";
import { deleteClips, rippleDelete } from "../timeline/edit/delete.js";
import { closeGap, compactGaps, gapAtPlayhead, type CloseResult } from "../timeline/edit/gaps.js";
import { clipsToSplit, selectionAfterSplit, splitClips, type SplitScope } from "../timeline/edit/split.js";
import { gapAt, isClipLocked } from "../timeline/model/queries.js";
import type { ContextMenuRequest, RazorRequest } from "../timeline/view/TimelineView.js";
import { showToast } from "../ui/toasts.js";
import { deleteSelectedKeys } from "./keyframeController.js";
import { deleteSelectedMarker } from "./markerController.js";
import { requestRemove, startRename } from "./mediaController.js";
import { actions, documentStore, focusScopes, sessionStore } from "./services.js";
import { deleteSelectedTransition } from "./transitionController.js";

/** Longest clip name kept by a rename (as for media names). */
export const MAX_CLIP_NAME = 255;

const newId = () => crypto.randomUUID();
const playhead = () => sessionStore.state.getState().playhead;
const linked = () => sessionStore.state.getState().linkedSelection;

/** The selected clip ids (none for a track or cue selection) and the primary. */
function selectedClips(): { ids: ClipId[]; primary: ClipId | null } {
  const selection = sessionStore.selection.getState();
  return selection.kind === "clips" ? { ids: [...selection.clipIds], primary: selection.primary } : { ids: [], primary: null };
}

// --- Split ---------------------------------------------------------------------------------------

/** Splits `scope` at `frame` (one undo step); selected clips keep both pieces selected, the primary on the right one. */
function splitAt(frame: number, scope: SplitScope): void {
  const project = documentStore.getState();
  const result = splitClips(project, clipsToSplit(project, frame, scope, { linked: linked() }), frame, newId);
  if (!result) return;
  const selection = selectionAfterSplit(sessionStore.selection.getState(), result.pieces);
  documentStore.dispatch(result.command, { selection: toSnapshot(selection) });
}

/**
 * `Mod+K` (spec §6.11): the selected clips under the playhead, or with nothing selected every clip
 * under it on targeted tracks; `Mod+Shift+K` (`all`): every unlocked track.
 */
function splitAtPlayhead(all: boolean): CommandRun {
  return () => {
    const { ids } = selectedClips();
    splitAt(playhead(), all ? { kind: "all" } : ids.length > 0 ? { kind: "clips", clipIds: ids } : { kind: "targeted" });
  };
}

/** A Razor click (spec §6.11): the clip and its linked partners, or with Shift every unlocked track, at the snapped frame. */
export function razorCut(request: RazorRequest): void {
  if (request.all) splitAt(request.frame, { kind: "all" });
  else if (request.clipId !== null) splitAt(request.frame, { kind: "clips", clipIds: [request.clipId] });
}

// --- Gaps and deletes ----------------------------------------------------------------------------

/** A ripple that stopped short (spec §6.11: "a toast explains"). */
function reportLimit(result: CloseResult, kind: "gap" | "compact" | "ripple"): void {
  const { limit } = result;
  if (!limit) return;
  const project = documentStore.getState();
  const clip = project.clips[limit.clipId]?.name ?? "A clip";
  const track = project.tracks.find((candidate) => candidate.id === limit.trackId)?.name ?? "another track";
  const none = result.closed.every((frames) => frames === 0);
  const message =
    kind === "ripple" ? (none ? "Deleted without closing the gap" : "Ripple delete stopped short") : kind === "compact" ? "Some gaps stayed open" : none ? "Can't close the gap" : "Gap closed partly";
  showToast({ tone: "warning", message, detail: `${clip} on ${track} can't move further left without overlapping.` });
}

function commitClose(result: CloseResult, kind: "gap" | "compact"): boolean {
  reportLimit(result, kind);
  if (!result.command) return false;
  documentStore.dispatch(result.command);
  return true;
}

/** `G` (spec §6.11): the selected gap, else the gap at the playhead on targeted tracks (ripple). */
const closeGapAction: CommandRun = () => {
  const project = documentStore.getState();
  const selected = sessionStore.gap.getState();
  const gap = selected ?? gapAtPlayhead(project, playhead());
  if (gap && commitClose(closeGap(project, gap), "gap")) selectGap(sessionStore, null);
};

/** `Shift+G`, toolbar Compact (spec §6.11): every gap on the selected tracks, else on the targeted tracks, one undo step. */
const compactAction: CommandRun = () => {
  const project = documentStore.getState();
  const selected = selectedTrackIds(sessionStore.selection.getState()).filter((id) => project.tracks.some((track) => track.id === id && !track.locked));
  commitClose(compactGaps(project, selected.length > 0 ? selected : undefined), "compact");
};

/** Gap menu "Close all gaps on track" (spec §6.16): the selected gap's track. */
const compactTrackAction: CommandRun = () => {
  const gap = sessionStore.gap.getState();
  if (gap && commitClose(compactGaps(documentStore.getState(), [gap.trackId], { label: "Close all gaps on track" }), "compact")) selectGap(sessionStore, null);
};

/**
 * `Delete` / `Backspace` and `Shift+Delete` (spec §6.11): the selected clips and their linked
 * partners go, leaving gaps or (ripple) closing them; a selected gap closes (spec §6.7). With keys
 * selected on a keyframe lane, only those keys go (Batch 35); a selected transition goes alone (Batch 36).
 */
function deleteSelection(ripple: boolean): void {
  if (deleteSelectedKeys()) return;
  // A selected transition (Batch 36) goes with its linked crossfade.
  if (deleteSelectedTransition()) return;
  if (sessionStore.gap.getState()) {
    closeGapAction(null);
    return;
  }
  // A selected marker (spec §6.3) is deleted; it excludes a clip selection.
  if (deleteSelectedMarker()) return;
  const { ids } = selectedClips();
  if (ids.length === 0) return;
  const project = documentStore.getState();
  const after = { selection: toSnapshot(EMPTY_SELECTION) };
  if (!ripple) {
    const command = deleteClips(project, ids, { linked: linked() });
    if (command) documentStore.dispatch(command, after);
    return;
  }
  const result = rippleDelete(project, ids, { linked: linked() });
  if (!result?.command) return;
  reportLimit(result, "ripple");
  documentStore.dispatch(result.command, after);
}

// --- Rename and label colors ---------------------------------------------------------------------

/** The clip whose name is being edited inline over the timeline (F2, context menu Rename), or null. */
export const clipRename = createStore<ClipId | null>(null);

/** F2 in the timeline: renames the primary selected clip. */
function startClipRename(): void {
  const { ids, primary } = selectedClips();
  const clipId = primary ?? ids[0];
  if (clipId !== undefined && documentStore.getState().clips[clipId] && !isClipLocked(documentStore.getState(), clipId)) clipRename.set(clipId);
}

/** Ends the inline rename; `name` null cancels. One undoable command when the name changed. */
export function finishClipRename(clipId: ClipId, name: string | null): void {
  if (clipRename.getState() === clipId) clipRename.set(null);
  const clip = documentStore.getState().clips[clipId];
  const clean = name?.replace(/\s+/g, " ").trim().slice(0, MAX_CLIP_NAME);
  if (clip && clean && clean !== clip.name) documentStore.dispatch(updateClip(clipId, { name: clean }, { label: "Rename clip" }));
}

/** Label color of the selected clips (spec §6.4, clip context menu); null removes it. One undo step. */
export function setLabelColor(color: LabelColor | null): void {
  const project = documentStore.getState();
  const ids = selectedClips().ids.filter((id) => project.clips[id] && !isClipLocked(project, id) && (project.clips[id]?.color ?? null) !== color);
  if (ids.length === 0) return;
  documentStore.transaction(ids.length === 1 ? "Label clip" : "Label clips", () => {
    for (const id of ids) documentStore.dispatch(updateClip(id, { color: color ?? undefined }));
  });
}

// --- Context menus -------------------------------------------------------------------------------

const hasClips = () => sessionStore.selection.getState().kind === "clips";

/** The open timeline context menu (spec §6.16), or null. React renders it from this store. */
export const timelineMenu = createStore<ContextMenuRequest | null>(null);

/** A right-click on a clip, a gap, a track header or the ruler (the view has selected what it names). */
export function openContextMenu(request: ContextMenuRequest): void {
  timelineMenu.set(request);
}

/** The menu closed: the keyboard goes back to the timeline (the menu owned it as a dialog). */
export function closeContextMenu(): void {
  if (!timelineMenu.getState()) return;
  timelineMenu.set(null);
  focusScopes.set("timeline");
}

/** Registers the cutting actions. Returns a stop function. */
export function installCutController(): () => void {
  const stops = [
    actions.register("edit.split", splitAtPlayhead(false)),
    actions.register("edit.splitAll", splitAtPlayhead(true)),
    actions.register("tool.razor", () => sessionStore.state.set((state) => (state.activeTool === "razor" ? state : { ...state, activeTool: "razor" }))),
    // §12: Delete in the media panel removes the selected media (§10.5: the selected cues on the
    // Captions tab); elsewhere it deletes clips.
    actions.register("edit.delete", (context) => {
      if (context?.scope === "media" && sessionStore.state.getState().mediaPanel.tab !== "captions") return requestRemove();
      deleteSelection(false);
    }),
    actions.register("edit.rippleDelete", () => deleteSelection(true)),
    actions.register("edit.closeGap", closeGapAction),
    actions.register("edit.closeAllGaps", compactAction),
    actions.register("edit.closeAllGapsOnTrack", compactTrackAction),
    // The clip menu's label swatches (spec §6.16): a color the selection already has all over comes off again.
    ...LABEL_COLORS.map((color) =>
      actions.register(`clip.label.${color}`, () => {
        const project = documentStore.getState();
        const ids = selectedClips().ids;
        setLabelColor(ids.length > 0 && ids.every((id) => project.clips[id]?.color === color) ? null : color);
      }, { enabled: hasClips }),
    ),
    actions.register("clip.label.none", () => setLabelColor(null), { enabled: hasClips }),
    actions.register("edit.rename", (context) => {
      if (context?.scope === "media") return startRename();
      // A selected track renames in its header (trackController).
      if (sessionStore.selection.getState().kind === "track") return actions.run("track.rename");
      startClipRename();
    }),
    // A selected gap that an edit moved or closed is no longer selected.
    documentStore.subscribe(
      (state) => {
        const gap = sessionStore.gap.getState();
        const current = gap ? gapAt(state, gap.trackId, gap.start) : null;
        if (gap && (current?.start !== gap.start || current.end !== gap.end)) selectGap(sessionStore, null);
        const renaming = clipRename.getState();
        if (renaming !== null && !state.clips[renaming]) clipRename.set(null);
      },
      { affects: ["clips", "tracks"] },
    ),
  ];
  return () => {
    for (const stop of stops) stop();
    clipRename.set(null);
    timelineMenu.set(null);
  };
}
