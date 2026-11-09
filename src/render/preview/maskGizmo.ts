// The canvas mask mode (spec §21.18, Batch 73): the masks of the clip in mask mode drawn over the canvas
// with their handles. Pure geometry: the scene (project px), the hit test and the masks a drag makes.
// A rectangle or ellipse has its box with 8 handles (a press inside moves it); a path has its anchors
// (squares) and the controls of its curves (dots on a line to their anchor; a press inside its bounds
// moves it whole); every mask has a feather handle (a diamond right of its box, as far out as the
// feather). Masks live in the clip's content px: `model` (content px -> project px, from the compositor's
// content box) maps them. CanvasEditInput owns the gesture (ephemeral masks while dragging, one command
// on release, P2) and PreviewOverlayView draws.
import type { ClipId, Mask } from "../../core/document/types.js";
import { flattenPath as flattenOutline } from "../../core/shapes/flatten.js";
import { maskPathData, maskPathPoints, nearestSegment, parseMaskPath, pathPoints, pointRoles, pointsBounds, type SegmentRef } from "../../core/masks/maskPath.js";
import { applyToPoint, invertInto, mutableIdentity, type Mat3 } from "../mat3.js";
import { HANDLES, type HandleId } from "./gizmo.js";

type Pt = { x: number; y: number };

export interface MaskMark {
  maskId: string;
  kind: Mask["shape"]["kind"];
  /** Drawn dashed: a subtract mask, or an inverted one. */
  dashed: boolean;
  /** The outline (project px pairs, closed). */
  line: number[];
  /** A box mask's 8 handles (project px); none for paths. */
  box: { id: HandleId; x: number; y: number }[];
  /** A path's anchors and curve controls (project px), by pair index of its points. */
  anchors: { pair: number; x: number; y: number }[];
  controls: { pair: number; x: number; y: number; fromX: number; fromY: number }[];
  /** The feather handle (project px). */
  feather: Pt;
}

export interface MaskScene {
  clipId: ClipId;
  masks: MaskMark[];
}

/** What a press grabbed. */
export type MaskHit =
  | { kind: "box"; mask: number; handle: HandleId }
  | { kind: "point"; mask: number; pair: number }
  | { kind: "feather"; mask: number }
  | { kind: "body"; mask: number };

/** Mask mode on the canvas (Alt+M): the clip whose masks get handles, or none. */
export interface MaskModeState {
  target: ClipId | null;
}
export const NO_MASK_MODE: MaskModeState = { target: null };

/** The content box: content px -> project px. */
export interface MaskSpace {
  model: Mat3;
  width: number;
  height: number;
}

/** Content px of the feather handle's offset past the box (so a feather of 0 still has a handle off the edge). */
export const FEATHER_HANDLE_GAP = 12;

/** A mask's box in content px: its own for rectangles and ellipses, its points' bounds for a path. */
export function maskBounds(mask: Mask): { x: number; y: number; w: number; h: number } | null {
  const shape = mask.shape;
  if (shape.kind !== "path") return { x: shape.x, y: shape.y, w: shape.w, h: shape.h };
  const points = maskPathPoints(shape.d);
  const b = points ? pointsBounds(points) : null;
  return b ? { x: b[0], y: b[1], w: b[2] - b[0], h: b[3] - b[1] } : null;
}

