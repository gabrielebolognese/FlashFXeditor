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

/** The frame side (the short one) the Title and Subtitle sizes are given for: a 1080 x 1920 short. */
export const TEXT_REFERENCE_SIDE = 1080;

/**
 * The default Title (spec §10.2 "default Title preset"; hardcoded until the presets, Batch 30): heavy
 * white Inter at 120 px, centered, a soft shadow.
 */
export const DEFAULT_TITLE_STYLE: TextStyle = {
  ...DEFAULT_TEXT_STYLE,
  fontWeight: 800,
  fontSize: 120,
  lineHeight: 1.1,
  shadow: { enabled: true, x: 0, y: 6, blur: 20, color: { r: 0, g: 0, b: 0, a: 0.5 } },
};

/**
 * The default Subtitle (spec §10.2: smaller, a background box): semibold white Inter at 56 px on a
 * dark rounded box per line, wrapping at 900 px; anchored at the bottom, so more lines grow upwards
 * from the lower third.
 */
export const DEFAULT_SUBTITLE_STYLE: TextStyle = {
  ...DEFAULT_TEXT_STYLE,
  fontWeight: 600,
  fontSize: 56,
  lineHeight: 1.3,
  background: { enabled: true, color: { r: 0, g: 0, b: 0, a: 0.7 }, paddingX: 24, paddingY: 10, radius: 14, mode: "line" },
  verticalAnchor: "bottom",
};

export const DEFAULT_SUBTITLE_BOX: TextBox = { mode: "fixed", width: 900 };

export type TitleKind = "title" | "subtitle";

/**
 * Content, style and box of a new Title or Subtitle on a `frame`-sized project (sizes scaled from
 * TEXT_REFERENCE_SIDE). TODO(batch 30): the default Title and Subtitle presets chosen in the Presets tab.
 */
export function titleDefaults(kind: TitleKind, frame: { width: number; height: number }): { value: string; style: TextStyle; box: TextBox } {
  const k = Math.min(frame.width, frame.height) / TEXT_REFERENCE_SIDE;
  const style = kind === "title" ? DEFAULT_TITLE_STYLE : DEFAULT_SUBTITLE_STYLE;
  const box = kind === "title" ? DEFAULT_TEXT_BOX : { ...DEFAULT_SUBTITLE_BOX, width: Math.round((frame.width * DEFAULT_SUBTITLE_BOX.width) / TEXT_REFERENCE_SIDE) };
  return { value: kind === "title" ? "Title" : "Subtitle", style: k > 0 && k !== 1 ? scaleTextStyle(style, k) : structuredClone(style), box: { ...box } };
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/**
 * `style` `k` times as large (spec §7.3: a text's corner handles size it "keeping layout"): the font
 * size (0.1 px steps, within the limits) and every px value with it (letter spacing, stroke, shadow,
 * background padding and radius), so the text looks the same at another size.
 */
export function scaleTextStyle(style: TextStyle, k: number): TextStyle {
  const { fontSize } = TEXT_LIMITS;
  const size = Math.min(fontSize.max, Math.max(fontSize.min, round1(style.fontSize * k)));
  const f = size / style.fontSize;
  return {
    ...style,
    fontSize: size,
    letterSpacing: round1(style.letterSpacing * f),
    stroke: { ...style.stroke, color: { ...style.stroke.color }, width: round1(style.stroke.width * f) },
    shadow: { ...style.shadow, color: { ...style.shadow.color }, x: round1(style.shadow.x * f), y: round1(style.shadow.y * f), blur: round1(style.shadow.blur * f) },
    background: {
      ...style.background,
      color: { ...style.background.color },
      paddingX: Math.round(style.background.paddingX * f),
      paddingY: Math.round(style.background.paddingY * f),
      radius: Math.round(style.background.radius * f),
    },
  };
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
