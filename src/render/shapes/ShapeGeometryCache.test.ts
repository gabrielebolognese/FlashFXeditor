import { describe, expect, it } from "vitest";
import type { PathStroke, PathTrim } from "../../core/document/types.js";
import { buildPathGeometry, type PathGeometry, type PathGeometryInput } from "../../core/shapes/geometry.js";
import type { ShapeCompositeLayer, ShapePathFrame } from "../compositor/drawList.js";
import { IDENTITY } from "../mat3.js";
import { newPathLayer, scaleBucket, ShapeGeometryCache, type GeometryBuilder } from "./ShapeGeometryCache.js";

const WHITE = { r: 1, g: 1, b: 1, a: 1 };
const stroke = (width = 4, extra: Partial<PathStroke> = {}): PathStroke => ({ width, color: WHITE, align: "center", cap: "butt", join: "miter", miterLimit: 4, ...extra });

function frame(extra: Partial<ShapePathFrame> = {}): ShapePathFrame {
  return { id: "p", source: { d: "M10 10 L90 10 L90 90 L10 90 Z" }, fill: WHITE, fillRule: "nonzero", stroke: null, trim: null, ...extra };
}

function layer(paths: ShapePathFrame[], scale = 1): ShapeCompositeLayer {
  return { kind: "shape", trackId: "t", clipId: "c", model: IDENTITY, opacity: 1, width: 100, height: 100, scale, paths };
}

