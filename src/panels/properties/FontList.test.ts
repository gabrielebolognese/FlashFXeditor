import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LoadTicket } from "../../render/text/FontLoadQueue.js";
import { FontList, type FontListDeps, type FontListItem } from "./FontList.js";

// jsdom has no layout: the list's height is set by the test and the ResizeObserver is called by hand.
let resized: (() => void) | null = null;
class ManualResize {
  constructor(callback: () => void) {
    resized = callback;
  }
  observe(): void {}
  disconnect(): void {}
}

const ROW = 28;
const fonts = (count: number): FontListItem[] =>
  Array.from({ length: count }, (_, i) => ({ kind: "font", key: `f${i}`, family: `Family ${i}`, weight: 400, meta: "1 weight", favorite: false, editable: false, current: false }));

let host: HTMLDivElement;
let height = 0;
let requested: string[];
let cancelled: string[];

function makeList(): FontList {
  const deps: FontListDeps = {
    classes: {},
    icons: document.createElement("div"),
    previewReady: () => false,
    preview: (family): LoadTicket => {
      requested.push(family);
      return { done: new Promise<boolean>(() => {}), cancel: () => cancelled.push(family) };
    },
    onHover: () => {},
    onPick: () => {},
    onStar: () => {},
    onEdit: () => {},
    onAction: () => {},
    optionId: (index) => `option-${index}`,
  };
  return new FontList(host, deps);
}

const shown = () => [...host.querySelectorAll<HTMLElement>("[role=option]")].filter((element) => !element.hidden).length;

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ManualResize);
  host = document.createElement("div");
  host.style.setProperty("--control-default", `${ROW}px`);
  Object.defineProperty(host, "clientHeight", { get: () => height });
  document.body.append(host);
  height = 4 * ROW;
  requested = [];
  cancelled = [];
});

afterEach(() => {
  host.remove();
  resized = null;
  vi.unstubAllGlobals();
});

describe("FontList", () => {
  it("binds the visible rows and their margin, and loads only those", () => {
    const list = makeList();
    list.setItems(fonts(100));
    // 4 rows on screen + 3 below (the top is row 0).
    expect(shown()).toBe(4 + 3 + 1);
    expect(requested).toEqual(Array.from({ length: 8 }, (_, i) => `Family ${i}`));
    list.destroy();
  });

  it("binds no rows and loads nothing while the list has no height, and draws them again when it shows", () => {
    const list = makeList();
    list.setItems(fonts(100));
    expect(requested).toHaveLength(8);
    // Hidden (the My fonts editor is open): every row is unbound and its load cancelled.
    height = 0;
    resized?.();
    expect(shown()).toBe(0);
    expect(cancelled).toHaveLength(8);
    // New items while hidden load nothing.
    requested = [];
    list.setItems(fonts(50));
    expect(requested).toEqual([]);
    expect(shown()).toBe(0);
    // Shown again: the ResizeObserver draws the rows.
    height = 4 * ROW;
    resized?.();
    expect(shown()).toBe(8);
    expect(requested).toHaveLength(8);
    list.destroy();
  });

  it("draws nothing when the row height token cannot be read", () => {
    host.style.removeProperty("--control-default");
    const list = makeList();
    list.setItems(fonts(100));
    expect(shown()).toBe(0);
    expect(requested).toEqual([]);
    list.destroy();
  });
});
