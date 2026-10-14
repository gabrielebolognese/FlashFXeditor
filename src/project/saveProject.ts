// One project save (spec §15). FSA has no rename, so: write project.json.tmp, copy the previous
// project.json into history/, write project.json, delete the tmp, rotate history. A crash before the
// real write leaves a newer tmp that the next open offers to restore.
import type { FsDir } from "./fs.js";
import { backupName, HISTORY_LIMIT, rotateHistory } from "./history.js";
import { HISTORY_DIR, PROJECT_FILE, PROJECT_TMP_FILE, subdir } from "./layout.js";

export interface SaveResult {
  /** Name of the backup of the previous version in history/, or null when there was none. */
  backup: string | null;
  /** Backups removed by the rotation. */
  rotated: string[];
}

export async function saveProjectFile(root: FsDir, text: string, options: { now: Date; historyLimit?: number }): Promise<SaveResult> {
  await root.writeText(PROJECT_TMP_FILE, text);

  const history = await subdir(root, HISTORY_DIR);
  const previous = await root.readFile(PROJECT_FILE);
  let backup: string | null = null;
  if (previous) {
    const existing = new Set((await history.list()).map((entry) => entry.name));
    backup = backupName(options.now, existing);
    await history.writeText(backup, previous.text);
  }

  await root.writeText(PROJECT_FILE, text);
  await root.remove(PROJECT_TMP_FILE);

  let rotated: string[] = [];
  try {
    rotated = await rotateHistory(history, options.historyLimit ?? HISTORY_LIMIT);
  } catch (error) {
    // The save itself succeeded; an extra backup is harmless until the next rotation.
    console.warn("[save] history rotation failed", error);
  }
  return { backup, rotated };
}
