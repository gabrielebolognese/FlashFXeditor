import { RefreshCw } from "lucide-react";
import { useStoreSelector } from "../core/store/useStoreSelector.js";
import { Button } from "../ui/Button.js";
import { externalView } from "./externalController.js";
import styles from "./ReadOnlyBanner.module.css";

const selectPending = (view: { pending: boolean }) => view.pending;

/**
 * Shown in the app bar's middle while project.json changed on disk and the project has unsaved changes
 * (spec §21.5): Reload takes the disk version (yours goes to History), Keep mine saves over it (the disk
 * version goes to History). Autosave waits for the answer. Same notice look as the read-only one.
 */
export function ExternalChangeBanner() {
  const pending = useStoreSelector(externalView, selectPending);
  if (!pending) return null;
  return (
    <div className={styles.banner} role="status">
      <span className={styles.notice} data-tooltip="Another tool wrote project.json while you have unsaved changes. Nothing is saved until you choose.">
        <RefreshCw className={styles.icon} aria-hidden="true" />
        <span className={styles.text}>project.json changed on disk</span>
      </span>
      <Button size="compact" commandId="project.reloadFromDisk">
        Reload
      </Button>
      <Button size="compact" commandId="project.keepMine">
        Keep mine
      </Button>
    </div>
  );
}
