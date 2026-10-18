import { ArrowDownWideNarrow, ArrowUpNarrowWide, AudioLines, ChevronDown, ChevronUp, FileSearch, Film, FolderPlus, FolderSearch, Image, Import, KeyRound, LayoutGrid, List, TriangleAlert, type LucideIcon } from "lucide-react";
import { memo, useLayoutEffect, useMemo, useRef, type CSSProperties, type DragEvent, type MouseEvent, type PointerEvent } from "react";
import { insertMediaAtPlayhead } from "../../app/dropController.js";
import { clearMediaSelection, dropMedia, mediaPanel, openMediaMenu, selectMedia, setMediaSearch } from "../../app/mediaController.js";
import { mediaHover, pressMediaCard, takeClickAfterDrag } from "../../app/mediaGestures.js";
import { mediaStatus } from "../../app/mediaOffline.js";
import { actions, documentStore, sessionStore } from "../../app/services.js";
import { mediaUseCounts } from "../../core/commands/mediaCommands.js";
import { formatDurationUs } from "../../core/document/time.js";
import type { MediaId, MediaItem, Project } from "../../core/document/types.js";
import { MEDIA_COLUMNS, type MediaColumn, type MediaSort, type SessionState } from "../../core/store/sessionStore.js";
import { isEditableTarget } from "../../core/keyboard/KeyDispatcher.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import type { MediaStatus } from "../../project/mediaSources.js";
import { Button } from "../../ui/Button.js";
import { IconButton } from "../../ui/IconButton.js";
import { Select } from "../../ui/Select.js";
import { TextField } from "../../ui/TextField.js";
import { BinMenu, BinStrip } from "./BinStrip.js";
import { listColumns, pressColumnResizer, resetColumn } from "./columnResize.js";
import { rangeFractions } from "./hoverScrub.js";
import { MediaContextMenu } from "./MediaContextMenu.js";
import { MediaName } from "./MediaName.js";
import { ProxyBadge, ProxyCell } from "./ProxyBadge.js";
import { audioLabel, codecLabel, durationBadge, fpsLabel, mediaMatcher, metaLabel, resolutionLabel, shownBin, sortMedia } from "./mediaList.js";
import styles from "./MediaTab.module.css";
import { PosterCanvas } from "./PosterCanvas.js";

const KIND_ICONS: Record<MediaItem["kind"], LucideIcon> = { video: Film, audio: AudioLines, image: Image };

const SORT_LABELS: Record<MediaSort, string> = {
  name: "Name",
  date: "Date added",
  duration: "Duration",
  kind: "Kind",
  resolution: "Resolution",
  fps: "Frame rate",
  codec: "Codec",
  audio: "Audio",
  used: "Used",
};
/** The header's choices (§12); list columns add the others. */
const HEADER_SORTS: readonly MediaSort[] = ["name", "date", "duration", "kind"];

/** The offline badge (spec §12 "red badge", Batch 41): its text and what its button does. */
const OFFLINE_BADGES: Record<MediaStatus, { label: string; tooltip: string }> = {
  missing: { label: "Offline", tooltip: "The file is missing: relink it" },
  permission: { label: "No access", tooltip: "The browser needs your permission to read this linked file" },
  failed: { label: "Can't play", tooltip: "This file can't be decoded here: relink another one" },
};

type MediaPanelSession = SessionState["mediaPanel"];
const selectPanelSession = (state: SessionState) => state.mediaPanel;
const selectMediaRecord = (project: Project) => project.media;
const selectBins = (project: Project) => project.bins;
/** Usage counts as a string, so clip edits that do not change them do not re-render the panel. */
const selectUseKey = (project: Project) => [...mediaUseCounts(project)].map(([id, n]) => `${id}:${n}`).join(",");

function setPanel(patch: Partial<MediaPanelSession>): void {
  sessionStore.state.set((state) => ({ ...state, mediaPanel: { ...state.mediaPanel, ...patch } }));
}

/** Clicking a column (or choosing the same sort again) flips the direction. */
function sortBy(sort: MediaSort): void {
  const current = sessionStore.state.getState().mediaPanel;
  setPanel(current.sort === sort ? { descending: !current.descending } : { sort, descending: false });
}

