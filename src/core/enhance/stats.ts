// What the Enhance commands measure in a clip's picture (v1.3): brightness and color statistics for the color
// correction, and the noise level for the denoise. The app (app/enhanceController.ts) and the render page
// sample a few frames of each clip and hand their pixels here. Pure; no DOM.
//   tone   from a small copy of the whole frame: a 256-bin luma histogram that also keeps each bin's mean
//          color (so core/enhance/solve.ts can run a correction over it), the illuminant estimates and the
//          mean saturation;
//   noise  from a crop at the size the clip is shown: the standard deviation of what a pixel differs from its
//          four neighbors, taken over the flattest quarter of 16 px blocks (texture and edges are left out),
//          at 1, 2 and 4 px, in luma and in chroma (Immerkaer 1996 measures noise the same way; a camera's
//          own noise reduction leaves coarse blotches the 2 and 4 px scales see).

export const BINS = 256;
const LUMA = [0.2126, 0.7152, 0.0722] as const;

/** Statistics of one or more frames of a clip (sums: `mergeStats` adds them, `finishStats` reads them). */
export interface ClipStats {
  /** Pixels counted. */
  count: number;
  /** Per luma bin: pixels, and the sums of r, g, b (0..1). */
  hist: Float64Array;
  binRgb: Float64Array;
  /** Sums over near-neutral pixels (low saturation, mid brightness): r, g, b and their count. */
  neutral: [number, number, number, number];
  /** Sums of r^6, g^6, b^6 (shades of gray, Finlayson and Trezzi 2004). */
  power: [number, number, number];
  /** Sum of max(r, g, b) - min(r, g, b). */
  saturation: number;
  /** Noise levels of each frame (0..1 units): luma and chroma. */
  noise: number[];
  chromaNoise: number[];
}

export function emptyStats(): ClipStats {
  return { count: 0, hist: new Float64Array(BINS), binRgb: new Float64Array(BINS * 3), neutral: [0, 0, 0, 0], power: [0, 0, 0], saturation: 0, noise: [], chromaNoise: [] };
}

/** Adds the tone statistics of `data` (RGBA bytes; pixels with alpha under half are skipped) to `stats`. */
export function addToneStats(stats: ClipStats, data: Uint8ClampedArray | Uint8Array): void {
  for (let i = 0; i + 3 < data.length; i += 4) {
    if ((data[i + 3] as number) < 128) continue;
    const r = (data[i] as number) / 255;
    const g = (data[i + 1] as number) / 255;
    const b = (data[i + 2] as number) / 255;
    const y = LUMA[0] * r + LUMA[1] * g + LUMA[2] * b;
    const bin = Math.min(BINS - 1, Math.floor(y * BINS));
    stats.hist[bin] = (stats.hist[bin] as number) + 1;
    stats.binRgb[bin * 3] = (stats.binRgb[bin * 3] as number) + r;
    stats.binRgb[bin * 3 + 1] = (stats.binRgb[bin * 3 + 1] as number) + g;
    stats.binRgb[bin * 3 + 2] = (stats.binRgb[bin * 3 + 2] as number) + b;
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    stats.saturation += sat;
    if (sat < 0.2 && y > 0.2 && y < 0.92) {
      stats.neutral[0] += r;
      stats.neutral[1] += g;
      stats.neutral[2] += b;
      stats.neutral[3] += 1;
    }
    stats.power[0] += r ** 6;
    stats.power[1] += g ** 6;
    stats.power[2] += b ** 6;
    stats.count += 1;
  }
}

/** The 25th percentile of the blocks' neighbor-difference deviations of plane `v` (w x h), as a noise sigma. */
function planeNoise(v: Float32Array, w: number, h: number): number {
  const BLOCK = 16;
  const sigmas: number[] = [];
  for (let by = 1; by + BLOCK < h - 1; by += BLOCK) {
    for (let bx = 1; bx + BLOCK < w - 1; bx += BLOCK) {
      let sum = 0;
      for (let y = by; y < by + BLOCK; y++) {
        for (let x = bx; x < bx + BLOCK; x++) {
          const i = y * w + x;
          const r = (v[i] as number) - 0.25 * ((v[i - 1] as number) + (v[i + 1] as number) + (v[i - w] as number) + (v[i + w] as number));
          sum += r * r;
        }
      }
      // The difference of a pixel and the mean of 4 neighbors has 1.25 times the noise's variance.
      sigmas.push(Math.sqrt(sum / (BLOCK * BLOCK) / 1.25));
    }
  }
  if (sigmas.length === 0) return 0;
  sigmas.sort((a, b) => a - b);
  return sigmas[Math.floor(sigmas.length * 0.25)] as number;
}

/** `v` (w x h) averaged over 2 x 2 px. */
function halve(v: Float32Array, w: number, h: number): { v: Float32Array; w: number; h: number } {
  const hw = w >> 1;
  const hh = h >> 1;
  const out = new Float32Array(hw * hh);
  for (let y = 0; y < hh; y++) for (let x = 0; x < hw; x++) out[y * hw + x] = 0.25 * ((v[2 * y * w + 2 * x] as number) + (v[2 * y * w + 2 * x + 1] as number) + (v[(2 * y + 1) * w + 2 * x] as number) + (v[(2 * y + 1) * w + 2 * x + 1] as number));
  return { v: out, w: hw, h: hh };
}

