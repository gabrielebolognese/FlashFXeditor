import { describe, expect, it } from "vitest";
import { cubicSegments, flattenPath } from "./flatten.js";
import { buildPathGeometry, fillFans, type PathGeometryInput } from "./geometry.js";
import { CUBIC, controlBounds, formatPathData, LINE, parsePathData, pathDataIssue } from "./pathData.js";
import { defaultPrimitive, primitivePath, primitivePathData } from "./primitives.js";
import { strokeGeometry, visibleRuns } from "./stroke.js";
import { PRIMITIVE_KINDS } from "../document/types.js";

// What the stencil computes at a point: the winding of the fans (each triangle +1 or -1 by its turn).
function winding(tris: Float32Array, x: number, y: number): { nonzero: boolean; evenodd: boolean } {
  let wind = 0;
  let count = 0;
  for (let i = 0; i < tris.length; i += 6) {
    const [ax, ay, bx, by, cx, cy] = [tris[i]!, tris[i + 1]!, tris[i + 2]!, tris[i + 3]!, tris[i + 4]!, tris[i + 5]!];
    const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by);
    const d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy);
    const d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay);
    const inside = (d1 > 0 && d2 > 0 && d3 > 0) || (d1 < 0 && d2 < 0 && d3 < 0);
    if (!inside) continue;
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    wind += area > 0 ? 1 : -1;
    count += 1;
  }
  return { nonzero: wind !== 0, evenodd: count % 2 === 1 };
}
const fillAt = (d: string) => fillFans(flattenPath(parsePathData(d), 0.25));
// What the stroke union covers.
function covered(tris: Float32Array, x: number, y: number): boolean {
  for (let i = 0; i < tris.length; i += 6) {
    const [ax, ay, bx, by, cx, cy] = [tris[i]!, tris[i + 1]!, tris[i + 2]!, tris[i + 3]!, tris[i + 4]!, tris[i + 5]!];
    const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by);
    const d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy);
    const d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay);
    if ((d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0)) return true;
  }
  return false;
}
const stroke = (width: number, extra: Partial<Parameters<typeof strokeGeometry>[1]> = {}) => ({ width, cap: "butt" as const, join: "miter" as const, miterLimit: 4, ...extra });

describe("parsePathData", () => {
  it("parses absolute and relative commands with implicit repeats", () => {
    const path = parsePathData("M10 20 l5 0 5 5 H40 v10 Z m 0 0 L1,2");
    expect(path).toHaveLength(2);
    expect(path[0]).toMatchObject({ x: 10, y: 20, closed: true, cmds: [LINE, 15, 20, LINE, 20, 25, LINE, 40, 25, LINE, 40, 35] });
    // After Z the current point is the subpath start, so m 0 0 starts there.
    expect(path[1]).toMatchObject({ x: 10, y: 20, closed: false, cmds: [LINE, 1, 2] });
  });

  it("reflects S and T control points and raises quadratics", () => {
    const path = parsePathData("M0 0 C0 10 10 10 10 0 S20 -10 20 0 Q25 10 30 0 T40 0");
    const c = path[0]!.cmds;
    expect(c.slice(0, 7)).toEqual([CUBIC, 0, 10, 10, 10, 10, 0]);
    expect(c.slice(7, 12)).toEqual([CUBIC, 10, -10, 20, -10]);
    expect(c[14]).toBe(CUBIC);
    expect(c[15]).toBeCloseTo(20 + (2 / 3) * 5);
    expect(c[16]).toBeCloseTo((2 / 3) * 10);
    // T reflects the quad control (25, 10) about (30, 0) to (35, -10).
    expect(c[22]).toBeCloseTo(30 + (2 / 3) * 5);
    expect(c[23]).toBeCloseTo((2 / 3) * -10);
  });

  it("parses compact numbers, exponents and arc flags", () => {
    const path = parsePathData("M.5.5-1e1-2.5a5 5 0 1010 0");
    expect(path[0]!.x).toBe(0.5);
    expect(path[0]!.cmds.slice(0, 3)).toEqual([LINE, -10, -2.5]);
    const end = path[0]!.cmds.slice(-2);
    expect(end[0]).toBeCloseTo(0);
    expect(end[1]).toBeCloseTo(-2.5);
  });

  it("converts arcs to cubics on the circle", () => {
    // A half circle of radius 50 from (0, 50) to (100, 50) over the top (sweep 1 = clockwise on screen).
    const path = parsePathData("M0 50 A50 50 0 0 1 100 50");
    const lines = flattenPath(path, 0.01);
    const pts = lines[0]!.pts;
    for (let i = 0; i < pts.length; i += 2) expect(Math.hypot(pts[i]! - 50, pts[i + 1]! - 50)).toBeCloseTo(50, 1);
    expect(Math.min(...pts.filter((_, i) => i % 2 === 1))).toBeCloseTo(0, 1);
    // Radii too small are scaled up; a zero radius is a line.
    expect(parsePathData("M0 0 A1 1 0 0 1 100 0")[0]!.cmds[0]).toBe(CUBIC);
    expect(parsePathData("M0 0 A0 5 0 0 1 100 0")[0]!.cmds).toEqual([LINE, 100, 0]);
  });

  it("reports bad data", () => {
    expect(pathDataIssue("")).toBeNull();
    expect(pathDataIssue("L 1 2")).toMatch(/start with M/);
    expect(pathDataIssue("M 1")).toMatch(/number/);
    expect(pathDataIssue("M 1 2 X 3")).toMatch(/unexpected/);
    expect(pathDataIssue("M0 0 A 5 5 0 2 0 1 1")).toMatch(/flag/);
  });

  it("formats back to equivalent data", () => {
    const d = "M10 20 L30 20 C40 20 40 40 30 40 Z";
    expect(formatPathData(parsePathData(d))).toBe("M10 20L30 20C40 20 40 40 30 40Z");
    expect(controlBounds(parsePathData(d))).toEqual([10, 20, 40, 40]);
  });
});

