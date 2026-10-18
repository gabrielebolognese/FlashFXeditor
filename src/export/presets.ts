// Export presets and the format a preset gives a project (spec §16).
// - Settings, a preset's or Custom's: the codec, the resolution (the project's size at 100/75/50%, its
//   long edge capped), the highest frame rate, the bitrate (VBR target and peak, or CBR), the keyframe
//   interval, the AAC bitrate and the hardware preference.
// - The long edge cap scales a larger project down to it, keeping its aspect; a smaller one stays as
//   it is (never scaled up). Both sides are even (4:2:0), rounded down.
// - The frame rate is a cap: the project's own rate when it is not above it, else the project's rate
//   divided by the smallest whole number that brings it under (60 -> 30, 59.94 -> 29.97, 50 -> 25), so
//   every exported frame is a project frame and none repeats.
// - Built-in presets (Reels, TikTok, Shorts) are fixed; changing a setting makes them Custom (seeded
//   with their values, `customFrom`), which can be saved as a preset of one's own (app settings).
// - YouTube Shorts: 2160x3840 when the project is 4K, else 1080x1920; 60 fps when the project is 60;
//   its bitrate follows the output (YouTube's recommended upload rates, `autoBitrate`).
import { fpsToNumber } from "../core/document/time.js";
import type { Project, Rational } from "../core/document/types.js";
import { formatFps } from "../project/projectPresets.js";

export type VideoCodecId = "avc" | "hevc" | "av1";
export type BitrateMode = "variable" | "constant";
export type HardwarePreference = "no-preference" | "prefer-hardware" | "prefer-software";
export type ResolutionScale = 100 | 75 | 50;

export const VIDEO_CODECS: readonly VideoCodecId[] = ["avc", "hevc", "av1"];
export const CODEC_NAMES: Record<VideoCodecId, string> = { avc: "H.264", hevc: "HEVC", av1: "AV1" };
export const RESOLUTION_SCALES: readonly ResolutionScale[] = [100, 75, 50];
export const BITRATE_MODES: readonly BitrateMode[] = ["variable", "constant"];
export const HARDWARE_PREFERENCES: readonly HardwarePreference[] = ["no-preference", "prefer-hardware", "prefer-software"];
/** Spec §14: AAC at 128/192/256/320 kbps. */
export const AUDIO_BITRATES: readonly number[] = [128_000, 192_000, 256_000, 320_000];
/** Video bitrates a setting may hold (bps). */
export const VIDEO_BITRATE_RANGE = { min: 1_000_000, max: 200_000_000 } as const;
/** Keyframe intervals (s): spec §16 binds at most 2 s. */
export const KEYFRAME_SECONDS_RANGE = { min: 0.5, max: 2 } as const;
/** A project whose long edge is at least this is 4K. */
export const LONG_EDGE_4K = 3840;

export interface ExportSettings {
  codec: VideoCodecId;
  /** The project's size scaled to this (%) before the cap. */
  scale: ResolutionScale;
  /** Long edge cap (px), null: none. */
  maxLongEdge: number | null;
  /** The cap instead when the project is 4K (YouTube Shorts' 2160x3840), null: `maxLongEdge`. */
  maxLongEdge4k: number | null;
  /** The highest frame rate (a cap). */
  fps: Rational;
  bitrateMode: BitrateMode;
  /** Target video bitrate (bps); "auto": by the output's size and rate (`autoBitrate`). */
  videoBitrate: number | "auto";
  /** Peak of a variable bitrate (bps; the codec level holds it); "auto": 1.5x the target. */
  maxBitrate: number | "auto";
  /** Longest time between keyframes (spec §16: at most 2 s). */
  keyframeSeconds: number;
  /** AAC bitrate (spec §14). */
  audioBitrate: number;
  hardware: HardwarePreference;
}

export interface ExportPreset {
  id: string;
  /** The chip's text. */
  name: string;
  /** What the chip's tooltip says. */
  description: string;
  settings: ExportSettings;
}

const SHORT_FORM: Omit<ExportSettings, "videoBitrate" | "maxBitrate"> = {
  codec: "avc",
  scale: 100,
  maxLongEdge: 1920,
  maxLongEdge4k: null,
  fps: { num: 30, den: 1 },
  bitrateMode: "variable",
  keyframeSeconds: 2,
  audioBitrate: 192_000,
  hardware: "no-preference",
};

