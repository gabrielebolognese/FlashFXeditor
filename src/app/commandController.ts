// Commands as a whole (Batch 40, spec §3.6, §17, §18): the command palette (Mod+Shift+P: fuzzy search,
// shortcuts, recent first), the cheat sheet (Shift+/: the live keymap by category), the settings dialog
// with the shortcut editor (rebind, conflicts within scopes, reset, export / import keymap JSON), the
// keymap overrides kept in the app settings, and the bridge the shared ui components run commands and
// read labels through.
import type { LucideIcon } from "lucide-react";
import { pushRecent, rankCommands } from "../core/commands/fuzzy.js";
import type { FocusScope } from "../core/keyboard/focusScope.js";
import { keymap, type KeymapOverrides } from "../core/keyboard/keymap.js";
import { detectPlatform, formatChord, type Platform } from "../core/keyboard/keys.js";
import { findConflicts, formatKeymapFile, parseKeymapFile, type KeyConflict } from "../core/keyboard/rebind.js";
import { createStore } from "../core/store/createStore.js";
import { MAX_RECENT_COMMANDS } from "../project/appSettings.js";
import { setCommandBridge } from "../ui/commands.js";
import { showToast } from "../ui/toasts.js";
import { COMMAND_CATEGORIES, COMMANDS, commandInfo, type CommandCategory, type CommandInfo } from "./commandCatalog.js";
import { pickFile, saveFile, type PickerType } from "./filePickers.js";
import { appView } from "./projectController.js";
import { actions, appSettings, focusScopes } from "./services.js";

/** The open palette and the scope its command runs in (the one that owned the keyboard before it), or null. */
export const commandPalette = createStore<{ scope: FocusScope } | null>(null);
/** The cheat sheet is open. */
export const shortcutSheet = createStore(false);
export type SettingsTab = "general" | "shortcuts";
/** The settings dialog's tab while it is open (General or Shortcuts), else null. */
export const settingsDialog = createStore<SettingsTab | null>(null);

let platform: Platform | null = null;
const currentPlatform = () => (platform ??= detectPlatform());

/** A key as the user reads it ("Ctrl+K", "⌘K"). */
export function keyLabel(keys: string): string {
  try {
    return formatChord(keys, currentPlatform());
  } catch {
    return keys;
  }
}

/** Whether the catalog entry is in this build (dev-only commands exist in dev builds only). */
const inBuild = (info: CommandInfo) => !info.dev || import.meta.env.DEV;

/** Can run now: registered, its `enabled` predicate holds, and a project is open unless it runs anywhere. */
export function canRun(id: string): boolean {
  const info = commandInfo(id);
  if (!actions.isEnabled(id)) return false;
  return info?.anywhere === true || appView.getState().project !== null;
}

export interface PaletteRow {
  id: string;
  label: string;
  category: CommandCategory;
  icon: LucideIcon | undefined;
  keywords: string | undefined;
  /** The first key, formatted ("" when unbound). */
  keys: string;
  enabled: boolean;
}

/** The palette's rows for `query`: the registered commands of the catalog that the palette lists, ranked (recent first). */
export function paletteRows(query: string): PaletteRow[] {
  const rows: PaletteRow[] = COMMANDS.filter((info) => info.palette !== false && inBuild(info) && actions.has(info.id)).map((info) => {
    const first = keymap.keysFor(info.id)[0];
    return { id: info.id, label: info.label, category: info.category, icon: info.icon, keywords: info.keywords, keys: first ? keyLabel(first) : "", enabled: canRun(info.id) };
  });
  return rankCommands(rows, query, appSettings.getState().recentCommands);
}

export function openPalette(): void {
  if (commandPalette.getState()) return;
  const scope = focusScopes.scope;
  commandPalette.set({ scope: scope === "dialog" || scope === "textEditing" ? "global" : scope });
}

/** Closes the palette; the keyboard goes back to the panel that had it. */
export function closePalette(): void {
  const open = commandPalette.getState();
  if (!open) return;
  commandPalette.set(null);
  focusScopes.set(open.scope);
}

/**
 * Runs a palette row: the palette closes first, then the command runs as its key would in the panel
 * that had the keyboard (a held key gets its key-up right after, so a step steps once).
 */
export function runFromPalette(id: string): void {
  const open = commandPalette.getState();
  if (!open || !canRun(id)) return;
  closePalette();
  void appSettings.update({ recentCommands: pushRecent(appSettings.getState().recentCommands, id, MAX_RECENT_COMMANDS) });
  const hold = keymap.binding(id)?.hold === true;
  actions.run(id, { scope: open.scope, phase: "down", repeat: false });
  if (hold) actions.run(id, { scope: open.scope, phase: "up", repeat: false });
}

export function closeShortcutSheet(): void {
  if (!shortcutSheet.getState()) return;
  shortcutSheet.set(false);
  focusScopes.set("global");
}

export function closeSettings(): void {
  if (!settingsDialog.getState()) return;
  settingsDialog.set(null);
  focusScopes.set("global");
}

