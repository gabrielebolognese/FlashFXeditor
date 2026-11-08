// Styled spans of a text clip (spec §21.13, Batch 67): pure functions over `TextSpan[]`, the sorted,
// non-overlapping runs of `[start, end)` UTF-16 offsets into `text.value`.
// - `normalizeSpans`: repair (sorted, clamped, empty and unstyled runs dropped,
//   neighbors with the same style merged).
// - `editSpans`: keeps spans on their words when the text changes (typing inside or at the end of a span
//   extends it, a replacement inside one keeps it, deleting shrinks or removes it).
// - `applySpanStyle` / `clearSpanStyles` / `rangeHas`: what the format bar does to a selection.
// - `pieces`: a line cut at the span boundaries, what layout and raster draw run by run.
import type { TextSpan, TextSpanStyle, TextStyle } from "../core/document/types.js";

const STYLE_KEYS = ["fill", "fontFamily", "fontWeight", "italic", "underline", "strike", "highlight"] as const;

/** Whether a span style changes nothing. */
export function isPlainSpanStyle(style: TextSpanStyle): boolean {
  return STYLE_KEYS.every((key) => style[key] === undefined);
}

/** A stable string of a span style (equal styles give equal strings). */
export function spanStyleKey(style: TextSpanStyle): string {
  return JSON.stringify(STYLE_KEYS.map((key) => style[key] ?? null));
}

/** `spans` repaired for a text of `length` units: sorted, clamped, empty and plain runs dropped, equal neighbors merged. Undefined when none remain. */
export function normalizeSpans(spans: readonly TextSpan[] | undefined, length: number): TextSpan[] | undefined {
  if (!spans) return undefined;
  const sorted = spans
    .map((span) => ({ start: Math.max(0, Math.min(length, span.start)), end: Math.max(0, Math.min(length, span.end)), style: span.style }))
    .filter((span) => span.end > span.start && !isPlainSpanStyle(span.style))
    .sort((a, b) => a.start - b.start);
  const out: TextSpan[] = [];
  for (const span of sorted) {
    const prev = out[out.length - 1];
    if (prev && span.start < prev.end) {
      // Overlap (a broken file): the later run starts where the earlier one ends.
      if (span.end <= prev.end) continue;
      span.start = prev.end;
    }
    if (prev && prev.end === span.start && spanStyleKey(prev.style) === spanStyleKey(span.style)) prev.end = span.end;
    else out.push({ start: span.start, end: span.end, style: span.style });
  }
  return out.length > 0 ? out : undefined;
}

/**
 * The spans after `before` became `after`, found as one replaced region (common prefix and suffix).
 * Typing inside a span, or right after its last character, extends it; a replacement inside a span keeps
 * it; deleting shrinks it and drops it once empty; text typed elsewhere is plain.
 */
export function editSpans(spans: readonly TextSpan[] | undefined, before: string, after: string): TextSpan[] | undefined {
  if (!spans || spans.length === 0 || before === after) return spans as TextSpan[] | undefined;
  let p = 0;
  const max = Math.min(before.length, after.length);
  while (p < max && before.charCodeAt(p) === after.charCodeAt(p)) p++;
  let tail = 0;
  while (tail < max - p && before.charCodeAt(before.length - 1 - tail) === after.charCodeAt(after.length - 1 - tail)) tail++;
  const oldEnd = before.length - tail;
  const added = after.length - tail - p;
  const delta = after.length - before.length;
  const out: TextSpan[] = [];
  for (const { start, end, style } of spans) {
    if (end <= p) {
      // Before the change; typing right after the last character extends the span.
      out.push(end === p && oldEnd === p && added > 0 ? { start, end: end + added, style } : { start, end, style });
    } else if (start >= oldEnd) out.push({ start: start + delta, end: end + delta, style });
    else if (start <= p && end >= oldEnd) out.push({ start, end: end + delta, style }); // the change lies inside the span
    else {
      // A partial overlap keeps the characters outside the changed region.
      if (start < p) out.push({ start, end: p, style });
      if (end > oldEnd) out.push({ start: p + added, end: end + delta, style });
    }
  }
  return normalizeSpans(out, after.length);
}

/** The style of the char at each offset, as a list of cut points over `[from, to)`. */
function cuts(spans: readonly TextSpan[], from: number, to: number): number[] {
  const points = new Set<number>([from, to]);
  for (const span of spans) {
    if (span.start > from && span.start < to) points.add(span.start);
    if (span.end > from && span.end < to) points.add(span.end);
  }
  return [...points].sort((a, b) => a - b);
}

function styleOver(spans: readonly TextSpan[], at: number): TextSpanStyle {
  for (const span of spans) if (span.start <= at && at < span.end) return span.style;
  return {};
}

/**
 * `patch` applied to `[from, to)`: a key with a value sets it, a key whose value is undefined removes it.
 * Spans are split at the range's edges; the result is normalized for a text of `length` units.
 */
