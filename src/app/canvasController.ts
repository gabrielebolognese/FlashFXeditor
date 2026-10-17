// Canvas actions (spec §7.2, §7.3, §18): arrow nudges of the selected layers (1 px, Shift 10 px; with
// no layer to nudge the arrows step frames, the global binding), and the canvas context menu's rows:
// Bring forward / Send backward (the clip to the adjacent video track, one created if needed), Lock
// track. Fit, Fill, Center, Flip H / V and Reset transform are the properties quick row's actions
// (`transform.*`, propertiesController); Delete is `edit.delete`. Esc cancels a canvas or timeline
// gesture, else ends inline text editing (committed: focus in the properties panel while editing),
// else leaves crop mode, else the fullscreen preview. Each edit is one command (nudges coalesce,
// spec §7.3). Copy, Paste and Duplicate (+20 px) are the clipboard controller's (Batch 39).
import type { CommandRun } from "../core/commands/CommandRegistry.js";
import type { ClipId } from "../core/document/types.js";
import { arrangeLayers, type ArrangeDirection } from "../timeline/edit/arrange.js";
import { nudgeLayers } from "../timeline/edit/transform.js";
import { exitFullscreen } from "./fullscreen.js";
import { canvasInput, canvasMenu, textEditor } from "./previewController.js";
import { actions, documentStore, focusScopes, sessionStore } from "./services.js";
import { cancelRemoveSilence } from "./silenceController.js";
import { timelineView } from "./timelineController.js";
import { setTracksFlag } from "./trackController.js";

const newId = () => crypto.randomUUID();

/** The selected layers at the playhead (on visible, unlocked video tracks): what the canvas actions take. */
function selectedLayerIds(): ClipId[] {
  return canvasInput.selectedLayers().map((layer) => layer.clipId);
}

/** Arrow keys in the preview (spec §7.3): declined (frame step) when no layer is selected on the canvas. */
function nudge(dx: number, dy: number): CommandRun {
  return () => {
    if (canvasInput.active) return true;
    const ids = selectedLayerIds();
    if (ids.length === 0) return false;
    const command = nudgeLayers(documentStore.getState(), ids, dx, dy, sessionStore.state.getState().playhead);
    if (command) documentStore.dispatch(command);
    return true;
  };
}

function arrange(direction: ArrangeDirection): void {
  const command = arrangeLayers(documentStore.getState(), selectedLayerIds(), direction, newId);
  if (command) documentStore.dispatch(command);
}

/** Locks the tracks of the selected layers (their clips leave the selection, as from the header). */
function lockTracks(): void {
  const project = documentStore.getState();
  const trackIds = [...new Set(selectedLayerIds().map((id) => project.clips[id]?.trackId))].filter((id) => id !== undefined);
  if (trackIds.length > 0) setTracksFlag(trackIds, "locked", true);
}

/** The menu closed: the keyboard goes back to the preview (the menu owned it as a dialog). */
export function closeCanvasMenu(): void {
  if (!canvasMenu.getState()) return;
  canvasMenu.set(null);
  focusScopes.set("preview");
}

/** Registers the canvas actions. Returns a stop function. */
export function installCanvasController(): () => void {
  const stops = [
    actions.register("canvas.nudgeLeft", nudge(-1, 0)),
    actions.register("canvas.nudgeRight", nudge(1, 0)),
    actions.register("canvas.nudgeUp", nudge(0, -1)),
    actions.register("canvas.nudgeDown", nudge(0, 1)),
    actions.register("canvas.nudgeLeft10", nudge(-10, 0)),
    actions.register("canvas.nudgeRight10", nudge(10, 0)),
    actions.register("canvas.nudgeUp10", nudge(0, -10)),
    actions.register("canvas.nudgeDown10", nudge(0, 10)),
    actions.register("canvas.bringForward", () => arrange("forward")),
    actions.register("canvas.sendBackward", () => arrange("backward")),
    actions.register("canvas.lockTrack", lockTracks),
    // Esc (spec §18 "Cancel gesture"): cancels a timeline or canvas gesture, else ends inline text
    // editing (§7.7), else leaves crop mode (Batch 26), else closes Remove silence's row (Batch 38),
    // else the fullscreen preview (§7.8); declined when none, so popovers and the browser get it.
    actions.register("app.cancel", () => timelineView.cancelGesture() || canvasInput.cancel() || textEditor.end(true) || canvasInput.exitCropMode() || cancelRemoveSilence() || exitFullscreen()),
  ];
  return () => {
    for (const stop of stops) stop();
    canvasMenu.set(null);
  };
}
