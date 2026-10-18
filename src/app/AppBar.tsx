import { Activity, Redo2, Settings, Undo2, Upload } from "lucide-react";
import { useLayoutEffect, useRef, type KeyboardEvent, type MouseEvent } from "react";
import { MAX_PROJECT_NAME, renameProject } from "../core/commands/projectCommands.js";
import type { Project } from "../core/document/types.js";
import { useStoreSelector } from "../core/store/useStoreSelector.js";
import type { SaveStatus } from "../project/Autosaver.js";
import { formatFps } from "../project/projectPresets.js";
import { runCommand } from "../ui/commands.js";
import { IconButton } from "../ui/IconButton.js";
import styles from "./AppBar.module.css";
import { perfDev } from "./perfDev.js";
import { projectNaming } from "./projectController.js";
import { ReadOnlyBanner } from "./ReadOnlyBanner.js";
import { actions, documentStore, saveStatus } from "./services.js";

const keepFocus = (event: MouseEvent) => event.preventDefault();

const selectName = (project: Project) => project.name;
const selectBadge = (project: Project) => `${project.settings.width}×${project.settings.height} · ${formatFps(project.settings.fps)} fps`;

/** Dot state and hover text (spec §15: saved / saving / unsaved / error, hover shows details). */
function describeSaveStatus(status: SaveStatus): { state: string; text: string } {
  if (status.readOnly) return { state: "readonly", text: "Read-only: changes are not saved. Click to allow editing" };
  switch (status.state) {
    case "saving":
      return { state: "saving", text: "Saving…" };
    case "unsaved":
      return { state: "unsaved", text: "Unsaved changes. Click to save now" };
    case "error":
      return { state: "error", text: `Save failed: ${status.error ?? "unknown error"}. Click to retry` };
    case "saved":
      return { state: "saved", text: status.savedAt ? `All changes saved at ${new Date(status.savedAt).toLocaleTimeString()}` : "All changes saved" };
  }
}

/** Written straight to the DOM from the status store: saves never re-render React. */
function SaveDot() {
  const ref = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const dot = ref.current;
    if (!dot) return;
    return saveStatus.select(
      (status) => status,
      (status) => {
        const { state, text } = describeSaveStatus(status);
        dot.dataset.state = state;
        dot.dataset.tooltip = text;
        // Read-only: the click asks for write access; otherwise it saves now.
        dot.dataset.command = status.readOnly ? "project.allowEditing" : "project.save";
        dot.setAttribute("aria-label", text);
      },
      { fireImmediately: true },
    );
  }, []);
  const onClick = () => actions.run(saveStatus.getState().readOnly ? "project.allowEditing" : "project.save");
  return <button ref={ref} type="button" className={styles.saveDot} data-command="project.save" onMouseDown={keepFocus} onClick={onClick} />;
}

const setEditing = (editing: boolean) => projectNaming.set(editing);

/** Click to rename (`project.rename`); Enter or blur commits (one undoable command), Escape cancels. */
function ProjectName() {
  const name = useStoreSelector(documentStore, selectName);
  const editing = useStoreSelector(projectNaming, (state) => state);
  const cancelled = useRef(false);
  // Enter or Escape closes the field: the focus goes back to the name it replaced (Batch 46).
  const refocus = useRef(false);
  const button = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (editing || !refocus.current) return;
    refocus.current = false;
    button.current?.focus();
  }, [editing]);

  if (!editing) {
    return (
      <button ref={button} type="button" className={styles.projectName} data-tooltip="Rename project" data-command="project.rename" onClick={() => actions.run("project.rename")}>
        {name}
      </button>
    );
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      refocus.current = true;
      event.currentTarget.blur();
    } else if (event.key === "Escape") {
      cancelled.current = true;
      refocus.current = true;
      event.currentTarget.blur();
    }
  };
  return (
    <input
      className={styles.nameInput}
      defaultValue={name}
      maxLength={MAX_PROJECT_NAME}
      aria-label="Project name"
      spellCheck={false}
      autoFocus
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        if (!cancelled.current && event.currentTarget.value !== name) documentStore.dispatch(renameProject(event.currentTarget.value));
        cancelled.current = false;
        setEditing(false);
      }}
    />
  );
}

/**
 * The slim bar above the panels (spec §2.1): project name, save status, undo/redo, project badge,
 * Export (`app.export`: opens the Export tab in the properties panel, Batch 44), settings. No menus.
 */
export function AppBar() {
  // Re-renders only when undo/redo availability or labels change, or the badge text.
  const history = useStoreSelector(documentStore.history, (h) => h);
  const badge = useStoreSelector(documentStore, selectBadge);

  return (
    <header className={styles.bar} data-app-bar="">
      <div className={styles.brand} aria-hidden="true">
        S
      </div>
      <ProjectName />
      <SaveDot />

      <div className={styles.divider} />
      <IconButton
        icon={Undo2}
        label={history.undoLabel ? `Undo ${history.undoLabel}` : "Undo"}
        commandId="history.undo"
        disabled={!history.canUndo}
        size="default"
      />
      <IconButton
        icon={Redo2}
        label={history.redoLabel ? `Redo ${history.redoLabel}` : "Redo"}
        commandId="history.redo"
        disabled={!history.canRedo}
        size="default"
      />
      <div className={styles.divider} />
      <span className={styles.badge}>{badge}</span>

      <div className={styles.spacer}>
        <ReadOnlyBanner />
      </div>
      <button
        type="button"
        className={styles.export}
        data-tooltip="Export"
        data-command="app.export"
        onMouseDown={keepFocus}
        onClick={() => runCommand("app.export")}
      >
        <Upload className={styles.exportIcon} strokeWidth={2.5} aria-hidden="true" />
        Export
      </button>
      {import.meta.env.DEV && <PerfStatsToggle />}
      <IconButton icon={Settings} commandId="app.settings" size="default" />
    </header>
  );
}

const selectPerfStats = (state: { stats: boolean }) => state.stats;

/** Dev builds: the performance overlay's toggle (Batch 45). */
function PerfStatsToggle() {
  const shown = useStoreSelector(perfDev, selectPerfStats);
  return <IconButton icon={Activity} commandId="dev.togglePerfStats" label="Performance stats (dev)" pressed={shown} size="default" />;
}
