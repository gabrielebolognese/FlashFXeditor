// Ported from FlashFX-v2 src/engine/pathTessellation.ts (buildStroke, addJoin, addCap) @ a91c675, adapted.
// Stroke geometry (spec §21.12, Batch 65): the visible runs of a flattened path (its trim, then its dash
// pattern) expanded into triangles: a quad per segment, joins (miter within the miter limit, else bevel;
// round; bevel) and caps (butt, round, square; zero-length runs draw a dot with round and square caps).
// The triangles overlap at joins; the renderer draws them as a union (stencil), so overlaps never
// double the color. Positions are view-box px. Pure: no DOM.
import type { LineCap, LineJoin, PathTrim } from "../document/types.js";
import type { Polyline } from "./flatten.js";

export interface StrokeParams {
  /** Full width in view-box px. */
  width: number;
  cap: LineCap;
  join: LineJoin;
  miterLimit: number;
  dash?: readonly number[] | null;
  dashOffset?: number;
}

/** A run of a path to stroke: x, y pairs, `closed` when it loops (no caps). */
export interface Run {
  pts: number[];
  closed: boolean;
}

const EPS = 1e-9;

/** Cumulative lengths of a polyline's points (the closing segment's end last for a closed one). */
function cumulative(line: Polyline): number[] {
  const p = line.pts;
  const cum = [0];
  let total = 0;
  for (let i = 2; i < p.length; i += 2) {
    total += Math.hypot((p[i] as number) - (p[i - 2] as number), (p[i + 1] as number) - (p[i - 1] as number));
    cum.push(total);
  }
  if (line.closed && p.length >= 4) {
    total += Math.hypot((p[0] as number) - (p[p.length - 2] as number), (p[1] as number) - (p[p.length - 1] as number));
    cum.push(total);
  }
  return cum;
}

/** The points of `line` between lengths a and b (a < b) along it. */
function slice(line: Polyline, cum: readonly number[], a: number, b: number): number[] {
  const p = line.pts;
  const count = p.length / 2;
  const px = (i: number) => p[(i % count) * 2] as number;
  const py = (i: number) => p[(i % count) * 2 + 1] as number;
  const out: number[] = [];
  const at = (i: number, t: number) => {
    const x = px(i) + (px(i + 1) - px(i)) * t;
    const y = py(i) + (py(i + 1) - py(i)) * t;
    out.push(x, y);
  };
  const segs = cum.length - 1;
  let i = 0;
  while (i < segs - 1 && (cum[i + 1] as number) < a) i += 1;
  const segLen = (k: number) => (cum[k + 1] as number) - (cum[k] as number);
  at(i, segLen(i) > 0 ? (a - (cum[i] as number)) / segLen(i) : 0);
  while (i < segs && (cum[i + 1] as number) < b) {
    out.push(px(i + 1), py(i + 1));
    i += 1;
  }
  if (i >= segs) i = segs - 1;
  at(i, segLen(i) > 0 ? (b - (cum[i] as number)) / segLen(i) : 1);
  return out;
}

/** The trim as intervals of [0, total]; null when the whole path shows. */
function trimIntervals(trim: PathTrim | null | undefined, total: number): [number, number][] | null {
  if (!trim) return null;
  const s0 = Math.min(trim.start, trim.end);
  const e0 = Math.max(trim.start, trim.end);
  const span = e0 - s0;
  if (!Number.isFinite(span) || span >= 1 - EPS) return null;
  if (span <= EPS) return [];
  const offset = Number.isFinite(trim.offset) ? trim.offset : 0;
  let s = (s0 + offset) % 1;
  if (s < 0) s += 1;
  const e = s + span;
  return e <= 1 ? [[s * total, e * total]] : [[s * total, total], [0, (e - 1) * total]];
}

/** The pattern SVG draws: lengths >= 0, doubled when odd; null when it draws a solid line. */
function dashPattern(dash: readonly number[] | null | undefined): number[] | null {
  if (!dash || dash.length === 0) return null;
  const pattern = dash.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  if (pattern.reduce((a, b) => a + b, 0) <= EPS) return null;
  return pattern.length % 2 === 1 ? [...pattern, ...pattern] : pattern;
}

/** The "on" parts of [a, b] under the dash pattern, positions measured from the subpath's start. */
function dashRuns(a: number, b: number, pattern: readonly number[], offset: number): [number, number][] {
  const period = pattern.reduce((x, y) => x + y, 0);
  const out: [number, number][] = [];
  let phase = ((((a + offset) % period) + period) % period);
  let k = 0;
  while (phase >= (pattern[k] as number) && k < pattern.length) {
    phase -= pattern[k] as number;
    k += 1;
  }
  k %= pattern.length;
  let t = a;
  let guard = 0;
  while (t < b && guard++ < 100000) {
    const left = (pattern[k] as number) - phase;
    const next = Math.min(b, t + left);
    if (k % 2 === 0 && next > t) out.push([t, next]);
    else if (k % 2 === 0 && left === 0 && pattern[k] === 0) out.push([t, t]);
    t = next;
    phase = 0;
    k = (k + 1) % pattern.length;
  }
  return out;
}

