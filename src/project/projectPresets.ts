// Choices offered for new projects and in the Project section (spec §11, §15).
import type { Rational } from "../core/document/types.js";

export interface ResolutionPreset {
  id: string;
  label: string;
  width: number;
  height: number;
}

export const RESOLUTION_PRESETS: readonly ResolutionPreset[] = [
  { id: "9:16", label: "9:16 · 1080×1920", width: 1080, height: 1920 },
  { id: "4:5", label: "4:5 · 1080×1350", width: 1080, height: 1350 },
  { id: "1:1", label: "1:1 · 1080×1080", width: 1080, height: 1080 },
  { id: "16:9", label: "16:9 · 1920×1080", width: 1920, height: 1080 },
];

export const CUSTOM_RESOLUTION = "custom";

/** The preset id matching a size, or "custom". */
export function resolutionPresetId(width: number, height: number): string {
  return RESOLUTION_PRESETS.find((p) => p.width === width && p.height === height)?.id ?? CUSTOM_RESOLUTION;
}

export const FRAME_RATES: readonly Rational[] = [
  { num: 24000, den: 1001 },
  { num: 24, den: 1 },
  { num: 25, den: 1 },
  { num: 30000, den: 1001 },
  { num: 30, den: 1 },
  { num: 50, den: 1 },
  { num: 60000, den: 1001 },
  { num: 60, den: 1 },
];

/** Spec §15: 9:16 1080x1920 at 30 fps. */
export const DEFAULT_NEW_PROJECT: { width: number; height: number; fps: Rational } = { width: 1080, height: 1920, fps: { num: 30, den: 1 } };

/** "30000/1001": a stable select value for a rate. */
export function fpsKey(fps: Rational): string {
  return `${fps.num}/${fps.den}`;
}

export function parseFpsKey(key: string): Rational | null {
  const match = /^(\d+)\/(\d+)$/.exec(key);
  if (!match) return null;
  const num = Number(match[1]);
  const den = Number(match[2]);
  return num > 0 && den > 0 ? { num, den } : null;
}

/** 30, 29.97, 23.976: up to three decimals, trailing zeros dropped. */
export function formatFps(fps: Rational): string {
  return String(Number((fps.num / fps.den).toFixed(3)));
}
