import { describe, expect, it } from "vitest";
import { canvasCapacity, CANVAS_STEP } from "./canvasCapacity.js";

describe("canvasCapacity", () => {
  it("starts a step ahead of the size it shows, rounded up to a step", () => {
    expect(canvasCapacity(0, 1000)).toBe(1024 + CANVAS_STEP);
    expect(canvasCapacity(0, 1024)).toBe(1024 + CANVAS_STEP);
    expect(canvasCapacity(0, 0)).toBe(0);
  });

  it("keeps its capacity while the size moves within it (a splitter drag)", () => {
    let capacity = canvasCapacity(0, 1000);
    let changes = 0;
    // Shrinking 300 px and growing back, one px per frame: a few reallocations, not 600.
    for (const size of [...Array.from({ length: 300 }, (_, i) => 1000 - i), ...Array.from({ length: 300 }, (_, i) => 700 + i)]) {
      const next = canvasCapacity(capacity, size);
      expect(next).toBeGreaterThanOrEqual(size);
      expect(next - size).toBeLessThan(4 * CANVAS_STEP);
      if (next !== capacity) changes += 1;
      capacity = next;
    }
    expect(changes).toBeLessThanOrEqual(3);
  });

  it("grows as soon as the size no longer fits and shrinks once three steps are spare", () => {
    expect(canvasCapacity(1152, 1153)).toBe(1280 + CANVAS_STEP);
    expect(canvasCapacity(1152, 1152 - 3 * CANVAS_STEP + 1)).toBe(1152);
    expect(canvasCapacity(1152, 1152 - 3 * CANVAS_STEP)).toBe(768 + CANVAS_STEP);
  });
});
