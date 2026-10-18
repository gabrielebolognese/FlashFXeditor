// The open project's cache (spec §9.7 "Cache is disposable: deleting it only costs regeneration. A
// Clear cache button exists in settings", §11 Project section "cache size, clear cache"; Batch 42):
// its size, measured when the Project section or Settings shows it, and Clear cache, which asks first,
// detaches the media and preview services (thumbnail sheets, posters, peaks, proxies, sample indexes,
// decoders: nothing holds or writes a cache file meanwhile), deletes cache/ and attaches them again, so
// everything is made again in the background from the media. Linked media keep their handles (IndexedDB).
import { createStore } from "../core/store/createStore.js";
import { cacheSize, clearCache, formatBytes, type CacheSize } from "../project/cache.js";
import { errorMessage } from "../project/errorMessage.js";
import { showToast } from "../ui/toasts.js";
import { appView, closeDialog, currentSession, refuseReadOnly, showDialog, withMediaDetached } from "./projectController.js";
import { actions } from "./services.js";

export interface CacheInfo {
  /** The last measure, or null before one (or with no project). */
  size: CacheSize | null;
  measuring: boolean;
  clearing: boolean;
}

export const cacheInfo = createStore<CacheInfo>({ size: null, measuring: false, clearing: false });

const patch = (next: Partial<CacheInfo>) => cacheInfo.set((state) => ({ ...state, ...next }));

/** "1.2 GB · 340 files", "Empty", "Measuring…" */
export function cacheText(info: CacheInfo): string {
  if (info.clearing) return "Clearing…";
  if (!info.size) return info.measuring ? "Measuring…" : "--";
  if (info.size.files === 0) return "Empty";
  return `${formatBytes(info.size.bytes)} · ${info.size.files} file${info.size.files === 1 ? "" : "s"}`;
}

/** Measures cache/ of the open project. */
export async function measureCache(): Promise<void> {
  const session = currentSession();
  if (!session) {
    patch({ size: null, measuring: false });
    return;
  }
  patch({ measuring: true });
  try {
    const size = await cacheSize(session.dir);
    if (currentSession() === session) patch({ size });
  } catch (error) {
    console.warn("[cache] could not measure the cache", error);
  } finally {
    patch({ measuring: false });
  }
}

/** `project.clearCache`: asks first (proxies of long videos take a while to make again). */
export function requestClearCache(): void {
  const session = currentSession();
  // TODO(batch 43): refused while an export runs (it writes cache/export-temp/).
  if (!session || cacheInfo.getState().clearing) return;
  if (session.readOnly) {
    refuseReadOnly("clear the cache");
    return;
  }
  showDialog({ kind: "clearCache" });
  void measureCache();
}

/** The dialog's Clear cache. */
export async function clearProjectCache(): Promise<void> {
  closeDialog();
  const session = currentSession();
  if (!session || cacheInfo.getState().clearing) return;
  if (session.readOnly) {
    refuseReadOnly("clear the cache");
    return;
  }
  const before = cacheInfo.getState().size;
  patch({ clearing: true });
  try {
    await withMediaDetached((dir) => clearCache(dir));
    showToast({
      tone: "success",
      message: before && before.bytes > 0 ? `Cleared ${formatBytes(before.bytes)} of cache` : "Cleared the cache",
      detail: "Thumbnails, waveforms and proxies are made again in the background.",
    });
  } catch (error) {
    console.error("[cache] clear failed", error);
    showToast({ tone: "error", message: "Can't clear the cache", detail: errorMessage(error) });
  } finally {
    patch({ clearing: false });
    void measureCache();
  }
}

export function installCacheController(): () => void {
  const stops = [
    actions.register("project.clearCache", requestClearCache, { enabled: () => currentSession() !== null && !cacheInfo.getState().clearing }),
    // Another project: the old measure does not apply.
    appView.select(
      (view) => view.project?.id ?? null,
      () => patch({ size: null }),
    ),
  ];
  return () => {
    for (const stop of stops) stop();
  };
}
