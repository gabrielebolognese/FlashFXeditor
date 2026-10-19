// Transform gizmo math (spec §7.3): the box, its 8 handles and hit zones, and what each gesture does
// to the transforms of the layers it holds. Pure; points are in project px from the frame's top-left
// unless they are screen points (device px of the overlay canvas, through the preview placement).
// - One layer: the box is its visible quad (rotated with it). Several: the axis-aligned group box of
//   their quads; transforms apply relative to it (positions scale and turn around it).
// - Scale: corners scale uniformly, Shift+corner per axis, edges one axis (writing `scaleY`), Alt
//   from the box center instead of the opposite handle. Scale snaps to 100% within 2% while snapping
//   is on (the edge snapping of §7.4 is in snap.ts).
// - Rotate: around the anchor (one layer) or the group box center; Shift snaps to 45° multiples
//   within 3°; otherwise free at 0.1°. The pointer angle is unwrapped, so turns add up.
// - Move: whole project px; Shift keeps the dominant axis. Anchor (one layer, Alt): the anchor goes
//   under the pointer, the position follows so the layer stays where it is.
import type { ClipId, Transform } from "../../core/document/types.js";
import { layerCorners, layerPoint, rotationTrig, scaleYOf, type ContentBox, type Point, type Size } from "../../timeline/edit/transform.js";
import type { Mat3 } from "../mat3.js";
import { quadsBounds, type Quad } from "./canvasLayers.js";

export type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

/** Handle positions in box coordinates (0..1 from the box's first corner along its two sides). */
export const HANDLES: Readonly<Record<HandleId, { u: number; v: number }>> = {
  nw: { u: 0, v: 0 },
  n: { u: 0.5, v: 0 },
  ne: { u: 1, v: 0 },
  e: { u: 1, v: 0.5 },
  se: { u: 1, v: 1 },
  s: { u: 0.5, v: 1 },
  sw: { u: 0, v: 1 },
  w: { u: 0, v: 0.5 },
};

export const CORNERS: readonly HandleId[] = ["nw", "ne", "se", "sw"];
export const EDGES: readonly HandleId[] = ["n", "e", "s", "w"];

export const isCorner = (handle: HandleId): boolean => handle.length === 2;

/** Scale snaps to 100% within this (§7.3). */
export const SCALE_SNAP = 0.02;
/** Shift snaps rotation to 45° multiples within this many degrees (§7.3). */
export const ROTATION_SNAP_DEGREES = 3;
export const ROTATION_SNAP_STEP = 45;
/** No layer is scaled below this (a drag past the opposite handle stops there). */
export const MIN_SCALE = 0.01;

/** The gizmo box: four corners (top-left, top-right, bottom-right, bottom-left of the content or group). */
export type GizmoBox = Quad;

export function boxPoint(box: GizmoBox, u: number, v: number): Point {
  const [tl, tr, , bl] = box;
  return { x: tl.x + u * (tr.x - tl.x) + v * (bl.x - tl.x), y: tl.y + u * (tr.y - tl.y) + v * (bl.y - tl.y) };
}

export function handlePoint(box: GizmoBox, handle: HandleId): Point {
  const { u, v } = HANDLES[handle];
  return boxPoint(box, u, v);
}

/** The group box of several quads (axis-aligned), or the one quad. */
export function gizmoBoxOf(quads: readonly Quad[]): GizmoBox | null {
  if (quads.length === 1) return quads[0] as Quad;
  const rect = quadsBounds(quads);
  if (!rect) return null;
  return [
    { x: rect.x0, y: rect.y0 },
    { x: rect.x1, y: rect.y0 },
    { x: rect.x1, y: rect.y1 },
    { x: rect.x0, y: rect.y1 },
  ];
}

export const toScreen = (m: Mat3, p: Point): Point => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });

/** Screen metrics of the gizmo in device px. */
export interface GizmoMetrics {
  /** Side of a handle's hit square. */
  handleHit: number;
  /** The rotate zone outside each corner (§7.3: 16 px). */
  rotateZone: number;
  /** Edge handles show and hit only when their side is at least this long on screen. */
  minEdge: number;
}

