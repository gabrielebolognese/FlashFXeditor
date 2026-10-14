// The project folder layout (spec §9.7).
import type { FsDir } from "./fs.js";

export const PROJECT_FILE = "project.json";
/** Written before project.json on every save; a newer one on open means a save was interrupted. */
export const PROJECT_TMP_FILE = "project.json.tmp";
export const SESSION_FILE = "session.json";
export const HISTORY_DIR = "history";

/** Folders every project has. The cache is disposable: deleting it only costs regeneration. */
export const PROJECT_FOLDERS = [
  "media",
  "cache/index",
  "cache/proxies",
  "cache/thumbs",
  "cache/peaks",
  "cache/text",
  "cache/export-temp",
  HISTORY_DIR,
  "exports",
  "presets/text",
] as const;

/** Creates the missing folders of the layout; existing ones are left alone. */
export async function ensureFolderLayout(root: FsDir): Promise<void> {
  for (const path of PROJECT_FOLDERS) await subdir(root, path);
}

/** The directory at a relative path, created on the way. */
export async function subdir(root: FsDir, path: string): Promise<FsDir> {
  let dir = root;
  for (const part of path.split("/")) {
    const next = await dir.dir(part, { create: true });
    if (!next) throw new Error(`Could not create ${path} in ${root.name}`);
    dir = next;
  }
  return dir;
}
