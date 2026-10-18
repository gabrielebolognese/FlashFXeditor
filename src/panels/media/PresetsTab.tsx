import { BookmarkPlus, FileDown, FilePlus2, FileUp, FolderOpen, FolderSync, FolderX, LoaderCircle, RotateCcw, SearchX, Star, Subtitles, Type } from "lucide-react";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type FocusEvent, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { draggingMedia, pressDragCard, takeClickAfterDrag } from "../../app/mediaGestures.js";
import {
  applyPresetById,
  canWrite,
  hoverPreset,
  presetDragSource,
  presetLibrary,
  presetNaming,
  presetRenaming,
  presetSourceClip,
  presetTagging,
  presetThumbs,
  renamePreset,
  setPresetTags,
  type LibraryFolder,
} from "../../app/presetController.js";
import { actions, appSettings, sessionStore, themeBridge } from "../../app/services.js";
import { addFontFiles, dragHasFiles, droppedFontFiles } from "../../app/userFontsController.js";
import type { TextPreset } from "../../core/document/types.js";
import { isEditableTarget } from "../../core/keyboard/KeyDispatcher.js";
import type { PresetScope, SessionState } from "../../core/store/sessionStore.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import { MAX_PRESET_NAME, MAX_PRESET_TAGS, MAX_TAG_LENGTH, searchPresets } from "../../text/presets.js";
import { Button } from "../../ui/Button.js";
import { ContextMenu } from "../../ui/ContextMenu.js";
import { EmptyState } from "../../ui/EmptyState.js";
import { IconButton } from "../../ui/IconButton.js";
import { TextField } from "../../ui/TextField.js";
import { gridColumns, pressWithoutFocus, setTabStop, stepIndex } from "./listNavigation.js";
import { PresetNameField } from "./PresetNameField.js";
import { presetMenuEntries } from "./presetMenu.js";
import styles from "./PresetsTab.module.css";

// The Presets tab (spec §10.3, §12, §17 Presets header): the text preset library. Cards show each
// preset rendered by the text engine; a click applies it to the selected text clips (or adds a text
// clip with it at the playhead), hovering previews it on them (no React render: presetController
// writes the live edit), a drag puts it on the timeline, a right-click opens its menu. The tool row
// switches between the global and the project's presets and searches them. Batch 46: the cards are one
// Tab stop, the arrows move between them, Enter or Space applies the focused one (a click's action).
// Batch 52: the thumbnails are the preset bar's (bitmaps of the sample text), and a card's tags (its
// preset bar user sets) are edited in place like its name.

const selectScope = (state: SessionState) => state.mediaPanel.presetScope;
const scopeCommand = (scope: PresetScope) => (scope === "global" ? "presets.showGlobal" : "presets.showProject");
/** Re-read on selection changes: whether a text clip is selected (Save as preset can run). */
const selectHasText = () => presetSourceClip() !== null;

/** Header actions of the Presets tab (spec §17): New from selection, Import, Export. */
export function PresetsActions() {
  const scope = useStoreSelector(sessionStore.state, selectScope);
  const count = useStoreSelector(presetLibrary, (state) => state[scope].length);
  const hasText = useStoreSelector(sessionStore.selection, selectHasText);
  return (
    <>
      <IconButton icon={BookmarkPlus} label={hasText ? "New preset from the selected text" : "New preset from the selected text: select a text clip first"} commandId="preset.save" disabled={!hasText} />
      <IconButton icon={FileUp} label="Import presets from a JSON file" commandId="presets.import" />
      <IconButton icon={FileDown} label={count > 0 ? "Export the presets shown to a JSON file" : "Export the presets shown: there are none"} commandId="presets.export" disabled={count === 0} />
    </>
  );
}

