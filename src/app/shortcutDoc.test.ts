import { describe, expect, it } from "vitest";
import readme from "../../README.md?raw";
import { DEFAULT_KEYMAP } from "../core/keyboard/keymap.js";
import { commandInfo } from "./commandCatalog.js";
import { shortcutsMarkdown, SHORTCUTS_END, SHORTCUTS_START, withShortcuts } from "./shortcutDoc.js";

describe("the README's keyboard cheat sheet (Batch 50)", () => {
  it("is the one generated from the keymap (run npm run docs:shortcuts after changing keys)", () => {
    const text = readme.replace(/\r\n/g, "\n");
    expect(withShortcuts(text, shortcutsMarkdown())).toBe(text);
  });

  it("lists every default binding of the release build once, with both platforms' keys", () => {
    const sheet = shortcutsMarkdown();
    for (const binding of DEFAULT_KEYMAP) {
      const info = commandInfo(binding.id);
      if (!info || info.dev || binding.keys.length === 0) continue;
      const rows = sheet.split("\n").filter((line) => line.startsWith(`| ${info.label.replace(/\|/g, "\\|")} |`));
      expect(rows, binding.id).toHaveLength(1);
    }
    expect(sheet).toContain("| Split at playhead | `Ctrl+K` | `⌘K` | Everywhere |");
    expect(sheet).toMatch(/\| Close gap \| `G` \| `G` \| Timeline \|/);
  });

  it("replaces only the section between its markers", () => {
    const doc = `# Title\n\n${SHORTCUTS_START}\n\nold\n\n${SHORTCUTS_END}\n\nAfter.\n`;
    expect(withShortcuts(doc, "new")).toBe(`# Title\n\n${SHORTCUTS_START}\n\nnew\n\n${SHORTCUTS_END}\n\nAfter.\n`);
    expect(() => withShortcuts("# No markers\n", "new")).toThrow("needs the");
  });
});
