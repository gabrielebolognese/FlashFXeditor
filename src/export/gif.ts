// GIF output of the export (spec §21.25, Batch 81) on top of gifenc (MIT, the encoder and the
// quantizer; the rest is here):
// - One palette per export: 256 colors quantized from a sample of frames spread over the range, so
//   the colors do not flicker from frame to frame and every frame shares the global table.
// - Optional dithering: an ordered 4x4 (Bayer) offset added to each pixel before it is matched to the
//   palette (cheap: gifenc's lookup is cached; error diffusion would cost a palette search per pixel).
// - Frame delays are hundredths of a second: the rounding error is carried to the next frame, so 15 fps
//   (66.7 ms) alternates 6 and 7 cs and the file plays at the rate asked.
// - A size estimate from frames already encoded: the average bytes of the sampled frames times the
//   frame count (the Export tab's number before a job is a per-pixel guess, presets.ts).
import { applyPalette, GIFEncoder, quantize, type GifEncoder, type Palette } from "gifenc";

/** Straight-alpha RGBA pixels of a frame. */
export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

/** Frames sampled for the palette (spread over the range). */
export const PALETTE_SAMPLES = 8;
/** Every n-th pixel of a sample frame feeds the quantizer. */
export const PALETTE_STRIDE = 3;
const PALETTE_FORMAT = "rgb565";
/** Ordered dithering's spread: the palette's steps are about this wide in a 256-color table. */
export const DITHER_SPREAD = 24;

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** The `count` frame indices of `total` frames the palette is made from: first, last and evenly spread, no repeats. */
export function sampleIndices(total: number, count = PALETTE_SAMPLES): number[] {
  if (total <= 0) return [];
  const n = Math.min(count, total);
  if (n === 1) return [0];
  const out = new Set<number>();
  for (let i = 0; i < n; i++) out.add(Math.round((i * (total - 1)) / (n - 1)));
  return [...out];
}

/** A 256-color palette for the sampled frames (a frame with alpha is taken as it is: GIF frames here are opaque). */
export function buildPalette(samples: readonly RgbaImage[]): Palette {
  const pixels = samples.reduce((n, s) => n + Math.ceil((s.width * s.height) / PALETTE_STRIDE), 0);
  const gathered = new Uint8Array(Math.max(1, pixels) * 4);
  let at = 0;
  for (const sample of samples) {
    const count = sample.width * sample.height;
    for (let p = 0; p < count; p += PALETTE_STRIDE) {
      gathered[at++] = sample.data[p * 4] as number;
      gathered[at++] = sample.data[p * 4 + 1] as number;
      gathered[at++] = sample.data[p * 4 + 2] as number;
      gathered[at++] = 255;
    }
  }
  return quantize(gathered.subarray(0, Math.max(4, at)), 256, { format: PALETTE_FORMAT });
}

/** `image` with an ordered dither offset added to each color (a copy; alpha untouched). */
export function ditherOrdered(image: RgbaImage, spread = DITHER_SPREAD): Uint8Array {
  const { width, height, data } = image;
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = ((BAYER[(y & 3) * 4 + (x & 3)] as number) / 16 - 0.5) * spread;
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) out[i + c] = Math.max(0, Math.min(255, Math.round((data[i + c] as number) + offset)));
      out[i + 3] = data[i + 3] as number;
    }
  }
  return out;
}

export interface GifOptions {
  width: number;
  height: number;
  /** Frames per second of the animation. */
  fps: number;
  palette: Palette;
  dither: boolean;
}

/** Writes the animation frame by frame; each call returns the bytes it added to the file (position by `bytes`). */
export class GifWriter {
  private readonly gif: GifEncoder = GIFEncoder({ auto: true, initialCapacity: 1 << 20 });
  private emitted = 0;
  private frames = 0;
  private elapsedCs = 0;

  constructor(private readonly options: GifOptions) {}

  /** The file's length so far. */
  get bytes(): number {
    return this.emitted;
  }

  /** Adds a frame; returns the new bytes of the file (the header comes with the first frame). */
  addFrame(image: RgbaImage): Uint8Array {
    const { width, height, fps, palette, dither } = this.options;
    if (image.width !== width || image.height !== height) throw new Error(`A GIF frame is ${width}x${height}, not ${image.width}x${image.height}`);
    const source = dither ? ditherOrdered(image) : image.data instanceof Uint8Array ? image.data : new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength);
    // applyPalette reads the pixels as 32-bit words from the start of their buffer.
    const aligned = source.byteOffset === 0 && source.byteLength === source.buffer.byteLength ? source : source.slice();
    const index = applyPalette(aligned, palette, PALETTE_FORMAT);
    this.frames += 1;
    // The cumulative centisecond count, rounded: the error never builds up.
    const total = Math.round((this.frames * 100) / fps);
    const delayCs = Math.max(2, total - this.elapsedCs);
    this.elapsedCs += delayCs;
    this.gif.writeFrame(index, width, height, this.frames === 1 ? { palette, delay: delayCs * 10, repeat: 0 } : { delay: delayCs * 10 });
    return this.take();
  }

  /** Ends the file; returns its last bytes. */
  finish(): Uint8Array {
    this.gif.finish();
    return this.take();
  }

  private take(): Uint8Array {
    const view = this.gif.bytesView();
    const added = view.slice(this.emitted);
    this.emitted = view.length;
    return added;
  }
}

/** The file size of `total` frames from the sizes of the `sampled` frames already encoded (header and trailer included in each sample's cost). */
export function projectGifBytes(sampleBytes: readonly number[], total: number, fixedBytes: number): number {
  if (sampleBytes.length === 0) return 0;
  const mean = sampleBytes.reduce((n, b) => n + b, 0) / sampleBytes.length;
  return Math.round(fixedBytes + mean * total);
}
