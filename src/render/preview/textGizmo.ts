// Text box handles (spec §7.3 "Text layers"): the gizmo of one text layer sizes its text instead of
// scaling the layer.
// - Corner handles change the font size, keeping the layout: every px value of the style and a fixed
//   box's width scale together (`scaleTextStyle`), so the text looks the same, larger or smaller. The
//   opposite corner (with Alt, the box center) stays where it is on the frame.
// - Side handles (left, right) change the box's width and the text reflows; an auto box becomes a fixed
//   one at that width. The opposite side (with Alt, the center) stays, at the height the vertical
//   anchor names (more lines grow away from it).
// - There are no top and bottom handles: a text box's height is its lines'.
// Pure; points are project px from the frame's top-left, the box is the layer's layout box.
import type { ClipId, TextContent, TextStyle, Transform } from "../../core/document/types.js";
import { scaleTextStyle, TEXT_LIMITS } from "../../text/style.js";
import { layerCorners, layerPoint, rotationTrig, scaleYOf, type Point, type Size } from "../../timeline/edit/transform.js";
import { textLayout } from "../text/layoutCache.js";
import { HANDLES, isCorner, type GizmoBox, type HandleId, type Modifiers } from "./gizmo.js";

/** The handles a text box shows (no top and bottom ones). */
export const TEXT_HANDLES: readonly HandleId[] = ["nw", "ne", "se", "sw", "e", "w"];

export const isTextHandle = (handle: HandleId): boolean => handle !== "n" && handle !== "s";

/** A text layer when its handle drag starts (its shown text, style and transform). */
export interface TextGestureStart {
  clipId: ClipId;
  text: TextContent;
  style: TextStyle;
  transform: Transform;
  frame: Size;
}

export interface TextGestureResult {
  text: TextContent;
  style: TextStyle;
  transform: Transform;
  /** The box as the gesture leaves it. */
  box: GizmoBox;
  readout: string;
}

const ANCHOR_FRACTION = { top: 0, middle: 0.5, bottom: 1 } as const;

/** `transform` moved so content point (`fu`, `fv`) of a `size` box lands on `fixed` (project px). */
function placed(transform: Transform, size: Size, frame: Size, fu: number, fv: number, fixed: Point): Transform {
  const at = layerPoint({ ...transform, x: 0, y: 0 }, size, frame, fu * size.width, fv * size.height);
  return { ...transform, x: fixed.x - at.x, y: fixed.y - at.y };
}

/** The pointer from `fixed` in the layer's axes (scaled content px). */
function inLayer(transform: Transform, fixed: Point, pointer: Point): Point {
  const { sin, cos } = rotationTrig(transform.rotation);
  const wx = pointer.x - fixed.x;
  const wy = pointer.y - fixed.y;
  return { x: cos * wx + sin * wy, y: -sin * wx + cos * wy };
}

function result(start: TextGestureStart, text: TextContent, style: TextStyle, transform: Transform, readout: string): TextGestureResult {
  const { width, height } = textLayout(text, style);
  return { text, style, transform, box: layerCorners(transform, { width, height, left: 0, top: 0, right: width, bottom: height }, start.frame), readout };
}

/** A corner handle drag (spec §7.3): the font size (and every px value with it) follows the pointer. */
export function textSizeGesture(start: TextGestureStart, handle: HandleId, pointer: Point, mods: Pick<Modifiers, "alt">): TextGestureResult {
  const t0 = start.transform;
  const before = textLayout(start.text, start.style);
  const { u, v } = HANDLES[handle];
  const fu = mods.alt ? 0.5 : 1 - u;
  const fv = mods.alt ? 0.5 : 1 - v;
  const fixed = layerPoint(t0, before, start.frame, fu * before.width, fv * before.height);
  // The handle from the fixed point in the layer's axes; the pointer projected on that diagonal.
  const hx = (u - fu) * before.width * t0.scale;
  const hy = (v - fv) * before.height * scaleYOf(t0);
  const d = inLayer(t0, fixed, pointer);
  const length = hx * hx + hy * hy;
  const k = length > 0 ? (d.x * hx + d.y * hy) / length : 1;
  const { min, max } = TEXT_LIMITS.fontSize;
  const factor = Math.min(max / start.style.fontSize, Math.max(min / start.style.fontSize, k));
  const style = scaleTextStyle(start.style, factor);
  const applied = style.fontSize / start.style.fontSize;
  const box = start.text.box;
  const text: TextContent = box.mode === "fixed" ? { ...start.text, box: { ...box, width: clampWidth(box.width * applied) } } : start.text;
  const after = textLayout(text, style);
  return result(start, text, style, placed(t0, after, start.frame, fu, fv, fixed), `${style.fontSize} px`);
}

const clampWidth = (width: number) => Math.round(Math.min(TEXT_LIMITS.boxWidth.max, Math.max(TEXT_LIMITS.boxWidth.min, width)));

/** A side handle drag (spec §7.3): the box's width follows the pointer and the text reflows (an auto box turns fixed). */
export function textWidthGesture(start: TextGestureStart, handle: HandleId, pointer: Point, mods: Pick<Modifiers, "alt">): TextGestureResult {
  const t0 = start.transform;
  const before = textLayout(start.text, start.style);
  const { u } = HANDLES[handle];
  const fu = mods.alt ? 0.5 : 1 - u;
  const fv = ANCHOR_FRACTION[start.style.verticalAnchor];
  const fixed = layerPoint(t0, before, start.frame, fu * before.width, fv * before.height);
  const d = inLayer(t0, fixed, pointer);
  // The content width the pointer asks for, less the background padding on both sides.
  const content = d.x / t0.scale / (u - fu);
  const padding = before.width - before.block.width;
  const width = clampWidth(content - padding);
  const text: TextContent = { ...start.text, box: { mode: "fixed", width } };
  const after = textLayout(text, start.style);
  return result(start, text, start.style, placed(t0, after, start.frame, fu, fv, fixed), `W ${width} px`);
}

/** Whether `handle` sizes the text (a corner) or sets its width (a side). */
export const textHandleKind = (handle: HandleId): "textSize" | "textWidth" => (isCorner(handle) ? "textSize" : "textWidth");
