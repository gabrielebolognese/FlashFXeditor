// Import words (spec §21.8, Batch 59): word timings from a JSON file, with optional chunks. Pure.
// - Formats: an array of `{ word | text, start, end }`; an object with `words` (the same items);
//   Whisper's `{ segments: [{ words: [...] }] }`. Times are seconds, or milliseconds when the items
//   use `startMs` / `endMs` or `start_ms` / `end_ms`, or when the object has `"unit": "ms"`.
// - An item may say `emphasis: true`. An object may carry `cues: [{ from, to, emphasis?: number[] }]`:
//   inclusive indexes into the word list, fixing the cue boundaries, and the emphasis words' indexes.
// - Words: text trimmed, empty ones dropped; a start below 0 becomes 0; an end not after the start
//   lasts a millisecond; a word never starts before the one before it.
// - Cues from `cues` keep exactly their boundaries (first word's start to last word's end); otherwise
//   `cuesFromWords` chunks the words with the dialog's options (`wordsToCues`).
import type { SubtitleCue } from "./subtitles.js";
import { CHARS_PER_LINE, cuesFromWords, cueText, type TimedWord } from "./transcript.js";

/** A cue of the file's `cues`: inclusive word indexes, and the emphasis words (indexes into the word list). */
export interface WordsCueSpec {
  from: number;
  to: number;
  emphasis: number[];
}

export interface ImportedWords {
  words: TimedWord[];
  /** The file's chunk list, or null (the chunking dialog's rules apply). */
  cues: WordsCueSpec[] | null;
  /** Items left out (no text, no usable times). */
  skipped: number;
}

export class WordsImportError extends Error {}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const MS = 1000;
const S = 1_000_000;

/** One item's times in µs, or null. */
function itemTimes(item: Record<string, unknown>, fileMs: boolean): { startUs: number; endUs: number } | null {
  const pairs: [string, string, number][] = [
    ["startMs", "endMs", MS],
    ["start_ms", "end_ms", MS],
    ["start", "end", fileMs ? MS : S],
  ];
  for (const [a, b, unit] of pairs) {
    const start = item[a];
    const end = item[b];
    if (typeof start === "number" && typeof end === "number" && Number.isFinite(start) && Number.isFinite(end)) return { startUs: Math.round(start * unit), endUs: Math.round(end * unit) };
  }
  return null;
}

function readItems(list: unknown[], fileMs: boolean, out: TimedWord[]): number {
  let skipped = 0;
  for (const raw of list) {
    const item = isObject(raw) ? raw : null;
    const text = typeof item?.word === "string" ? item.word : typeof item?.text === "string" ? item.text : "";
    const times = item ? itemTimes(item, fileMs) : null;
    if (!item || text.trim() === "" || !times) {
      skipped += 1;
      continue;
    }
    const prev = out[out.length - 1];
    const startUs = Math.max(prev ? prev.startUs : 0, times.startUs, 0);
    out.push({ text: text.trim(), startUs, endUs: Math.max(startUs + MS, times.endUs), ...(item.emphasis === true && { emphasis: true }) });
  }
  return skipped;
}

/** The words (and chunk list) of a words file's text. Throws `WordsImportError` with what is wrong. */
export function parseWordsJson(source: string): ImportedWords {
  let data: unknown;
  try {
    data = JSON.parse(source.replace(/^﻿/, ""));
  } catch {
    throw new WordsImportError("The file is not valid JSON.");
  }
  const words: TimedWord[] = [];
  let skipped = 0;
  let cuesIn: unknown;
  let fileMs = false;
  if (Array.isArray(data)) skipped = readItems(data, false, words);
  else if (isObject(data)) {
    fileMs = data.unit === "ms";
    cuesIn = data.cues;
    if (Array.isArray(data.words)) skipped = readItems(data.words, fileMs, words);
    else if (Array.isArray(data.segments)) {
      for (const segment of data.segments) if (isObject(segment) && Array.isArray(segment.words)) skipped += readItems(segment.words, fileMs, words);
    } else throw new WordsImportError("The file has no words: expected a list of { word, start, end }, or an object with words or segments.");
  } else throw new WordsImportError("The file has no words: expected a list of { word, start, end }.");
  if (words.length === 0) throw new WordsImportError("No word with a text and a start and end time was found.");
  return { words, cues: cuesIn === undefined ? null : readCues(cuesIn, words.length), skipped };
}

function readCues(value: unknown, count: number): WordsCueSpec[] {
  if (!Array.isArray(value)) throw new WordsImportError("cues must be a list of { from, to, emphasis? }.");
  const cues: WordsCueSpec[] = [];
  let next = 0;
  value.forEach((raw, i) => {
    const cue = isObject(raw) ? raw : null;
    const from = cue?.from;
    const to = cue?.to;
    if (!cue || typeof from !== "number" || typeof to !== "number" || !Number.isInteger(from) || !Number.isInteger(to)) throw new WordsImportError(`Cue ${i} needs whole word indexes from and to.`);
    if (from < 0 || to < from || to >= count) throw new WordsImportError(`Cue ${i} (${from}..${to}) is outside the ${count} words.`);
    if (from < next) throw new WordsImportError(`Cue ${i} (${from}..${to}) overlaps the cue before it.`);
    const emphasis = Array.isArray(cue.emphasis) ? cue.emphasis.filter((index): index is number => Number.isInteger(index) && (index as number) >= from && (index as number) <= to) : [];
    cues.push({ from, to, emphasis });
    next = to + 1;
  });
  return cues;
}

/** The chunking dialog's rules (spec §21.8). */
export interface ChunkOptions {
  /** Words per cue at most, 1 to 12. */
  maxWords: number;
  charsPerLine: number;
  maxLines: number;
  /** A cue ends at a sentence end (. ! ? …). */
  breakAtPunctuation: boolean;
  /** A silence this long (ms) ends a cue. */
  pauseMs: number;
}

export const DEFAULT_CHUNKS: Readonly<ChunkOptions> = { maxWords: 4, charsPerLine: CHARS_PER_LINE, maxLines: 2, breakAtPunctuation: true, pauseMs: 700 };
export const CHUNK_LIMITS = { maxWords: { min: 1, max: 12 }, charsPerLine: { min: 8, max: 80 }, maxLines: { min: 1, max: 4 }, pauseMs: { min: 50, max: 5000 } } as const;

/** The cues of `imported`: the file's own chunks exactly, else the words chunked by `options`. µs from time 0. */
export function wordsToCues(imported: ImportedWords, options: ChunkOptions): SubtitleCue[] {
  const { words, cues } = imported;
  const end = (words[words.length - 1] as TimedWord).endUs;
  if (!cues) return cuesFromWords(words, { maxLines: options.maxLines, charsPerLine: options.charsPerLine, maxWords: options.maxWords, pauseUs: options.pauseMs * MS, breakAtPunctuation: options.breakAtPunctuation, durationUs: end + 1_000_000 });
  return cues.map((spec) => {
    const group = words.slice(spec.from, spec.to + 1).map((word, i) => ({ ...word, ...(spec.emphasis.includes(spec.from + i) && { emphasis: true }) }));
    const first = group[0] as TimedWord;
    const last = group[group.length - 1] as TimedWord;
    return {
      startUs: first.startUs,
      endUs: Math.max(first.startUs + 1, last.endUs),
      text: cueText(group, options.charsPerLine),
      words: group.map(({ text, startUs, endUs, emphasis }) => ({ text, startUs, endUs, ...(emphasis === true && { emphasis: true }) })),
    };
  });
}
