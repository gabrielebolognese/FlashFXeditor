import { afterEach, describe, expect, it } from "vitest";
import { rankCommands } from "../core/commands/fuzzy.js";
import { DEFAULT_KEYMAP, keymap } from "../core/keyboard/keymap.js";
import { PLANNED_COMMANDS } from "../core/keyboard/planned.js";
import { TOOLBAR_GROUPS } from "../timeline/toolbar/toolbarGroups.js";
import { shortcutLabel } from "../ui/shortcutLabel.js";
import { COMMAND_CATEGORIES, COMMANDS, commandInfo, commandScopes } from "./commandCatalog.js";

describe("command catalog", () => {
  it("names every command once, in a known category", () => {
    const ids = COMMANDS.map((info) => info.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const info of COMMANDS) {
      expect(info.label.trim().length, info.id).toBeGreaterThan(0);
      expect(COMMAND_CATEGORIES, info.id).toContain(info.category);
    }
  });

  it("has an entry for every key, planned command and toolbar button", () => {
    for (const binding of DEFAULT_KEYMAP) expect(commandInfo(binding.id), binding.id).toBeDefined();
    for (const id of Object.keys(PLANNED_COMMANDS)) expect(commandInfo(id), id).toBeDefined();
    for (const group of TOOLBAR_GROUPS) {
      for (const item of group.items) if (item.kind === "button") expect(commandInfo(item.id), item.id).toBeDefined();
    }
  });

  it("gives the commands the keymap does not bind a scope for their keys", () => {
    expect(commandScopes("media.addToCanvas")).toEqual(["media"]);
    expect(commandScopes("track.delete")).toEqual(["timeline"]);
    expect(commandScopes("audio.normalize")).toEqual(["global"]);
  });

  it("finds Close all gaps by typing compact (acceptance 3)", () => {
    const palette = COMMANDS.filter((info) => info.palette !== false);
    const ranked = rankCommands(palette, "compact", []);
    expect(ranked[0]?.id).toBe("edit.closeAllGaps");
    expect(ranked[0]?.label).toBe("Close all gaps");
  });
});

describe("shortcuts follow rebinding", () => {
  afterEach(() => keymap.resetAll());

  it("shows a rebound key wherever the label is read (tooltips, menus, the palette)", () => {
    expect(shortcutLabel("edit.split")).toBe("Ctrl+K");
    keymap.setKeys("edit.split", ["Mod+J"]);
    expect(shortcutLabel("edit.split")).toBe("Ctrl+J");
    keymap.setKeys("edit.split", []);
    expect(shortcutLabel("edit.split")).toBeUndefined();
  });
});
