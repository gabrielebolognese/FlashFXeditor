// Transcripts to caption cues (spec §10.6): Whisper's word chunks become timed words, and the words
// become cues of at most `maxLines` lines of about 32 characters. Pure; times are integer µs from the
// start of the transcribed audio.
// - Words: a chunk's text trimmed; a chunk without letters or digits (a lone "," or "...") joins the
//   word before it; bracketed annotations Whisper writes for non-speech ("[Music]", "(laughs)", "♪")
//   are dropped. A word never starts before the one before it, and ends after it starts. Whisper's
//   word times (cross-attention alignment) trail the voice: measured 0.17-0.2 s late on two voices
//   (median; p10 0.08 s, p90 0.24-0.32 s), so they are moved WORD_LEAD_US earlier and a highlighted
//   word lights up as it is spoken, at worst a little early.
// - Cues: the words are cut into phrases at sentence ends (. ! ? …) and at pauses of PAUSE_US or more;
//   a phrase that fits the cue's lines is one cue, a longer one is split into the fewest cues that
//   fit, as even as possible, preferring cuts after a clause end (, ; :) (`phraseCues`), so a sentence
//   never leaves a lone word or two in a cue of its own.
// - Lines: a cue longer than one line is broken into the fewest lines that fit, as even as possible
//   (the top line never the longer one when they cannot be equal), joined with `\n`.
// - Timing: a cue spans its first word's start to its last word's end; it is held on screen up to the
//   next cue when that one follows within PAUSE_US (no flicker between cues), else HOLD_US more, and
//   is at least MIN_CUE_US long where there is room.
import type { SubtitleCue, SubtitleWord } from "./subtitles.js";

/** A spoken word, µs from the start of the audio. */
export type TimedWord = SubtitleWord;

/** Characters per caption line (spec §10.6: "max ~32 chars per line"). */
export const CHARS_PER_LINE = 32;
/** A silence this long ends a cue. */
export const PAUSE_US = 700_000;
/** A cue stays this long after its last word when no cue follows soon. */
export const HOLD_US = 300_000;
/** The shortest cue (where the next cue leaves room). */
export const MIN_CUE_US = 600_000;
/** A word without an end time (the last one Whisper cut off) lasts this long. */
const OPEN_WORD_US = 500_000;
/** Whisper's word times are moved this much earlier (see the header). */
export const WORD_LEAD_US = 150_000;

/** A word chunk of the transformers.js ASR pipeline (`return_timestamps: "word"`), in seconds. */
export interface WordChunk {
  text: string;
  timestamp: readonly [number | null, number | null];
}

const SPEECH = /[\p{L}\p{N}]/u;
const MUSIC = /^[♪♫♬\s]+$/u;

/** The chunks as timed words within [0, durationUs], `leadUs` earlier than Whisper's times (see the header). */
export function wordsFromChunks(chunks: readonly WordChunk[], durationUs: number, leadUs = WORD_LEAD_US): TimedWord[] {
  const words: TimedWord[] = [];
  let bracket: "]" | ")" | null = null;
  for (const chunk of chunks) {
    const text = chunk.text.trim();
    if (text === "") continue;
    // Non-speech annotations, possibly over several chunks ("[", "Music", "]").
    if (bracket) {
      if (text.includes(bracket)) bracket = null;
      continue;
    }
    if (text.startsWith("[") || text.startsWith("(")) {
      const close = text.startsWith("[") ? "]" : ")";
      if (!text.includes(close)) bracket = close;
      continue;
    }
    if (MUSIC.test(text)) continue;
    const [from, to] = chunk.timestamp;
    const previous = words[words.length - 1];
    const start = clampUs(from === null ? (previous?.endUs ?? 0) : Math.round(from * 1e6) - leadUs, durationUs);
    const endRaw = to === null ? start + OPEN_WORD_US : Math.round(to * 1e6) - leadUs;
    if (!SPEECH.test(text)) {
      // Punctuation on its own: part of the word before it.
      if (previous) {
        previous.text += text;
        previous.endUs = Math.max(previous.endUs, clampUs(endRaw, durationUs));
      }
      continue;
    }
    const startUs = Math.max(start, previous?.startUs ?? 0);
    words.push({ text, startUs, endUs: Math.max(startUs + 1, clampUs(endRaw, durationUs)) });
  }
  return words;
}

const clampUs = (us: number, durationUs: number) => Math.min(Math.max(0, durationUs), Math.max(0, us));