/** Header strip actions of the Media tab: sort, grid/list, new bin, import. */
export function MediaActions() {
  const panel = useStoreSelector(sessionStore.state, selectPanelSession);
  const options = (HEADER_SORTS.includes(panel.sort) ? HEADER_SORTS : [...HEADER_SORTS, panel.sort]).map((value) => ({ value, label: SORT_LABELS[value] }));
  return (
    <>
      <Select size="compact" label="Sort media by" value={panel.sort} options={options} onChange={(sort) => setPanel({ sort, descending: false })} />
      <IconButton icon={panel.descending ? ArrowDownWideNarrow : ArrowUpNarrowWide} label={panel.descending ? "Descending" : "Ascending"} commandId="media.toggleSortDirection" />
      <IconButton icon={LayoutGrid} label="Grid view" commandId="media.viewGrid" pressed={panel.view === "grid"} />
      <IconButton icon={List} label="List view" commandId="media.viewList" pressed={panel.view === "list"} />
      <IconButton icon={FolderPlus} label="New bin" commandId="media.newBin" />
      <IconButton icon={Import} label="Import media" commandId="media.import" />
    </>
  );
}

const FILTER_CHIPS = [
  { kind: "video", label: "Video", command: "media.filterVideo" },
  { kind: "audio", label: "Audio", command: "media.filterAudio" },
  { kind: "image", label: "Images", command: "media.filterImage" },
] as const;

/** The search field and the filter chips (spec §12; a tool row like the Presets tab's). */
function MediaTools() {
  const search = useStoreSelector(mediaPanel, (state) => state.search);
  const filters = useStoreSelector(sessionStore.state, (state) => state.mediaPanel.filters);
  const keep = (event: MouseEvent) => event.preventDefault();
  return (
    <div className={styles.tools}>
      <div className={styles.search}>
        <TextField value={search} onChange={setMediaSearch} ariaLabel="Search media" placeholder="Search media" />
      </div>
      <div className={styles.chips} role="group" aria-label="Show only">
        {FILTER_CHIPS.map((chip) => (
          <button key={chip.kind} type="button" className={styles.chip} aria-pressed={filters.kinds.includes(chip.kind)} data-command={chip.command} onMouseDown={keep} onClick={() => actions.run(chip.command)}>
            {chip.label}
          </button>
        ))}
        <button type="button" className={styles.chip} aria-pressed={filters.unused} data-command="media.filterUnused" data-tooltip="Media no clip uses" onMouseDown={keep} onClick={() => actions.run("media.filterUnused")}>
          Unused
        </button>
      </div>
    </div>
  );
}

const countOf = (statuses: ReadonlyMap<MediaId, MediaStatus>, status: MediaStatus) => [...statuses.values()].filter((value) => value === status).length;

/** Offline media (spec §12, Batch 41): linked files waiting for the browser's permission, missing files. */
function OfflineNotice() {
  const waiting = useStoreSelector(mediaStatus, (state) => countOf(state, "permission"));
  const missing = useStoreSelector(mediaStatus, (state) => state.size - countOf(state, "permission"));
  if (waiting === 0 && missing === 0) return null;
  const text = [waiting > 0 && `${waiting} linked file${waiting === 1 ? "" : "s"} need your permission`, missing > 0 && `${missing} file${missing === 1 ? "" : "s"} offline`].filter(Boolean).join(" · ");
  return (
    <div className={styles.notice} role="status">
      <TriangleAlert className={styles.noticeIcon} aria-hidden="true" />
      <span className={styles.noticeText} title={text}>
        {text}
      </span>
      {waiting > 0 && (
        <Button size="compact" icon={KeyRound} commandId="media.allowAccess" tooltip="Let the browser read the linked files again">
          Allow access
        </Button>
      )}
      {missing > 0 && (
        <Button size="compact" icon={FolderSearch} commandId="media.relinkFolder" tooltip="Find the offline files in a folder (by name and size)">
          Relink folder…
        </Button>
      )}
    </div>
  );
}

/** The source range bar (spec §12): the part of the media that inserts and drags take. */
const RangeBar = memo(function RangeBar({ id, durationUs }: { id: MediaId; durationUs: number }) {
  const range = useStoreSelector(sessionStore.state, (state) => state.sourceRanges[id]);
  if (!range) return null;
  const { from, to } = rangeFractions(range, durationUs);
  return <span className={styles.rangeBar} style={{ left: `${from * 100}%`, width: `${(to - from) * 100}%` }} aria-hidden="true" />;
});

/**
 * The hover-scrub parts of a thumbnail (spec §12), driven by `mediaHover` through direct DOM writes:
 * the progress line, and the range bar. Media without a duration (stills) have neither.
 */