/** Spec §16: Instagram Reels, 1080x1920, 30 fps, H.264 High, 12 Mbps, AAC 192 kbps. */
export const REELS_PRESET: ExportPreset = {
  id: "reels",
  name: "Reels",
  description: "Instagram Reels: 1080×1920, 30 fps, H.264 12 Mbps, AAC 192 kbps",
  settings: { ...SHORT_FORM, videoBitrate: 12_000_000, maxBitrate: 12_000_000 },
};

/** Spec §16: TikTok, as Reels at 10 Mbps. */
export const TIKTOK_PRESET: ExportPreset = {
  id: "tiktok",
  name: "TikTok",
  description: "TikTok: 1080×1920, 30 fps, H.264 10 Mbps, AAC 192 kbps",
  settings: { ...SHORT_FORM, videoBitrate: 10_000_000, maxBitrate: 10_000_000 },
};

/** Spec §16: YouTube Shorts, 1080x1920 (2160x3840 for a 4K project), up to 60 fps. */
export const SHORTS_PRESET: ExportPreset = {
  id: "shorts",
  name: "Shorts",
  description: "YouTube Shorts: 1080×1920 (2160×3840 for a 4K project), up to 60 fps, H.264 at YouTube's bitrate, AAC 192 kbps",
  settings: { ...SHORT_FORM, maxLongEdge4k: LONG_EDGE_4K, fps: { num: 60, den: 1 }, videoBitrate: "auto", maxBitrate: "auto" },
};

export const BUILT_IN_PRESETS: readonly ExportPreset[] = [REELS_PRESET, TIKTOK_PRESET, SHORTS_PRESET];
export const CUSTOM_PRESET_ID = "custom";

/** Custom's settings before the first change: Reels with no size cap (the project's own size). */
export const DEFAULT_CUSTOM_SETTINGS: ExportSettings = { ...REELS_PRESET.settings, maxLongEdge: null };

/** Spec §16's file name template. */
export const FILE_NAME_TEMPLATE = "{project}-{preset}-{date}.mp4";
export const MAX_FILE_TEMPLATE = 120;

const pad = (value: number) => String(value).padStart(2, "0");

/** `template` with `{project}`, `{preset}` and `{date}` (the local day, YYYY-MM-DD) filled in. */
export function fillFileName(template: string, values: { project: string; preset: string; date: Date }): string {
  const { date } = values;
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return template.replace(/\{(project|preset|date)\}/g, (_match, key: string) => (key === "project" ? values.project : key === "preset" ? values.preset : day));
}

const KNOWN_EXTENSION = /\.(mp4|m4a|wav|png|srt|vtt)$/i;

/** `name` ending in `.ext`: a known export extension at its end is replaced, else `.ext` is added. */
export function withExtension(name: string, ext: string): string {
  const base = name.trim().replace(KNOWN_EXTENSION, "").trim();
  return `${base === "" ? "export" : base}.${ext}`;
}

/** The `{preset}` text of a preset: its id for the built-in ones, a slug of the name for one's own. */
export function presetSlug(preset: Pick<ExportPreset, "id" | "name">): string {
  if (preset.id === CUSTOM_PRESET_ID || BUILT_IN_PRESETS.some((p) => p.id === preset.id)) return preset.id;
  const slug = preset.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? "preset" : slug;
}

/** What an export writes. */
export interface ExportFormat {
  width: number;
  height: number;
  fps: Rational;
  codec: VideoCodecId;
  bitrateMode: BitrateMode;
  /** Target video bitrate (bps). */
  videoBitrate: number;
  /** Peak (bps): the codec level holds it; equal to the target for a constant bitrate. */
  maxBitrate: number;
  keyframeSeconds: number;
  audioBitrate: number;
  hardware: HardwarePreference;
  /** The mixdown's rate and channels (spec §14: 48 kHz stereo). */
  sampleRate: 48000;
  channels: 2;
}

// Rounded down (never up: an odd side would be scaled up by a pixel); the epsilon absorbs a scaled
// side's float error (1921 * 1920 / 1921).
const even = (value: number) => Math.max(2, 2 * Math.floor(value / 2 + 1e-6));

/** The long edge cap `settings` give a project of this size, or null. */
function longEdgeCap(width: number, height: number, settings: Pick<ExportSettings, "maxLongEdge" | "maxLongEdge4k">): number | null {
  return settings.maxLongEdge4k !== null && Math.max(width, height) >= LONG_EDGE_4K ? settings.maxLongEdge4k : settings.maxLongEdge;
}

