import { describe, expect, it } from "vitest";
import { DEFAULT_KEYMAP, Keymap } from "./keymap.js";
import { findConflicts, formatKeymapFile, isValidKeys, parseKeymapFile, recordChord, scopesOverlap } from "./rebind.js";

const press = (key: string, code: string, mods: { ctrl?: boolean; meta?: boolean; alt?: boolean; shift?: boolean } = {}) => ({
  key,
  code,
  ctrlKey: mods.ctrl ?? false,
  metaKey: mods.meta ?? false,
  altKey: mods.alt ?? false,
  shiftKey: mods.shift ?? false,
});

describe("recordChord", () => {
  it("writes Ctrl (Windows) and Cmd (macOS) as Mod", () => {
    expect(recordChord(press("j", "KeyJ", { ctrl: true }), "other")).toBe("Mod+J");
    expect(recordChord(press("j", "KeyJ", { meta: true }), "mac")).toBe("Mod+J");
    expect(recordChord(press("j", "KeyJ", { ctrl: true }), "mac")).toBe("Ctrl+J");
    expect(recordChord(press("K", "KeyK", { ctrl: true, shift: true }), "other")).toBe("Mod+Shift+K");
    expect(recordChord(press("ArrowUp", "ArrowUp", { alt: true }), "other")).toBe("Alt+Up");
    expect(recordChord(press("F2", "F2"), "other")).toBe("F2");
  });

  it("drops the Shift a symbol consumes and ignores bare modifiers", () => {
    expect(recordChord(press("?", "Slash", { shift: true }), "other")).toBe("?");
    expect(recordChord(press("Control", "ControlLeft", { ctrl: true }), "other")).toBeNull();
  });

  it("round-trips through the dispatcher's chord parsing", () => {
    expect(isValidKeys(recordChord(press("=", "Equal", { ctrl: true }), "other") ?? "", "other")).toBe(true);
  });
});

describe("isValidKeys", () => {
  it("accepts keymap strings the dispatcher can match", () => {
    for (const keys of ["Mod+K", "Shift+/", "?", "F12", "Alt+Shift+Left", "Space", "Mod+Shift+.", "\\"]) expect(isValidKeys(keys, "other"), keys).toBe(true);
  });

  it("refuses unknown modifiers and key names", () => {
    for (const keys of ["Hyper+K", "Mod+Shift", "Mod+Banana", "", "F99"]) expect(isValidKeys(keys, "other"), keys).toBe(false);
  });
});

describe("scopesOverlap", () => {
  it("treats global keys as acting in every panel, not while typing or in dialogs", () => {
    expect(scopesOverlap(["global"], ["timeline"])).toBe(true);
    expect(scopesOverlap(["timeline"], ["preview"])).toBe(false);
    expect(scopesOverlap(["timeline", "preview"], ["preview"])).toBe(true);
    expect(scopesOverlap(["global"], ["textEditing"])).toBe(false);
  });
});

describe("findConflicts", () => {
  const keymap = () => new Keymap(DEFAULT_KEYMAP);
  const isDefault = (map: Keymap) => (id: string, keys: string) => map.defaultKeysFor(id).includes(keys);

  it("finds none in the shipped keymap (the preview's arrows falling through to frame steps are by design)", () => {
    const map = keymap();
    expect(findConflicts(map.bindings(), "other", isDefault(map)).size).toBe(0);
    expect(findConflicts(map.bindings(), "mac", isDefault(map)).size).toBe(0);
  });

  it("flags a rebinding onto a key another command uses in the same scope, on both", () => {
    const map = keymap();
    map.setKeys("edit.split", ["Mod+Z"]);
    const conflicts = findConflicts(map.bindings(), "other", isDefault(map));
    expect(conflicts.get("edit.split")).toEqual([{ keys: "Mod+Z", other: "history.undo" }]);
    expect(conflicts.get("history.undo")).toEqual([{ keys: "Mod+Z", other: "edit.split" }]);
  });

  it("flags a global key that a panel binding hides there, and nothing for a free key", () => {
    const map = keymap();
    map.setKeys("edit.split", ["Mod+L"]);
    expect(findConflicts(map.bindings(), "other", isDefault(map)).get("edit.split")).toEqual([{ keys: "Mod+L", other: "edit.toggleLink" }]);
    map.setKeys("edit.split", ["Mod+J"]);
    expect(findConflicts(map.bindings(), "other", isDefault(map)).size).toBe(0);
  });
});

describe("keymap file", () => {
  it("round-trips the bindings", () => {
    const text = formatKeymapFile({ "edit.split": ["Mod+J"], "history.undo": ["Mod+Z"], "edit.lift": [] });
    expect(JSON.parse(text)).toEqual({ format: "shorts-editor/keymap", version: 1, bindings: { "edit.lift": [], "edit.split": ["Mod+J"], "history.undo": ["Mod+Z"] } });
    const known = new Set(["edit.split", "history.undo", "edit.lift"]);
    expect(parseKeymapFile(text, known, "other")).toEqual({ bindings: { "edit.lift": [], "edit.split": ["Mod+J"], "history.undo": ["Mod+Z"] }, skipped: 0 });
  });

  it("skips unknown commands and invalid keys, and refuses other files", () => {
    const text = JSON.stringify({ format: "shorts-editor/keymap", version: 1, bindings: { "edit.split": ["Mod+J", "Hyper+X", 3, "Mod+J"], "nope.cmd": ["K"], "history.undo": "Mod+Z" } });
    expect(parseKeymapFile(text, new Set(["edit.split", "history.undo"]), "other")).toEqual({ bindings: { "edit.split": ["Mod+J"] }, skipped: 4 });
    expect(parseKeymapFile("{}", new Set(), "other")).toBeNull();
    expect(parseKeymapFile("not json", new Set(), "other")).toBeNull();
    expect(parseKeymapFile(JSON.stringify({ format: "shorts-editor/keymap", version: 2, bindings: {} }), new Set(), "other")).toBeNull();
  });
});
