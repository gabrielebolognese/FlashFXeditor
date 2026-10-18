import { describe, expect, it } from "vitest";
import { setTabStop, stepIndex } from "./listNavigation.js";

describe("stepIndex", () => {
  it("moves by one item left and right, by a row up and down, clamped to the list", () => {
    expect(stepIndex("ArrowRight", 2, 10, 4)).toBe(3);
    expect(stepIndex("ArrowLeft", 2, 10, 4)).toBe(1);
    expect(stepIndex("ArrowDown", 2, 10, 4)).toBe(6);
    expect(stepIndex("ArrowDown", 8, 10, 4)).toBe(9);
    expect(stepIndex("ArrowUp", 2, 10, 4)).toBe(0);
    expect(stepIndex("ArrowLeft", 0, 10, 4)).toBe(0);
    expect(stepIndex("ArrowRight", 9, 10, 4)).toBe(9);
  });

  it("goes to the ends with Home and End, and starts from the first item when the current one is not shown", () => {
    expect(stepIndex("Home", 5, 10, 1)).toBe(0);
    expect(stepIndex("End", 5, 10, 1)).toBe(9);
    expect(stepIndex("ArrowDown", -1, 10, 1)).toBe(1);
  });

  it("leaves other keys and empty lists alone", () => {
    expect(stepIndex("Enter", 0, 10, 1)).toBeNull();
    expect(stepIndex("ArrowDown", 0, 0, 1)).toBeNull();
  });
});

describe("setTabStop", () => {
  function list(count: number): HTMLElement {
    const root = document.createElement("div");
    for (let i = 0; i < count; i++) {
      const item = document.createElement("div");
      item.dataset.item = String(i);
      item.tabIndex = -1;
      root.append(item);
    }
    return root;
  }

  it("leaves one Tab stop: the target, else the first shown item", () => {
    const root = list(3);
    const items = [...root.children] as HTMLElement[];
    setTabStop(root, "[data-item]", items[1] ?? null);
    expect(items.map((item) => item.tabIndex)).toEqual([-1, 0, -1]);
    (items[0] as HTMLElement).hidden = true;
    setTabStop(root, "[data-item]", null);
    expect(items.map((item) => item.tabIndex)).toEqual([-1, 0, -1]);
  });
});