/** The scene of `masks` laid out by `space`. */
export function maskScene(clipId: ClipId, masks: readonly Mask[], space: MaskSpace): MaskScene {
  const m = space.model;
  const at = (x: number, y: number): Pt => applyToPoint(m, x, y);
  const out: MaskMark[] = [];
  for (const mask of masks) {
    const shape = mask.shape;
    const bounds = maskBounds(mask);
    if (!bounds) continue;
    const line: number[] = [];
    const push = (x: number, y: number) => {
      const p = at(x, y);
      line.push(p.x, p.y);
    };
    const mark: MaskMark = { maskId: mask.id, kind: shape.kind, dashed: mask.mode === "subtract" || mask.inverted, line, box: [], anchors: [], controls: [], feather: at(bounds.x + bounds.w + FEATHER_HANDLE_GAP + mask.feather, bounds.y + bounds.h / 2) };
    if (shape.kind === "rect") {
      push(shape.x, shape.y);
      push(shape.x + shape.w, shape.y);
      push(shape.x + shape.w, shape.y + shape.h);
      push(shape.x, shape.y + shape.h);
    } else if (shape.kind === "ellipse") {
      const cx = shape.x + shape.w / 2;
      const cy = shape.y + shape.h / 2;
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        push(cx + Math.cos(a) * (shape.w / 2), cy + Math.sin(a) * (shape.h / 2));
      }
    } else if (shape.kind === "path") {
      const path = parseMaskPath(shape.d);
      if (!path) continue;
      for (const poly of flattenOutline(path, 0.5)) {
        // Subpaths are joined in one list; the overlay strokes them closed one by one through the NaN breaks.
        if (line.length > 0) line.push(Number.NaN, Number.NaN);
        for (let i = 0; i + 1 < poly.pts.length; i += 2) push(poly.pts[i] as number, poly.pts[i + 1] as number);
      }
      const points = pathPoints(path);
      const roles = pointRoles(path);
      roles.forEach((role, pair) => {
        const p = at(points[2 * pair] as number, points[2 * pair + 1] as number);
        if (role.kind === "anchor") mark.anchors.push({ pair, x: p.x, y: p.y });
        else {
          const from = at(points[2 * role.anchor] as number, points[2 * role.anchor + 1] as number);
          mark.controls.push({ pair, x: p.x, y: p.y, fromX: from.x, fromY: from.y });
        }
      });
    }
    if (shape.kind !== "path") {
      for (const id of Object.keys(HANDLES) as HandleId[]) {
        const { u, v } = HANDLES[id];
        const p = at(shape.x + u * shape.w, shape.y + v * shape.h);
        mark.box.push({ id, x: p.x, y: p.y });
      }
    }
    out.push(mark);
  }
  return { clipId, masks: out };
}

/** The handle, point or mask under project point (x, y) (`reach` project px), topmost (last) mask first; null when none. */
export function hitMask(scene: MaskScene, masks: readonly Mask[], space: MaskSpace, x: number, y: number, reach: number): MaskHit | null {
  const near = (p: Pt) => Math.hypot(p.x - x, p.y - y) <= reach;
  for (let i = scene.masks.length - 1; i >= 0; i--) {
    const mark = scene.masks[i] as MaskMark;
    for (const point of mark.anchors) if (near(point)) return { kind: "point", mask: i, pair: point.pair };
    for (const point of mark.controls) if (near(point)) return { kind: "point", mask: i, pair: point.pair };
    for (const handle of mark.box) if (near(handle)) return { kind: "box", mask: i, handle: handle.id };
    if (near(mark.feather)) return { kind: "feather", mask: i };
  }
  const content = toContent(space, x, y);
  if (!content) return null;
  for (let i = scene.masks.length - 1; i >= 0; i--) {
    const mask = masks.find((m) => m.id === scene.masks[i]?.maskId);
    const b = mask ? maskBounds(mask) : null;
    if (b && content.x >= b.x && content.x <= b.x + b.w && content.y >= b.y && content.y <= b.y + b.h) return { kind: "body", mask: i };
  }
  return null;
}

/** Project px -> content px (null when the box cannot be inverted). */
export function toContent(space: MaskSpace, x: number, y: number): Pt | null {
  const inverse = mutableIdentity();
  if (!invertInto(inverse, space.model)) return null;
  return applyToPoint(inverse, x, y);
}

/** The segment of a path mask nearest project point (x, y) within `reach` project px (a double-click there adds a point). */
export function maskSegmentAt(mask: Mask, space: MaskSpace, x: number, y: number, reach: number): (SegmentRef & { t: number }) | null {
  if (mask.shape.kind !== "path") return null;
  const path = parseMaskPath(mask.shape.d);
  const content = toContent(space, x, y);
  if (!path || !content) return null;
  // Reach in content px: the model's scale along x.
  const m = space.model;
  const scale = Math.hypot(m[0] as number, m[1] as number) || 1;
  const hit = nearestSegment(path, content.x, content.y);
  return hit && hit.distance <= reach / scale ? { sub: hit.sub, seg: hit.seg, t: hit.t } : null;
}

