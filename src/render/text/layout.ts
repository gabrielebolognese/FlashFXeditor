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
import type { TextContent, TextSpan, TextSpanStyle, TextStyle } from "../../core/document/types.js";
import { fontShorthand } from "../../text/fonts.js";
import { pieces, runStyle } from "../../text/spans.js";
import { applyTextCase } from "../../text/style.js";

/** A text with styled spans (spec §21.13): the clip's content and its `spans`, what layout and raster take. */
export interface StyledContent extends TextContent {
  spans?: readonly TextSpan[] | undefined;
}

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
  /** Forgets what it cached (a font loaded: the same font string may measure differently now). */
  reset?(): void;
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
  /**
   * Where it sits in the whole text as drawn (case applied, line breaks included): `text` is
   * `shown.slice(start, end)`; the spaces a wrap dropped come right after `end` (inline editing).
   */
  start: number;
  end: number;
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
  /** The font stack after the family (run fonts of spans are built with it). */
  fallback: string;
  /** The spans in effect (offsets into the text as drawn), undefined when there are none. */
  spans: readonly TextSpan[] | undefined;
  /** Boxes spans draw outside the glyphs (highlights, underlines, strikes), so the raster covers them. */
  spanBoxes: readonly Rect[];
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
export function wrapParagraph(paragraph: string, width: number, measure: (text: string, at: number) => number): string[] {
  if (paragraph === "") return [""];
  const lines: string[] = [];
  let line = "";
  /** Where `line` starts in the paragraph (`measure` is told, so a run's own font is measured). */
  let lineAt = 0;
  /** Starts a line with `word` (at `at` in the paragraph), broken between characters while it is wider than the box. */
  const start = (word: string, at: number) => {
    let chars = Array.from(word);
    let base = at;
    while (chars.length > 1 && measure(chars.join(""), base) > width) {
      let count = 1;
      while (count < chars.length - 1 && measure(chars.slice(0, count + 1).join(""), base) <= width) count += 1;
      const piece = chars.slice(0, count).join("");
      lines.push(piece);
      base += piece.length;
      chars = chars.slice(count);
    }
    line = chars.join("");
    lineAt = base;
  };
  let index = 0;
  for (const token of paragraph.split(/(\s+)/)) {
    if (token === "") continue;
    const at = index;
    index += token.length;
    if (/^\s+$/.test(token)) {
      // Spaces stay on the line they follow (a paragraph's indent too); a wrap drops them.
      if (line !== "" || lines.length === 0) {
        if (line === "") lineAt = at;
        line += token;
      }
      continue;
    }
    if (line === "") start(token, at);
    else if (measure(line + token, lineAt) <= width) line += token;
    else {
      lines.push(line.trimEnd());
      start(token, at);
    }
  }
  lines.push(line.trimEnd());
  return lines;
}

/** Underline and strike geometry, as fractions of the font size (offset from the baseline, thickness). */
export const UNDERLINE_OFFSET = 0.1;
export const UNDERLINE_THICKNESS = 0.06;
export const STRIKE_OFFSET = 0.3;

/**
 * The metrics of `text`, which starts at offset `abs` of the text as drawn: one run, or (spans) one run per
 * style piece, each measured in its own font and laid after the one before (kerning across a boundary is not applied).
 */
export function measureStyled(measurer: TextMeasurer, spans: readonly TextSpan[] | undefined, style: TextStyle, fallback: string, size: number, spacing: number, text: string, abs: number): RunMetrics {
  if (!spans || text === "") return measurer.measure(text, fontShorthand(style, size, fallback), size, spacing);
  const cuts = pieces(spans, abs, abs + text.length);
  if (cuts.length === 0) return measurer.measure(text, fontShorthand(style, size, fallback), size, spacing);
  let total: RunMetrics | null = null;
  let x = 0;
  for (const cut of cuts) {
    const font = fontShorthand(runStyle(style, cut.span), size, fallback);
    const m = measurer.measure(text.slice(cut.from, cut.to), font, size, spacing);
    total = total
      ? { width: total.width + m.width, left: Math.max(total.left, m.left - x), right: Math.max(total.right, x + m.right), ascent: Math.max(total.ascent, m.ascent), descent: Math.max(total.descent, m.descent) }
      : m;
    x += m.width;
  }
  return total as RunMetrics;
}

/** The boxes a span draws around a run starting at `x` and `width` wide on `baseline` (highlight behind, underline, strike). */
export function decorationBoxes(span: TextSpanStyle, x: number, width: number, baseline: number, ascent: number, descent: number, size: number): { highlight?: Rect; underline?: Rect; strike?: Rect } {
  const thick = Math.max(1, size * UNDERLINE_THICKNESS);
  const out: { highlight?: Rect; underline?: Rect; strike?: Rect } = {};
  if (span.highlight && span.highlight.a > 0) out.highlight = { x, y: baseline - ascent, width, height: ascent + descent };
  if (span.underline) out.underline = { x, y: baseline + size * UNDERLINE_OFFSET, width, height: thick };
  if (span.strike) out.strike = { x, y: baseline - size * STRIKE_OFFSET - thick / 2, width, height: thick };
  return out;
}