const SENTENCE_END = /[.!?…。！？]["'”’)\]]*$/u;
const CLAUSE_END = /[,;:，、；：]["'”’)\]]*$/u;

/** The line breaks of `words` (word counts per line) into the fewest lines of at most `perLine` characters, as even as possible. */
export function lineBreaks(words: readonly string[], perLine: number): number[] {
  const n = words.length;
  if (n === 0) return [];
  const width = (from: number, to: number) => words.slice(from, to).reduce((sum, word, i) => sum + word.length + (i > 0 ? 1 : 0), 0);
  if (width(0, n) <= perLine) return [n];
  // best[i]: the fewest lines for words[i..], then the shortest longest line, then the fewest words on
  // the top line (bottom-heavy captions).
  type Best = { lines: number; longest: number; counts: number[] };
  const best: (Best | null)[] = new Array<Best | null>(n + 1).fill(null);
  best[n] = { lines: 0, longest: 0, counts: [] };
  for (let i = n - 1; i >= 0; i--) {
    let choice: Best | null = null;
    for (let j = i + 1; j <= n; j++) {
      const w = width(i, j);
      // A word longer than a line gets a line of its own.
      if (w > perLine && j > i + 1) break;
      const rest = best[j] as Best;
      const candidate: Best = { lines: rest.lines + 1, longest: Math.max(w, rest.longest), counts: [j - i, ...rest.counts] };
      if (!choice || candidate.lines < choice.lines || (candidate.lines === choice.lines && candidate.longest < choice.longest)) choice = candidate;
    }
    best[i] = choice;
  }
  return (best[0] as Best).counts;
}

/** Lines `words` needs at `perLine` characters. */
const linesFor = (words: readonly string[], perLine: number) => lineBreaks(words, perLine).length;

/** Characters of `words` joined by spaces. */
const widthOf = (words: readonly string[]) => words.reduce((sum, word, i) => sum + word.length + (i > 0 ? 1 : 0), 0);

/**
 * A phrase (no sentence end or pause inside) as cues of at most `maxLines` lines (word counts per cue):
 * one cue when it fits, else the fewest cues that fit, then the fewest lines in all (a cue stays on one
 * line where it can), then the smallest sum of squared lengths (even cues), a cut that does not follow
 * a clause end costing as much as half a line more.
 */
export function phraseCues(words: readonly string[], maxLines: number, perLine: number): number[] {
  const n = words.length;
  if (n === 0) return [];
  if (linesFor(words, perLine) <= maxLines) return [n];
  const cutPenalty = (perLine / 2) ** 2;
  type Best = { cues: number; lines: number; cost: number; counts: number[] };
  const better = (a: Best, b: Best) => a.cues < b.cues || (a.cues === b.cues && (a.lines < b.lines || (a.lines === b.lines && a.cost < b.cost)));
  const best: (Best | null)[] = new Array<Best | null>(n + 1).fill(null);
  best[n] = { cues: 0, lines: 0, cost: 0, counts: [] };
  for (let i = n - 1; i >= 0; i--) {
    let choice: Best | null = null;
    for (let j = i + 1; j <= n; j++) {
      const span = words.slice(i, j);
      const lines = linesFor(span, perLine);
      // A single word always fits (a line of its own); longer spans stop fitting for good.
      if (j > i + 1 && lines > maxLines) break;
      const rest = best[j] as Best;
      const width = widthOf(span);
      const cut = j < n && !CLAUSE_END.test(words[j - 1] as string) ? cutPenalty : 0;
      const candidate: Best = { cues: rest.cues + 1, lines: rest.lines + lines, cost: rest.cost + width * width + cut, counts: [j - i, ...rest.counts] };
      if (!choice || better(candidate, choice)) choice = candidate;
    }
    best[i] = choice;
  }
  return (best[0] as Best).counts;
}

/** The cue text of `words`: their lines (`lineBreaks`) joined with `\n`. */
export function cueText(words: readonly string[], perLine = CHARS_PER_LINE): string {
  const lines: string[] = [];
  let at = 0;
  for (const count of lineBreaks(words, perLine)) {
    lines.push(words.slice(at, at + count).join(" "));
    at += count;
  }
  return lines.join("\n");
}

export interface CueOptions {
  /** Lines per cue (the caption style's max lines). */
  maxLines: number;
  charsPerLine?: number;
  /** The end of the audio (µs): no cue lasts past it. */
  durationUs: number;
}

/** Timed words as caption cues (see the header), with their words (µs, absolute). */
export function cuesFromWords(words: readonly TimedWord[], options: CueOptions): SubtitleCue[] {
  const maxLines = Math.max(1, Math.floor(options.maxLines));
  const perLine = Math.max(8, options.charsPerLine ?? CHARS_PER_LINE);
  // Phrases: cut at sentence ends and pauses.
  const phrases: TimedWord[][] = [];
  let current: TimedWord[] = [];
  for (const word of words) {
    const prev = current[current.length - 1];
    if (prev && (SENTENCE_END.test(prev.text) || word.startUs - prev.endUs >= PAUSE_US)) {
      phrases.push(current);
      current = [];
    }
    current.push(word);
  }
  if (current.length > 0) phrases.push(current);
  // Cues: each phrase in as few, even cues as fit.
  const groups: TimedWord[][] = [];
  for (const phrase of phrases) {
    let at = 0;
    for (const count of phraseCues(
      phrase.map((word) => word.text),
      maxLines,
      perLine,
    )) {
      groups.push(phrase.slice(at, at + count));
      at += count;
    }
  }

  const cues: SubtitleCue[] = [];
  groups.forEach((group, index) => {
    const first = group[0] as TimedWord;
    const last = group[group.length - 1] as TimedWord;
    const next = groups[index + 1]?.[0];
    const limit = Math.min(options.durationUs, next ? next.startUs : Infinity);
    const held = next && next.startUs - last.endUs < PAUSE_US ? next.startUs : last.endUs + HOLD_US;
    const end = Math.min(limit, Math.max(held, last.endUs, first.startUs + MIN_CUE_US));
    cues.push({
      startUs: first.startUs,
      endUs: Math.max(first.startUs + 1, end),
      text: cueText(
        group.map((word) => word.text),
        perLine,
      ),
      words: group.map((word) => ({ ...word })),
    });
  });
  return cues;
}
