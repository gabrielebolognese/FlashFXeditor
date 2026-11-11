// The math of the color correction effect (v1.3), the CPU twin of program 30 of the effect shaders (line for
// line, on display-referred values 0..1). The order is fixed: white balance and exposure (gains), levels,
// gamma, shadows and highlights, contrast, then clarity and sharpen (they read neighbors: shader only),
// saturation and vibrance. core/enhance/solve.ts runs this twin over a clip's histogram to predict what a
// correction does before it writes one. Pure.

/** The values of a color correction (the effect's parameters, EFFECT_DEFS.colorCorrect). */
export interface ColorCorrectParams {
  amount: number;
  exposure: number;
  black: number;
  white: number;
  gamma: number;
  contrast: number;
  temperature: number;
  tint: number;
  saturation: number;
  vibrance: number;
  highlights: number;
  shadows: number;
  clarity: number;
  sharpen: number;
}

export const NEUTRAL_CORRECTION: ColorCorrectParams = { amount: 1, exposure: 0, black: 0, white: 1, gamma: 1, contrast: 0, temperature: 0, tint: 0, saturation: 0, vibrance: 0, highlights: 0, shadows: 0, clarity: 0, sharpen: 0 };

/** What the shader gets: 16 floats (a, b, color, c of the pass uniform). */
export interface ColorCorrectUniforms {
  /** Channel gains (white balance x exposure). */
  gain: [number, number, number];
  amount: number;
  black: number;
  /** 1 / (white - black). */
  invRange: number;
  /** 1 / gamma. */
  invGamma: number;
  /** -1..1 each. */
  contrast: number;
  saturation: number;
  vibrance: number;
  highlights: number;
  shadows: number;
  /** 0..1 each. */
  clarity: number;
  sharpen: number;
}

const LUMA = [0.2126, 0.7152, 0.0722] as const;
/** Stops of red over blue at temperature 100, and of red and blue over green at tint 100. */
const TEMPERATURE_STOPS = 0.6;
const TINT_STOPS = 0.6;

/**
 * The channel gains of a white balance: temperature above 0 warms (red up, blue down), tint above 0 turns to
 * magenta (green down); scaled so a gray keeps its brightness.
 */
export function whiteBalanceGains(temperature: number, tint: number): [number, number, number] {
  const t = (Math.max(-100, Math.min(100, temperature)) / 100) * TEMPERATURE_STOPS;
  const k = (Math.max(-100, Math.min(100, tint)) / 100) * TINT_STOPS;
  const r = 2 ** (t + k * 0.5);
  const g = 2 ** -k;
  const b = 2 ** (-t + k * 0.5);
  const y = LUMA[0] * r + LUMA[1] * g + LUMA[2] * b;
  return [r / y, g / y, b / y];
}

/** The temperature and tint whose gains are closest to `gains` (the inverse of whiteBalanceGains, clamped). */
export function balanceFromGains(gains: readonly [number, number, number]): { temperature: number; tint: number } {
  const rg = Math.log2(gains[0] / gains[1]);
  const bg = Math.log2(gains[2] / gains[1]);
  // rg = t + 1.5 k, bg = -t + 1.5 k.
  const k = (rg + bg) / 3;
  const t = (rg - bg) / 2;
  const clamp = (v: number) => Math.max(-100, Math.min(100, v));
  return { temperature: clamp((t / TEMPERATURE_STOPS) * 100), tint: clamp((k / TINT_STOPS) * 100) };
}

