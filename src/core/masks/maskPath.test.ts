// The checks of FlashFX-v2 scripts/verify-mask-path.mjs that apply to the editor's path masks (spec §21.18).
import { describe, expect, it } from "vitest";
import { sampleVector, setKey } from "../document/keyframes.js";
import { masksCoverage } from "./maskCoverage.js";
import { anchorRef, deleteAnchor, ellipsePath, maskPathData, maskPathPoints, nearestSegment, parseMaskPath, pathPoints, pointRoles, polygonPath, splitSegment, withPoints } from "./maskPath.js";
import type { Mask } from "../document/types.js";

const square = "M0 0 L100 0 L100 100 L0 100 Z";
const coverage = (d: string, x: number, y: number) => masksCoverage([{ id: "a", shape: { kind: "path", d }, mode: "add", feather: 0, expansion: 0, opacity: 1, inverted: false } satisfies Mask], 200, 200, x, y);

describe("path mask points", () => {
  it("a path's points are its coordinate pairs in order; relative and shorthand commands come out absolute", () => {
    expect(maskPathPoints(square)).toEqual([0, 0, 100, 0, 100, 100, 0, 100]);
    expect(maskPathPoints("m0 0 h100 v100 h-100 z")).toEqual([0, 0, 100, 0, 100, 100, 0, 100]);
    expect(maskPathPoints("M0 0 C10 0 20 10 20 20 Z")).toEqual([0, 0, 10, 0, 20, 10, 20, 20]);
    expect(maskPathPoints("M0 0 L")).toBeNull();
  });

  it("points round-trip through path data; every subpath is closed", () => {
    const points = [5, 5, 95, 5, 95, 95, 5, 95];
    const d = maskPathData(square, points);
    expect(d).toBe("M5 5L95 5L95 95L5 95Z");
    expect(maskPathData("M0 0 L10 0 L10 10", [0, 0, 10, 0, 10, 10])).toMatch(/Z$/);
  });

  it("equal-count keys interpolate pair for pair (curves stay curves)", () => {
    const a = maskPathPoints(square) as number[];
    const b = maskPathPoints("M50 0 L100 50 L50 100 L0 50 Z") as number[];
    const keys = setKey(setKey([], 0, a), 10, b);
    expect(sampleVector(keys, 5, [])).toEqual([25, 0, 100, 25, 75, 100, 0, 75]);
    expect(sampleVector(keys, 0, [])).toEqual(a);
    expect(sampleVector(keys, 20, [])).toEqual(b);
  });

  it("roles: anchors and the handles of cubics with the anchor they belong to", () => {
    const path = parseMaskPath("M0 0 L10 0 C20 0 20 10 20 20 Z");
    expect(pointRoles(path as never).map((r) => `${r.kind}${r.anchor}`)).toEqual(["anchor0", "anchor1", "handle1", "handle4", "anchor4"]);
  });

  it("splitting a segment adds a point and keeps the outline", () => {
    const path = parseMaskPath(square);
    expect(path).not.toBeNull();
    const split = splitSegment(path as never, { sub: 0, seg: 0 }, 0.5);
    expect(pathPoints(split)).toEqual([0, 0, 50, 0, 100, 0, 100, 100, 0, 100]);
    // The closing line splits into an explicit line.
    const closing = splitSegment(path as never, { sub: 0, seg: 3 }, 0.5);
    expect(pathPoints(closing)).toEqual([0, 0, 100, 0, 100, 100, 0, 100, 0, 50]);
    // A cubic splits with de Casteljau: the circle covers the same area.
    const circle = ellipsePath(20, 20, 160, 160);
    const parsed = parseMaskPath(circle);
    const halves = withPoints(splitSegment(parsed as never, { sub: 0, seg: 1 }, 0.3), []);
    for (const [x, y] of [[100, 100], [100, 22], [25, 100], [178, 100], [100, 179]] as const) {
      expect(coverage(maskPathData(circle, pathPoints(halves)), x, y)).toBeCloseTo(coverage(circle, x, y), 6);
    }
  });

  it("deleting an anchor joins its segments; a subpath keeps three anchors", () => {
    const pentagon = parseMaskPath("M0 0 L100 0 L150 50 L100 100 L0 100 Z") as never;
    expect(pathPoints(deleteAnchor(pentagon, 2) as never)).toEqual([0, 0, 100, 0, 100, 100, 0, 100]);
    // The start: the next anchor becomes the start.
    expect(pathPoints(deleteAnchor(pentagon, 0) as never)).toEqual([100, 0, 150, 50, 100, 100, 0, 100]);
    expect(deleteAnchor(parseMaskPath("M0 0 L10 0 L10 10 Z") as never, 1)).toBeNull();
    expect(anchorRef(pentagon, 3)).toEqual({ sub: 0, seg: 2, start: false });
  });

  it("the nearest segment of a point", () => {
    const hit = nearestSegment(parseMaskPath(square) as never, 50, 3);
    expect(hit?.seg).toBe(0);
    expect(hit?.t).toBeCloseTo(0.5, 6);
    expect(hit?.distance).toBeCloseTo(3, 6);
    expect(nearestSegment(parseMaskPath(square) as never, 2, 60)?.seg).toBe(3);
  });

  it("polygon and ellipse builders", () => {
    expect(polygonPath([[0, 0], [10, 0], [10, 10]])).toBe("M0 0L10 0L10 10Z");
    expect(maskPathPoints(ellipsePath(0, 0, 100, 50))?.length).toBe(2 + 4 * 6);
  });
});
