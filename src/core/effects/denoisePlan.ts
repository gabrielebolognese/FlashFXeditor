// The passes of the denoise effect (v1.3), planned once for both backends and for the tests. Every method
// works on brightness (luma) and color (chroma) apart, because camera noise is stronger and coarser in color
// and the eye forgives a soft color far more than a soft brightness:
//   hybrid    non-local means on the finest grain (it keeps repeating texture), then three edge-avoiding
//             a-trous wavelet levels for the coarse blotches a small window cannot see, weaker in luma at each
//             level and full strength in chroma;
//   wavelet   five edge-avoiding a-trous levels (Dammertz et al. 2010), steps 1, 2, 4, 8, 16;
//   nlm       non-local means twice (Buades et al. 2005), the second pass over a window twice as wide;
//   bilateral a joint bilateral filter twice (Tomasi and Manduchi 1998);
//   median    a 3 x 3 median twice (salt and pepper, hot pixels), then one chroma wavelet level.
// Each ends with the finish pass: where the denoised picture has structure (an edge or texture well above the
// noise level) a share `detail` of what was removed is put back, so flat areas stay clean and edges stay crisp.
// Thresholds follow the measured noise level (sigma, 0..1 units) and rise in dark areas by `shadows`. Pure.
import type { DenoiseMethod } from "./effectParams.js";

/** The filter of one pass. */
export type DenoiseFilter = "nlm" | "atrous" | "bilateral" | "median" | "finish";

export interface DenoisePass {
  filter: DenoiseFilter;
  /** Stage px between the taps. */
  step: number;
  /** The luma and chroma thresholds (0..1 units; a median's mix 0..1). */
  luma: number;
  chroma: number;
}

export interface DenoiseSettings {
  method: DenoiseMethod;
  luma: number;
  chroma: number;
  noise: number;
}

/** The smallest noise level the thresholds are built on (a clean picture still gets a light pass). */
export const MIN_NOISE = 0.002;

/** The luma threshold at strength `luma` for noise `sigma`: 0.6 sigma (barely) to 4 sigma (everything). */
export const lumaThreshold = (luma: number, sigma: number): number => Math.max(MIN_NOISE, sigma) * (0.6 + 3.4 * luma);
/** The chroma threshold: 1 sigma to 9 sigma (color noise is coarser and hides more). */
export const chromaThreshold = (chroma: number, sigma: number): number => Math.max(MIN_NOISE, sigma) * (1 + 8 * chroma);

/** The passes of `settings` before the finish pass; `scale`: stage px per content px. Empty when both strengths are 0. */
export function denoisePasses(settings: DenoiseSettings, scale: number): DenoisePass[] {
  const { method, luma, chroma, noise } = settings;
  if (!(luma > 0) && !(chroma > 0)) return [];
  const s = Math.max(1, scale);
  const hl = luma > 0 ? lumaThreshold(luma, noise) : 0;
  const hc = chroma > 0 ? chromaThreshold(chroma, noise) : 0;
  const pass = (filter: DenoiseFilter, step: number, l: number, c: number): DenoisePass => ({ filter, step: step * s, luma: hl * l, chroma: hc * c });
  switch (method) {
    case "wavelet":
      return [pass("atrous", 1, 1, 1), pass("atrous", 2, 0.7, 1), pass("atrous", 4, 0.5, 1), pass("atrous", 8, 0.35, 1), pass("atrous", 16, 0.25, 0.8)];
    case "nlm":
      return [pass("nlm", 1, 1, 1), pass("nlm", 2, 0.6, 1)];
    case "bilateral":
      return [pass("bilateral", 1, 1, 1), pass("bilateral", 2, 0.6, 1)];
    case "median":
      return [
        { filter: "median", step: s, luma, chroma },
        { filter: "median", step: 2 * s, luma: luma * 0.6, chroma },
        pass("atrous", 4, 0, 1),
      ];
    default:
      return [pass("nlm", 1, 1, 1), pass("atrous", 2, 0.6, 1), pass("atrous", 4, 0.35, 1), pass("atrous", 8, 0.2, 0.8)];
  }
}
