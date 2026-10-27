// Caret geometry of inline text editing (spec §7.7): where the caret and the selection sit in a text
// layout, measured the way the rasterizer draws the glyphs, so the caret lands on them at any zoom.
// - Indices are UTF-16 offsets into the clip's value (the editing textarea's); the layout's lines hold
//   the text as drawn (case applied). A case that changes lengths ("ß" upper-cased is "SS") maps
//   grapheme by grapheme (`caseMap`).
// - Caret stops are the grapheme boundaries of each line. A stop's x is where the next grapheme's
//   advance starts (the pair before it measured together, so kerning counts), less half the letter
//   spacing (the caret sits in the gap); the line's ends are its advance box's. Lines are measured at
//   the raster scale (font size times the scale, then divided back) and aligned in the block by their
//   width at that size, as raster.ts aligns its runs.
// - An index on a wrap goes to the next line (downstream) unless `upstream` asks for the end of the
//   line before (End, a click right of a wrapped line); the spaces a wrap dropped sit at the end of
//   their line.
// Pure apart from the measurer (the canvas one in the browser, a fake in tests).
import type { TextStyle } from "../../core/document/types.js";
import { fontShorthand } from "../../text/fonts.js";
import { applyTextCase } from "../../text/style.js";
import type { Rect, TextLayout, TextLine, TextMeasurer } from "./layout.js";

let segmenter: Intl.Segmenter | null = null;

/** The grapheme boundaries of `text` (0 and its length included). */
export function graphemeBoundaries(text: string): number[] {
  segmenter ??= new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const out: number[] = [];
  for (const segment of segmenter.segment(text)) out.push(segment.index);
  out.push(text.length);
  return out;
}

/** The nearest grapheme boundary at or before `index`. */
export function graphemeFloor(text: string, index: number): number {
  const boundaries = graphemeBoundaries(text);
  let out = 0;
  for (const b of boundaries) if (b <= index) out = b;
  return out;
}

/** Index maps between a value and the text it shows in `textCase`. */
export interface CaseMap {
  shown: string;
  toShown(index: number): number;
  toSource(index: number): number;
}

