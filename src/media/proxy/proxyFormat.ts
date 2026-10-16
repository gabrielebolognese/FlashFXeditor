// What a proxy is (spec §9.5): H.264 at a short edge of 540 px by default (never above the source),
// Main profile at the lowest level that holds its size and frame rate, a keyframe every 15 frames,
// 3 Mbps, the source's frame times. Which videos get one automatically: those above 1080p on the
// short edge or above 30 fps by default (decoding 1080p30 is cheap), every video, or none (setting).
// Shared by the main thread (ProxyJobs) and proxy.worker.
import { fpsToNumber } from "../../core/document/time.js";
import type { MediaItem } from "../../core/document/types.js";

export const PROXY_GOP = 15;
export const PROXY_BITRATE = 3_000_000;

/** The proxy's short edge (px): the setting's choices. */
export const PROXY_SHORT_EDGES = [360, 540, 720] as const;
export type ProxyShortEdge = (typeof PROXY_SHORT_EDGES)[number];
export const DEFAULT_PROXY_SHORT_EDGE: ProxyShortEdge = 540;

/** Which videos get a proxy on import: above 1080p or 30 fps (spec default), above 1080p only, or all. */
export type ProxyRule = "heavy" | "large" | "all";
export const PROXY_RULES: readonly ProxyRule[] = ["heavy", "large", "all"];

export interface ProxySettings {
  /** Proxies are made automatically for the videos the rule picks (off: only on request). */
  auto: boolean;
  rule: ProxyRule;
  shortEdge: ProxyShortEdge;
}

/** Above this short edge (px) a video counts as large. */
export const LARGE_SHORT_EDGE = 1080;
/** Above this frame rate a video counts as heavy. */
export const HEAVY_FPS = 30;

/** True when the rule picks this media for an automatic proxy. */
export function wantsProxy(item: MediaItem, rule: ProxyRule): boolean {
  if (item.kind !== "video" || !item.width || !item.height) return false;
  if (rule === "all") return true;
  const large = Math.min(item.width, item.height) > LARGE_SHORT_EDGE;
  if (rule === "large") return large;
  return large || (item.fps !== undefined && fpsToNumber(item.fps) > HEAVY_FPS + 1e-6);
}

/**
 * The proxy's size for a source of `width` x `height` (coded orientation): the short edge at
 * `shortEdge` (at most the source's), the aspect kept, both sides even (H.264 4:2:0).
 */
export function proxySize(width: number, height: number, shortEdge: number): { width: number; height: number } {
  const short = Math.min(width, height);
  const scale = Math.min(1, shortEdge / short);
  const even = (value: number) => Math.max(2, 2 * Math.round((value * scale) / 2));
  return { width: even(width), height: even(height) };
}

/**
 * The sizes a frame of `width` x `height` is drawn at on its way to `target` (the scaler), largest
 * first and ending with the target: each step at most halves (2x, 4x... the target while smaller than
 * the source).
 */
export function halvingSteps(width: number, height: number, target: { width: number; height: number }): { width: number; height: number }[] {
  const steps = [target];
  for (let w = target.width * 2, h = target.height * 2; w < width && h < height; w *= 2, h *= 2) steps.unshift({ width: w, height: h });
  return steps;
}

/** H.264 levels: id, max macroblocks per second, max macroblocks per frame (ITU-T H.264 Table A-1). */
const AVC_LEVELS: readonly [id: number, mbPerSecond: number, mbPerFrame: number][] = [
  [0x1e, 40_500, 1_620],
  [0x1f, 108_000, 3_600],
  [0x20, 216_000, 5_120],
  [0x28, 245_760, 8_192],
  [0x2a, 522_240, 8_704],
  [0x32, 589_824, 22_080],
  [0x33, 983_040, 36_864],
  [0x34, 2_073_600, 36_864],
];

/** The lowest H.264 level id that holds `width` x `height` at `fps`. */
export function avcLevel(width: number, height: number, fps: number): number {
  const perFrame = Math.ceil(width / 16) * Math.ceil(height / 16);
  const perSecond = perFrame * fps;
  for (const [id, mbPerSecond, mbPerFrame] of AVC_LEVELS) if (perFrame <= mbPerFrame && perSecond <= mbPerSecond) return id;
  return 0x34;
}

const hex = (value: number) => value.toString(16).padStart(2, "0");

/**
 * Codec strings to try, best first: Main profile (spec §9.5, e.g. `avc1.4d401f` for 960x540 at 30 fps),
 * then High and Constrained Baseline for encoders without Main.
 */
export function proxyCodecs(width: number, height: number, fps: number): string[] {
  const level = hex(avcLevel(width, height, fps));
  return [`avc1.4d40${level}`, `avc1.6400${level}`, `avc1.42e0${level}`];
}
