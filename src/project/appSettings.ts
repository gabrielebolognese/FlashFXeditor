// Global app settings (spec §3.1: persisted with idb-keyval). For now the autosave delay and the proxy
// settings of the Project section (§11, §9.5), the import mode (§9.1, no UI yet), the monitoring
// volume and mute of the preview chrome (§14: monitoring only, never the export), the color picker's
// recent colors (§11), the punch zoom (Batch 27) and the font picker's favorites (§11, Batch 28).
// TODO(batch 42): the settings panel.
import { createStore, type Store } from "../core/store/createStore.js";
import { DEFAULT_PROXY_SHORT_EDGE, PROXY_RULES, PROXY_SHORT_EDGES, type ProxyRule, type ProxySettings, type ProxyShortEdge } from "../media/proxy/proxyFormat.js";
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
  /** Proxies made on import for the videos `proxyRule` picks (spec §9.5: on by default). */
  proxyAuto: boolean;
  proxyRule: ProxyRule;
  /** The short edge of new proxies (px). */
  proxyShortEdge: ProxyShortEdge;
  /** The color picker's recent colors (`#rrggbb` / `#rrggbbaa`), newest first. */
  recentColors: readonly string[];
  /** Punch zoom (Shift+Z): the scale factor of the right piece (PUNCH_ZOOM_MIN..PUNCH_ZOOM_MAX). */
  punchZoomScale: number;
  /**
   * Reserved: punch zoom as an animated zoom (scale keyframes) instead of a cut-in. Off, and read by
   * nothing until keyframes exist. TODO(batch 35): the animated punch zoom.
   */
  punchZoomAnimated: boolean;
  /** The font picker's Favorites section (spec §11): family names, in the order starred. */
  favoriteFonts: readonly string[];
  /**
   * `+ Title` / `+ Subtitle` last as long as the rest of the video clip under the playhead (spec §10.2
   * "match clip under playhead", on by default), else 3 s. TODO(batch 42): the switch in the settings panel.
   */
  matchClipUnderPlayhead: boolean;
}

export const AUTOSAVE_DELAYS_MS = [1000, 2000, 5000, 10_000] as const;
export const MONITOR_MIN_DB = -60;
export const MONITOR_MAX_DB = 0;
export const PUNCH_ZOOM_MIN = 1.05;
export const PUNCH_ZOOM_MAX = 3;
export const DEFAULT_APP_SETTINGS: AppSettings = {
  autosaveDelayMs: AUTOSAVE_DELAY_MS,
  importMode: "copy",
  monitorVolumeDb: 0,
  monitorMuted: false,
  proxyAuto: true,
  proxyRule: "heavy",
  proxyShortEdge: DEFAULT_PROXY_SHORT_EDGE,
  recentColors: [],
  punchZoomScale: 1.2,
  punchZoomAnimated: false,
  favoriteFonts: [],
  matchClipUnderPlayhead: true,
};

/** The favorites kept by the font picker. */
export const MAX_FAVORITE_FONTS = 50;

/** `family` added to (or removed from) the favorite fonts. */
export function toggleFavoriteFont(favorites: readonly string[], family: string): string[] {
  return favorites.includes(family) ? favorites.filter((name) => name !== family) : [...favorites, family].slice(-MAX_FAVORITE_FONTS);
}

const HEX_COLOR = /^#[0-9a-f]{6}([0-9a-f]{2})?$/;
/** The colors kept in the color picker's recent row. */
export const MAX_RECENT_COLORS = 8;

/** `hex` first in the recent colors (lowercase, once), at most MAX_RECENT_COLORS. */
export function pushRecentColor(recent: readonly string[], hex: string): string[] {
  const color = hex.toLowerCase();
  return [color, ...recent.filter((other) => other !== color)].slice(0, MAX_RECENT_COLORS);
}

/** The proxy part of the settings. */
export function proxySettings(settings: AppSettings): ProxySettings {
  return { auto: settings.proxyAuto, rule: settings.proxyRule, shortEdge: settings.proxyShortEdge };
}

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
    proxyAuto: typeof raw.proxyAuto === "boolean" ? raw.proxyAuto : fallback.proxyAuto,
    proxyRule: PROXY_RULES.some((rule) => rule === raw.proxyRule) ? (raw.proxyRule as ProxyRule) : fallback.proxyRule,
    proxyShortEdge: PROXY_SHORT_EDGES.some((edge) => edge === raw.proxyShortEdge) ? (raw.proxyShortEdge as ProxyShortEdge) : fallback.proxyShortEdge,
    recentColors: Array.isArray(raw.recentColors)
      ? raw.recentColors.filter((color): color is string => typeof color === "string" && HEX_COLOR.test(color)).slice(0, MAX_RECENT_COLORS)
      : fallback.recentColors,
    punchZoomScale:
      typeof raw.punchZoomScale === "number" && Number.isFinite(raw.punchZoomScale) ? Math.min(PUNCH_ZOOM_MAX, Math.max(PUNCH_ZOOM_MIN, raw.punchZoomScale)) : fallback.punchZoomScale,
    punchZoomAnimated: typeof raw.punchZoomAnimated === "boolean" ? raw.punchZoomAnimated : fallback.punchZoomAnimated,
    favoriteFonts: Array.isArray(raw.favoriteFonts)
      ? [...new Set(raw.favoriteFonts.filter((name): name is string => typeof name === "string" && name !== ""))].slice(-MAX_FAVORITE_FONTS)
      : fallback.favoriteFonts,
    matchClipUnderPlayhead: typeof raw.matchClipUnderPlayhead === "boolean" ? raw.matchClipUnderPlayhead : fallback.matchClipUnderPlayhead,
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