/** The maps of `value` shown in `textCase` (identities when the case keeps every length). */
export function caseMap(value: string, textCase: TextStyle["textCase"]): CaseMap {
  const shown = applyTextCase(value, textCase);
  if (shown.length === value.length) return { shown, toShown: (i) => clamp(i, 0, shown.length), toSource: (i) => clamp(i, 0, value.length) };
  // Grapheme by grapheme: the case of a prefix is the prefix of the case (title case looks back only).
  const source = graphemeBoundaries(value);
  const target = source.map((b) => applyTextCase(value.slice(0, b), textCase).length);
  const map = (from: number[], to: number[], index: number) => {
    let k = 0;
    while (k + 1 < from.length && (from[k + 1] as number) <= index) k += 1;
    return to[k] as number;
  };
  return { shown, toShown: (i) => map(source, target, i), toSource: (i) => map(target, source, i) };
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** A line's caret stops: shown offsets (into the whole text) and their x in content px. */
interface LineStops {
  offsets: number[];
  xs: number[];
}

const stopCache = new WeakMap<TextLayout, Map<string, LineStops[]>>();

/** Each line's caret stops at raster `scale` (cached per layout, style and scale). */
function stopsOf(layout: TextLayout, style: TextStyle, measurer: TextMeasurer, fallback: string, scale: number): LineStops[] {
  let byKey = stopCache.get(layout);
  if (!byKey) {
    byKey = new Map();
    stopCache.set(layout, byKey);
  }
  const s = scale > 0 && Number.isFinite(scale) ? scale : 1;
  const key = `${s}|${style.align}|${style.letterSpacing}|${style.fontSize}`;
  let stops = byKey.get(key);
  if (!stops) {
    const size = style.fontSize * s;
    const spacing = style.letterSpacing * s;
    const font = fontShorthand(style, size, fallback);
    const advance = (text: string) => (text === "" ? 0 : measurer.measure(text, font, size, spacing).width);
    stops = layout.lines.map((line) => lineStops(line, style, advance, spacing, s));
    if (byKey.size > 8) byKey.clear();
    byKey.set(key, stops);
  }
  return stops;
}

function lineStops(line: TextLine, style: TextStyle, advance: (text: string) => number, spacing: number, s: number): LineStops {
  const text = line.text;
  const bounds = graphemeBoundaries(text);
  // The line's width at this size and its left edge, aligned as raster.ts aligns the run.
  const width = text === "" ? 0 : Math.max(0, advance(text) - spacing);
  const left = style.align === "left" ? line.x * s : style.align === "right" ? (line.x + line.width) * s - width : (line.x + line.width / 2) * s - width / 2;
  const offsets: number[] = [];
  const xs: number[] = [];
  bounds.forEach((b, k) => {
    let x: number;
    if (k === 0) x = 0;
    else if (k === bounds.length - 1) x = width;
    else {
      const next = bounds[k + 1] as number;
      x = advance(text.slice(0, next)) - advance(text.slice(b, next)) - spacing / 2;
    }
    offsets.push(line.start + b);
    xs.push((left + x) / s);
  });
  return { offsets, xs };
}

/** What caret queries need: the layout, the style it was laid out in, and the measuring of the raster. */
export interface CaretContext {
  layout: TextLayout;
  style: TextStyle;
  /** The clip's value (the textarea's). */
  value: string;
  measurer: TextMeasurer;
  /** The font stack after the family (layoutCache's fallback). */
  fallback: string;
  /** Raster px per content px the layer is drawn at (its scale bucket). */
  scale: number;
}

/** The caret: its line, x and the top and bottom of the font's em box there, in content px. */
export interface Caret {
  line: number;
  x: number;
  top: number;
  bottom: number;
}

/** The line holding shown offset `j` (the last one starting at or before it; `upstream`: the one ending there). */
function lineAt(layout: TextLayout, j: number, upstream: boolean): number {
  const lines = layout.lines;
  let found = 0;
  for (let i = 0; i < lines.length; i++) if ((lines[i] as TextLine).start <= j) found = i;
  if (upstream && found > 0) {
    const line = lines[found] as TextLine;
    const before = lines[found - 1] as TextLine;
    // A wrap with nothing dropped: the end of the line before is the same offset.
    if (line.start === j && before.end === j) return found - 1;
  }
  return found;
}

/** The x of shown offset `j` on line `index` (clamped to the line: dropped spaces sit at its end). */
function xOn(stops: LineStops, j: number): number {
  const { offsets, xs } = stops;
  if (j <= (offsets[0] as number)) return xs[0] as number;
  for (let k = offsets.length - 1; k >= 0; k--) if ((offsets[k] as number) <= j) return xs[k] as number;
  return xs[0] as number;
}

function emBox(context: CaretContext, line: TextLine): { top: number; bottom: number } {
  const { ascent, descent } = context.measurer.fontMetrics(context.layout.font, context.style.fontSize);
  return { top: line.baseline - ascent, bottom: line.baseline + descent };
}

/** The caret at source `index`. */
export function caretAt(context: CaretContext, index: number, upstream = false): Caret {
  const { layout, style } = context;
  const map = caseMap(context.value, style.textCase);
  const j = map.toShown(index);
  const lineIndex = lineAt(layout, j, upstream);
  const line = layout.lines[lineIndex] as TextLine;
  const stops = stopsOf(layout, style, context.measurer, context.fallback, context.scale)[lineIndex] as LineStops;
  return { line: lineIndex, x: xOn(stops, j), ...emBox(context, line) };
}

/** The selection from `from` to `to` (source indices, either order) as one rect per line it covers, in content px (line slots). */
export function selectionRects(context: CaretContext, from: number, to: number): Rect[] {
  const { layout, style } = context;
  const map = caseMap(context.value, style.textCase);
  const a = map.toShown(Math.min(from, to));
  const b = map.toShown(Math.max(from, to));
  if (a === b) return [];
  const all = stopsOf(layout, style, context.measurer, context.fallback, context.scale);
  // A selection that runs past a line's end over a break or dropped spaces shows a sliver there.
  const sliver = style.fontSize / 4;
  const rects: Rect[] = [];
  layout.lines.forEach((line, i) => {
    const next = layout.lines[i + 1];
    const reach = next ? next.start : Number.POSITIVE_INFINITY;
    if (b <= line.start || a >= reach) return;
    const stops = all[i] as LineStops;
    const x0 = xOn(stops, Math.max(a, line.start));
    const x1 = xOn(stops, Math.min(b, line.end));
    const past = next !== undefined && b > line.end && next.start > line.end;
    const width = x1 - x0 + (past ? sliver : 0);
    if (width <= 0) return;
    rects.push({ x: x0, y: line.top, width, height: layout.lineHeight });
  });
  return rects;
}

/** The source index nearest to content point (`x`, `y`), and whether it is the end of a wrapped line (upstream). */
export function indexAtPoint(context: CaretContext, x: number, y: number): { index: number; upstream: boolean } {
  const { layout, style } = context;
  const lines = layout.lines;
  let lineIndex = 0;
  for (let i = 0; i < lines.length; i++) if ((lines[i] as TextLine).top <= y) lineIndex = i;
  const stops = stopsOf(layout, style, context.measurer, context.fallback, context.scale)[lineIndex] as LineStops;
  let best = 0;
  for (let k = 1; k < stops.xs.length; k++) if (Math.abs((stops.xs[k] as number) - x) < Math.abs((stops.xs[best] as number) - x)) best = k;
  const j = stops.offsets[best] as number;
  const map = caseMap(context.value, style.textCase);
  const line = lines[lineIndex] as TextLine;
  const next = lines[lineIndex + 1];
  return { index: map.toSource(j), upstream: j === line.end && next !== undefined && next.start === j };
}

/**
 * Up (-1) or Down (+1) from source `index` (spec §7.7, through the layout's lines): the index on the
 * line above or below nearest to `goalX` (the caret's x when the vertical moves began). Past the first
 * line it goes to the start, past the last to the end.
 */
export function verticalMove(context: CaretContext, index: number, direction: -1 | 1, goalX: number, upstream = false): { index: number; upstream: boolean } {
  const { layout } = context;
  const from = caretAt(context, index, upstream);
  const target = from.line + direction;
  if (target < 0) return { index: 0, upstream: false };
  if (target >= layout.lines.length) return { index: context.value.length, upstream: false };
  const line = layout.lines[target] as TextLine;
  return indexAtPoint(context, goalX, line.top + layout.lineHeight / 2);
}

/** The start or end of the line the caret at source `index` is on (Home / End). */
export function lineEdge(context: CaretContext, index: number, edge: "start" | "end", upstream = false): { index: number; upstream: boolean } {
  const { layout, style } = context;
  const map = caseMap(context.value, style.textCase);
  const lineIndex = lineAt(layout, map.toShown(index), upstream);
  const line = layout.lines[lineIndex] as TextLine;
  if (edge === "start") return { index: map.toSource(line.start), upstream: false };
  const next = layout.lines[lineIndex + 1];
  return { index: map.toSource(line.end), upstream: next !== undefined && next.start === line.end };
}

/** The word around source `index` (a double-click): the run of word characters, spaces or other characters there; nothing on a line break. */
export function wordAt(value: string, index: number): { from: number; to: number } {
  const at = Math.min(Math.max(0, index), value.length - 1);
  const kind = (i: number) => {
    const c = value.charAt(i);
    return c === "\n" ? 0 : /[\p{L}\p{N}\p{M}_'’]/u.test(c) ? 1 : /\s/.test(c) ? 2 : 3;
  };
  if (at < 0 || kind(at) === 0) return { from: index, to: index };
  const k = kind(at);
  let from = at;
  let to = at + 1;
  while (from > 0 && kind(from - 1) === k) from -= 1;
  while (to < value.length && kind(to) === k) to += 1;
  return { from, to };
}
