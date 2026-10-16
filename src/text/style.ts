// Text styles (spec §10.1): the defaults of a new text clip, text case, the fill kinds and the keys the
// layout and raster caches use. Pure.
import type { Gradient, RGBA, TextBox, TextCase, TextContent, TextStyle } from "../core/document/types.js";

/** The bundled family new text uses (render/text/bundledFonts.ts). */
export const DEFAULT_FONT_FAMILY = "Inter";

const WHITE: RGBA = { r: 1, g: 1, b: 1, a: 1 };
const BLACK: RGBA = { r: 0, g: 0, b: 0, a: 1 };

/** The style of a new text clip: bold white Inter at 96 px, centered; stroke, shadow and box off but preset. */
export const DEFAULT_TEXT_STYLE: TextStyle = {
  fontFamily: DEFAULT_FONT_FAMILY,
  fontWeight: 700,
  italic: false,
  fontSize: 96,
  fill: WHITE,
  stroke: { enabled: false, width: 6, color: BLACK },
  shadow: { enabled: false, x: 0, y: 6, blur: 16, color: { r: 0, g: 0, b: 0, a: 0.6 } },
  background: { enabled: false, color: { r: 0, g: 0, b: 0, a: 0.7 }, paddingX: 28, paddingY: 12, radius: 16, mode: "block" },
  textCase: "none",
  letterSpacing: 0,
  lineHeight: 1.2,
  align: "center",
  verticalAnchor: "middle",
};

/** The box of a new text clip: sized to its lines; the wrap width a switch to `fixed` starts from. */
export const DEFAULT_TEXT_BOX: TextBox = { mode: "auto", width: 900 };

export function textContent(value: string, box: TextBox = DEFAULT_TEXT_BOX): TextContent {
  return { value, box: { ...box } };
}

/** Limits of the Text section's fields (and of styles read from a file). */
export const TEXT_LIMITS = {
  fontSize: { min: 1, max: 2000 },
  fontWeight: { min: 1, max: 1000 },
  lineHeight: { min: 0.5, max: 4 },
  letterSpacing: { min: -200, max: 1000 },
  strokeWidth: { min: 0, max: 200 },
  shadowBlur: { min: 0, max: 200 },
  padding: { min: 0, max: 500 },
  radius: { min: 0, max: 500 },
  boxWidth: { min: 10, max: 8000 },
} as const;

export function isGradient(fill: TextStyle["fill"]): fill is Gradient {
  return typeof (fill as Partial<Gradient>).from === "object" && typeof (fill as Partial<Gradient>).to === "object";
}

/** The fill's solid color, or the gradient's top color. */
export function fillColor(fill: TextStyle["fill"]): RGBA {
  return isGradient(fill) ? fill.from : fill;
}

/**
 * `value` in `mode` (spec §10.1 text case). Title case capitalizes the first letter of each word (after
 * a space, a dash, a slash or an opening bracket or quote; not after an apostrophe: "don't") and
 * lowers the rest.
 */
export function applyTextCase(value: string, mode: TextCase): string {
  switch (mode) {
    case "none":
      return value;
    case "upper":
      return value.toLocaleUpperCase();
    case "lower":
      return value.toLocaleLowerCase();
    case "title":
      return value.toLocaleLowerCase().replace(/(^|[\s\-–—/(["“‘])(\p{L})/gu, (_match, before: string, letter: string) => before + letter.toLocaleUpperCase());
  }
}

/** The first line of the text as shown (case applied): the timeline's text clip body (spec §6.4). */
export function firstLine(content: TextContent, style: Pick<TextStyle, "textCase">): string {
  const end = content.value.indexOf("\n");
  return applyTextCase(end === -1 ? content.value : content.value.slice(0, end), style.textCase);
}

const contentKeys = new WeakMap<TextContent, string>();
const styleKeys = new WeakMap<TextStyle, string>();

/** A string naming the content (value and box), memoized per object (documents are immutable). */
export function contentKey(content: TextContent): string {
  let key = contentKeys.get(content);
  if (key === undefined) {
    key = JSON.stringify([content.value, content.box.mode, content.box.width]);
    contentKeys.set(content, key);
  }
  return key;
}

/** A string naming every style value, memoized per object; equal styles give equal keys. */
export function styleKey(style: TextStyle): string {
  let key = styleKeys.get(style);
  if (key === undefined) {
    const { stroke: k, shadow: h, background: b } = style;
    const color = (c: RGBA) => [c.r, c.g, c.b, c.a];
    const fill = isGradient(style.fill) ? [color(style.fill.from), color(style.fill.to)] : color(style.fill);
    key = JSON.stringify([
      style.fontFamily,
      style.fontWeight,
      style.italic,
      style.fontSize,
      fill,
      [k.enabled, k.width, color(k.color)],
      [h.enabled, h.x, h.y, h.blur, color(h.color)],
      [b.enabled, color(b.color), b.paddingX, b.paddingY, b.radius, b.mode],
      style.textCase,
      style.letterSpacing,
      style.lineHeight,
      style.align,
      style.verticalAnchor,
    ]);
    styleKeys.set(style, key);
  }
  return key;
}