export type GizmoHit = { kind: "handle"; handle: HandleId } | { kind: "rotate"; corner: HandleId } | { kind: "body" };

function insideScreenQuad(points: readonly Point[], x: number, y: number): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = points[i] as Point;
    const b = points[(i + 1) % 4] as Point;
    const c = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    if (c === 0) continue;
    const s = c > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/** Whether the edge handles of `box` show at this zoom (its sides long enough on screen). */
export function edgeHandlesShown(box: GizmoBox, screen: Mat3, minEdge: number): { horizontal: boolean; vertical: boolean } {
  const s = box.map((p) => toScreen(screen, p));
  const [tl, tr, , bl] = s as [Point, Point, Point, Point];
  return { horizontal: Math.hypot(tr.x - tl.x, tr.y - tl.y) >= minEdge, vertical: Math.hypot(bl.x - tl.x, bl.y - tl.y) >= minEdge };
}

/**
 * What a press at screen point (`x`, `y`) takes: a handle (corners first), a rotate zone outside a
 * corner, the body, or nothing. In crop mode (`crop`, Batch 26) the handles are crop handles and there
 * is no rotate zone. A text box (`text`, Batch 29) has no top and bottom handles. A caption (`caption`,
 * Batch 53) has the corner handles only (its font size) and no rotate zone.
 */
export function hitGizmo(box: GizmoBox, screen: Mat3, x: number, y: number, metrics: GizmoMetrics, crop = false, text = false, caption = false): GizmoHit | null {
  const half = metrics.handleHit / 2;
  const near = (p: Point) => Math.abs(p.x - x) <= half && Math.abs(p.y - y) <= half;
  for (const handle of CORNERS) if (near(toScreen(screen, handlePoint(box, handle)))) return { kind: "handle", handle };
  const shown = edgeHandlesShown(box, screen, metrics.minEdge);
  for (const handle of caption ? [] : EDGES) {
    if (text && (handle === "n" || handle === "s")) continue;
    if (!((handle === "n" || handle === "s") ? shown.horizontal : shown.vertical)) continue;
    if (near(toScreen(screen, handlePoint(box, handle)))) return { kind: "handle", handle };
  }
  const corners = box.map((p) => toScreen(screen, p));
  if (insideScreenQuad(corners, x, y)) return { kind: "body" };
  if (crop || caption) return null;
  for (let i = 0; i < 4; i++) {
    const c = corners[i] as Point;
    if (Math.hypot(c.x - x, c.y - y) <= metrics.rotateZone) return { kind: "rotate", corner: CORNERS[i] as HandleId };
  }
  return null;
}

/** The resize cursor of a handle: from the box center towards it, on screen, to the nearest 45°. */
export function resizeCursor(box: GizmoBox, screen: Mat3, handle: HandleId): string {
  const c = toScreen(screen, boxPoint(box, 0.5, 0.5));
  const h = toScreen(screen, handlePoint(box, handle));
  const degrees = (((Math.atan2(h.y - c.y, h.x - c.x) * 180) / Math.PI) % 180 + 180) % 180;
  return (["ew-resize", "nwse-resize", "ns-resize", "nesw-resize"] as const)[Math.round(degrees / 45) % 4] as string;
}

// --- Gestures ------------------------------------------------------------------------------------

/** A layer a gesture holds: its transform and content box when the gesture started. */
export interface HeldLayer {
  clipId: ClipId;
  transform: Transform;
  box: ContentBox;
}

export interface GestureStart {
  layers: readonly HeldLayer[];
  /** The gizmo box when the gesture started. */
  box: GizmoBox;
  frame: Size;
}

export interface Modifiers {
  shift: boolean;
  alt: boolean;
}

export interface GestureResult {
  transforms: Map<ClipId, Transform>;
  /** The box as the gesture leaves it (drawn while it runs). */
  box: GizmoBox;
  /** The 100% scale snap holds (on the x and y axes): the handle's snap line flashes. */
  snapX: boolean;
  snapY: boolean;
  /** The numeric readout near the cursor (§7.3). */
  readout: string;
}

