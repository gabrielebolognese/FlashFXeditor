// Ported from FlashFX-v2 src/core/maskPath.ts @ a91c675, adapted.
// Path masks (spec §21.18, Batch 73): a mask outline is SVG path data in the clip's content px (parsed by
// core/shapes/pathData.ts into lines and cubics; every subpath is closed). Its "points" are every
// coordinate pair of that parsed form in order (each subpath's start, then a line's end or a cubic's two
// controls and end) as one flat vector [x0, y0, x1, y1, ...]: the value of a `masks.<id>.path` key.
// Between two keys with the same point count the points move pair for pair (FlashFX's vertex-for-vertex
// interpolation: curves stay curves and moving one point only moves its own edges); the structure (which
// pairs are lines, controls or ends) is the base path's. Editing adds a point by splitting a segment and
// deletes one by joining its two segments, the same in the base and in every key so the counts stay equal.
// Pure: no DOM.
import { CUBIC, LINE, formatPathData, parsePathData, type ParsedPath } from "../shapes/pathData.js";

/** The parsed outline of `d` with every subpath closed; null when `d` does not parse. */
export function parseMaskPath(d: string): ParsedPath | null {
  try {
    const path = parsePathData(d);
    for (const s of path) s.closed = true;
    return path;
  } catch {
    return null;
  }
}

/** The points of a parsed outline as one vector (see the header). */
export function pathPoints(path: ParsedPath): number[] {
  const out: number[] = [];
  for (const s of path) {
    out.push(s.x, s.y);
    const c = s.cmds;
    for (let i = 0; i < c.length; ) {
      const n = c[i] === LINE ? 2 : 6;
      for (let k = 1; k <= n; k++) out.push(c[i + k] as number);
      i += n + 1;
    }
  }
  return out;
}

/** The points of `d` (see the header); null when `d` does not parse. */
export function maskPathPoints(d: string): number[] | null {
  const path = parseMaskPath(d);
  return path ? pathPoints(path) : null;
}

/** A copy of `path` with its points taken from `points` (missing values keep the path's own). */
export function withPoints(path: ParsedPath, points: ArrayLike<number>): ParsedPath {
  let j = 0;
  const next = (own: number) => {
    const v = j < points.length ? (points[j] as number) : own;
    j += 1;
    return Number.isFinite(v) ? v : own;
  };
  return path.map((s) => {
    const x = next(s.x);
    const y = next(s.y);
    const cmds = s.cmds.slice();
    for (let i = 0; i < cmds.length; ) {
      const n = cmds[i] === LINE ? 2 : 6;
      for (let k = 1; k <= n; k++) cmds[i + k] = next(cmds[i + k] as number);
      i += n + 1;
    }
    return { x, y, cmds, closed: true };
  });
}

/** The path data of a parsed outline (closed subpaths, absolute M, L, C, Z). */
export function formatMaskPath(path: ParsedPath): string {
  return formatPathData(path.map((sub) => ({ ...sub, closed: true })));
}

/** `d` with its points replaced by `points` (closed subpaths, absolute M, L, C, Z); `d` itself when it does not parse. */
export function maskPathData(d: string, points: ArrayLike<number>): string {
  const path = parseMaskPath(d);
  return path ? formatPathData(withPoints(path, points)) : d;
}

/** What a point of the vector is: a segment's end or a subpath's start (an anchor), or a cubic's control (a handle of `anchor`). */
export interface PointRole {
  kind: "anchor" | "handle";
  /** For a handle, the anchor (pair index) it belongs to; for an anchor, itself. */
  anchor: number;
}

/** The role of each point (pair index) of a parsed outline: the overlay draws anchors as squares and handles as dots. */
export function pointRoles(path: ParsedPath): PointRole[] {
  const roles: PointRole[] = [];
  for (const s of path) {
    const start = roles.length;
    roles.push({ kind: "anchor", anchor: start });
    let previous = start;
    const c = s.cmds;
    for (let i = 0; i < c.length; ) {
      if (c[i] === LINE) {
        previous = roles.length;
        roles.push({ kind: "anchor", anchor: previous });
        i += 3;
      } else {
        const end = roles.length + 2;
        roles.push({ kind: "handle", anchor: previous }, { kind: "handle", anchor: end }, { kind: "anchor", anchor: end });
        previous = end;
        i += 7;
      }
    }
  }
  return roles;
}

/** A segment of a parsed outline: subpath `sub`, its `seg`-th segment (the closing line is `seg` = the segment count). */
export interface SegmentRef {
  sub: number;
  seg: number;
}

