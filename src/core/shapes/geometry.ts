// Path geometry (spec §21.12, Batch 65): what the renderer draws for one path of a shape clip. Fills are
// triangle fans of each subpath, exact for both fill rules when drawn stencil-then-cover (the stencil
// counts the winding; the cover pass paints where the rule says inside), so no triangulation and no
// dependency. Strokes are the triangles of `stroke.ts`, drawn as a union. All in view-box px.
// `buildPathGeometry` is pure and structured-clone friendly (the geometry worker runs it too).
import type { PathTrim, Primitive } from "../document/types.js";
import { flattenPath, polylineBounds, type Polyline } from "./flatten.js";
import { parsePathData, type ParsedPath } from "./pathData.js";
import { primitivePath } from "./primitives.js";
import { strokeGeometry, type StrokeParams } from "./stroke.js";

/** What a path is made from: its path data, or a primitive in a view box. */
export type PathSource = { d: string } | { primitive: Primitive; w: number; h: number };

export interface PathGeometryInput {
  source: PathSource;
  /** View-box px a flattened curve may stray from the true one. */
  tolerance: number;
  /** Build the fill fans. */
  fill: boolean;
  stroke: StrokeParams | null;
  trim: PathTrim | null;
}

/** x0, y0, x1, y1. */
export type Bounds = [number, number, number, number];

export interface PathGeometry {
  /** Fill fans (x, y per vertex, 3 per triangle); null when not asked for or empty. */
  fill: Float32Array | null;
  /** Stroke triangles; null when not asked for or empty. */
  stroke: Float32Array | null;
  /** The flattened path's box (gradients are laid out in it); null for an empty path. */
  box: Bounds | null;
  /** The box of everything drawn (fill and stroke); null when nothing is. */
  bounds: Bounds | null;
}

/** The parsed form of a source (path data that does not parse draws nothing; the validator reports it). */
export function sourcePath(source: PathSource): ParsedPath {
  if ("primitive" in source) return primitivePath(source.primitive, source.w, source.h);
  try {
    return parsePathData(source.d);
  } catch {
    return [];
  }
}

/** Fill fans of the polylines: (p0, pi, pi+1) per subpath of 3 points or more (open ones fill as if closed). */
export function fillFans(lines: readonly Polyline[]): Float32Array {
  let count = 0;
  for (const line of lines) if (line.pts.length >= 6) count += (line.pts.length / 2 - 2) * 6;
  const out = new Float32Array(count);
  let o = 0;
  for (const line of lines) {
    const p = line.pts;
    if (p.length < 6) continue;
    const x0 = p[0] as number;
    const y0 = p[1] as number;
    for (let i = 2; i + 3 < p.length; i += 2) {
      out[o++] = x0;
      out[o++] = y0;
      out[o++] = p[i] as number;
      out[o++] = p[i + 1] as number;
      out[o++] = p[i + 2] as number;
      out[o++] = p[i + 3] as number;
    }
  }
  return out;
}

/** The box of triangle vertices, or null. */
export function vertexBounds(data: Float32Array | null): Bounds | null {
  if (!data || data.length < 2) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < data.length; i += 2) {
    const x = data[i] as number;
    const y = data[i + 1] as number;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

export function unionBounds(a: Bounds | null, b: Bounds | null): Bounds | null {
  if (!a) return b;
  if (!b) return a;
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}

/** The flattened polylines of a source and their box. */
export function flattenSource(source: PathSource, tolerance: number): { lines: Polyline[]; box: Bounds | null } {
  const lines = flattenPath(sourcePath(source), tolerance);
  return { lines, box: polylineBounds(lines) };
}

/** Builds a path's geometry from scratch (the cache in `render/shapes` reuses the parts that did not change). */
export function buildPathGeometry(input: PathGeometryInput): PathGeometry {
  const { lines, box } = flattenSource(input.source, input.tolerance);
  const fill = input.fill ? fillFans(lines) : null;
  const stroke = input.stroke ? strokeGeometry(lines, input.stroke, input.trim, input.tolerance) : null;
  const f = fill && fill.length > 0 ? fill : null;
  const s = stroke && stroke.length > 0 ? stroke : null;
  return { fill: f, stroke: s, box, bounds: unionBounds(f ? box : null, vertexBounds(s)) };
}
