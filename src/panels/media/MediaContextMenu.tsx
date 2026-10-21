import { closeMediaMenu, mediaMenu, requestRemove, startRename } from "../../app/mediaController.js";
import { actions } from "../../app/services.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import { ContextMenu, type ContextMenuEntry } from "../../ui/ContextMenu.js";

// The media context menu (spec §12): rows act on the selected media (a right-click selects the card
// first). Rendered only while open (a right-click is not a P1 interaction).
// TODO(batch 24): Generate proxy / Remove proxy, Regenerate thumbnails. TODO(batch 41): Reveal in folder, Move to bin.

const RENAME = "media.rename";
const REMOVE = "media.remove";

const ENTRIES: readonly ContextMenuEntry[] = [
  { kind: "item", id: "media.insertAtPlayhead", label: "Insert at playhead", commandId: "media.insertAtPlayhead" },
  { kind: "item", id: "media.overwriteAtPlayhead", label: "Overwrite at playhead", commandId: "media.overwriteAtPlayhead" },
  { kind: "item", id: "media.addToCanvas", label: "Add to canvas" },
  { kind: "separator" },
  // The media scope's F2 and Delete (`edit.rename`, `edit.delete`).
  { kind: "item", id: RENAME, label: "Rename", commandId: "edit.rename" },
  { kind: "item", id: REMOVE, label: "Remove", commandId: "edit.delete" },
];

function onSelect(id: string): void {
  if (id === RENAME) startRename();
  else if (id === REMOVE) requestRemove();
  else actions.run(id);
}

export function MediaContextMenu() {
  const menu = useStoreSelector(mediaMenu, (state) => state);
  if (!menu) return null;
  return <ContextMenu x={menu.x} y={menu.y} entries={ENTRIES} onSelect={onSelect} onClose={closeMediaMenu} />;
}
