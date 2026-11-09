// Ported from FlashFX-v2 src/core/effects/hsl.ts, src/core/effects/vignette.ts and src/engine/chroma-key/ @ a91c675, adapted.
// Per-pixel math of the Batch 75 effects (spec §21.19): color adjustment, vignette, sharpen, grain, chroma and
// luma keys. The CPU twin of the EFFECT_WGSL / EFFECT_FRAGMENT cases (render/gpu/shaders.ts, glShaders.ts),
// line for line, so the shader math is tested here. Colors are straight (not premultiplied) 0..1.
// Ported from FlashFX-v2 src/core/effects/hsl.ts (rgbToHsl, hslToRgb), src/core/effects/vignette.ts
// (vignetteFactor) and src/core/keying/keying.ts (rgbToYCbCr, chromaKeyAlpha, lumaKeyAlpha, suppressSpill,
// dominant channel) @ a91c675, adapted: one module, the color adjustment cases of FlashFX-v2's
// applyColorEffect (src/engine/renderer.ts: temperature, vibrance, hue) gathered into one effect with the
// common exposure / brightness / contrast / saturation, tint positive towards magenta, and an integer hash for
// the grain so both backends draw the same pattern. Pure.

export type Rgb = [number, number, number];

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const fract = (x: number) => x - Math.floor(x);

/** Smoothstep with a degenerate window as a hard step at `edge0` (the shaders' `sstep`; WGSL's is undefined there). */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x < edge0 ? 0 : 1;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** BT.709 luminance. */
export function luma709(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** RGB -> HSL, all 0..1 (h wraps). */
export function rgbToHsl(r: number, g: number, b: number): Rgb {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

function hue2rgb(p: number, q: number, t: number): number {
  const tt = fract(t);
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

/** HSL -> RGB (inverse of rgbToHsl). */
export function hslToRgb(h: number, s: number, l: number): Rgb {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)];
}

export interface ColorAdjust {
  /** -100..100 %. */
  brightness: number;
  contrast: number;
  saturation: number;
  /** Stops, -5..5. */
  exposure: number;
  temperature: number;
  tint: number;
  /** Degrees, -180..180. */
  hue: number;
  vibrance: number;
}

/**
 * The color adjustment, in this order: exposure (x 2^stops), temperature (warmer: more red, less blue),
 * tint (positive: magenta), brightness (an offset of up to 0.5), contrast around middle gray, saturation
 * (from the luminance), vibrance (more on dull colors), hue rotation (HSL); clamped to 0..1.
 */
export function colorAdjust(rgb: readonly number[], p: ColorAdjust): Rgb {
  let r = (rgb[0] as number) * 2 ** p.exposure;
  let g = (rgb[1] as number) * 2 ** p.exposure;
  let b = (rgb[2] as number) * 2 ** p.exposure;
  const t = p.temperature / 100;
  r += t * 0.2;
  b -= t * 0.2;
  const k = p.tint / 100;
  r += k * 0.1;
  g -= k * 0.2;
  b += k * 0.1;
  const bright = (p.brightness / 100) * 0.5;
  const contrast = 1 + p.contrast / 100;
  r = (r + bright - 0.5) * contrast + 0.5;
  g = (g + bright - 0.5) * contrast + 0.5;
  b = (b + bright - 0.5) * contrast + 0.5;
  const sat = 1 + p.saturation / 100;
  let y = luma709(r, g, b);
  r = y + (r - y) * sat;
  g = y + (g - y) * sat;
  b = y + (b - y) * sat;
  // FlashFX-v2 vibrance: dull colors (max - min small) gain more.
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);
  const vib = 1 + (p.vibrance / 100) * (1 - clamp01(chroma));
  y = luma709(r, g, b);
  r = y + (r - y) * vib;
  g = y + (g - y) * vib;
  b = y + (b - y) * vib;
  r = clamp01(r);
  g = clamp01(g);
  b = clamp01(b);
  if (p.hue !== 0) {
    const [h, s, l] = rgbToHsl(r, g, b);
    [r, g, b] = hslToRgb(fract(h + p.hue / 360), s, l);
  }
  return [clamp01(r), clamp01(g), clamp01(b)];
}

/**
 * The vignette's brightness factor at (u, v) of the content box (0..1 each): 1 inside, easing to 0 by
 * `radius` (edge units: 1 at an edge's middle, about 1.41 at a corner) over `softness`.
 */
