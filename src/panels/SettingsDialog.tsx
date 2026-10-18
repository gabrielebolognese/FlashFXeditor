import { FileDown, FileUp, Plus, RotateCcw, Settings, X } from "lucide-react";
import { useEffect, useState, useSyncExternalStore, type MouseEvent } from "react";
import {
  closeSettings,
  exportKeymap,
  importKeymap,
  keyLabel,
  keymapConflicts,
  resetAllKeys,
  resetCommandKeys,
  setCommandKeys,
  settingsDialog,
  shortcutGroups,
} from "../app/commandController.js";
import { commandLabel } from "../app/commandCatalog.js";
import { actions, appSettings } from "../app/services.js";
import { keymap } from "../core/keyboard/keymap.js";
import { detectPlatform } from "../core/keyboard/keys.js";
import { recordChord, type KeyConflict } from "../core/keyboard/rebind.js";
import { useStoreSelector } from "../core/store/useStoreSelector.js";
import { Button } from "../ui/Button.js";
import { cx } from "../ui/cx.js";
import { IconButton } from "../ui/IconButton.js";
import { Modal } from "../ui/Modal.js";
import { TextField } from "../ui/TextField.js";
import styles from "./SettingsDialog.module.css";
import { scopeText } from "./ShortcutSheet.js";

// Settings (spec §17 app bar gear). Batch 40 builds its Shortcuts tab, the shortcut editor (spec §18 "can
// rebind any action; the keymap file is the default"): every bindable command by category with its keys;
// + records a key press (Esc cancels), a key's x removes it, a click on a key records its replacement,
// Reset puts back the command's default keys; conflicts with another command in the same scope (or a
// global key a panel's binding hides) are flagged on both rows; the keymap exports to and imports from a
// JSON file. Changes apply at once: tooltips, menus, the palette and the cheat sheet read the live keymap.
// Batch 41 adds the Media tab: the import mode (spec §9.1: copy into media/, the default, or link to the
// original files), through the `media.importMode.*` commands.
// TODO(batch 42): the General tab (autosave, cache, punch zoom, auto-duck parameters).

const subscribeKeymap = (listener: () => void) => keymap.subscribe(listener);
const keymapSnapshot = () => keymap.getOverrides();
const keepFocus = (event: MouseEvent) => event.preventDefault();

interface Recording {
  id: string;
  /** The key replaced, or null to add one. */
  replace: number | null;
}

function conflictText(conflicts: readonly KeyConflict[]): string {
  return conflicts.map((conflict) => `${keyLabel(conflict.keys)} is also ${commandLabel(conflict.other)}${scopeText(conflict.other) ? ` (${scopeText(conflict.other)})` : ""}`).join(" · ");
}

function ShortcutRow({ id, recording, onRecord, conflicts }: { id: string; recording: Recording | null; onRecord: (recording: Recording | null) => void; conflicts: readonly KeyConflict[] }) {
  const keys = keymap.keysFor(id);
  const custom = keymap.isCustom(id);
  const where = scopeText(id);
  const clashing = new Set(conflicts.map((conflict) => conflict.keys));
  const recordingHere = recording?.id === id;
  return (
    <div className={styles.row} data-shortcut-row={id} data-conflict={conflicts.length > 0 || undefined}>
      <span className={styles.name}>
        <span className={styles.label}>{commandLabel(id)}</span>
        {where && <span className={styles.scope}>{where}</span>}
      </span>
      <span className={styles.keys}>
        {keys.map((keysText, index) =>
          recordingHere && recording?.replace === index ? (
            <span key={keysText} className={cx(styles.chip, styles.recording)}>
              Press a key…
            </span>
          ) : (
            <span key={keysText} className={cx(styles.chip, clashing.has(keysText) && styles.clash)}>
              <button type="button" className={styles.chipKey} data-tooltip="Click, then press the new key" aria-label={`${commandLabel(id)}: change ${keyLabel(keysText)}`} onMouseDown={keepFocus} onClick={() => onRecord({ id, replace: index })}>
                {keyLabel(keysText)}
              </button>
              <button type="button" className={styles.chipRemove} aria-label={`${commandLabel(id)}: remove ${keyLabel(keysText)}`} data-tooltip="Remove this key" onMouseDown={keepFocus} onClick={() => setCommandKeys(id, keys.filter((_, i) => i !== index))}>
                <X aria-hidden="true" />
              </button>
            </span>
          ),
        )}
        {recordingHere && recording?.replace === null && <span className={cx(styles.chip, styles.recording)}>Press a key…</span>}
      </span>
      <span className={styles.actions}>
        <IconButton control icon={Plus} label={recordingHere ? "Cancel (Esc)" : "Add a key"} pressed={recordingHere && recording?.replace === null} onClick={() => onRecord(recordingHere ? null : { id, replace: null })} />
        <IconButton control icon={RotateCcw} label="Reset to the default keys" disabled={!custom} onClick={() => resetCommandKeys(id)} />
      </span>
      {conflicts.length > 0 && <span className={styles.conflict}>{conflictText(conflicts)}</span>}
    </div>
  );
}

