// Transcripts to caption cues (spec §10.6): Whisper's word chunks become timed words, and the words
// become cues of at most `maxLines` lines of about 32 characters. Pure; times are integer µs from the
// start of the transcribed audio.
// - Words: a chunk's text trimmed; a chunk without letters or digits (a lone "," or "...") joins the
//   word before it; a chunk that does not start with a space is `attached` to the word before it (no
//   space between them when they are written: transformers.js cuts Chinese, Japanese, Thai, Lao and
//   Burmese into pieces without spaces, every other language into words that start with one); bracketed annotations Whisper writes for non-speech ("[Music]", "(laughs)", "♪")
//   are dropped. A word never starts before the one before it, and ends after it starts. Whisper's
//   word times (cross-attention alignment) trail the voice: measured 0.17-0.2 s late on two voices
//   (median; p10 0.08 s, p90 0.24-0.32 s), so they are moved WORD_LEAD_US earlier and a highlighted
//   word lights up as it is spoken, at worst a little early.
// - Cues: the words are cut into phrases at sentence ends (. ! ? …) and at pauses of PAUSE_US or more;
//   a phrase that fits the cue's lines is one cue, a longer one is split into the fewest cues that
//   fit, as even as possible, preferring cuts after a clause end (, ; :) (`phraseCues`), so a sentence
//   never leaves a lone word or two in a cue of its own. A cue the next one would leave on screen for
//   less than MIN_ALONE_US joins the next one when they fit together (Whisper's alignment gives words
//   of zero length: "Yes." and "Okay" can start at the same time).
// - Lines: a cue longer than one line is broken into the fewest lines that fit, as even as possible
//   (the top line never the longer one when they cannot be equal), joined with `\n`. Widths are in
//   columns: a wide character (Chinese, Japanese, Korean) counts two, the space before an attached
//   word none.
// - Timing: a cue spans its first word's start to its last word's end; it is held on screen up to the
//   next cue when that one follows within PAUSE_US (no flicker between cues), else HOLD_US more, and
//   is at least MIN_CUE_US long where there is room.
import type { SubtitleCue, SubtitleWord } from "./subtitles.js";

/** A spoken word, µs from the start of the audio. */
export interface TimedWord extends SubtitleWord {
  /** Written right after the word before it, with no space (see the header). */
  attached?: boolean;
}

/** A word as the line and cue breaks see it. */
export type CueWord = Pick<TimedWord, "text" | "attached">;

/** Columns per caption line (spec §10.6: "max ~32 chars per line"; a wide character counts two). */
export const CHARS_PER_LINE = 32;
/** A silence this long ends a cue. */
export const PAUSE_US = 700_000;
/** A cue stays this long after its last word when no cue follows soon. */
export const HOLD_US = 300_000;
/** The shortest cue (where the next cue leaves room). */
export const MIN_CUE_US = 600_000;
/** A cue the next one leaves on screen for less than this joins it when they fit together: too short to read, and on the frame grid the two could share a frame. */
export const MIN_ALONE_US = 200_000;
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
    const attached = !/^\s/u.test(chunk.text);
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
    words.push({ text, startUs, endUs: Math.max(startUs + 1, clampUs(endRaw, durationUs)), ...(attached && previous && { attached: true }) });
  }
  return words;
}

const clampUs = (us: number, durationUs: number) => Math.min(Math.max(0, durationUs), Math.max(0, us));

const SENTENCE_END = /[.!?…。！？]["'”’)\]]*$/u;
const CLAUSE_END = /[,;:，、；：]["'”’)\]]*$/u;

/** East Asian wide characters (Han, kana, Hangul, CJK punctuation, full-width forms): two columns. */
const WIDE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u3000-\u303f\uff01-\uff60\uffe0-\uffe6]/u;

/** Columns `text` takes on a caption line. */
function columns(text: string): number {
  let n = 0;
  for (const char of text) n += WIDE.test(char) ? 2 : 1;
  return n;
}

/** Columns of `words` on one line: a space before each one but the first, unless it is attached. */
const widthOf = (words: readonly CueWord[]) => words.reduce((sum, word, i) => sum + columns(word.text) + (i > 0 && !word.attached ? 1 : 0), 0);

/** `words` written on one line. */
const joinWords = (words: readonly CueWord[]) => words.map((word, i) => (i > 0 && !word.attached ? ` ${word.text}` : word.text)).join("");

/** The line breaks of `words` (word counts per line) into the fewest lines of at most `perLine` columns, as even as possible. */
export function lineBreaks(words: readonly CueWord[], perLine: number): number[] {
  const n = words.length;
  if (n === 0) return [];
  const width = (from: number, to: number) => widthOf(words.slice(from, to));
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

/** Lines `words` needs at `perLine` columns. */
const linesFor = (words: readonly CueWord[], perLine: number) => lineBreaks(words, perLine).length;

/**
 * A phrase (no sentence end or pause inside) as cues of at most `maxLines` lines (word counts per cue):
 * one cue when it fits, else the fewest cues that fit, then the fewest lines in all (a cue stays on one
 * line where it can), then the smallest sum of squared lengths (even cues), a cut that does not follow
 * a clause end costing as much as half a line more.
 */
export function phraseCues(words: readonly CueWord[], maxLines: number, perLine: number): number[] {
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
      const cut = j < n && !CLAUSE_END.test((words[j - 1] as CueWord).text) ? cutPenalty : 0;
      const candidate: Best = { cues: rest.cues + 1, lines: rest.lines + lines, cost: rest.cost + width * width + cut, counts: [j - i, ...rest.counts] };
      if (!choice || better(candidate, choice)) choice = candidate;
    }
    best[i] = choice;
  }
  return (best[0] as Best).counts;
}

/** The cue text of `words`: their lines (`lineBreaks`) joined with `\n`. */
export function cueText(words: readonly CueWord[], perLine = CHARS_PER_LINE): string {
  const lines: string[] = [];
  let at = 0;
  for (const count of lineBreaks(words, perLine)) {
    lines.push(joinWords(words.slice(at, at + count)));
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
    for (const count of phraseCues(phrase, maxLines, perLine)) {
      groups.push(phrase.slice(at, at + count));
      at += count;
    }
  }
  // A cue the next one leaves on screen for less than MIN_ALONE_US joins it when they fit together.
  for (let i = 0; i < groups.length - 1; ) {
    const group = groups[i] as TimedWord[];
    const next = groups[i + 1] as TimedWord[];
    const joined = [...group, ...next];
    if ((next[0] as TimedWord).startUs - (group[0] as TimedWord).startUs < MIN_ALONE_US && linesFor(joined, perLine) <= maxLines) groups.splice(i, 2, joined);
    else i += 1;
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
      text: cueText(group, perLine),
      words: group.map(({ text, startUs, endUs }) => ({ text, startUs, endUs })),
    });
  });
  return cues;
}
