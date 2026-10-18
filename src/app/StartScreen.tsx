import { Film, FolderOpen, LayoutTemplate, Plus, X } from "lucide-react";
import { useEffect, useRef, type DragEvent } from "react";
import { useStoreSelector } from "../core/store/useStoreSelector.js";
import { formatFps } from "../project/projectPresets.js";
import type { RecentProject } from "../project/recentProjects.js";
import { describeTemplate, type ProjectTemplate } from "../project/templates.js";
import { Button } from "../ui/Button.js";
import { IconButton } from "../ui/IconButton.js";
import { appView, openDropped, openRecent } from "./projectController.js";
import { actions, recentProjects, templateStore } from "./services.js";
import { removeTemplate } from "./templateController.js";
import styles from "./StartScreen.module.css";

const selectBusy = (view: { busy: boolean }) => view.busy;
const selectRecent = (list: readonly RecentProject[]) => list;
const selectTemplates = (list: readonly ProjectTemplate[]) => list;

function formatModified(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** The thumbnail image: an object URL written to the element while it shows (revoked after). */
function Thumbnail({ blob }: { blob: Blob }) {
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const image = ref.current;
    if (!image) return undefined;
    const url = URL.createObjectURL(blob);
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  return <img ref={ref} className={styles.thumbImage} alt="" draggable={false} />;
}

/** A project tile (DS cards: thumbnail on top, title, tertiary meta): the frame at the playhead when it last closed. */
function RecentCard({ entry, disabled }: { entry: RecentProject; disabled: boolean }) {
  const open = () => {
    if (!disabled) void openRecent(entry);
  };
  return (
    <li className={styles.recent}>
      <button type="button" className={styles.recentOpen} data-control="" aria-disabled={disabled || undefined} onClick={open}>
        <span className={styles.thumb} aria-hidden="true">
          {entry.thumbnail ? <Thumbnail blob={entry.thumbnail} /> : <Film className={styles.thumbIcon} />}
        </span>
        <span className={styles.recentText}>
          <span className={styles.recentName}>{entry.name}</span>
          <span className={styles.recentMeta}>{formatModified(entry.modified)}</span>
          <span className={styles.recentMeta}>{entry.format ? `${entry.pathHint} · ${entry.format}` : entry.pathHint}</span>
        </span>
      </button>
      <span className={styles.remove}>
        <IconButton control icon={X} label="Remove from recent projects" onClick={() => void recentProjects.remove(entry.id)} />
      </span>
    </li>
  );
}

/** New from template (spec §15): picks the folder, then New project with the template's settings and tracks. */
function TemplateRow({ template, disabled }: { template: ProjectTemplate; disabled: boolean }) {
  return (
    <li className={styles.template}>
      <button
        type="button"
        className={styles.templateOpen}
        data-command="project.newFromTemplate"
        data-tooltip="New project from this template"
        aria-disabled={disabled || undefined}
        onClick={() => {
          if (!disabled) actions.run("project.newFromTemplate", null, template.id);
        }}
      >
        <LayoutTemplate className={styles.templateIcon} aria-hidden="true" />
        <span className={styles.recentText}>
          <span className={styles.recentName}>{template.name}</span>
          <span className={styles.recentMeta}>{describeTemplate(template, formatFps)}</span>
        </span>
      </button>
      <span className={styles.remove}>
        <IconButton control icon={X} label="Delete template" onClick={() => removeTemplate(template.id)} />
      </span>
    </li>
  );
}

/** Shown when no project is open (spec §15): new, open, recent projects, templates, drop a folder to open. */
export function StartScreen() {
  const busy = useStoreSelector(appView, selectBusy);
  const recent = useStoreSelector(recentProjects.list, selectRecent);
  const templates = useStoreSelector(templateStore.list, selectTemplates);
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
          <Button variant="hero" size="comfortable" icon={Plus} commandId="project.new" tooltip="New project" disabled={busy}>
            New project
          </Button>
          <Button size="comfortable" icon={FolderOpen} commandId="project.open" tooltip="Open a project folder" disabled={busy}>
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
                <RecentCard key={entry.id} entry={entry} disabled={busy} />
              ))}
            </ul>
          )}
        </section>

        <section className={styles.recentSection} aria-labelledby="templates-title">
          <h2 id="templates-title" className={styles.overline}>
            New from template
          </h2>
          {templates.length === 0 ? (
            <p className={styles.empty}>No templates yet. In a project, Save as template (Project section or the palette) keeps its size, frame rate, tracks and presets.</p>
          ) : (
            <ul className={styles.templateList}>
              {templates.map((template) => (
                <TemplateRow key={template.id} template={template} disabled={busy} />
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
