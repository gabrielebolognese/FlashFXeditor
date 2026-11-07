// Image sequences on import (Batch 64, spec §21.11): numbered PNG or WebP frames of one size become one
// media item. Pure: finding the sequences in a list of dropped files, naming them, and the media record.
// - A sequence is the longest run of consecutive numbers among the files of one folder that share a
//   prefix and an extension (`frame_00001.png`, `frame_00002.png`, ...). Numbers padded to one width
//   (`%05d`) or not padded at all (`%d`) are told apart; a mix of widths is not a sequence.
// - Files outside the run (gaps, other numbers) stay ordinary images.
import { frameFileName } from "../core/document/sequence.js";
import { sequenceDurationUs } from "../core/document/sequence.js";
import type { ImageSequence, MediaItem, Rational } from "../core/document/types.js";
import { extensionOf } from "./mediaKinds.js";

/** The fewest frames that offer a sequence (two numbered images could be a gallery: the importer asks). */
export const MIN_SEQUENCE_FRAMES = 2;

/** A file with the path it came from inside a dropped folder ("Folder/sub/frame_001.png"); none for a plain file. */
export interface NamedFile<T> {
  /** The item itself, handed back in `files`. */
  item: T;
  /** File name. */
  name: string;
  /** Folder of the file ("" for loose files). */
  folder: string;
}

export interface SequenceCandidate<T> {
  /** The folder the frames are in ("" is never offered: loose files are not a folder). */
  folder: string;
  pattern: string;
  first: number;
  count: number;
  /** The frames in order. */
  files: T[];
  /** Files of the same family outside the run (a gap breaks it): left as images. */
  leftOver: T[];
}

const NUMBERED = /^(.*?)(\d+)(\.(?:png|webp))$/i;

interface Numbered<T> {
  item: T;
  value: number;
  digits: string;
}

/** The folder part of a path ("a/b/c.png" -> "a/b"; "c.png" -> ""). */
export function folderOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "" : path.slice(0, slash);
}

/** The last path segment ("a/b" -> "b"). */
export function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** The sequences among `files`: groups of at least `MIN_SEQUENCE_FRAMES` consecutive numbered frames in a folder. */
export function detectSequences<T>(files: readonly NamedFile<T>[]): SequenceCandidate<T>[] {
  const families = new Map<string, { folder: string; prefix: string; extension: string; frames: Numbered<T>[] }>();
  for (const file of files) {
    if (file.folder === "") continue;
    const match = NUMBERED.exec(file.name);
    if (!match) continue;
    const prefix = match[1] as string;
    const digits = match[2] as string;
    const extension = (match[3] as string).toLowerCase();
    if (digits.length > 9) continue;
    const key = `${file.folder}\u0000${prefix}\u0000${extension}`;
    let family = families.get(key);
    if (!family) families.set(key, (family = { folder: file.folder, prefix, extension, frames: [] }));
    family.frames.push({ item: file.item, value: Number(digits), digits });
  }
  const found: SequenceCandidate<T>[] = [];
  for (const family of families.values()) {
    const { frames } = family;
    if (frames.length < MIN_SEQUENCE_FRAMES) continue;
    const width = numberWidth(frames);
    if (width === null) continue;
    frames.sort((a, b) => a.value - b.value);
    // The longest run of consecutive numbers (the earliest on a tie); equal numbers cannot both be in it.
    let best: Numbered<T>[] = [];
    let run: Numbered<T>[] = [];
    for (const frame of frames) {
      const last = run[run.length - 1];
      if (last && frame.value === last.value + 1) run.push(frame);
      else if (!last || frame.value !== last.value) run = [frame];
      if (run.length > best.length) best = run;
    }
    if (best.length < MIN_SEQUENCE_FRAMES) continue;
    const inRun = new Set(best.map((frame) => frame.item));
    const pattern = `${family.prefix}%${width > 0 ? `0${width}` : ""}d${family.extension}`;
    found.push({ folder: family.folder, pattern, first: (best[0] as Numbered<T>).value, count: best.length, files: best.map((frame) => frame.item), leftOver: frames.map((frame) => frame.item).filter((item) => !inRun.has(item)) });
  }
  return found.sort((a, b) => (a.folder < b.folder ? -1 : a.folder > b.folder ? 1 : a.pattern < b.pattern ? -1 : 1));
}

/**
 * The zero-padded width the numbers share (0 for plain `%d`), or null when they mix widths: a number
 * with leading zeros fixes the width, and every other number must have it too.
 */
function numberWidth<T>(frames: readonly Numbered<T>[]): number | null {
  const padded = frames.some((frame) => frame.digits.length > 1 && frame.digits.startsWith("0"));
  if (padded) {
    const width = (frames[0] as Numbered<T>).digits.length;
    return frames.every((frame) => frame.digits.length === width) ? width : null;
  }
  // No leading zeros: one length (frame_10 .. frame_99, written with `%d`) or varying ones (1 .. 120).
  return 0;
}

/** The sequence a media item holds, as a `NamedFile`-free record. */
export function sequenceRecord(candidate: { pattern: string; first: number; count: number }, dir: string, fps: Rational): ImageSequence {
  return { dir, pattern: candidate.pattern, first: candidate.first, count: candidate.count, fps: { ...fps } };
}

/** The file names of a sequence in order. */
export function sequenceFileNames(sequence: ImageSequence): string[] {
  return Array.from({ length: sequence.count }, (_, i) => frameFileName(sequence.pattern, sequence.first + i) as string);
}

/** The project-relative paths of a sequence's frames in order. */
export function sequencePaths(sequence: ImageSequence): string[] {
  return sequenceFileNames(sequence).map((name) => `${sequence.dir}/${name}`);
}

/** The label shown for a sequence ("smoke_%05d.png"): its folder's name when it has one. */
export function sequenceName(candidate: { folder: string; pattern: string }): string {
  const folder = baseName(candidate.folder);
  return folder !== "" ? folder : candidate.pattern;
}

/** The question of the import dialog (spec §21.11). */
export function sequenceQuestion(frames: number, fpsLabel: string): string {
  return `Import as image sequence (${frames} frames) at ${fpsLabel}?`;
}

/** The media record of a copied sequence: the first frame is its file, the picture size comes from it. */
export function sequenceMediaItem(fields: { id: string; name: string; addedAt: string; sequence: ImageSequence; width: number; height: number; codec: string; size?: number }): MediaItem {
  const { sequence } = fields;
  const item: MediaItem = {
    id: fields.id,
    kind: "image",
    name: fields.name,
    file: { relPath: sequencePaths(sequence)[0] as string },
    durationUs: sequenceDurationUs(sequence),
    width: fields.width,
    height: fields.height,
    fps: { ...sequence.fps },
    hasAudio: false,
    codec: fields.codec,
    analysis: { thumbs: "none", peaks: "none" },
    addedAt: fields.addedAt,
    sequence,
  };
  if (fields.size !== undefined) item.size = fields.size;
  return item;
}

/** True for a file name a sequence can hold (png or webp). */
export function isSequenceFrameName(name: string): boolean {
  const ext = extensionOf(name);
  return ext === "png" || ext === "webp";
}
