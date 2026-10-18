// Export presets and the format a preset gives a project (spec §16).
// - A preset's frame size caps the export's long edge: the project keeps its aspect, a larger project
//   scales down to it, a smaller one stays as it is (never scaled up). Both sides are even (4:2:0).
// - A preset's frame rate caps the export's rate: the project's own rate when it is not above it, else
//   the project's rate divided by the smallest whole number that brings it under (60 -> 30, 59.94 ->
//   29.97, 50 -> 25), so every exported frame is a project frame and none repeats.
// TODO(batch 44): TikTok, YouTube Shorts and Custom, editable and saveable, chosen in the Export tab.
import type { Project, Rational } from "../core/document/types.js";

export type VideoCodecId = "avc" | "hevc" | "av1";

export interface ExportPreset {
  id: string;
  name: string;
  /** The frame size the preset is made for; its long edge caps the export's. */
  width: number;
  height: number;
  /** The highest frame rate. */
  fps: Rational;
  codec: VideoCodecId;
  /** Target video bitrate (bits per second). */
  videoBitrate: number;
  /** Longest time between keyframes (spec §16: at most 2 s). */
  keyframeSeconds: number;
  /** AAC bitrate (spec §14: 128/192/256/320 kbps). */
  audioBitrate: number;
}

/** Spec §16: Instagram Reels, 1080x1920, 30 fps, H.264 High, 12 Mbps, AAC 192 kbps. */
export const REELS_PRESET: ExportPreset = {
  id: "reels",
  name: "Instagram Reels",
  width: 1080,
  height: 1920,
  fps: { num: 30, den: 1 },
  codec: "avc",
  videoBitrate: 12_000_000,
  keyframeSeconds: 2,
  audioBitrate: 192_000,
};

/** Spec §16's file name template. */
export const FILE_NAME_TEMPLATE = "{project}-{preset}-{date}.mp4";

const pad = (value: number) => String(value).padStart(2, "0");

/** `template` with `{project}`, `{preset}` and `{date}` (the local day, YYYY-MM-DD) filled in. */
export function fillFileName(template: string, values: { project: string; preset: string; date: Date }): string {
  const { date } = values;
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return template.replace(/\{(project|preset|date)\}/g, (_match, key: string) => (key === "project" ? values.project : key === "preset" ? values.preset : day));
}

/** What an export writes. */
export interface ExportFormat {
  width: number;
  height: number;
  fps: Rational;
  codec: VideoCodecId;
  videoBitrate: number;
  keyframeSeconds: number;
  audioBitrate: number;
  /** The mixdown's rate and channels (spec §14: 48 kHz stereo). */
  sampleRate: 48000;
  channels: 2;
}

const even = (value: number) => Math.max(2, 2 * Math.round(value / 2));

/** The export frame size: the project's, scaled down so its long edge fits the preset's, both sides even. */
export function exportSize(width: number, height: number, preset: Pick<ExportPreset, "width" | "height">): { width: number; height: number } {
  const scale = Math.min(1, Math.max(preset.width, preset.height) / Math.max(width, height));
  return { width: even(width * scale), height: even(height * scale) };
}

/** The project's frame rate divided by the smallest whole number that brings it to at most `cap`. */
export function exportFps(fps: Rational, cap: Rational): Rational {
  // fps / n <= cap  <=>  fps.num * cap.den <= n * cap.num * fps.den
  const n = Math.max(1, Math.ceil((fps.num * cap.den) / (cap.num * fps.den) - 1e-9));
  return reduce(fps.num, fps.den * n);
}

function gcd(a: number, b: number): number {
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

function reduce(num: number, den: number): Rational {
  const g = gcd(num, den);
  return { num: num / g, den: den / g };
}

export function exportFormat(project: Project, preset: ExportPreset): ExportFormat {
  const { width, height, fps } = project.settings;
  return {
    ...exportSize(width, height, preset),
    fps: exportFps(fps, preset.fps),
    codec: preset.codec,
    videoBitrate: preset.videoBitrate,
    keyframeSeconds: preset.keyframeSeconds,
    audioBitrate: preset.audioBitrate,
    sampleRate: 48000,
    channels: 2,
  };
}
