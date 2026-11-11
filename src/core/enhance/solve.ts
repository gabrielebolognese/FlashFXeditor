// The Enhance commands' decisions (v1.3): from each clip's measurements (core/enhance/stats.ts) and a preset,
// the denoise and color correction values of every clip, so that the clips of one run end up alike.
//   1. Each clip is solved towards the preset's absolute targets: the scene light made neutral (white
//      balance), the darkest 2 percent and the brightest half percent moved to black and white (levels), the middle
//      brightness brought to the target with the gamma (after the preset's exposure: "exposure down,
//      brightness up" keeps the highlights), contrast scaled back for a clip that is already contrasty, the
//      saturation brought towards the target.
//   2. The clips are then matched: every clip's result is predicted by running the correction's CPU twin
//      (core/effects/colorCorrect.ts) over its histogram, and each clip's brightness, saturation and color
//      cast are moved to the group's median. A clip brighter than the others comes down, a darker one up.
// The denoise takes the measured noise level; the preset picks the method and the strengths. Pure.
import { balanceFromGains, colorCorrectUniforms, correctPixel, NEUTRAL_CORRECTION, whiteBalanceGains, type ColorCorrectParams } from "../effects/colorCorrect.js";
import type { DenoiseMethod } from "../effects/effectParams.js";
import { BINS, percentile, type ClipSummary } from "./stats.js";

export interface DenoiseValues {
  method: DenoiseMethod;
  luma: number;
  chroma: number;
  detail: number;
  shadows: number;
  noise: number;
}

/** A look of the color correction: the targets and the fixed amounts. */
export interface ColorLook {
  /** How far the scene light is made neutral, 0..1. */
  balance: number;
  /** Stops of exposure before the levels (below 0 keeps highlights; the gamma brings the middle back). */
  exposure: number;
  /** The mean brightness the clips are brought to, 0..1. */
  brightness: number;
  /** How much of the measured black and white points is used, 0..1. */
  levels: number;
  contrast: number;
  /** The mean saturation the clips are brought towards (0..1), and how far (0..1). */
  saturation: number;
  saturationPull: number;
  vibrance: number;
  highlights: number;
  shadows: number;
  clarity: number;
  sharpen: number;
}

export interface EnhancePreset {
  id: string;
  name: string;
  description: string;
  denoise: Omit<DenoiseValues, "noise">;
  color: ColorLook;
}

const look = (values: Partial<ColorLook>): ColorLook => ({ balance: 0.8, exposure: -0.25, brightness: 0.46, levels: 0.8, contrast: 22, saturation: 0.2, saturationPull: 0.5, vibrance: 18, highlights: -15, shadows: 6, clarity: 22, sharpen: 35, ...values });
const dn = (method: DenoiseMethod, luma: number, chroma: number, detail: number, shadows = 0.5): EnhancePreset["denoise"] => ({ method, luma, chroma, detail, shadows });

