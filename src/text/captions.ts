// Captions (spec §10.5): the caption track's default style and where a caption sits, and the cue text
// operations the cue list and the timeline use. Pure.
// - Cue words (karaoke timings) are frames relative to the cue's start, [start, end); a word is found
//   in the cue's text by searching its text in reading order (`wordRanges`).
// - Slicing a cue at a frame (a timeline split): with word timings the words starting before the cut go
//   left and the text is cut where the first word on the right starts; without them the text is cut at
//   the space nearest the frame's share of the characters. A cut that would leave a side without text
//   (a single word, a cut before the first spoken word) keeps the whole text on both sides.
// - Splitting at the caret (Enter in the cue list): the text at the caret, the timing by the share of
//   characters on each side, or at the first right word's start when the cue has word timings.
// - Merging (Mod+Backspace): the texts joined by a space, the span from the first cue's start to the
//   second's end, the words of both.
import type { CaptionClip, CaptionPosition, CaptionStyle, CaptionStyleOverride, CaptionTextOverride, CaptionWord, Frame, RGBA, TextStyle } from "../core/document/types.js";
import { DEFAULT_TEXT_STYLE, scaleTextStyle, TEXT_REFERENCE_SIDE } from "./style.js";

/** A new cue's length (spec §10.5 `+ Cue at playhead`: a 2 s cue). */
export const CUE_SECONDS = 2;
/** The text of a cue made with `+ Cue` (selected in the list, typing replaces it). */
export const NEW_CUE_TEXT = "Caption";
/** The name the caption track gets (spec §6.1 `CC` header). */
export const CAPTION_TRACK_NAME = "CC";
/** Limits of the caption style's own fields. */
export const CAPTION_LIMITS = {
  maxLines: { min: 1, max: 6 },
  maxWidth: { min: 50, max: 8000 },
  x: { min: -4000, max: 4000 },
  y: { min: -4000, max: 4000 },
} as const;

/** The default highlight: a warm yellow, the other words white (content colors, not UI). */
export const DEFAULT_HIGHLIGHT_COLOR: Readonly<RGBA> = { r: 1, g: 0.84, b: 0.04, a: 1 };
export const DEFAULT_INACTIVE_COLOR: Readonly<RGBA> = { r: 1, g: 1, b: 1, a: 1 };

/** The caption text at the reference size: heavy white Inter at 64 px with a black outline and a soft shadow. */
export const DEFAULT_CAPTION_TEXT: TextStyle = {
  ...DEFAULT_TEXT_STYLE,
  fontWeight: 800,
  fontSize: 64,
  lineHeight: 1.15,
  stroke: { enabled: true, width: 6, color: { r: 0, g: 0, b: 0, a: 1 } },
  shadow: { enabled: true, x: 0, y: 4, blur: 12, color: { r: 0, g: 0, b: 0, a: 0.5 } },
  verticalAnchor: "bottom",
};

/** The wrap width at the reference size (a 1080 px wide frame). */
const DEFAULT_MAX_WIDTH = 900;

/** The style of a new caption track on a `frame`-sized project (sizes scaled from TEXT_REFERENCE_SIDE). */
export function defaultCaptionStyle(frame: { width: number; height: number }): CaptionStyle {
  const k = Math.min(frame.width, frame.height) / TEXT_REFERENCE_SIDE;
  return {
    text: k > 0 && k !== 1 ? scaleTextStyle(DEFAULT_CAPTION_TEXT, k) : structuredClone(DEFAULT_CAPTION_TEXT),
    position: "bottom",
    x: 0,
    y: 0,
    maxWidth: Math.max(CAPTION_LIMITS.maxWidth.min, Math.round((frame.width * DEFAULT_MAX_WIDTH) / TEXT_REFERENCE_SIDE)),
    maxLines: 2,
    highlight: { mode: "color", color: { ...DEFAULT_HIGHLIGHT_COLOR }, inactiveColor: { ...DEFAULT_INACTIVE_COLOR } },
  };
}

/**
 * A caption style stored by an older version (a schema 2 project.json, a 1.0.0 template or clipboard
 * payload) with the fields added since filled in: `x` 0, centered as before (Batch 53). Anything else
 * comes back as it is, for validation to judge.
 */
export function upgradeCaptionStyle<T>(style: T): T {
  const old = typeof style === "object" && style !== null && !Array.isArray(style) && (style as { x?: unknown }).x === undefined;
  return old ? { ...style, x: 0 } : style;
}

