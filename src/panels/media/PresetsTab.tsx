import { BookmarkPlus, FileDown, FileUp, FolderOpen, FolderSync, FolderX, Star, Subtitles, Type } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { draggingMedia, pressDragCard, takeClickAfterDrag } from "../../app/mediaGestures.js";
import {
  appliesToCaptions,
  applyPresetById,
  canWrite,
  chooseLibraryFolder,
  deletePreset,
  duplicatePresetById,
  exportPresets,
  findPreset,
  hoverPreset,
  importPresets,
  presetDragSource,
  presetLibrary,
  presetNaming,
  presetSourceClip,
  presetThumbs,
  renamePreset,
  setDefaultPreset,
  stopLibraryFolder,
  syncLibraryFolder,
  toggleApplyPosition,
  toggleFavorite,
  type LibraryFolder,
} from "../../app/presetController.js";
import { appSettings, sessionStore } from "../../app/services.js";
import type { TextPreset } from "../../core/document/types.js";
import { isEditableTarget } from "../../core/keyboard/KeyDispatcher.js";
import type { PresetScope, SessionState } from "../../core/store/sessionStore.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import { MAX_PRESET_NAME, searchPresets } from "../../text/presets.js";
import { Button } from "../../ui/Button.js";
import { ContextMenu, type ContextMenuEntry } from "../../ui/ContextMenu.js";
import { IconButton } from "../../ui/IconButton.js";
import { TextField } from "../../ui/TextField.js";
import { PresetNameField } from "./PresetNameField.js";
import styles from "./PresetsTab.module.css";

// The Presets tab (spec §10.3, §12, §17 Presets header): the text preset library. Cards show each
// preset rendered by the text engine; a click applies it to the selected text clips (or adds a text
// clip with it at the playhead), hovering previews it on them (no React render: presetController
// writes the live edit), a drag puts it on the timeline, a right-click opens its menu. The tool row
// switches between the global and the project's presets and searches them.

const selectScope = (state: SessionState) => state.mediaPanel.presetScope;
const setScope = (presetScope: PresetScope) => sessionStore.state.set((state) => ({ ...state, mediaPanel: { ...state.mediaPanel, presetScope } }));
/** Re-read on selection changes: whether a text clip is selected (Save as preset can run). */
const selectHasText = () => presetSourceClip() !== null;

/** Header actions of the Presets tab (spec §17): New from selection, Import, Export. */
export function PresetsActions() {
  const scope = useStoreSelector(sessionStore.state, selectScope);
  const count = useStoreSelector(presetLibrary, (state) => state[scope].length);
  const hasText = useStoreSelector(sessionStore.selection, selectHasText);
  return (
    <>
      <IconButton icon={BookmarkPlus} label={hasText ? "New preset from the selected text" : "New preset from the selected text: select a text clip first"} disabled={!hasText} onClick={() => presetNaming.set("tab")} />
      <IconButton icon={FileUp} label="Import presets from a JSON file" onClick={() => void importPresets()} />
      <IconButton icon={FileDown} label="Export the presets shown to a JSON file" disabled={count === 0} onClick={() => void exportPresets()} />
    </>
  );
}

/**
 * A card's thumbnail. The canvas, its preset and its size go to `presetThumbs`, which draws it in the
 * FrameScheduler loop (spec §3.4, P3) when one of them or the fonts change; nothing is drawn here.
 */
function PresetThumb({ preset }: { preset: TextPreset }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    // The observer reports the size once at the start, then on every change (P9: no layout reads here).
    const observer = new ResizeObserver(([entry]) => {
      if (entry) presetThumbs.resize(canvas, entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      presetThumbs.detach(canvas);
    };
  }, []);
  useEffect(() => {
    if (ref.current) presetThumbs.show(ref.current, preset);
  }, [preset]);
  return <canvas ref={ref} className={styles.canvas} aria-hidden="true" />;
}

function RenameInput({ preset, onDone }: { preset: TextPreset; onDone: () => void }) {
  const done = useRef(false);
  const finish = (name: string | null) => {
    if (done.current) return;
    done.current = true;
    if (name !== null) renamePreset(preset.id, name);
    onDone();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") finish(event.currentTarget.value);
    else if (event.key === "Escape") {
      event.stopPropagation();
      finish(null);
    }
  };
  return (
    <input
      className={styles.renameInput}
      defaultValue={preset.name}
      maxLength={MAX_PRESET_NAME}
      aria-label="Preset name"
      spellCheck={false}
      autoFocus
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={onKeyDown}
      onBlur={(event) => finish(event.currentTarget.value)}
      // Presses and clicks inside the field must not apply or drag the card.
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    />
  );
}

const CARD_HINT = "Click: apply to the selected text, or add at the playhead. Drag onto the timeline. Right-click for more.";