/** The largest noise of `v` at 1, 2 and 4 px. */
function multiScaleNoise(v: Float32Array, w: number, h: number): number {
  let plane = { v, w, h };
  let sigma = planeNoise(v, w, h);
  for (let level = 0; level < 2; level++) {
    plane = halve(plane.v, plane.w, plane.h);
    sigma = Math.max(sigma, planeNoise(plane.v, plane.w, plane.h));
  }
  return sigma;
}

/** The noise of a crop (RGBA bytes, w x h, shown 1:1): luma and chroma sigma in 0..1 units. */
export function measureNoise(data: Uint8ClampedArray | Uint8Array, w: number, h: number): { luma: number; chroma: number } {
  const y = new Float32Array(w * h);
  const cb = new Float32Array(w * h);
  const cr = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = (data[i * 4] as number) / 255;
    const g = (data[i * 4 + 1] as number) / 255;
    const b = (data[i * 4 + 2] as number) / 255;
    const l = LUMA[0] * r + LUMA[1] * g + LUMA[2] * b;
    y[i] = l;
    cb[i] = b - l;
    cr[i] = r - l;
  }
  return { luma: multiScaleNoise(y, w, h), chroma: Math.max(multiScaleNoise(cb, w, h), multiScaleNoise(cr, w, h)) };
}

/** Adds the noise of a crop to `stats`. */
export function addNoiseStats(stats: ClipStats, data: Uint8ClampedArray | Uint8Array, w: number, h: number): void {
  const noise = measureNoise(data, w, h);
  stats.noise.push(noise.luma);
  stats.chromaNoise.push(noise.chroma);
}

const median = (values: readonly number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] as number;
};

/** What the solver reads: the statistics as shares and means. */
export interface ClipSummary {
  /** Share of the pixels in each luma bin, and each bin's mean color. */
  hist: number[];
  binRgb: number[];
  /** The scene light's color (its largest channel 1): the near-neutral pixels when there are enough, else shades of gray. */
  illuminant: [number, number, number];
  /** How sure the illuminant is, 0..1 (the share of near-neutral pixels, full at a fifth of the frame). */
  illuminantTrust: number;
  meanLuma: number;
  saturation: number;
  /** The noise the denoise is set to (0..1 units), and its parts. */
  noise: number;
  lumaNoise: number;
  chromaNoise: number;
}

/** The luma under which a share `q` of the pixels lies. */
export function percentile(hist: readonly number[], q: number): number {
  let sum = 0;
  for (let bin = 0; bin < hist.length; bin++) {
    const next = sum + (hist[bin] as number);
    if (next >= q) return (bin + (next > sum ? (q - sum) / (next - sum) : 0.5)) / hist.length;
    sum = next;
  }
  return 1;
}

export function finishStats(stats: ClipStats): ClipSummary {
  const n = Math.max(1, stats.count);
  const hist: number[] = [];
  const binRgb: number[] = [];
  let meanLuma = 0;
  for (let bin = 0; bin < BINS; bin++) {
    const count = stats.hist[bin] as number;
    hist.push(count / n);
    for (let c = 0; c < 3; c++) binRgb.push(count > 0 ? (stats.binRgb[bin * 3 + c] as number) / count : (bin + 0.5) / BINS);
    meanLuma += (LUMA[0] * (binRgb[bin * 3] as number) + LUMA[1] * (binRgb[bin * 3 + 1] as number) + LUMA[2] * (binRgb[bin * 3 + 2] as number)) * (count / n);
  }
  const neutralShare = stats.neutral[3] / n;
  const gray: [number, number, number] = [(stats.power[0] / n) ** (1 / 6), (stats.power[1] / n) ** (1 / 6), (stats.power[2] / n) ** (1 / 6)];
  const trust = Math.min(1, neutralShare / 0.2);
  const light: [number, number, number] = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const neutral = stats.neutral[3] > 0 ? (stats.neutral[c] as number) / stats.neutral[3] : (gray[c] as number);
    // The two estimates are compared as colors (each scaled to its own largest channel) below.
    light[c] = neutral;
  }
  const scale = (v: [number, number, number]): [number, number, number] => {
    const top = Math.max(v[0], v[1], v[2], 1e-6);
    return [v[0] / top, v[1] / top, v[2] / top];
  };
  const a = scale(light);
  const b = scale(gray);
  const illuminant = scale([a[0] * trust + b[0] * (1 - trust), a[1] * trust + b[1] * (1 - trust), a[2] * trust + b[2] * (1 - trust)]);
  const lumaNoise = median(stats.noise);
  const chromaNoise = median(stats.chromaNoise);
  return {
    hist,
    binRgb,
    illuminant,
    illuminantTrust: Math.max(trust, 0.35),
    meanLuma,
    saturation: stats.saturation / n,
    // Chroma noise counts for a little over half: the chroma thresholds are already wider.
    noise: Math.max(lumaNoise, chromaNoise * 0.6),
    lumaNoise,
    chromaNoise,
  };
}
