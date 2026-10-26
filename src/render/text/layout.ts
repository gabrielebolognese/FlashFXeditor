// Text layout (spec §10.1): the lines of a text clip and every box the raster, the canvas and the
// compositor need, in content px (the layer's own px: the transform maps them onto the frame).
// - Lines: explicit `\n` breaks; in a `fixed` box words wrap at `box.width` (greedy, measured as the
//   line grows so kerning and letter spacing count; a word wider than the box breaks between
//   characters; spaces at a wrap are dropped). An `auto` box fits its widest line.
// - Each line sits in a slot `fontSize * lineHeight` tall, its em box centered in it; lines align
//   left, center or right in the block. The case (`textCase`) applies first.
// - The content box is the block, grown by the background padding while the background is on (the
//   box the gizmo shows and Fit / Center use); background boxes are one per line (`line`) or the
//   content box (`block`).
// - Glyph bounds (`glyphs`): each line's ink box, from the measured actual bounds: canvas hit
//   testing (§7.2) and smart guides use them.
// - The raster rect covers everything drawn: background boxes, the ink grown by the outside stroke,
//   and its shadow (offset, grown by the blur), rounded out to whole px with a pixel to spare.
// Measuring goes through a `TextMeasurer` (the canvas one in the browser, a fake in tests); each final
// line is measured once more for its width and ink.
import type { TextContent, TextStyle } from "../../core/document/types.js";
import { fontShorthand } from "../../text/fonts.js";
import { applyTextCase } from "../../text/style.js";

/** A measured run of text, from the alphabetic baseline at x = 0 (canvas `TextMetrics`). */
export interface RunMetrics {
  /** Advance width (letter spacing after every character included, as the canvas measures it). */
  width: number;
  /** Ink extent left of x = 0 and right of it, above and below the baseline. */
  left: number;
  right: number;
  ascent: number;
  descent: number;
}

