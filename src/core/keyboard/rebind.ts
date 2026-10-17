// Rebinding helpers for the shortcut editor (spec §18 "The shortcut editor (settings) can rebind any
// action; the keymap file is the default", Batch 40): recording a chord from a key press, conflict
// detection within scopes, and the keymap JSON file (export / import).
import type { FocusScope } from "./focusScope.js";
import type { KeyBinding } from "./keymap.js";
import { eventChords, parseChord, type Platform } from "./keys.js";

/** Scopes that never fall through to global bindings (KeyDispatcher): a global key does not act there. */
const ISOLATED: ReadonlySet<FocusScope> = new Set(["textEditing", "dialog"]);

const CHORD_MODIFIERS = new Set(["Ctrl", "Meta", "Alt", "Shift"]);

/** Splits a canonical chord ("Ctrl+Shift+K", "Ctrl++") into its modifiers and key. */
function splitChord(chord: string): { mods: string[]; key: string } {
  if (chord.endsWith("++")) return { mods: chord.slice(0, -2).split("+").filter(Boolean), key: "+" };
  if (chord === "+") return { mods: [], key: "+" };
  const parts = chord.split("+");
  const key = parts.pop() ?? "";
  return { mods: parts, key };
}

/**
 * The keymap string for a key press, e.g. "Mod+J" (Ctrl on Windows, Cmd on macOS); null for a bare
 * modifier. Symbols typed with Shift drop the Shift as the dispatcher does ("?" not "Shift+?").
 */
export function recordChord(event: Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">, platform: Platform): string | null {
  const chord = eventChords(event)[0];
  if (!chord) return null;
  const { mods, key } = splitChord(chord);
  const mod = platform === "mac" ? "Meta" : "Ctrl";
  const out = mods.filter((m) => CHORD_MODIFIERS.has(m)).map((m) => (m === mod ? "Mod" : m));
  // Mod first, as the defaults write it.
  out.sort((a, b) => (a === "Mod" ? -1 : b === "Mod" ? 1 : 0));
  return [...out, key].join("+");
}

const NAMED_KEYS = new Set([
  "Space",
  "Enter",
  "Escape",
  "Tab",
  "Backspace",
  "Delete",
  "Insert",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Left",
  "Right",
  "Up",
  "Down",
  "ContextMenu",
]);

/** Whether `keys` is a keymap string the dispatcher can match ("Mod+Shift+K", "F2", "?"). */
export function isValidKeys(keys: string, platform: Platform): boolean {
  if (typeof keys !== "string" || keys.trim() === "" || keys.length > 40) return false;
  try {
    const { key } = splitChord(parseChord(keys, platform));
    return key.length === 1 ? key !== " " : NAMED_KEYS.has(key) || /^F([1-9]|1[0-9]|2[0-4])$/.test(key);
  } catch {
    return false;
  }
}

/** Whether a binding in scopes `a` and one in scopes `b` can both see a key press. */
export function scopesOverlap(a: readonly FocusScope[], b: readonly FocusScope[]): boolean {
  for (const x of a) {
    for (const y of b) {
      if (x === y) return true;
      if (x === "global" && !ISOLATED.has(y)) return true;
      if (y === "global" && !ISOLATED.has(x)) return true;
    }
  }
  return false;
}

export interface KeyConflict {
  /** The key (keymap string) of this command that clashes. */
  keys: string;
  /** The other command bound to the same chord where both act. */
  other: string;
}

/**
 * Conflicts (Batch 40 "conflict detection within scope"): two commands on the same chord in scopes
 * that both see the key (the same scope, or a global key and a panel's). Pairs the defaults ship
 * (`isDefault` true for both keys) are intended (the preview's arrows nudge, else step frames) and
 * are not reported. Returns the conflicts per command id.
 */
export function findConflicts(bindings: readonly KeyBinding[], platform: Platform, isDefault: (id: string, keys: string) => boolean): Map<string, KeyConflict[]> {
  const byChord = new Map<string, { binding: KeyBinding; keys: string }[]>();
  for (const binding of bindings) {
    for (const keys of binding.keys) {
      let chord: string;
      try {
        chord = parseChord(keys, platform);
      } catch {
        continue;
      }
      const list = byChord.get(chord) ?? [];
      list.push({ binding, keys });
      byChord.set(chord, list);
    }
  }
  const out = new Map<string, KeyConflict[]>();
  const add = (id: string, conflict: KeyConflict) => {
    const list = out.get(id) ?? [];
    if (!list.some((c) => c.other === conflict.other && c.keys === conflict.keys)) list.push(conflict);
    out.set(id, list);
  };
  for (const list of byChord.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (!a || !b || a.binding.id === b.binding.id) continue;
        if (!scopesOverlap(a.binding.scopes, b.binding.scopes)) continue;
        if (isDefault(a.binding.id, a.keys) && isDefault(b.binding.id, b.keys)) continue;
        add(a.binding.id, { keys: a.keys, other: b.binding.id });
        add(b.binding.id, { keys: b.keys, other: a.binding.id });
      }
    }
  }
  return out;
}

export const KEYMAP_FILE_FORMAT = "shorts-editor/keymap";
export const KEYMAP_FILE_VERSION = 1;

/** The keymap file: every command's keys (`[]` for one the user unbound), sorted by id. */
export function formatKeymapFile(keysById: Readonly<Record<string, readonly string[]>>): string {
  const bindings: Record<string, readonly string[]> = {};
  for (const id of Object.keys(keysById).sort()) bindings[id] = keysById[id] ?? [];
  return `${JSON.stringify({ format: KEYMAP_FILE_FORMAT, version: KEYMAP_FILE_VERSION, bindings }, null, 2)}\n`;
}

/**
 * Reads a keymap file: the bindings of the commands this editor knows, with the keys it can match.
 * Unknown ids and invalid keys are skipped (counted). Null when the text is not a keymap file.
 */
export function parseKeymapFile(text: string, known: ReadonlySet<string>, platform: Platform): { bindings: Record<string, string[]>; skipped: number } | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const file = data as { format?: unknown; version?: unknown; bindings?: unknown };
  if (file.format !== KEYMAP_FILE_FORMAT || file.version !== KEYMAP_FILE_VERSION) return null;
  if (typeof file.bindings !== "object" || file.bindings === null || Array.isArray(file.bindings)) return null;
  const bindings: Record<string, string[]> = {};
  let skipped = 0;
  for (const [id, value] of Object.entries(file.bindings as Record<string, unknown>)) {
    if (!known.has(id) || !Array.isArray(value)) {
      skipped++;
      continue;
    }
    const keys = value.filter((keys): keys is string => isValidKeys(keys as string, platform));
    skipped += value.length - keys.length;
    bindings[id] = [...new Set(keys)];
  }
  return { bindings, skipped };
}
