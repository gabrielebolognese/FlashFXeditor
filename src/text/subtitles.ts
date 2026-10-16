// SubRip (.srt) and WebVTT (.vtt) subtitle files (spec §10.5 Import / Export). Pure: times are integer
// microseconds here; the caption edits turn them into frames through core/document/time.ts.
// Parsing is lenient: a byte order mark, CRLF or CR line ends, missing cue numbers, blank lines around
// blocks, a dot or comma before the milliseconds, hours left out and 1-3 digit fractions are read;
// blocks without a timing line are skipped and counted. Text keeps its line breaks; markup is dropped
// (rich text is out of scope, spec §10.1): SRT's HTML-like and {\...} tags, VTT's tags, entities
// decoded. VTT inline timestamps (`<00:00:01.200>word`, karaoke) become word timings.
// Writing: SRT blocks `n`, `HH:MM:SS,mmm --> HH:MM:SS,mmm`, the text; VTT the `WEBVTT` header and
// `HH:MM:SS.mmm` timings with `&`, `<`, `>` escaped. Times are rounded to the millisecond; empty cues
// are left out and blank lines inside a text are closed up (they would end the block).

export type SubtitleFormat = "srt" | "vtt";

export interface SubtitleWord {
  text: string;
  startUs: number;
  endUs: number;
}

export interface SubtitleCue {
  startUs: number;
  endUs: number;
  text: string;
  /** VTT karaoke timings, when the cue has inline timestamps. */
  words?: SubtitleWord[];
}

export interface ParsedSubtitles {
  format: SubtitleFormat;
  cues: SubtitleCue[];
  /** Blocks that were not cues (no timing line, an end before the start). */
  skipped: number;
}

const US_PER_MS = 1000;

/** `HH:MM:SS,mmm` / `MM:SS.mmm` (and a few lenient variants) in microseconds, or null. */
export function parseTimestamp(value: string): number | null {
  const match = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[,.](\d{1,3}))?$/.exec(value.trim());
  if (!match) return null;
  const [, h = "0", m = "0", s = "0", fraction = "0"] = match;
  const minutes = Number(m);
  const seconds = Number(s);
  if (minutes > 59 || seconds > 59) return null;
  const ms = Number(fraction.padEnd(3, "0"));
  return (((Number(h) * 60 + minutes) * 60 + seconds) * 1000 + ms) * US_PER_MS;
}

