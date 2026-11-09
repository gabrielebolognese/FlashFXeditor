// Collect project and the project zip (spec §21.25, Batch 81): what is copied into the project folder and
// what a zip of it holds. Pure: the controller (`app/extrasController.ts`) does the copying and zipping.
import type { MediaId, MediaItem } from "../core/document/types.js";

/** Media linked to a file outside the project folder (a handle, not a copy in media/); image sequences apart. */
export function linkedMedia(media: Readonly<Record<MediaId, MediaItem>>): MediaItem[] {
  return Object.values(media).filter((item) => "handleKey" in item.file && !item.sequence);
}

/** Linked image sequences: a relink cannot stand one folder of frames for a file, so collect leaves them. */
export function linkedSequences(media: Readonly<Record<MediaId, MediaItem>>): MediaItem[] {
  return Object.values(media).filter((item) => "handleKey" in item.file && item.sequence !== undefined);
}

/** Top-level entries of the project folder a zip leaves out: caches and history are rebuilt, exports are outputs, session.json is per machine. */
const EXCLUDED_TOP = new Set(["cache", "history", "exports", "session.json", "project.json.tmp"]);

/** Whether the project-relative `path` (`/` separated) goes into the zip. */
export function inProjectZip(path: string): boolean {
  const top = path.split("/")[0] ?? "";
  return !EXCLUDED_TOP.has(top);
}

/** The entry name of `path` in a zip whose files all live in the folder `root` (a name safe for Windows). */
export function zipEntryPath(root: string, path: string): string {
  return `${root}/${path}`;
}

/** The toast's line for a collect: what was copied, what was already inside, what could not be. */
export function collectSummary(copied: number, skippedSequences: number, failed: number): string {
  const parts = [copied === 0 ? "Nothing needed copying" : `${copied} ${copied === 1 ? "file" : "files"} copied into media/`];
  if (skippedSequences > 0) parts.push(`${skippedSequences} linked image ${skippedSequences === 1 ? "sequence" : "sequences"} left as linked`);
  if (failed > 0) parts.push(`${failed} could not be read`);
  return parts.join(" · ");
}
