// The checks of FlashFX-v2 scripts/verify-mask-coverage.mjs that apply to the editor's block (spec §21.18).
import { describe, expect, it } from "vitest";
import type { Mask } from "../document/types.js";
import { MASK_DATA_WIDTH, MAX_MASKS, maskBlockFloats, masksCoverage, maskStackCoverage, packMasks } from "./maskCoverage.js";
import { ellipsePath, polygonPath } from "./maskPath.js";

const box = (kind: "rect" | "ellipse", x: number, y: number, w: number, h: number, extra: Partial<Mask> = {}): Mask => ({ id: `m${x}${y}`, shape: { kind, x, y, w, h }, mode: "add", feather: 0, expansion: 0, opacity: 1, inverted: false, ...extra });
const path = (d: string, extra: Partial<Mask> = {}): Mask => ({ id: "p", shape: { kind: "path", d }, mode: "add", feather: 0, expansion: 0, opacity: 1, inverted: false, ...extra });
const cov = (masks: Mask[], x: number, y: number) => masksCoverage(masks, 200, 200, x, y);

describe("mask coverage (CPU twin of the coverage shader)", () => {
  it("no masks cover everything", () => {
    expect(cov([], 10, 10)).toBe(1);
  });

  it("a hard-edged square is 1 inside, 0 outside, 0.5 on the edge", () => {
    const masks = [box("rect", 50, 50, 100, 100)];
    expect(cov(masks, 100, 100)).toBe(1);
    expect(cov(masks, 10, 10)).toBe(0);
    expect(cov(masks, 50, 100)).toBeCloseTo(0.5, 6);
    // Feather 0 keeps a one pixel antialiased edge.
    expect(cov(masks, 50.6, 100)).toBe(1);
    expect(cov(masks, 49.4, 100)).toBe(0);
  });

  it("feather is centred on the edge, symmetric and monotone", () => {
    const masks = [box("rect", 50, 50, 100, 100, { feather: 20 })];
    expect(cov(masks, 60, 100) + cov(masks, 40, 100)).toBeCloseTo(1, 6);
    const ramp = [30, 40, 50, 60, 70].map((x) => cov(masks, x, 100));
    for (let i = 1; i < ramp.length; i++) expect(ramp[i] as number).toBeGreaterThanOrEqual(ramp[i - 1] as number);
    expect(ramp[0]).toBe(0);
    expect(ramp[2]).toBeCloseTo(0.5, 6);
    expect(ramp[4]).toBe(1);
  });

  it("an ellipse with feather 40 fades from its center out over 80 px", () => {
    const masks = [box("ellipse", 0, 0, 200, 200, { feather: 40 })];
    expect(cov(masks, 100, 100)).toBe(1);
    expect(cov(masks, 100, 0)).toBeCloseTo(0.5, 2);
    expect(cov(masks, 100, 30)).toBeGreaterThan(0.9);
    expect(cov(masks, 100, 39)).toBeLessThan(1);
    expect(cov(masks, 100, 41)).toBe(1);
  });

  it("invert and opacity", () => {
    const masks = [box("rect", 50, 50, 100, 100, { inverted: true })];
    expect(cov(masks, 100, 100)).toBe(0);
    expect(cov(masks, 10, 10)).toBe(1);
    const half = [box("rect", 50, 50, 100, 100, { opacity: 0.5 })];
    expect(cov(half, 100, 100)).toBeCloseTo(0.5, 6);
  });

  it("modes: add = union, subtract = A minus B, intersect = overlap", () => {
    const a = box("rect", 0, 0, 120, 200);
    const b = box("rect", 80, 0, 120, 200);
    const add = [a, { ...b, mode: "add" as const }];
    const sub = [a, { ...b, mode: "subtract" as const }];
    const inter = [a, { ...b, mode: "intersect" as const }];
    // x = 40 only in A, 100 in both, 160 only in B.
    expect([40, 100, 160].map((x) => cov(add, x, 100))).toEqual([1, 1, 1]);
    expect([40, 100, 160].map((x) => cov(sub, x, 100))).toEqual([1, 0, 0]);
    expect([40, 100, 160].map((x) => cov(inter, x, 100))).toEqual([0, 1, 0]);
  });

  it("first-mask start: a lone subtract cuts a hole in the whole layer; a lone intersect keeps its inside", () => {
    const hole = [box("rect", 50, 50, 100, 100, { mode: "subtract" })];
    expect(cov(hole, 100, 100)).toBe(0);
    expect(cov(hole, 10, 10)).toBe(1);
    const only = [box("rect", 50, 50, 100, 100, { mode: "intersect" })];
    expect(cov(only, 100, 100)).toBe(1);
    expect(cov(only, 10, 10)).toBe(0);
  });

  it("expansion grows and shrinks the shape", () => {
    expect(cov([box("rect", 50, 50, 100, 100, { expansion: 20 })], 35, 100)).toBe(1);
    expect(cov([box("rect", 50, 50, 100, 100, { expansion: -20 })], 60, 100)).toBe(0);
  });

  it("rounded rectangle corners", () => {
    const masks = [{ ...box("rect", 0, 0, 200, 200), shape: { kind: "rect" as const, x: 0, y: 0, w: 200, h: 200, radius: 50 } }];
    expect(cov(masks, 5, 5)).toBe(0);
    expect(cov(masks, 100, 2)).toBe(1);
  });

  it("concave outlines and nonzero winding", () => {
    // A U shape: the notch is outside.
    const u = path(polygonPath([[0, 0], [60, 0], [60, 140], [140, 140], [140, 0], [200, 0], [200, 200], [0, 200]]));
    expect(cov([u], 100, 70)).toBe(0);
    expect(cov([u], 30, 70)).toBe(1);
    // A bow tie fills both lobes.
    const tie = path(polygonPath([[0, 0], [200, 200], [200, 0], [0, 200]]));
    expect(cov([tie], 30, 100)).toBe(1);
    expect(cov([tie], 170, 100)).toBe(1);
    expect(cov([tie], 100, 30)).toBe(0);
  });

  it("a cubic circle covers about pi r^2 (curves traced, not chorded)", () => {
    const circle = path(ellipsePath(20, 20, 160, 160));
    let covered = 0;
    for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) covered += cov([circle], x + 0.5, y + 0.5);
    expect(covered / (Math.PI * 80 * 80)).toBeCloseTo(1, 2);
  });

  it("a path with fewer than 2 segments encloses nothing", () => {
    expect(cov([path("M10 10")], 10, 10)).toBe(0);
  });

  it("packing is frame-pure and sized by maskBlockFloats", () => {
    const masks = [box("ellipse", 10, 10, 50, 50, { feather: 4 }), path(ellipsePath(0, 0, 100, 100), { mode: "subtract" })];
    const a = new Float32Array(maskBlockFloats(masks));
    const b = new Float32Array(maskBlockFloats(masks));
    expect(packMasks(masks, 200, 200, a)).toBe(a.length);
    packMasks(masks, 200, 200, b);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(a[0]).toBe(2);
    expect(maskStackCoverage(a, 35, 35)).toBe(0);
    expect(maskStackCoverage(a, 150, 150)).toBe(0);
  });

  it("caps the masks drawn and fits the data texture width", () => {
    const many = Array.from({ length: MAX_MASKS + 4 }, (_, i) => box("rect", i, 0, 10, 10));
    expect(maskBlockFloats(many)).toBe((1 + MAX_MASKS * 4) * 4);
    expect(MASK_DATA_WIDTH % 4).toBe(0);
  });
});
