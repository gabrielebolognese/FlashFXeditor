import { Film, FolderPlus, RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useStoreSelector } from "../core/store/useStoreSelector.js";
import { formatDuration, relativeTime } from "../project/inbox/format.js";
import { isWaiting, type InboxEntry, type InboxState } from "../project/inbox/inbox.js";
import type { RecentProject } from "../project/recentProjects.js";
import { Button } from "../ui/Button.js";
import { ContextMenu, type ContextMenuEntry } from "../ui/ContextMenu.js";
import { actions, inbox, recentProjects } from "./services.js";
import styles from "./InboxSection.module.css";

// The start screen's inbox: one card per project found in the watched folders (poster, title, folder label,
// how long ago, duration and format, the review badge, a chip with the generator's notes), all folders in one
// list. One click opens the project; the right-click menu marks it reviewed or not, or removes the card. The
// filter row (one chip per kind, one per folder, "Not reviewed only") is remembered in this browser. Folders
// that lost their permission get one Reconnect button each: nothing asks in a modal at start.

const selectState = (state: InboxState) => state;
const selectRecent = (list: readonly RecentProject[]) => list;

/** What the filter row shows: a kind (a card's `kind`, the channel for the reels), a folder, only what waits. */
interface Filter {
  kind: string | null;
  folder: string | null;
  waiting: boolean;
}

const FILTER_KEY = "shorts-editor.inbox-filter.v1";
const NO_FILTER: Filter = { kind: null, folder: null, waiting: false };

function storedFilter(): Filter {
  try {
    const raw = JSON.parse(window.localStorage.getItem(FILTER_KEY) ?? "null") as Partial<Filter> | null;
    if (raw && typeof raw === "object") return { kind: typeof raw.kind === "string" ? raw.kind : null, folder: typeof raw.folder === "string" ? raw.folder : null, waiting: raw.waiting === true };
  } catch {
    // No storage, or not JSON: no filter.
  }
  return NO_FILTER;
}

function storeFilter(filter: Filter): void {
  try {
    window.localStorage.setItem(FILTER_KEY, JSON.stringify(filter));
  } catch {
    // The filter then lasts for this visit.
  }
}

/** An image from a file or a blob: an object URL written to the element while it shows (revoked after). */
function Picture({ blob }: { blob: Blob }) {
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const image = ref.current;
    if (!image) return undefined;
    const url = URL.createObjectURL(blob);
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  return <img ref={ref} className={styles.posterImage} alt="" draggable={false} />;
}

/** What the author should look at: failed checks first, then the generator's notes. */
function warningLines(entry: InboxEntry): string[] {
  const failed = entry.card ? entry.card.checks.filter((check) => !check.ok).map((check) => `Check failed: ${check.name}`) : [];
  return [...failed, ...(entry.card?.notes ?? [])];
}

