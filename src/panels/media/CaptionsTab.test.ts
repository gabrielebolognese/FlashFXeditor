import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { liveEdit } from "../../app/liveEdit.js";
import { documentStore } from "../../app/services.js";
import { addCaptionTrack, makeCaptionClip, makeProject, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { CaptionClip } from "../../core/document/types.js";
import { clearCues } from "../../timeline/edit/captions.js";
import { CaptionsTab } from "./CaptionsTab.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The real services open IndexedDB at import time, which jsdom lacks: the stores the list uses.
vi.mock("../../app/services.js", async () => {
  const { ActionRegistry } = await import("../../core/commands/ActionRegistry.js");
  const { createProject } = await import("../../core/document/project.js");
  const { DocumentStore } = await import("../../core/store/DocumentStore.js");
  const { createSessionStore } = await import("../../core/store/sessionStore.js");
  const sessionStore = createSessionStore();
  return {
    actions: new ActionRegistry(),
    documentStore: new DocumentStore(createProject({ id: "placeholder", name: "Placeholder", now: "x", appVersion: "x" }), { session: sessionStore, validate: true }),
    sessionStore,
  };
});
vi.mock("../../app/timelineController.js", async () => {
  const { sessionStore } = await import("../../app/services.js");
  return { movePlayhead: (frame: number) => sessionStore.state.set((state) => ({ ...state, playhead: frame })) };
});

// jsdom has no layout: no ResizeObserver, no CSS.escape (the rows then measure 1 px each).
class NoResize {
  observe(): void {}
  disconnect(): void {}
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", NoResize);
  if (typeof CSS === "undefined") vi.stubGlobal("CSS", { escape: (value: string) => value });
  const project = makeProject();
  project.tracks.push(makeTrack("v1"));
  const cues = Array.from({ length: 200 }, (_, i) => makeCaptionClip({ id: `q${i + 1}`, trackId: "cc", start: i * 10, duration: 10, text: `cue ${i + 1}` }));
  documentStore.load(withClips(addCaptionTrack(project), cues));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(createElement(CaptionsTab)));
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.unstubAllGlobals();
});

const field = (n: number) => host?.querySelector<HTMLTextAreaElement>(`[data-cue-id="q${n}"] textarea`) ?? null;
const text = (n: number) => (documentStore.getState().clips[`q${n}`] as CaptionClip | undefined)?.text;
const undoLabel = () => documentStore.history.getState().undoLabel;

/** Focuses cue `n`'s text and types `value` the way React sees it (native setter + input event). */
function typeInto(n: number, value: string): HTMLTextAreaElement {
  const element = field(n);
  if (!element) throw new Error(`cue ${n} is not rendered`);
  act(() => element.focus());
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return element;
}

function scrollList(top: number): void {
  const list = host?.querySelector<HTMLElement>('[role="listbox"]');
  if (!list) throw new Error("no cue list");
  Object.defineProperty(list, "scrollTop", { value: top, configurable: true, writable: true });
  act(() => list.dispatchEvent(new Event("scroll")));
}

describe("CaptionsTab cue text editing", () => {
  it("shows the draft live and commits it on blur as one step", () => {
    const element = typeInto(3, "Typed");
    expect(liveEdit.getState().cues?.get("q3")).toBe("Typed");
    expect(text(3)).toBe("cue 3");
    act(() => element.blur());
    expect(text(3)).toBe("Typed");
    expect(undoLabel()).toBe("Edit caption");
    expect(liveEdit.getState().cues).toBeNull();
  });

  it("keeps the edited row, its focus and its draft while the list scrolls far away", () => {
    const element = typeInto(3, "Typed then scrolled away");
    scrollList(100);
    expect(field(100)).not.toBeNull();
    expect(field(4)).toBeNull();
    expect(field(3)).toBe(element);
    expect(document.activeElement).toBe(element);
    expect(liveEdit.getState().cues?.get("q3")).toBe("Typed then scrolled away");
    act(() => element.blur());
    expect(text(3)).toBe("Typed then scrolled away");
    expect(undoLabel()).toBe("Edit caption");
    expect(liveEdit.getState().cues).toBeNull();
    expect(field(3)).toBeNull();
  });

  it("commits the draft when the list unmounts while a text is edited (the Media panel's tab switch)", () => {
    typeInto(3, "Typed then switched tabs");
    act(() => root?.unmount());
    root = null;
    expect(text(3)).toBe("Typed then switched tabs");
    expect(undoLabel()).toBe("Edit caption");
    expect(liveEdit.getState().cues).toBeNull();
  });

  it("drops the draft of a cue removed while it is edited", () => {
    typeInto(3, "Typed then cleared");
    act(() => {
      const command = clearCues(documentStore.getState());
      if (command) documentStore.dispatch(command);
    });
    expect(text(3)).toBeUndefined();
    expect(undoLabel()).toBe("Clear captions");
    expect(liveEdit.getState().cues).toBeNull();
  });

  it("commits nothing on unmount after Esc put the text back", () => {
    const element = typeInto(3, "Typed then reverted");
    act(() => {
      element.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    act(() => root?.unmount());
    root = null;
    expect(text(3)).toBe("cue 3");
    expect(undoLabel()).toBeNull();
    expect(liveEdit.getState().cues).toBeNull();
  });
});
