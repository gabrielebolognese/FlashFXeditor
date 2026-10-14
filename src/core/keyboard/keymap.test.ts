import { describe, expect, it } from "vitest";
import { DEFAULT_KEYMAP } from "./keymap.js";
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

  it("covers the J/K/L shuttle and frame stepping as held keys", () => {
    const held = DEFAULT_KEYMAP.filter((b) => b.hold).map((b) => b.id);
    expect(held).toEqual(
      expect.arrayContaining(["transport.shuttleBack", "transport.shuttleStop", "transport.shuttleForward", "transport.stepBack"]),
    );
  });
});
