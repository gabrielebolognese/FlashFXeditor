// A text clip's keyed style at a frame (spec §21.9 and P11, Batch 60): font size, letter spacing and a
// flat fill, without rasterizing during playback.
// - Font size: the text is laid out and rasterized at the largest size its keys reach and drawn scaled
//   by size / largest (`scale`). The wrap width of a fixed box scales with it.
// - Letter spacing: the raster keeps the clip's own spacing; the characters are drawn from the character
//   atlas, each moved by the difference times its place in its line (and the line's alignment shift).
// - Fill: a fill layer per key color. The text is drawn in the color of the key before the frame and, over
//   it at `mix` opacity, in the color of the key after it, so a hold shows one color and a linear fade
//   goes from one to the other (exact inside the glyphs, approximate on their antialiased edges). The
//   rasters (one per distinct color) are made once and prepared ahead by `upcomingTexts`.
import { keyEase, keyIndexAt, propValue, scalar } from "../../core/document/keyframes.js";
import type { Key } from "../../core/document/keyframes.js";
import type { Keyframes, RGBA, TextStyle } from "../../core/document/types.js";

export interface TextMotion {
  /** Pass 0: the style to lay out and rasterize (largest keyed size, fill of the key before the frame). */
  style: TextStyle;
  /** Pass 1: the same in the fill of the key after the frame, drawn at `mix` opacity; null when the frame shows one color. */
  styleB: TextStyle | null;
  mix: number;
  /** Drawn size / laid out size (<= 1). */
  scale: number;
  /** Extra letter spacing to apply on top of the raster's, in raster px (0: none). */
  spacing: number;
}

export function newTextMotion(style: TextStyle): TextMotion {
  return { style, styleB: null, mix: 0, scale: 1, spacing: 0 };
}

const has = (keyframes: Keyframes, prop: string): boolean => (keyframes[prop]?.length ?? 0) > 0;

/** Whether the clip's text style is keyed at all (font size, letter spacing or fill). */
export function hasTextKeys(keyframes: Keyframes | undefined): boolean {
  return keyframes !== undefined && (has(keyframes, "style.fontSize") || has(keyframes, "style.letterSpacing") || has(keyframes, "style.fill"));
}

/** Whether `fill` is a plain color (the only fill the keys animate). */
function isColor(fill: TextStyle["fill"]): fill is RGBA {
  return "r" in fill;
}

const variants = new WeakMap<TextStyle, Map<string, TextStyle>>();

/** `style` at `fontSize` with `fill` (the same object when both are its own): cached, so the raster slots see a stable style. */
export function styleVariant(style: TextStyle, fontSize: number, fill: readonly number[] | null): TextStyle {
  const base = style.fill;
  const sameFill = fill === null || !isColor(base) || (base.r === fill[0] && base.g === fill[1] && base.b === fill[2] && base.a === (fill[3] ?? 1));
  if (fontSize === style.fontSize && sameFill) return style;
  const key = `${fontSize}|${fill ? fill.join(",") : ""}`;
  let byKey = variants.get(style);
  if (!byKey) variants.set(style, (byKey = new Map()));
  let found = byKey.get(key);
  if (!found) {
    found = { ...style, fontSize };
    if (fill && isColor(base)) found.fill = { r: fill[0] as number, g: fill[1] as number, b: fill[2] as number, a: fill[3] ?? 1 };
    byKey.set(key, found);
  }
  return found;
}

const maxSizes = new WeakMap<Keyframes, number>();

/** The largest font size `style` and the keys reach (cached per keyframes object). */
export function maxKeyedFontSize(keyframes: Keyframes | undefined, style: TextStyle): number {
  const keys = keyframes?.["style.fontSize"];
  if (!keyframes || !keys || keys.length === 0) return style.fontSize;
  let max = maxSizes.get(keyframes);
  if (max === undefined) {
    max = 0;
    for (const key of keys) max = Math.max(max, scalar(key.value));
    maxSizes.set(keyframes, max);
  }
  return Math.max(max, style.fontSize);
}

/** The distinct fill colors of the clip's fill keys, as channel arrays (empty: no fill keys). */
export function keyedFillColors(keyframes: Keyframes | undefined): readonly (readonly number[])[] {
  const keys = keyframes?.["style.fill"];
  if (!keys) return [];
  const seen = new Map<string, readonly number[]>();
  for (const key of keys) if (Array.isArray(key.value)) seen.set(key.value.join(","), key.value);
  return [...seen.values()];
}

const color = (key: Key): readonly number[] => (Array.isArray(key.value) ? key.value : [scalar(key.value), 0, 0, 1]);

/**
 * The keyed look of `style` at `rel`, written into `out`; null when the clip has no text keys (the
 * compositor then draws its own style as before).
 */
export function textMotion(keyframes: Keyframes | undefined, style: TextStyle, rel: number, out: TextMotion): TextMotion | null {
  if (!hasTextKeys(keyframes)) return null;
  const k = keyframes as Keyframes;
  const maxSize = maxKeyedFontSize(k, style);
  const size = has(k, "style.fontSize") ? Math.max(0, propValue(k, "style.fontSize", rel, style.fontSize)) : style.fontSize;
  out.scale = maxSize > 0 ? size / maxSize : 1;
  out.spacing = has(k, "style.letterSpacing") ? propValue(k, "style.letterSpacing", rel, style.letterSpacing) - style.letterSpacing : 0;
  out.styleB = null;
  out.mix = 0;
  const fills = k["style.fill"];
  if (!fills || fills.length === 0 || !isColor(style.fill)) {
    out.style = styleVariant(style, maxSize, null);
    return out;
  }
  const at = keyIndexAt(fills, rel);
  const left = fills[Math.max(0, at)] as Key;
  const right = at >= 0 ? fills[at + 1] : undefined;
  out.style = styleVariant(style, maxSize, color(left));
  if (right && rel > left.frame) {
    const progress = Math.min(1, Math.max(0, keyEase(left, (rel - left.frame) / (right.frame - left.frame))));
    if (progress >= 1) out.style = styleVariant(style, maxSize, color(right));
    else if (progress > 0 && left.ease !== "hold") {
      out.styleB = styleVariant(style, maxSize, color(right));
      out.mix = progress;
      if (out.styleB === out.style) out.styleB = null;
    }
  }
  return out;
}
