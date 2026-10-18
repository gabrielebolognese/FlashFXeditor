import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PresetBarReorder } from "./presetBarReorder.js";

// jsdom has no layout: the buttons get their offsets by hand (60 px wide, 4 px apart), the row sits at x = 0.
const WIDTH = 60;
const GAP = 4;
let row: HTMLDivElement;
let marker: HTMLDivElement;
let outside: HTMLDivElement;
let reorder: PresetBarReorder;
let starts: number;

beforeEach(() => {
  if (typeof CSS === "undefined") vi.stubGlobal("CSS", { escape: (value: string) => value });
  row = document.createElement("div");
  row.setPointerCapture = () => undefined;
  ["a", "b", "c"].forEach((id, index) => {
    const button = document.createElement("button");
    button.dataset.presetId = id;
    Object.defineProperty(button, "offsetLeft", { value: index * (WIDTH + GAP) });
    Object.defineProperty(button, "offsetWidth", { value: WIDTH });
    row.append(button);
  });
  marker = document.createElement("div");
  marker.hidden = true;
  row.append(marker);
  outside = document.createElement("div");
  document.body.append(row, outside);
  starts = 0;
  reorder = new PresetBarReorder({ row, marker, threshold: () => 4, onStart: () => starts++ });
});

afterEach(() => {
  reorder.end(false);
  row.remove();
  outside.remove();
  vi.unstubAllGlobals();
});

const pointer = (type: string, x: number, init: PointerEventInit = {}) => new PointerEvent(type, { clientX: x, clientY: 10, pointerId: 1, button: 0, buttons: type === "pointerup" ? 0 : 1, bubbles: true, ...init });
const hover = (x: number) => pointer("pointermove", x, { buttons: 0, button: -1 });
const dragging = () => [...row.querySelectorAll<HTMLElement>("[data-dragging]")].map((button) => button.dataset.presetId);
const press = (id: string | null, x: number, reorderable = true) => reorder.press(pointer("pointerdown", x), id, reorderable);

describe("PresetBarReorder", () => {
  it("drags a button past the threshold: the marker shows the gap and the row's release drops it there, no click", () => {
    press("a", 30);
    expect(reorder.move(pointer("pointermove", 32))).toBe(true);
    expect(starts).toBe(0);
    expect(marker.hidden).toBe(true);
    expect(reorder.move(pointer("pointermove", 140))).toBe(true);
    expect(starts).toBe(1);
    expect(dragging()).toEqual(["a"]);
    expect(marker.hidden).toBe(false);
    expect(marker.style.transform).toBe(`translateX(${2 * (WIDTH + GAP)}px)`);
    expect(reorder.end(true)).toEqual({ id: "a", gap: 2 });
    expect(dragging()).toEqual([]);
    expect(marker.hidden).toBe(true);
    expect(reorder.takeClick()).toBe(true);
    expect(reorder.takeClick()).toBe(false);
    // The capture's loss after the release finds nothing left.
    expect(reorder.end(true)).toBeNull();
  });

  it("ends a press released off the row before the drag started: a plain hover then previews, a click in a gap drops nothing", () => {
    press("a", 30);
    reorder.move(pointer("pointermove", 31));
    // The release lands outside the row (no capture yet): only the window sees it.
    outside.dispatchEvent(pointer("pointerup", 31));
    expect(reorder.active).toBe(false);
    // A sideways hover with no button held is no drag.
    for (const x of [30, 60, 100, 140]) expect(reorder.move(hover(x))).toBe(false);
    expect(starts).toBe(0);
    expect(dragging()).toEqual([]);
    expect(marker.hidden).toBe(true);
    // A press in a gap and its release on the row.
    press(null, 62);
    expect(reorder.end(true)).toBeNull();
    expect(reorder.takeClick()).toBe(false);
  });

  it("drops a press whose release nobody saw at the first move with no button held", () => {
    press("b", 90);
    expect(reorder.active).toBe(true);
    expect(reorder.move(hover(140))).toBe(false);
    expect(reorder.active).toBe(false);
    expect(starts).toBe(0);
    expect(marker.hidden).toBe(true);
  });

  it("a pointer cancel off the row also ends the press; another pointer's release does not", () => {
    press("a", 30);
    outside.dispatchEvent(pointer("pointerup", 30, { pointerId: 2 }));
    expect(reorder.active).toBe(true);
    outside.dispatchEvent(pointer("pointercancel", 30));
    expect(reorder.active).toBe(false);
  });

  it("a press clears a drag left on screen (marker, dimmed button) and its release is a click again", () => {
    press("a", 30);
    reorder.move(pointer("pointermove", 140));
    expect(dragging()).toEqual(["a"]);
    press("c", 150);
    expect(dragging()).toEqual([]);
    expect(marker.hidden).toBe(true);
    expect(reorder.end(true)).toBeNull();
    expect(reorder.takeClick()).toBe(false);
  });

  it("the window's release leaves a started drag to the row (it has the capture)", () => {
    press("a", 30);
    reorder.move(pointer("pointermove", 140));
    outside.dispatchEvent(pointer("pointerup", 140));
    expect(reorder.active).toBe(true);
    expect(reorder.end(true)).toEqual({ id: "a", gap: 2 });
  });

  it("a cancelled drag moves nothing and takes no click", () => {
    press("a", 30);
    reorder.move(pointer("pointermove", 140));
    expect(reorder.end(false)).toBeNull();
    expect(dragging()).toEqual([]);
    expect(marker.hidden).toBe(true);
    expect(reorder.takeClick()).toBe(false);
  });

  it("a press below the threshold released on the row is a click; a set without an order or another button never drags", () => {
    press("a", 30);
    reorder.move(pointer("pointermove", 32));
    expect(reorder.end(true)).toBeNull();
    expect(reorder.takeClick()).toBe(false);
    press("a", 30, false);
    expect(reorder.move(pointer("pointermove", 140))).toBe(false);
    reorder.press(pointer("pointerdown", 30, { button: 2, buttons: 2 }), "a", true);
    expect(reorder.move(pointer("pointermove", 140, { buttons: 2 }))).toBe(false);
    expect(starts).toBe(0);
  });

  it("removes its window listeners when the press ends", () => {
    const remove = vi.spyOn(window, "removeEventListener");
    press("a", 30);
    reorder.end(false);
    expect(remove).toHaveBeenCalledWith("pointerup", expect.any(Function), true);
    expect(remove).toHaveBeenCalledWith("pointercancel", expect.any(Function), true);
    remove.mockRestore();
  });
});
