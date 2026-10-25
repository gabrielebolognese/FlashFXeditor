// Snapping and smart guides on the canvas (spec §7.4, BINDING). Pure; values in project px from the
// frame's top-left. Reach is the 6 CSS px threshold turned into project px by the caller, so the snap
// is the same on screen at every zoom.
// - Candidates in the §7.4 priority order: the frame (center, edges, and its thirds while the thirds
//   grid shows), the safe rectangles on screen (the platform safe zone, title-safe and action-safe),
//   the other visible layers' bounding box edges and centers, and equal spacing: for every two layers
//   one after the other on an axis, the midpoint of the room between them (the dragged box's center
//   there leaves equal gaps on both sides). `CanvasSnapIndex` keeps them and rebuilds only when its
//   sources change (the layer set at the playhead, their transforms, the frame, the overlays shown),
//   never per pointer move.
// - Resolution per axis: the candidate nearest to one of the tested values (a moved box's edges and
//   center, a scale handle's position) within reach, ties to the higher priority. Spacing counts only
//   when both layers overlap the dragged box across the axis and no other such layer sits between
//   them. The box sticks while the pointer stays within reach (the nearest target holds).
// - Guides: frame and safe lines cross the whole frame; a layer line spans the dragged box and the
//   layer, with the distance between them; equal spacing shows both gaps; measure mode (Alt) the
//   distances from a box to the nearest layer on each side, else to the frame edge.
import type { Point, Size } from "../../timeline/edit/transform.js";
import type { Quad, Rect } from "./canvasLayers.js";
import type { ZoneRect } from "./safeZones.js";

/** Candidate priorities (§7.4 order; lower wins a tie in distance). */
export const SNAP_FRAME = 0;
export const SNAP_SAFE = 1;
export const SNAP_LAYER = 2;
export const SNAP_SPACING = 3;

/** Values closer than this (project px) are the same. */
const EPSILON = 1e-6;

export interface SnapLine {
  value: number;
  priority: typeof SNAP_FRAME | typeof SNAP_SAFE | typeof SNAP_LAYER;
  /** The layer of a layer line (its guide spans to it), else null (the guide crosses the frame). */
  rect: Rect | null;
}

/** Equal spacing: the dragged box's center at `value` leaves equal gaps to `a` (before) and `b` (after). */
export interface SpacingCandidate {
  value: number;
  a: Rect;
  b: Rect;
  /** The room between them on the axis. */
  room: number;
}

/** What the candidates are made of. */
export interface SnapSources {
  frame: Size;
  thirds: boolean;
  /** Safe rectangles on screen. */
  safe: readonly ZoneRect[];
  /** Bounds of the other visible layers (none while smart guides are off). */
  layers: readonly Rect[];
}

export interface CanvasSnapCandidates {
  frame: Size;
  /** Vertical lines (x values) and horizontal lines (y values), ascending. */
  x: readonly SnapLine[];
  y: readonly SnapLine[];
  rects: readonly Rect[];
  spacingX: readonly SpacingCandidate[];
  spacingY: readonly SpacingCandidate[];
}

type Axis = "x" | "y";

const start = (r: Rect, axis: Axis) => (axis === "x" ? r.x0 : r.y0);
const end = (r: Rect, axis: Axis) => (axis === "x" ? r.x1 : r.y1);
const across = (axis: Axis): Axis => (axis === "x" ? "y" : "x");
/** Whether the two ranges overlap with some length. */
const overlaps = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 - EPSILON && b0 < a1 - EPSILON;

function spacingOn(rects: readonly Rect[], axis: Axis): SpacingCandidate[] {
  const list: SpacingCandidate[] = [];
  for (const a of rects) {
    for (const b of rects) {
      const room = start(b, axis) - end(a, axis);
      if (a !== b && room > EPSILON) list.push({ value: (end(a, axis) + start(b, axis)) / 2, a, b, room });
    }
  }
  return list.sort((p, q) => p.value - q.value);
}