/** The segments of subpath `s` as [x0, y0, ...controls, x1, y1] arrays, the implicit closing line last (when it has length). */
function segments(s: ParsedPath[number]): number[][] {
  const out: number[][] = [];
  let cx = s.x;
  let cy = s.y;
  const c = s.cmds;
  for (let i = 0; i < c.length; ) {
    if (c[i] === LINE) {
      out.push([cx, cy, c[i + 1] as number, c[i + 2] as number]);
      cx = c[i + 1] as number;
      cy = c[i + 2] as number;
      i += 3;
    } else {
      out.push([cx, cy, ...(c.slice(i + 1, i + 7) as number[])]);
      cx = c[i + 5] as number;
      cy = c[i + 6] as number;
      i += 7;
    }
  }
  if (cx !== s.x || cy !== s.y) out.push([cx, cy, s.x, s.y]);
  return out;
}

function pointOn(segment: readonly number[], t: number): [number, number] {
  if (segment.length === 4) return [lerp(segment[0] as number, segment[2] as number, t), lerp(segment[1] as number, segment[3] as number, t)];
  const [x0, y0, x1, y1, x2, y2, x3, y3] = segment as [number, number, number, number, number, number, number, number];
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const d = 3 * u * t * t;
  const e = t * t * t;
  return [a * x0 + b * x1 + d * x2 + e * x3, a * y0 + b * y1 + d * y2 + e * y3];
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** The segment nearest (x, y) with the parameter of the nearest point on it and its distance (sampled; content px). */
export function nearestSegment(path: ParsedPath, x: number, y: number): (SegmentRef & { t: number; distance: number }) | null {
  let best: (SegmentRef & { t: number; distance: number }) | null = null;
  path.forEach((s, sub) => {
    segments(s).forEach((segment, seg) => {
      const steps = segment.length === 4 ? 1 : 24;
      let prev = pointOn(segment, 0);
      for (let k = 1; k <= steps; k++) {
        const cur = pointOn(segment, k / steps);
        const ex = cur[0] - prev[0];
        const ey = cur[1] - prev[1];
        const ee = ex * ex + ey * ey;
        const u = ee > 1e-12 ? Math.min(1, Math.max(0, ((x - prev[0]) * ex + (y - prev[1]) * ey) / ee)) : 0;
        const distance = Math.hypot(x - prev[0] - ex * u, y - prev[1] - ey * u);
        if (!best || distance < best.distance) best = { sub, seg, t: (k - 1 + u) / steps, distance };
        prev = cur;
      }
    });
  });
  return best;
}

/**
 * `path` with segment `ref` split at `t` (a new anchor there; a cubic is split with de Casteljau so the
 * outline keeps its shape; the closing line becomes an explicit line). Unchanged for a missing segment.
 */
export function splitSegment(path: ParsedPath, ref: SegmentRef, t: number): ParsedPath {
  const s = path[ref.sub];
  if (!s) return path;
  const list = segments(s);
  const segment = list[ref.seg];
  if (!segment) return path;
  const k = Math.min(1, Math.max(0, t));
  const cmds: number[] = [];
  list.forEach((part, index) => {
    const closing = index === list.length - 1 && index >= countCmds(s);
    if (index !== ref.seg) {
      if (!closing) cmds.push(...cmdOf(part));
      return;
    }
    if (part.length === 4) {
      const [mx, my] = pointOn(part, k);
      cmds.push(LINE, mx, my);
      if (!closing) cmds.push(LINE, part[2] as number, part[3] as number);
      return;
    }
    const [x0, y0, x1, y1, x2, y2, x3, y3] = part as [number, number, number, number, number, number, number, number];
    const ax = lerp(x0, x1, k), ay = lerp(y0, y1, k);
    const bx = lerp(x1, x2, k), by = lerp(y1, y2, k);
    const cx = lerp(x2, x3, k), cy = lerp(y2, y3, k);
    const dx = lerp(ax, bx, k), dy = lerp(ay, by, k);
    const ex = lerp(bx, cx, k), ey = lerp(by, cy, k);
    const fx = lerp(dx, ex, k), fy = lerp(dy, ey, k);
    cmds.push(CUBIC, ax, ay, dx, dy, fx, fy, CUBIC, ex, ey, cx, cy, x3, y3);
  });
  return path.map((p, i) => (i === ref.sub ? { ...p, cmds, closed: true } : p));
}

function countCmds(s: ParsedPath[number]): number {
  let n = 0;
  for (let i = 0; i < s.cmds.length; n++) i += s.cmds[i] === LINE ? 3 : 7;
  return n;
}

function cmdOf(segment: readonly number[]): number[] {
  return segment.length === 4 ? [LINE, segment[2] as number, segment[3] as number] : [CUBIC, ...(segment.slice(2) as number[])];
}

/** Where anchor `pair` (a pair index of the vector) is: its subpath and the segment it ends (-1: the subpath's start). */
export function anchorRef(path: ParsedPath, pair: number): (SegmentRef & { start: boolean }) | null {
  let index = 0;
  for (let sub = 0; sub < path.length; sub++) {
    const s = path[sub] as ParsedPath[number];
    if (index === pair) return { sub, seg: -1, start: true };
    index += 1;
    let seg = 0;
    for (let i = 0; i < s.cmds.length; seg++) {
      const line = s.cmds[i] === LINE;
      index += line ? 1 : 3;
      if (index - 1 === pair) return { sub, seg, start: false };
      if (index - 1 > pair) return null;
      i += line ? 3 : 7;
    }
  }
  return null;
}

/** Anchors of subpath `sub` (its start and its segments' ends). */
function anchorCount(s: ParsedPath[number]): number {
  return 1 + countCmds(s);
}

/**
 * `path` without anchor `pair`: the two segments around it become one (a line when both were lines, else
 * a cubic keeping the outer controls). A subpath keeps at least 3 anchors: null when the point cannot go.
 */
export function deleteAnchor(path: ParsedPath, pair: number): ParsedPath | null {
  const ref = anchorRef(path, pair);
  if (!ref) return null;
  const s = path[ref.sub] as ParsedPath[number];
  if (anchorCount(s) <= 3) return null;
  const list = segments(s);
  const explicit = countCmds(s);
  // The segments as [start, ...] arrays; the anchor joins segment `before` (ending at it) and `after` (starting at it).
  const before = ref.start ? list.length - 1 : ref.seg;
  const after = ref.start ? 0 : ref.seg + 1 < list.length ? ref.seg + 1 : -1;
  if (after === -1) {
    // The last explicit segment's end with no closing line after it (it sits on the start): drop that end, close straight.
    const cmds = s.cmds.slice(0, cmdStart(s, explicit - 1));
    return path.map((p, i) => (i === ref.sub ? { ...p, cmds, closed: true } : p));
  }
  const a = list[before] as number[];
  const b = list[after] as number[];
  const joined = a.length === 4 && b.length === 4 ? [a[0] as number, a[1] as number, b[2] as number, b[3] as number] : [a[0] as number, a[1] as number, ...(a.length === 4 ? [a[0] as number, a[1] as number] : (a.slice(2, 4) as number[])), ...(b.length === 4 ? [b[2] as number, b[3] as number] : (b.slice(4, 6) as number[])), b[b.length - 2] as number, b[b.length - 1] as number];
  if (ref.start) {
    // The start moves to the second anchor; the closing part becomes the joined segment.
    const rest = list.slice(1, explicit);
    const first = list[0] as number[];
    const cmds: number[] = [];
    for (const part of rest) cmds.push(...cmdOf(part));
    // `joined` runs from the last anchor to the second one: the new closing segment, explicit when curved.
    if (joined.length !== 4) cmds.push(...cmdOf(joined));
    const nx = first[first.length - 2] as number;
    const ny = first[first.length - 1] as number;
    return path.map((p, i) => (i === ref.sub ? { x: nx, y: ny, cmds, closed: true } : p));
  }
  const cmds: number[] = [];
  list.forEach((part, index) => {
    if (index >= explicit) return;
    if (index === before) {
      if (after < explicit || joined.length !== 4) cmds.push(...cmdOf(joined));
      return;
    }
    if (index === after) return;
    cmds.push(...cmdOf(part));
  });
  return path.map((p, i) => (i === ref.sub ? { ...p, cmds, closed: true } : p));
}

function cmdStart(s: ParsedPath[number], seg: number): number {
  let i = 0;
  for (let n = 0; n < seg; n++) i += s.cmds[i] === LINE ? 3 : 7;
  return i;
}

/** The bounding box of the points (anchors and controls) of a vector (x0, y0, x1, y1); null when empty. */
export function pointsBounds(points: ArrayLike<number>): [number, number, number, number] | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i + 1 < points.length; i += 2) {
    const x = points[i] as number;
    const y = points[i + 1] as number;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return x0 <= x1 ? [x0, y0, x1, y1] : null;
}

/** A closed polygon as path data (content px). */
export function polygonPath(points: readonly (readonly [number, number])[]): string {
  return formatPathData([{ x: points[0]?.[0] ?? 0, y: points[0]?.[1] ?? 0, cmds: points.slice(1).flatMap(([x, y]) => [LINE, x, y]), closed: true }]);
}

/** An ellipse inside the box (x, y, w, h) as four cubics (the path a box mask converts to). */
export function ellipsePath(x: number, y: number, w: number, h: number): string {
  const k = 0.5522847498;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;
  return formatPathData([{
    x: cx + rx,
    y: cy,
    cmds: [
      CUBIC, cx + rx, cy + ry * k, cx + rx * k, cy + ry, cx, cy + ry,
      CUBIC, cx - rx * k, cy + ry, cx - rx, cy + ry * k, cx - rx, cy,
      CUBIC, cx - rx, cy - ry * k, cx - rx * k, cy - ry, cx, cy - ry,
      CUBIC, cx + rx * k, cy - ry, cx + rx, cy - ry * k, cx + rx, cy,
    ],
    closed: true,
  }]);
}