/** The export frame size: the project's at `scale`%, scaled down so its long edge fits the cap, both sides even (rounded down). */
export function exportSize(width: number, height: number, settings: Pick<ExportSettings, "scale" | "maxLongEdge" | "maxLongEdge4k">): { width: number; height: number } {
  const cap = longEdgeCap(width, height, settings);
  const scaled = settings.scale / 100;
  const long = Math.max(width, height) * scaled;
  const scale = scaled * (cap === null ? 1 : Math.min(1, cap / long));
  return { width: even(width * scale), height: even(height * scale) };
}

/** The project's frame rate divided by the smallest whole number that brings it to at most `cap`. */
export function exportFps(fps: Rational, cap: Rational): Rational {
  // fps / n <= cap  <=>  fps.num * cap.den <= n * cap.num * fps.den
  const n = Math.max(1, Math.ceil((fps.num * cap.den) / (cap.num * fps.den) - 1e-9));
  return reduce(fps.num, fps.den * n);
}

/** The rates Custom offers a project: its own and its whole divisions down to about 10 fps. */
export function fpsChoices(fps: Rational): Rational[] {
  const choices: Rational[] = [];
  for (let n = 1; n <= 6; n++) {
    const rate = reduce(fps.num, fps.den * n);
    if (n > 1 && fpsToNumber(rate) < 9.5) break;
    choices.push(rate);
  }
  return choices;
}

function gcd(a: number, b: number): number {
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

function reduce(num: number, den: number): Rational {
  const g = gcd(num, den);
  return { num: num / g, den: den / g };
}

/**
 * YouTube's recommended upload bitrates (SDR): 720p 5 / 7.5, 1080p 8 / 12, 1440p 16 / 24, 2160p 45 / 68
 * Mbps at up to 30 / above 30 fps, by the output's pixel count.
 */
export function autoBitrate(width: number, height: number, fps: Rational): number {
  const pixels = width * height;
  const high = fpsToNumber(fps) > 30.5;
  const tier = pixels <= 1280 * 720 ? [5, 7.5] : pixels <= 1920 * 1080 ? [8, 12] : pixels <= 2560 * 1440 ? [16, 24] : [45, 68];
  return (tier[high ? 1 : 0] as number) * 1_000_000;
}

export function exportFormat(project: Project, settings: ExportSettings): ExportFormat {
  const { width, height } = project.settings;
  const size = exportSize(width, height, settings);
  const fps = exportFps(project.settings.fps, settings.fps);
  const target = settings.videoBitrate === "auto" ? autoBitrate(size.width, size.height, fps) : settings.videoBitrate;
  const peak = settings.bitrateMode === "constant" ? target : settings.maxBitrate === "auto" ? Math.round(target * 1.5) : Math.max(target, settings.maxBitrate);
  return {
    ...size,
    fps,
    codec: settings.codec,
    bitrateMode: settings.bitrateMode,
    videoBitrate: target,
    maxBitrate: peak,
    keyframeSeconds: settings.keyframeSeconds,
    audioBitrate: settings.audioBitrate,
    hardware: settings.hardware,
    sampleRate: 48000,
    channels: 2,
  };
}

/**
 * Custom's settings giving `settings`' output for `project`: the resolution scale nearest to the output
 * size (no cap), the output's rate, the bitrates resolved; the rest kept.
 */
export function customFrom(settings: ExportSettings, project: Project): ExportSettings {
  const format = exportFormat(project, settings);
  const ratio = (format.width / project.settings.width) * 100;
  const scale = RESOLUTION_SCALES.reduce((best, s) => (Math.abs(s - ratio) < Math.abs(best - ratio) ? s : best), 100 as ResolutionScale);
  return { ...settings, scale, maxLongEdge: null, maxLongEdge4k: null, fps: format.fps, videoBitrate: format.videoBitrate, maxBitrate: format.maxBitrate };
}

/** The file size an export of `seconds` should reach (bytes): both bitrates plus about 1% of container. */
export function estimateBytes(format: Pick<ExportFormat, "videoBitrate" | "audioBitrate">, seconds: number): number {
  return Math.round(((format.videoBitrate + format.audioBitrate) * Math.max(0, seconds) * 1.01) / 8);
}

/** "1080×1920 · 30 fps · H.264 · 12 Mbps · AAC 192 kbps". */
export function formatSummary(format: ExportFormat): string {
  const fps = formatFps(format.fps);
  const mbps = (format.videoBitrate / 1_000_000).toFixed(format.videoBitrate % 1_000_000 === 0 ? 0 : 1);
  const mode = format.bitrateMode === "constant" ? " CBR" : "";
  return `${format.width}×${format.height} · ${fps} fps · ${CODEC_NAMES[format.codec]} · ${mbps} Mbps${mode} · AAC ${Math.round(format.audioBitrate / 1000)} kbps`;
}

// Sanitizing (app settings, session.json): every invalid field falls back to its default.
type Raw = Record<string, unknown>;
const obj = (value: unknown): Raw => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Raw) : {});
const oneOf = <T>(values: readonly T[], value: unknown, fallback: T): T => (values.includes(value as T) ? (value as T) : fallback);
const inRange = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;