describe("flattening", () => {
  it("splits curves by the tolerance (finer when zoomed in)", () => {
    expect(cubicSegments(0, 0, 0, 100, 100, 100, 100, 0, 1)).toBeLessThan(cubicSegments(0, 0, 0, 100, 100, 100, 100, 0, 0.1));
    expect(cubicSegments(0, 0, 1, 1, 2, 2, 3, 3, 0.25)).toBe(1);
    // The flattened circle stays within the tolerance of the true one.
    const circle = flattenPath(primitivePath({ kind: "ellipse", w: 200, h: 200 }, 200, 200), 0.5)[0]!;
    for (let i = 0; i < circle.pts.length - 2; i += 2) {
      const mx = (circle.pts[i]! + circle.pts[i + 2]!) / 2;
      const my = (circle.pts[i + 1]! + circle.pts[i + 3]!) / 2;
      expect(100 - Math.hypot(mx - 100, my - 100)).toBeLessThan(0.55);
    }
  });
});

describe("fills (stencil winding of the fans)", () => {
  // Ported from FlashFX-v2 scripts/verify-tessellation.mjs: holes carve out under evenodd.
  const outer = "M0 0 L100 0 L100 100 L0 100 Z";
  const holeCw = "M30 30 L70 30 L70 70 L30 70 Z";
  const holeCcw = "M30 30 L30 70 L70 70 L70 30 Z";

  it("fills a square", () => {
    const tris = fillAt(outer);
    expect(winding(tris, 52, 47).nonzero).toBe(true);
    expect(winding(tris, 10, 20).evenodd).toBe(true);
    expect(winding(tris, 150, 50).nonzero).toBe(false);
  });

  it("carves a hole with evenodd whatever its winding, and with nonzero only when it winds the other way", () => {
    const same = fillAt(outer + holeCw);
    const opposite = fillAt(outer + holeCcw);
    expect(winding(same, 52, 47).evenodd).toBe(false);
    expect(winding(opposite, 52, 47).evenodd).toBe(false);
    expect(winding(same, 10, 50).evenodd).toBe(true);
    expect(winding(same, 52, 47).nonzero).toBe(true);
    expect(winding(opposite, 52, 47).nonzero).toBe(false);
    expect(winding(opposite, 10, 50).nonzero).toBe(true);
  });

  it("carves two holes (the counters of a B)", () => {
    const tris = fillAt(outer + "M10 10 L40 10 L40 40 L10 40 Z M60 60 L90 60 L90 90 L60 90 Z");
    expect(winding(tris, 25, 25).evenodd).toBe(false);
    expect(winding(tris, 75, 75).evenodd).toBe(false);
    expect(winding(tris, 52, 47).evenodd).toBe(true);
  });

  it("tells the rules apart on a self-crossing pentagram", () => {
    const star = primitivePathData({ kind: "polygon", sides: 5, radius: 100, roundness: 0 }, 200, 200);
    const p = parsePathData(star)[0]!;
    const v = [[p.x, p.y], ...Array.from({ length: 4 }, (_, i) => [p.cmds[i * 3 + 1]!, p.cmds[i * 3 + 2]!])];
    const order = [0, 2, 4, 1, 3].map((i) => v[i]!);
    const d = `M${order.map((q) => q.join(" ")).join(" L")} Z`;
    const tris = fillAt(d);
    expect(winding(tris, 100, 100).nonzero).toBe(true);
    expect(winding(tris, 100, 100).evenodd).toBe(false);
    // A point of the star stays filled in both.
    expect(winding(tris, 100, 10).nonzero).toBe(true);
    expect(winding(tris, 100, 10).evenodd).toBe(true);
  });
});

