import { describe, expect, it } from "vitest";
import { detectPlatform, eventChords, formatChord, parseChord } from "./keys.js";

function ev(key: string, code: string, mods: { ctrl?: boolean; meta?: boolean; alt?: boolean; shift?: boolean } = {}) {
  return {
    key,
    code,
    ctrlKey: mods.ctrl ?? false,
    metaKey: mods.meta ?? false,
    altKey: mods.alt ?? false,
    shiftKey: mods.shift ?? false,
  };
}

describe("parseChord", () => {
  it("resolves Mod per platform and orders modifiers canonically", () => {
    expect(parseChord("Mod+Shift+Z", "other")).toBe("Ctrl+Shift+Z");
    expect(parseChord("Shift+Mod+Z", "mac")).toBe("Meta+Shift+Z");
    expect(parseChord("Mod+Alt+Up", "other")).toBe("Ctrl+Alt+Up");
  });

  it("normalizes key names", () => {
    expect(parseChord("Esc", "other")).toBe("Escape");
    expect(parseChord("k", "other")).toBe("K");
    expect(parseChord("Shift+\\", "other")).toBe("Shift+\\");
    expect(parseChord("Mod+Shift+.", "other")).toBe("Ctrl+Shift+.");
  });

  it("rejects unknown modifiers", () => {
    expect(() => parseChord("Hyper+K", "other")).toThrow(/Unknown modifier/);
  });
});

describe("eventChords", () => {
  it("maps letters with modifiers", () => {
    expect(eventChords(ev("k", "KeyK", { ctrl: true }))).toEqual(["Ctrl+K"]);
    expect(eventChords(ev("T", "KeyT", { shift: true }))).toEqual(["Shift+T"]);
  });

  it("maps arrows and space", () => {
    expect(eventChords(ev("ArrowLeft", "ArrowLeft", { shift: true }))).toEqual(["Shift+Left"]);
    expect(eventChords(ev(" ", "Space", { ctrl: true, shift: true }))).toEqual(["Ctrl+Shift+Space"]);
  });

  it("falls back to the physical key when the layout produces a shifted symbol", () => {
    // US layout: Shift+\ reports "|".
    expect(eventChords(ev("|", "Backslash", { shift: true }))).toEqual(["|", "Shift+\\"]);
  });

  it("treats Shift as consumed by symbols that need it (Italian ';' = Shift+,)", () => {
    expect(eventChords(ev(";", "Comma", { shift: true }))[0]).toBe(";");
  });

  it("uses the code when the key is a dead key or a non-Latin letter", () => {
    expect(eventChords(ev("Dead", "KeyI", { alt: true }))).toEqual(["Alt+I"]);
    expect(eventChords(ev("к", "KeyR"))).toContain("R");
  });

  it("ignores bare modifier presses", () => {
    expect(eventChords(ev("Shift", "ShiftLeft", { shift: true }))).toEqual([]);
  });
});

describe("formatChord", () => {
  it("formats for Windows and macOS", () => {
    expect(formatChord("Mod+K", "other")).toBe("Ctrl+K");
    expect(formatChord("Mod+Shift+Z", "mac")).toBe("⌘⇧Z");
  });
});

describe("detectPlatform", () => {
  it("detects macOS", () => {
    expect(detectPlatform({ platform: "MacIntel", userAgent: "" })).toBe("mac");
    expect(detectPlatform({ platform: "Win32", userAgent: "" })).toBe("other");
  });
});
