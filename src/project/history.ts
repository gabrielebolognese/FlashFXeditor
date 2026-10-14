// Rotating backups in history/ (spec §9.7, §15): project-YYYYMMDD-HHMMSS.json, newest 20 kept.
// Stamps are UTC so a daylight-saving fall-back never makes a new backup sort as the oldest one.
import type { FsDir } from "./fs.js";

export const HISTORY_LIMIT = 20;

const BACKUP_NAME = /^project-(\d{8})-(\d{6})(?:-(\d+))?\.json$/;

const pad = (value: number, width = 2) => String(value).padStart(width, "0");

export function backupStamp(date: Date): string {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
}

/** A backup name for `date` not in `existing`; saves within the same second get -2, -3, ... */
export function backupName(date: Date, existing: ReadonlySet<string>): string {
  const base = `project-${backupStamp(date)}`;
  let name = `${base}.json`;
  for (let n = 2; existing.has(name); n++) name = `${base}-${n}.json`;
  return name;
}

/** Sortable key of a backup name (chronological), or null for files that are not backups. */
export function backupSortKey(name: string): string | null {
  const match = BACKUP_NAME.exec(name);
  if (!match) return null;
  return `${match[1]}${match[2]}${pad(Number(match[3] ?? 1), 6)}`;
}

/** Backups to delete so that `keep` remain, oldest first. Other files are never touched. */
export function backupsToDelete(names: readonly string[], keep = HISTORY_LIMIT): string[] {
  const backups = names
    .map((name) => ({ name, key: backupSortKey(name) }))
    .filter((entry): entry is { name: string; key: string } => entry.key !== null)
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return backups.slice(0, Math.max(0, backups.length - keep)).map((entry) => entry.name);
}

/** Deletes the oldest backups beyond `keep`; returns the deleted names. */
export async function rotateHistory(history: FsDir, keep = HISTORY_LIMIT): Promise<string[]> {
  const files = (await history.list()).filter((entry) => entry.kind === "file").map((entry) => entry.name);
  const doomed = backupsToDelete(files, keep);
  for (const name of doomed) await history.remove(name);
  return doomed;
}
