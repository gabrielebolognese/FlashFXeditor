import { closeCanvasMenu } from "../app/canvasController.js";
import { canPaste } from "../app/clipboardController.js";
import { canvasMenu } from "../app/previewController.js";
import { actions, sessionStore } from "../app/services.js";
import { useStoreSelector } from "../core/store/useStoreSelector.js";
import { ContextMenu, type ContextMenuEntry } from "../ui/ContextMenu.js";

// The preview canvas's right-click menu (spec §7.2) with the rows that exist now: Fit, Fill, Center,
// Flip H / V and Reset transform (the properties quick row's `transform.*` actions), the layer order
// (the clip to the adjacent video track), locking the layer's track and Delete. Rows dispatch command
// ids; the canvas selected the layer under the pointer first. Rendered only while open (a right-click
// is not a P1 interaction). Copy, Paste (at the playhead, as in the timeline) and Duplicate (the
// selected layers at +20 px on the track above, `canvas.duplicate`) since Batch 39.

/** The clipboard rows: Copy and Duplicate need a selected layer, Paste something copied. */
function clipboardEntries(): ContextMenuEntry[] {
  const none = sessionStore.selection.getState().kind !== "clips";
  return [
    { kind: "item", id: "clipboard.copy", label: "Copy", commandId: "clipboard.copy", disabled: none },
    { kind: "item", id: "clipboard.paste", label: "Paste", commandId: "clipboard.paste", disabled: !canPaste() },
    { kind: "item", id: "canvas.duplicate", label: "Duplicate", commandId: "edit.duplicate", disabled: none },
  ];
}

const ENTRIES: readonly ContextMenuEntry[] = [
  { kind: "separator" },
  { kind: "item", id: "transform.fit", label: "Fit" },
  { kind: "item", id: "transform.fill", label: "Fill" },
  { kind: "item", id: "transform.center", label: "Center" },
  { kind: "item", id: "transform.flipH", label: "Flip horizontal" },
  { kind: "item", id: "transform.flipV", label: "Flip vertical" },
  { kind: "item", id: "transform.reset", label: "Reset transform" },
  { kind: "separator" },
  { kind: "item", id: "canvas.bringForward", label: "Bring forward" },
  { kind: "item", id: "canvas.sendBackward", label: "Send backward" },
  { kind: "separator" },
  { kind: "item", id: "canvas.lockTrack", label: "Lock track" },
  { kind: "item", id: "edit.delete", label: "Delete", commandId: "edit.delete" },
];

const run = (id: string) => void actions.run(id);

export function CanvasContextMenu() {
  const menu = useStoreSelector(canvasMenu, (state) => state);
  if (!menu) return null;
  return <ContextMenu x={menu.x} y={menu.y} entries={[...clipboardEntries(), ...ENTRIES]} onSelect={run} onClose={closeCanvasMenu} />;
}
