import { Lock } from "lucide-react";
import { useStoreSelector } from "../core/store/useStoreSelector.js";
import type { SaveStatus } from "../project/Autosaver.js";
import { Button } from "../ui/Button.js";
import styles from "./ReadOnlyBanner.module.css";
import { saveStatus } from "./services.js";

const selectReadOnly = (status: SaveStatus) => status.readOnly;

/**
 * Shown while the project folder has no write permission (spec §15). Nothing is written meanwhile.
 * Since Batch 46 it is a notice in the app bar's free middle, not a strip over the workspace: granting
 * the permission no longer moves the four panels, and the app bar stays the only element outside them
 * (spec §2.1).
 */
export function ReadOnlyBanner() {
  const readOnly = useStoreSelector(saveStatus, selectReadOnly);
  if (!readOnly) return null;
  return (
    <div className={styles.banner} role="status">
      <span className={styles.notice} data-tooltip="Shorts Editor has no permission to write to this folder, so changes are not saved.">
        <Lock className={styles.icon} aria-hidden="true" />
        <span className={styles.text}>Read-only: changes are not saved</span>
      </span>
      <Button size="compact" commandId="project.allowEditing">
        Allow editing
      </Button>
    </div>
  );
}