export function buildCanvasSnap(sources: SnapSources): CanvasSnapCandidates {
  const { frame } = sources;
  const x: SnapLine[] = [];
  const y: SnapLine[] = [];
  for (const value of [0, frame.width / 2, frame.width]) x.push({ value, priority: SNAP_FRAME, rect: null });
  for (const value of [0, frame.height / 2, frame.height]) y.push({ value, priority: SNAP_FRAME, rect: null });
  if (sources.thirds) {
    for (const value of [frame.width / 3, (2 * frame.width) / 3]) x.push({ value, priority: SNAP_FRAME, rect: null });
    for (const value of [frame.height / 3, (2 * frame.height) / 3]) y.push({ value, priority: SNAP_FRAME, rect: null });
  }
  for (const zone of sources.safe) {
    x.push({ value: zone.x, priority: SNAP_SAFE, rect: null }, { value: zone.x + zone.width, priority: SNAP_SAFE, rect: null });
    y.push({ value: zone.y, priority: SNAP_SAFE, rect: null }, { value: zone.y + zone.height, priority: SNAP_SAFE, rect: null });
  }
  for (const rect of sources.layers) {
    for (const value of [rect.x0, (rect.x0 + rect.x1) / 2, rect.x1]) x.push({ value, priority: SNAP_LAYER, rect });
    for (const value of [rect.y0, (rect.y0 + rect.y1) / 2, rect.y1]) y.push({ value, priority: SNAP_LAYER, rect });
  }
  const order = (a: SnapLine, b: SnapLine) => a.value - b.value || a.priority - b.priority;
  return { frame, x: x.sort(order), y: y.sort(order), rects: sources.layers, spacingX: spacingOn(sources.layers, "x"), spacingY: spacingOn(sources.layers, "y") };
}

const sameZone = (a: ZoneRect, b: ZoneRect) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
const sameRect = (a: Rect, b: Rect) => a.x0 === b.x0 && a.y0 === b.y0 && a.x1 === b.x1 && a.y1 === b.y1;

function sameSources(a: SnapSources, b: SnapSources): boolean {
  if (a.frame.width !== b.frame.width || a.frame.height !== b.frame.height || a.thirds !== b.thirds) return false;
  if (a.safe.length !== b.safe.length || a.layers.length !== b.layers.length) return false;
  for (let i = 0; i < a.safe.length; i++) if (!sameZone(a.safe[i] as ZoneRect, b.safe[i] as ZoneRect)) return false;
  for (let i = 0; i < a.layers.length; i++) if (!sameRect(a.layers[i] as Rect, b.layers[i] as Rect)) return false;
  return true;
}

/** The candidates of the last sources, rebuilt only when the sources differ (by value). */
export class CanvasSnapIndex {
  private sources: SnapSources | null = null;
  private cached: CanvasSnapCandidates | null = null;
  /** Rebuilds and queries so far (tests, dev stats). */
  rebuilds = 0;
  queries = 0;

  get(sources: SnapSources): CanvasSnapCandidates {
    this.queries += 1;
    if (this.cached && this.sources && sameSources(this.sources, sources)) return this.cached;
    this.cached = buildCanvasSnap(sources);
    this.sources = sources;
    this.rebuilds += 1;
    return this.cached;
  }
}

// --- Resolution -------------------------------------------------------------------------------------

/** A snap on one axis: the offset to add, the distance it covers, and the target's priority. */
export interface AxisSnap {
  offset: number;
  distance: number;
  priority: number;
}