const round1 = (value: number) => Math.round(value * 10) / 10 || 0;
const signed = (value: number) => (value > 0 ? `+${value}` : `${value}`);
const percent = (value: number) => `${Math.round(value * 1000) / 10}%`;

function anchorPoint(layer: HeldLayer, frame: Size): Point {
  return { x: frame.width / 2 + layer.transform.x, y: frame.height / 2 + layer.transform.y };
}

function mapBox(box: GizmoBox, map: (p: Point) => Point): GizmoBox {
  return [map(box[0]), map(box[1]), map(box[2]), map(box[3])];
}

/** The move of a pointer delta (§7.3): whole project px; Shift keeps the dominant axis (`free` says which axes move). */
export function moveDelta(dx: number, dy: number, shift: boolean): { x: number; y: number; free: { x: boolean; y: boolean } } {
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const free = { x: !shift || horizontal, y: !shift || !horizontal };
  return { x: free.x ? Math.round(dx) : 0, y: free.y ? Math.round(dy) : 0, free };
}

/**
 * Move (§7.3): every layer by the pointer's delta in whole project px; Shift keeps its dominant axis.
 * `snap` (§7.4) is added after the rounding: a snapped axis lands exactly on its target.
 */
export function moveGesture(start: GestureStart, dx: number, dy: number, mods: Modifiers, snap: Point = { x: 0, y: 0 }): GestureResult {
  const delta = moveDelta(dx, dy, mods.shift);
  const mx = delta.x + snap.x;
  const my = delta.y + snap.y;
  const transforms = new Map<ClipId, Transform>();
  for (const layer of start.layers) transforms.set(layer.clipId, { ...layer.transform, x: layer.transform.x + mx, y: layer.transform.y + my });
  const single = start.layers.length === 1 ? start.layers[0] : undefined;
  const readout = single ? `X ${Math.round(single.transform.x + mx)} · Y ${Math.round(single.transform.y + my)}` : `ΔX ${signed(Math.round(mx))} · ΔY ${signed(Math.round(my))}`;
  return { transforms, box: mapBox(start.box, (p) => ({ x: p.x + mx, y: p.y + my })), snapX: false, snapY: false, readout };
}

/** `value` snapped to 1 within SCALE_SNAP (and whether it snapped) while `snap` holds, at least `min`. */
function snapScale(value: number, min: number, snap: boolean): [number, boolean] {
  if (snap && Math.abs(value - 1) <= SCALE_SNAP) return [1, true];
  return [Math.max(min, value), false];
}

/** Scale one layer by a handle (§7.3), in the layer's own axes. */
function scaleLayer(layer: HeldLayer, frame: Size, handle: HandleId, pointer: Point, mods: Modifiers, snap: boolean): { transform: Transform; snapX: boolean; snapY: boolean } {
  const t0 = layer.transform;
  const b = layer.box;
  const { u, v } = HANDLES[handle];
  const fu = mods.alt ? 0.5 : 1 - u;
  const fv = mods.alt ? 0.5 : 1 - v;
  const vw = b.right - b.left;
  const vh = b.bottom - b.top;
  // The fixed point and the handle in content px; the fixed point on the frame stays where it is.
  const fx = b.left + fu * vw;
  const fy = b.top + fv * vh;
  const hx = b.left + u * vw - fx;
  const hy = b.top + v * vh - fy;
  const fixed = layerPoint(t0, b, frame, fx, fy);
  const { sin, cos } = rotationTrig(t0.rotation);
  const wx = pointer.x - fixed.x;
  const wy = pointer.y - fixed.y;
  // The pointer from the fixed point in the layer's axes (scaled content px).
  const dx = cos * wx + sin * wy;
  const dy = -sin * wx + cos * wy;
  const sx0 = t0.scale;
  const sy0 = scaleYOf(t0);
  let sx = sx0;
  let sy = sy0;
  let snapX = false;
  let snapY = false;
  if (isCorner(handle) && !mods.shift) {
    const ax = hx * sx0;
    const ay = hy * sy0;
    let k = (dx * ax + dy * ay) / (ax * ax + ay * ay);
    k = Math.max(k, MIN_SCALE / Math.min(sx0, sy0));
    if (snap && Math.abs(sx0 * k - 1) <= SCALE_SNAP) {
      k = 1 / sx0;
      snapX = true;
      snapY = sy0 === sx0;
    }
    sx = sx0 * k;
    sy = sy0 * k;
  } else {
    if (hx !== 0) [sx, snapX] = snapScale(dx / hx, MIN_SCALE, snap);
    if (hy !== 0) [sy, snapY] = snapScale(dy / hy, MIN_SCALE, snap);
  }
  const scaled: Transform = { ...t0, x: 0, y: 0, scale: sx, scaleY: sy };
  const at = layerPoint(scaled, b, frame, fx, fy);
  return { transform: { ...scaled, x: fixed.x - at.x, y: fixed.y - at.y }, snapX, snapY };
}

