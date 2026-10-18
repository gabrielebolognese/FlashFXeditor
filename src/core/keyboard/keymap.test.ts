import { describe, expect, it, vi } from "vitest";
import { DEFAULT_KEYMAP, Keymap } from "./keymap.js";
import { parseChord, type Platform } from "./keys.js";

describe("DEFAULT_KEYMAP", () => {
  it("has one binding per command id", () => {
    const ids = DEFAULT_KEYMAP.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each<Platform>(["other", "mac"])("has no duplicate chord within a scope (%s)", (platform) => {
    const seen = new Map<string, string>();
    const duplicates: string[] = [];
    for (const binding of DEFAULT_KEYMAP) {
      for (const scope of binding.scopes) {
        for (const keys of binding.keys) {
          const key = `${scope}:${parseChord(keys, platform)}`;
          const other = seen.get(key);
          if (other) duplicates.push(`${key} -> ${other} and ${binding.id}`);
          seen.set(key, binding.id);
        }
      }
    }
    expect(duplicates).toEqual([]);
  });

  it("binds Alt+1..9 to the preset bar's first nine buttons, globally (spec §20.2)", () => {
    for (let n = 1; n <= 9; n++) {
      const binding = DEFAULT_KEYMAP.find((b) => b.id === `presetBar.apply${n}`);
      expect(binding).toMatchObject({ keys: [`Alt+${n}`], scopes: ["global"] });
    }
  });

  it("covers the J/K/L shuttle and frame stepping as held keys", () => {
    const held = DEFAULT_KEYMAP.filter((b) => b.hold).map((b) => b.id);
    expect(held).toEqual(
      expect.arrayContaining(["transport.shuttleBack", "transport.shuttleStop", "transport.shuttleForward", "transport.stepBack"]),
    );
  });
});

describe("Keymap (live, rebinding)", () => {
  it("starts at the defaults", () => {
    const map = new Keymap(DEFAULT_KEYMAP);
    expect(map.keysFor("edit.split")).toEqual(["Mod+K"]);
    expect(map.isCustom("edit.split")).toBe(false);
    expect(map.bindings()).toHaveLength(DEFAULT_KEYMAP.length);
  });

  it("applies overrides, keeps hold flags and scopes, and notifies", () => {
    const map = new Keymap(DEFAULT_KEYMAP);
    const listener = vi.fn();
    map.subscribe(listener);
    map.setKeys("edit.split", ["Mod+J"]);
    map.setKeys("transport.shuttleBack", ["Alt+J"]);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(map.keysFor("edit.split")).toEqual(["Mod+J"]);
    expect(map.defaultKeysFor("edit.split")).toEqual(["Mod+K"]);
    expect(map.binding("transport.shuttleBack")).toMatchObject({ keys: ["Alt+J"], hold: true, scopes: ["global"] });
    // The customized bindings come last, so they win a chord they share.
    expect(map.bindings().slice(-2).map((b) => b.id)).toEqual(["transport.shuttleBack", "edit.split"]);
  });

  it("drops overrides equal to the defaults, resets one or all", () => {
    const map = new Keymap(DEFAULT_KEYMAP);
    map.setOverrides({ "edit.split": ["Mod+K"], "edit.lift": [] });
    expect(map.getOverrides()).toEqual({ "edit.lift": [] });
    expect(map.keysFor("edit.lift")).toEqual([]);
    expect(map.bindings().some((b) => b.id === "edit.lift")).toBe(false);
    map.setKeys("edit.split", ["Mod+J"]);
    map.reset("edit.lift");
    expect(map.getOverrides()).toEqual({ "edit.split": ["Mod+J"] });
    map.resetAll();
    expect(map.getOverrides()).toEqual({});
    expect(map.keysFor("edit.split")).toEqual(["Mod+K"]);
  });

  it("binds commands without a default in the scopes the resolver gives", () => {
    const map = new Keymap(DEFAULT_KEYMAP);
    map.setScopeResolver((id) => (id.startsWith("media.") ? ["media"] : ["global"]));
    map.setKeys("media.addToCanvas", ["Shift+A"]);
    expect(map.binding("media.addToCanvas")).toEqual({ id: "media.addToCanvas", keys: ["Shift+A"], scopes: ["media"] });
    expect(map.scopesFor("media.addToCanvas")).toEqual(["media"]);
    expect(map.scopesFor("edit.closeGap")).toEqual(["timeline"]);
  });

  it("does not notify when nothing changes", () => {
    const map = new Keymap(DEFAULT_KEYMAP);
    const listener = vi.fn();
    map.subscribe(listener);
    map.setOverrides({});
    map.setKeys("edit.split", ["Mod+K"]);
    expect(listener).not.toHaveBeenCalled();
  });
});
