// Ported from FlashFX-v2 scripts/verify-glitch-gpu.mjs @ a91c675, adapted: Vitest instead of node:assert.
import { describe, expect, it } from "vitest";
import { hash21, luma709, moshOffset, pixelSortLuma } from "./glitchGpu.js";

describe("glitchGpu (ported from FlashFX-v2, Batch 71)", () => {
  it("luma709 is Rec.709 and monotonic", () => {
    expect(luma709(0, 0, 0)).toBeCloseTo(0, 9);
    expect(luma709(1, 1, 1)).toBeCloseTo(1, 9);
    expect(luma709(1, 0, 0)).toBeCloseTo(0.2126, 9);
    expect(luma709(0, 1, 0)).toBeGreaterThan(luma709(1, 0, 0));
  });

  it("hash21 is deterministic and in [0,1)", () => {
    for (let i = 0; i < 200; i++) {
      const x = i * 1.7;
      const y = (i % 7) * 3.1;
      const a = hash21(x, y);
      expect(hash21(x, y)).toBe(a);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(1);
    }
  });

  it("hash21 varies across inputs (not a constant)", () => {
    const values = new Set<string>();
    for (let i = 0; i < 64; i++) values.add(hash21(i, i * 2).toFixed(6));
    expect(values.size).toBeGreaterThan(40);
  });

  it("moshOffset: amount 0 gives no displacement and the gate off", () => {
    const m = moshOffset(3, 5, 2, 0);
    expect(m.dx).toBeCloseTo(0, 9);
    expect(m.dy).toBeCloseTo(0, 9);
    expect(m.gate).toBe(0);
  });

  it("moshOffset: displacement is bounded and deterministic; more amount corrupts more blocks", () => {
    let openLow = 0;
    let openHigh = 0;
    for (let cx = 0; cx < 24; cx++) {
      for (let cy = 0; cy < 14; cy++) {
        const m = moshOffset(cx, cy, 4, 1);
        expect(Math.hypot(m.dx, m.dy)).toBeLessThanOrEqual(0.15 + 1e-9);
        expect(moshOffset(cx, cy, 4, 1)).toEqual(m);
        if (moshOffset(cx, cy, 4, 0.2).gate === 1) openLow++;
        if (moshOffset(cx, cy, 4, 0.9).gate === 1) openHigh++;
      }
    }
    expect(openHigh).toBeGreaterThan(openLow);
  });

  it("moshOffset: a new time seed changes the field", () => {
    expect(moshOffset(5, 5, 10, 1)).not.toEqual(moshOffset(5, 5, 11, 1));
  });

  it("pixelSortLuma carries the brightest above-gate neighbour, else keeps the current", () => {
    expect(pixelSortLuma(0.4, [0.2, 0.9, 0.5], 0.5)).toBeCloseTo(0.9, 9);
    expect(pixelSortLuma(0.4, [0.1, 0.2, 0.3], 0.5)).toBeCloseTo(0.4, 9);
    expect(pixelSortLuma(0.95, [0.6, 0.9, 0.8], 0.5)).toBeCloseTo(0.95, 9);
    expect(pixelSortLuma(0.4, [], 0.5)).toBeCloseTo(0.4, 9);
  });
});
