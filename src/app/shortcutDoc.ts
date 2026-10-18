// The keyboard cheat sheet as Markdown (Batch 50): the README's "Keyboard shortcuts" section is
// generated from the default keymap (spec §18, `core/keyboard/keymap.ts`), so it cannot drift from it.
// `npm run docs:shortcuts` (scripts/update-shortcuts.mjs) rewrites the section and shortcutDoc.test.ts
// fails while it is stale. The rows are the in-app cheat sheet's (ShortcutSheet: the commands with
// keys, by category, with where their keys act), with the default keys on both platforms.
import type { FocusScope } from "../core/keyboard/focusScope.js";
import { DEFAULT_KEYMAP } from "../core/keyboard/keymap.js";
import { formatChord } from "../core/keyboard/keys.js";
import { COMMAND_CATEGORIES, COMMANDS } from "./commandCatalog.js";

/** Where keys act, as the cheat sheet and the shortcut editor name it. */
export const SCOPE_NAMES: Record<FocusScope, string> = {
  global: "Everywhere",
  timeline: "Timeline",
  preview: "Preview",
  media: "Media",
  properties: "Properties",
  textEditing: "Text editing",
  dialog: "Dialogs",
};

export const SHORTCUTS_START = "<!-- shortcuts:start (generated from src/core/keyboard/keymap.ts by npm run docs:shortcuts) -->";
export const SHORTCUTS_END = "<!-- shortcuts:end -->";

/** A key label as Markdown code; a `|` would end the table cell. */
const code = (label: string) => `\`${label.replace(/\|/g, "\\|")}\``;

/** The cheat sheet: a table per command category, in the palette's order. */
export function shortcutsMarkdown(): string {
  const bindings = new Map(DEFAULT_KEYMAP.map((binding) => [binding.id, binding]));
  const lines: string[] = [];
  for (const category of COMMAND_CATEGORIES) {
    const rows = COMMANDS.filter((info) => info.category === category && !info.dev && (bindings.get(info.id)?.keys.length ?? 0) > 0);
    if (rows.length === 0) continue;
    lines.push(`### ${category}`, "", "| Command | Windows, Linux | macOS | Where |", "| --- | --- | --- | --- |");
    for (const info of rows) {
      const binding = bindings.get(info.id);
      if (!binding) continue;
      const keys = (platform: "other" | "mac") => binding.keys.map((keys) => code(formatChord(keys, platform))).join(", ");
      const where = binding.scopes.map((scope) => SCOPE_NAMES[scope]).join(", ");
      lines.push(`| ${info.label.replace(/\|/g, "\\|")} | ${keys("other")} | ${keys("mac")} | ${where} |`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

/** `readme` with its generated section replaced by `sheet` (both markers must be there). */
export function withShortcuts(readme: string, sheet: string): string {
  const start = readme.indexOf(SHORTCUTS_START);
  const end = readme.indexOf(SHORTCUTS_END);
  if (start < 0 || end < start) throw new Error(`README.md needs the ${SHORTCUTS_START} and ${SHORTCUTS_END} lines`);
  return `${readme.slice(0, start + SHORTCUTS_START.length)}\n\n${sheet}\n\n${readme.slice(end)}`;
}
