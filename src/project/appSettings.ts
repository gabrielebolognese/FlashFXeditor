// Global app settings (spec §3.1: persisted with idb-keyval). For now the autosave delay and the proxy
// settings of the Project section (§11, §9.5), the import mode (§9.1, no UI yet), the monitoring
// volume and mute of the preview chrome (§14: monitoring only, never the export), the color picker's
// recent colors (§11), the punch zoom (Batch 27), the font picker's favorites (§11, Batch 28), the
// default Title and Subtitle presets (§10.2, Batch 30), the Transcribe dialog's model and language
// (§10.6, Batch 33), Auto-duck music's depth and ramps (§14, Batch 37) and Remove silence's parameters
// (§14, Batch 38), the shortcut editor's keymap overrides and the command palette's recent commands
// (Batch 40), the default durations, the default transition and "keyframes follow source" (§11, §6.15,
// §6.10, Batch 42). Settings > General (panels/settings/) and the Project section edit them.
import { createStore, type Store } from "../core/store/createStore.js";
import { DEFAULT_PROXY_SHORT_EDGE, PROXY_RULES, PROXY_SHORT_EDGES, type ProxyRule, type ProxySettings, type ProxyShortEdge } from "../media/proxy/proxyFormat.js";
import { AUTOSAVE_DELAY_MS } from "./Autosaver.js";
import { STARTER_SUBTITLE_ID, STARTER_TITLE_ID } from "../text/starterPresets.js";
import { isWhisperLanguage } from "../media/transcribe/languages.js";
import { DEFAULT_WHISPER_MODEL, isWhisperModel, type WhisperModelId } from "../media/transcribe/models.js";
import type { KeymapOverrides } from "../core/keyboard/keymap.js";
import { isValidKeys } from "../core/keyboard/rebind.js";
import type { KeyValueStore } from "./kv.js";
import { DUCK_DEPTH_DB, DUCK_RAMP_FRAMES } from "../timeline/edit/volume.js";
import { clampSilenceParam, SILENCE_MIN_MS, SILENCE_PADDING_MS, SILENCE_THRESHOLD } from "../timeline/edit/silence.js";
import { BUILT_IN_EDIT_DEFAULTS, type EditDefaults } from "../timeline/edit/editDefaults.js";
import { isTransitionKind } from "../core/document/transitions.js";
import type { TransitionKind } from "../core/document/types.js";

/** copy: into media/ (default). reference: linked, the file handles kept in IndexedDB (Batch 41, spec §9.1). */
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
   * Punch zoom as an animated zoom (Batch 35: scale keyframes over 6 frames with ease out) instead of
   * a cut-in; on by default. Named `punchZoomAnimated` (reserved, off) before Batch 35: that stored
   * value is dropped, so the new default applies.
   */
  punchZoomAnimate: boolean;
  /** The font picker's Favorites section (spec §11): family names, in the order starred. */
  favoriteFonts: readonly string[];
  /**
   * `+ Title` / `+ Subtitle` last as long as the rest of the video clip under the playhead (spec §10.2
   * "match clip under playhead", on by default), else the default title duration.
   */
  matchClipUnderPlayhead: boolean;
  /**
   * The presets `+ Title` (T) and `+ Subtitle` (Shift+T) use (spec §10.2, chosen in the Presets tab), by
   * id; a preset that no longer exists (or a project preset of a closed project) falls back to the
   * built-in Title or Subtitle.
   */
  defaultTitlePreset: string | null;
  defaultSubtitlePreset: string | null;
  /** The Whisper model of the Transcribe dialog (spec §10.6), and its language (a Whisper code; null: detected). */
  transcribeModel: WhisperModelId;
  transcribeLanguage: string | null;
  /**
   * Auto-duck music (spec §14 "parameters in settings"): how far the music dips (dB, DUCK_DEPTH_MIN..MAX)
   * and its ramps (frames, 0..DUCK_RAMP_MAX).
   */
  duckDepthDb: number;
  duckRampFrames: number;
  /**
   * Remove silence (spec §14): the threshold (dBFS), the minimum silence and the padding (ms), as last
   * set in its parameter row (SILENCE_THRESHOLD, SILENCE_MIN_MS, SILENCE_PADDING_MS ranges).
   */
  silenceThresholdDb: number;
  silenceMinMs: number;
  silencePaddingMs: number;
  /** The shortcut editor's changes (spec §18): keys per command id where they differ from the keymap file. */
  keymap: KeymapOverrides;
  /** The command palette's recent commands, most recent first (Batch 40 "recent first"). */
  recentCommands: readonly string[];
  /**
   * Default durations (spec §11), whole milliseconds in DEFAULT_DURATION_MS: a still image dropped or
   * inserted, `+ Title` / `+ Subtitle` (when not matching the clip under the playhead), `+ Solid`, a
   * freeze frame.
   */
  stillDurationMs: number;
  titleDurationMs: number;
  solidDurationMs: number;
  freezeDurationMs: number;
  /** The default transition (spec §6.15 "Default duration 15 frames (settings)"): frames (1..TRANSITION_FRAMES_MAX) and the kind Mod+Shift+D adds. */
  transitionFrames: number;
  transitionKind: TransitionKind;
  /** In trims and slips of video and audio clips keep their keys on the source frames (spec §6.10, on). */
  keyframesFollowSource: boolean;
}

