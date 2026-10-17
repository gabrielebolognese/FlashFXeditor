import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Command } from "../core/commands/command.js";
import { makeProject, makeTextClip, makeTrack, withClips } from "../core/document/fixtures.js";
import type { Project, TextClip } from "../core/document/types.js";
import { validateProject } from "../core/document/validate.js";
import { DocumentStore } from "../core/store/DocumentStore.js";
import { selectClips } from "../core/store/selection.js";
import { createSessionStore, setPlayhead, setSelection } from "../core/store/sessionStore.js";
import { approximateMeasurer, setTextMeasurer } from "../render/text/layoutCache.js";
import { copyClips, serializeClipboard, type ClipsPayload } from "../timeline/edit/clipboard.js";
import { pasteAttributes, type AttributeGroup } from "../timeline/edit/pasteAttributes.js";
import { toastStore } from "../ui/toasts.js";
import { applyPasteAttributes, clipboard, installClipboardController, pasteAttributesMenu } from "./clipboardController.js";
import { actions, documentStore, sessionStore } from "./services.js";

// The real services open IndexedDB at import time, which jsdom lacks. The store does not validate, as
// in production: only the controller's own check keeps a broken clipboard out of the document.
vi.mock("./services.js", async () => {
  const { CommandRegistry } = await import("../core/commands/CommandRegistry.js");
  const { createProject } = await import("../core/document/project.js");
  const { FocusScopeTracker } = await import("../core/keyboard/focusScope.js");
  const { DocumentStore } = await import("../core/store/DocumentStore.js");
  const { createSessionStore } = await import("../core/store/sessionStore.js");
  const sessionStore = createSessionStore();
  return {
    actions: new CommandRegistry(),
    documentStore: new DocumentStore(createProject({ id: "placeholder", name: "Placeholder", now: "x", appVersion: "x" }), { session: sessionStore, validate: false }),
    focusScopes: new FocusScopeTracker(),
    sessionStore,
  };
});
// These pull in the GPU preview and the timeline view; the clipboard reads only their menus and speed options.
vi.mock("./previewController.js", async () => ({ canvasMenu: (await import("../core/store/createStore.js")).createStore(null) }));
vi.mock("./cutController.js", async () => ({ timelineMenu: (await import("../core/store/createStore.js")).createStore(null) }));
vi.mock("./speedController.js", async () => ({ reportSpeedLimit: () => undefined, speedOptions: (await import("../core/store/createStore.js")).createStore({ link: true, ripple: true }) }));

const GROUPS: ReadonlySet<AttributeGroup> = new Set(["opacity", "fades", "keyframes"]);

/** This project: a plain title `t` on V1. */
function target(): Project {
  const p = makeProject();
  p.tracks.push(makeTrack("v1"), makeTrack("v2"));
  return withClips(p, [makeTextClip({ id: "t", trackId: "v1", start: 0, duration: 60, value: "Hello" })]);
}

/** A title copied in another project, with `extra` on the copied clip (as text from elsewhere could carry). */
function copiedTitle(extra: Partial<TextClip>): ClipsPayload {
  const p = makeProject();
  p.id = "other";
  p.tracks.push(makeTrack("v1"));
  const source = withClips(p, [{ ...makeTextClip({ id: "s", trackId: "v1", start: 0, duration: 60, value: "Source" }), opacity: 0.5, fades: { in: 3, out: 4 } }]);
  const payload = copyClips(source, ["s"], "s", { linked: true }) as ClipsPayload;
  Object.assign((payload.clips[0] as { clip: TextClip }).clip, extra);
  return payload;
}

/** The second review's payload: fractional fades and an opacity key at frame 1.5. */
const broken = () =>
  copiedTitle({
    fades: { in: 2.5, out: 0 },
    keyframes: {
      opacity: [
        { frame: 1.5, value: 0.2, ease: "linear" },
        { frame: 10, value: 1, ease: "linear" },
      ],
    },
  });

let systemText = "";
const messages = () => toastStore.getState().map((toast) => toast.message);

/** The browser's paste event after a declined Mod+V, carrying `text`. */
function pasteEvent(text: string): void {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: { getData: () => text } });
  document.dispatchEvent(event);
}

