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
// - Loudness (Batch 77): the three built-in presets normalize to -14 LUFS and -1 dBTP; Custom carries the setting.
// - YouTube Shorts: 2160x3840 when the project is 4K, else 1080x1920; 60 fps when the project is 60;
//   its bitrate follows the output (YouTube's recommended upload rates, `autoBitrate`).
import { fpsToNumber } from "../core/document/time.js";
import type { LoudnessTarget, Project, Rational } from "../core/document/types.js";
import { formatFps } from "../project/projectPresets.js";

export type VideoCodecId = "avc" | "hevc" | "av1" | "vp9";
/** What an export writes (spec §21.25): an MP4 or WebM video, a numbered PNG sequence, a GIF. */
export type ExportContainer = "mp4" | "webm" | "png" | "gif";
export type BitrateMode = "variable" | "constant";
export type HardwarePreference = "no-preference" | "prefer-hardware" | "prefer-software";
export type ResolutionScale = 100 | 75 | 50;

/** The codecs of an MP4 (Custom's codec select). */
export const VIDEO_CODECS: readonly VideoCodecId[] = ["avc", "hevc", "av1"];
/** The codecs of a WebM (VP9 first: the one with transparency). */
export const WEBM_CODECS: readonly VideoCodecId[] = ["vp9", "av1"];
export const CODEC_NAMES: Record<VideoCodecId, string> = { avc: "H.264", hevc: "HEVC", av1: "AV1", vp9: "VP9" };
export const CONTAINERS: readonly ExportContainer[] = ["mp4", "webm", "png", "gif"];
export const CONTAINER_NAMES: Record<ExportContainer, string> = { mp4: "MP4", webm: "WebM", png: "PNG sequence", gif: "GIF" };
/** A PNG sequence has no file of its own: its frames are `<name>_%05d.png` in a folder. */
export const CONTAINER_EXTENSIONS: Record<ExportContainer, string> = { mp4: "mp4", webm: "webm", png: "png", gif: "gif" };
/** GIF width options (px; a project narrower than it keeps its own width). */
export const GIF_WIDTH_RANGE = { min: 64, max: 1080 } as const;
export const DEFAULT_GIF_WIDTH = 540;
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
  /** The loudness the mixdown is normalized to (spec §21.21); absent or null: the project's own target, if it has one. */
  loudness?: LoudnessTarget | null;
  /** What is written (Batch 81); absent: an MP4. */
  container?: ExportContainer;
  /** WebM (VP9) and PNG sequences: the project's background is not drawn and the alpha channel is kept; absent: false. */
  transparent?: boolean;
  /** GIF: the width (px, `GIF_WIDTH_RANGE`); absent: `DEFAULT_GIF_WIDTH`. */
  gifWidth?: number;
  /** GIF: ordered dithering of the palette; absent: true. */
  gifDither?: boolean;
}

export const containerOf = (settings: { container?: ExportContainer }): ExportContainer => settings.container ?? "mp4";

/** The codec a container writes for a chosen one: a WebM takes VP9 or AV1, an MP4 H.264, HEVC or AV1. */
export function codecFor(container: ExportContainer, codec: VideoCodecId): VideoCodecId {
  if (container === "webm") return codec === "av1" ? "av1" : "vp9";
  return codec === "vp9" ? "avc" : codec;
}

export interface ExportPreset {
  id: string;
  /** The chip's text. */
  name: string;
  /** What the chip's tooltip says. */
  description: string;
  settings: ExportSettings;
}

/** Reels, TikTok and Shorts upload at -14 LUFS with a true peak of -1 dBTP (spec §21.21). */
export const PRESET_LOUDNESS: LoudnessTarget = { targetLufs: -14, truePeakDb: -1 };

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
  loudness: PRESET_LOUDNESS,
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

/** Spec §21.25: a WebM overlay with transparency (VP9 and its alpha channel, Opus), the project's size, no loudness change. */
export const TRANSPARENT_PRESET: ExportPreset = {
  id: "transparent",
  name: "Overlay",
  description: "Transparent overlay: WebM (VP9 with alpha, Opus), the project's size, up to 30 fps",
  settings: { ...SHORT_FORM, container: "webm", transparent: true, codec: "vp9", videoBitrate: 8_000_000, maxBitrate: 12_000_000, audioBitrate: 128_000, loudness: null },
};

