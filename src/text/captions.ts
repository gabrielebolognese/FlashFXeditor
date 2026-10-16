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
import type { CaptionClip, CaptionPosition, CaptionStyle, CaptionWord, Frame, RGBA, TextStyle } from "../core/document/types.js";
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
    y: 0,
    maxWidth: Math.max(CAPTION_LIMITS.maxWidth.min, Math.round((frame.width * DEFAULT_MAX_WIDTH) / TEXT_REFERENCE_SIDE)),
    maxLines: 2,
    highlight: { mode: "color", color: { ...DEFAULT_HIGHLIGHT_COLOR }, inactiveColor: { ...DEFAULT_INACTIVE_COLOR } },
  };
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
 * bottom) and its y from the frame center (project px). Horizontally it is centered.
 */
export function captionPlace(style: Pick<CaptionStyle, "position" | "y">, height: number): { anchorY: number; y: number } {
  if (style.position === "custom") return { anchorY: 0.5, y: style.y };
  const place = CAPTION_PLACES[style.position];
  return { anchorY: place.anchor, y: height * place.at - height / 2 };
}

/** The y (frame center relative, the middle of the box) a preset position shows a `boxHeight` caption at: where Custom starts from. */
export function captionMiddleY(style: Pick<CaptionStyle, "position" | "y">, height: number, boxHeight: number): number {
  const { anchorY, y } = captionPlace(style, height);
  return Math.round(y + (0.5 - anchorY) * boxHeight);
}

// --- Cue text ------------------------------------------------------------------------------------

/** Words in a cue text (runs of non-space). */
export function wordCount(text: string): number {
  return text.split(/\s+/).filter((word) => word !== "").length;
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