function ScrubParts({ item }: { item: MediaItem }) {
  if (item.kind === "image" || item.durationUs <= 0) return null;
  return (
    <>
      <RangeBar id={item.id} durationUs={item.durationUs} />
      <span className={styles.progress} data-progress="" aria-hidden="true" />
    </>
  );
}

/** Selects the item alone, then runs its offline action (a user gesture: pickers and permission prompts need it). */
function runOffline(id: MediaId, status: MediaStatus): void {
  selectMedia(id, { toggle: false, range: false }, [id]);
  void actions.run(status === "permission" ? "media.allowAccess" : "media.relink");
}

/** Offline media (spec §12): a red badge, and on cards the Relink (or Allow access) button. */
function OfflineBadge({ id, card }: { id: MediaId; card: boolean }) {
  const status = useStoreSelector(mediaStatus, (state) => state.get(id) ?? null);
  if (status === null) return null;
  const badge = OFFLINE_BADGES[status];
  const command = status === "permission" ? "media.allowAccess" : "media.relink";
  const label = status === "permission" ? "Allow access" : "Relink…";
  const onClick = (event: MouseEvent) => {
    event.stopPropagation();
    runOffline(id, status);
  };
  if (!card) {
    return (
      <button type="button" className={styles.offline} data-command={command} data-tooltip={`${badge.tooltip}. Click: ${label}`} onClick={onClick}>
        {badge.label}
      </button>
    );
  }
  return (
    <>
      <span className={styles.offline} data-tooltip={badge.tooltip}>
        {badge.label}
      </span>
      <button type="button" className={styles.relink} data-command={command} onClick={onClick} onDoubleClick={(event) => event.stopPropagation()}>
        {status === "permission" ? <KeyRound className={styles.relinkIcon} aria-hidden="true" /> : <FileSearch className={styles.relinkIcon} aria-hidden="true" />}
        {label}
      </button>
    </>
  );
}

const MediaCard = memo(function MediaCard({ item, uses }: { item: MediaItem; uses: number }) {
  const selected = useStoreSelector(mediaPanel, (state) => state.selection.ids.has(item.id));
  const offline = useStoreSelector(mediaStatus, (state) => state.has(item.id));
  const Icon = KIND_ICONS[item.kind];
  const badge = durationBadge(item);
  return (
    <div className={styles.card} data-media-id={item.id} data-unused={uses === 0 || undefined} data-offline={offline || undefined} role="option" aria-selected={selected}>
      <div className={styles.thumb} data-thumb="">
        <Icon className={styles.placeholderIcon} aria-hidden="true" />
        {item.kind !== "audio" && <PosterCanvas id={item.id} />}
        <ScrubParts item={item} />
        {badge && (
          <span className={styles.badge}>
            <span className={styles.duration}>{badge}</span>
            <span className={styles.hoverTime} data-hover-time="" />
          </span>
        )}
        <span className={styles.uses}>{uses === 0 ? "Unused" : `Used ${uses}×`}</span>
        {item.kind === "video" && item.proxy && <ProxyBadge id={item.id} status={item.proxy.status} />}
        <OfflineBadge id={item.id} card />
      </div>
      <div className={styles.cardInfo}>
        <Icon className={styles.kindIcon} aria-label={item.kind} />
        <MediaName id={item.id} name={item.name} />
      </div>
      <div className={styles.meta}>{metaLabel(item) || " "}</div>
    </div>
  );
});

const MediaRow = memo(function MediaRow({ item, uses }: { item: MediaItem; uses: number }) {
  const selected = useStoreSelector(mediaPanel, (state) => state.selection.ids.has(item.id));
  const offline = useStoreSelector(mediaStatus, (state) => state.has(item.id));
  const Icon = KIND_ICONS[item.kind];
  return (
    <div className={styles.row} data-media-id={item.id} data-offline={offline || undefined} role="option" aria-selected={selected}>
      <div className={styles.rowThumb} data-thumb="">
        <Icon className={styles.placeholderIcon} aria-hidden="true" />
        {item.kind !== "audio" && <PosterCanvas id={item.id} />}
        <ScrubParts item={item} />
      </div>
      <div className={styles.rowName}>
        <Icon className={styles.kindIcon} aria-label={item.kind} />
        <MediaName id={item.id} name={item.name} />
        <OfflineBadge id={item.id} card={false} />
      </div>
      <span className={styles.mono}>{item.kind === "image" && item.durationUs === 0 ? "" : formatDurationUs(item.durationUs, true)}</span>
      <span className={styles.mono}>{resolutionLabel(item)}</span>
      <span className={styles.mono}>{fpsLabel(item)}</span>
      <span>{codecLabel(item.codec)}</span>
      <span>{audioLabel(item)}</span>
      <ProxyCell item={item} />
      <span className={styles.mono}>{uses}</span>
    </div>
  );
});

