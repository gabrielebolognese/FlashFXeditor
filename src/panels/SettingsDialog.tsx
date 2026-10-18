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
  type SettingsTab,
} from "../app/commandController.js";
import { commandLabel } from "../app/commandCatalog.js";
import { keymap } from "../core/keyboard/keymap.js";
import { detectPlatform } from "../core/keyboard/keys.js";
import { recordChord, type KeyConflict } from "../core/keyboard/rebind.js";
import { useStoreSelector } from "../core/store/useStoreSelector.js";
import { Button } from "../ui/Button.js";
import { cx } from "../ui/cx.js";
import { IconButton } from "../ui/IconButton.js";
import { Modal } from "../ui/Modal.js";
import { TextField } from "../ui/TextField.js";
import { GeneralSettings } from "./settings/GeneralSettings.js";
import styles from "./SettingsDialog.module.css";
import { scopeText } from "./ShortcutSheet.js";

// Settings (spec §17 app bar gear). Batch 40 builds its Shortcuts tab, the shortcut editor (spec §18 "can
// rebind any action; the keymap file is the default"): every bindable command by category with its keys;
// + records a key press (Esc cancels), a key's x removes it, a click on a key records its replacement,
// Reset puts back the command's default keys; conflicts with another command in the same scope (or a
// global key a panel's binding hides) are flagged on both rows; the keymap exports to and imports from a
// JSON file. Changes apply at once: tooltips, menus, the palette and the cheat sheet read the live keymap.
// Batch 42 adds the General tab (settings/GeneralSettings.tsx: saving, the lengths of new clips, the
// default transition, editing, audio, transcription, media with Batch 41's import mode, storage with
// Clear cache), first; Shortcuts stays beside it (the cheat sheet's Edit shortcuts opens it).

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

function Dialog({ tab }: { tab: SettingsTab }) {
  const setTab = (next: SettingsTab) => settingsDialog.set(next);
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
        {/* A tab takes the focus: the field focused in the other tab unmounts, and the focus must stay in the dialog (Escape). */}
        <button type="button" role="tab" aria-selected={tab === "general"} className={styles.tab} onClick={() => setTab("general")}>
          General
        </button>
        <button type="button" role="tab" aria-selected={tab === "shortcuts"} className={styles.tab} onClick={() => setTab("shortcuts")}>
          Shortcuts
        </button>
      </div>
      {tab === "shortcuts" ? <ShortcutEditor /> : <GeneralSettings />}
    </Modal>
  );
}

/** Rendered by the app; shows the settings only while they are open. */
export function SettingsDialog() {
  const tab = useStoreSelector(settingsDialog, (state) => state);
  return tab ? <Dialog tab={tab} /> : null;
}
