// Solid size handles (spec §7.3, Build "size handles change `size`, not scale, for solids", Batch 34):
// the gizmo of one solid layer sizes the solid instead of scaling it.
// - The scale gesture (gizmo.ts: corners keep the aspect unless Shift, Alt from the center, the dragged
//   edge snapping) gives the box the pointer asks for; the solid takes it as a new size at its own
//   scale: each side grows by the factor the scale would have, rounded to whole px.
// - The position moves so the fixed point (the opposite corner or side, the center with Alt) stays
//   where it is on the frame, rotation and scale included. The corner radius stays (a smaller box draws
//   it smaller: at most half its shorter side).
// Pure; points are project px from the frame's top-left.
import type { ClipId, Transform } from "../../core/document/types.js";
import { SOLID_LIMITS, type SolidLook } from "../../timeline/edit/solid.js";
import { layerCorners, layerPoint, scaleYOf, type Point, type Size } from "../../timeline/edit/transform.js";
import { HANDLES, type GizmoBox, type HandleId, type Modifiers } from "./gizmo.js";

/** A solid layer when its size handle drag starts (its shown look and transform). */
export interface SolidGestureStart {
  clipId: ClipId;
  look: SolidLook;
  transform: Transform;
  frame: Size;
}

export interface SolidGestureResult {
  look: SolidLook;
  transform: Transform;
  /** The box as the gesture leaves it. */
  box: GizmoBox;
  readout: string;
}

const px = (value: number) => Math.min(SOLID_LIMITS.size.max, Math.max(SOLID_LIMITS.size.min, Math.round(value)));

/** `transform` moved so content point (`fu`, `fv`) of a `size` box lands on `fixed` (project px). */
function placed(transform: Transform, size: Size, frame: Size, fu: number, fv: number, fixed: Point): Transform {
  const at = layerPoint({ ...transform, x: 0, y: 0 }, size, frame, fu * size.width, fv * size.height);
  return { ...transform, x: fixed.x - at.x, y: fixed.y - at.y };
}

/**
 * The size `scaled` (the scale gesture's transform for the drag of `handle`) asks for, as the solid's
 * new size at its own scale, with the transform that keeps the fixed point in place.
 */
export function solidSizeGesture(start: SolidGestureStart, scaled: Transform, handle: HandleId, mods: Pick<Modifiers, "alt">): SolidGestureResult {
  const t0 = start.transform;
  const { w, h } = start.look.size;
  const kx = t0.scale !== 0 ? scaled.scale / t0.scale : 1;
  const ky = scaleYOf(t0) !== 0 ? scaleYOf(scaled) / scaleYOf(t0) : 1;
  const size = { w: px(w * Math.abs(kx)), h: px(h * Math.abs(ky)) };
  const { u, v } = HANDLES[handle];
  const fu = mods.alt ? 0.5 : 1 - u;
  const fv = mods.alt ? 0.5 : 1 - v;
  const fixed = layerPoint(t0, { width: w, height: h }, start.frame, fu * w, fv * h);
  const box = { width: size.w, height: size.h };
  const transform = placed(t0, box, start.frame, fu, fv, fixed);
  return {
    look: { ...start.look, size },
    transform,
    box: layerCorners(transform, { ...box, left: 0, top: 0, right: size.w, bottom: size.h }, start.frame),
    readout: `${size.w} × ${size.h} px`,
  };
}