/**
 * A card's thumbnail. The canvas, its preset and its size go to `presetThumbs`, which draws it in the
 * FrameScheduler loop (spec §3.4, P3) when one of them or its bitmap changes; nothing is drawn here.
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
    if (ref.current) presetThumbs.show(ref.current, preset, themeBridge.theme.space[2]);
  }, [preset]);
  return <canvas ref={ref} className={styles.canvas} aria-hidden="true" />;
}

/** The card's inline field: its name (Rename) or its tags as a comma-separated list (Tags…, Batch 52). */
function CardField({ preset, field, onDone }: { preset: TextPreset; field: "name" | "tags"; onDone: () => void }) {
  const done = useRef(false);
  const finish = (value: string | null) => {
    if (done.current) return;
    done.current = true;
    if (value !== null) {
      if (field === "name") renamePreset(preset.id, value);
      else setPresetTags(preset.id, value);
    }
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
      defaultValue={field === "name" ? preset.name : preset.tags.join(", ")}
      maxLength={field === "name" ? MAX_PRESET_NAME : MAX_PRESET_TAGS * (MAX_TAG_LENGTH + 2)}
      aria-label={field === "name" ? "Preset name" : "Preset tags, separated by commas"}
      placeholder={field === "tags" ? "Tags, separated by commas" : undefined}
      data-tooltip={field === "tags" ? "Each tag is a set of the preset bar. Enter saves, Esc cancels." : undefined}
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

const PresetCard = memo(function PresetCard({
  preset,
  defaultTitle,
  defaultSubtitle,
  editing,
  onEdited,
}: {
  preset: TextPreset;
  defaultTitle: boolean;
  defaultSubtitle: boolean;
  /** Its name or tags field is open. */
  editing: "name" | "tags" | null;
  onEdited: () => void;
}) {
  return (
    <div className={styles.card} data-preset-id={preset.id} role="option" aria-selected="false" aria-label={preset.name} tabIndex={-1} data-tooltip={editing ? undefined : `${preset.name}. ${CARD_HINT}`}>
      <div className={styles.thumb}>
        <PresetThumb preset={preset} />
        {/* Each badge has its own tooltip (the card's is the nearest one otherwise). */}
        {(preset.favorite || defaultTitle || defaultSubtitle) && (
          <span className={styles.badges}>
            {preset.favorite && (
              <span className={styles.badge} aria-label="Favorite" data-tooltip="Favorite: in the preset bar's Favorites">
                <Star className={styles.badgeIcon} aria-hidden="true" />
              </span>
            )}
            {defaultTitle && (
              <span className={styles.badge} aria-label="Default title" data-tooltip="The default title: Add title uses it" data-command="add.title">
                <Type className={styles.badgeIcon} aria-hidden="true" />
              </span>
            )}
            {defaultSubtitle && (
              <span className={styles.badge} aria-label="Default subtitle" data-tooltip="The default subtitle: Add subtitle uses it" data-command="add.subtitle">
                <Subtitles className={styles.badgeIcon} aria-hidden="true" />
              </span>
            )}
          </span>
        )}
      </div>
      <div className={styles.info}>{editing ? <CardField preset={preset} field={editing} onDone={onEdited} /> : <span className={styles.name}>{preset.name}</span>}</div>
    </div>
  );
});

const FOLDER_TEXT: Record<LibraryFolder["status"], (folder: LibraryFolder) => string> = {
  syncing: (folder) => `Syncing with ${folder.name}…`,
  synced: (folder) => `Library folder: ${folder.name}${folder.message ? ` (${folder.message})` : ""}`,
  permission: (folder) => `Library folder: ${folder.name}. Click Sync to allow access.`,
  error: (folder) => `${folder.name}: ${folder.message ?? "cannot sync"}`,
};

/** Where the presets the Project scope shows are kept, or why they cannot change. */
function projectText(projectOpen: boolean, writable: boolean): string {
  if (!projectOpen) return "No project is open: its presets show here.";
  return writable ? "This project's presets, kept in its folder (presets/text)." : "This project is read-only: its presets cannot change.";
}

/** Why the folder strip's buttons are disabled in the Project scope. */
const ONLY_GLOBAL = "the library folder keeps the global presets (show Global)";

/**
 * The library folder strip (spec §10.3): the global presets are kept in a folder of JSON files too. In
 * both scopes and every state it holds the same buttons (Batch 46: nothing shifts), disabled with the
 * reason when they do not apply: the Project scope, no folder chosen, a sync running.
 */
function FolderStrip({ scope, projectOpen, writable }: { scope: PresetScope; projectOpen: boolean; writable: boolean }) {
  const folder = useStoreSelector(presetLibrary, (state) => state.folder);
  const global = scope === "global";
  const text = !global ? projectText(projectOpen, writable) : folder ? FOLDER_TEXT[folder.status](folder) : "Global presets live in this browser.";
  const syncLabel = !global
    ? `Sync: ${ONLY_GLOBAL}`
    : !folder
      ? "Sync the library folder: choose one first"
      : folder.status === "syncing"
        ? "Syncing with the library folder…"
        : "Sync the global presets with the library folder";
  const stopLabel = !global ? `Stop syncing: ${ONLY_GLOBAL}` : !folder ? "Stop syncing: no library folder is set" : "Stop syncing (the folder keeps its files)";
  const chooseTip = !global
    ? `Choose a folder: ${ONLY_GLOBAL}`
    : folder
      ? "Keep the global presets in another folder"
      : "Keep the global presets in a folder too (JSON files), e.g. a synced drive";
  return (
    <div className={styles.folder}>
      <FolderOpen className={styles.folderIcon} aria-hidden="true" />
      <span className={styles.folderText} data-status={global ? folder?.status : undefined} data-tooltip={text}>
        {text}
      </span>
      <Button size="compact" tooltip={chooseTip} commandId="presets.chooseFolder" disabled={!global}>
        Library folder
      </Button>
      <IconButton icon={FolderSync} label={syncLabel} commandId="presets.syncFolder" disabled={!global || !folder || folder.status === "syncing"} />
      <IconButton icon={FolderX} label={stopLabel} commandId="presets.stopFolder" disabled={!global || !folder} />
    </div>
  );
}

/**
 * No presets in the scope (Batch 46): New from selection (a text clip must be selected), Import, and in
 * the global scope the starter presets back. A read-only project's presets cannot change.
 */
function NoPresets({ scope, writable, hasText }: { scope: PresetScope; writable: boolean; hasText: boolean }) {
  const readOnly = writable ? undefined : "This project is read-only: its presets cannot change";
  return (
    <EmptyState
      icon={BookmarkPlus}
      title="No presets yet"
      text={scope === "global" ? "Save a styled text clip as a preset, import a presets file, or bring the starter presets back." : "Save a styled text clip as a preset, or import a presets file: they stay with this project."}
    >
      <Button variant="primary" icon={BookmarkPlus} commandId="preset.save" disabled={!hasText || !writable} tooltip={readOnly ?? (hasText ? "New preset from the selected text" : "Select a text clip first")}>
        New from selection
      </Button>
      <Button icon={FileUp} commandId="presets.import" disabled={!writable} tooltip={readOnly ?? "Import presets from a JSON file"}>
        Import…
      </Button>
      {scope === "global" && (
        <Button icon={RotateCcw} commandId="presets.restoreStarters">
          Restore starters
        </Button>
      )}
    </EmptyState>
  );
}

const PRESET_ITEM = "[data-preset-id]";
/** The card itself (not its rename field). */
const presetCard = (target: EventTarget | null) => (target instanceof HTMLElement && target.matches(PRESET_ITEM) ? target : null);

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
  const hasText = useStoreSelector(sessionStore.selection, selectHasText);
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const renaming = useStoreSelector(presetRenaming, (id) => id);
  const tagging = useStoreSelector(presetTagging, (id) => id);
  const gridRef = useRef<HTMLDivElement>(null);
  const shown = useMemo(() => searchPresets(presets, query), [presets, query]);
  const endEdit = useMemo(
    () => () => {
      presetRenaming.set(null);
      presetTagging.set(null);
    },
    [],
  );

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
    if (id && id !== renaming && id !== tagging) applyPresetById(id);
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

  // The keyboard (Batch 46): the arrows, Home and End move the focus over the cards (by rows of the
  // grid), Enter or Space applies the focused preset as a click does. Handled keys stop here: the
  // KeyDispatcher (on window) must not step frames or play.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const card = presetCard(event.target);
    const grid = gridRef.current;
    if (!card || !grid || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      const id = card.dataset.presetId;
      if (id && id !== renaming && id !== tagging && !event.repeat) applyPresetById(id);
      return;
    }
    const cards = [...grid.querySelectorAll<HTMLElement>(PRESET_ITEM)];
    const next = stepIndex(event.key, cards.indexOf(card), cards.length, gridColumns(grid));
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    cards[next]?.focus();
  };
  // A press on a card applies it without focusing it (Space keeps playing); the rename field keeps its own.
  const onMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    const card = (event.target as Element).closest<HTMLElement>(PRESET_ITEM);
    if (card && !isEditableTarget(event.target)) pressWithoutFocus(event, event.currentTarget, card, PRESET_ITEM);
  };
  // The focused card is the list's one Tab stop, the first card until one was focused.
  const tabStop = useRef<string | null>(null);
  const onFocus = (event: FocusEvent) => {
    const card = presetCard(event.target);
    if (!card || !gridRef.current) return;
    tabStop.current = card.dataset.presetId ?? null;
    setTabStop(gridRef.current, PRESET_ITEM, card);
  };
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (grid) setTabStop(grid, PRESET_ITEM, tabStop.current === null ? null : grid.querySelector(`[data-preset-id="${CSS.escape(tabStop.current)}"]`));
  });

  const onMenu = (command: string) => {
    if (menu) actions.run(command, null, menu.id);
  };
  const menuPreset = menu ? presets.find((preset) => preset.id === menu.id) : undefined;

  // Empty states (Batch 46), each with the action that fixes it.
  let empty: ReactNode = null;
  if (scope === "project" && !projectOpen) {
    empty = (
      <EmptyState icon={FolderOpen} title="No project open" text="Open a project to keep presets in it.">
        <Button commandId="presets.showGlobal" tooltip="Show the presets kept in this browser">
          Show global presets
        </Button>
      </EmptyState>
    );
  } else if (!loaded) {
    empty = <EmptyState icon={LoaderCircle} title="Loading presets…" />;
  } else if (presets.length === 0) {
    empty = <NoPresets scope={scope} writable={writable} hasText={hasText} />;
  } else if (shown.length === 0) {
    empty = (
      <EmptyState layout="inline" icon={SearchX} title="No preset matches" text={`Nothing matches “${query.trim()}”.`}>
        <Button control size="compact" onClick={() => setQuery("")}>
          Clear search
        </Button>
      </EmptyState>
    );
  }

  // Font files dropped on the tab join My fonts (spec §20.1); the highlight is a data attribute (no render).
  const rootRef = useRef<HTMLDivElement>(null);
  const dragDepth = useRef(0);
  const setDropping = (on: boolean) => {
    const root = rootRef.current;
    if (!root) return;
    if (on) root.dataset.dropping = "";
    else delete root.dataset.dropping;
  };
  const onDragEnter = (event: DragEvent) => {
    if (!dragHasFiles(event.dataTransfer)) return;
    event.preventDefault();
    dragDepth.current += 1;
    setDropping(true);
  };
  const onDragOver = (event: DragEvent) => {
    if (!dragHasFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };
  const onDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDropping(false);
  };
  const onDrop = (event: DragEvent) => {
    if (!dragHasFiles(event.dataTransfer)) return;
    event.preventDefault();
    dragDepth.current = 0;
    setDropping(false);
    const fonts = droppedFontFiles(event.dataTransfer);
    void addFontFiles(fonts.length > 0 ? fonts : [...event.dataTransfer.files]);
  };

  return (
    <div ref={rootRef} className={styles.root} onDragEnter={onDragEnter} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      <div className={styles.dropOverlay} aria-hidden="true">
        <FilePlus2 className={styles.dropIcon} />
        Drop font files to add them to My fonts
      </div>
      <div className={styles.tools}>
        <div className={styles.scope} role="group" aria-label="Presets shown">
          {(["global", "project"] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={styles.scopeChip}
              aria-pressed={scope === value}
              data-tooltip={value === "global" ? "Global presets: in every project" : "This project's presets (presets/text in its folder)"}
              data-command={scopeCommand(value)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => actions.run(scopeCommand(value))}
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
      <div
        className={styles.scroll}
        role="listbox"
        aria-label="Text presets"
        onClick={onClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerLeave={() => hoverPreset(null)}
        onContextMenu={onContextMenu}
        onScroll={() => hoverPreset(null)}
        onKeyDown={onKeyDown}
        onMouseDown={onMouseDown}
        onFocus={onFocus}
      >
        {empty ?? (
          <div ref={gridRef} className={styles.grid}>
            {shown.map((preset) => (
              <PresetCard
                key={preset.id}
                preset={preset}
                defaultTitle={defaultTitle === preset.id}
                defaultSubtitle={defaultSubtitle === preset.id}
                editing={renaming === preset.id ? "name" : tagging === preset.id ? "tags" : null}
                onEdited={endEdit}
              />
            ))}
          </div>
        )}
      </div>
      <FolderStrip scope={scope} projectOpen={projectOpen} writable={writable} />
      {menu && menuPreset && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          entries={presetMenuEntries(menuPreset, canWrite(scope), { title: defaultTitle, subtitle: defaultSubtitle })}
          onSelect={onMenu}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}