/** The ten presets (the first is the default until one is chosen). */
export const ENHANCE_PRESETS: readonly EnhancePreset[] = [
  { id: "balanced", name: "Balanced", description: "Hybrid denoise at medium strength, neutral white balance, moderate contrast and clarity.", denoise: dn("hybrid", 0.5, 0.7, 0.45), color: look({}) },
  { id: "clean", name: "Clean", description: "Stronger hybrid denoise for dim footage, soft contrast, lifted shadows.", denoise: dn("hybrid", 0.75, 0.9, 0.35, 0.7), color: look({ contrast: 14, shadows: 22, clarity: 14, sharpen: 28, brightness: 0.48 }) },
  { id: "crisp", name: "Crisp", description: "Light non-local means denoise that keeps texture, strong clarity and sharpening.", denoise: dn("nlm", 0.4, 0.7, 0.6), color: look({ contrast: 26, clarity: 40, sharpen: 60, vibrance: 22 }) },
  { id: "punchy", name: "Punchy", description: "Hybrid denoise, exposure down and brightness up, high contrast and vivid color.", denoise: dn("hybrid", 0.55, 0.8, 0.45), color: look({ exposure: -0.45, brightness: 0.47, contrast: 40, saturation: 0.26, saturationPull: 0.7, vibrance: 32, clarity: 30, sharpen: 45, highlights: -25 }) },
  { id: "natural", name: "Natural", description: "Wavelet denoise, gentle correction that stays close to the source.", denoise: dn("wavelet", 0.4, 0.7, 0.5), color: look({ balance: 0.6, exposure: -0.1, contrast: 12, vibrance: 10, clarity: 10, sharpen: 22, saturationPull: 0.3, levels: 0.6 }) },
  { id: "bright", name: "Bright and airy", description: "Wavelet denoise, a brighter middle, open shadows, soft contrast.", denoise: dn("wavelet", 0.55, 0.8, 0.4, 0.6), color: look({ brightness: 0.54, exposure: -0.2, contrast: 14, shadows: 30, highlights: -30, clarity: 16, vibrance: 20 }) },
  { id: "cinematic", name: "Cinematic", description: "Hybrid denoise, deeper blacks, strong contrast, restrained saturation.", denoise: dn("hybrid", 0.6, 0.85, 0.4), color: look({ brightness: 0.41, exposure: -0.35, contrast: 36, saturation: 0.17, saturationPull: 0.6, vibrance: 8, clarity: 28, sharpen: 30, shadows: 0, highlights: -20 }) },
  { id: "detail", name: "Detail", description: "Bilateral denoise with most texture kept, maximum sharpening.", denoise: dn("bilateral", 0.4, 0.7, 0.7), color: look({ contrast: 24, clarity: 34, sharpen: 75, vibrance: 16 }) },
  { id: "smooth", name: "Smooth", description: "Maximum hybrid denoise (skin and walls go smooth), light sharpening.", denoise: dn("hybrid", 1, 1, 0.25, 0.8), color: look({ contrast: 20, clarity: 12, sharpen: 20, shadows: 16 }) },
  { id: "vivid", name: "Vivid", description: "Median then wavelet denoise (kills speckle), saturated color, strong clarity.", denoise: dn("median", 0.6, 0.9, 0.45), color: look({ exposure: -0.3, contrast: 30, saturation: 0.3, saturationPull: 0.8, vibrance: 40, clarity: 34, sharpen: 50 }) },
];

export const DEFAULT_PRESET = "balanced";

export function enhancePreset(id: string | undefined): EnhancePreset | undefined {
  return ENHANCE_PRESETS.find((preset) => preset.id === (id ?? DEFAULT_PRESET));
}

/** What a correction turns a clip into (predicted over its histogram; clarity and sharpen keep the means). */
export interface Predicted {
  luma: number;
  saturation: number;
  /** Mean blue minus luma and red minus luma. */
  cb: number;
  cr: number;
}

const LUMA = [0.2126, 0.7152, 0.0722] as const;
const scratchIn: [number, number, number] = [0, 0, 0];
const scratchOut: [number, number, number] = [0, 0, 0];

export function predict(summary: ClipSummary, params: ColorCorrectParams): Predicted {
  const u = colorCorrectUniforms(params);
  let luma = 0;
  let saturation = 0;
  let cb = 0;
  let cr = 0;
  for (let bin = 0; bin < BINS; bin++) {
    const share = summary.hist[bin] as number;
    if (share <= 0) continue;
    scratchIn[0] = summary.binRgb[bin * 3] as number;
    scratchIn[1] = summary.binRgb[bin * 3 + 1] as number;
    scratchIn[2] = summary.binRgb[bin * 3 + 2] as number;
    const [r, g, b] = correctPixel(scratchIn, u, scratchOut);
    const y = LUMA[0] * r + LUMA[1] * g + LUMA[2] * b;
    luma += share * y;
    saturation += share * (Math.max(r, g, b) - Math.min(r, g, b));
    cb += share * (b - y);
    cr += share * (r - y);
  }
  return { luma, saturation, cb, cr };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number, digits: number) => Number(v.toFixed(digits));