/**
 * The masks a drag makes: `start` (the masks shown when it began) with `hit` dragged from content point
 * `from` to `to`. A box handle moves its sides (Shift keeps the box's aspect on a corner), the body moves
 * the mask, a point moves alone (an anchor takes its controls along), the feather handle sets the feather.
 */
export function maskDrag(start: readonly Mask[], index: number, hit: MaskHit, from: Pt, to: Pt, shift: boolean): Mask[] {
  const out = start.map((m) => structuredClone(m) as Mask);
  const mask = out[index];
  if (!mask) return out;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const shape = mask.shape;
  if (hit.kind === "feather") {
    const b = maskBounds(start[index] as Mask);
    if (b) mask.feather = round(Math.max(0, to.x - (b.x + b.w + FEATHER_HANDLE_GAP)));
    return out;
  }
  if (hit.kind === "body") {
    if (shape.kind === "path") {
      const points = maskPathPoints(shape.d);
      if (points) shape.d = maskPathData(shape.d, points.map((v, i) => round(v + (i % 2 === 0 ? dx : dy))));
    } else {
      shape.x = round(shape.x + dx);
      shape.y = round(shape.y + dy);
    }
    return out;
  }
  if (hit.kind === "point" && shape.kind === "path") {
    const path = parseMaskPath(shape.d);
    if (!path) return out;
    const points = pathPoints(path);
    const roles = pointRoles(path);
    const move = (pair: number) => {
      points[2 * pair] = round((points[2 * pair] as number) + dx);
      points[2 * pair + 1] = round((points[2 * pair + 1] as number) + dy);
    };
    move(hit.pair);
    if (roles[hit.pair]?.kind === "anchor") {
      roles.forEach((role, pair) => {
        if (role.kind === "handle" && role.anchor === hit.pair) move(pair);
      });
      // The last anchor of a subpath that sits on its start (an ellipse's) moves with it.
      const x = (start[index]?.shape.kind === "path" ? maskPathPoints((start[index]?.shape as { d: string }).d) : null) ?? [];
      roles.forEach((role, pair) => {
        if (pair !== hit.pair && role.kind === "anchor" && x[2 * pair] === x[2 * hit.pair] && x[2 * pair + 1] === x[2 * hit.pair + 1]) move(pair);
      });
    }
    shape.d = maskPathData(shape.d, points);
    return out;
  }
  if (hit.kind === "box" && shape.kind !== "path") {
    const { u, v } = HANDLES[hit.handle];
    let x0 = shape.x;
    let y0 = shape.y;
    let x1 = shape.x + shape.w;
    let y1 = shape.y + shape.h;
    if (u === 0) x0 += dx;
    if (u === 1) x1 += dx;
    if (v === 0) y0 += dy;
    if (v === 1) y1 += dy;
    if (shift && u !== 0.5 && v !== 0.5 && shape.w > 0 && shape.h > 0) {
      // Keep the aspect: the larger relative change wins, the opposite corner stays.
      const aspect = shape.w / shape.h;
      const w = Math.abs(x1 - x0);
      const h = Math.abs(y1 - y0);
      if (w / shape.w > h / shape.h) {
        const nh = w / aspect;
        if (v === 0) y0 = y1 - nh;
        else y1 = y0 + nh;
      } else {
        const nw = h * aspect;
        if (u === 0) x0 = x1 - nw;
        else x1 = x0 + nw;
      }
    }
    shape.x = round(Math.min(x0, x1));
    shape.y = round(Math.min(y0, y1));
    shape.w = round(Math.abs(x1 - x0));
    shape.h = round(Math.abs(y1 - y0));
  }
  return out;
}

/** Appends `scene` to the overlay's change detection numbers. */
export function flattenMaskScene(scene: MaskScene | null, out: number[]): void {
  if (!scene) {
    out.push(0);
    return;
  }
  out.push(1, scene.masks.length);
  for (const mark of scene.masks) {
    out.push(mark.dashed ? 1 : 0, mark.line.length, mark.box.length, mark.anchors.length, mark.controls.length, mark.feather.x, mark.feather.y);
    for (const n of mark.line) out.push(n);
    for (const p of mark.box) out.push(p.x, p.y);
    for (const p of mark.anchors) out.push(p.x, p.y);
    for (const p of mark.controls) out.push(p.x, p.y);
  }
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}