/** Spec §21.25: a GIF preview, 15 fps and 540 px wide, ordered dithering. */
export const GIF_PRESET: ExportPreset = {
  id: "gif",
  name: "GIF",
  description: "GIF preview: 540 px wide, 15 fps, no sound",
  settings: { ...SHORT_FORM, container: "gif", gifWidth: DEFAULT_GIF_WIDTH, gifDither: true, fps: { num: 15, den: 1 }, videoBitrate: 1_000_000, maxBitrate: 1_000_000, loudness: null },
};

/** Spec §21.25: a numbered PNG sequence with alpha (`<name>_00001.png`), the project's size and rate. */
export const PNG_PRESET: ExportPreset = {
  id: "png-sequence",
  name: "PNG",
  description: "PNG sequence with alpha: one numbered file per frame, in a folder",
  settings: { ...SHORT_FORM, container: "png", transparent: true, maxLongEdge: null, fps: { num: 60, den: 1 }, videoBitrate: 1_000_000, maxBitrate: 1_000_000, loudness: null },
};

export const BUILT_IN_PRESETS: readonly ExportPreset[] = [REELS_PRESET, TIKTOK_PRESET, SHORTS_PRESET, TRANSPARENT_PRESET, GIF_PRESET, PNG_PRESET];
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

const KNOWN_EXTENSION = /\.(mp4|webm|gif|zip|m4a|wav|png|srt|vtt)$/i;

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
  /** The loudness target of the mixdown (spec §21.21): the settings', else the project's; absent: none. */
  loudness?: LoudnessTarget;
  /** What is written (Batch 81); absent: an MP4. */
  container?: ExportContainer;
  /** The background is not drawn and the alpha channel is kept (WebM VP9, PNG); absent: false. */
  transparent?: boolean;
  /** GIF: ordered dithering; absent: true. */
  gifDither?: boolean;
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

const loudnessOf = (target: LoudnessTarget | null | undefined): { loudness?: LoudnessTarget } => (target ? { loudness: { targetLufs: target.targetLufs, truePeakDb: target.truePeakDb } } : {});

/** A GIF's size: `gifWidth` px wide (never wider than the project), the height by the project's aspect. */
export function gifSize(width: number, height: number, gifWidth: number | undefined): { width: number; height: number } {
  const w = Math.max(1, Math.min(width, gifWidth ?? DEFAULT_GIF_WIDTH));
  return { width: w, height: Math.max(1, Math.round((w * height) / width)) };
}

