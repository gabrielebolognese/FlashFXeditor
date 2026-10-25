import { ArrowDownWideNarrow, ArrowUpNarrowWide, AudioLines, ChevronDown, ChevronUp, Film, Image, Import, LayoutGrid, List, type LucideIcon } from "lucide-react";
import { memo, useMemo, useRef, type DragEvent, type MouseEvent, type PointerEvent } from "react";
import { insertMediaAtPlayhead } from "../../app/dropController.js";
import { clearMediaSelection, dropMedia, importFromPicker, mediaPanel, openMediaMenu, selectMedia } from "../../app/mediaController.js";
import { mediaHover, pressMediaCard, takeClickAfterDrag } from "../../app/mediaGestures.js";
import { documentStore, sessionStore } from "../../app/services.js";
import { mediaUseCounts } from "../../core/commands/mediaCommands.js";
import { formatDurationUs } from "../../core/document/time.js";
import type { MediaId, MediaItem, Project } from "../../core/document/types.js";
import type { MediaSort, MediaView, SessionState } from "../../core/store/sessionStore.js";
import { isEditableTarget } from "../../core/keyboard/KeyDispatcher.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import { Button } from "../../ui/Button.js";
import { IconButton } from "../../ui/IconButton.js";
import { Select } from "../../ui/Select.js";
import { rangeFractions } from "./hoverScrub.js";
import { MediaContextMenu } from "./MediaContextMenu.js";
import { MediaName } from "./MediaName.js";
import { ProxyBadge, ProxyCell } from "./ProxyBadge.js";
import { audioLabel, codecLabel, durationBadge, fpsLabel, metaLabel, resolutionLabel, sortMedia } from "./mediaList.js";
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

type MediaPanelSession = SessionState["mediaPanel"];
const selectPanelSession = (state: SessionState) => state.mediaPanel;
const selectMediaRecord = (project: Project) => project.media;
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