/** The layout of `content` in `style`, measured by `measurer`; `fallback` is the font stack after the family. */
export function layoutText(content: StyledContent, style: TextStyle, measurer: TextMeasurer, fallback: string): TextLayout {
  const size = style.fontSize;
  const spacing = style.letterSpacing;
  const font = fontShorthand(style, size, fallback);
  const visual = (text: string, metrics: RunMetrics) => Math.max(0, metrics.width - (text === "" ? 0 : spacing));
  const value = applyTextCase(content.value, style.textCase);
  // Spans hold offsets into the text as typed: a case that changes its length (none does today) drops them.
  const spans = content.spans && content.spans.length > 0 && value.length === content.value.length ? content.spans : undefined;
  const measureAt = (text: string, abs: number) => measureStyled(measurer, spans, style, fallback, size, spacing, text, abs);
  const measureWidth = (text: string, abs: number) => visual(text, measureAt(text, abs));
  const fixed = content.box.mode === "fixed";
  const wrapWidth = Math.max(MIN_SIDE, content.box.width);
  const texts: string[] = [];
  const starts: number[] = [];
  let offset = 0;
  for (const paragraph of value.split("\n")) {
    if (fixed) {
      // Wrapped lines are the paragraph's pieces in order, only the spaces at a wrap left out.
      let at = 0;
      for (const line of wrapParagraph(paragraph, wrapWidth, (text, at) => measureWidth(text, offset + at))) {
        const found = paragraph.indexOf(line, at);
        const start = found === -1 ? at : found;
        texts.push(line);
        starts.push(offset + start);
        at = start + line.length;
      }
    } else {
      texts.push(paragraph);
      starts.push(offset);
    }
    offset += paragraph.length + 1;
  }

  const metrics = texts.map((text, i) => (text === "" ? null : measureAt(text, starts[i] as number)));
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
    const start = starts[i] as number;
    lines.push({ text, start, end: start + text.length, x, baseline, width, top, ink });
  }

  const backgrounds: Rect[] = [];
  if (bg.enabled) {
    if (bg.mode === "block") backgrounds.push({ x: 0, y: 0, width: blockWidth + 2 * padX, height: blockHeight + 2 * padY });
    else if (bg.mode === "word") {
      // One box per word (Batch 59): the word's advance, the line's slot, padded.
      const advance = (line: TextLine, from: number, to: number) => (to <= from ? 0 : measureAt(line.text.slice(from, to), line.start + from).width);
      for (const line of lines) {
        const pattern = /\S+/g;
        for (let match = pattern.exec(line.text); match; match = pattern.exec(line.text)) {
          const x0 = line.x + advance(line, 0, match.index);
          const width = Math.max(0, advance(line, match.index, match.index + match[0].length) - spacing);
          backgrounds.push({ x: x0 - padX, y: line.top - padY, width: width + 2 * padX, height: slot + 2 * padY });
        }
      }
    } else for (const line of lines) if (line.text.trim() !== "") backgrounds.push({ x: line.x - padX, y: line.top - padY, width: line.width + 2 * padX, height: slot + 2 * padY });
  }

  // Highlights, underlines and strikes of spans (they reach past the ink: the raster must cover them).
  const spanBoxes: Rect[] = [];
  if (spans) {
    for (const line of lines) {
      for (const cut of pieces(spans, line.start, line.end)) {
        if (!cut.span || (!cut.span.highlight && !cut.span.underline && !cut.span.strike)) continue;
        const x = line.x + (cut.from > 0 ? measureAt(line.text.slice(0, cut.from), line.start).width : 0);
        const width = measureAt(line.text.slice(cut.from, cut.to), line.start + cut.from).width;
        const boxes = decorationBoxes(cut.span, x, width, line.baseline, ascent, descent, size);
        if (boxes.highlight) spanBoxes.push(boxes.highlight);
        if (boxes.underline) spanBoxes.push(boxes.underline);
        if (boxes.strike) spanBoxes.push(boxes.strike);
      }
    }
  }

  let raster: Rect | null = null;
  for (const box of backgrounds) raster = union(raster, box);
  for (const box of spanBoxes) raster = union(raster, box);
  // The box's shadow (spec §21.7) reaches past the boxes by its offset and blur.
  const boxShadow = bg.shadow;
  if (bg.enabled && boxShadow && boxShadow.enabled && boxShadow.color.a > 0) {
    for (const box of backgrounds) raster = union(raster, grow({ ...box, x: box.x + boxShadow.x, y: box.y + boxShadow.y }, Math.max(0, boxShadow.blur) * SHADOW_REACH));
  }
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

  return { font, fallback, spans, spanBoxes, width: blockWidth + 2 * padX, height: blockHeight + 2 * padY, block, lineHeight: slot, lines, backgrounds, glyphs, raster };
}
