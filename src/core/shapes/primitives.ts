// The primitive generators (spec §21.12, Batch 65): rectangles, ellipses, polygons, stars, arrows, arcs
// and lines as paths centered in the view box. Angles are degrees, 0 = up, clockwise (y points down).
// Pure: no DOM.
import type { Primitive, PrimitiveKind } from "../document/types.js";
import { CUBIC, ellipseCubics, formatPathData, LINE, type ParsedPath, type Subpath } from "./pathData.js";

/** The circle constant of a quarter-circle cubic. */
const KAPPA = 0.5522847498;

/** The number parameters of each primitive kind (the `paths.<id>.primitive.<param>` keyframe props). */
export const PRIMITIVE_PARAMS: Readonly<Record<PrimitiveKind, readonly string[]>> = {
  rect: ["w", "h", "radius"],
  ellipse: ["w", "h"],
  polygon: ["sides", "radius", "roundness"],
  star: ["points", "inner", "outer", "roundness"],
  arrow: ["length", "shaft", "head", "headLength"],
  arc: ["radius", "start", "end"],
  line: ["length"],
};

/** Limits of the primitive parameters (validation and the field table); others are lengths >= 0. */
export const PRIMITIVE_LIMITS = {
  sides: { min: 3, max: 64 },
  points: { min: 3, max: 64 },
  roundness: { min: 0, max: 1 },
  angle: { min: -3600, max: 3600 },
} as const;

const finite = (v: number, fallback = 0) => (Number.isFinite(v) ? v : fallback);
const len = (v: number) => Math.max(0, finite(v));

/** A closed subpath through `points` (x, y pairs), its corners rounded by `roundness` (0..1 of half the shorter neighboring edge). */
function roundedPolygon(points: readonly number[], roundness: number): Subpath {
  const n = points.length / 2;
  const r = Math.min(1, Math.max(0, finite(roundness)));
  if (r === 0 || n < 3) {
    const s: Subpath = { x: points[0] as number, y: points[1] as number, cmds: [], closed: true };
    for (let i = 1; i < n; i++) s.cmds.push(LINE, points[i * 2] as number, points[i * 2 + 1] as number);
    return s;
  }
  const px = (i: number) => points[((i + n) % n) * 2] as number;
  const py = (i: number) => points[((i + n) % n) * 2 + 1] as number;
  // The cut points before (a) and after (b) each corner.
  const ax: number[] = [];
  const ay: number[] = [];
  const bx: number[] = [];
  const by: number[] = [];
  for (let i = 0; i < n; i++) {
    const vx = px(i);
    const vy = py(i);
    const inLen = Math.hypot(vx - px(i - 1), vy - py(i - 1));
    const outLen = Math.hypot(px(i + 1) - vx, py(i + 1) - vy);
    const cut = (r * Math.min(inLen, outLen)) / 2;
    ax.push(inLen > 0 ? vx + ((px(i - 1) - vx) * cut) / inLen : vx);
    ay.push(inLen > 0 ? vy + ((py(i - 1) - vy) * cut) / inLen : vy);
    bx.push(outLen > 0 ? vx + ((px(i + 1) - vx) * cut) / outLen : vx);
    by.push(outLen > 0 ? vy + ((py(i + 1) - vy) * cut) / outLen : vy);
  }
  const s: Subpath = { x: bx[0] as number, y: by[0] as number, cmds: [], closed: true };
  for (let k = 1; k <= n; k++) {
    const i = k % n;
    const vx = px(i);
    const vy = py(i);
    const a0 = ax[i] as number;
    const a1 = ay[i] as number;
    const b0 = bx[i] as number;
    const b1 = by[i] as number;
    s.cmds.push(LINE, a0, a1);
    s.cmds.push(CUBIC, a0 + (vx - a0) * KAPPA, a1 + (vy - a1) * KAPPA, b0 + (vx - b0) * KAPPA, b1 + (vy - b1) * KAPPA, b0, b1);
  }
  return s;
}

/** A point at `degrees` (0 = up, clockwise) on the circle of radius `r` about (cx, cy). */
const polar = (cx: number, cy: number, r: number, degrees: number): [number, number] => {
  const a = (degrees * Math.PI) / 180;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
};