/**
 * Scale by a handle (§7.3): one layer in its own axes; several around the group box (opposite handle
 * or, with Alt, the center), each member's position scaled from it and its scale by the box factors
 * along its own axes (a turned member takes the factors without shear). `snap` is the 100% snap
 * (off with snapping, §7.4's one snap state).
 */
export function scaleGesture(start: GestureStart, handle: HandleId, pointer: Point, mods: Modifiers, snap = true): GestureResult {
  const { frame } = start;
  if (start.layers.length === 1) {
    const layer = start.layers[0] as HeldLayer;
    const { transform, snapX, snapY } = scaleLayer(layer, frame, handle, pointer, mods, snap);
    const box = layerCorners(transform, layer.box, frame);
    const sy = scaleYOf(transform);
    const readout = sy === transform.scale ? percent(transform.scale) : `${percent(transform.scale)} × ${percent(sy)}`;
    return { transforms: new Map([[layer.clipId, transform]]), box, snapX, snapY, readout };
  }
  const { u, v } = HANDLES[handle];
  const fixed = boxPoint(start.box, mods.alt ? 0.5 : 1 - u, mods.alt ? 0.5 : 1 - v);
  const grab = boxPoint(start.box, u, v);
  const hx = grab.x - fixed.x;
  const hy = grab.y - fixed.y;
  const dx = pointer.x - fixed.x;
  const dy = pointer.y - fixed.y;
  let kx = 1;
  let ky = 1;
  let snapX = false;
  let snapY = false;
  if (isCorner(handle) && !mods.shift) {
    [kx, snapX] = snapScale((dx * hx + dy * hy) / (hx * hx + hy * hy), MIN_SCALE, snap);
    ky = kx;
    snapY = snapX;
  } else {
    if (hx !== 0) [kx, snapX] = snapScale(dx / hx, MIN_SCALE, snap);
    if (hy !== 0) [ky, snapY] = snapScale(dy / hy, MIN_SCALE, snap);
  }
  const transforms = new Map<ClipId, Transform>();
  for (const layer of start.layers) {
    const t = layer.transform;
    const anchor = anchorPoint(layer, frame);
    const { sin, cos } = rotationTrig(t.rotation);
    const along = Math.hypot(kx * cos, ky * sin);
    const across = Math.hypot(kx * sin, ky * cos);
    transforms.set(layer.clipId, {
      ...t,
      x: fixed.x + (anchor.x - fixed.x) * kx - frame.width / 2,
      y: fixed.y + (anchor.y - fixed.y) * ky - frame.height / 2,
      scale: Math.max(MIN_SCALE, t.scale * along),
      scaleY: Math.max(MIN_SCALE, scaleYOf(t) * across),
    });
  }
  const box = mapBox(start.box, (p) => ({ x: fixed.x + (p.x - fixed.x) * kx, y: fixed.y + (p.y - fixed.y) * ky }));
  return { transforms, box, snapX, snapY, readout: kx === ky ? percent(kx) : `${percent(kx)} × ${percent(ky)}` };
}