/** `us` as a timestamp of `format`: `00:01:02,345` (SRT) or `00:01:02.345` (VTT), to the nearest millisecond. */
export function formatTimestamp(us: number, format: SubtitleFormat): string {
  const total = Math.max(0, Math.round(us / US_PER_MS));
  const ms = total % 1000;
  const seconds = Math.floor(total / 1000) % 60;
  const minutes = Math.floor(total / 60000) % 60;
  const hours = Math.floor(total / 3600000);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(hours)}:${two(minutes)}:${two(seconds)}${format === "srt" ? "," : "."}${String(ms).padStart(3, "0")}`;
}

/** Text with a BOM dropped and every line end as `\n`. */
function normalize(text: string): string {
  return text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
}

/** Blocks separated by blank (or whitespace-only) lines, each as its lines. */
function blocks(text: string): string[][] {
  return normalize(text)
    .split(/\n[ \t]*\n/)
    .map((block) => block.split("\n").map((line) => line.replace(/[ \t]+$/, "")))
    .map((lines) => {
      while (lines.length > 0 && lines[0]?.trim() === "") lines.shift();
      return lines;
    })
    .filter((lines) => lines.length > 0);
}

/** The start and end of a timing line `start --> end [settings]`, or null. */
function timing(line: string): { startUs: number; endUs: number } | null {
  const match = /^\s*(\S+)\s+-->\s+(\S+)/.exec(line) ?? /^\s*(\S+?)-->(\S+)/.exec(line);
  if (!match) return null;
  const startUs = parseTimestamp(match[1] as string);
  const endUs = parseTimestamp(match[2] as string);
  return startUs === null || endUs === null ? null : { startUs, endUs };
}

const ENTITIES: Readonly<Record<string, string>> = { amp: "&", lt: "<", gt: ">", nbsp: " ", lrm: "‎", rlm: "‏", quot: '"', apos: "'" };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === "#") {
      const code = name[1] === "x" || name[1] === "X" ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/** Cue lines as plain text: tags removed, the lines trimmed, empty ones dropped. */
function plainLines(lines: readonly string[], strip: (line: string) => string): string {
  return lines
    .map((line) => strip(line).trim())
    .filter((line) => line !== "")
    .join("\n");
}

const stripSrt = (line: string) => line.replace(/\{\\[^}]*\}/g, "").replace(/<\/?[a-z][^>]*>/gi, "");

/**
 * A SubRip file's cues, in file order. A timing line inside a block starts a new cue too (files that
 * lost the blank line between two cues), the number line before it dropped.
 */
export function parseSrt(text: string): ParsedSubtitles {
  const cues: SubtitleCue[] = [];
  let skipped = 0;
  for (const lines of blocks(text)) {
    const times = lines.map((line) => (line.includes("-->") ? timing(line) : null));
    const starts = times.flatMap((time, i) => (time ? [i] : []));
    if (starts.length === 0) {
      skipped += 1;
      continue;
    }
    starts.forEach((at, k) => {
      const time = times[at] as { startUs: number; endUs: number };
      let end = starts[k + 1] ?? lines.length;
      if (end < lines.length && end - 1 > at && /^\d+$/.test((lines[end - 1] as string).trim())) end -= 1;
      if (time.endUs < time.startUs) skipped += 1;
      else cues.push({ ...time, text: plainLines(lines.slice(at + 1, end), stripSrt) });
    });
  }
  return { format: "srt", cues, skipped };
}

/** VTT cue text: tags removed, entities decoded, and the inline timestamps as words (karaoke). */
function vttText(lines: readonly string[], cue: { startUs: number; endUs: number }): { text: string; words?: SubtitleWord[] } {
  const raw = lines.join("\n");
  const segments: { text: string; startUs: number }[] = [];
  let startUs = cue.startUs;
  let timed = false;
  let last = 0;
  const pattern = /<((?:\d+:)?\d{1,2}:\d{1,2}\.\d{1,3})>/g;
  for (let match = pattern.exec(raw); match; match = pattern.exec(raw)) {
    const at = parseTimestamp(match[1] as string);
    if (at === null) continue;
    segments.push({ text: raw.slice(last, match.index), startUs });
    startUs = Math.min(cue.endUs, Math.max(startUs, at));
    last = match.index + match[0].length;
    timed = true;
  }
  segments.push({ text: raw.slice(last), startUs });
  const clean = (value: string) => decodeEntities(value.replace(/<[^>]*>/g, ""));
  const text = plainLines(clean(raw).split("\n"), (line) => line);
  if (!timed) return { text };
  const words: SubtitleWord[] = [];
  segments.forEach((segment, i) => {
    const tokens = clean(segment.text).split(/\s+/).filter((token) => token !== "");
    if (tokens.length === 0) return;
    const endUs = i + 1 < segments.length ? (segments[i + 1] as { startUs: number }).startUs : cue.endUs;
    const step = (endUs - segment.startUs) / tokens.length;
    tokens.forEach((token, k) => words.push({ text: token, startUs: Math.round(segment.startUs + k * step), endUs: Math.round(segment.startUs + (k + 1) * step) }));
  });
  return words.length > 0 ? { text, words } : { text };
}

/** A WebVTT file's cues, in file order (the header, NOTE, STYLE and REGION blocks are not cues). */
export function parseVtt(text: string): ParsedSubtitles {
  const cues: SubtitleCue[] = [];
  let skipped = 0;
  blocks(text).forEach((lines, index) => {
    const head = (lines[0] ?? "").trim();
    if (index === 0 && head.startsWith("WEBVTT")) return;
    if (/^(NOTE|STYLE|REGION)(\s|$)/.test(head)) return;
    const at = lines.findIndex((line) => line.includes("-->"));
    // A cue identifier may come before the timing line; nothing else may.
    const time = at === -1 || at > 1 ? null : timing(lines[at] as string);
    if (!time || time.endUs < time.startUs) {
      skipped += 1;
      return;
    }
    cues.push({ ...time, ...vttText(lines.slice(at + 1), time) });
  });
  return { format: "vtt", cues, skipped };
}

/** The format of a subtitle file: VTT when it starts with `WEBVTT` (or is named `.vtt`), else SRT. */
export function subtitleFormat(text: string, fileName = ""): SubtitleFormat {
  return /^﻿?WEBVTT/.test(text) || /\.vtt$/i.test(fileName) ? "vtt" : "srt";
}

/** A subtitle file's cues, in its format (detected). */
export function parseSubtitles(text: string, fileName = ""): ParsedSubtitles {
  return subtitleFormat(text, fileName) === "vtt" ? parseVtt(text) : parseSrt(text);
}

/** The text of a cue as written: blank lines inside it closed up (a blank line ends a block). */
function writableText(text: string): string {
  return text
    .split(/\r\n?|\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .join("\n");
}

const escapeVtt = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** `cues` as a file of `format` (word timings are not written, spec §10.5). */
export function formatSubtitles(cues: readonly Pick<SubtitleCue, "startUs" | "endUs" | "text">[], format: SubtitleFormat): string {
  const out: string[] = format === "vtt" ? ["WEBVTT", ""] : [];
  let n = 0;
  for (const cue of cues) {
    const text = writableText(cue.text);
    if (text === "") continue;
    n += 1;
    if (format === "srt") out.push(String(n));
    out.push(`${formatTimestamp(cue.startUs, format)} --> ${formatTimestamp(cue.endUs, format)}`, format === "vtt" ? escapeVtt(text) : text, "");
  }
  return out.join("\n");
}