/** The primitive's path in a view box of `w` x `h` px (centered in it). */
export function primitivePath(primitive: Primitive, w: number, h: number): ParsedPath {
  const cx = finite(w) / 2;
  const cy = finite(h) / 2;
  switch (primitive.kind) {
    case "rect": {
      const rw = len(primitive.w);
      const rh = len(primitive.h);
      if (rw === 0 || rh === 0) return [];
      const r = Math.min(len(primitive.radius), rw / 2, rh / 2);
      const x0 = cx - rw / 2;
      const y0 = cy - rh / 2;
      const x1 = cx + rw / 2;
      const y1 = cy + rh / 2;
      if (r === 0) return [{ x: x0, y: y0, cmds: [LINE, x1, y0, LINE, x1, y1, LINE, x0, y1], closed: true }];
      const k = r * (1 - KAPPA);
      return [
        {
          x: x0 + r,
          y: y0,
          cmds: [
            LINE, x1 - r, y0, CUBIC, x1 - k, y0, x1, y0 + k, x1, y0 + r,
            LINE, x1, y1 - r, CUBIC, x1, y1 - k, x1 - k, y1, x1 - r, y1,
            LINE, x0 + r, y1, CUBIC, x0 + k, y1, x0, y1 - k, x0, y1 - r,
            LINE, x0, y0 + r, CUBIC, x0, y0 + k, x0 + k, y0, x0 + r, y0,
          ],
          closed: true,
        },
      ];
    }
    case "ellipse": {
      const rx = len(primitive.w) / 2;
      const ry = len(primitive.h) / 2;
      if (rx === 0 || ry === 0) return [];
      const s: Subpath = { x: cx, y: cy - ry, cmds: [], closed: true };
      ellipseCubics(cx, cy, rx, ry, 0, -Math.PI / 2, 2 * Math.PI, s.cmds);
      return [s];
    }
    case "polygon": {
      const sides = Math.round(Math.min(PRIMITIVE_LIMITS.sides.max, Math.max(PRIMITIVE_LIMITS.sides.min, finite(primitive.sides, 3))));
      const r = len(primitive.radius);
      if (r === 0) return [];
      const pts: number[] = [];
      for (let i = 0; i < sides; i++) pts.push(...polar(cx, cy, r, (360 * i) / sides));
      return [roundedPolygon(pts, primitive.roundness)];
    }
    case "star": {
      const points = Math.round(Math.min(PRIMITIVE_LIMITS.points.max, Math.max(PRIMITIVE_LIMITS.points.min, finite(primitive.points, 5))));
      const outer = len(primitive.outer);
      const inner = len(primitive.inner);
      if (outer === 0 && inner === 0) return [];
      const pts: number[] = [];
      for (let i = 0; i < points * 2; i++) pts.push(...polar(cx, cy, i % 2 === 0 ? outer : inner, (180 * i) / points));
      return [roundedPolygon(pts, primitive.roundness)];
    }
    case "arrow": {
      const length = len(primitive.length);
      if (length === 0) return [];
      const shaft = len(primitive.shaft) / 2;
      const head = Math.max(len(primitive.head) / 2, shaft);
      const headLength = Math.min(len(primitive.headLength), length);
      const x0 = cx - length / 2;
      const x1 = cx + length / 2;
      const xb = x1 - headLength;
      const pts = shaft > 0 && xb > x0
        ? [x0, cy - shaft, xb, cy - shaft, xb, cy - head, x1, cy, xb, cy + head, xb, cy + shaft, x0, cy + shaft]
        : [xb, cy - head, x1, cy, xb, cy + head];
      return [roundedPolygon(pts, 0)];
    }
    case "arc": {
      const r = len(primitive.radius);
      const start = Math.min(PRIMITIVE_LIMITS.angle.max, Math.max(PRIMITIVE_LIMITS.angle.min, finite(primitive.start)));
      const end = Math.min(PRIMITIVE_LIMITS.angle.max, Math.max(PRIMITIVE_LIMITS.angle.min, finite(primitive.end)));
      const sweep = Math.max(-360, Math.min(360, end - start));
      if (r === 0 || sweep === 0) return [];
      const [x, y] = polar(cx, cy, r, start);
      const s: Subpath = { x, y, cmds: [], closed: false };
      ellipseCubics(cx, cy, r, r, 0, ((start - 90) * Math.PI) / 180, (sweep * Math.PI) / 180, s.cmds);
      return [s];
    }
    case "line": {
      const length = len(primitive.length);
      if (length === 0) return [];
      return [{ x: cx - length / 2, y: cy, cmds: [LINE, cx + length / 2, cy], closed: false }];
    }
  }
}

/** The SVG path data of a primitive (what `ShapePath.d` holds when the path has one). */
export function primitivePathData(primitive: Primitive, w: number, h: number): string {
  return formatPathData(primitivePath(primitive, w, h));
}

/** A primitive with default parameters fitting a view box of `w` x `h` (Batch 66's `+ Shape` uses it). */
export function defaultPrimitive(kind: PrimitiveKind, w: number, h: number): Primitive {
  const side = Math.min(w, h);
  switch (kind) {
    case "rect":
      return { kind, w, h, radius: 0 };
    case "ellipse":
      return { kind, w, h };
    case "polygon":
      return { kind, sides: 6, radius: side / 2, roundness: 0 };
    case "star":
      return { kind, points: 5, outer: side / 2, inner: side / 4, roundness: 0 };
    case "arrow":
      return { kind, length: w, shaft: h / 4, head: h, headLength: Math.min(w / 3, h) };
    case "arc":
      return { kind, radius: side / 2, start: 0, end: 270 };
    case "line":
      return { kind, length: w };
  }
}
