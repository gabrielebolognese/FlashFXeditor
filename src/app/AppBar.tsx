import { Redo2, Settings, Undo2, Upload } from "lucide-react";
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { MAX_PROJECT_NAME, renameProject } from "../core/commands/projectCommands.js";
import type { Project } from "../core/document/types.js";
import { useStoreSelector } from "../core/store/useStoreSelector.js";
import type { SaveStatus } from "../project/Autosaver.js";
import { formatFps } from "../project/projectPresets.js";
import { IconButton } from "../ui/IconButton.js";
import { shortcutLabel } from "../ui/shortcutLabel.js";
import styles from "./AppBar.module.css";
import { allowEditing, saveNow } from "./projectController.js";
import { actions, documentStore, saveStatus } from "./services.js";

const undo = () => actions.run("history.undo");
const redo = () => actions.run("history.redo");
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
        dot.setAttribute("aria-label", text);
      },
      { fireImmediately: true },
    );
  }, []);
  const onClick = () => {
    if (saveStatus.getState().readOnly) allowEditing();
    else saveNow();
  };
  return <button ref={ref} type="button" className={styles.saveDot} data-shortcut={shortcutLabel("project.save")} onMouseDown={keepFocus} onClick={onClick} />;
}

/** Click to rename; Enter or blur commits (one undoable command), Escape cancels. */
function ProjectName() {
  const name = useStoreSelector(documentStore, selectName);
  const [editing, setEditing] = useState(false);
  const cancelled = useRef(false);

  if (!editing) {
    return (
      <button type="button" className={styles.projectName} data-tooltip="Rename project" onClick={() => setEditing(true)}>
        {name}
      </button>
    );
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") event.currentTarget.blur();
    else if (event.key === "Escape") {
      cancelled.current = true;
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
 * Export, settings. No menus.
 * TODO(batch 44): Export opens the Export tab in the properties panel.
 */
export function AppBar() {
  // Re-renders only when undo/redo availability or labels change, or the badge text.
  const history = useStoreSelector(documentStore.history, (h) => h);
  const badge = useStoreSelector(documentStore, selectBadge);

  return (
    <header className={styles.bar}>
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
        onClick={undo}
      />
      <IconButton
        icon={Redo2}
        label={history.redoLabel ? `Redo ${history.redoLabel}` : "Redo"}
        commandId="history.redo"
        disabled={!history.canRedo}
        size="default"
        onClick={redo}
      />
      <div className={styles.divider} />
      <span className={styles.badge}>{badge}</span>

      <div className={styles.spacer} />
      <button
        type="button"
        className={styles.export}
        aria-disabled="true"
        data-tooltip="Export"
        data-shortcut={shortcutLabel("app.export")}
        onMouseDown={keepFocus}
      >
        <Upload className={styles.exportIcon} strokeWidth={2.5} aria-hidden="true" />
        Export
      </button>
      {/* TODO(batch 42): settings panel. */}
      <IconButton icon={Settings} label="Settings" disabled size="default" />
    </header>
  );
}
