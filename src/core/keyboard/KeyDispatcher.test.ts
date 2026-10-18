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

describe("focused controls keep their own keys (Batch 46)", () => {
  const make = (html: string, selector: string) => {
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.append(host);
    return host.querySelector(selector)!;
  };

  it("leaves Space and Enter to a focused button or switch, and still plays from elsewhere", () => {
    const t = setup();
    const button = make("<button>Split</button>", "button");
    const space = t.down({ key: " ", code: "Space" }, button);
    expect(space.defaultPrevented).toBe(false);
    const toggle = make('<span role="switch" tabindex="0"></span>', "[role=switch]");
    t.down({ key: "Enter", code: "Enter" }, toggle);
    expect(t.onAction).not.toHaveBeenCalled();
    t.down({ key: " ", code: "Space" });
    expect(t.onAction).toHaveBeenCalledWith("transport.playPause", expect.anything());
  });

  it("leaves the arrows to a slider and to a radio group's items, but not to a plain button", () => {
    const t = setup("timeline");
    const slider = make('<input type="range">', "input");
    t.down({ key: "ArrowLeft", code: "ArrowLeft" }, slider);
    const chip = make('<div role="radiogroup"><button role="radio">A</button></div>', "button");
    t.down({ key: "ArrowRight", code: "ArrowRight" }, chip);
    t.down({ key: "Home", code: "Home" }, chip);
    expect(t.onAction).not.toHaveBeenCalled();
    const button = make("<button>Zoom in</button>", "button");
    t.down({ key: "ArrowLeft", code: "ArrowLeft" }, button);
    expect(t.onAction).toHaveBeenLastCalledWith("transport.stepBack", expect.anything());
  });

  it("still runs modified shortcuts on a focused control", () => {
    const t = setup();
    const button = make("<button>Split</button>", "button");
    t.down({ key: "k", code: "KeyK", ctrlKey: true }, button);
    expect(t.onAction).toHaveBeenCalledWith("edit.split", expect.anything());
  });
});

describe("a control the pointer focused keeps the shortcuts (Batch 46 review)", () => {
  const make = (html: string, selector: string) => {
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.append(host);
    return host.querySelector<HTMLElement>(selector)!;
  };
  // What Chrome does on a click: the press, then the focus (only some buttons prevent it on mouse down).
  const click = (element: HTMLElement) => {
    element.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    element.focus();
  };
  const tab = () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", code: "Tab" }));
  const attached = (initialScope: FocusScope = "global") => {
    const t = setup(initialScope);
    const detach = t.dispatcher.attach(window);
    return { ...t, detach };
  };

  it("plays on Space and steps on the arrows after a click on a switch or a tab, and does not press it", () => {
    const t = attached("properties");
    const toggle = make('<button role="switch" aria-checked="false">Drop shadow</button>', "button");
    click(toggle);
    const space = t.down({ key: " ", code: "Space" }, toggle);
    expect(t.onAction).toHaveBeenLastCalledWith("transport.playPause", expect.anything());
    // Prevented: Chrome does not toggle the switch on the key-up.
    expect(space.defaultPrevented).toBe(true);
    const panelTab = make('<div role="tablist"><button role="tab">Presets</button></div>', "button");
    click(panelTab);
    t.down({ key: "ArrowRight", code: "ArrowRight" }, panelTab);
    expect(t.onAction).toHaveBeenLastCalledWith("transport.stepForward", expect.anything());
    t.detach();
  });

  it("leaves Space to the same switch once Tab reached it", () => {
    const t = attached();
    const before = make("<button>Crop to frame</button>", "button");
    const toggle = make('<button role="switch" aria-checked="false">Outline</button>', "button");
    click(before);
    tab();
    toggle.focus();
    expect(t.down({ key: " ", code: "Space" }, toggle).defaultPrevented).toBe(false);
    expect(t.onAction).not.toHaveBeenCalled();
    // A press on the focused switch: the pointer is back, Space plays again.
    toggle.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    t.down({ key: " ", code: "Space" }, toggle);
    expect(t.onAction).toHaveBeenCalledWith("transport.playPause", expect.anything());
    t.detach();
  });

  it("gives a focus a script moves the kind of the last input", () => {
    const t = attached();
    const name = make("<button>Project name</button>", "button");
    // Clicked, renamed, Enter: the field hands the focus back to the name, and Space plays.
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    name.focus();
    t.down({ key: " ", code: "Space" }, name);
    expect(t.onAction).toHaveBeenCalledWith("transport.playPause", expect.anything());
    t.onAction.mockClear();
    // Reached with Tab first: Space renames again.
    name.blur();
    tab();
    name.focus();
    t.down({ key: " ", code: "Space" }, name);
    expect(t.onAction).not.toHaveBeenCalled();
    t.detach();
  });

  it("leaves a key to a clicked widget that handled it (a color square's arrows)", () => {
    const t = attached();
    const square = make('<div role="slider" tabindex="0"></div>', "div");
    click(square);
    const event = new KeyboardEvent("keydown", { key: "ArrowLeft", code: "ArrowLeft", cancelable: true });
    event.preventDefault();
    Object.defineProperty(event, "target", { value: square });
    t.dispatcher.handleKeyDown(event);
    expect(t.onAction).not.toHaveBeenCalled();
    t.detach();
  });
});