/** The gamma that brings the predicted mean brightness of `params` to `target` (bisection: brightness rises with gamma). */
function solveGamma(summary: ClipSummary, params: ColorCorrectParams, target: number): number {
  let lo = 0.45;
  let hi = 2.4;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (predict(summary, { ...params, gamma: mid }).luma < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** The saturation value that brings the predicted mean saturation to `target` (bisection), within -40..35. */
function solveSaturation(summary: ClipSummary, params: ColorCorrectParams, target: number): number {
  let lo = -40;
  let hi = 35;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (predict(summary, { ...params, saturation: mid }).saturation < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** A clip's correction towards the look's own targets (step 1). */
export function solveClip(summary: ClipSummary, colorLook: ColorLook): ColorCorrectParams {
  const params: ColorCorrectParams = { ...NEUTRAL_CORRECTION };
  // White balance: the gains that make the scene light gray, as far as the look and the estimate's trust allow.
  const light = summary.illuminant;
  const strength = colorLook.balance * summary.illuminantTrust;
  const gains: [number, number, number] = [(1 / Math.max(light[0], 0.05)) ** strength, (1 / Math.max(light[1], 0.05)) ** strength, (1 / Math.max(light[2], 0.05)) ** strength];
  const balance = balanceFromGains(gains);
  params.temperature = clamp(balance.temperature, -85, 85);
  params.tint = clamp(balance.tint, -40, 40);
  params.exposure = colorLook.exposure;
  // Levels: the darkest 2 percent (so blacks stay black when the middle is lifted) and the brightest half
  // percent, after the exposure's gain.
  const gain = 2 ** (colorLook.exposure / 2.2);
  const low = percentile(summary.hist, 0.02) * gain;
  const high = Math.min(1, percentile(summary.hist, 0.995) * gain);
  params.black = clamp(low * colorLook.levels, 0, 0.15);
  params.white = clamp(1 - (1 - high) * colorLook.levels, 0.6, 1);
  // Contrast: less for a clip that already spans a wide range, a little more for a flat one.
  const spread = percentile(summary.hist, 0.9) - percentile(summary.hist, 0.1);
  params.contrast = colorLook.contrast * clamp((0.95 - spread) / 0.4, 0.7, 1.3);
  params.highlights = colorLook.highlights;
  params.shadows = colorLook.shadows;
  params.vibrance = colorLook.vibrance;
  params.clarity = colorLook.clarity;
  params.sharpen = colorLook.sharpen;
  params.gamma = solveGamma(summary, params, colorLook.brightness);
  const neutralSaturation = predict(summary, params).saturation;
  // Towards the look's saturation, but never far from the scene's own: a gray room stays gray (pushing it
  // would only color its noise and its leftover cast).
  const wanted = clamp(neutralSaturation + (colorLook.saturation - neutralSaturation) * colorLook.saturationPull, neutralSaturation * 0.7, neutralSaturation * 1.25);
  params.saturation = solveSaturation(summary, params, wanted);
  return params;
}

const medianOf = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
};

/**
 * Step 2: moves each correction so the clips' predicted brightness, saturation and color cast meet at the
 * group's median. `strength` 0..1 (1: meet fully). One clip is left as solved.
 */
export function matchClips(summaries: readonly ClipSummary[], solved: readonly ColorCorrectParams[], strength = 1): ColorCorrectParams[] {
  if (summaries.length < 2 || !(strength > 0)) return solved.map((params) => ({ ...params }));
  const before = solved.map((params, i) => predict(summaries[i] as ClipSummary, params));
  const target = { luma: medianOf(before.map((p) => p.luma)), saturation: medianOf(before.map((p) => p.saturation)), cb: medianOf(before.map((p) => p.cb)), cr: medianOf(before.map((p) => p.cr)) };
  return solved.map((params, i) => {
    const summary = summaries[i] as ClipSummary;
    const mine = before[i] as Predicted;
    const next = { ...params };
    // The color cast: gains that move this clip's mean chroma towards the group's (around its mean brightness).
    const y = Math.max(0.1, mine.luma);
    const dr = ((target.cr - mine.cr) * strength) / y;
    const db = ((target.cb - mine.cb) * strength) / y;
    const current = whiteBalanceGains(params.temperature, params.tint);
    const moved = balanceFromGains([current[0] * (1 + dr), current[1] * (1 - (LUMA[0] * dr + LUMA[2] * db) / LUMA[1]), current[2] * (1 + db)]);
    next.temperature = clamp(moved.temperature, -100, 100);
    next.tint = clamp(moved.tint, -50, 50);
    next.gamma = solveGamma(summary, next, mine.luma + (target.luma - mine.luma) * strength);
    next.saturation = solveSaturation(summary, next, mine.saturation + (target.saturation - mine.saturation) * strength);
    return next;
  });
}

/** The values written into the effects: rounded to what the fields show. */
export function roundCorrection(params: ColorCorrectParams): ColorCorrectParams {
  return {
    amount: round(params.amount, 2),
    exposure: round(params.exposure, 2),
    black: round(params.black, 3),
    white: round(params.white, 3),
    gamma: round(clamp(params.gamma, 0.3, 3), 2),
    contrast: round(params.contrast, 0),
    temperature: round(params.temperature, 0),
    tint: round(params.tint, 0),
    saturation: round(params.saturation, 0),
    vibrance: round(params.vibrance, 0),
    highlights: round(params.highlights, 0),
    shadows: round(params.shadows, 0),
    clarity: round(params.clarity, 0),
    sharpen: round(params.sharpen, 0),
  };
}

export interface EnhanceOptions {
  /** The preset (DEFAULT_PRESET when absent). */
  preset?: string;
  /** Which effects are set (both when absent). */
  denoise?: boolean;
  color?: boolean;
  /** Match the clips to each other (on when absent), and how far (0..1, 1 when absent). */
  match?: boolean;
  matchStrength?: number;
}

export interface ClipEnhancement {
  clipId: string;
  denoise: DenoiseValues | null;
  color: ColorCorrectParams | null;
  /** What was measured and what the correction is predicted to give. */
  measured: { brightness: number; saturation: number; noise: number; lumaNoise: number; chromaNoise: number; illuminant: [number, number, number] };
  predicted: { brightness: number; saturation: number } | null;
}

/** The enhancement of every measured clip. Throws for an unknown preset. */
export function planEnhancement(clips: readonly { clipId: string; summary: ClipSummary }[], options: EnhanceOptions = {}): ClipEnhancement[] {
  const preset = enhancePreset(options.preset);
  if (!preset) throw new Error(`Unknown enhance preset "${options.preset}" (${ENHANCE_PRESETS.map((p) => p.id).join(", ")})`);
  const summaries = clips.map((clip) => clip.summary);
  let colors: ColorCorrectParams[] | null = null;
  if (options.color !== false) {
    const solved = summaries.map((summary) => solveClip(summary, preset.color));
    colors = (options.match === false ? solved : matchClips(summaries, solved, options.matchStrength ?? 1)).map(roundCorrection);
  }
  return clips.map((clip, i) => {
    const summary = clip.summary;
    const color = colors ? (colors[i] as ColorCorrectParams) : null;
    const after = color ? predict(summary, color) : null;
    return {
      clipId: clip.clipId,
      denoise: options.denoise === false ? null : { ...preset.denoise, noise: round(clamp(summary.noise, 0, 0.2), 4) },
      color,
      measured: { brightness: round(summary.meanLuma, 4), saturation: round(summary.saturation, 4), noise: round(summary.noise, 4), lumaNoise: round(summary.lumaNoise, 4), chromaNoise: round(summary.chromaNoise, 4), illuminant: [round(summary.illuminant[0], 3), round(summary.illuminant[1], 3), round(summary.illuminant[2], 3)] },
      predicted: after ? { brightness: round(after.luma, 4), saturation: round(after.saturation, 4) } : null,
    };
  });
}