const COLUMN_LABELS: Record<MediaColumn, { label: string; sort: MediaSort | null }> = {
  name: { label: "Name", sort: "name" },
  duration: { label: "Duration", sort: "duration" },
  resolution: { label: "Resolution", sort: "resolution" },
  fps: { label: "FPS", sort: "fps" },
  codec: { label: "Codec", sort: "codec" },
  audio: { label: "Audio", sort: "audio" },
  proxy: { label: "Proxy", sort: null },
  used: { label: "Used", sort: "used" },
};

function ListHeader({ sort, descending }: { sort: MediaSort; descending: boolean }) {
  const Arrow = descending ? ChevronDown : ChevronUp;
  return (
    // Header clicks sort; they must not reach the list's selection handler.
    <div className={styles.listHeader} role="row" onClick={(event) => event.stopPropagation()}>
      <span className={styles.column} />
      {MEDIA_COLUMNS.map((key) => {
        const column = COLUMN_LABELS[key];
        return (
          <span key={key} className={styles.headerCell} data-column={key}>
            {column.sort ? (
              <button type="button" className={styles.column} data-control="" aria-sort={sort === column.sort ? (descending ? "descending" : "ascending") : "none"} onMouseDown={(event) => event.preventDefault()} onClick={() => sortBy(column.sort as MediaSort)}>
                {column.label}
                {sort === column.sort && <Arrow className={styles.sortIcon} aria-hidden="true" />}
              </button>
            ) : (
              <span className={styles.column}>{column.label}</span>
            )}
            {/* Drag to resize the column, double-click for its default width. */}
            <span
              className={styles.resizer}
              data-resize={key}
              aria-hidden="true"
              onPointerDown={(event) => {
                event.stopPropagation();
                pressColumnResizer(event.nativeEvent, key);
              }}
              onDoubleClick={() => resetColumn(key)}
            />
          </span>
        );
      })}
    </div>
  );
}

function EmptyState() {
  return (
    <div className={styles.empty}>
      <Film className={styles.emptyIcon} aria-hidden="true" />
      <p className={styles.emptyTitle}>No media yet</p>
      <p className={styles.emptyText}>Import video, audio and images, or drop files here.</p>
      <Button variant="primary" icon={Import} commandId="media.import">
        Import media
      </Button>
    </div>
  );
}

/** Nothing matches the bin, the filter chips and the search. */
function NoMatch() {
  return (
    <div className={styles.noMatch}>
      <p className={styles.emptyTitle}>No media here</p>
      <p className={styles.emptyText}>Nothing matches this bin, the filters and the search.</p>
      <Button size="compact" commandId="media.clearFilters">
        Clear filters
      </Button>
    </div>
  );
}

/**
 * The Media tab body (spec §12): the search and filter chips, the bin strip, grid or list, selection,
 * drop target, hover-scrub, drags out (to the timeline, the canvas, a bin), offline media, context
 * menus. Every media keeps its card while the bin, the chips or the search hide it (no remount, so a
 * search narrows at once).
 */