describe("primitives", () => {
  it("generates every kind centered in the view box", () => {
    for (const kind of PRIMITIVE_KINDS) {
      const path = primitivePath(defaultPrimitive(kind, 200, 100), 200, 100);
      const box = controlBounds(path)!;
      expect(box, kind).not.toBeNull();
      expect((box[0] + box[2]) / 2, kind).toBeCloseTo(100, 0);
      // Path data round-trips through the parser.
      expect(pathDataIssue(primitivePathData(defaultPrimitive(kind, 200, 100), 200, 100)), kind).toBeNull();
    }
  });

  it("draws arcs clockwise from up, and nothing for an empty sweep", () => {
    const arc = primitivePath({ kind: "arc", radius: 50, start: 0, end: 90 }, 100, 100)[0]!;
    expect(arc.x).toBeCloseTo(50);
    expect(arc.y).toBeCloseTo(0);
    expect(arc.cmds.slice(-2)[0]).toBeCloseTo(100);
    expect(arc.cmds.slice(-2)[1]).toBeCloseTo(50);
    expect(primitivePath({ kind: "arc", radius: 50, start: 30, end: 30 }, 100, 100)).toEqual([]);
    // 270 degrees: three quarter cubics ending on the left.
    const gauge = primitivePath({ kind: "arc", radius: 50, start: 0, end: 270 }, 100, 100)[0]!;
    expect(gauge.cmds.filter((_, i) => i % 7 === 0)).toEqual([CUBIC, CUBIC, CUBIC]);
    expect(gauge.cmds.slice(-2)[0]).toBeCloseTo(0);
  });

  it("rounds polygon and star corners with roundness", () => {
    const sharp = primitivePath({ kind: "star", points: 5, inner: 20, outer: 50, roundness: 0 }, 100, 100)[0]!;
    const round = primitivePath({ kind: "star", points: 5, inner: 20, outer: 50, roundness: 1 }, 100, 100)[0]!;
    expect(sharp.cmds.every((v, i) => i % 3 !== 0 || v === LINE)).toBe(true);
    expect(round.cmds.includes(CUBIC)).toBe(true);
    expect(controlBounds([round])![1]).toBeGreaterThan(controlBounds([sharp])![1] - 1e-9);
  });
});