/** Where the presets put a caption, as a fraction of the frame height: the edge (or middle) that stays put. */
export const CAPTION_PLACES: Readonly<Record<Exclude<CaptionPosition, "custom">, { at: number; anchor: number }>> = {
  // The bottom edge in the lower third, where the Subtitle sits (Batch 29: 78%).
  bottom: { at: 0.78, anchor: 1 },
  center: { at: 0.5, anchor: 0.5 },
  // The top edge below the platforms' top bar.
  top: { at: 0.18, anchor: 0 },
};

/**
 * Where a caption of `style` sits on a `height` px tall frame: the box's vertical anchor (0 top, 1
 * bottom) and its x and y from the frame center (project px). The presets center it horizontally;
 * Custom puts its middle at (`x`, `y`).
 */
export function captionPlace(style: Pick<CaptionStyle, "position" | "x" | "y">, height: number): { anchorY: number; x: number; y: number } {
  if (style.position === "custom") return { anchorY: 0.5, x: style.x, y: style.y };
  const place = CAPTION_PLACES[style.position];
  return { anchorY: place.anchor, x: 0, y: height * place.at - height / 2 };
}

/** The y (frame center relative, the middle of the box) a preset position shows a `boxHeight` caption at: where Custom starts from. */
export function captionMiddleY(style: Pick<CaptionStyle, "position" | "x" | "y">, height: number, boxHeight: number): number {
  const { anchorY, y } = captionPlace(style, height);
  return Math.round(y + (0.5 - anchorY) * boxHeight);
}

// --- Styles per cue (spec §20.3) ---------------------------------------------------------------

/** The text style fields a cue override sets whole, and those it sets part by part. */
const TEXT_FIELDS = ["fontFamily", "fontWeight", "italic", "fontSize", "fill", "textCase", "letterSpacing", "lineHeight", "align"] as const;
const TEXT_PARTS = ["stroke", "shadow", "background"] as const;
/** The caption style's own fields an override sets whole. */
const CAPTION_FIELDS = ["position", "x", "y", "maxWidth", "maxLines"] as const;

type Plain = Record<string, unknown>;

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** `track` with the fields of `override` on top (spec §20.3). */
export function applyCaptionOverride(track: CaptionStyle, override: CaptionStyleOverride): CaptionStyle {
  const style: CaptionStyle = { ...track };
  const t = override.text as Plain | undefined;
  if (t) {
    const text: Plain = { ...track.text };
    for (const key of TEXT_FIELDS) if (t[key] !== undefined) text[key] = t[key];
    for (const key of TEXT_PARTS) if (t[key]) text[key] = { ...track.text[key], ...(t[key] as Plain) };
    style.text = text as unknown as TextStyle;
  }
  for (const key of CAPTION_FIELDS) if (override[key] !== undefined) (style as unknown as Plain)[key] = override[key];
  if (override.highlight) style.highlight = { ...track.highlight, ...override.highlight };
  return style;
}

/** One effective style per override (and the track style it was made from). */
const effectiveStyles = new WeakMap<CaptionStyleOverride, { track: CaptionStyle; style: CaptionStyle }>();

/**
 * The style a cue is drawn in (spec §20.3): its track's style with the cue's override on top. The track
 * style itself without an override, and the same object for an unchanged override and track style, so
 * the caches keyed by style objects (looks, rasters) keep their entries.
 */
export function effectiveCaptionStyle(track: CaptionStyle, override: CaptionStyleOverride | undefined): CaptionStyle {
  if (!override) return track;
  const memo = effectiveStyles.get(override);
  if (memo?.track === track) return memo.style;
  const style = applyCaptionOverride(track, override);
  effectiveStyles.set(override, { track, style });
  return style;
}

/** Whether an override sets nothing. */
export function isEmptyOverride(override: CaptionStyleOverride | undefined): boolean {
  return override === undefined || overrideFields(override).length === 0;
}

/**
 * Whether a cue has a style of its own (spec §20.3: the cue list's dot, the timeline's badge, Reset to
 * track style): an override. A preset link alone changes nothing the cue shows.
 */
export function hasOwnStyle(cue: Pick<CaptionClip, "styleOverride">): boolean {
  return cue.styleOverride !== undefined;
}

