import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { documentStore } from "../../app/services.js";
import { makeProject, makeTextClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { TextClip } from "../../core/document/types.js";
import { newCounter } from "../../text/counter.js";
import { CounterRows } from "./CounterRows.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The real services open IndexedDB at import time, which jsdom lacks: the stores the rows use.
vi.mock("../../app/services.js", async () => {
  const { createProject } = await import("../../core/document/project.js");
  const { DocumentStore } = await import("../../core/store/DocumentStore.js");
  const { createSessionStore } = await import("../../core/store/sessionStore.js");
  const sessionStore = createSessionStore();
  return {
    documentStore: new DocumentStore(createProject({ id: "placeholder", name: "Placeholder", now: "x", appVersion: "x" }), { session: sessionStore, validate: true }),
    sessionStore,
    appSettings: undefined,
  };
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const ids = ["t1"];

beforeEach(() => {
  const project = makeProject();
  project.tracks.push(makeTrack("v1"));
  const clip: TextClip = { ...makeTextClip({ id: "t1", trackId: "v1", start: 0, duration: 90 }), counter: newCounter() };
  documentStore.load(withClips(project, [clip]));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(createElement(CounterRows, { ids })));
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

const counter = () => (documentStore.getState().clips["t1"] as TextClip).counter;
const input = (label: string) => host?.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`) ?? null;

function type(label: string, value: string): void {
  const element = input(label);
  if (!element) throw new Error(`no field ${label}`);
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("CounterRows text fields", () => {
  it("show what was typed and extend it with the next key", () => {
    type("Counter suffix", "%");
    expect(counter()?.suffix).toBe("%");
    expect(input("Counter suffix")?.value).toBe("%");
    type("Counter suffix", "%x");
    expect(counter()?.suffix).toBe("%x");
    expect(input("Counter suffix")?.value).toBe("%x");
    type("Counter prefix", "~");
    expect(input("Counter prefix")?.value).toBe("~");
  });

  it("merge a burst of typing into one undo step", () => {
    const before = documentStore.history.getState().undoLabel;
    type("Counter suffix", "a");
    type("Counter suffix", "ab");
    type("Counter suffix", "abc");
    act(() => documentStore.undo());
    expect(counter()?.suffix).toBe(newCounter().suffix);
    expect(documentStore.history.getState().undoLabel).toBe(before);
  });
});
