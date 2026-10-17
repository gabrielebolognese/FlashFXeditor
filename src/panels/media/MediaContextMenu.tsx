import { closeMediaMenu, mediaMenu, mediaPanel } from "../../app/mediaController.js";
import { actions, documentStore } from "../../app/services.js";
import type { MediaId, MediaItem, Project } from "../../core/document/types.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import { ContextMenu, type ContextMenuEntry } from "../../ui/ContextMenu.js";

// The media context menu (spec §12): rows act on the selected media (a right-click selects the card
// first). Rendered only while open (a right-click is not a P1 interaction). The proxy rows (spec §9.5)
// are enabled when one of the selected videos can use them: Generate proxy for those without a ready
// or running one, Remove proxy (which also cancels a running one) for those with one.
// Rows are command ids; Rename and Remove are the media scope's F2 and Delete (`edit.rename`,
// `edit.delete`), run as the panel's keys would.
// TODO(batch 41): Reveal in folder, Move to bin.

const MEDIA_CONTEXT = { scope: "media", phase: "down", repeat: false } as const;

const selectMedia = (project: Project) => project.media;

function entries(media: Record<MediaId, MediaItem>, ids: ReadonlySet<MediaId>): ContextMenuEntry[] {
  const videos = [...ids].map((id) => media[id]).filter((item): item is MediaItem => item?.kind === "video");
  const canGenerate = videos.some((item) => item.proxy?.status !== "pending" && item.proxy?.status !== "ready");
  const canRemove = videos.some((item) => item.proxy !== undefined && item.proxy.status !== "none");
  return [
    { kind: "item", id: "media.insertAtPlayhead", label: "Insert at playhead", commandId: "media.insertAtPlayhead" },
    { kind: "item", id: "media.overwriteAtPlayhead", label: "Overwrite at playhead", commandId: "media.overwriteAtPlayhead" },
    { kind: "item", id: "media.addToCanvas", label: "Add to canvas" },
    { kind: "separator" },
    { kind: "item", id: "media.generateProxy", label: "Generate proxy", disabled: !canGenerate },
    { kind: "item", id: "media.removeProxy", label: "Remove proxy", disabled: !canRemove },
    { kind: "item", id: "media.regenerateThumbnails", label: "Regenerate thumbnails", disabled: videos.length === 0 },
    { kind: "separator" },
    { kind: "item", id: "edit.rename", label: "Rename" },
    { kind: "item", id: "edit.delete", label: "Remove" },
  ];
}

function onSelect(id: string): void {
  actions.run(id, MEDIA_CONTEXT);
}

function OpenMenu({ x, y }: { x: number; y: number }) {
  const media = useStoreSelector(documentStore, selectMedia);
  const ids = useStoreSelector(mediaPanel, (state) => state.selection.ids);
  return <ContextMenu x={x} y={y} entries={entries(media, ids)} onSelect={onSelect} onClose={closeMediaMenu} />;
}

export function MediaContextMenu() {
  const menu = useStoreSelector(mediaMenu, (state) => state);
  if (!menu) return null;
  return <OpenMenu x={menu.x} y={menu.y} />;
}
