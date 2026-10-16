// Crop handles on the canvas (spec §7.3 "crop handles as a gizmo mode", §11 Crop): in crop mode the
// gizmo of one video or image layer gets 8 crop handles on its visible box (the corners and the edge
// midpoints) instead of the scale and rotate zones. Pure; points are in project px from the frame's
// top-left, crops in media px (the content box: the media as shown, flips aside: `left` is always the
// visible left side, so a flip moves no crop edge on screen).
// - A handle moves its edges to the pointer's content point (the inverse of the layer transform),
//   clamped to the media and to MIN_CROP_PX before the opposite edge.
// - Alt crops symmetrically: the opposite edge moves the other way around the box center.
// - The aspect lock (Shift, or the Crop section's lock; Shift inverts it) keeps the visible aspect: a
//   corner scales the box from the opposite corner (or the center with Alt) by the pointer's projection
//   on the diagonal; an edge sets its axis and the other one follows around its center (as the fields).
// - Edge snapping (frame edges, center, thirds) aims the gesture at a target point (CanvasEditInput,
//   snap.ts `snapHandle`), as the scale handles do.
import type { ClipId, Crop, Transform } from "../../core/document/types.js";
import { MIN_CROP_PX, rectCrop, type CropRect } from "../../timeline/edit/crop.js";
import { layerCorners, rotationTrig, scaleYOf, type ContentBox, type Point, type Size } from "../../timeline/edit/transform.js";
import { HANDLES, isCorner, type GizmoBox, type HandleId } from "./gizmo.js";

/** Crop mode (shared by the canvas, the Crop section and the crop chip): the layer it crops, and the aspect lock. */
export interface CropModeState {
  /** The video or image clip in crop mode, or null. */
  target: ClipId | null;
  /** The Crop section's aspect lock (Shift inverts it during a handle drag). */
  aspectLock: boolean;
}

export const NO_CROP_MODE: CropModeState = { target: null, aspectLock: false };

/** The layer a crop handle drag holds, as it was when the drag started. */
export interface CropStart {
  clipId: ClipId;
  transform: Transform;
  /** The content box with the crop at the start (media px). */
  box: ContentBox;
  frame: Size;
}

export interface CropResult {
  crop: Crop;
  /** The visible box the crop leaves (project px), drawn while the drag runs. */
  box: GizmoBox;
  /** The numeric readout near the cursor: the dragged edges' crop and the visible size in media px. */
  readout: string;
}

