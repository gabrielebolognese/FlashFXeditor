// Chord parsing and normalization. Keymap strings ("Mod+Shift+Z") and keyboard events both become a
// canonical chord string ("Ctrl+Shift+Z") so lookup is a plain Map access.

export type Platform = "mac" | "other";

export function detectPlatform(nav: Pick<Navigator, "platform" | "userAgent"> = navigator): Platform {
  return /Mac|iPhone|iPad/i.test(nav.platform || nav.userAgent) ? "mac" : "other";
}

const MODIFIER_ORDER = ["Ctrl", "Meta", "Alt", "Shift"] as const;
type Modifier = (typeof MODIFIER_ORDER)[number];

const KEY_ALIASES: Record<string, string> = {
  ArrowLeft: "Left",
  ArrowRight: "Right",
  ArrowUp: "Up",
  ArrowDown: "Down",
  " ": "Space",
  Spacebar: "Space",
  Esc: "Escape",
  Del: "Delete",
  Return: "Enter",
};

/** Physical key codes mapped to the key they produce on a US layout (used as a fallback). */
const CODE_KEYS: Record<string, string> = {
  Semicolon: ";",
  Quote: "'",
  Equal: "=",
  Minus: "-",
  Backslash: "\\",
  Period: ".",
  Comma: ",",
  Slash: "/",
  BracketLeft: "[",
  BracketRight: "]",
  Backquote: "`",
  Space: "Space",
  NumpadAdd: "+",
  NumpadSubtract: "-",
  NumpadEnter: "Enter",
};

const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta", "AltGraph", "CapsLock", "OS"]);

function normalizeKeyName(key: string): string {
  const alias = KEY_ALIASES[key];
  if (alias) return alias;
  return key.length === 1 ? key.toUpperCase() : key;
}

function isLetterOrDigit(key: string): boolean {
  return /^[A-Z0-9]$/.test(key);
}

function buildChord(mods: Set<Modifier>, key: string): string {
  return [...MODIFIER_ORDER.filter((m) => mods.has(m)), key].join("+");
}

/** Parses a keymap string like "Mod+Shift+Z" into a canonical chord for the platform. */
export function parseChord(text: string, platform: Platform): string {
  const parts = text.split("+");
  // "Mod++" style is not used; a trailing empty part means the key itself was "+".
  const rawKey = parts.pop() || "+";
  const mods = new Set<Modifier>();
  for (const part of parts) {
    const name = part.trim();
    if (name === "Mod") mods.add(platform === "mac" ? "Meta" : "Ctrl");
    else if (name === "Ctrl" || name === "Control") mods.add("Ctrl");
    else if (name === "Cmd" || name === "Meta") mods.add("Meta");
    else if (name === "Alt" || name === "Option") mods.add("Alt");
    else if (name === "Shift") mods.add("Shift");
    else throw new Error(`Unknown modifier "${name}" in "${text}"`);
  }
  return buildChord(mods, normalizeKeyName(rawKey.trim()));
}

type KeyEventLike = Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">;

/**
 * Candidate chords for an event, most specific first:
 * 1. by `key` (layout-aware). For symbols produced with Shift (e.g. ";" on an Italian layout), Shift
 *    is considered consumed by the symbol and dropped.
 * 2. by `code` (physical key on a US layout), so "Shift+\" still matches when the layout reports "|".
 * Returns [] for bare modifier presses.
 */
export function eventChords(event: KeyEventLike): string[] {
  if (MODIFIER_KEYS.has(event.key)) return [];
  const mods = new Set<Modifier>();
  if (event.ctrlKey) mods.add("Ctrl");
  if (event.metaKey) mods.add("Meta");
  if (event.altKey) mods.add("Alt");
  if (event.shiftKey) mods.add("Shift");

  const chords: string[] = [];
  const key = normalizeKeyName(event.key);
  if (key.length === 1 && !isLetterOrDigit(key) && key !== "Space") {
    const withoutShift = new Set(mods);
    withoutShift.delete("Shift");
    chords.push(buildChord(withoutShift, key));
  } else if (key !== "Unidentified" && key !== "Dead") {
    chords.push(buildChord(mods, key));
  }

  const codeKey = codeToKey(event.code);
  if (codeKey) {
    const chord = buildChord(mods, codeKey);
    if (!chords.includes(chord)) chords.push(chord);
  }
  return chords;
}

function codeToKey(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  return CODE_KEYS[code] ?? null;
}

const MAC_SYMBOLS: Record<string, string> = { Meta: "⌘", Ctrl: "⌃", Alt: "⌥", Shift: "⇧" };

/** Human label for a keymap string, e.g. "Mod+K" -> "Ctrl+K" (Windows) or "⌘K" (macOS). */
export function formatChord(text: string, platform: Platform): string {
  const chord = parseChord(text, platform);
  if (platform !== "mac") return chord;
  return chord
    .split("+")
    .map((part) => MAC_SYMBOLS[part] ?? part)
    .join("");
}

/**
 * The S key as the KeyDispatcher reads it: by the letter typed, or by the key position when no plain
 * letter comes (Option+S on macOS types "ß"). During a drag (timeline or canvas) it is the hold-to-invert
 * snapping modifier (spec §6.9, §7.4).
 */
export function isSnapKey(event: Pick<KeyboardEvent, "key" | "code">): boolean {
  const key = event.key.toLowerCase();
  return /^[a-z]$/.test(key) ? key === "s" : event.code === "KeyS";
}
