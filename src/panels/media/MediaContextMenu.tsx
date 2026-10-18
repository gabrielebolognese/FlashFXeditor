import { closeMediaMenu, mediaMenu, mediaPanel, NO_BIN } from "../../app/mediaController.js";
import { mediaStatus } from "../../app/mediaOffline.js";
import { actions, documentStore } from "../../app/services.js";
import type { Bin, MediaId, MediaItem, Project } from "../../core/document/types.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import type { MediaStatus } from "../../project/mediaSources.js";
import { ContextMenu, type ContextMenuEntry } from "../../ui/ContextMenu.js";

// The media context menu (spec §12): rows act on the selected media (a right-click selects the card
// first). Rendered only while open (a right-click is not a P1 interaction). The proxy rows (spec §9.5)
// are enabled when one of the selected videos can use them: Generate proxy for those without a ready
// or running one, Remove proxy (which also cancels a running one) for those with one.
// Rows are command ids; Rename and Remove are the media scope's F2 and Delete (`edit.rename`,
// `edit.delete`), run as the panel's keys would. Batch 41: Relink… / Relink folder… / Allow access for
// offline media, Reveal in folder (the path, copied), and Move to bin (a chip per bin and None: the
// `media.moveToBin` command with the bin as its argument).

const MEDIA_CONTEXT = { scope: "media", phase: "down", repeat: false } as const;

const selectMedia = (project: Project) => project.media;
const selectBins = (project: Project) => project.bins;
/** A Move to bin chip's id: the command and the bin (or None). */
const BIN_CHIP = "media.moveToBin:";

function entries(media: Record<MediaId, MediaItem>, ids: ReadonlySet<MediaId>, bins: readonly Bin[], status: ReadonlyMap<MediaId, MediaStatus>): ContextMenuEntry[] {
  const videos = [...ids].map((id) => media[id]).filter((item): item is MediaItem => item?.kind === "video");
  const canGenerate = videos.some((item) => item.proxy?.status !== "pending" && item.proxy?.status !== "ready");
  const canRemove = videos.some((item) => item.proxy !== undefined && item.proxy.status !== "none");
  const offline = [...ids].map((id) => status.get(id)).filter((value): value is MediaStatus => value !== undefined);
  const binOf = new Set([...ids].map((id) => media[id]?.binId ?? NO_BIN));
  const current = binOf.size === 1 ? [...binOf][0] : null;
  const offlineRows: ContextMenuEntry[] =
    offline.length > 0
      ? [
          ...(offline.includes("permission") ? [{ kind: "item", id: "media.allowAccess", label: "Allow access" } as const] : []),
          { kind: "item", id: "media.relink", label: "Relink…", disabled: offline.every((value) => value === "permission") },
          { kind: "item", id: "media.relinkFolder", label: "Relink from folder…" },
          { kind: "separator" },
        ]
      : [];
  const binRow: ContextMenuEntry[] =
    bins.length > 0
      ? [
          {
            kind: "choices",
            id: "media.moveToBin",
            label: "Move to bin",
            choices: [{ id: NO_BIN, name: "None" }, ...bins.map((bin) => ({ id: bin.id, name: bin.name }))].map((bin) => ({
              id: `${BIN_CHIP}${bin.id}`,
              label: bin.name,
              command: "media.moveToBin",
              disabled: bin.id === current,
              tooltip: bin.id === NO_BIN ? "Out of every bin" : `Move to ${bin.name}`,
            })),
          },
        ]
      : [];
  return [
    ...offlineRows,
    { kind: "item", id: "media.insertAtPlayhead", label: "Insert at playhead", commandId: "media.insertAtPlayhead" },
    { kind: "item", id: "media.overwriteAtPlayhead", label: "Overwrite at playhead", commandId: "media.overwriteAtPlayhead" },
    { kind: "item", id: "media.addToCanvas", label: "Add to canvas" },
    { kind: "separator" },
    { kind: "item", id: "media.generateProxy", label: "Generate proxy", disabled: !canGenerate },
    { kind: "item", id: "media.removeProxy", label: "Remove proxy", disabled: !canRemove },
    { kind: "item", id: "media.regenerateThumbnails", label: "Regenerate thumbnails", disabled: videos.length === 0 },
    { kind: "separator" },
    { kind: "item", id: "media.revealPath", label: "Reveal in folder" },
    ...binRow,
    { kind: "item", id: "edit.rename", label: "Rename" },
    { kind: "item", id: "edit.delete", label: "Remove" },
  ];
}

function onSelect(id: string): void {
  if (id.startsWith(BIN_CHIP)) actions.run("media.moveToBin", MEDIA_CONTEXT, id.slice(BIN_CHIP.length));
  else actions.run(id, MEDIA_CONTEXT);
}

function OpenMenu({ x, y }: { x: number; y: number }) {
  const media = useStoreSelector(documentStore, selectMedia);
  const bins = useStoreSelector(documentStore, selectBins);
  const status = useStoreSelector(mediaStatus, (state) => state);
  const ids = useStoreSelector(mediaPanel, (state) => state.selection.ids);
  return <ContextMenu x={x} y={y} entries={entries(media, ids, bins, status)} onSelect={onSelect} onClose={closeMediaMenu} />;
}

export function MediaContextMenu() {
  const menu = useStoreSelector(mediaMenu, (state) => state);
  if (!menu) return null;
  return <OpenMenu x={menu.x} y={menu.y} />;
}
