// How far a layer draws past its layout box (the Batch 58 follow-up, done in Batch 65): a solid's or a
// picture's stroke and shadow, a shape's paths (which may leave their view box) and their strokes. The
// selection and hover outlines show these drawn bounds; hit testing, snapping, crop and the gizmo's
// handles stay on the layout box (canvasLayers.ts). Pure, no DOM.
import { controlBounds, parsePathData } from "../../core/shapes/pathData.js";
import { primitivePath } from "../../core/shapes/primitives.js";
import type { Clip, ShadowStyle, ShapeClip, ShapePath, StrokeStyle } from "../../core/document/types.js";

/** Content px a layer draws past each side of its box (0: not past it). */
export interface Reach {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** What a frame stroke reaches past the edge it follows: half its width centered, all of it outside. */
function strokeReach(stroke: StrokeStyle | undefined): number {
  if (!stroke || !(stroke.width > 0) || stroke.color.a <= 0) return 0;
  return stroke.align === "outside" ? stroke.width : stroke.align === "inside" ? 0 : stroke.width / 2;
}

/** What a shadow reaches past the box on each side (its offset, spread and 1.5 x blur: the shader's visible tail). */
function shadowReach(out: Reach, shadow: ShadowStyle | undefined): void {
  if (!shadow || shadow.color.a <= 0) return;
  const grow = Math.max(0, shadow.spread) + 1.5 * Math.max(0, shadow.blur);
  out.left = Math.max(out.left, grow - shadow.x);
  out.right = Math.max(out.right, grow + shadow.x);
  out.top = Math.max(out.top, grow - shadow.y);
  out.bottom = Math.max(out.bottom, grow + shadow.y);
}

const pathBoxes = new WeakMap<ShapePath, [number, number, number, number] | null>();

/** A path's control-point box in view-box px (holds every point of its curves), cached per path object. */
function pathBox(clip: ShapeClip, path: ShapePath): [number, number, number, number] | null {
  if (pathBoxes.has(path)) return pathBoxes.get(path) ?? null;
  let box: [number, number, number, number] | null = null;
  try {
    const parsed = path.primitive ? primitivePath(path.primitive, clip.size.w, clip.size.h) : parsePathData(path.d);
    box = controlBounds(parsed);
  } catch {
    box = null;
  }
  pathBoxes.set(path, box);
  return box;
}

/** How far a path's stroke reaches past its outline: miters up to their limit, square caps their diagonal. */
function pathStrokeReach(path: ShapePath): number {
  const stroke = path.stroke;
  if (!stroke || !(stroke.width > 0)) return 0;
  const half = stroke.align === "outside" ? stroke.width : stroke.align === "inside" ? 0 : stroke.width / 2;
  if (half === 0) return 0;
  const factor = Math.max(stroke.join === "miter" ? stroke.miterLimit : 1, stroke.cap === "square" ? Math.SQRT2 : 1);
  return half * factor;
}

/** How far `clip` draws past its layout box (content px, before flips are applied to it); null when it does not. */
export function drawnReach(clip: Clip): Reach | null {
  const out: Reach = { left: 0, top: 0, right: 0, bottom: 0 };
  if (clip.kind === "solid" || clip.kind === "video" || clip.kind === "image") {
    const stroke = strokeReach(clip.stroke);
    out.left = out.top = out.right = out.bottom = stroke;
    shadowReach(out, clip.shadow);
  } else if (clip.kind === "shape") {
    const { w, h } = clip.size;
    for (const path of clip.paths) {
      const box = pathBox(clip, path);
      if (!box) continue;
      const grow = pathStrokeReach(path);
      out.left = Math.max(out.left, grow - box[0]);
      out.top = Math.max(out.top, grow - box[1]);
      out.right = Math.max(out.right, box[2] + grow - w);
      out.bottom = Math.max(out.bottom, box[3] + grow - h);
    }
    // Flips mirror the drawing inside the box.
    if (clip.transform.flipH) [out.left, out.right] = [out.right, out.left];
    if (clip.transform.flipV) [out.top, out.bottom] = [out.bottom, out.top];
  } else {
    return null;
  }
  return out.left > 0 || out.top > 0 || out.right > 0 || out.bottom > 0 ? out : null;
}