const PresetCard = memo(function PresetCard({ preset, defaultTitle, defaultSubtitle, renaming, onRenamed }: { preset: TextPreset; defaultTitle: boolean; defaultSubtitle: boolean; renaming: boolean; onRenamed: () => void }) {
  return (
    <div className={styles.card} data-preset-id={preset.id} role="option" aria-selected="false" aria-label={preset.name} data-tooltip={renaming ? undefined : `${preset.name}. ${CARD_HINT}`}>
      <div className={styles.thumb}>
        <PresetThumb preset={preset} />
        {(preset.favorite || defaultTitle || defaultSubtitle) && (
          <span className={styles.badges}>
            {preset.favorite && (
              <span className={styles.badge} aria-label="Favorite">
                <Star className={styles.badgeIcon} aria-hidden="true" />
              </span>
            )}
            {defaultTitle && (
              <span className={styles.badge} aria-label="Default title">
                <Type className={styles.badgeIcon} aria-hidden="true" />
              </span>
            )}
            {defaultSubtitle && (
              <span className={styles.badge} aria-label="Default subtitle">
                <Subtitles className={styles.badgeIcon} aria-hidden="true" />
              </span>
            )}
          </span>
        )}
      </div>
      <div className={styles.info}>{renaming ? <RenameInput preset={preset} onDone={onRenamed} /> : <span className={styles.name}>{preset.name}</span>}</div>
    </div>
  );
});

const MENU = {
  apply: "preset.apply",
  defaultTitle: "preset.defaultTitle",
  defaultSubtitle: "preset.defaultSubtitle",
  favorite: "preset.favorite",
  applyPosition: "preset.applyPosition",
  rename: "preset.rename",
  duplicate: "preset.duplicate",
  export: "preset.export",
  delete: "preset.delete",
} as const;

/** The card menu (spec §10.3 "Right-click card"). */
function menuEntries(preset: TextPreset, writable: boolean, defaults: { title: string | null; subtitle: string | null }): ContextMenuEntry[] {
  return [
    { kind: "item", id: MENU.apply, label: presetSourceClip() ? "Apply to selected text" : appliesToCaptions() ? "Apply to captions" : "Add at playhead" },
    { kind: "separator" },
    { kind: "item", id: MENU.defaultTitle, label: "Use as default title", commandId: "add.title", active: defaults.title === preset.id },
    { kind: "item", id: MENU.defaultSubtitle, label: "Use as default subtitle", commandId: "add.subtitle", active: defaults.subtitle === preset.id },
    { kind: "item", id: MENU.favorite, label: "Favorite: chip in the timeline toolbar", active: preset.favorite, disabled: !writable },
    { kind: "item", id: MENU.applyPosition, label: "Apply position", active: preset.applyPosition, disabled: !writable },
    { kind: "separator" },
    { kind: "item", id: MENU.rename, label: "Rename", disabled: !writable },
    { kind: "item", id: MENU.duplicate, label: "Duplicate", disabled: !writable },
    { kind: "item", id: MENU.export, label: "Export…" },
    { kind: "item", id: MENU.delete, label: "Delete", disabled: !writable },
  ];
}

const FOLDER_TEXT: Record<LibraryFolder["status"], (folder: LibraryFolder) => string> = {
  syncing: (folder) => `Syncing with ${folder.name}…`,
  synced: (folder) => `Library folder: ${folder.name}${folder.message ? ` (${folder.message})` : ""}`,
  permission: (folder) => `Library folder: ${folder.name}. Click Sync to allow access.`,
  error: (folder) => `${folder.name}: ${folder.message ?? "cannot sync"}`,
};

/** The library folder strip (spec §10.3): the global presets are kept in a folder of JSON files too. */
function FolderStrip() {
  const folder = useStoreSelector(presetLibrary, (state) => state.folder);
  return (
    <div className={styles.folder}>
      <FolderOpen className={styles.folderIcon} aria-hidden="true" />
      {folder ? (
        <>
          <span className={styles.folderText} data-status={folder.status} title={FOLDER_TEXT[folder.status](folder)}>
            {FOLDER_TEXT[folder.status](folder)}
          </span>
          <IconButton icon={FolderSync} label="Sync the global presets with the library folder" disabled={folder.status === "syncing"} onClick={() => void syncLibraryFolder()} />
          <IconButton icon={FolderX} label="Stop syncing (the folder keeps its files)" onClick={() => void stopLibraryFolder()} />
        </>
      ) : (
        <>
          <span className={styles.folderText}>Global presets live in this browser.</span>
          <Button size="compact" tooltip="Keep the global presets in a folder too (JSON files), e.g. a synced drive" onClick={() => void chooseLibraryFolder()}>
            Library folder
          </Button>
        </>
      )}
    </div>
  );
}

