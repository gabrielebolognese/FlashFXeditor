// A cue's caption on the canvas (spec §20.3, Batch 53): the active cue as a layer the canvas can select,
// move and size. Pure; points are project px from the frame's top-left.
// - The layer is the caption as the compositor draws it (`cueGeometry`): its look in its effective
//   style (the track's with the cue's override; or the live values of a scrub, a hovered preset, the
//   cue list's or the inline editor's draft), its box placed at the style's position: a transform at
//   scale 1 anchored where the position keeps the caption (the bottom edge for Bottom, the middle for
//   Center and Custom, the top edge for Top).
// - A move ends as a Custom position: the box's middle (`captionMiddle`), from the frame center.
// - A corner handle sizes the font (`captionSizeGesture`): the pointer's distance from the caption's
//   anchor, along the handle's direction, over the handle's, scales the effective font size (the
//   caption keeps its anchor: a bottom caption grows up). Only the size changes; the other px values
//   stay (the override stays one field).
import type { CaptionClip, CaptionStyle, ClipId, Project, Track, Transform } from "../../core/document/types.js";
import { captionPlace, effectiveCaptionStyle } from "../../text/captions.js";
import { TEXT_LIMITS } from "../../text/style.js";
import { captionStyleOf } from "../../timeline/edit/captions.js";
import { layerCorners, type ContentBox, type Point, type Size } from "../../timeline/edit/transform.js";
import type { LiveCaptions } from "../compositor/Compositor.js";
import { captionLook, type CaptionLook } from "../text/captionLayout.js";
import { textLayout } from "../text/layoutCache.js";
import { HANDLES, type GizmoBox, type HandleId } from "./gizmo.js";

/** A cue's caption as drawn: its effective style, its look for its (shown) text, its box and where it sits. */
export interface CueGeometry {
  style: CaptionStyle;
  text: string;
  look: CaptionLook;
  box: ContentBox;
  transform: Transform;
}

/** The style a cue shows in: a live one (a scrub, a hovered preset, a size drag), else its effective style (a live track style under its override). */
export function shownCueStyle(project: Project, cue: CaptionClip, live: LiveCaptions | null): CaptionStyle {
  return live?.cueStyles?.get(cue.id) ?? effectiveCaptionStyle(live?.styles?.get(cue.trackId) ?? captionStyleOf(project, cue.trackId), cue.styleOverride);
}

/** The transform that places a `style` caption (spec §10.5 positions, Custom at x / y). */
export function captionTransform(style: CaptionStyle, frameHeight: number): Transform {
  const place = captionPlace(style, frameHeight);
  return { x: place.x, y: place.y, scale: 1, rotation: 0, anchor: { x: 0.5, y: place.anchorY }, flipH: false, flipV: false };
}

/** The box of a caption look (the layout of its text in the shown style). */
function lookBox(look: CaptionLook): ContentBox {
  const { width, height } = textLayout(look.content, look.style);
  return { width, height, left: 0, top: 0, right: width, bottom: height };
}

/** Cue `cue` of `track` as the compositor draws it, or null when it draws nothing (disabled, empty). */
export function cueGeometry(project: Project, track: Track, cue: CaptionClip, live: LiveCaptions | null, moved?: Transform): CueGeometry | null {
  if (!cue.enabled) return null;
  const text = live?.texts?.get(cue.id) ?? cue.text;
  if (text.trim() === "") return null;
  const style = shownCueStyle(project, cue, live);
  const look = captionLook(text, style);
  const box = lookBox(look);
  if (!(box.width > 0 && box.height > 0)) return null;
  return { style, text, look, box, transform: moved ?? captionTransform(style, project.settings.height) };
}

/** The middle of a caption's box from the frame center (what a move leaves as its Custom x and y), rounded. */
export function captionMiddle(transform: Transform, box: Pick<ContentBox, "width" | "height">): { x: number; y: number } {
  return { x: Math.round(transform.x + (0.5 - transform.anchor.x) * box.width), y: Math.round(transform.y + (0.5 - transform.anchor.y) * box.height) };
}

/** A cue when its size handle drag starts. */
export interface CaptionSizeStart {
  clipId: ClipId;
  /** Its shown text and effective style, and where it sits. */
  text: string;
  style: CaptionStyle;
  transform: Transform;
  box: ContentBox;
  frame: Size;
}

export interface CaptionSizeResult {
  /** The effective style with the new font size. */
  style: CaptionStyle;
  fontSize: number;
  box: GizmoBox;
  readout: string;
}

/** A corner handle drag on a caption (spec §20.3 "corner handles change its font size"). */
export function captionSizeGesture(start: CaptionSizeStart, handle: HandleId, pointer: Point): CaptionSizeResult {
  const { transform, box, frame } = start;
  const { u, v } = HANDLES[handle];
  const fixed = { x: frame.width / 2 + transform.x, y: frame.height / 2 + transform.y };
  const hx = (u - transform.anchor.x) * box.width;
  const hy = (v - transform.anchor.y) * box.height;
  const length = hx * hx + hy * hy;
  const k = length > 0 ? ((pointer.x - fixed.x) * hx + (pointer.y - fixed.y) * hy) / length : 1;
  const { min, max } = TEXT_LIMITS.fontSize;
  const fontSize = Math.round(Math.min(max, Math.max(min, start.style.text.fontSize * k)));
  const style: CaptionStyle = { ...start.style, text: { ...start.style.text, fontSize } };
  const after = lookBox(captionLook(start.text, style));
  return { style, fontSize, box: layerCorners(transform, after, frame), readout: `${fontSize} px` };
}