export function applySpanStyle(spans: readonly TextSpan[] | undefined, from: number, to: number, patch: Partial<Record<keyof TextSpanStyle, TextSpanStyle[keyof TextSpanStyle] | undefined>>, length: number): TextSpan[] | undefined {
  const list = spans ?? [];
  if (to <= from) return normalizeSpans(list, length);
  const out: TextSpan[] = [];
  for (const span of list) {
    if (span.end <= from || span.start >= to) out.push(span);
    else {
      if (span.start < from) out.push({ start: span.start, end: from, style: span.style });
      if (span.end > to) out.push({ start: to, end: span.end, style: span.style });
    }
  }
  const points = cuts(list, from, to);
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i] as number;
    const b = points[i + 1] as number;
    const style: Record<string, unknown> = { ...styleOver(list, a) };
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) delete style[key];
      else style[key] = value;
    }
    out.push({ start: a, end: b, style: style as TextSpanStyle });
  }
  return normalizeSpans(out, length);
}

/** Every format a span can carry removed from `[from, to)` (the format bar's Clear). */
export function clearSpanStyles(spans: readonly TextSpan[] | undefined, from: number, to: number, length: number): TextSpan[] | undefined {
  return applySpanStyle(spans, from, to, Object.fromEntries(STYLE_KEYS.map((key) => [key, undefined])), length);
}

/** Whether every character of `[from, to)` satisfies `test` on its span style (plain runs get `{}`). */
export function rangeHas(spans: readonly TextSpan[] | undefined, from: number, to: number, test: (style: TextSpanStyle) => boolean): boolean {
  if (to <= from) return false;
  const list = spans ?? [];
  const points = cuts(list, from, to);
  for (let i = 0; i + 1 < points.length; i++) if (!test(styleOver(list, points[i] as number))) return false;
  return true;
}

/** One cut of a line: `[from, to)` in the line's text, with the span style over it (undefined: none). */
export interface Piece {
  from: number;
  to: number;
  span: TextSpanStyle | undefined;
}

/** The line `[lineStart, lineEnd)` of the whole text cut at span boundaries, as offsets into the line. */
export function pieces(spans: readonly TextSpan[] | undefined, lineStart: number, lineEnd: number): Piece[] {
  if (lineEnd <= lineStart) return [];
  const out: Piece[] = [];
  let at = lineStart;
  for (const span of spans ?? []) {
    if (span.end <= at) continue;
    if (span.start >= lineEnd) break;
    const a = Math.max(span.start, lineStart);
    const b = Math.min(span.end, lineEnd);
    if (a > at) out.push({ from: at - lineStart, to: a - lineStart, span: undefined });
    out.push({ from: a - lineStart, to: b - lineStart, span: span.style });
    at = b;
  }
  if (at < lineEnd) out.push({ from: at - lineStart, to: lineEnd - lineStart, span: undefined });
  return out;
}

/** `style` with a span's font choices on top: what a run is measured and drawn in. */
export function runStyle(style: TextStyle, span: TextSpanStyle | undefined): TextStyle {
  if (!span || (span.fontFamily === undefined && span.fontWeight === undefined && span.italic === undefined)) return style;
  return { ...style, fontFamily: span.fontFamily ?? style.fontFamily, fontWeight: span.fontWeight ?? style.fontWeight, italic: span.italic ?? style.italic };
}

/** The toggles of the format bar. */
export type FormatToggle = "bold" | "italic" | "underline" | "strike";

const BOLD_FROM = 600;

/** Whether every character of `[from, to)` has `kind` on (its span over the clip style `base`). */
export function isFormatOn(spans: readonly TextSpan[] | undefined, from: number, to: number, kind: FormatToggle, base: Pick<TextStyle, "fontWeight" | "italic">): boolean {
  return rangeHas(spans, from, to, (style) => {
    if (kind === "bold") return (style.fontWeight ?? base.fontWeight) >= BOLD_FROM;
    if (kind === "italic") return style.italic ?? base.italic;
    return style[kind] === true;
  });
}

/** `kind` toggled over `[from, to)`: off when the whole range has it, else on (the format bar's B, I, U, S and Mod+B / Mod+I). */
export function toggleFormat(spans: readonly TextSpan[] | undefined, from: number, to: number, kind: FormatToggle, base: Pick<TextStyle, "fontWeight" | "italic">, length: number): TextSpan[] | undefined {
  const on = isFormatOn(spans, from, to, kind, base);
  const patch: Partial<Record<keyof TextSpanStyle, TextSpanStyle[keyof TextSpanStyle] | undefined>> =
    kind === "bold"
      ? { fontWeight: on ? (base.fontWeight >= BOLD_FROM ? 400 : undefined) : 700 }
      : kind === "italic"
        ? { italic: on ? (base.italic ? false : undefined) : true }
        : { [kind]: on ? undefined : true };
  return applySpanStyle(spans, from, to, patch, length);
}

/** The styles whose faces a clip's spans draw with beyond the clip's own: spans that choose a family, weight or italic. */
export function spanFaceStyles(style: TextStyle, spans: readonly TextSpan[] | undefined): TextStyle[] {
  const out: TextStyle[] = [];
  for (const span of spans ?? []) if (span.style.fontFamily !== undefined || span.style.fontWeight !== undefined || span.style.italic !== undefined) out.push(runStyle(style, span.style));
  return out;
}