export function MediaTab() {
  const media = useStoreSelector(documentStore, selectMediaRecord);
  const bins = useStoreSelector(documentStore, selectBins);
  const useKey = useStoreSelector(documentStore, selectUseKey);
  const panel = useStoreSelector(sessionStore.state, selectPanelSession);
  const search = useStoreSelector(mediaPanel, (state) => state.search);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dragDepth = useRef(0);

  const uses = useMemo(() => new Map(useKey ? useKey.split(",").map((entry) => [entry.slice(0, entry.lastIndexOf(":")), Number(entry.slice(entry.lastIndexOf(":") + 1))] as const) : []), [useKey]);
  const items = useMemo(() => sortMedia(Object.values(media), panel.sort, panel.descending, uses), [media, panel.sort, panel.descending, uses]);
  const bin = shownBin(panel.bin, bins);
  const order = useMemo(() => {
    const match = mediaMatcher({ bin, filters: panel.filters, search }, uses);
    return items.filter(match).map((item) => item.id);
  }, [items, bin, panel.filters, search, uses]);

  // The bin, chips and search hide cards in place: no card re-renders, none remounts.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const shown = new Set(order);
    for (const element of list.querySelectorAll<HTMLElement>("[data-media-id]")) {
      const hidden = !shown.has(element.dataset.mediaId as MediaId);
      if (element.hidden !== hidden) element.hidden = hidden;
    }
  });

  // Selection by event delegation: cards stay dumb and keep their memoized props.
  const onClick = (event: MouseEvent) => {
    // The release of a drag out of the panel is no click.
    if (takeClickAfterDrag()) return;
    const card = (event.target as Element).closest<HTMLElement>("[data-media-id]");
    const id = card?.dataset.mediaId as MediaId | undefined;
    if (!id) {
      clearMediaSelection();
      return;
    }
    selectMedia(id, { toggle: event.ctrlKey || event.metaKey, range: event.shiftKey }, order);
  };

  // Double-click inserts at the playhead (spec §6.14); the name keeps its own double-click (rename).
  const onDoubleClick = (event: MouseEvent) => {
    const id = (event.target as Element).closest<HTMLElement>("[data-media-id]")?.dataset.mediaId as MediaId | undefined;
    if (id) insertMediaAtPlayhead(id);
  };

  // Drags out of the panel (spec §6.14) and the hover-scrub (§12): handed to framework-free gestures.
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || isEditableTarget(event.target) || (event.target as Element).closest("button")) return;
    const id = (event.target as Element).closest<HTMLElement>("[data-media-id]")?.dataset.mediaId as MediaId | undefined;
    if (id) pressMediaCard(event.nativeEvent, event.currentTarget, id);
  };
  const onPointerMove = (event: PointerEvent) => mediaHover.move(event.nativeEvent);
  const onPointerLeave = () => mediaHover.leave();
  const onContextMenu = (event: MouseEvent) => {
    const id = (event.target as Element).closest<HTMLElement>("[data-media-id]")?.dataset.mediaId as MediaId | undefined;
    if (!id || isEditableTarget(event.target)) return;
    event.preventDefault();
    mediaHover.leave();
    openMediaMenu(id, event.clientX, event.clientY);
  };
  const listHandlers = { onClick, onDoubleClick, onPointerDown, onPointerMove, onPointerLeave, onContextMenu, onScroll: onPointerLeave };

  // Drop highlight through a data attribute: no React render while dragging.
  const setDropping = (on: boolean) => {
    const root = rootRef.current;
    if (!root) return;
    if (on) root.dataset.dropping = "";
    else delete root.dataset.dropping;
  };
  const hasFiles = (event: DragEvent) => event.dataTransfer.types.includes("Files");
  const onDragEnter = (event: DragEvent) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth.current += 1;
    setDropping(true);
  };
  const onDragOver = (event: DragEvent) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };
  const onDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDropping(false);
  };
  const onDrop = (event: DragEvent) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth.current = 0;
    setDropping(false);
    dropMedia(event.dataTransfer);
  };

  return (
    <div ref={rootRef} className={styles.root} onDragEnter={onDragEnter} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      <MediaTools />
      <OfflineNotice />
      <div className={styles.body}>
        <BinStrip />
        <div className={styles.content}>
          {items.length === 0 ? (
            <EmptyState />
          ) : panel.view === "grid" ? (
            <div className={styles.scroll} role="listbox" aria-label="Media" aria-multiselectable="true" {...listHandlers}>
              {order.length === 0 && <NoMatch />}
              <div ref={listRef} className={styles.grid}>
                {items.map((item) => (
                  <MediaCard key={item.id} item={item} uses={uses.get(item.id) ?? 0} />
                ))}
              </div>
            </div>
          ) : (
            <div className={styles.scroll} role="listbox" aria-label="Media" aria-multiselectable="true" {...listHandlers}>
              <div ref={listRef} className={styles.list} data-media-list="" style={{ "--list-columns": listColumns(panel.columns) } as CSSProperties}>
                <ListHeader sort={panel.sort} descending={panel.descending} />
                {items.map((item) => (
                  <MediaRow key={item.id} item={item} uses={uses.get(item.id) ?? 0} />
                ))}
              </div>
              {order.length === 0 && <NoMatch />}
            </div>
          )}
        </div>
      </div>
      <div className={styles.dropOverlay} aria-hidden="true">
        <Import className={styles.dropIcon} />
        Drop files to import them
      </div>
      <MediaContextMenu />
      <BinMenu />
    </div>
  );
}