/** The Presets tab body. */
export function PresetsTab() {
  const scope = useStoreSelector(sessionStore.state, selectScope);
  const presets = useStoreSelector(presetLibrary, (state) => state[scope]);
  const loaded = useStoreSelector(presetLibrary, (state) => state.loaded);
  const projectOpen = useStoreSelector(presetLibrary, (state) => state.projectOpen);
  const writable = useStoreSelector(presetLibrary, (state) => scope === "global" || (state.projectOpen && state.projectWritable));
  const naming = useStoreSelector(presetNaming, (where) => where === "tab");
  const defaultTitle = useStoreSelector(appSettings, (settings) => settings.defaultTitlePreset);
  const defaultSubtitle = useStoreSelector(appSettings, (settings) => settings.defaultSubtitlePreset);
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const shown = useMemo(() => searchPresets(presets, query), [presets, query]);
  const endRename = useMemo(() => () => setRenaming(null), []);

  // Leaving the tab ends a hover preview and a name field.
  useEffect(
    () => () => {
      hoverPreset(null);
      if (presetNaming.getState() === "tab") presetNaming.set(null);
    },
    [],
  );

  const cardId = (target: EventTarget | null) => (target instanceof Element ? (target.closest<HTMLElement>("[data-preset-id]")?.dataset.presetId ?? null) : null);

  // Event delegation: cards stay dumb and keep their memoized props.
  const onClick = (event: MouseEvent) => {
    // The release of a drag out of the panel is no click.
    if (takeClickAfterDrag()) return;
    const id = cardId(event.target);
    if (id && id !== renaming) applyPresetById(id);
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || isEditableTarget(event.target)) return;
    const id = cardId(event.target);
    if (id) pressDragCard(event.nativeEvent, event.currentTarget, presetDragSource(id));
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!draggingMedia()) hoverPreset(cardId(event.target));
  };
  const onContextMenu = (event: MouseEvent) => {
    const id = cardId(event.target);
    if (!id || isEditableTarget(event.target)) return;
    event.preventDefault();
    hoverPreset(null);
    setMenu({ id, x: event.clientX, y: event.clientY });
  };

  const onMenu = (action: string) => {
    const id = menu?.id;
    const preset = id ? findPreset(id)?.preset : null;
    if (!id || !preset) return;
    switch (action) {
      case MENU.apply:
        applyPresetById(id);
        break;
      case MENU.defaultTitle:
        setDefaultPreset("title", defaultTitle === id ? null : id);
        break;
      case MENU.defaultSubtitle:
        setDefaultPreset("subtitle", defaultSubtitle === id ? null : id);
        break;
      case MENU.favorite:
        toggleFavorite(id);
        break;
      case MENU.applyPosition:
        toggleApplyPosition(id);
        break;
      case MENU.rename:
        setRenaming(id);
        break;
      case MENU.duplicate:
        duplicatePresetById(id);
        break;
      case MENU.export:
        void exportPresets(id);
        break;
      case MENU.delete:
        deletePreset(id);
        break;
    }
  };
  const menuPreset = menu ? presets.find((preset) => preset.id === menu.id) : undefined;

  const empty =
    scope === "project" && !projectOpen
      ? "Open a project to keep presets in it."
      : !loaded
        ? "Loading presets…"
        : presets.length === 0
          ? "No presets yet. Select a text clip and click Save as preset."
          : shown.length === 0
            ? "No preset matches the search."
            : null;

  return (
    <div className={styles.root}>
      <div className={styles.tools}>
        <div className={styles.scope} role="group" aria-label="Presets shown">
          {(["global", "project"] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={styles.scopeChip}
              aria-pressed={scope === value}
              data-tooltip={value === "global" ? "Global presets: in every project" : "This project's presets (presets/text in its folder)"}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setScope(value)}
            >
              {value === "global" ? "Global" : "Project"}
            </button>
          ))}
        </div>
        <div className={styles.search}>
          <TextField value={query} onChange={setQuery} ariaLabel="Search presets" placeholder="Search presets" />
        </div>
      </div>
      {naming && (
        <div className={styles.nameRow}>
          <PresetNameField />
        </div>
      )}
      <div className={styles.scroll} role="listbox" aria-label="Text presets" onClick={onClick} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerLeave={() => hoverPreset(null)} onContextMenu={onContextMenu} onScroll={() => hoverPreset(null)}>
        {empty ? (
          <p className={styles.empty}>{empty}</p>
        ) : (
          <div className={styles.grid}>
            {shown.map((preset) => (
              <PresetCard key={preset.id} preset={preset} defaultTitle={defaultTitle === preset.id} defaultSubtitle={defaultSubtitle === preset.id} renaming={renaming === preset.id} onRenamed={endRename} />
            ))}
          </div>
        )}
      </div>
      {scope === "project" && projectOpen && !writable && <p className={styles.empty}>This project is read-only: its presets cannot change.</p>}
      {scope === "global" && <FolderStrip />}
      {menu && menuPreset && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          entries={menuEntries(menuPreset, canWrite(scope), { title: defaultTitle, subtitle: defaultSubtitle })}
          onSelect={onMenu}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}