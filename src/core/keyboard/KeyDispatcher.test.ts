import { describe, expect, it, vi } from "vitest";
import { KeyDispatcher } from "./KeyDispatcher.js";
import type { FocusScope } from "./focusScope.js";
import { FocusScopeTracker, scopeOf } from "./focusScope.js";
import { DEFAULT_KEYMAP, Keymap } from "./keymap.js";

function setup(initialScope: FocusScope = "global", isAvailable?: (id: string) => boolean) {
  let scope = initialScope;
  const onAction = vi.fn();
  const dispatcher = new KeyDispatcher({
    keymap: DEFAULT_KEYMAP,
    platform: "other",
    getScope: () => scope,
    onAction,
    ...(isAvailable && { isAvailable }),
  });
  return {
    dispatcher,
    onAction,
    setScope: (next: FocusScope) => {
      scope = next;
    },
    down(init: KeyboardEventInit, target: EventTarget = document.body) {
      const event = new KeyboardEvent("keydown", { cancelable: true, ...init });
      Object.defineProperty(event, "target", { value: target });
      dispatcher.handleKeyDown(event);
      return event;
    },
    up(code: string) {
      dispatcher.handleKeyUp({ code });
    },
  };
}

describe("KeyDispatcher", () => {
  it("dispatches a global shortcut and prevents the browser default", () => {
    const t = setup();
    const event = t.down({ key: "k", code: "KeyK", ctrlKey: true });
    expect(t.onAction).toHaveBeenCalledWith("edit.split", { scope: "global", phase: "down", repeat: false });
    expect(event.defaultPrevented).toBe(true);
  });

  it("prefers the focused scope over global bindings", () => {
    const t = setup("preview");
    t.down({ key: "ArrowLeft", code: "ArrowLeft" });
    expect(t.onAction).toHaveBeenLastCalledWith("canvas.nudgeLeft", expect.objectContaining({ scope: "preview" }));
    t.setScope("timeline");
    t.down({ key: "ArrowLeft", code: "ArrowLeft" });
    expect(t.onAction).toHaveBeenLastCalledWith("transport.stepBack", expect.objectContaining({ scope: "timeline" }));
  });

  it("falls through to the global binding when the scope's command is not available yet", () => {
    // The preview's arrows are canvas nudges (Batch 22); until then they step frames.
    const t = setup("preview", (id) => !id.startsWith("canvas.nudge"));
    t.down({ key: "ArrowRight", code: "ArrowRight" });
    expect(t.onAction).toHaveBeenLastCalledWith("transport.stepForward", { scope: "preview", phase: "down", repeat: false });
    t.up("ArrowRight");
    // Available scope bindings still win; a key with no global binding keeps its scope binding.
    t.down({ key: "0", code: "Digit0", ctrlKey: true });
    expect(t.onAction).toHaveBeenLastCalledWith("canvas.zoomFit", expect.anything());
    const none = setup("preview", () => false);
    none.down({ key: "0", code: "Digit0", ctrlKey: true });
    expect(none.onAction).toHaveBeenLastCalledWith("canvas.zoomFit", expect.anything());
  });

  it("falls through to the global binding when the scope's handler declines", () => {
    // Nothing on the canvas to nudge: the preview's arrows step frames (a held key, with its key-up).
    const t = setup("preview");
    t.onAction.mockImplementation((id: string) => (id.startsWith("canvas.nudge") ? false : undefined));
    const first = t.down({ key: "ArrowLeft", code: "ArrowLeft" });
    expect(t.onAction.mock.calls.map(([id]) => id)).toEqual(["canvas.nudgeLeft", "transport.stepBack"]);
    expect(first.defaultPrevented).toBe(true);
    const repeat = t.down({ key: "ArrowLeft", code: "ArrowLeft", repeat: true });
    expect(repeat.defaultPrevented).toBe(true);
    t.up("ArrowLeft");
    expect(t.onAction).toHaveBeenLastCalledWith("transport.stepBack", { scope: "preview", phase: "up", repeat: false });
    // A handled nudge stops there.
    t.onAction.mockReset();
    t.down({ key: "ArrowUp", code: "ArrowUp", shiftKey: true });
    expect(t.onAction.mock.calls.map(([id]) => id)).toEqual(["canvas.nudgeUp10"]);
  });

  it("ignores scope-only bindings outside their scope", () => {
    const t = setup("media");
    const event = t.down({ key: "g", code: "KeyG" });
    expect(t.onAction).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("never fires while typing in a text input", () => {
    const t = setup("properties");
    const input = document.createElement("input");
    input.type = "text";
    const event = t.down({ key: " ", code: "Space" }, input);
    t.down({ key: "k", code: "KeyK", ctrlKey: true }, input);
    expect(t.onAction).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("gives the inline text editor only its own bindings", () => {
    const t = setup("textEditing");
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    Object.defineProperty(editor, "isContentEditable", { value: true });
    t.down({ key: " ", code: "Space" }, editor);
    expect(t.onAction).not.toHaveBeenCalled();
    t.down({ key: "Enter", code: "Enter", ctrlKey: true }, editor);
    expect(t.onAction).toHaveBeenCalledWith("text.commit", expect.anything());
    t.down({ key: "Escape", code: "Escape" }, editor);
    expect(t.onAction).toHaveBeenLastCalledWith("text.cancel", expect.anything());
  });

  it("suppresses repeats of held keys and dispatches key-up", () => {
    const t = setup();
    t.down({ key: "l", code: "KeyL" });
    const repeat = t.down({ key: "l", code: "KeyL", repeat: true });
    expect(repeat.defaultPrevented).toBe(true);
    expect(t.onAction).toHaveBeenCalledTimes(1);
    t.up("KeyL");
    expect(t.onAction).toHaveBeenLastCalledWith("transport.shuttleForward", { scope: "global", phase: "up", repeat: false });
    expect(t.onAction).toHaveBeenCalledTimes(2);
  });

  it("releases held keys on blur", () => {
    const t = setup();
    t.down({ key: "j", code: "KeyJ" });
    t.dispatcher.releaseAll();
    expect(t.onAction).toHaveBeenLastCalledWith("transport.shuttleBack", expect.objectContaining({ phase: "up" }));
  });

  it("lets non-held keys repeat", () => {
    const t = setup("preview");
    t.down({ key: "ArrowUp", code: "ArrowUp" });
    t.down({ key: "ArrowUp", code: "ArrowUp", repeat: true });
    expect(t.onAction).toHaveBeenCalledTimes(2);
    expect(t.onAction).toHaveBeenLastCalledWith("canvas.nudgeUp", expect.objectContaining({ repeat: true }));
  });

  it("matches shifted punctuation via the physical key", () => {
    const t = setup("timeline");
    t.down({ key: "|", code: "Backslash", shiftKey: true });
    expect(t.onAction).toHaveBeenLastCalledWith("timeline.zoomToSelection", expect.anything());
    t.down({ key: ">", code: "Period", shiftKey: true, ctrlKey: true });
    expect(t.onAction).toHaveBeenLastCalledWith("timeline.centerPlayhead", expect.anything());
  });

  it("supports multiple keys for one action", () => {
    const t = setup("timeline");
    t.down({ key: "Backspace", code: "Backspace" });
    t.down({ key: "y", code: "KeyY", ctrlKey: true });
    expect(t.onAction.mock.calls.map((c) => c[0])).toEqual(["edit.delete", "history.redo"]);
  });

  it("saves with Mod+S while typing in an input and inside a dialog (everywhere bindings)", () => {
    const t = setup("properties");
    const input = document.createElement("input");
    input.type = "text";
    const typed = t.down({ key: "s", code: "KeyS", ctrlKey: true }, input);
    expect(t.onAction).toHaveBeenLastCalledWith("project.save", expect.objectContaining({ scope: "properties" }));
    expect(typed.defaultPrevented).toBe(true);
    t.setScope("dialog");
    t.down({ key: "s", code: "KeyS", ctrlKey: true });
    expect(t.onAction).toHaveBeenLastCalledWith("project.save", expect.objectContaining({ scope: "dialog" }));
    // Other keys stay with the input and the dialog.
    t.onAction.mockClear();
    t.down({ key: "k", code: "KeyK", ctrlKey: true });
    t.down({ key: "k", code: "KeyK", ctrlKey: true }, input);
    expect(t.onAction).not.toHaveBeenCalled();
  });

  it("follows a new keymap: the rebound key dispatches, the old one no longer does", () => {
    const t = setup();
    const map = new Keymap(DEFAULT_KEYMAP);
    map.setKeys("edit.split", ["Mod+J"]);
    t.dispatcher.setBindings(map.bindings());
    t.down({ key: "j", code: "KeyJ", ctrlKey: true });
    expect(t.onAction).toHaveBeenLastCalledWith("edit.split", expect.anything());
    t.onAction.mockClear();
    t.down({ key: "k", code: "KeyK", ctrlKey: true });
    expect(t.onAction).not.toHaveBeenCalled();
    // A key the user moved onto another command's chord wins it (the newest binding).
    map.setKeys("edit.split", ["Mod+Z"]);
    t.dispatcher.setBindings(map.bindings());
    t.down({ key: "z", code: "KeyZ", ctrlKey: true });
    expect(t.onAction).toHaveBeenLastCalledWith("edit.split", expect.anything());
  });

  it("leaves the browser default alone when the handler declines", () => {
    let scope: FocusScope = "global";
    const dispatcher = new KeyDispatcher({
      keymap: DEFAULT_KEYMAP,
      platform: "other",
      getScope: () => scope,
      onAction: () => false,
    });
    scope = "global";
    const event = new KeyboardEvent("keydown", { key: "s", code: "KeyS", ctrlKey: true, cancelable: true });
    dispatcher.handleKeyDown(event);
    expect(event.defaultPrevented).toBe(false);
  });
});

describe("focus scopes", () => {
  it("resolves the scope from the nearest data-scope ancestor", () => {
    const panel = document.createElement("section");
    panel.dataset.scope = "timeline";
    const button = document.createElement("button");
    panel.append(button);
    expect(scopeOf(button)).toBe("timeline");
    expect(scopeOf(document.body)).toBe("global");
  });

  it("tracks the panel that last received a pointer down", () => {
    const tracker = new FocusScopeTracker();
    const detach = tracker.attach(document);
    const panel = document.createElement("section");
    panel.dataset.scope = "media";
    document.body.append(panel);
    panel.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(tracker.scope).toBe("media");
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(tracker.scope).toBe("global");
    detach();
    panel.remove();
  });
});
