// The project's disposable cache (spec §9.7 cache/: index, proxies, thumbs, peaks, text, export-temp):
// its size and Clear cache (§11 Project section, the settings). Clearing only costs regeneration: the
// app detaches the services that hold cache files before and attaches them again after
// (app/cacheController.ts). Linked media keep their file handles: they live in IndexedDB, not here.
import type { FsDir } from "./fs.js";
import { ensureFolderLayout } from "./layout.js";

export const CACHE_DIR = "cache";

export interface CacheSize {
  bytes: number;
  files: number;
}

async function measure(dir: FsDir, total: CacheSize): Promise<void> {
  for (const entry of await dir.list()) {
    if (entry.kind === "directory") {
      const inner = await dir.dir(entry.name);
      if (inner) await measure(inner, total);
      continue;
    }
    const file = await dir.getFile(entry.name).catch(() => null);
    if (!file) continue;
    total.bytes += file.size;
    total.files += 1;
  }
}

/** The bytes and files in cache/ (none when the folder is missing). */
export async function cacheSize(root: FsDir): Promise<CacheSize> {
  const total: CacheSize = { bytes: 0, files: 0 };
  const cache = await root.dir(CACHE_DIR);
  if (cache) await measure(cache, total);
  return total;
}

/** Deletes every file below `dir`, then the folders it emptied. */
async function empty(dir: FsDir): Promise<number> {
  let removed = 0;
  for (const entry of await dir.list()) {
    if (entry.kind === "directory") {
      const inner = await dir.dir(entry.name);
      if (inner) removed += await empty(inner);
    }
    await dir.remove(entry.name);
    if (entry.kind === "file") removed += 1;
  }
  return removed;
}

/**
 * Clear cache: every file in cache/ deleted, the §9.7 folders there again. Returns the files deleted.
 * Run it with nothing reading or writing the cache.
 */
export async function clearCache(root: FsDir): Promise<number> {
  const cache = await root.dir(CACHE_DIR);
  const removed = cache ? await empty(cache) : 0;
  await ensureFolderLayout(root);
  return removed;
}

/** "0 bytes", "820 KB", "12.4 MB", "1.2 GB" (powers of 1000, as file managers show sizes). */
export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} byte${bytes === 1 ? "" : "s"}`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1000;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${value >= 100 ? Math.round(value) : Math.round(value * 10) / 10} ${units[unit]}`;
}