export const AUTOSAVE_DELAYS_MS = [1000, 2000, 5000, 10_000] as const;
export const MONITOR_MIN_DB = -60;
export const MONITOR_MAX_DB = 0;
export const PUNCH_ZOOM_MIN = 1.05;
export const PUNCH_ZOOM_MAX = 3;
export const DUCK_DEPTH_MIN = 1;
export const DUCK_DEPTH_MAX = 60;
export const DUCK_RAMP_MAX = 120;
/** The range of the default durations (ms). */
export const DEFAULT_DURATION_MS = { min: 100, max: 60_000 } as const;
export const TRANSITION_FRAMES_MAX = 120;
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
  punchZoomAnimate: true,
  favoriteFonts: [],
  matchClipUnderPlayhead: true,
  defaultTitlePreset: STARTER_TITLE_ID,
  defaultSubtitlePreset: STARTER_SUBTITLE_ID,
  transcribeModel: DEFAULT_WHISPER_MODEL,
  transcribeLanguage: null,
  duckDepthDb: DUCK_DEPTH_DB,
  duckRampFrames: DUCK_RAMP_FRAMES,
  silenceThresholdDb: SILENCE_THRESHOLD.default,
  silenceMinMs: SILENCE_MIN_MS.default,
  silencePaddingMs: SILENCE_PADDING_MS.default,
  keymap: {},
  recentCommands: [],
  stillDurationMs: BUILT_IN_EDIT_DEFAULTS.stillMs,
  titleDurationMs: BUILT_IN_EDIT_DEFAULTS.titleMs,
  solidDurationMs: BUILT_IN_EDIT_DEFAULTS.solidMs,
  freezeDurationMs: BUILT_IN_EDIT_DEFAULTS.freezeMs,
  transitionFrames: BUILT_IN_EDIT_DEFAULTS.transitionFrames,
  transitionKind: BUILT_IN_EDIT_DEFAULTS.transitionKind,
  keyframesFollowSource: BUILT_IN_EDIT_DEFAULTS.keyframesFollowSource,
};

/** The commands the palette remembers. */
export const MAX_RECENT_COMMANDS = 12;
const MAX_KEYS_PER_COMMAND = 8;
const COMMAND_ID = /^[A-Za-z0-9.:_-]{1,80}$/;

/** Overrides with valid command ids and keys only (an unparsable key is dropped, `[]` kept: unbound). */
function sanitizeKeymap(value: unknown, fallback: KeymapOverrides): KeymapOverrides {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return fallback;
  const out: Record<string, readonly string[]> = {};
  for (const [id, keys] of Object.entries(value as Record<string, unknown>)) {
    if (!COMMAND_ID.test(id) || !Array.isArray(keys)) continue;
    out[id] = [...new Set(keys.filter((keys): keys is string => typeof keys === "string" && isValidKeys(keys, "other")))].slice(0, MAX_KEYS_PER_COMMAND);
  }
  return out;
}

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

const presetIdOr = (value: unknown, fallback: string | null): string | null => (value === null || (typeof value === "string" && value !== "") ? value : fallback);