/**
 * `override` with every field that differs between `before` and `after` set to its `after` value (an
 * edit in the Selected scope, a preset, a canvas drag): only what the edit changed becomes the cue's
 * own. The stroke, shadow, background and highlight go part by part. Undefined when nothing is set.
 */
export function overrideWith(override: CaptionStyleOverride | undefined, before: CaptionStyle, after: CaptionStyle): CaptionStyleOverride | undefined {
  const next: CaptionStyleOverride = structuredClone(override ?? {});
  const text: Plain = (next.text as Plain | undefined) ?? {};
  const a = before.text as unknown as Plain;
  const b = after.text as unknown as Plain;
  for (const key of TEXT_FIELDS) if (!same(a[key], b[key])) text[key] = structuredClone(b[key]);
  for (const key of TEXT_PARTS) {
    const from = a[key] as Plain;
    const to = b[key] as Plain;
    const part: Plain = { ...((text[key] as Plain | undefined) ?? {}) };
    for (const sub of Object.keys(to)) if (!same(from[sub], to[sub])) part[sub] = structuredClone(to[sub]);
    if (Object.keys(part).length > 0) text[key] = part;
  }
  if (Object.keys(text).length > 0) next.text = text as CaptionTextOverride;
  for (const key of CAPTION_FIELDS) if (!same(before[key], after[key])) (next as Plain)[key] = after[key];
  const highlight: Plain = { ...(next.highlight ?? {}) };
  for (const sub of ["mode", "color", "inactiveColor"] as const) if (!same(before.highlight[sub], after.highlight[sub])) highlight[sub] = structuredClone(after.highlight[sub]);
  if (Object.keys(highlight).length > 0) next.highlight = highlight;
  return isEmptyOverride(next) ? undefined : next;
}

/**
 * The fields an override sets, as paths: `text.fontFamily`, `text.stroke.width`, `position`, `x`,
 * `highlight.color`... (the properties panel marks their rows).
 */
export function overrideFields(override: CaptionStyleOverride | undefined): string[] {
  const fields: string[] = [];
  const walk = (value: unknown, path: string) => {
    if (typeof value === "object" && value !== null && !Array.isArray(value) && !isLeaf(path)) {
      for (const [key, inner] of Object.entries(value)) walk(inner, path === "" ? key : `${path}.${key}`);
    } else if (value !== undefined && path !== "") fields.push(path);
  };
  walk(override ?? {}, "");
  return fields;
}

/** Fields whose values are objects but set whole: colors and the fill. */
function isLeaf(path: string): boolean {
  return path === "text.fill" || path.endsWith(".color") || path.endsWith("Color");
}

/**
 * `override` without the fields at `paths` (a path names a field or a group: `text.stroke` drops the
 * whole stroke); undefined when nothing is left (a row's reset, spec §20.3).
 */
export function overrideWithout(override: CaptionStyleOverride | undefined, paths: readonly string[]): CaptionStyleOverride | undefined {
  if (!override) return undefined;
  const next = structuredClone(override) as Plain;
  for (const path of paths) {
    const keys = path.split(".");
    const parents: Plain[] = [next];
    let node: Plain | undefined = next;
    for (const key of keys.slice(0, -1)) {
      const inner: unknown = node?.[key];
      node = typeof inner === "object" && inner !== null ? (inner as Plain) : undefined;
      if (node) parents.push(node);
    }
    if (!node) continue;
    delete node[keys[keys.length - 1] as string];
    // Empty groups go too.
    for (let depth = parents.length - 1; depth > 0; depth--) {
      const parent = parents[depth - 1] as Plain;
      const key = keys[depth - 1] as string;
      if (Object.keys(parents[depth] as Plain).length === 0) delete parent[key];
    }
  }
  return isEmptyOverride(next as CaptionStyleOverride) ? undefined : (next as CaptionStyleOverride);
}

/**
 * `override` with a preset's look (spec §20.3 "applying a text preset with cues selected writes its
 * style into their overrides"): its whole text style (not the vertical anchor: captions sit at their
 * position), its word highlight when it has one, and its position (as Custom) when it applies one.
 */
export function presetOverride(override: CaptionStyleOverride | undefined, look: { style: TextStyle; position: { x: number; y: number } | null }, highlight?: CaptionStyle["highlight"]): CaptionStyleOverride {
  const text: Partial<TextStyle> = structuredClone(look.style);
  delete text.verticalAnchor;
  const next: CaptionStyleOverride = { ...structuredClone(override ?? {}), text: text as CaptionTextOverride };
  if (highlight) next.highlight = structuredClone(highlight);
  if (look.position) Object.assign(next, { position: "custom", x: Math.round(look.position.x), y: Math.round(look.position.y) });
  return next;
}