function lowerBound<T extends { value: number }>(list: readonly T[], value: number): number {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((list[mid] as T).value < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The better of two snaps: the shorter distance, then the higher priority. */
function better(a: AxisSnap | null, b: AxisSnap | null): AxisSnap | null {
  if (!a) return b;
  if (!b) return a;
  if (b.distance < a.distance - EPSILON) return b;
  if (b.distance <= a.distance + EPSILON && b.priority < a.priority) return b;
  return a;
}

/** The line nearest to one of `values` within `reach`. */
export function nearestLine(lines: readonly SnapLine[], values: readonly number[], reach: number): AxisSnap | null {
  let best: AxisSnap | null = null;
  for (const value of values) {
    for (let i = lowerBound(lines, value - reach - EPSILON); i < lines.length; i++) {
      const line = lines[i] as SnapLine;
      if (line.value > value + reach + EPSILON) break;
      best = better(best, { offset: line.value - value, distance: Math.abs(line.value - value), priority: line.priority });
    }
  }
  return best;
}

/** Whether equal spacing between `c.a` and `c.b` applies to `box`: it fits, both overlap it across, and no other layer that does sits between them. */
function spacingApplies(candidate: SpacingCandidate, rects: readonly Rect[], box: Rect, axis: Axis): boolean {
  const size = end(box, axis) - start(box, axis);
  if (candidate.room - size <= EPSILON) return false;
  const other = across(axis);
  const c0 = start(box, other);
  const c1 = end(box, other);
  const { a, b } = candidate;
  if (!overlaps(start(a, other), end(a, other), c0, c1) || !overlaps(start(b, other), end(b, other), c0, c1)) return false;
  for (const r of rects) {
    if (r === a || r === b || !overlaps(start(r, other), end(r, other), c0, c1)) continue;
    if (overlaps(start(r, axis), end(r, axis), end(a, axis), start(b, axis))) return false;
  }
  return true;
}

function nearestSpacing(c: CanvasSnapCandidates, axis: Axis, box: Rect, reach: number): AxisSnap | null {
  const list = axis === "x" ? c.spacingX : c.spacingY;
  const center = (start(box, axis) + end(box, axis)) / 2;
  let best: AxisSnap | null = null;
  for (let i = lowerBound(list, center - reach - EPSILON); i < list.length; i++) {
    const candidate = list[i] as SpacingCandidate;
    if (candidate.value > center + reach + EPSILON) break;
    if (!spacingApplies(candidate, c.rects, box, axis)) continue;
    best = better(best, { offset: candidate.value - center, distance: Math.abs(candidate.value - center), priority: SNAP_SPACING });
  }
  return best;
}

const edgesOf = (box: Rect, axis: Axis) => [start(box, axis), (start(box, axis) + end(box, axis)) / 2, end(box, axis)];
const shifted = (box: Rect, dx: number, dy: number): Rect => ({ x0: box.x0 + dx, y0: box.y0 + dy, x1: box.x1 + dx, y1: box.y1 + dy });

/**
 * A moved box (§7.4: edges and center against the lines, center against equal spacing) on the axes
 * that are free (Shift holds one), x first. The offset to add to the move.
 */
export function snapMove(c: CanvasSnapCandidates, box: Rect, reach: number, free: { x: boolean; y: boolean }): Point {
  const x = free.x ? better(nearestLine(c.x, edgesOf(box, "x"), reach), nearestSpacing(c, "x", box, reach)) : null;
  const dx = x?.offset ?? 0;
  const moved = shifted(box, dx, 0);
  const y = free.y ? better(nearestLine(c.y, edgesOf(moved, "y"), reach), nearestSpacing(c, "y", moved, reach)) : null;
  return { x: dx, y: y?.offset ?? 0 };
}

/**
 * A scale handle (§7.4: the dragged edge snaps). `handle` is where the gesture puts the dragged handle
 * now, `fixed` the point the scale keeps, `free` the frame axes the handle moves along (the box must
 * be axis-aligned). With `uniform` (a corner keeping the aspect) the nearer target wins and the other
 * axis follows along the diagonal. The handle point to aim the gesture at, or null with no target.
 */
export function snapHandle(c: CanvasSnapCandidates, handle: Point, fixed: Point, free: { x: boolean; y: boolean }, uniform: boolean, reach: number): Point | null {
  const x = free.x ? nearestLine(c.x, [handle.x], reach) : null;
  const y = free.y ? nearestLine(c.y, [handle.y], reach) : null;
  if (!x && !y) return null;
  if (!uniform) return { x: handle.x + (x?.offset ?? 0), y: handle.y + (y?.offset ?? 0) };
  const useX = better(x, y) === x;
  const along = useX ? handle.x - fixed.x : handle.y - fixed.y;
  if (Math.abs(along) <= EPSILON) return null;
  const ratio = (along + ((useX ? x : y) as AxisSnap).offset) / along;
  return { x: fixed.x + (handle.x - fixed.x) * ratio, y: fixed.y + (handle.y - fixed.y) * ratio };
}

/** Whether every side of the quad is horizontal or vertical (edge snapping of a scale needs it). */
export function isAxisAligned(quad: Quad): boolean {
  for (let i = 0; i < 4; i++) {
    const a = quad[i] as Point;
    const b = quad[(i + 1) % 4] as Point;
    if (Math.abs(a.x - b.x) > EPSILON && Math.abs(a.y - b.y) > EPSILON) return false;
  }
  return true;
}

// --- Guides -----------------------------------------------------------------------------------------

/** A guide line: vertical at x = `at` (from y `from` to `to`), or horizontal at y = `at`. */
export interface GuideLine {
  vertical: boolean;
  at: number;
  from: number;
  to: number;
}

/** A distance readout: a vertical span at x = `at` from y `from` to `to` (or horizontal at y = `at`), labeled `distance`. */
export interface GuideSpan extends GuideLine {
  distance: number;
}

export interface Guides {
  lines: GuideLine[];
  spans: GuideSpan[];
}

export const NO_GUIDES: Guides = { lines: [], spans: [] };

/** The middle of the overlap of two ranges (where a span between two boxes is drawn). */
const middle = (a0: number, a1: number, b0: number, b1: number) => (Math.max(a0, b0) + Math.min(a1, b1)) / 2;

function span(vertical: boolean, at: number, from: number, to: number): GuideSpan {
  return { vertical, at, from, to, distance: to - from };
}

/** Lines and spans for the candidates `box` meets on one axis at `values`. */
function axisGuides(c: CanvasSnapCandidates, box: Rect, axis: Axis, values: readonly number[], out: Guides): void {
  const lines = axis === "x" ? c.x : c.y;
  const vertical = axis === "x";
  const other = across(axis);
  const frameEnd = vertical ? c.frame.height : c.frame.width;
  const crossed = new Set<number>();
  const measured = new Set<Rect>();
  for (const value of values) {
    const i0 = lowerBound(lines, value - EPSILON);
    const rects: Rect[] = [];
    let crosses = false;
    for (let i = i0; i < lines.length && (lines[i] as SnapLine).value <= value + EPSILON; i++) {
      const line = lines[i] as SnapLine;
      if (line.rect) rects.push(line.rect);
      else crosses = true;
    }
    const at = (lines[i0] as SnapLine | undefined)?.value ?? value;
    if (crosses && !crossed.has(at)) {
      crossed.add(at);
      out.lines.push({ vertical, at, from: 0, to: frameEnd });
    }
    if (rects.length === 0) continue;
    // One line through the box and every layer on it; the distance to the nearest layer on each side.
    let from = start(box, other);
    let to = end(box, other);
    let before: Rect | null = null;
    let after: Rect | null = null;
    for (const r of rects) {
      from = Math.min(from, start(r, other));
      to = Math.max(to, end(r, other));
      if (end(r, other) <= start(box, other) + EPSILON && (!before || end(r, other) > end(before, other))) before = r;
      if (start(r, other) >= end(box, other) - EPSILON && (!after || start(r, other) < start(after, other))) after = r;
    }
    out.lines.push({ vertical, at, from, to });
    if (before && !measured.has(before) && start(box, other) - end(before, other) > EPSILON) {
      measured.add(before);
      out.spans.push(span(vertical, at, end(before, other), start(box, other)));
    }
    if (after && !measured.has(after) && start(after, other) - end(box, other) > EPSILON) {
      measured.add(after);
      out.spans.push(span(vertical, at, end(box, other), start(after, other)));
    }
  }
}

/** The equal-spacing gaps (§7.4 distribution guides) of `box` on one axis, when its center sits on a spacing candidate. */
function spacingGuides(c: CanvasSnapCandidates, box: Rect, axis: Axis, out: Guides): void {
  const list = axis === "x" ? c.spacingX : c.spacingY;
  const center = (start(box, axis) + end(box, axis)) / 2;
  const other = across(axis);
  // Spans along the axis: horizontal ones for x.
  const vertical = axis === "y";
  for (let i = lowerBound(list, center - EPSILON); i < list.length && (list[i] as SpacingCandidate).value <= center + EPSILON; i++) {
    const candidate = list[i] as SpacingCandidate;
    if (!spacingApplies(candidate, c.rects, box, axis)) continue;
    const { a, b } = candidate;
    out.spans.push(
      span(vertical, middle(start(a, other), end(a, other), start(box, other), end(box, other)), end(a, axis), start(box, axis)),
      span(vertical, middle(start(b, other), end(b, other), start(box, other), end(box, other)), end(box, axis), start(b, axis)),
    );
  }
}

/**
 * The guides of a moved box: every candidate its edges or center meet, equal spacing included (a
 * layer line's distance that an equal-spacing gap already shows is left out).
 */
export function moveGuides(c: CanvasSnapCandidates, box: Rect): Guides {
  const lines: Guides = { lines: [], spans: [] };
  axisGuides(c, box, "x", edgesOf(box, "x"), lines);
  axisGuides(c, box, "y", edgesOf(box, "y"), lines);
  const spacing: Guides = { lines: [], spans: [] };
  spacingGuides(c, box, "x", spacing);
  spacingGuides(c, box, "y", spacing);
  const shown = (s: GuideSpan) => spacing.spans.some((g) => g.vertical === s.vertical && Math.abs(g.from - s.from) <= EPSILON && Math.abs(g.to - s.to) <= EPSILON);
  return { lines: lines.lines, spans: [...lines.spans.filter((s) => !shown(s)), ...spacing.spans] };
}

/** The guides of a scale handle at `handle` on the free axes of the box it leaves (`box`). */
export function handleGuides(c: CanvasSnapCandidates, box: Rect, handle: Point, free: { x: boolean; y: boolean }): Guides {
  const out: Guides = { lines: [], spans: [] };
  if (free.x) axisGuides(c, box, "x", [handle.x], out);
  if (free.y) axisGuides(c, box, "y", [handle.y], out);
  return out;
}

/**
 * Measure mode (§7.4, Alt without a drag): from each side of `box` the distance to the nearest layer
 * beyond it that overlaps it across, else to the frame edge (negative when the box overhangs it).
 */
export function measureGuides(c: CanvasSnapCandidates, box: Rect): Guides {
  const spans: GuideSpan[] = [];
  for (const axis of ["x", "y"] as const) {
    const other = across(axis);
    const c0 = start(box, other);
    const c1 = end(box, other);
    const centerAcross = (c0 + c1) / 2;
    // Spans along the axis: horizontal ones for x.
    const vertical = axis === "y";
    let before: Rect | null = null;
    let after: Rect | null = null;
    for (const r of c.rects) {
      if (!overlaps(start(r, other), end(r, other), c0, c1)) continue;
      if (end(r, axis) <= start(box, axis) + EPSILON && (!before || end(r, axis) > end(before, axis))) before = r;
      if (start(r, axis) >= end(box, axis) - EPSILON && (!after || start(r, axis) < start(after, axis))) after = r;
    }
    const size = axis === "x" ? c.frame.width : c.frame.height;
    const lead = before ? span(vertical, middle(start(before, other), end(before, other), c0, c1), end(before, axis), start(box, axis)) : span(vertical, centerAcross, 0, start(box, axis));
    const trail = after ? span(vertical, middle(start(after, other), end(after, other), c0, c1), end(box, axis), start(after, axis)) : span(vertical, centerAcross, end(box, axis), size);
    for (const s of [lead, trail]) if (Math.abs(s.distance) > EPSILON) spans.push(s);
  }
  return { lines: [], spans };
}

/** A distance label in project px: whole px, else one decimal. */
export function formatDistance(distance: number): string {
  const rounded = Math.round(distance * 10) / 10;
  return String(rounded || 0);
}
