// The number properties of the Text section (spec §11, §10.1), in field units (project px, the line
// height as a multiplier). Each reads one value of a text clip and writes the clip's new content or
// style; the style ones also read and write a bare style (`style`: the Caption style section, Batch 32).
// Pure: textBinding.ts and captionBinding.ts apply them.
import type { TextClip, TextStyle } from "../../core/document/types.js";
import { TEXT_LIMITS } from "../../text/style.js";
import type { TextEdit } from "../../timeline/edit/text.js";

export interface TextNumberProp {
  /** Stable id (the coalesce key of arrow steps). */
  id: string;
  /** Undo history label. */
  label: string;
  precision: number;
  min: number;
  max: number;
  read(clip: TextClip): number;
  write(clip: TextClip, value: number): Partial<TextEdit>;
  /** A style property's value in a bare style (absent for content properties: the box width). */
  style?: { read(style: TextStyle): number; write(style: TextStyle, value: number): TextStyle };
}

function styleProp(id: string, label: string, limits: { min: number; max: number }, precision: number, read: (style: TextStyle) => number, write: (style: TextStyle, value: number) => TextStyle): TextNumberProp {
  return { id, label, precision, ...limits, read: (clip) => read(clip.style), write: (clip, value) => ({ style: write(clip.style, value) }), style: { read, write } };
}

export const FONT_SIZE = styleProp("fontSize", "Change font size", TEXT_LIMITS.fontSize, 0, (s) => s.fontSize, (style, fontSize) => ({ ...style, fontSize }));

export const LETTER_SPACING = styleProp("letterSpacing", "Change letter spacing", TEXT_LIMITS.letterSpacing, 1, (s) => s.letterSpacing, (style, letterSpacing) => ({ ...style, letterSpacing }));

export const LINE_HEIGHT = styleProp("lineHeight", "Change line height", TEXT_LIMITS.lineHeight, 2, (s) => s.lineHeight, (style, lineHeight) => ({ ...style, lineHeight }));

export const STROKE_WIDTH = styleProp("strokeWidth", "Change stroke", TEXT_LIMITS.strokeWidth, 1, (s) => s.stroke.width, (style, width) => ({ ...style, stroke: { ...style.stroke, width } }));

const SHADOW_OFFSET = { min: -500, max: 500 };

export const SHADOW_X = styleProp("shadowX", "Change shadow", SHADOW_OFFSET, 1, (s) => s.shadow.x, (style, x) => ({ ...style, shadow: { ...style.shadow, x } }));

export const SHADOW_Y = styleProp("shadowY", "Change shadow", SHADOW_OFFSET, 1, (s) => s.shadow.y, (style, y) => ({ ...style, shadow: { ...style.shadow, y } }));

export const SHADOW_BLUR = styleProp("shadowBlur", "Change shadow", TEXT_LIMITS.shadowBlur, 1, (s) => s.shadow.blur, (style, blur) => ({ ...style, shadow: { ...style.shadow, blur } }));

export const PADDING_X = styleProp("paddingX", "Change background", TEXT_LIMITS.padding, 0, (s) => s.background.paddingX, (style, paddingX) => ({ ...style, background: { ...style.background, paddingX } }));

export const PADDING_Y = styleProp("paddingY", "Change background", TEXT_LIMITS.padding, 0, (s) => s.background.paddingY, (style, paddingY) => ({ ...style, background: { ...style.background, paddingY } }));

export const RADIUS = styleProp("radius", "Change background", TEXT_LIMITS.radius, 0, (s) => s.background.radius, (style, radius) => ({ ...style, background: { ...style.background, radius } }));

/** A box border or shadow a style does not have yet starts as these (Batch 58; off). */
const BOX_STROKE: NonNullable<TextStyle["background"]["stroke"]> = { enabled: false, width: 3, color: { r: 0, g: 0, b: 0, a: 1 } };
const BOX_SHADOW: NonNullable<TextStyle["background"]["shadow"]> = { enabled: false, x: 7, y: 7, blur: 0, color: { r: 0, g: 0, b: 0, a: 1 } };
export const boxStrokeOf = (style: TextStyle) => style.background.stroke ?? BOX_STROKE;
export const boxShadowOf = (style: TextStyle) => style.background.shadow ?? BOX_SHADOW;

export const BOX_STROKE_WIDTH = styleProp("boxStrokeWidth", "Change background border", TEXT_LIMITS.strokeWidth, 1, (s) => boxStrokeOf(s).width, (style, width) => ({ ...style, background: { ...style.background, stroke: { ...boxStrokeOf(style), width } } }));

export const BOX_SHADOW_X = styleProp("boxShadowX", "Change background shadow", SHADOW_OFFSET, 1, (s) => boxShadowOf(s).x, (style, x) => ({ ...style, background: { ...style.background, shadow: { ...boxShadowOf(style), x } } }));

export const BOX_SHADOW_Y = styleProp("boxShadowY", "Change background shadow", SHADOW_OFFSET, 1, (s) => boxShadowOf(s).y, (style, y) => ({ ...style, background: { ...style.background, shadow: { ...boxShadowOf(style), y } } }));

export const BOX_SHADOW_BLUR = styleProp("boxShadowBlur", "Change background shadow", TEXT_LIMITS.shadowBlur, 1, (s) => boxShadowOf(s).blur, (style, blur) => ({ ...style, background: { ...style.background, shadow: { ...boxShadowOf(style), blur } } }));

export const BOX_WIDTH: TextNumberProp = {
  id: "boxWidth",
  label: "Change box width",
  precision: 0,
  ...TEXT_LIMITS.boxWidth,
  read: (clip) => clip.text.box.width,
  write: (clip, width) => ({ text: { ...clip.text, box: { ...clip.text.box, width } } }),
};
