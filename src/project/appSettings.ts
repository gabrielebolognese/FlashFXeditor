// Global app settings (spec §3.1: persisted with idb-keyval). For now only the autosave delay of the
// Project section (§11). TODO(batch 42): the settings panel adds the rest.
import { createStore, type Store } from "../core/store/createStore.js";
import { AUTOSAVE_DELAY_MS } from "./Autosaver.js";
import type { KeyValueStore } from "./kv.js";

export interface AppSettings {
  /** Debounce after the last change before autosaving. */
  autosaveDelayMs: number;
}

export const AUTOSAVE_DELAYS_MS = [1000, 2000, 5000, 10_000] as const;
export const DEFAULT_APP_SETTINGS: AppSettings = { autosaveDelayMs: AUTOSAVE_DELAY_MS };

const KEY = "settings.v1";

/** Invalid or missing fields fall back to `fallback`. */
function sanitize(value: unknown, fallback: AppSettings = DEFAULT_APP_SETTINGS): AppSettings {
  const raw = (typeof value === "object" && value !== null ? value : {}) as Partial<Record<keyof AppSettings, unknown>>;
  const delay = raw.autosaveDelayMs;
  return {
    autosaveDelayMs: AUTOSAVE_DELAYS_MS.some((ms) => ms === delay) ? (delay as number) : fallback.autosaveDelayMs,
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