/** Header strip actions of the Media tab: Import, grid/list, sort. */
export function MediaActions() {
  const panel = useStoreSelector(sessionStore.state, selectPanelSession);
  const options = (HEADER_SORTS.includes(panel.sort) ? HEADER_SORTS : [...HEADER_SORTS, panel.sort]).map((value) => ({ value, label: SORT_LABELS[value] }));
  const setView = (view: MediaView) => setPanel({ view });
  return (
    <>
      <Select size="compact" label="Sort media by" value={panel.sort} options={options} onChange={(sort) => setPanel({ sort, descending: false })} />
      <IconButton icon={panel.descending ? ArrowDownWideNarrow : ArrowUpNarrowWide} label={panel.descending ? "Descending" : "Ascending"} onClick={() => setPanel({ descending: !panel.descending })} />
      <IconButton icon={LayoutGrid} label="Grid view" pressed={panel.view === "grid"} onClick={() => setView("grid")} />
      <IconButton icon={List} label="List view" pressed={panel.view === "list"} onClick={() => setView("list")} />
      <IconButton icon={Import} label="Import media" commandId="media.import" onClick={() => void importFromPicker()} />
    </>
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

const MediaCard = memo(function MediaCard({ item, uses }: { item: MediaItem; uses: number }) {
  const selected = useStoreSelector(mediaPanel, (state) => state.selection.ids.has(item.id));
  const Icon = KIND_ICONS[item.kind];
  const badge = durationBadge(item);
  return (
    <div className={styles.card} data-media-id={item.id} data-unused={uses === 0 || undefined} role="option" aria-selected={selected}>
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
      </div>
      <div className={styles.cardInfo}>
        <Icon className={styles.kindIcon} aria-label={item.kind} />
        <MediaName id={item.id} name={item.name} />
      </div>
      <div className={styles.meta}>{metaLabel(item) || " "}</div>
    </div>
  );
});

const MediaRow = memo(function MediaRow({ item, uses }: { item: MediaItem; uses: number }) {
  const selected = useStoreSelector(mediaPanel, (state) => state.selection.ids.has(item.id));
  const Icon = KIND_ICONS[item.kind];
  return (
    <div className={styles.row} data-media-id={item.id} role="option" aria-selected={selected}>
      <div className={styles.rowThumb} data-thumb="">
        <Icon className={styles.placeholderIcon} aria-hidden="true" />
        {item.kind !== "audio" && <PosterCanvas id={item.id} />}
        <ScrubParts item={item} />
      </div>
      <div className={styles.rowName}>
        <Icon className={styles.kindIcon} aria-label={item.kind} />
        <MediaName id={item.id} name={item.name} />
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

const COLUMNS: readonly { label: string; sort: MediaSort | null }[] = [
  { label: "", sort: null },
  { label: "Name", sort: "name" },
  { label: "Duration", sort: "duration" },
  { label: "Resolution", sort: "resolution" },
  { label: "FPS", sort: "fps" },
  { label: "Codec", sort: "codec" },
  { label: "Audio", sort: "audio" },
  { label: "Proxy", sort: null },
  { label: "Used", sort: "used" },
];

function ListHeader({ sort, descending }: { sort: MediaSort; descending: boolean }) {
  const Arrow = descending ? ChevronDown : ChevronUp;
  return (
    // Header clicks sort; they must not reach the list's selection handler.
    <div className={styles.listHeader} role="row" onClick={(event) => event.stopPropagation()}>
      {COLUMNS.map((column, i) =>
        column.sort ? (
          <button key={i} type="button" className={styles.column} aria-sort={sort === column.sort ? (descending ? "descending" : "ascending") : "none"} onMouseDown={(event) => event.preventDefault()} onClick={() => sortBy(column.sort as MediaSort)}>
            {column.label}
            {sort === column.sort && <Arrow className={styles.sortIcon} aria-hidden="true" />}
          </button>
        ) : (
          <span key={i} className={styles.column}>
            {column.label}
          </span>
        ),
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className={styles.empty}>
      <Film className={styles.emptyIcon} aria-hidden="true" />
      <p className={styles.emptyTitle}>No media yet</p>
      <p className={styles.emptyText}>Import video, audio and images, or drop files here.</p>
      <Button variant="primary" icon={Import} commandId="media.import" onClick={() => void importFromPicker()}>
        Import media
      </Button>
    </div>
  );
}

/** The Media tab body (spec §12): grid or list, selection, drop target, hover-scrub, drags out, context menu. */
export function MediaTab() {
  const media = useStoreSelector(documentStore, selectMediaRecord);
  const useKey = useStoreSelector(documentStore, selectUseKey);
  const panel = useStoreSelector(sessionStore.state, selectPanelSession);
  const rootRef = useRef<HTMLDivElement>(null);
  const dragDepth = useRef(0);

  const uses = useMemo(() => new Map(useKey ? useKey.split(",").map((entry) => [entry.slice(0, entry.lastIndexOf(":")), Number(entry.slice(entry.lastIndexOf(":") + 1))] as const) : []), [useKey]);
  const items = useMemo(() => sortMedia(Object.values(media), panel.sort, panel.descending, uses), [media, panel.sort, panel.descending, uses]);
  const order = useMemo(() => items.map((item) => item.id), [items]);

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
    if (event.button !== 0 || isEditableTarget(event.target)) return;
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
      {items.length === 0 ? (
        <EmptyState />
      ) : panel.view === "grid" ? (
        <div className={styles.scroll} role="listbox" aria-label="Media" aria-multiselectable="true" {...listHandlers}>
          <div className={styles.grid}>
            {items.map((item) => (
              <MediaCard key={item.id} item={item} uses={uses.get(item.id) ?? 0} />
            ))}
          </div>
        </div>
      ) : (
        <div className={styles.scroll} role="listbox" aria-label="Media" aria-multiselectable="true" {...listHandlers}>
          <div className={styles.list}>
            <ListHeader sort={panel.sort} descending={panel.descending} />
            {items.map((item) => (
              <MediaRow key={item.id} item={item} uses={uses.get(item.id) ?? 0} />
            ))}
          </div>
        </div>
      )}
      <div className={styles.dropOverlay} aria-hidden="true">
        <Import className={styles.dropIcon} />
        Drop files to import them
      </div>
      <MediaContextMenu />
    </div>
  );
}
