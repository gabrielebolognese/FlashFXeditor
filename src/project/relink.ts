// Relink a folder (spec §12 "matched by name/size when relinking folders", Batch 41): the folder's
// files (recursively) are matched to offline media by file name: the item's own file name first (the
// copied or linked path's), then its name in the panel (the imported file's name, unless renamed),
// case-insensitive. When the item knows its source size (imported since Batch 41) only a file of that
// size matches; without one, a single name match does (the caller checks its kind and duration).
import type { MediaId, MediaItem } from "../core/document/types.js";
import type { FileHandleLike } from "./mediaSources.js";

/** The browser's FileSystemDirectoryHandle as used here (fakes in tests). */
export interface DirHandleLike {
  readonly kind: "directory";
  readonly name: string;
  values(): AsyncIterable<DirHandleLike | FileHandleLike>;
}

export interface FolderFile {
  name: string;
  /** Relative to the picked folder, its own name first: "Footage/day 1/clip.mp4". */
  path: string;
  handle: FileHandleLike;
}

/** A folder walk stops after this many files (a drive root picked by mistake). */
export const MAX_FOLDER_FILES = 20_000;

/** Every file under `dir`, depth first; `truncated` when the walk stopped at `limit`. */
export async function listFolderFiles(dir: DirHandleLike, limit = MAX_FOLDER_FILES): Promise<{ files: FolderFile[]; truncated: boolean }> {
  const files: FolderFile[] = [];
  const walk = async (folder: DirHandleLike, prefix: string): Promise<boolean> => {
    for await (const entry of folder.values()) {
      if (entry.kind === "file") {
        if (files.length >= limit) return false;
        files.push({ name: entry.name, path: `${prefix}${entry.name}`, handle: entry });
      } else if (!(await walk(entry, `${prefix}${entry.name}/`))) {
        return false;
      }
    }
    return true;
  };
  const complete = await walk(dir, `${dir.name}/`);
  return { files, truncated: !complete };
}

/** The file names a media item's file may have, lower case, most specific first. */
export function relinkNames(item: MediaItem): string[] {
  const path = "relPath" in item.file ? item.file.relPath : item.file.pathHint;
  const own = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  return [...new Set([own, item.name.toLowerCase()].filter(Boolean))];
}

/**
 * The folder file each item is relinked to: by name (`relinkNames` order), then by size when the item
 * has one (`sizeOf` reads a candidate's size; only name matches are read). An item matches nothing when
 * no name fits, no candidate has its size, or (without a size) several files share its name. A file
 * goes to one item at most.
 */
export async function matchFolderFiles(items: readonly MediaItem[], files: readonly FolderFile[], sizeOf: (file: FolderFile) => Promise<number | null>): Promise<Map<MediaId, FolderFile>> {
  const byName = new Map<string, FolderFile[]>();
  for (const file of files) {
    const key = file.name.toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), file]);
  }
  const sizes = new Map<FolderFile, Promise<number | null>>();
  const size = (file: FolderFile) => {
    let known = sizes.get(file);
    if (!known) {
      known = sizeOf(file).catch(() => null);
      sizes.set(file, known);
    }
    return known;
  };
  const taken = new Set<FolderFile>();
  const matches = new Map<MediaId, FolderFile>();
  for (const item of items) {
    for (const name of relinkNames(item)) {
      const candidates = (byName.get(name) ?? []).filter((file) => !taken.has(file));
      let found: FolderFile | null = null;
      if (item.size !== undefined) {
        for (const candidate of candidates) {
          if ((await size(candidate)) === item.size) {
            found = candidate;
            break;
          }
        }
      } else if (candidates.length === 1) {
        found = candidates[0] ?? null;
      }
      if (found) {
        taken.add(found);
        matches.set(item.id, found);
        break;
      }
    }
  }
  return matches;
}
