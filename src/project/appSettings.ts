// Global app settings (spec §3.1: persisted with idb-keyval). For now the autosave delay of the
// Project section (§11), the import mode (§9.1, no UI yet) and the monitoring volume and mute of the
// preview chrome (§14: monitoring only, never the export). TODO(batch 42): the settings panel.
import { createStore, type Store } from "../core/store/createStore.js";
import { AUTOSAVE_DELAY_MS } from "./Autosaver.js";
import type { KeyValueStore } from "./kv.js";

/** copy: into media/ (default). reference: file handles in IndexedDB. TODO(batch 41): reference mode. */
export type ImportMode = "copy" | "reference";

export interface AppSettings {
  /** Debounce after the last change before autosaving. */
  autosaveDelayMs: number;
  importMode: ImportMode;
  /** Master volume knob (dB, MONITOR_MIN_DB..MONITOR_MAX_DB) and mute: what is heard, never what is exported. */
  monitorVolumeDb: number;
  monitorMuted: boolean;
}

export const AUTOSAVE_DELAYS_MS = [1000, 2000, 5000, 10_000] as const;
export const MONITOR_MIN_DB = -60;
export const MONITOR_MAX_DB = 0;
export const DEFAULT_APP_SETTINGS: AppSettings = { autosaveDelayMs: AUTOSAVE_DELAY_MS, importMode: "copy", monitorVolumeDb: 0, monitorMuted: false };

const KEY = "settings.v1";

/** Invalid or missing fields fall back to `fallback`. */
function sanitize(value: unknown, fallback: AppSettings = DEFAULT_APP_SETTINGS): AppSettings {
  const raw = (typeof value === "object" && value !== null ? value : {}) as Partial<Record<keyof AppSettings, unknown>>;
  const delay = raw.autosaveDelayMs;
  return {
    autosaveDelayMs: AUTOSAVE_DELAYS_MS.some((ms) => ms === delay) ? (delay as number) : fallback.autosaveDelayMs,
    importMode: raw.importMode === "copy" || raw.importMode === "reference" ? raw.importMode : fallback.importMode,
    monitorVolumeDb:
      typeof raw.monitorVolumeDb === "number" && Number.isFinite(raw.monitorVolumeDb) ? Math.min(MONITOR_MAX_DB, Math.max(MONITOR_MIN_DB, raw.monitorVolumeDb)) : fallback.monitorVolumeDb,
    monitorMuted: typeof raw.monitorMuted === "boolean" ? raw.monitorMuted : fallback.monitorMuted,
  };
}

export interface AppSettingsStore extends Store<AppSettings> {
  load(): Promise<void>;
  update(patch: Partial<AppSettings>): Promise<void>;
}

export function createAppSettings(kv: KeyValueStore): AppSettingsStore {
  const store = createStore<AppSettings>(DEFAULT_APP_SETTINGS);
  return {
    ...store,
    async load() {
      try {
        store.set(sanitize(await kv.get(KEY)));
      } catch (error) {
        console.warn("[settings] could not read settings", error);
      }
    },
    async update(patch) {
      const next = sanitize({ ...store.getState(), ...patch }, store.getState());
      store.set(next);
      try {
        await kv.set(KEY, next);
      } catch (error) {
        console.warn("[settings] could not store settings", error);
      }
    },
  };
}