// --- Cue text ------------------------------------------------------------------------------------

const WORDS = typeof Intl.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity: "word" }) : null;

/**
 * Words in a cue text, punctuation left out. Dictionary words (Batch 47): runs of non-space would count
 * a Chinese or Japanese line, written without spaces, as one word.
 */
export function wordCount(text: string): number {
  if (!WORDS) return text.split(/\s+/).filter((word) => word !== "").length;
  let count = 0;
  for (const segment of WORDS.segment(text)) if (segment.isWordLike) count += 1;
  return count;
}

/** Whether a cue's text contains `query` (case-insensitive; an empty query matches every cue). */
export function cueMatches(text: string, query: string): boolean {
  const q = query.trim().toLocaleLowerCase();
  return q === "" || text.toLocaleLowerCase().includes(q);
}

/** A line for the timeline label and lists: the cue's lines joined by spaces. */
export function cueLine(text: string): string {
  return text.replace(/\s*\n\s*/g, " ").trim();
}

/**
 * Where each word is in `text` ([from, to) in UTF-16 units), searched in reading order (exactly, then
 * ignoring case); null for a word the text does not contain after the previous one.
 */
export function wordRanges(text: string, words: readonly Pick<CaptionWord, "text">[]): ([number, number] | null)[] {
  const lower = text.toLocaleLowerCase();
  let cursor = 0;
  return words.map((word) => {
    const needle = word.text.trim();
    if (needle === "") return null;
    let at = text.indexOf(needle, cursor);
    if (at === -1) at = lower.indexOf(needle.toLocaleLowerCase(), cursor);
    if (at === -1) return null;
    cursor = at + needle.length;
    return [at, cursor];
  });
}

/** The index of the space nearest `at` (ties go left), or -1 when the text has none. */
function nearestSpace(text: string, at: number): number {
  let best = -1;
  for (let i = 0; i < text.length; i++) {
    if (!/\s/.test(text[i] as string)) continue;
    if (best === -1 || Math.abs(i - at) < Math.abs(best - at)) best = i;
  }
  return best;
}

/**
 * The character boundary a cut at `rel` frames into the cue falls on (0 < rel < duration), or null when
 * the text has no place to cut there (then both sides keep the whole text).
 */
export function cueBoundary(cue: Pick<CaptionClip, "text" | "duration" | "words">, rel: Frame): number | null {
  const { text } = cue;
  const trimmedEnd = text.trimEnd().length;
  const trimmedStart = text.length - text.trimStart().length;
  const usable = (at: number) => (at > trimmedStart && at < trimmedEnd ? at : null);
  const words = cue.words ?? [];
  if (words.length > 0) {
    const ranges = wordRanges(text, words);
    const first = words.findIndex((word, i) => word.start >= rel && ranges[i] !== null);
    if (first !== -1) return usable((ranges[first] as [number, number])[0]);
    if (ranges.some((range) => range !== null)) return null;
  }
  const at = nearestSpace(text, Math.round((text.length * rel) / Math.max(1, cue.duration)));
  return at === -1 ? null : usable(at);
}

/** The words starting in [from, to) frames of the cue, re-based on `from`, their ends kept within the piece. */
export function sliceWords(words: readonly CaptionWord[] | undefined, from: Frame, to: Frame): CaptionWord[] | undefined {
  if (!words) return undefined;
  const length = to - from;
  const kept = words.filter((word) => word.start >= from && word.start < to).map((word) => ({ text: word.text, start: word.start - from, end: Math.max(word.start - from + 1, Math.min(length, word.end - from)) }));
  return kept.length > 0 ? kept : undefined;
}

/**
 * The text and words of the part [from, to) of a cue (absolute frames inside it): what a split or an
 * insert leaves on each side (spec §6.11). Words are re-based on the part's start.
 */
export function cueSlice(cue: Pick<CaptionClip, "text" | "start" | "duration" | "words">, from: Frame, to: Frame): { text: string; words: CaptionWord[] | undefined } {
  const end = cue.start + cue.duration;
  const a = from <= cue.start ? 0 : cueBoundary(cue, from - cue.start);
  const b = to >= end ? cue.text.length : cueBoundary(cue, to - cue.start);
  const words = sliceWords(cue.words, from - cue.start, to - cue.start);
  if (a === null || b === null || a >= b) return { text: cue.text, words };
  const text = cue.text.slice(a, b).trim();
  return { text: text === "" ? cue.text : text, words };
}