function ShortcutEditor() {
  useSyncExternalStore(subscribeKeymap, keymapSnapshot);
  const [query, setQuery] = useState("");
  const [recording, setRecording] = useState<Recording | null>(null);
  const conflicts = keymapConflicts();
  const changed = Object.keys(keymap.getOverrides()).length;

  // Recording: the next key press (capture phase, before the dispatcher and the dialog's Escape) is the key.
  useEffect(() => {
    if (!recording) return undefined;
    const platform = detectPlatform();
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setRecording(null);
        return;
      }
      const chord = recordChord(event, platform);
      if (chord === null) return;
      const keys = keymap.keysFor(recording.id);
      const next = recording.replace === null ? [...keys, chord] : keys.map((keysText, index) => (index === recording.replace ? chord : keysText));
      setCommandKeys(recording.id, next);
      setRecording(null);
    };
    const cancel = () => setRecording(null);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", cancel);
    };
  }, [recording]);

  const q = query.trim().toLowerCase();
  const groups = shortcutGroups()
    .map((group) => ({
      ...group,
      commands: group.commands.filter(
        (info) => q === "" || `${info.label} ${group.category} ${info.keywords ?? ""} ${keymap.keysFor(info.id).map(keyLabel).join(" ")}`.toLowerCase().includes(q),
      ),
    }))
    .filter((group) => group.commands.length > 0);

  return (
    <div className={styles.editor} data-control="">
      <div className={styles.tools}>
        <div className={styles.search}>
          <TextField value={query} onChange={setQuery} ariaLabel="Search shortcuts" placeholder="Search commands or keys" />
        </div>
        <span className={styles.count}>{changed === 0 ? "Default keymap" : `${changed} changed`}</span>
        <Button control size="compact" icon={FileUp} tooltip="Import a keymap JSON file" onClick={() => void importKeymap()}>
          Import…
        </Button>
        <Button control size="compact" icon={FileDown} tooltip="Export the keymap as a JSON file" onClick={() => void exportKeymap()}>
          Export…
        </Button>
        <Button control size="compact" icon={RotateCcw} tooltip="Every command back to its default keys" disabled={changed === 0} onClick={resetAllKeys}>
          Reset all
        </Button>
      </div>
      <div className={styles.list}>
        {groups.length === 0 && <p className={styles.empty}>No command matches “{query.trim()}”.</p>}
        {groups.map((group) => (
          <section key={group.category} aria-label={group.category}>
            <h3 className={styles.heading}>{group.category}</h3>
            {group.commands.map((info) => (
              <ShortcutRow key={info.id} id={info.id} recording={recording} onRecord={setRecording} conflicts={conflicts.get(info.id) ?? []} />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

const IMPORT_MODES = [
  {
    mode: "copy",
    command: "media.importMode.copy",
    label: "Copy files into the project folder",
    note: "The project stays self-contained in one folder you can move or back up.",
  },
  {
    mode: "reference",
    command: "media.importMode.reference",
    label: "Link to the original files",
    note: "Nothing is copied. Moved or renamed files go offline until you relink them, and after a restart the browser asks again before reading them.",
  },
] as const;

/** The Media tab (Batch 41): how imports bring files into the project (spec §9.1). */
function MediaSettings() {
  const mode = useStoreSelector(appSettings, (state) => state.importMode);
  return (
    <div className={styles.media}>
      <p className={styles.mediaHeading}>Import</p>
      <div className={styles.choices} role="radiogroup" aria-label="Import mode">
        {IMPORT_MODES.map((choice) => (
          <button key={choice.mode} type="button" role="radio" aria-checked={mode === choice.mode} className={styles.choice} data-command={choice.command} onClick={() => actions.run(choice.command)}>
            <span className={styles.radio} aria-hidden="true" />
            <span>
              <span className={styles.choiceLabel}>{choice.label}</span>
              <span className={styles.choiceNote}>{choice.note}</span>
            </span>
          </button>
        ))}
      </div>
      <p className={styles.hint}>Files you paste are always copied. Media already in the project keep how they were imported.</p>
    </div>
  );
}

function Dialog() {
  const [tab, setTab] = useState<"shortcuts" | "media">("shortcuts");
  return (
    <Modal
      title="Settings"
      icon={Settings}
      size="xl"
      onClose={closeSettings}
      footer={
        <Button control variant="primary" onClick={closeSettings}>
          Done
        </Button>
      }
    >
      <div className={styles.tabs} role="tablist" aria-label="Settings">
        <button type="button" role="tab" aria-selected={tab === "shortcuts"} className={styles.tab} onMouseDown={keepFocus} onClick={() => setTab("shortcuts")}>
          Shortcuts
        </button>
        <button type="button" role="tab" aria-selected={tab === "media"} className={styles.tab} onMouseDown={keepFocus} onClick={() => setTab("media")}>
          Media
        </button>
      </div>
      {tab === "shortcuts" ? <ShortcutEditor /> : <MediaSettings />}
    </Modal>
  );
}

/** Rendered by the app; shows the settings only while they are open. */
export function SettingsDialog() {
  const open = useStoreSelector(settingsDialog, (state) => state);
  return open ? <Dialog /> : null;
}
