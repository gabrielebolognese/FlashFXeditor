import { Lock } from "lucide-react";
import { useStoreSelector } from "../core/store/useStoreSelector.js";
import type { SaveStatus } from "../project/Autosaver.js";
import { Button } from "../ui/Button.js";
import { allowEditing } from "./projectController.js";
import styles from "./ReadOnlyBanner.module.css";
import { saveStatus } from "./services.js";

const selectReadOnly = (status: SaveStatus) => status.readOnly;

/** Shown while the project folder has no write permission (spec §15). Nothing is written meanwhile. */
export function ReadOnlyBanner() {
  const readOnly = useStoreSelector(saveStatus, selectReadOnly);
  if (!readOnly) return null;
  return (
    <div className={styles.banner} role="status">
      <Lock className={styles.icon} aria-hidden="true" />
      <span className={styles.text}>Read-only: Shorts Editor has no permission to write to this folder, so changes are not saved.</span>
      <Button size="compact" onClick={allowEditing}>
        Allow editing
      </Button>
    </div>
  );
}