beforeAll(() => {
  setTextMeasurer(approximateMeasurer);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { readText: async () => systemText, writeText: async () => undefined } });
});
afterAll(() => setTextMeasurer(null));

let stop = () => undefined as void;
beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  documentStore.load(target());
  setSelection(sessionStore, selectClips(["t"], "t"));
  clipboard.set(null);
  toastStore.set([]);
  systemText = "";
  stop = installClipboardController();
});
afterEach(() => {
  stop();
  vi.restoreAllMocks();
});

describe("Paste attributes from the system clipboard (Batch 39 fix)", () => {
  it("refuses a copied clip with fractional fades and key frames: the document, the history and the tab's clipboard are unchanged", async () => {
    systemText = serializeClipboard(broken());
    actions.run("clipboard.pasteAttributes");
    await vi.waitFor(() => expect(pasteAttributesMenu.getState()).not.toBeNull());
    expect(pasteAttributesMenu.getState()?.groups).toEqual(expect.arrayContaining([...GROUPS]));
    const before = documentStore.getState();

    // Unchecked, these edits would commit a document that fails to open again.
    const unchecked = new DocumentStore(before, { session: createSessionStore(), validate: false });
    unchecked.dispatch(pasteAttributes(before, broken(), ["t"], GROUPS) as Command);
    expect(validateProject(unchecked.getState())).toEqual(expect.arrayContaining([expect.stringContaining("1.5"), expect.stringContaining("2.5")]));

    applyPasteAttributes(GROUPS);
    expect(documentStore.getState()).toBe(before);
    expect(documentStore.history.getState().canUndo).toBe(false);
    expect(messages()).toEqual(["Can't paste these attributes"]);
    expect(clipboard.getState()).toBeNull();
    expect(pasteAttributesMenu.getState()).toBeNull();
  });

  it("pastes a valid copied clip in one step and keeps it as the tab's clipboard", async () => {
    const payload = copiedTitle({});
    systemText = serializeClipboard(payload);
    actions.run("clipboard.pasteAttributes");
    await vi.waitFor(() => expect(pasteAttributesMenu.getState()).not.toBeNull());
    applyPasteAttributes(new Set(["opacity", "fades"]));
    const clip = documentStore.getState().clips.t as TextClip;
    expect([clip.opacity, clip.fades]).toEqual([0.5, { in: 3, out: 4 }]);
    expect(documentStore.history.getState().undoLabel).toBe("Paste attributes");
    expect(messages()).toEqual([]);
    expect(clipboard.getState()).toEqual(payload);
  });
});

describe("Paste of a broken clips payload (Batch 39 fix)", () => {
  it("refuses it with a toast and does not make it the tab's clipboard (so Paste attributes never meets it)", async () => {
    const text = serializeClipboard(broken());
    const before = documentStore.getState();
    // Mod+V: the key is declined and the browser's paste event brings the text.
    expect(actions.run("clipboard.paste", { scope: "timeline", phase: "down", repeat: false })).toBe(false);
    pasteEvent(text);
    expect(documentStore.getState()).toBe(before);
    expect(messages()).toEqual(["Can't paste these clips"]);
    expect(clipboard.getState()).toBeNull();

    // The menu row with no tab copy reads the system clipboard: the same.
    systemText = text;
    actions.run("clipboard.paste");
    await vi.waitFor(() => expect(messages()).toHaveLength(2));
    expect(documentStore.getState()).toBe(before);
    expect(clipboard.getState()).toBeNull();
  });

  it("pastes a valid one from the paste event and keeps it as the tab's clipboard", () => {
    const payload = copiedTitle({});
    setPlayhead(sessionStore, 100);
    actions.run("clipboard.paste", { scope: "timeline", phase: "down", repeat: false });
    pasteEvent(serializeClipboard(payload));
    expect(documentStore.history.getState().undoLabel).toBe("Paste");
    expect(Object.values(documentStore.getState().clips).filter((clip) => clip.kind === "text")).toHaveLength(2);
    expect(clipboard.getState()).toEqual(payload);
  });
});
