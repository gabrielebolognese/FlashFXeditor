// Flattening (spec §21.12, Batch 65): a parsed path as polylines whose distance from the curves stays
// under a tolerance, given in view-box px by the caller from the on-screen scale. Cubics are split
// evenly into the segment count of Wang's formula. Pure: no DOM.
import { LINE, type ParsedPath } from "./pathData.js";

/** A flattened subpath: x, y pairs; `closed` joins the last point back to the first. */
export interface Polyline {
  pts: number[];
  closed: boolean;
}

/** Most segments one cubic is split into. */
const MAX_SEGMENTS = 256;

/** The segment count that keeps a cubic within `tolerance` of its chords (Wang's formula). */
export function cubicSegments(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, tolerance: number): number {
  const ax = x0 - 2 * x1 + x2;
  const ay = y0 - 2 * y1 + y2;
  const bx = x1 - 2 * x2 + x3;
  const by = y1 - 2 * y2 + y3;
  const m = Math.max(Math.hypot(ax, ay), Math.hypot(bx, by));
  if (!(m > 0)) return 1;
  return Math.min(MAX_SEGMENTS, Math.max(1, Math.ceil(Math.sqrt((0.75 * m) / tolerance))));
}

/** The path as polylines within `tolerance` px of its curves (consecutive equal points dropped). */
export function flattenPath(path: ParsedPath, tolerance: number): Polyline[] {
  const tol = tolerance > 0 ? tolerance : 0.25;
  const out: Polyline[] = [];
  for (const s of path) {
    const pts: number[] = [s.x, s.y];
    let cx = s.x;
    let cy = s.y;
    const push = (x: number, y: number) => {
      if (x === pts[pts.length - 2] && y === pts[pts.length - 1]) return;
      pts.push(x, y);
    };
    const c = s.cmds;
    for (let i = 0; i < c.length; ) {
      if (c[i] === LINE) {
        cx = c[i + 1] as number;
        cy = c[i + 2] as number;
        push(cx, cy);
        i += 3;
        continue;
      }
      const x1 = c[i + 1] as number;
      const y1 = c[i + 2] as number;
      const x2 = c[i + 3] as number;
      const y2 = c[i + 4] as number;
      const x3 = c[i + 5] as number;
      const y3 = c[i + 6] as number;
      const n = cubicSegments(cx, cy, x1, y1, x2, y2, x3, y3, tol);
      for (let k = 1; k < n; k++) {
        const t = k / n;
        const u = 1 - t;
        const a = u * u * u;
        const b = 3 * u * u * t;
        const d = 3 * u * t * t;
        const e = t * t * t;
        push(a * cx + b * x1 + d * x2 + e * x3, a * cy + b * y1 + d * y2 + e * y3);
      }
      push(x3, y3);
      cx = x3;
      cy = y3;
      i += 7;
    }
    // A closed subpath's last point equal to its first is the closing segment itself.
    if (s.closed && pts.length > 2 && pts[0] === pts[pts.length - 2] && pts[1] === pts[pts.length - 1]) pts.length -= 2;
    out.push({ pts, closed: s.closed });
  }
  return out;
}

/** The bounding box (x0, y0, x1, y1) of polylines; null when they have no points. */
export function polylineBounds(lines: readonly Polyline[]): [number, number, number, number] | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const line of lines) {
    const p = line.pts;
    for (let i = 0; i < p.length; i += 2) {
      const x = p[i] as number;
      const y = p[i + 1] as number;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x0 <= x1 ? [x0, y0, x1, y1] : null;
}
