// Crash recovery (spec §15): a project.json.tmp newer than project.json, with different and valid
// content, means a save was interrupted after the tmp write. It is offered for restore.
import type { Project } from "../core/document/types.js";
import type { FsDir, FsFile } from "./fs.js";
import { PROJECT_TMP_FILE } from "./layout.js";
import { parseProjectFile } from "./projectFile.js";

export interface Recovery {
  project: Project;
  /** lastModified of the tmp file, ms. */
  modified: number;
  /** lastModified of project.json, ms (null when it does not exist). */
  savedModified: number | null;
}

/** Stale or invalid tmp files are deleted when `writable`. */
export async function findRecovery(dir: FsDir, saved: FsFile | null, writable: boolean): Promise<Recovery | null> {
  const tmp = await dir.readFile(PROJECT_TMP_FILE);
  if (!tmp) return null;
  if ((!saved || tmp.lastModified > saved.lastModified) && tmp.text !== saved?.text) {
    try {
      return { project: parseProjectFile(tmp.text), modified: tmp.lastModified, savedModified: saved?.lastModified ?? null };
    } catch (error) {
      console.warn("[recovery] ignoring an invalid project.json.tmp", error);
    }
  }
  if (writable) await discardRecovery(dir);
  return null;
}

export async function discardRecovery(dir: FsDir): Promise<void> {
  try {
    await dir.remove(PROJECT_TMP_FILE);
  } catch (error) {
    console.warn("[recovery] could not delete project.json.tmp", error);
  }
}