function Card({ entry, thumbnail, disabled, now, onMenu }: { entry: InboxEntry; thumbnail: Blob | null; disabled: boolean; now: number; onMenu: (event: MouseEvent, entry: InboxEntry) => void }) {
  // The notes list shows while the chip is hovered, and stays after a click on it.
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const lines = warningLines(entry);
  const count = entry.card && entry.card.notes.length > 0 ? entry.card.notes.length : entry.failedChecks;
  const picture = entry.poster ?? thumbnail;
  const details = [entry.durationSec !== null ? formatDuration(entry.durationSec) : null, entry.format, entry.card?.kind ?? null].filter((part) => part !== null).join(" · ");
  const reviewed = entry.status === "reviewed";
  return (
    <li className={styles.card} data-status={entry.edited ? "edited" : entry.status} onContextMenu={(event) => onMenu(event, entry)}>
      <button
        type="button"
        className={styles.open}
        data-command="inbox.open"
        aria-disabled={disabled || undefined}
        data-tooltip={disabled ? "Wait: a project is opening" : `Open ${entry.title}`}
        onClick={() => {
          if (!disabled) actions.run("inbox.open", null, entry.key);
        }}
      >
        <span className={styles.poster} aria-hidden="true">
          {picture ? <Picture blob={picture} /> : <Film className={styles.posterIcon} />}
        </span>
        <span className={styles.text}>
          <span className={styles.name}>{entry.title}</span>
          <span className={styles.meta}>
            {relativeTime(entry.time, now)} · {entry.folderLabel}
          </span>
          <span className={styles.meta}>{details}</span>
        </span>
      </button>
      <span className={styles.badges}>
        {entry.edited ? (
          // The generator's backup of a project edited before a rebuild: never waiting for a look.
          <span className={styles.badge} data-reviewed="" data-tooltip="The copy you edited, kept when the project was built again">
            Edited copy
          </span>
        ) : (
          <span className={styles.badge} data-reviewed={reviewed ? "" : undefined}>
            {reviewed ? "Reviewed" : "Not reviewed"}
          </span>
        )}
        {entry.status === "updated" && !entry.edited && <span className={styles.updated}>updated</span>}
        {lines.length > 0 && (
          <button
            type="button"
            className={styles.chip}
            data-control=""
            data-failed={entry.failedChecks > 0 ? "" : undefined}
            aria-expanded={pinned || hovered}
            aria-label={`${count} ${count === 1 ? "note" : "notes"}${entry.failedChecks > 0 ? ", a check failed" : ""}: show them`}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onClick={() => setPinned((on) => !on)}
          >
            <TriangleAlert className={styles.chipIcon} aria-hidden="true" />
            {count}
          </button>
        )}
      </span>
      {(pinned || hovered) && lines.length > 0 && (
        <ul className={styles.notes}>
          {lines.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function InboxSection({ busy }: { busy: boolean }) {
  const state = useStoreSelector(inbox.state, selectState);
  const recent = useStoreSelector(recentProjects.list, selectRecent);
  const [filter, setFilterState] = useState<Filter>(storedFilter);
  const [menu, setMenu] = useState<{ x: number; y: number; key: string } | null>(null);
  const now = state.scannedAt;
  const setFilter = (patch: Partial<Filter>) => {
    const next = { ...filter, ...patch };
    setFilterState(next);
    storeFilter(next);
  };

  // The kinds the cards carry (for the reels: one per channel). A remembered kind or folder that is not there
  // now filters nothing, and applies again when it comes back.
  const kinds = [...new Set(state.entries.map((entry) => entry.card?.kind).filter((kind): kind is string => typeof kind === "string"))].sort((a, b) => a.localeCompare(b));
  const kind = filter.kind !== null && kinds.includes(filter.kind) ? filter.kind : null;
  const folder = filter.folder !== null && state.folders.some((other) => other.id === filter.folder) ? filter.folder : null;
  const shown = state.entries.filter((entry) => (kind === null || entry.card?.kind === kind) && (folder === null || entry.folderId === folder) && (!filter.waiting || isWaiting(entry)));
  const waiting = state.entries.filter(isWaiting).length;
  const reconnect = state.folders.filter((other) => other.access === "reconnect");
  const broken = state.folders.filter((other) => other.error !== null);
  const thumbnails = new Map(recent.map((entry) => [entry.id, entry.thumbnail]));

  const openMenu = (event: MouseEvent, entry: InboxEntry) => {
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY, key: entry.key });
  };
  const menuEntry = menu ? state.entries.find((entry) => entry.key === menu.key) : undefined;
  const menuRows: ContextMenuEntry[] = menuEntry
    ? [
        { kind: "item", id: "inbox.markReviewed", label: "Mark as reviewed", disabled: menuEntry.status === "reviewed", hint: "It is reviewed already" },
        { kind: "item", id: "inbox.markNotReviewed", label: "Mark as not reviewed", disabled: menuEntry.status === "new", hint: "It is not reviewed" },
        { kind: "separator" },
        { kind: "item", id: "inbox.remove", label: "Remove from inbox" },
      ]
    : [];

  const chip = (key: string, label: string, pressed: boolean, tooltip: string, onClick: () => void) => (
    <button key={key} type="button" className={styles.filter} data-control="" aria-pressed={pressed} data-tooltip={tooltip} onClick={onClick}>
      {label}
    </button>
  );

  return (
    <section className={styles.section} aria-labelledby="inbox-title">
      <div className={styles.header}>
        <h2 id="inbox-title" className={styles.overline}>
          Inbox{waiting > 0 ? ` · ${waiting} not reviewed` : ""}
        </h2>
        {state.folders.length > 0 && (
          <Button size="compact" icon={FolderPlus} commandId="project.chooseProjectsFolder" disabled={busy}>
            Add folder
          </Button>
        )}
      </div>

      {/* The filter row: All, one chip per kind, the folders when there are several, and only what waits. */}
      {state.folders.length > 0 && (
        <div className={styles.filterRow}>
          <div className={styles.filters} role="group" aria-label="Show only this kind">
            {chip("all", "All", kind === null && folder === null, "Every project in the watched folders", () => setFilter({ kind: null, folder: null }))}
            {kinds.map((name) => chip(`kind:${name}`, name, kind === name, `Only ${name}`, () => setFilter({ kind: kind === name ? null : name })))}
          </div>
          {state.folders.length > 1 && (
            <div className={styles.filters} role="group" aria-label="Show only this folder">
              {state.folders.map((other) => chip(`folder:${other.id}`, other.label, folder === other.id, `Only projects in the folder ${other.name}`, () => setFilter({ folder: folder === other.id ? null : other.id })))}
            </div>
          )}
          <div className={styles.filters} role="group" aria-label="Review status">
            {chip("waiting", "Not reviewed only", filter.waiting, "Hide what you have opened since it was generated, and edited copies", () => setFilter({ waiting: !filter.waiting }))}
          </div>
        </div>
      )}

      {/* One click per folder gives its access back after a restart (the browser wants a click for it). */}
      {reconnect.length > 0 && (
        <div className={styles.reconnect}>
          {reconnect.map((other) => (
            <Button key={other.id} size="compact" icon={RefreshCw} commandId="inbox.reconnect" tooltip={`Allow access to the folder ${other.name} again`} onClick={() => actions.run("inbox.reconnect", null, other.id)}>
              Reconnect {other.label}
            </Button>
          ))}
        </div>
      )}
      {broken.map((other) => (
        <p key={other.id} className={styles.empty}>
          {other.label} can't be read. It may have been moved or deleted. Remove it in Settings, General, or add it again.
        </p>
      ))}

      {state.folders.length === 0 ? (
        <div className={styles.emptyRow}>
          <p className={styles.empty}>{state.loaded ? "No folders are watched yet. Projects your generators write show up here on their own." : "Looking for projects…"}</p>
          {state.loaded && (
            <Button size="compact" icon={FolderPlus} commandId="project.chooseProjectsFolder" disabled={busy}>
              Add a folder to watch
            </Button>
          )}
        </div>
      ) : shown.length === 0 ? (
        <p className={styles.empty}>
          {!state.loaded ? "Looking for projects…" : state.entries.length === 0 ? (reconnect.length === state.folders.length ? "Reconnect a folder to see its projects." : "No projects in the watched folders yet.") : "No project matches this filter."}
        </p>
      ) : (
        <ul className={styles.grid}>
          {shown.map((entry) => (
            <Card key={entry.key} entry={entry} thumbnail={(entry.projectId !== null ? thumbnails.get(entry.projectId) : null) ?? null} disabled={busy} now={now} onMenu={openMenu} />
          ))}
        </ul>
      )}

      {menu && menuEntry && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          entries={menuRows}
          onSelect={(id) => {
            actions.run(id, null, menu.key);
            setMenu(null);
          }}
          onClose={() => setMenu(null)}
        />
      )}
    </section>
  );
}