/** A whole number in [min, max], or `fallback` when `value` is not a finite number. */
function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
}
const durationMs = (value: unknown, fallback: number) => clampInt(value, DEFAULT_DURATION_MS.min, DEFAULT_DURATION_MS.max, fallback);

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
    punchZoomAnimate: typeof raw.punchZoomAnimate === "boolean" ? raw.punchZoomAnimate : fallback.punchZoomAnimate,
    favoriteFonts: Array.isArray(raw.favoriteFonts)
      ? [...new Set(raw.favoriteFonts.filter((name): name is string => typeof name === "string" && name !== ""))].slice(-MAX_FAVORITE_FONTS)
      : fallback.favoriteFonts,
    matchClipUnderPlayhead: typeof raw.matchClipUnderPlayhead === "boolean" ? raw.matchClipUnderPlayhead : fallback.matchClipUnderPlayhead,
    defaultTitlePreset: presetIdOr(raw.defaultTitlePreset, fallback.defaultTitlePreset),
    defaultSubtitlePreset: presetIdOr(raw.defaultSubtitlePreset, fallback.defaultSubtitlePreset),
    transcribeModel: isWhisperModel(raw.transcribeModel) ? raw.transcribeModel : fallback.transcribeModel,
    transcribeLanguage: raw.transcribeLanguage === null || isWhisperLanguage(raw.transcribeLanguage) ? (raw.transcribeLanguage ?? null) : fallback.transcribeLanguage,
    duckDepthDb: typeof raw.duckDepthDb === "number" && Number.isFinite(raw.duckDepthDb) ? Math.min(DUCK_DEPTH_MAX, Math.max(DUCK_DEPTH_MIN, raw.duckDepthDb)) : fallback.duckDepthDb,
    duckRampFrames: Number.isInteger(raw.duckRampFrames) ? Math.min(DUCK_RAMP_MAX, Math.max(0, raw.duckRampFrames as number)) : fallback.duckRampFrames,
    silenceThresholdDb: clampSilenceParam({ ...SILENCE_THRESHOLD, default: fallback.silenceThresholdDb }, raw.silenceThresholdDb),
    silenceMinMs: clampSilenceParam({ ...SILENCE_MIN_MS, default: fallback.silenceMinMs }, raw.silenceMinMs),
    silencePaddingMs: clampSilenceParam({ ...SILENCE_PADDING_MS, default: fallback.silencePaddingMs }, raw.silencePaddingMs),
    keymap: sanitizeKeymap(raw.keymap, fallback.keymap),
    recentCommands: Array.isArray(raw.recentCommands)
      ? [...new Set(raw.recentCommands.filter((id): id is string => typeof id === "string" && COMMAND_ID.test(id)))].slice(0, MAX_RECENT_COMMANDS)
      : fallback.recentCommands,
    stillDurationMs: durationMs(raw.stillDurationMs, fallback.stillDurationMs),
    titleDurationMs: durationMs(raw.titleDurationMs, fallback.titleDurationMs),
    solidDurationMs: durationMs(raw.solidDurationMs, fallback.solidDurationMs),
    freezeDurationMs: durationMs(raw.freezeDurationMs, fallback.freezeDurationMs),
    transitionFrames: clampInt(raw.transitionFrames, 1, TRANSITION_FRAMES_MAX, fallback.transitionFrames),
    transitionKind: isTransitionKind(raw.transitionKind) ? raw.transitionKind : fallback.transitionKind,
    keyframesFollowSource: typeof raw.keyframesFollowSource === "boolean" ? raw.keyframesFollowSource : fallback.keyframesFollowSource,
  };
}

/** The edit defaults the settings hold (timeline/edit/editDefaults.ts). */
export function editDefaultsOf(settings: AppSettings): EditDefaults {
  return {
    stillMs: settings.stillDurationMs,
    titleMs: settings.titleDurationMs,
    solidMs: settings.solidDurationMs,
    freezeMs: settings.freezeDurationMs,
    transitionFrames: settings.transitionFrames,
    transitionKind: settings.transitionKind,
    keyframesFollowSource: settings.keyframesFollowSource,
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
