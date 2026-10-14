import { Film, FolderOpen, Plus, X } from "lucide-react";
import { useRef, type DragEvent } from "react";
import { useStoreSelector } from "../core/store/useStoreSelector.js";
import type { RecentProject } from "../project/recentProjects.js";
import { Button } from "../ui/Button.js";
import { IconButton } from "../ui/IconButton.js";
import { appView, newProject, openDropped, openProject, openRecent } from "./projectController.js";
import { recentProjects } from "./services.js";
import styles from "./StartScreen.module.css";

const selectBusy = (view: { busy: boolean }) => view.busy;
const selectRecent = (list: readonly RecentProject[]) => list;

function formatModified(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function RecentRow({ entry, disabled }: { entry: RecentProject; disabled: boolean }) {
  const open = () => {
    if (!disabled) void openRecent(entry);
  };
  return (
    <li className={styles.recent}>
      <button type="button" className={styles.recentOpen} aria-disabled={disabled || undefined} onClick={open}>
        <span className={styles.thumb} aria-hidden="true">
          <Film className={styles.thumbIcon} />
        </span>
        <span className={styles.recentText}>
          <span className={styles.recentName}>{entry.name}</span>
          <span className={styles.recentMeta}>
            {entry.pathHint} · {formatModified(entry.modified)}
          </span>
        </span>
      </button>
      <span className={styles.remove}>
        <IconButton icon={X} label="Remove from recent projects" onClick={() => void recentProjects.remove(entry.id)} />
      </span>
    </li>
  );
}

/** Shown when no project is open (spec §15): new, open, recent projects, drop a folder to open. */
export function StartScreen() {
  const busy = useStoreSelector(appView, selectBusy);
  const recent = useStoreSelector(recentProjects.list, selectRecent);
  const screenRef = useRef<HTMLDivElement>(null);
  const dragDepth = useRef(0);

  // Drop highlight through a data attribute: no React render while dragging.
  const setDropping = (on: boolean) => {
    const screen = screenRef.current;
    if (!screen) return;
    if (on) screen.dataset.dropping = "";
    else delete screen.dataset.dropping;
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
    event.preventDefault();
    dragDepth.current = 0;
    setDropping(false);
    // Handles must be requested synchronously inside the drop event.
    const handles = [...event.dataTransfer.items]
      .filter((item) => item.kind === "file")
      .map((item) => (item as DataTransferItem & { getAsFileSystemHandle(): Promise<FileSystemHandle | null> }).getAsFileSystemHandle());
    void openDropped(handles);
  };

  return (
    <div ref={screenRef} className={styles.screen} onDragEnter={onDragEnter} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      <main className={styles.column}>
        <header className={styles.header}>
          <div className={styles.brand} aria-hidden="true">
            S
          </div>
          <div>
            <h1 className={styles.title}>Shorts Editor</h1>
            <p className={styles.subtitle}>Projects live in a folder you pick. Everything saves automatically.</p>
          </div>
        </header>

        <div className={styles.actions}>
          <Button variant="hero" size="comfortable" icon={Plus} commandId="project.new" tooltip="New project" disabled={busy} onClick={() => void newProject()}>
            New project
          </Button>
          <Button size="comfortable" icon={FolderOpen} commandId="project.open" tooltip="Open a project folder" disabled={busy} onClick={() => void openProject()}>
            Open project
          </Button>
        </div>

        <section className={styles.recentSection} aria-labelledby="recent-title">
          <h2 id="recent-title" className={styles.overline}>
            Recent projects
          </h2>
          {recent.length === 0 ? (
            <p className={styles.empty}>No recent projects yet.</p>
          ) : (
            <ul className={styles.recentList}>
              {recent.map((entry) => (
                <RecentRow key={entry.id} entry={entry} disabled={busy} />
              ))}
            </ul>
          )}
        </section>

        <p className={styles.hint}>Drop a project folder anywhere on this window to open it.</p>
      </main>
      <div className={styles.dropOverlay} aria-hidden="true">
        <FolderOpen className={styles.dropIcon} />
        Drop the project folder to open it
      </div>
    </div>
  );
}