describe("ShapeGeometryCache (spec §21.12: geometry rebuilt only when a path or its style changes)", () => {
  it("builds once and serves the same arrays while nothing changes", () => {
    const cache = new ShapeGeometryCache();
    const out = newPathLayer();
    const shape = layer([frame({ stroke: stroke() })]);
    expect(cache.resolve(shape, 1, false, out)).toBe(true);
    const first = out.draws.map((d) => d.triangles);
    for (let i = 0; i < 30; i++) cache.resolve(shape, 1, false, out);
    expect(out.draws.map((d) => d.triangles)).toEqual(first);
    expect(out.draws[0]?.triangles).toBe(first[0]);
    const stats = cache.stats();
    expect(stats).toMatchObject({ flattens: 1, fillBuilds: 1, strokeBuilds: 1 });
    expect(stats.hits).toBe(60);
  });

  it("a trim change rebuilds the stroke only; a fill color change rebuilds nothing", () => {
    const cache = new ShapeGeometryCache();
    const out = newPathLayer();
    const trim: PathTrim = { start: 0, end: 0.5, offset: 0 };
    cache.resolve(layer([frame({ stroke: stroke(), trim })]), 1, false, out);
    cache.resolve(layer([frame({ stroke: stroke(), trim: { ...trim, end: 0.75 } })]), 1, false, out);
    expect(cache.stats()).toMatchObject({ flattens: 1, fillBuilds: 1, strokeBuilds: 2 });
    cache.resolve(layer([frame({ stroke: stroke(), trim: { ...trim, end: 0.75 }, fill: { r: 1, g: 0, b: 0, a: 1 } })]), 1, false, out);
    expect(cache.stats()).toMatchObject({ flattens: 1, fillBuilds: 1, strokeBuilds: 2 });
    expect(out.draws[0]?.color).toEqual({ r: 1, g: 0, b: 0, a: 1 });
  });

  it("a new path or a new scale bucket flattens again; a small zoom does not", () => {
    const cache = new ShapeGeometryCache();
    const out = newPathLayer();
    cache.resolve(layer([frame()]), 1, false, out);
    cache.resolve(layer([frame()]), 1.1, false, out);
    expect(cache.stats().flattens).toBe(1);
    cache.resolve(layer([frame()]), 4, false, out);
    expect(cache.stats().flattens).toBe(2);
    cache.resolve(layer([frame({ source: { d: "M0 0 L50 0 L25 40 Z" } })]), 1, false, out);
    expect(cache.stats().flattens).toBe(3);
    expect(scaleBucket(1)).toBe(scaleBucket(1.1));
    expect(scaleBucket(2)).toBeGreaterThan(scaleBucket(1));
  });

  it("writes a fill draw and a stroke draw per path, inside and outside strokes cut by the fill's fans", () => {
    const cache = new ShapeGeometryCache();
    const out = newPathLayer();
    cache.resolve(layer([frame({ stroke: stroke(6, { align: "outside" }) }), frame({ id: "q", fill: null, stroke: stroke(2) })]), 1, false, out);
    expect(out.draws.map((d) => d.rule)).toEqual(["nonzero", "outside", "union"]);
    expect(out.draws[1]?.clip).toBe(out.draws[0]?.triangles);
    // The cut stroke's cover holds the fill's box; the layer's bounds hold every draw.
    const cover = out.draws[1]?.cover as number[];
    expect(cover[0]).toBeLessThanOrEqual(10);
    expect(out.bounds[0]).toBeLessThan(10);
    expect(out.bounds[2]).toBeGreaterThan(90);
  });

  it("draws nothing for an unfilled, unstroked path and for an empty trim", () => {
    const cache = new ShapeGeometryCache();
    const out = newPathLayer();
    expect(cache.resolve(layer([frame({ fill: null })]), 1, false, out)).toBe(false);
    expect(cache.resolve(layer([frame({ fill: null, stroke: stroke(), trim: { start: 0.3, end: 0.3, offset: 0 } })]), 1, false, out)).toBe(false);
  });

  it("primitives with the same params share geometry; a changed param rebuilds", () => {
    const cache = new ShapeGeometryCache();
    const out = newPathLayer();
    const arc = (end: number) => frame({ fill: null, stroke: stroke(), source: { primitive: { kind: "arc", radius: 40, start: 0, end }, w: 100, h: 100 } });
    cache.resolve(layer([arc(90)]), 1, false, out);
    cache.resolve(layer([arc(90)]), 1, false, out);
    expect(cache.stats().flattens).toBe(1);
    cache.resolve(layer([arc(180)]), 1, false, out);
    expect(cache.stats().flattens).toBe(2);
  });

  it("a build over 2 ms moves the path to the worker: the last geometry is shown until the worker's lands", async () => {
    let clock = 0;
    const requests: PathGeometryInput[] = [];
    let landed = 0;
    const resolvers: ((g: PathGeometry) => void)[] = [];
    const builder: GeometryBuilder = {
      build: (input) => {
        requests.push(input);
        return new Promise((resolve) => resolvers.push(resolve));
      },
    };
    const cache = new ShapeGeometryCache({ builder: () => builder, onReady: () => (landed += 1), now: () => (clock += 3) });
    const out = newPathLayer();
    const trim = (end: number) => frame({ fill: null, stroke: stroke(), trim: { start: 0, end, offset: 0 } });
    cache.resolve(layer([trim(0.5)]), 1, false, out);
    const before = out.draws[0]?.triangles;
    expect(requests).toHaveLength(0);
    // Slow now: the next change goes to the worker, the old stroke stays on screen.
    expect(cache.resolve(layer([trim(0.8)]), 1, false, out)).toBe(true);
    expect(requests).toHaveLength(1);
    expect(out.draws[0]?.triangles).toBe(before);
    expect(cache.stats().offloaded).toBe(1);
    (resolvers[0] as (g: PathGeometry) => void)(buildPathGeometry(requests[0] as PathGeometryInput));
    await Promise.resolve();
    expect(landed).toBe(1);
    cache.resolve(layer([trim(0.8)]), 1, false, out);
    expect(out.draws[0]?.triangles).not.toBe(before);
    // Exports never wait for the worker.
    const exact = newPathLayer();
    expect(cache.resolve(layer([trim(0.3)]), 1, true, exact)).toBe(true);
    expect(requests).toHaveLength(1);
  });
});
