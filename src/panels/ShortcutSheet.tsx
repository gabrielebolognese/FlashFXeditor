import { Keyboard } from "lucide-react";
import { useSyncExternalStore } from "react";
import { closeShortcutSheet, keyLabel, shortcutGroups, shortcutSheet } from "../app/commandController.js";
import { actions } from "../app/services.js";
import type { FocusScope } from "../core/keyboard/focusScope.js";
import { keymap } from "../core/keyboard/keymap.js";
import { useStoreSelector } from "../core/store/useStoreSelector.js";
import { Button } from "../ui/Button.js";
import { Modal } from "../ui/Modal.js";
import styles from "./ShortcutSheet.module.css";

// The in-app cheat sheet (Batch 40, Shift+/): every bound command by category, its keys and where they
// act, rendered from the live keymap (a rebinding shows at once). Edit shortcuts opens the editor in the
// settings.

const subscribeKeymap = (listener: () => void) => keymap.subscribe(listener);
const keymapSnapshot = () => keymap.getOverrides();

const SCOPE_NAMES: Record<FocusScope, string> = {
  global: "Everywhere",
  timeline: "Timeline",
  preview: "Preview",
  media: "Media",
  properties: "Properties",
  textEditing: "Text editing",
  dialog: "Dialogs",
};

/** Where a command's keys act, unless everywhere ("Timeline, Preview"). */
export function scopeText(id: string): string | null {
  const scopes = keymap.scopesFor(id);
  return scopes.length === 1 && scopes[0] === "global" ? null : scopes.map((scope) => SCOPE_NAMES[scope]).join(", ");
}

function Sheet() {
  useSyncExternalStore(subscribeKeymap, keymapSnapshot);
  const groups = shortcutGroups({ boundOnly: true });
  const edit = () => {
    closeShortcutSheet();
    actions.run("app.settings");
  };
  return (
    <Modal
      title="Keyboard shortcuts"
      icon={Keyboard}
      size="xl"
      onClose={closeShortcutSheet}
      footer={
        <>
          <Button commandId="app.settings" onClick={edit}>
            Edit shortcuts
          </Button>
          <Button control variant="primary" onClick={closeShortcutSheet}>
            Done
          </Button>
        </>
      }
    >
      <div className={styles.columns}>
        {groups.map((group) => (
          <section key={group.category} className={styles.group} aria-label={group.category}>
            <h3 className={styles.heading}>{group.category}</h3>
            {group.commands.map((info) => {
              const where = scopeText(info.id);
              return (
                <div key={info.id} className={styles.row}>
                  <span className={styles.label}>
                    {info.label}
                    {where && <span className={styles.scope}> · {where}</span>}
                  </span>
                  <span className={styles.keys}>
                    {keymap.keysFor(info.id).map((keys) => (
                      <kbd key={keys} className={styles.key}>
                        {keyLabel(keys)}
                      </kbd>
                    ))}
                  </span>
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </Modal>
  );
}

/** Rendered by the app; shows the cheat sheet only while it is open. */
export function ShortcutSheet() {
  const open = useStoreSelector(shortcutSheet, (state) => state);
  return open ? <Sheet /> : null;
}