function sanitizeRational(value: unknown, fallback: Rational): Rational {
  const raw = obj(value);
  return Number.isInteger(raw.num) && Number.isInteger(raw.den) && (raw.num as number) > 0 && (raw.den as number) > 0 && (raw.num as number) / (raw.den as number) <= 240 ? reduce(raw.num as number, raw.den as number) : fallback;
}

function sanitizeBitrate(value: unknown, fallback: number | "auto"): number | "auto" {
  if (value === "auto") return "auto";
  return inRange(value, VIDEO_BITRATE_RANGE.min, VIDEO_BITRATE_RANGE.max) ? Math.round(value) : fallback;
}

function sanitizeEdge(value: unknown, fallback: number | null): number | null {
  if (value === null) return null;
  return Number.isInteger(value) && inRange(value, 16, 8192) ? value : fallback;
}

export function sanitizeExportSettings(value: unknown, fallback: ExportSettings = DEFAULT_CUSTOM_SETTINGS): ExportSettings {
  const raw = obj(value);
  return {
    codec: oneOf(VIDEO_CODECS, raw.codec, fallback.codec),
    scale: oneOf(RESOLUTION_SCALES, raw.scale, fallback.scale),
    maxLongEdge: sanitizeEdge(raw.maxLongEdge, fallback.maxLongEdge),
    maxLongEdge4k: sanitizeEdge(raw.maxLongEdge4k, fallback.maxLongEdge4k),
    fps: sanitizeRational(raw.fps, fallback.fps),
    bitrateMode: oneOf(BITRATE_MODES, raw.bitrateMode, fallback.bitrateMode),
    videoBitrate: sanitizeBitrate(raw.videoBitrate, fallback.videoBitrate),
    maxBitrate: sanitizeBitrate(raw.maxBitrate, fallback.maxBitrate),
    keyframeSeconds: inRange(raw.keyframeSeconds, KEYFRAME_SECONDS_RANGE.min, KEYFRAME_SECONDS_RANGE.max) ? raw.keyframeSeconds : fallback.keyframeSeconds,
    audioBitrate: oneOf(AUDIO_BITRATES, raw.audioBitrate, fallback.audioBitrate),
    hardware: oneOf(HARDWARE_PREFERENCES, raw.hardware, fallback.hardware),
  };
}

export const MAX_USER_PRESETS = 30;
export const MAX_PRESET_NAME = 40;

/** One's own presets: an id, a non-empty name (at most MAX_PRESET_NAME), settings; ids unique, at most MAX_USER_PRESETS. */
export function sanitizeUserPresets(value: unknown): ExportPreset[] {
  if (!Array.isArray(value)) return [];
  const presets: ExportPreset[] = [];
  const reserved = new Set([CUSTOM_PRESET_ID, ...BUILT_IN_PRESETS.map((p) => p.id)]);
  for (const entry of value) {
    const raw = obj(entry);
    const name = typeof raw.name === "string" ? raw.name.trim().slice(0, MAX_PRESET_NAME) : "";
    if (typeof raw.id !== "string" || raw.id === "" || reserved.has(raw.id) || name === "") continue;
    reserved.add(raw.id);
    presets.push({ id: raw.id, name, description: name, settings: sanitizeExportSettings(raw.settings) });
    if (presets.length === MAX_USER_PRESETS) break;
  }
  return presets;
}
