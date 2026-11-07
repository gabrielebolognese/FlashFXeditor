// Image sequence rules shared by the model, the validator and the importer (Batch 64, spec §21.11):
// the printf-style frame pattern (`frame_%05d.png`), the file name of frame n, and the sequence's duration.
import { frameToUs } from "./time.js";
import type { ImageSequence, Us } from "./types.js";

/** Frame file types a sequence can hold. */
export const SEQUENCE_EXTENSIONS = ["png", "webp"] as const;

/** `prefix%d.ext` or `prefix%0Nd.ext` (N 1..9): one number, a .png or .webp extension, no folders. */
const PATTERN = /^([^/\%]*)%(0([1-9]))?d([^/\%]*)\.(png|webp)$/i;

export interface ParsedPattern {
  prefix: string;
  /** Zero-padded width of the number; 0 for plain `%d`. */
  width: number;
  suffix: string;
  extension: string;
}

/** The parts of a frame pattern, or null when it is not one. */
export function parsePattern(pattern: string): ParsedPattern | null {
  const match = PATTERN.exec(pattern);
  if (!match) return null;
  return { prefix: match[1] as string, width: match[3] ? Number(match[3]) : 0, suffix: match[4] as string, extension: (match[5] as string).toLowerCase() };
}

/** The file name of frame number `n` (the value %d takes); null for an invalid pattern or a negative number. */
export function frameFileName(pattern: string, n: number): string | null {
  const parsed = parsePattern(pattern);
  if (!parsed || !Number.isInteger(n) || n < 0) return null;
  const digits = String(n).padStart(parsed.width, "0");
  const dot = pattern.lastIndexOf(".");
  return `${parsed.prefix}${digits}${parsed.suffix}${pattern.slice(dot)}`;
}

/** Playing time of a sequence: its frames at its own rate (integer microseconds). */
export function sequenceDurationUs(sequence: Pick<ImageSequence, "count" | "fps">): Us {
  return frameToUs(sequence.count, sequence.fps);
}

/** What is wrong with a sequence record, in plain words; empty when it is fine. */
export function sequenceRecordIssues(sequence: ImageSequence): string[] {
  const issues: string[] = [];
  if (!parsePattern(sequence.pattern)) issues.push(`pattern "${sequence.pattern}" must be like frame_%05d.png (one %d or %0Nd, a .png or .webp extension)`);
  if (!Number.isInteger(sequence.first) || sequence.first < 0) issues.push(`first ${sequence.first} must be an integer >= 0`);
  if (!Number.isInteger(sequence.count) || sequence.count < 1) issues.push(`count ${sequence.count} must be an integer >= 1`);
  if (!(Number.isInteger(sequence.fps.num) && sequence.fps.num > 0 && Number.isInteger(sequence.fps.den) && sequence.fps.den > 0)) {
    issues.push(`fps ${sequence.fps.num}/${sequence.fps.den} must be a ratio of positive integers`);
  }
  const dir = sequence.dir;
  if (dir === "" || dir.startsWith("/") || dir.split("/").some((part) => part === "" || part === "." || part === "..")) issues.push(`dir "${dir}" must be a relative path inside the project folder`);
  return issues;
}
