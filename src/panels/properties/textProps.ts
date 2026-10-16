// The number properties of the Text section (spec §11, §10.1), in field units (project px, the line
// height as a multiplier). Each reads one value of a text clip and writes the clip's new content or
// style. Pure: textBinding.ts applies them.
import type { TextClip } from "../../core/document/types.js";
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
}

function styleProp(id: string, label: string, limits: { min: number; max: number }, precision: number, read: (clip: TextClip) => number, write: (style: TextClip["style"], value: number) => TextClip["style"]): TextNumberProp {
  return { id, label, precision, ...limits, read, write: (clip, value) => ({ style: write(clip.style, value) }) };
}

export const FONT_SIZE = styleProp("fontSize", "Change font size", TEXT_LIMITS.fontSize, 0, (clip) => clip.style.fontSize, (style, fontSize) => ({ ...style, fontSize }));

export const LETTER_SPACING = styleProp("letterSpacing", "Change letter spacing", TEXT_LIMITS.letterSpacing, 1, (clip) => clip.style.letterSpacing, (style, letterSpacing) => ({ ...style, letterSpacing }));

export const LINE_HEIGHT = styleProp("lineHeight", "Change line height", TEXT_LIMITS.lineHeight, 2, (clip) => clip.style.lineHeight, (style, lineHeight) => ({ ...style, lineHeight }));

export const STROKE_WIDTH = styleProp("strokeWidth", "Change stroke", TEXT_LIMITS.strokeWidth, 1, (clip) => clip.style.stroke.width, (style, width) => ({ ...style, stroke: { ...style.stroke, width } }));

const SHADOW_OFFSET = { min: -500, max: 500 };

export const SHADOW_X = styleProp("shadowX", "Change shadow", SHADOW_OFFSET, 1, (clip) => clip.style.shadow.x, (style, x) => ({ ...style, shadow: { ...style.shadow, x } }));

export const SHADOW_Y = styleProp("shadowY", "Change shadow", SHADOW_OFFSET, 1, (clip) => clip.style.shadow.y, (style, y) => ({ ...style, shadow: { ...style.shadow, y } }));

export const SHADOW_BLUR = styleProp("shadowBlur", "Change shadow", TEXT_LIMITS.shadowBlur, 1, (clip) => clip.style.shadow.blur, (style, blur) => ({ ...style, shadow: { ...style.shadow, blur } }));

export const PADDING_X = styleProp("paddingX", "Change background", TEXT_LIMITS.padding, 0, (clip) => clip.style.background.paddingX, (style, paddingX) => ({ ...style, background: { ...style.background, paddingX } }));

export const PADDING_Y = styleProp("paddingY", "Change background", TEXT_LIMITS.padding, 0, (clip) => clip.style.background.paddingY, (style, paddingY) => ({ ...style, background: { ...style.background, paddingY } }));

export const RADIUS = styleProp("radius", "Change background", TEXT_LIMITS.radius, 0, (clip) => clip.style.background.radius, (style, radius) => ({ ...style, background: { ...style.background, radius } }));

export const BOX_WIDTH: TextNumberProp = {
  id: "boxWidth",
  label: "Change box width",
  precision: 0,
  ...TEXT_LIMITS.boxWidth,
  read: (clip) => clip.text.box.width,
  write: (clip, width) => ({ text: { ...clip.text, box: { ...clip.text.box, width } } }),
};