/** The parts of the polylines a stroke draws after its trim and dash pattern. */
export function visibleRuns(lines: readonly Polyline[], trim?: PathTrim | null, dash?: readonly number[] | null, dashOffset = 0): Run[] {
  const cums = lines.map(cumulative);
  const total = cums.reduce((sum, cum) => sum + (cum[cum.length - 1] as number), 0);
  const trims = trimIntervals(trim, total);
  const pattern = dashPattern(dash);
  const offset = Number.isFinite(dashOffset) ? dashOffset : 0;
  if (trims === null && pattern === null) return lines.map((line) => ({ pts: line.pts, closed: line.closed && line.pts.length >= 6 }));
  const runs: Run[] = [];
  let base = 0;
  lines.forEach((line, index) => {
    const cum = cums[index] as number[];
    const length = cum[cum.length - 1] as number;
    // The visible intervals of this subpath, in its own length.
    let local: [number, number][];
    if (trims === null) local = [[0, length]];
    else {
      local = [];
      for (const [s, e] of trims) {
        const a = Math.max(s, base) - base;
        const b = Math.min(e, base + length) - base;
        if (b > a || (b === a && length === 0 && s <= base && e >= base)) local.push([a, b]);
      }
      local.sort((x, y) => x[0] - y[0]);
    }
    base += length;
    if (line.pts.length < 4 || length === 0) {
      if (local.length > 0) runs.push({ pts: line.pts.slice(0, 2), closed: false });
      return;
    }
    if (pattern === null) {
      const first = local[0];
      const last = local[local.length - 1];
      // A trim wrapping across a closed subpath's start is one run through that point.
      if (line.closed && local.length === 2 && first && last && first[0] <= EPS && last[1] >= length - EPS) {
        const tail = slice(line, cum, last[0], length);
        const head = slice(line, cum, 0, first[1]);
        runs.push({ pts: [...tail, ...head.slice(2)], closed: false });
        return;
      }
      for (const [a, b] of local) runs.push({ pts: a === b ? slice(line, cum, a, a).slice(0, 2) : slice(line, cum, a, b), closed: false });
      return;
    }
    for (const [a, b] of local) {
      for (const [da, db] of dashRuns(a, b, pattern, offset)) runs.push({ pts: da === db ? slice(line, cum, da, da).slice(0, 2) : slice(line, cum, da, db), closed: false });
    }
  });
  return runs;
}

/** Angle steps of round joins and caps within `tolerance` px of the true circle of radius `hw`. */
function arcStep(hw: number, tolerance: number): number {
  const c = 1 - tolerance / hw;
  return c <= -1 ? Math.PI : Math.max(Math.PI / 64, 2 * Math.acos(Math.min(1, Math.max(-1, c))));
}

/** Appends the stroke triangles of `run` (x, y per vertex, 3 vertices per triangle) to `out`. */
export function strokeRun(run: Run, params: StrokeParams, tolerance: number, out: number[]): void {
  const hw = params.width / 2;
  if (!(hw > 0)) return;
  const src = run.pts;
  // Drop repeated points (and a closed run's repeated first point).
  const p: number[] = [];
  for (let i = 0; i < src.length; i += 2) {
    const x = src[i] as number;
    const y = src[i + 1] as number;
    if (p.length >= 2 && Math.abs(x - (p[p.length - 2] as number)) < EPS && Math.abs(y - (p[p.length - 1] as number)) < EPS) continue;
    p.push(x, y);
  }
  let closed = run.closed;
  if (closed && p.length >= 4 && Math.abs((p[0] as number) - (p[p.length - 2] as number)) < EPS && Math.abs((p[1] as number) - (p[p.length - 1] as number)) < EPS) p.length -= 2;
  const n = p.length / 2;
  if (n === 0) return;
  const step = arcStep(hw, tolerance);
  const tri = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => out.push(ax, ay, bx, by, cx, cy);
  if (n === 1) {
    // A zero-length run: a dot with round and square caps (SVG), nothing with butt.
    const x = p[0] as number;
    const y = p[1] as number;
    if (params.cap === "round") fan(x, y, hw, 0, 2 * Math.PI, step, tri);
    else if (params.cap === "square") {
      tri(x - hw, y - hw, x + hw, y - hw, x + hw, y + hw);
      tri(x - hw, y - hw, x + hw, y + hw, x - hw, y + hw);
    }
    return;
  }
  if (n === 2) closed = false;
  const X = (i: number) => p[((i + n) % n) * 2] as number;
  const Y = (i: number) => p[((i + n) % n) * 2 + 1] as number;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const ax = X(i);
    const ay = Y(i);
    const bx = X(i + 1);
    const by = Y(i + 1);
    const l = Math.hypot(bx - ax, by - ay);
    const ox = (-(by - ay) / l) * hw;
    const oy = ((bx - ax) / l) * hw;
    tri(ax + ox, ay + oy, ax - ox, ay - oy, bx + ox, by + oy);
    tri(ax - ox, ay - oy, bx - ox, by - oy, bx + ox, by + oy);
  }
  const joins = closed ? n : n - 2;
  for (let k = 0; k < joins; k++) {
    const i = closed ? k : k + 1;
    join(X(i - 1), Y(i - 1), X(i), Y(i), X(i + 1), Y(i + 1), hw, params, step, tri);
  }
  if (!closed) {
    cap(X(1), Y(1), X(0), Y(0), hw, params.cap, step, tri);
    cap(X(n - 2), Y(n - 2), X(n - 1), Y(n - 1), hw, params.cap, step, tri);
  }
}