describe("strokes", () => {
  const line = flattenPath(parsePathData("M0 0 L100 0"), 0.25);

  it("covers the width around the line, with caps", () => {
    const butt = strokeGeometry(line, stroke(10), null, 0.25);
    expect(covered(butt, 50, 4.9)).toBe(true);
    expect(covered(butt, 50, 5.5)).toBe(false);
    expect(covered(butt, -1, 0)).toBe(false);
    const square = strokeGeometry(line, stroke(10, { cap: "square" }), null, 0.25);
    expect(covered(square, -4.5, 4.5)).toBe(true);
    const round = strokeGeometry(line, stroke(10, { cap: "round" }), null, 0.25);
    expect(covered(round, -4.5, 0)).toBe(true);
    expect(covered(round, -4.5, 4.5)).toBe(false);
  });

  it("joins with a miter within the limit, else a bevel; round joins", () => {
    // A right angle: miter ratio sqrt(2).
    const corner = flattenPath(parsePathData("M0 0 L100 0 L100 100"), 0.25);
    expect(covered(strokeGeometry(corner, stroke(10), null, 0.25), 104.5, -4.5)).toBe(true);
    expect(covered(strokeGeometry(corner, stroke(10, { miterLimit: 1.2 }), null, 0.25), 104.5, -4.5)).toBe(false);
    expect(covered(strokeGeometry(corner, stroke(10, { join: "bevel" }), null, 0.25), 104.5, -4.5)).toBe(false);
    const round = strokeGeometry(corner, stroke(10, { join: "round" }), null, 0.25);
    expect(covered(round, 103, -3)).toBe(true);
    expect(covered(round, 104.5, -4.5)).toBe(false);
  });

  it("trims to a part of the length, offset wrapping around a closed path", () => {
    expect(visibleRuns(line, { start: 0, end: 0.25, offset: 0 }, null)[0]!.pts).toEqual([0, 0, 25, 0]);
    expect(visibleRuns(line, { start: 0, end: 0, offset: 0 }, null)).toEqual([]);
    expect(visibleRuns(line, { start: 0, end: 1, offset: 0.3 }, null)[0]!.pts).toEqual(line[0]!.pts);
    const square = flattenPath(parsePathData("M0 0 L100 0 L100 100 L0 100 Z"), 0.25);
    const runs = visibleRuns(square, { start: 0, end: 0.25, offset: 0.875 }, null);
    // 87.5% to 112.5% of a 400 px loop: one run from (0, 50) through (0, 0) to (50, 0).
    expect(runs).toHaveLength(1);
    expect(runs[0]!.pts).toEqual([0, 50, 0, 0, 50, 0]);
    // Whole subpaths in order: a trim end at half of two equal lines draws the first only.
    const two = flattenPath(parsePathData("M0 0 L100 0 M0 50 L100 50"), 0.25);
    expect(visibleRuns(two, { start: 0, end: 0.5, offset: 0 }, null).map((r) => r.pts)).toEqual([[0, 0, 100, 0]]);
  });

  it("dashes along the path, the offset moving the pattern", () => {
    const runs = visibleRuns(line, null, [20, 10], 0).map((r) => [r.pts[0], r.pts[r.pts.length - 2]]);
    expect(runs).toEqual([[0, 20], [30, 50], [60, 80], [90, 100]]);
    const shifted = visibleRuns(line, null, [20, 10], 5).map((r) => [r.pts[0], r.pts[r.pts.length - 2]]);
    expect(shifted[0]).toEqual([0, 15]);
    // An odd pattern repeats (SVG); a zero dash with round caps draws dots.
    expect(visibleRuns(line, null, [10], 0)).toHaveLength(5);
    const dots = strokeGeometry(line, stroke(6, { cap: "round", dash: [0, 20] }), null, 0.25);
    expect(covered(dots, 20, 0)).toBe(true);
    expect(covered(dots, 10, 0)).toBe(false);
  });
});

describe("buildPathGeometry", () => {
  it("returns fill and stroke with bounds including the stroke", () => {
    const input: PathGeometryInput = { source: { d: "M10 10 L90 10 L90 90 Z" }, tolerance: 0.25, fill: true, stroke: stroke(10), trim: null };
    const g = buildPathGeometry(input);
    expect(g.fill).not.toBeNull();
    expect(g.stroke).not.toBeNull();
    expect(g.box).toEqual([10, 10, 90, 90]);
    expect(g.bounds![0]).toBeLessThan(10);
    // Bad data and empty primitives draw nothing.
    expect(buildPathGeometry({ ...input, source: { d: "L oops" } }).bounds).toBeNull();
    expect(buildPathGeometry({ ...input, source: { primitive: { kind: "line", length: 0 }, w: 10, h: 10 } }).bounds).toBeNull();
  });
});
