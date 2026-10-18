import { AudioLines, Film, Folder, Image, Library, type LucideIcon } from "lucide-react";
import { useEffect, useRef, type KeyboardEvent, type MouseEvent } from "react";
import { binMenu, closeBinMenu, finishBinRename, mediaPanel, openBinMenu } from "../../app/mediaController.js";
import { actions, documentStore, sessionStore } from "../../app/services.js";
import { MAX_BIN_NAME } from "../../core/commands/mediaCommands.js";
import type { Bin, Project } from "../../core/document/types.js";
import type { VirtualBin } from "../../core/store/sessionStore.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import { ContextMenu, type ContextMenuEntry } from "../../ui/ContextMenu.js";
import { binCounts, shownBin } from "./mediaList.js";
import styles from "./MediaTab.module.css";

// The bin strip of the Media tab (spec §12, Batch 41): a left column of chips, the virtual bins (All,
// Video, Audio, Images) then the project's bins (one level), each with its count. A click shows a bin;
// a bin's chip renames on double-click, has a menu (Rename, Delete bin) and takes media dropped on it
// (`data-bin-drop`, read by the media drag). The chips are the strip's own controls (`data-control`).

const VIRTUAL: readonly { id: VirtualBin; label: string; icon: LucideIcon; tooltip: string }[] = [
  { id: "all", label: "All", icon: Library, tooltip: "Every media of the project" },
  { id: "video", label: "Video", icon: Film, tooltip: "The videos, whatever their bin" },
  { id: "audio", label: "Audio", icon: AudioLines, tooltip: "The audio files, whatever their bin" },
  { id: "image", label: "Images", icon: Image, tooltip: "The images, whatever their bin" },
];

const selectBins = (project: Project) => project.bins;
/** Counts as a string: media edits that do not change them do not re-render the strip. */
const selectCounts = (project: Project) => [...binCounts(Object.values(project.media))].map(([id, n]) => `${id}:${n}`).join(",");
const keep = (event: MouseEvent) => event.preventDefault();
const MEDIA_CONTEXT = { scope: "media", phase: "down", repeat: false } as const;

interface BinRowProps {
  id: string;
  label: string;
  icon: LucideIcon;
  count: number;
  active: boolean;
  drop: boolean;
  tooltip?: string | undefined;
}

function BinRow({ id, label, icon: Icon, count, active, drop, tooltip }: BinRowProps) {
  const onContextMenu = (event: MouseEvent) => {
    if (!drop) return;
    event.preventDefault();
    openBinMenu(id, event.clientX, event.clientY);
  };
  return (
    <button
      type="button"
      className={styles.binRow}
      aria-pressed={active}
      data-bin-drop={drop ? id : undefined}
      data-command="media.showBin"
      data-tooltip={drop ? `${label}: drop media here, double-click to rename` : tooltip}
      onMouseDown={keep}
      onClick={() => void actions.run("media.showBin", MEDIA_CONTEXT, id)}
      onDoubleClick={drop ? () => void actions.run("media.renameBin", MEDIA_CONTEXT, id) : undefined}
      onContextMenu={onContextMenu}
    >
      <Icon className={styles.binIcon} aria-hidden="true" />
      <span className={styles.binName}>{label}</span>
      <span className={styles.binCount}>{count}</span>
    </button>
  );
}

/**
 * A bin's inline rename: Enter, blur or a press anywhere else commits (one undoable command; the
 * strip's chips and the panel's buttons keep the focus where it is, so the input would not blur),
 * Escape cancels. Ended with Enter or Escape, the bin's chip takes the focus (Batch 46: it would fall
 * to the page with the field).
 */
function BinRename({ bin }: { bin: Bin }) {
  const done = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const finish = (value: string | null, refocus = false) => {
    if (done.current) return;
    done.current = true;
    const strip = refocus ? input.current?.closest("nav") : null;
    finishBinRename(bin.id, value);
    // After the strip renders the chip again.
    if (strip) requestAnimationFrame(() => strip.querySelector<HTMLElement>(`[data-bin-drop="${CSS.escape(bin.id)}"]`)?.focus());
  };
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const field = input.current;
      if (field && !field.contains(event.target as Node)) field.blur();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, []);
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") finish(event.currentTarget.value, true);
    else if (event.key === "Escape") finish(null, true);
  };
  return (
    <input
      ref={input}
      className={styles.binInput}
      defaultValue={bin.name}
      maxLength={MAX_BIN_NAME}
      aria-label="Bin name"
      spellCheck={false}
      autoFocus
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={onKeyDown}
      onBlur={(event) => finish(event.currentTarget.value)}
    />
  );
}

export function BinStrip() {
  const bins = useStoreSelector(documentStore, selectBins);
  const countKey = useStoreSelector(documentStore, selectCounts);
  const shown = useStoreSelector(sessionStore.state, (state) => state.mediaPanel.bin);
  const renaming = useStoreSelector(mediaPanel, (state) => state.renamingBin);
  const counts = new Map(countKey ? countKey.split(",").map((entry) => [entry.slice(0, entry.lastIndexOf(":")), Number(entry.slice(entry.lastIndexOf(":") + 1))] as const) : []);
  const active = shownBin(shown, bins);
  return (
    <nav className={styles.bins} aria-label="Bins" data-control="">
      {VIRTUAL.map((bin) => (
        <BinRow key={bin.id} id={bin.id} label={bin.label} icon={bin.icon} tooltip={bin.tooltip} count={counts.get(bin.id) ?? 0} active={active === bin.id} drop={false} />
      ))}
      {bins.length > 0 && <div className={styles.binSeparator} role="separator" />}
      {bins.map((bin) => (renaming === bin.id ? <BinRename key={bin.id} bin={bin} /> : <BinRow key={bin.id} id={bin.id} label={bin.name} icon={Folder} count={counts.get(bin.id) ?? 0} active={active === bin.id} drop />))}
    </nav>
  );
}

const BIN_ENTRIES: readonly ContextMenuEntry[] = [
  { kind: "item", id: "media.renameBin", label: "Rename" },
  { kind: "item", id: "media.deleteBin", label: "Delete bin" },
];

/** A bin chip's menu: its commands run with the bin's id. */
export function BinMenu() {
  const menu = useStoreSelector(binMenu, (state) => state);
  if (!menu) return null;
  return <ContextMenu x={menu.x} y={menu.y} entries={BIN_ENTRIES} onSelect={(id) => void actions.run(id, MEDIA_CONTEXT, menu.binId)} onClose={closeBinMenu} />;
}
