// Frame comparison for `cli compare` (spec §21.6): SSIM on luma over 8x8 windows (stride 4), PSNR, a
// region of the frame, and the area where two frames differ most. Pure functions over RGBA bytes;
// the headless page runs them (it decodes the frames), the unit tests run them in Node.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FrameScore {
  ssim: number;
  psnr: number;
  /** The bounding box of the windows that differ (SSIM below `REGION_SSIM`), or null when none do. */
  region: Rect | null;
}

const WINDOW = 8;
const STRIDE = 4;
const C1 = (0.01 * 255) ** 2;
const C2 = (0.03 * 255) ** 2;
/** A window below this SSIM counts as different when the region of a difference is located. */
export const REGION_SSIM = 0.98;

/** Rec. 709 luma of RGBA bytes (0..255), one value per pixel. */
export function lumaOf(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Float32Array {
  const luma = new Float32Array(width * height);
  for (let i = 0, p = 0; i < luma.length; i++, p += 4) luma[i] = 0.2126 * (rgba[p] as number) + 0.7152 * (rgba[p + 1] as number) + 0.0722 * (rgba[p + 2] as number);
  return luma;
}

/** The part of a luma plane inside `rect` (clamped to the plane); the plane itself without a rect. */
export function cropLuma(luma: Float32Array, width: number, height: number, rect: Rect | null): { luma: Float32Array; width: number; height: number; x: number; y: number } {
  if (!rect) return { luma, width, height, x: 0, y: 0 };
  const x = Math.max(0, Math.min(width - 1, Math.floor(rect.x)));
  const y = Math.max(0, Math.min(height - 1, Math.floor(rect.y)));
  const w = Math.max(1, Math.min(width - x, Math.floor(rect.w)));
  const h = Math.max(1, Math.min(height - y, Math.floor(rect.h)));
  const out = new Float32Array(w * h);
  for (let row = 0; row < h; row++) out.set(luma.subarray((y + row) * width + x, (y + row) * width + x + w), row * w);
  return { luma: out, width: w, height: h, x, y };
}

/** Peak signal to noise ratio of two luma planes (dB; Infinity for identical planes). */
export function psnrLuma(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] as number) - (b[i] as number);
    sum += d * d;
  }
  if (sum === 0) return Infinity;
  return 10 * Math.log10((255 * 255) / (sum / a.length));
}

/**
 * Mean SSIM over 8x8 windows at stride 4 (one window when the plane is smaller). `onWindow` hears each
 * window's origin and score, to locate a difference.
 */
export function ssimLuma(a: Float32Array, b: Float32Array, width: number, height: number, onWindow?: (x: number, y: number, score: number) => void): number {
  const win = Math.min(WINDOW, width, height);
  const n = win * win;
  let total = 0;
  let count = 0;
  for (let y = 0; y + win <= height; y += STRIDE) {
    for (let x = 0; x + win <= width; x += STRIDE) {
      let sa = 0;
      let sb = 0;
      let saa = 0;
      let sbb = 0;
      let sab = 0;
      for (let row = 0; row < win; row++) {
        let at = (y + row) * width + x;
        for (let col = 0; col < win; col++, at++) {
          const va = a[at] as number;
          const vb = b[at] as number;
          sa += va;
          sb += vb;
          saa += va * va;
          sbb += vb * vb;
          sab += va * vb;
        }
      }
      const ma = sa / n;
      const mb = sb / n;
      const va = saa / n - ma * ma;
      const vb = sbb / n - mb * mb;
      const cov = sab / n - ma * mb;
      const score = ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
      total += score;
      count++;
      onWindow?.(x, y, score);
    }
  }
  return count === 0 ? 1 : total / count;
}

/** Scores two RGBA frames of the same size, over the whole frame or `region`. */
export function scoreFrames(a: Uint8ClampedArray | Uint8Array, b: Uint8ClampedArray | Uint8Array, width: number, height: number, region: Rect | null = null): FrameScore {
  const part = cropLuma(lumaOf(a, width, height), width, height, region);
  const other = cropLuma(lumaOf(b, width, height), width, height, region);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const ssim = ssimLuma(part.luma, other.luma, part.width, part.height, (x, y, score) => {
    if (score >= REGION_SSIM) return;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + WINDOW);
    maxY = Math.max(maxY, y + WINDOW);
  });
  const found = maxX >= 0 ? { x: part.x + minX, y: part.y + minY, w: Math.min(maxX, part.width) - minX, h: Math.min(maxY, part.height) - minY } : null;
  return { ssim, psnr: psnrLuma(part.luma, other.luma), region: found };
}

/** "x,y,w,h" as a rectangle, or null when it is not four numbers (w and h positive). */
export function parseRegion(text: string): Rect | null {
  const parts = text.split(",").map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [x, y, w, h] = parts as [number, number, number, number];
  return w > 0 && h > 0 && x >= 0 && y >= 0 ? { x, y, w, h } : null;
}

/** A difference image: absolute channel difference amplified so small changes show. */
export function diffImage(a: Uint8ClampedArray | Uint8Array, b: Uint8ClampedArray | Uint8Array): Uint8ClampedArray {
  const out = new Uint8ClampedArray(a.length);
  for (let i = 0; i < a.length; i += 4) {
    out[i] = Math.min(255, Math.abs((a[i] as number) - (b[i] as number)) * 8);
    out[i + 1] = Math.min(255, Math.abs((a[i + 1] as number) - (b[i + 1] as number)) * 8);
    out[i + 2] = Math.min(255, Math.abs((a[i + 2] as number) - (b[i + 2] as number)) * 8);
    out[i + 3] = 255;
  }
  return out;
}
