// Media files inside the project folder (spec §9.1 copy mode, §9.7): sources are copied into media/
// under names that never overwrite another file; poster thumbnails live in cache/thumbs/, video
// sample indexes in cache/index/ and waveform peaks in cache/peaks/.
import type { FsDir, WriteFileOptions } from "./fs.js";
import { subdir } from "./layout.js";

export const MEDIA_DIR = "media";
export const THUMBS_DIR = "cache/thumbs";
export const INDEX_DIR = "cache/index";
export const PEAKS_DIR = "cache/peaks";

const MAX_NAME_LENGTH = 180;
// Characters Windows, macOS or the File System Access API refuse in names, and control characters.
const INVALID = /[<>:"/\\|?*\u0000-\u001f\u007f]/g;
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

function splitExtension(name: string): [string, string] {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
}

/** A name every file system accepts, never hidden (no leading dot); keeps the extension. */
export function safeFileName(name: string): string {
  const trimmed = name.replace(INVALID, "_").replace(/[. ]+$/, "").trim();
  const cleaned = trimmed.startsWith(".") ? `_${trimmed}` : trimmed;
  let [base, ext] = splitExtension(cleaned);
  if (base === "" || RESERVED.test(base)) base = `_${base}`;
  ext = ext.slice(0, 16);
  return base.slice(0, MAX_NAME_LENGTH - ext.length) + ext;
}

/**
 * `name`, or "name (2).ext", "name (3).ext"... the first that is not in `taken` (lower-case names:
 * Windows and macOS compare names without case). Adds the result to `taken`.
 */
export function uniqueName(taken: Set<string>, name: string): string {
  const [base, ext] = splitExtension(name);
  let candidate = name;
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${base} (${n})${ext}`;
  taken.add(candidate.toLowerCase());
  return candidate;
}

/** Lower-case names of the files in a directory. */
export async function takenNames(dir: FsDir): Promise<Set<string>> {
  return new Set((await dir.list()).map((entry) => entry.name.toLowerCase()));
}

/** The directory and file name of a relative path. */
async function locate(root: FsDir, relPath: string, create: boolean): Promise<[FsDir, string] | null> {
  const parts = relPath.split("/");
  const name = parts.pop() ?? "";
  if (parts.length === 0) return [root, name];
  if (create) return [await subdir(root, parts.join("/")), name];
  let dir: FsDir | null = root;
  for (const part of parts) {
    dir = await dir.dir(part);
    if (!dir) return null;
  }
  return [dir, name];
}

/** The file at a project-relative path; null when it (or a folder on the way) does not exist. */
export async function resolveFile(root: FsDir, relPath: string): Promise<File | null> {
  const found = await locate(root, relPath, false);
  return found ? found[0].getFile(found[1]) : null;
}

/** Writes a blob at a project-relative path, creating folders on the way. */
export async function writeFileAt(root: FsDir, relPath: string, data: Blob, options?: WriteFileOptions): Promise<void> {
  const found = await locate(root, relPath, true);
  if (!found) throw new Error(`Could not create ${relPath}`);
  await found[0].writeFile(found[1], data, options);
}

export async function removeFileAt(root: FsDir, relPath: string): Promise<void> {
  const found = await locate(root, relPath, false);
  if (found) await found[0].remove(found[1]);
}

/**
 * Copies `file` into media/ under a safe, unique version of `name` (adding it to `taken`).
 * Returns the project-relative path. A failed or aborted copy leaves no file behind.
 */
export async function copyIntoMedia(root: FsDir, file: Blob, name: string, taken: Set<string>, options: WriteFileOptions = {}): Promise<string> {
  const mediaDir = await subdir(root, MEDIA_DIR);
  const fileName = uniqueName(taken, safeFileName(name));
  try {
    await mediaDir.writeFile(fileName, file, options);
  } catch (error) {
    await mediaDir.remove(fileName).catch(() => undefined);
    throw error;
  }
  return `${MEDIA_DIR}/${fileName}`;
}

/** Where a media item's poster thumbnail is cached (disposable). */
export function posterPath(mediaId: string): string {
  return `${THUMBS_DIR}/${mediaId}.poster.webp`;
}

/** Where a video's sample index is cached (disposable, spec §9.2). */
export function sampleIndexPath(mediaId: string): string {
  return `${INDEX_DIR}/${mediaId}.bin`;
}

/** Where a media item's waveform peaks are cached (disposable, spec §9.6). */
export function peaksPath(mediaId: string): string {
  return `${PEAKS_DIR}/${mediaId}.bin`;
}
