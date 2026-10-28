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
import type { CaptionStyle, CaptionWord, RGBA, TextContent, TextStyle } from "../../core/document/types.js";
import { wordRanges } from "../../text/captions.js";
import { applyTextCase, scaleTextStyle, textContent } from "../../text/style.js";
import { HIGHLIGHT_SLOT } from "../compositor/drawList.js";
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
  const colored = mode === "color" || mode === "colorAndScale" || mode === "progressive" || mode === "reveal";
  return { content, style, inactive: { ...style, fill: inactiveColor }, active: colored ? { ...style, fill: color } : style };
}

/** A timed word's place in the word atlas: units [from, to), the box behind it, its middle (content px). */
export interface HighlightUnit {
  from: number;
  to: number;
  box: Rect;
  /** The word's box in `word` background mode, before the style's padding: its advance and the top and height of its line. */
  ink: Rect;
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
    const line = layout.lines[units[from]?.line ?? 0];
    return { from, to, box, ink: { x: x0, y: line?.top ?? y0, width: x1 - x0, height: layout.lineHeight }, ox: box.x + box.width / 2, oy: box.y + box.height / 2 };
  });
}

// --- Word states (spec §21.8, Batch 59) ------------------------------------------------------------

/** One look of the words in a cue's word atlas: `slot` keys its raster (`clipId + slot`). */
export interface WordPaint {
  slot: string;
  style: TextStyle;
}

/**
 * What a cue's words are drawn from, once per cue and style (the compositor only indexes it per frame):
 * - `paints`: the looks of the words; [0] is the layer's own (the inactive look), the others differ in
 *   the fill: the highlight color, the emphasis color, a word's own color.
 * - `lit` and `dim`, per word: the paint of the word once it is spoken (and while it is the active word)
 *   and before (or when it is not the active one, in the modes that color only the active word).
 *   A word's own color wins over the emphasis color, which wins over the highlight and inactive colors.
 * - `boxes`, per word: its box in the `word` background mode (null for a word the text does not show).
 * - `stateful`: whether the words need their own states at every frame (the progressive and reveal
 *   modes, word colors, emphasis, word boxes) and not only the active word's.
 */
export interface CaptionPlan {
  units: readonly (HighlightUnit | null)[];
  paints: readonly WordPaint[];
  lit: readonly number[];
  dim: readonly number[];
  boxes: readonly (Rect | null)[] | null;
  stateful: boolean;
}

/** Whether a cue's words change anything besides the highlight mode's: their own colors or emphasis. */
export function hasWordPaint(words: readonly CaptionWord[] | undefined): boolean {
  return words !== undefined && words.some((word) => word.emphasis === true || word.color !== undefined);
}

const rgbaKey = (c: RGBA) => `${c.r},${c.g},${c.b},${c.a}`;

const plans = new WeakMap<readonly CaptionWord[], { layout: TextLayout; look: CaptionLook; style: CaptionStyle; plan: CaptionPlan }>();

/** The plan of `words` laid out as `layout` in `style` (one per words object, layout, look and style). */
export function captionPlan(layout: TextLayout, look: CaptionLook, style: CaptionStyle, words: readonly CaptionWord[]): CaptionPlan {
  const memo = plans.get(words);
  if (memo && memo.layout === layout && memo.look === look && memo.style === style) return memo.plan;
  const plan = makePlan(layout, look, style, words);
  plans.set(words, { layout, look, style, plan });
  return plan;
}

function makePlan(layout: TextLayout, look: CaptionLook, style: CaptionStyle, words: readonly CaptionWord[]): CaptionPlan {
  const { mode, color, inactiveColor, emphasisColor } = style.highlight;
  const units = highlightUnits(layout, look.content, look.style, words);
  const coloredActive = mode === "color" || mode === "colorAndScale" || mode === "progressive" || mode === "reveal";
  // `null`: the text's own fill.
  const baseFill: RGBA | null = mode === "none" ? null : inactiveColor;
  const keyOf = (fill: RGBA | null) => (fill ? rgbaKey(fill) : "text");
  const baseKey = keyOf(baseFill);
  const paints: WordPaint[] = [{ slot: "", style: look.inactive }];
  const index = new Map<string, number>([[baseKey, 0]]);
  const paintOf = (fill: RGBA | null, slot?: string): number => {
    const key = keyOf(fill);
    let found = index.get(key);
    if (found === undefined) {
      found = paints.length;
      index.set(key, found);
      paints.push({ slot: slot ?? `#p${found}`, style: fill ? { ...look.style, fill } : look.style });
    }
    return found;
  };
  const lit: number[] = [];
  const dim: number[] = [];
  for (const word of words) {
    const own = word.color ?? (word.emphasis === true ? (emphasisColor ?? color) : null);
    lit.push(own ? paintOf(own) : paintOf(coloredActive ? color : null, HIGHLIGHT_SLOT));
    dim.push(own ? paintOf(own) : 0);
  }
  const bg = look.style.background;
  const boxes = bg.enabled && bg.mode === "word" ? units.map((unit) => (unit ? { x: unit.ink.x - bg.paddingX, y: unit.ink.y - bg.paddingY, width: unit.ink.width + 2 * bg.paddingX, height: unit.ink.height + 2 * bg.paddingY } : null)) : null;
  return { units, paints, lit, dim, boxes, stateful: mode === "progressive" || mode === "reveal" || boxes !== null || hasWordPaint(words) };
}