export function vignetteFactor(u: number, v: number, radius: number, softness: number): number {
  const r = Math.max(0, Math.min(radius, 1.5));
  const s = Math.max(0, Math.min(softness, 1));
  const dx = (u - 0.5) * 2;
  const dy = (v - 0.5) * 2;
  return 1 - smoothstep(r - s, r, Math.sqrt(dx * dx + dy * dy));
}

/** A channel darkened by the vignette: c * mix(1, factor, amount). */
export function vignetteChannel(c: number, factor: number, amount: number): number {
  return c * (1 - clamp01(amount) * (1 - factor));
}

/** Full-range BT.601 YCbCr: y 0..1, cb and cr -0.5..0.5. */
export function rgbToYCbCr(r: number, g: number, b: number): { y: number; cb: number; cr: number } {
  return { y: 0.299 * r + 0.587 * g + 0.114 * b, cb: -0.168736 * r - 0.331264 * g + 0.5 * b, cr: 0.5 * r - 0.418688 * g - 0.081312 * b };
}

/** The chroma key's alpha (0 keyed .. 1 kept): the distance in the Cb/Cr plane past `tolerance`, over `softness`. */
export function chromaKeyAlpha(rgb: readonly number[], key: readonly number[], tolerance: number, softness: number): number {
  const p = rgbToYCbCr(rgb[0] as number, rgb[1] as number, rgb[2] as number);
  const k = rgbToYCbCr(key[0] as number, key[1] as number, key[2] as number);
  return smoothstep(tolerance, tolerance + Math.max(0, softness), Math.hypot(p.cb - k.cb, p.cr - k.cr));
}

/** The key color's strongest channel (0 r, 1 g, 2 b; green on a tie): the one spill suppression pulls down. */
export function dominantChannel(r: number, g: number, b: number): number {
  if (r > g && r >= b) return 0;
  if (b > g && b > r) return 2;
  return 1;
}

/** Spill suppression: the key channel pulled towards the larger of the other two by `amount`. */
export function suppressSpill(rgb: readonly number[], channel: number, amount: number): Rgb {
  const k = clamp01(amount);
  const out: Rgb = [rgb[0] as number, rgb[1] as number, rgb[2] as number];
  const limit = Math.max(out[(channel + 1) % 3] as number, out[(channel + 2) % 3] as number);
  const c = out[channel] as number;
  if (c > limit) out[channel] = c - k * (c - limit);
  return out;
}

/** The luma key's alpha: dark keyed, bright kept (ramping over threshold .. threshold + softness); `invert` flips it. */
export function lumaKeyAlpha(rgb: readonly number[], threshold: number, softness: number, invert: boolean): number {
  const a = smoothstep(threshold, threshold + Math.max(0, softness), luma709(rgb[0] as number, rgb[1] as number, rgb[2] as number));
  return invert ? 1 - a : a;
}

/** Offset keeping grain cells positive (the hash works on unsigned integers). */
export const GRAIN_OFFSET = 65536;

/** An integer hash of a grain cell and a frame, 0..1 (the shaders' `grainHash`, in 32-bit unsigned math). */
export function grainHash(x: number, y: number, frame: number): number {
  let h = (Math.imul(x >>> 0, 0x8da6b343) ^ Math.imul(y >>> 0, 0xd8163841) ^ Math.imul(frame >>> 0, 0xcb1ab31f)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return (h >>> 8) / 16777215;
}

/**
 * The grain's offset at content point (x, y) (content px), -0.5..0.5: value noise over cells `size` px wide,
 * mixed bilinearly with a smoothstep, a new pattern for each `frame`.
 */
export function grainNoise(x: number, y: number, size: number, frame: number): number {
  const s = Math.max(0.5, size);
  const qx = x / s;
  const qy = y / s;
  const fx = qx - Math.floor(qx);
  const fy = qy - Math.floor(qy);
  const ix = Math.floor(qx) + GRAIN_OFFSET;
  const iy = Math.floor(qy) + GRAIN_OFFSET;
  const wx = fx * fx * (3 - 2 * fx);
  const wy = fy * fy * (3 - 2 * fy);
  const f = Math.max(0, Math.round(frame));
  const a = grainHash(ix, iy, f);
  const b = grainHash(ix + 1, iy, f);
  const c = grainHash(ix, iy + 1, f);
  const d = grainHash(ix + 1, iy + 1, f);
  return a + (b - a) * wx + (c - a) * wy + (a - b - c + d) * wx * wy - 0.5;
}