export function colorCorrectUniforms(p: ColorCorrectParams): ColorCorrectUniforms {
  const wb = whiteBalanceGains(p.temperature, p.tint);
  // Exposure in stops of light: display values are about light^(1 / 2.2).
  const exposure = 2 ** (p.exposure / 2.2);
  const white = Math.max(p.black + 0.05, p.white);
  return {
    gain: [wb[0] * exposure, wb[1] * exposure, wb[2] * exposure],
    amount: Math.max(0, Math.min(1, p.amount)),
    black: p.black,
    invRange: 1 / (white - p.black),
    invGamma: 1 / Math.max(0.05, p.gamma),
    contrast: p.contrast / 100,
    saturation: p.saturation / 100,
    vibrance: p.vibrance / 100,
    highlights: p.highlights / 100,
    shadows: p.shadows / 100,
    clarity: Math.max(0, p.clarity) / 100,
    sharpen: Math.max(0, p.sharpen) / 100,
  };
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const luma = (r: number, g: number, b: number) => LUMA[0] * r + LUMA[1] * g + LUMA[2] * b;

/** The brightness curve of shadows and highlights: y moved by up to about a quarter around 1/3 and 2/3. */
export function shadowsHighlights(y: number, shadows: number, highlights: number): number {
  const up = 1 - y;
  return y + 1.7 * (shadows * y * up * up + highlights * y * y * up);
}

/** The contrast curve on one channel: above 0 towards an S curve, below towards middle gray. */
export function contrastCurve(v: number, contrast: number): number {
  if (contrast >= 0) return v + (v * v * (3 - 2 * v) - v) * contrast;
  return v + (0.5 - v) * -contrast * 0.5;
}

/** The first half of the correction (before clarity and sharpen): gains, levels, gamma, shadows and highlights, contrast. */
export function toneStage(rgb: readonly [number, number, number], u: ColorCorrectUniforms, out: [number, number, number]): [number, number, number] {
  let r = clamp01((rgb[0] * u.gain[0] - u.black) * u.invRange);
  let g = clamp01((rgb[1] * u.gain[1] - u.black) * u.invRange);
  let b = clamp01((rgb[2] * u.gain[2] - u.black) * u.invRange);
  // What was nearly black keeps less of its color the more the gamma lifts it: mostly color noise lives there.
  const dark = clamp01(luma(r, g, b) / 0.1);
  const fade = 1 + (dark * dark * (3 - 2 * dark) - 1) * Math.min(0.85, Math.max(0, (1 / u.invGamma - 1) * 1.5));
  r = r ** u.invGamma;
  g = g ** u.invGamma;
  b = b ** u.invGamma;
  const y = luma(r, g, b);
  r = y + (r - y) * fade;
  g = y + (g - y) * fade;
  b = y + (b - y) * fade;
  if (y > 0.0001 && (u.shadows !== 0 || u.highlights !== 0)) {
    const k = Math.max(0, shadowsHighlights(y, u.shadows, u.highlights)) / y;
    r = clamp01(r * k);
    g = clamp01(g * k);
    b = clamp01(b * k);
  }
  out[0] = clamp01(contrastCurve(r, u.contrast));
  out[1] = clamp01(contrastCurve(g, u.contrast));
  out[2] = clamp01(contrastCurve(b, u.contrast));
  return out;
}

/** Smoothstep (0 under e0, 1 over e1), as the shaders' sstep. */
const sstep = (e0: number, e1: number, x: number): number => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/**
 * The last half: saturation, then vibrance (stronger on dull colors). A boost fades out in the deep shadows
 * (under a luma of 0.3), where it would mostly color the noise and tint the blacks; a cut applies everywhere.
 */
export function saturationStage(rgb: readonly [number, number, number], u: ColorCorrectUniforms, out: [number, number, number]): [number, number, number] {
  let [r, g, b] = rgb;
  let y = luma(r, g, b);
  const roll = sstep(0.02, 0.3, y);
  const s = 1 + u.saturation * (u.saturation > 0 ? roll : 1);
  r = y + (r - y) * s;
  g = y + (g - y) * s;
  b = y + (b - y) * s;
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);
  const v = 1 + u.vibrance * (1 - clamp01(chroma)) * (u.vibrance > 0 ? roll : 1);
  y = luma(r, g, b);
  out[0] = clamp01(y + (r - y) * v);
  out[1] = clamp01(y + (g - y) * v);
  out[2] = clamp01(y + (b - y) * v);
  return out;
}

const scratch: [number, number, number] = [0, 0, 0];

/** One pixel through the whole correction except clarity and sharpen, mixed with the input by `amount`. */
export function correctPixel(rgb: readonly [number, number, number], u: ColorCorrectUniforms, out: [number, number, number] = [0, 0, 0]): [number, number, number] {
  toneStage(rgb, u, scratch);
  saturationStage(scratch, u, out);
  for (let i = 0; i < 3; i++) out[i] = (rgb[i] as number) + ((out[i] as number) - (rgb[i] as number)) * u.amount;
  return out;
}