/** Where a rotation turns around: the anchor of one layer, the group box center of several. */
export function rotationPivot(start: GestureStart): Point {
  return start.layers.length === 1 ? anchorPoint(start.layers[0] as HeldLayer, start.frame) : boxPoint(start.box, 0.5, 0.5);
}

/** The pointer's angle around the pivot, unwrapped across ±180° (a turn adds 360). */
export class AngleTracker {
  private last: number;
  /** Degrees turned since the start, clockwise positive (screen y down). */
  total = 0;

  constructor(
    private readonly pivot: Point,
    from: Point,
  ) {
    this.last = this.angle(from);
  }

  update(pointer: Point): number {
    const angle = this.angle(pointer);
    let delta = angle - this.last;
    if (delta > 180) delta -= 360;
    else if (delta < -180) delta += 360;
    this.total += delta;
    this.last = angle;
    return this.total;
  }

  private angle(p: Point): number {
    return (Math.atan2(p.y - this.pivot.y, p.x - this.pivot.x) * 180) / Math.PI;
  }
}

/** A rotation in degrees: with Shift snapped to a 45° multiple within 3°; rounded to 0.1° (§7.3). */
export function snapRotation(degrees: number, shift: boolean): number {
  if (shift) {
    const nearest = Math.round(degrees / ROTATION_SNAP_STEP) * ROTATION_SNAP_STEP;
    if (Math.abs(degrees - nearest) <= ROTATION_SNAP_DEGREES) return nearest || 0;
  }
  return round1(degrees);
}

/** Rotate (§7.3) by `turned` degrees from the start: one layer's rotation snapped; a group's delta snapped, positions turned around its center. */
export function rotateGesture(start: GestureStart, turned: number, mods: Modifiers): GestureResult {
  const { frame } = start;
  const pivot = rotationPivot(start);
  if (start.layers.length === 1) {
    const layer = start.layers[0] as HeldLayer;
    const rotation = snapRotation(layer.transform.rotation + turned, mods.shift);
    const transform = { ...layer.transform, rotation };
    return { transforms: new Map([[layer.clipId, transform]]), box: layerCorners(transform, layer.box, frame), snapX: false, snapY: false, readout: `${rotation.toFixed(1)}°` };
  }
  const delta = snapRotation(turned, mods.shift);
  const { sin, cos } = rotationTrig(delta);
  const turn = (p: Point): Point => ({ x: pivot.x + cos * (p.x - pivot.x) - sin * (p.y - pivot.y), y: pivot.y + sin * (p.x - pivot.x) + cos * (p.y - pivot.y) });
  const transforms = new Map<ClipId, Transform>();
  for (const layer of start.layers) {
    const anchor = turn(anchorPoint(layer, frame));
    transforms.set(layer.clipId, { ...layer.transform, x: anchor.x - frame.width / 2, y: anchor.y - frame.height / 2, rotation: round1(layer.transform.rotation + delta) });
  }
  return { transforms, box: mapBox(start.box, turn), snapX: false, snapY: false, readout: `Δ ${delta.toFixed(1)}°` };
}

/** Anchor move (§7.3, one layer, Alt): the anchor under the pointer, the position moved so the layer stays in place. */
export function anchorGesture(start: GestureStart, pointer: Point): GestureResult {
  const layer = start.layers[0] as HeldLayer;
  const t = layer.transform;
  const { frame } = start;
  const { sin, cos } = rotationTrig(t.rotation);
  const wx = pointer.x - frame.width / 2 - t.x;
  const wy = pointer.y - frame.height / 2 - t.y;
  const qx = (cos * wx + sin * wy) / t.scale + t.anchor.x * layer.box.width;
  const qy = (-sin * wx + cos * wy) / scaleYOf(t) + t.anchor.y * layer.box.height;
  const anchor = { x: qx / layer.box.width, y: qy / layer.box.height };
  const transform: Transform = { ...t, anchor, x: pointer.x - frame.width / 2, y: pointer.y - frame.height / 2 };
  return { transforms: new Map([[layer.clipId, transform]]), box: start.box, snapX: false, snapY: false, readout: `Anchor ${percent(anchor.x)} · ${percent(anchor.y)}` };
}