/** The content point (media px of `box`'s content) under frame point `p`: the inverse of `layerPoint`. */
export function contentPoint(transform: Transform, box: Size, frame: Size, p: Point): Point {
  const { sin, cos } = rotationTrig(transform.rotation);
  const dx = p.x - frame.width / 2 - transform.x;
  const dy = p.y - frame.height / 2 - transform.y;
  return {
    x: (cos * dx + sin * dy) / transform.scale + transform.anchor.x * box.width,
    y: (-sin * dx + cos * dy) / scaleYOf(transform) + transform.anchor.y * box.height,
  };
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** One axis of a free (unlocked) handle: the edge at `q`, or both around the center with `symmetric`. */
function freeAxis(lo: number, hi: number, length: number, q: number, moveLow: boolean, symmetric: boolean): [number, number] {
  if (symmetric) {
    const center = (lo + hi) / 2;
    const half = clamp(Math.abs(q - center), MIN_CROP_PX / 2, Math.min(center, length - center));
    return [center - half, center + half];
  }
  return moveLow ? [clamp(q, 0, hi - MIN_CROP_PX), hi] : [lo, clamp(q, lo + MIN_CROP_PX, length)];
}

/**
 * A crop handle dragged to `pointer` (project px). `lock` is the aspect lock as the gesture uses it
 * (the section's lock, inverted by Shift). The box stays inside the media and at least MIN_CROP_PX on
 * each axis.
 */
export function cropGesture(start: CropStart, handle: HandleId, pointer: Point, mods: { alt: boolean }, lock: boolean): CropResult {
  const b = start.box;
  const t = start.transform;
  const W = b.width;
  const H = b.height;
  const q = contentPoint(t, b, start.frame, pointer);
  const { u, v } = HANDLES[handle];
  const moveX = u !== 0.5;
  const moveY = v !== 0.5;
  let rect: CropRect = { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
  const width0 = b.right - b.left;
  const height0 = b.bottom - b.top;
  if (lock && isCorner(handle)) {
    // Scale the box from the fixed point (the opposite corner, the center with Alt) by the pointer's
    // projection on the diagonal, measured on screen (scaled content px).
    const sx = t.scale;
    const sy = scaleYOf(t);
    const fx = mods.alt ? (b.left + b.right) / 2 : u === 0 ? b.right : b.left;
    const fy = mods.alt ? (b.top + b.bottom) / 2 : v === 0 ? b.bottom : b.top;
    const hx = (u === 0 ? b.left : b.right) - fx;
    const hy = (v === 0 ? b.top : b.bottom) - fy;
    const ax = hx * sx;
    const ay = hy * sy;
    let k = ((q.x - fx) * sx * ax + (q.y - fy) * sy * ay) / (ax * ax + ay * ay);
    // At least MIN_CROP_PX on each axis, and inside the media.
    const kMin = Math.max(MIN_CROP_PX / Math.abs(mods.alt ? 2 * hx : hx), MIN_CROP_PX / Math.abs(mods.alt ? 2 * hy : hy));
    const room = (f: number, h: number, length: number) => (h > 0 ? (length - f) / h : h < 0 ? f / -h : Infinity);
    let kMax = Math.min(room(fx, hx, W), room(fy, hy, H));
    if (mods.alt) kMax = Math.min(kMax, room(fx, -hx, W), room(fy, -hy, H));
    k = clamp(k, kMin, Math.max(kMin, kMax));
    const x0 = fx + hx * k;
    const y0 = fy + hy * k;
    const x1 = mods.alt ? fx - hx * k : fx;
    const y1 = mods.alt ? fy - hy * k : fy;
    rect = { left: Math.min(x0, x1), right: Math.max(x0, x1), top: Math.min(y0, y1), bottom: Math.max(y0, y1) };
  } else {
    if (moveX) [rect.left, rect.right] = freeAxis(b.left, b.right, W, q.x, u === 0, mods.alt);
    if (moveY) [rect.top, rect.bottom] = freeAxis(b.top, b.bottom, H, q.y, v === 0, mods.alt);
    if (lock && width0 > 0 && height0 > 0) {
      // An edge with the lock: the other axis follows around its center, within the media.
      const aspect = width0 / height0;
      if (moveX) {
        let height = (rect.right - rect.left) / aspect;
        if (height > H) {
          height = H;
          const width = H * aspect;
          if (mods.alt) {
            const center = (b.left + b.right) / 2;
            rect.left = center - width / 2;
            rect.right = center + width / 2;
          } else if (u === 0) rect.left = rect.right - width;
          else rect.right = rect.left + width;
        }
        height = Math.max(MIN_CROP_PX, height);
        rect.top = clamp((b.top + b.bottom) / 2 - height / 2, 0, H - height);
        rect.bottom = rect.top + height;
      } else {
        let width = (rect.bottom - rect.top) * aspect;
        if (width > W) {
          width = W;
          const height = W / aspect;
          if (mods.alt) {
            const center = (b.top + b.bottom) / 2;
            rect.top = center - height / 2;
            rect.bottom = center + height / 2;
          } else if (v === 0) rect.top = rect.bottom - height;
          else rect.bottom = rect.top + height;
        }
        width = Math.max(MIN_CROP_PX, width);
        rect.left = clamp((b.left + b.right) / 2 - width / 2, 0, W - width);
        rect.right = rect.left + width;
      }
    }
  }
  const crop = rectCrop(rect, { width: W, height: H });
  const box = layerCorners(t, { ...b, ...rect }, start.frame);
  return { crop, box, readout: cropReadout(rect, W, H, handle, mods.alt, lock) };
}

/**
 * `L 656 · R 656 · 608 × 1080`: the crop (media px) of the edges the gesture moves (the handle's, the
 * opposite ones with Alt, the other axis of a locked edge handle), then the visible size.
 */
function cropReadout(rect: CropRect, W: number, H: number, handle: HandleId, alt: boolean, lock: boolean): string {
  const { u, v } = HANDLES[handle];
  const moveX = u !== 0.5;
  const moveY = v !== 0.5;
  const followX = lock && !moveX;
  const followY = lock && !moveY;
  const px = (value: number) => String(Math.round(value) || 0);
  const parts: string[] = [];
  if (u === 0 || (alt && moveX) || followX) parts.push(`L ${px(rect.left)}`);
  if (v === 0 || (alt && moveY) || followY) parts.push(`T ${px(rect.top)}`);
  if (u === 1 || (alt && moveX) || followX) parts.push(`R ${px(W - rect.right)}`);
  if (v === 1 || (alt && moveY) || followY) parts.push(`B ${px(H - rect.bottom)}`);
  parts.push(`${px(rect.right - rect.left)} × ${px(rect.bottom - rect.top)}`);
  return parts.join(" · ");
}