type Tri = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => void;

/** Triangles of the circle sector about (x, y) from angle a0 over `delta` (radians). */
function fan(x: number, y: number, r: number, a0: number, delta: number, step: number, tri: Tri): void {
  const steps = Math.min(128, Math.max(1, Math.ceil(Math.abs(delta) / step)));
  let px = x + Math.cos(a0) * r;
  let py = y + Math.sin(a0) * r;
  for (let s = 1; s <= steps; s++) {
    const a = a0 + (delta * s) / steps;
    const qx = x + Math.cos(a) * r;
    const qy = y + Math.sin(a) * r;
    tri(x, y, px, py, qx, qy);
    px = qx;
    py = qy;
  }
}

function join(px: number, py: number, cx: number, cy: number, nx: number, ny: number, hw: number, params: StrokeParams, step: number, tri: Tri): void {
  const l0 = Math.hypot(cx - px, cy - py);
  const l1 = Math.hypot(nx - cx, ny - cy);
  if (l0 < EPS || l1 < EPS) return;
  const d0x = (cx - px) / l0;
  const d0y = (cy - py) / l0;
  const d1x = (nx - cx) / l1;
  const d1y = (ny - cy) / l1;
  const cross = d0x * d1y - d0y * d1x;
  const dot = d0x * d1x + d0y * d1y;
  if (Math.abs(cross) < 1e-9 && dot > 0) return; // straight on
  // The outer side of the turn.
  const side = cross > 0 ? -1 : 1;
  const ax = cx - d0y * hw * side;
  const ay = cy + d0x * hw * side;
  const bx = cx - d1y * hw * side;
  const by = cy + d1x * hw * side;
  if (params.join === "round") {
    const a0 = Math.atan2(ay - cy, ax - cx);
    let delta = Math.atan2(by - cy, bx - cx) - a0;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    fan(cx, cy, hw, a0, delta, step, tri);
    return;
  }
  if (params.join === "miter") {
    // SVG: the miter length over the width is 1 / sin(theta / 2), theta the angle between the segments.
    const ratio = 1 / Math.sqrt(Math.max(EPS, (1 - dot) / 2));
    const limit = Number.isFinite(params.miterLimit) ? Math.max(1, params.miterLimit) : 4;
    if (ratio <= limit) {
      const denom = d0x * d1y - d0y * d1x;
      if (Math.abs(denom) > 1e-12) {
        const t = ((bx - ax) * d1y - (by - ay) * d1x) / denom;
        const mx = ax + d0x * t;
        const my = ay + d0y * t;
        tri(cx, cy, ax, ay, mx, my);
        tri(cx, cy, mx, my, bx, by);
        return;
      }
    }
  }
  tri(cx, cy, ax, ay, bx, by);
}

function cap(ix: number, iy: number, ex: number, ey: number, hw: number, kind: LineCap, step: number, tri: Tri): void {
  if (kind === "butt") return;
  const l = Math.hypot(ex - ix, ey - iy);
  if (l < EPS) return;
  const dx = (ex - ix) / l;
  const dy = (ey - iy) / l;
  const nx = -dy * hw;
  const ny = dx * hw;
  if (kind === "square") {
    const sx = dx * hw;
    const sy = dy * hw;
    tri(ex + nx, ey + ny, ex - nx, ey - ny, ex + nx + sx, ey + ny + sy);
    tri(ex - nx, ey - ny, ex - nx + sx, ey - ny + sy, ex + nx + sx, ey + ny + sy);
    return;
  }
  fan(ex, ey, hw, Math.atan2(ny, nx), -Math.PI, step, tri);
}

/** The stroke triangles of the polylines with their trim and dashes. */
export function strokeGeometry(lines: readonly Polyline[], params: StrokeParams, trim: PathTrim | null | undefined, tolerance: number): Float32Array {
  const out: number[] = [];
  for (const run of visibleRuns(lines, trim, params.dash, params.dashOffset ?? 0)) strokeRun(run, params, tolerance, out);
  return new Float32Array(out);
}
