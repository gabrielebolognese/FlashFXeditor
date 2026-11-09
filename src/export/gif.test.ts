import { describe, expect, it } from "vitest";
import { buildPalette, ditherOrdered, GifWriter, projectGifBytes, sampleIndices, type RgbaImage } from "./gif.js";

/** A gradient frame whose colors shift with `phase`. */
function image(width: number, height: number, phase: number): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = (x * 255) / width;
      data[i + 1] = (y * 255) / height;
      data[i + 2] = (phase * 40) & 255;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

/** Counts the frames of a GIF and reads their delays (cs), walking its blocks. */
function parse(bytes: Uint8Array): { width: number; height: number; frames: number; delays: number[]; loops: boolean; ends: boolean } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(new TextDecoder().decode(bytes.slice(0, 6))).toBe("GIF89a");
  const width = view.getUint16(6, true);
  const height = view.getUint16(8, true);
  const flags = bytes[10] as number;
  let at = 13 + (flags & 0x80 ? 3 * 2 ** ((flags & 7) + 1) : 0);
  const delays: number[] = [];
  let frames = 0;
  let loops = false;
  const skipSubBlocks = () => {
    while ((bytes[at] as number) !== 0) at += (bytes[at] as number) + 1;
    at += 1;
  };
  while (at < bytes.length) {
    const kind = bytes[at] as number;
    if (kind === 0x3b) return { width, height, frames, delays, loops, ends: at === bytes.length - 1 };
    if (kind === 0x21) {
      const label = bytes[at + 1] as number;
      if (label === 0xf9) delays.push(view.getUint16(at + 4, true));
      if (label === 0xff) loops = true;
      at += 2;
      skipSubBlocks();
    } else if (kind === 0x2c) {
      frames += 1;
      const local = (bytes[at + 9] as number) & 0x80 ? 3 * 2 ** (((bytes[at + 9] as number) & 7) + 1) : 0;
      at += 10 + local + 1;
      skipSubBlocks();
    } else throw new Error(`Unexpected block ${kind} at ${at}`);
  }
  throw new Error("No trailer");
}

describe("sampleIndices", () => {
  it("spreads the samples from the first frame to the last, without repeats", () => {
    expect(sampleIndices(100, 5)).toEqual([0, 25, 50, 74, 99]);
    expect(sampleIndices(3, 8)).toEqual([0, 1, 2]);
    expect(sampleIndices(1)).toEqual([0]);
    expect(sampleIndices(0)).toEqual([]);
  });
});

describe("palette and dithering", () => {
  it("quantizes the samples to at most 256 colors", () => {
    const palette = buildPalette([image(32, 32, 0), image(32, 32, 3)]);
    expect(palette.length).toBeGreaterThan(8);
    expect(palette.length).toBeLessThanOrEqual(256);
    expect(palette[0]).toHaveLength(3);
  });

  it("offsets each color by an ordered pattern that averages to zero, and keeps alpha", () => {
    const flat: RgbaImage = { width: 4, height: 4, data: new Uint8ClampedArray(64).fill(128) };
    for (let i = 3; i < 64; i += 4) flat.data[i] = 200;
    const out = ditherOrdered(flat, 24);
    const values = Array.from({ length: 16 }, (_, p) => out[p * 4] as number);
    expect(new Set(values).size).toBeGreaterThan(8);
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(24);
    expect(Math.abs(values.reduce((n, v) => n + v, 0) / 16 - 128)).toBeLessThanOrEqual(1);
    expect(out[3]).toBe(200);
    // Clamped at the ends.
    const white: RgbaImage = { width: 4, height: 4, data: new Uint8ClampedArray(64).fill(255) };
    expect(Math.max(...ditherOrdered(white))).toBe(255);
  });
});

describe("GifWriter", () => {
  const frames = [0, 1, 2, 3, 4, 5].map((phase) => image(24, 16, phase));
  const palette = buildPalette(frames);
  const run = (fps: number, dither: boolean) => {
    const writer = new GifWriter({ width: 24, height: 16, fps, palette, dither });
    const parts = frames.map((f) => writer.addFrame(f));
    parts.push(writer.finish());
    const total = parts.reduce((n, p) => n + p.length, 0);
    const bytes = new Uint8Array(total);
    let at = 0;
    for (const part of parts) {
      bytes.set(part, at);
      at += part.length;
    }
    return { bytes, parts, writer };
  };

  it("writes a looping GIF89a with one image per frame, a trailer, and the pieces in file order", () => {
    const { bytes, parts, writer } = run(15, false);
    const info = parse(bytes);
    expect(info).toMatchObject({ width: 24, height: 16, frames: 6, loops: true, ends: true });
    expect(writer.bytes).toBe(bytes.length);
    expect(parts[0]!.length).toBeGreaterThan(parts[1]!.length);
  });

  it("carries the rounding of the delays: 15 fps alternates 7 and 6 cs and sums to the exact time", () => {
    const { bytes } = run(15, false);
    const { delays } = parse(bytes);
    expect(delays).toEqual([7, 6, 7, 7, 6, 7]);
    expect(delays.reduce((n, d) => n + d, 0)).toBe(40);
  });

  it("dithering changes the pixels but not the structure; a wrong frame size is refused", () => {
    const plain = run(15, false).bytes;
    const dithered = run(15, true).bytes;
    expect(parse(dithered).frames).toBe(6);
    expect(Array.from(dithered)).not.toEqual(Array.from(plain));
    const writer = new GifWriter({ width: 24, height: 16, fps: 15, palette, dither: false });
    expect(() => writer.addFrame(image(8, 8, 0))).toThrow();
  });
});

describe("projectGifBytes", () => {
  it("is the fixed bytes plus the mean frame times the frame count", () => {
    expect(projectGifBytes([100, 120, 110], 10, 50)).toBe(1150);
    expect(projectGifBytes([], 10, 50)).toBe(0);
  });
});
