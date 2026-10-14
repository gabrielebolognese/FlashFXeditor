import { Redo2, Settings, Undo2, Upload } from "lucide-react";
import { useStoreSelector } from "../core/store/useStoreSelector.js";
import { IconButton } from "../ui/IconButton.js";
import { shortcutLabel } from "../ui/shortcutLabel.js";
import styles from "./AppBar.module.css";
import { actions, documentStore } from "./services.js";

const undo = () => actions.run("history.undo");
const redo = () => actions.run("history.redo");

/**
 * The slim bar above the panels (spec §2.1): project name, save status, undo/redo, project badge,
 * Export, settings. No menus.
 * TODO(batch 03): editable project name, live save status and the project's resolution/fps.
 * TODO(batch 44): Export opens the Export tab in the properties panel.
 */
export function AppBar() {
  // Re-renders only when undo/redo availability or labels change.
  const history = useStoreSelector(documentStore.history, (h) => h);

  return (
    <header className={styles.bar}>
      <div className={styles.brand} aria-hidden="true">
        S
      </div>
      <span className={styles.projectName}>Untitled project</span>
      <span className={styles.saveDot} data-state="none" data-tooltip="No project open" />

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
      <span className={styles.badge}>1080×1920 · 30 fps</span>

      <div className={styles.spacer} />
      <button
        type="button"
        className={styles.export}
        aria-disabled="true"
        data-tooltip="Export"
        data-shortcut={shortcutLabel("app.export")}
        onMouseDown={(event) => event.preventDefault()}
      >
        <Upload className={styles.exportIcon} strokeWidth={2.5} aria-hidden="true" />
        Export
      </button>
      <IconButton icon={Settings} label="Settings" disabled size="default" />
    </header>
  );
}