export function exportFormat(project: Project, settings: ExportSettings): ExportFormat {
  const { width, height } = project.settings;
  const container = containerOf(settings);
  const size = container === "gif" ? gifSize(width, height, settings.gifWidth) : exportSize(width, height, settings);
  const fps = exportFps(project.settings.fps, settings.fps);
  const target = settings.videoBitrate === "auto" ? autoBitrate(size.width, size.height, fps) : settings.videoBitrate;
  const peak = settings.bitrateMode === "constant" ? target : settings.maxBitrate === "auto" ? Math.round(target * 1.5) : Math.max(target, settings.maxBitrate);
  return {
    ...size,
    fps,
    // Alpha is VP9 only (a second VP9 stream, webm/): a transparent WebM never takes AV1.
    codec: codecFor(container, settings.transparent && container === "webm" ? "vp9" : settings.codec),
    ...(container !== "mp4" && { container }),
    ...(settings.transparent && (container === "webm" || container === "png") && { transparent: true }),
    ...(container === "gif" && { gifDither: settings.gifDither !== false }),
    bitrateMode: settings.bitrateMode,
    videoBitrate: target,
    maxBitrate: peak,
    keyframeSeconds: settings.keyframeSeconds,
    audioBitrate: settings.audioBitrate,
    hardware: settings.hardware,
    ...loudnessOf(settings.loudness ?? project.settings.loudness),
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

/**
 * Bytes per pixel of a GIF frame (ordered dithering on or off): measured on the interop fixtures at
 * 15 fps and 540 px (Batch 81, PROGRESS.md); gifenc has no inter-frame prediction, so a frame costs
 * about the same whatever the motion. Measured: basic 0.030 and alpha 0.019 bytes per pixel and frame (graphics; photographic content costs several times more, so the job refines the estimate from its own frames).
 */
export const GIF_BYTES_PER_PIXEL = { dithered: 0.03, plain: 0.02 } as const;
/** Bytes of a PNG frame per pixel (graphics at 8 bits with alpha; photographic frames cost 3 to 4 times as much). */
export const PNG_BYTES_PER_PIXEL = 0.9;

/** The file size an export of `seconds` should reach (bytes): both bitrates plus about 1% of container; a GIF's and a PNG sequence's by their pixels. */
export function estimateBytes(format: Pick<ExportFormat, "videoBitrate" | "audioBitrate"> & Partial<Pick<ExportFormat, "container" | "width" | "height" | "fps" | "gifDither">>, seconds: number): number {
  const s = Math.max(0, seconds);
  const pixels = (format.width ?? 0) * (format.height ?? 0);
  const frames = Math.ceil(s * fpsToNumber(format.fps ?? { num: 30, den: 1 }));
  if (format.container === "gif") return Math.round(pixels * frames * (format.gifDither === false ? GIF_BYTES_PER_PIXEL.plain : GIF_BYTES_PER_PIXEL.dithered) + 800);
  if (format.container === "png") return Math.round(pixels * frames * PNG_BYTES_PER_PIXEL);
  return Math.round(((format.videoBitrate + format.audioBitrate) * s * 1.01) / 8);
}

/** "1080×1920 · 30 fps · H.264 · 12 Mbps · AAC 192 kbps". */
export function formatSummary(format: ExportFormat): string {
  const fps = formatFps(format.fps);
  if (format.container === "gif") return `${format.width}×${format.height} · ${fps} fps · GIF${format.gifDither === false ? "" : " · dithered"}`;
  if (format.container === "png") return `${format.width}×${format.height} · ${fps} fps · PNG sequence${format.transparent ? " · alpha" : ""}`;
  if (format.container === "webm") {
    const rate = (format.videoBitrate / 1_000_000).toFixed(format.videoBitrate % 1_000_000 === 0 ? 0 : 1);
    return `${format.width}×${format.height} · ${fps} fps · WebM ${CODEC_NAMES[format.codec]}${format.transparent ? " · alpha" : ""} · ${rate} Mbps · Opus ${Math.round(format.audioBitrate / 1000)} kbps`;
  }
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
    codec: oneOf<VideoCodecId>([...VIDEO_CODECS, "vp9"], raw.codec, fallback.codec),
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
    ...sanitizeLoudness(raw.loudness, fallback.loudness),
    ...sanitizeOutput(raw, fallback),
  };
}

/** The Batch 81 fields: kept only when they differ from their defaults (an MP4 with no extras stores none). */
function sanitizeOutput(raw: Raw, fallback: ExportSettings): Partial<ExportSettings> {
  const container = oneOf(CONTAINERS, raw.container, containerOf(fallback));
  const transparent = typeof raw.transparent === "boolean" ? raw.transparent : (fallback.transparent ?? false);
  const gifWidth = typeof raw.gifWidth === "number" && Number.isInteger(raw.gifWidth) && inRange(raw.gifWidth, GIF_WIDTH_RANGE.min, GIF_WIDTH_RANGE.max) ? raw.gifWidth : fallback.gifWidth;
  const gifDither = typeof raw.gifDither === "boolean" ? raw.gifDither : fallback.gifDither;
  return {
    ...(container !== "mp4" && { container }),
    ...(transparent && { transparent }),
    ...(gifWidth !== undefined && { gifWidth }),
    ...(gifDither !== undefined && { gifDither }),
  };
}

/** A target (-40..0 LUFS, -20..0 dBTP), null (off), or the fallback when absent or invalid. */
function sanitizeLoudness(value: unknown, fallback: LoudnessTarget | null | undefined): { loudness?: LoudnessTarget | null } {
  if (value === null) return { loudness: null };
  const raw = obj(value);
  if (inRange(raw.targetLufs, -40, 0) && inRange(raw.truePeakDb, -20, 0)) return { loudness: { targetLufs: raw.targetLufs, truePeakDb: raw.truePeakDb } };
  return fallback === undefined ? {} : { loudness: fallback };
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