// --- Cheat sheet and shortcut editor ---------------------------------------------------------------

export interface ShortcutGroup {
  category: CommandCategory;
  commands: readonly CommandInfo[];
}

/** The commands a user can bind (the palette's, plus the keyed ones it leaves out), by category. */
export function shortcutGroups(options: { boundOnly?: boolean } = {}): ShortcutGroup[] {
  const groups: ShortcutGroup[] = [];
  for (const category of COMMAND_CATEGORIES) {
    const commands = COMMANDS.filter(
      (info) =>
        info.category === category &&
        inBuild(info) &&
        (actions.has(info.id) || keymap.keysFor(info.id).length > 0) &&
        (info.palette !== false || keymap.defaultKeysFor(info.id).length > 0) &&
        (!options.boundOnly || keymap.keysFor(info.id).length > 0),
    );
    if (commands.length > 0) groups.push({ category, commands });
  }
  return groups;
}

/** Conflicts of the live keymap per command id (Batch 40 "conflict detection within scope"). */
export function keymapConflicts(): Map<string, KeyConflict[]> {
  return findConflicts(keymap.bindings(), currentPlatform(), (id, keys) => keymap.defaultKeysFor(id).includes(keys));
}

function storeOverrides(overrides: KeymapOverrides): void {
  // The keymap follows the settings (installCommandController), so the change applies at once.
  void appSettings.update({ keymap: overrides });
}

/** Sets a command's keys (the shortcut editor's record, add and remove). */
export function setCommandKeys(id: string, keys: readonly string[]): void {
  storeOverrides({ ...keymap.getOverrides(), [id]: [...new Set(keys)] });
}

export function resetCommandKeys(id: string): void {
  const next = { ...keymap.getOverrides() };
  delete next[id];
  storeOverrides(next);
}

export function resetAllKeys(): void {
  storeOverrides({});
}

const KEYMAP_TYPES: readonly PickerType[] = [{ description: "Keymap", accept: { "application/json": [".json"] } }];

/** Export keymap JSON: every bindable command's keys. */
export async function exportKeymap(): Promise<void> {
  const keysById: Record<string, readonly string[]> = {};
  for (const group of shortcutGroups()) for (const info of group.commands) keysById[info.id] = keymap.keysFor(info.id);
  try {
    const saved = await saveFile("shorts-editor-keymap.json", KEYMAP_TYPES, () => formatKeymapFile(keysById));
    if (saved !== null) showToast({ tone: "success", message: "Keymap exported", detail: saved });
  } catch (error) {
    showToast({ tone: "error", message: "Couldn't export the keymap", detail: error instanceof Error ? error.message : String(error) });
  }
}

/** Import keymap JSON: the file's commands take its keys, the others their defaults. */
export async function importKeymap(): Promise<void> {
  try {
    const file = await pickFile(KEYMAP_TYPES);
    if (!file) return;
    const known = new Set(COMMANDS.map((info) => info.id));
    const parsed = parseKeymapFile(await file.text(), known, currentPlatform());
    if (!parsed) {
      showToast({ tone: "error", message: "Not a keymap file", detail: "Export a keymap from Settings > Shortcuts to get one." });
      return;
    }
    storeOverrides(parsed.bindings);
    const count = Object.keys(parsed.bindings).length;
    showToast({
      tone: "success",
      message: `Keymap imported: ${count} command${count === 1 ? "" : "s"}`,
      ...(parsed.skipped > 0 && { detail: `${parsed.skipped} unknown command${parsed.skipped === 1 ? "" : "s"} or key${parsed.skipped === 1 ? "" : "s"} skipped.` }),
    });
  } catch (error) {
    showToast({ tone: "error", message: "Couldn't import the keymap", detail: error instanceof Error ? error.message : String(error) });
  }
}

/** Registers the palette, the cheat sheet and the settings, links the keymap to the settings, installs the ui bridge. */
export function installCommandController(): () => void {
  setCommandBridge({
    run: (id, arg) => void actions.run(id, null, arg),
    label: (id) => commandInfo(id)?.label,
    icon: (id) => commandInfo(id)?.icon,
    enabled: (id) => !actions.hasPredicate(id) || actions.isEnabled(id),
    scope: () => focusScopes.scope,
    setScope: (scope) => focusScopes.set(scope as FocusScope),
  });
  const stops = [
    () => setCommandBridge(null),
    appSettings.select((settings) => settings.keymap, (overrides) => keymap.setOverrides(overrides), { fireImmediately: true }),
    actions.register("app.commandPalette", () => (commandPalette.getState() ? closePalette() : openPalette())),
    actions.register("app.shortcuts", () => (shortcutSheet.getState() ? closeShortcutSheet() : shortcutSheet.set(true))),
    // The tab as argument ("shortcuts": the cheat sheet's Edit shortcuts); General by default.
    actions.register("app.settings", (_context, tab) => settingsDialog.set(tab === "shortcuts" ? "shortcuts" : "general")),
  ];
  return () => {
    for (const stop of stops) stop();
  };
}