export interface TextMeasurer {
  /** `text` drawn with the `font` shorthand at `size` px with `letterSpacing` px. */
  measure(text: string, font: string, size: number, letterSpacing: number): RunMetrics;
  /** The font's ascent and descent (its em box around the baseline) at `size` px. */
  fontMetrics(font: string, size: number): { ascent: number; descent: number };
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextLine {
  /** The line as drawn (case applied, wrap spaces dropped). */
  text: string;
  /** Left edge of its advance box and its baseline, in content px. */
  x: number;
  baseline: number;
  /** Visual width: the advance without the trailing letter spacing. */
  width: number;
  /** Top of its slot. */
  top: number;
  /** Its ink box (glyph bounds), or null for an empty line. */
  ink: Rect | null;
}

export interface TextLayout {
  /** The `font` shorthand at the layout size. */
  font: string;
  /** Content box (the layer's own size). */
  width: number;
  height: number;
  /** The text block inside it (the content box less the background padding). */
  block: Rect;
  /** Slot height of a line. */
  lineHeight: number;
  lines: readonly TextLine[];
  /** Background boxes (empty while the background is off). */
  backgrounds: readonly Rect[];
  /** Each line's ink box (glyph bounds), empty lines left out. */
  glyphs: readonly Rect[];
  /** Everything drawn, or null when nothing is (empty text, no background). */
  raster: Rect | null;
}

/** The smallest box side, so an empty text keeps a box (Batch 29 edits into it). */
const MIN_SIDE = 1;

/** How far a shadow reaches past its shape, in blurs (the canvas blur's sigma is half the blur: 3 sigma). */
export const SHADOW_REACH = 1.5;

function union(a: Rect | null, b: Rect | null): Rect | null {
  if (!a) return b;
  if (!b) return a;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
}

function grow(rect: Rect, by: number): Rect {
  return { x: rect.x - by, y: rect.y - by, width: rect.width + 2 * by, height: rect.height + 2 * by };
}

/** The wrapped lines of one paragraph at `width` px (`measure` gives a run's visual width). */
export function wrapParagraph(paragraph: string, width: number, measure: (text: string) => number): string[] {
  if (paragraph === "") return [""];
  const lines: string[] = [];
  let line = "";
  /** Starts a line with `word`, broken between characters while it is wider than the box. */
  const start = (word: string) => {
    let chars = Array.from(word);
    while (chars.length > 1 && measure(chars.join("")) > width) {
      let count = 1;
      while (count < chars.length - 1 && measure(chars.slice(0, count + 1).join("")) <= width) count += 1;
      lines.push(chars.slice(0, count).join(""));
      chars = chars.slice(count);
    }
    line = chars.join("");
  };
  for (const token of paragraph.split(/(\s+)/)) {
    if (token === "") continue;
    if (/^\s+$/.test(token)) {
      // Spaces stay on the line they follow (a paragraph's indent too); a wrap drops them.
      if (line !== "" || lines.length === 0) line += token;
      continue;
    }
    if (line === "") start(token);
    else if (measure(line + token) <= width) line += token;
    else {
      lines.push(line.trimEnd());
      start(token);
    }
  }
  lines.push(line.trimEnd());
  return lines;
}

/** The layout of `content` in `style`, measured by `measurer`; `fallback` is the font stack after the family. */
export function layoutText(content: TextContent, style: TextStyle, measurer: TextMeasurer, fallback: string): TextLayout {
  const size = style.fontSize;
  const spacing = style.letterSpacing;
  const font = fontShorthand(style, size, fallback);
  const visual = (text: string, metrics: RunMetrics) => Math.max(0, metrics.width - (text === "" ? 0 : spacing));
  const measureWidth = (text: string) => visual(text, measurer.measure(text, font, size, spacing));

  const value = applyTextCase(content.value, style.textCase);
  const fixed = content.box.mode === "fixed";
  const wrapWidth = Math.max(MIN_SIDE, content.box.width);
  const texts: string[] = [];
  for (const paragraph of value.split("\n")) {
    if (fixed) texts.push(...wrapParagraph(paragraph, wrapWidth, measureWidth));
    else texts.push(paragraph);
  }

  const metrics = texts.map((text) => (text === "" ? null : measurer.measure(text, font, size, spacing)));
  const widths = texts.map((text, i) => (metrics[i] ? visual(text, metrics[i] as RunMetrics) : 0));
  const blockWidth = fixed ? wrapWidth : Math.max(MIN_SIDE, ...widths);
  const slot = size * style.lineHeight;
  const blockHeight = Math.max(MIN_SIDE, slot * texts.length);
  const { ascent, descent } = measurer.fontMetrics(font, size);
  const bg = style.background;
  const padX = bg.enabled ? Math.max(0, bg.paddingX) : 0;
  const padY = bg.enabled ? Math.max(0, bg.paddingY) : 0;
  const block: Rect = { x: padX, y: padY, width: blockWidth, height: blockHeight };

  const lines: TextLine[] = [];
  const glyphs: Rect[] = [];
  let inkBounds: Rect | null = null;
  for (let i = 0; i < texts.length; i++) {
    const text = texts[i] as string;
    const width = widths[i] as number;
    const offset = style.align === "left" ? 0 : style.align === "right" ? blockWidth - width : (blockWidth - width) / 2;
    const x = padX + offset;
    const top = padY + i * slot;
    const baseline = top + (slot - (ascent + descent)) / 2 + ascent;
    const m = metrics[i];
    const ink = m && m.left + m.right > 0 && m.ascent + m.descent > 0 ? { x: x - m.left, y: baseline - m.ascent, width: m.left + m.right, height: m.ascent + m.descent } : null;
    if (ink) {
      glyphs.push(ink);
      inkBounds = union(inkBounds, ink);
    }
    lines.push({ text, x, baseline, width, top, ink });
  }

  const backgrounds: Rect[] = [];
  if (bg.enabled) {
    if (bg.mode === "block") backgrounds.push({ x: 0, y: 0, width: blockWidth + 2 * padX, height: blockHeight + 2 * padY });
    else for (const line of lines) if (line.text.trim() !== "") backgrounds.push({ x: line.x - padX, y: line.top - padY, width: line.width + 2 * padX, height: slot + 2 * padY });
  }

  let raster: Rect | null = null;
  for (const box of backgrounds) raster = union(raster, box);
  if (inkBounds) {
    const stroke = style.stroke.enabled ? Math.max(0, style.stroke.width) : 0;
    const stroked = grow(inkBounds, stroke);
    raster = union(raster, stroked);
    const shadow = style.shadow;
    if (shadow.enabled && shadow.color.a > 0) raster = union(raster, grow({ ...stroked, x: stroked.x + shadow.x, y: stroked.y + shadow.y }, Math.max(0, shadow.blur) * SHADOW_REACH));
  }
  if (raster) {
    // Whole px, one to spare for antialiasing.
    const x = Math.floor(raster.x) - 1;
    const y = Math.floor(raster.y) - 1;
    raster = { x, y, width: Math.ceil(raster.x + raster.width) + 1 - x, height: Math.ceil(raster.y + raster.height) + 1 - y };
  }

  return { font, width: blockWidth + 2 * padX, height: blockHeight + 2 * padY, block, lineHeight: slot, lines, backgrounds, glyphs, raster };
}