export interface CueHalf {
  text: string;
  words: CaptionWord[] | undefined;
}

export interface CueSplit {
  /** Frames into the cue where the right half starts (1 <= at < duration). */
  at: Frame;
  left: CueHalf;
  right: CueHalf;
}

/**
 * Splits a cue at the caret `caret` of its text (spec §10.5 Enter): the text at the caret, the timing
 * by the share of characters on each side (or at the first right word's start when the words on both
 * sides have timings). Null when the cue is too short to split (under 2 frames).
 */
export function splitCueAt(cue: Pick<CaptionClip, "text" | "duration" | "words">, caret: number): CueSplit | null {
  if (cue.duration < 2) return null;
  const c = Math.min(cue.text.length, Math.max(0, Math.round(caret)));
  const leftText = cue.text.slice(0, c).trimEnd();
  const rightText = cue.text.slice(c).trimStart();
  const words = cue.words ?? [];
  const ranges = wordRanges(cue.text, words);
  const leftWords: CaptionWord[] = [];
  const rightWords: CaptionWord[] = [];
  words.forEach((word, i) => {
    const range = ranges[i];
    if (range ? range[0] < c : word.start < (cue.duration * c) / Math.max(1, cue.text.length)) leftWords.push(word);
    else rightWords.push(word);
  });
  const total = leftText.length + rightText.length;
  let at = total > 0 ? Math.round((cue.duration * leftText.length) / total) : Math.round(cue.duration / 2);
  const first = rightWords[0];
  if (leftWords.length > 0 && first) at = first.start;
  at = Math.min(cue.duration - 1, Math.max(1, at));
  const left = leftWords.map((word) => ({ text: word.text, start: word.start, end: Math.max(word.start + 1, Math.min(word.end, at)) }));
  const right = rightWords.map((word) => {
    const start = Math.max(0, word.start - at);
    return { text: word.text, start, end: Math.max(start + 1, word.end - at) };
  });
  return { at, left: { text: leftText, words: left.length > 0 ? left : undefined }, right: { text: rightText, words: right.length > 0 ? right : undefined } };
}

/** Two cues as one (spec §10.5 Mod+Backspace): `first` keeps its start, the span runs to `second`'s end. */
export function mergeCues(first: Pick<CaptionClip, "text" | "start" | "duration" | "words">, second: Pick<CaptionClip, "text" | "start" | "duration" | "words">): { text: string; duration: Frame; words: CaptionWord[] | undefined; caret: number } {
  const a = first.text.trimEnd();
  const b = second.text.trimStart();
  const joiner = a !== "" && b !== "" ? " " : "";
  const shift = second.start - first.start;
  const words = [...(first.words ?? []), ...(second.words ?? []).map((word) => ({ ...word, start: word.start + shift, end: word.end + shift }))];
  return { text: a + joiner + b, duration: second.start + second.duration - first.start, words: words.length > 0 ? words : undefined, caret: a.length + joiner.length };
}

/**
 * Word timings spread over `duration` frames by the length of each word (a space counts as one
 * character): a generated karaoke cue (the acceptance check, tests). Every word lasts at least a frame.
 */
export function evenWords(text: string, duration: Frame): CaptionWord[] {
  const tokens = text.split(/\s+/).filter((token) => token !== "");
  const total = tokens.reduce((sum, token) => sum + token.length + 1, 0);
  let cumulative = 0;
  const starts = tokens.map((token) => {
    const start = Math.floor((duration * cumulative) / Math.max(1, total));
    cumulative += token.length + 1;
    return start;
  });
  return tokens.map((token, i) => {
    const start = starts[i] as number;
    const end = i + 1 < tokens.length ? (starts[i + 1] as number) : duration;
    return { text: token, start, end: Math.max(end, start + 1) };
  });
}

/** The index of the word playing `rel` frames into a cue ([start, end)), or -1 between words. */
export function activeWordIndex(words: readonly CaptionWord[], rel: Frame): number {
  for (let i = 0; i < words.length; i++) {
    const word = words[i] as CaptionWord;
    if (rel >= word.start && rel < word.end) return i;
  }
  return -1;
}
