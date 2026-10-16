// How a cue is drawn (spec §10.5): its text laid out in the caption track's style, and what its word
// highlight draws from. Derived caches (spec §3.3), keyed by the immutable style objects and texts, so
// an unchanged cue is a couple of lookups (the compositor allocates nothing per frame).
// - `captionLook`: the content box and text style of a cue. Short cues get an auto box (the
//   background fits the text); a cue wider than the max width wraps there; a cue with more lines than
//   the max is drawn smaller (10% steps, down to half size) until it fits. With a word highlight on,
//   the inactive words are drawn in the inactive color, and the active word in the highlight color
//   (color modes) or the text's own fill (scale, background).
// - `highlightUnits`: for each timed word, the units of the layout's word atlas it covers (words are
//   found in the shown text, case applied; a word over several atlas units covers them all), the box
//   behind it (its advance and em box, padded) and its middle (what a scale highlight grows about).
import type { CaptionStyle, CaptionWord, TextContent, TextStyle } from "../../core/document/types.js";
import { wordRanges } from "../../text/captions.js";
import { applyTextCase, scaleTextStyle, textContent } from "../../text/style.js";
import { layoutUnits } from "./animUnits.js";
import type { Rect, TextLayout } from "./layout.js";
import { currentMeasurer, textLayout, textLayoutVersion } from "./layoutCache.js";

/** How much a scale highlight grows the active word (content, not UI). */
export const HIGHLIGHT_SCALE = 1.15;
/** The highlight box around the active word, in font sizes (content, not UI). */
export const HIGHLIGHT_PAD_X = 0.12;
export const HIGHLIGHT_PAD_Y = 0.06;
/** The smallest a cue is drawn to fit its max lines, as a share of the style's size. */
const MIN_FIT = 0.5;
const FIT_STEP = 0.9;
/** Cached looks per style (texts typed in the cue list come and go). */
const MAX_LOOKS = 512;

export interface CaptionLook {
  content: TextContent;
  /** The style the cue is drawn in (sized to fit its max lines). */
  style: TextStyle;
  /** With a word highlight: the style of the other words, and of the active one. */
  inactive: TextStyle;
  active: TextStyle;
}

const looks = new WeakMap<CaptionStyle, { version: number; byText: Map<string, CaptionLook> }>();

/** The look of a cue showing `text` in `style` (cached per style and text). */
export function captionLook(text: string, style: CaptionStyle): CaptionLook {
  const version = textLayoutVersion();
  let entry = looks.get(style);
  if (!entry || entry.version !== version) {
    entry = { version, byText: new Map() };
    looks.set(style, entry);
  }
  let look = entry.byText.get(text);
  if (!look) {
    if (entry.byText.size >= MAX_LOOKS) entry.byText.clear();
    look = fitCaption(text, style);
    entry.byText.set(text, look);
  }
  return look;
}

function fitCaption(text: string, caption: CaptionStyle): CaptionLook {
  const maxWidth = Math.max(1, caption.maxWidth);
  const maxLines = Math.max(1, Math.floor(caption.maxLines));
  let content = textContent(text, { mode: "auto", width: maxWidth });
  let style = caption.text;
  let layout = textLayout(content, style);
  if (layout.block.width > maxWidth || layout.lines.length > maxLines) {
    content = textContent(text, { mode: "fixed", width: maxWidth });
    layout = textLayout(content, style);
    for (let k = FIT_STEP; layout.lines.length > maxLines && k >= MIN_FIT - 1e-9; k *= FIT_STEP) {
      style = scaleTextStyle(caption.text, k);
      layout = textLayout(content, style);
    }
  }
  const { mode, color, inactiveColor } = caption.highlight;
  if (mode === "none") return { content, style, inactive: style, active: style };
  const colored = mode === "color" || mode === "colorAndScale";
  return { content, style, inactive: { ...style, fill: inactiveColor }, active: colored ? { ...style, fill: color } : style };
}

/** A timed word's place in the word atlas: units [from, to), the box behind it, its middle (content px). */
export interface HighlightUnit {
  from: number;
  to: number;
  box: Rect;
  ox: number;
  oy: number;
}

const unitCache = new WeakMap<TextLayout, WeakMap<readonly CaptionWord[], readonly (HighlightUnit | null)[]>>();

/** For each of `words`, where it is in `layout`'s word atlas (null for a word the text does not show). */
export function highlightUnits(layout: TextLayout, content: TextContent, style: TextStyle, words: readonly CaptionWord[]): readonly (HighlightUnit | null)[] {
  let byWords = unitCache.get(layout);
  if (!byWords) {
    byWords = new WeakMap();
    unitCache.set(layout, byWords);
  }
  let found = byWords.get(words);
  if (!found) {
    found = mapWords(layout, content, style, words);
    byWords.set(words, found);
  }
  return found;
}

function mapWords(layout: TextLayout, content: TextContent, style: TextStyle, words: readonly CaptionWord[]): (HighlightUnit | null)[] {
  const shown = applyTextCase(content.value, style.textCase);
  const ranges = wordRanges(shown, words.map((word) => ({ text: applyTextCase(word.text, style.textCase) })));
  const units = layoutUnits(layout, style, "word");
  const measurer = currentMeasurer();
  const size = style.fontSize;
  const { ascent, descent } = measurer.fontMetrics(layout.font, size);
  const padX = size * HIGHLIGHT_PAD_X;
  const padY = size * HIGHLIGHT_PAD_Y;
  return ranges.map((range) => {
    if (!range) return null;
    let from = -1;
    let to = -1;
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    units.forEach((unit, i) => {
      const start = (layout.lines[unit.line]?.start ?? 0) + unit.offset;
      if (start + unit.text.length <= range[0] || start >= range[1]) return;
      if (from === -1) from = i;
      to = i + 1;
      x0 = Math.min(x0, unit.x);
      x1 = Math.max(x1, unit.x + Math.max(0, measurer.measure(unit.text, layout.font, size, style.letterSpacing).width - style.letterSpacing));
      y0 = Math.min(y0, unit.baseline - ascent);
      y1 = Math.max(y1, unit.baseline + descent);
    });
    if (from === -1) return null;
    const box = { x: x0 - padX, y: y0 - padY, width: x1 - x0 + 2 * padX, height: y1 - y0 + 2 * padY };
    return { from, to, box, ox: box.x + box.width / 2, oy: box.y + box.height / 2 };
  });
}
