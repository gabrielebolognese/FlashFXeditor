// @vitest-environment node
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { crc32 } from "../project/zip.js";
import type { RgbaImage } from "./gif.js";
import { encodePng, filterRows, hasTransparency } from "./png.js";

/** Decodes a PNG made by `encodePng` (8-bit, Sub or None filters) back to RGBA. */
function decode(png: Uint8Array): { width: number; height: number; colorType: number; rgba: Uint8Array } {
  expect(Array.from(png.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let at = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat: Uint8Array[] = [];
  let ended = false;
  while (at < png.length) {
    const length = view.getUint32(at);
    const type = new TextDecoder().decode(png.slice(at + 4, at + 8));
    const body = png.slice(at + 8, at + 8 + length);
    // Every chunk's CRC covers its type and data.
    expect(view.getUint32(at + 8 + length)).toBe(crc32(png.slice(at + 4, at + 8 + length)));
    if (type === "IHDR") {
      width = view.getUint32(at + 8);
      height = view.getUint32(at + 12);
      expect(png[at + 16]).toBe(8);
      colorType = png[at + 17] as number;
    } else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") ended = true;
    at += 12 + length;
  }
  expect(ended).toBe(true);
  const raw = new Uint8Array(inflateSync(Buffer.concat(idat)));
  const channels = colorType === 6 ? 4 : 3;
  const rowBytes = width * channels;
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (rowBytes + 1)] as number;
    expect([0, 1]).toContain(filter);
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < channels; c++) {
        const byte = raw[y * (rowBytes + 1) + 1 + x * channels + c] as number;
        const left = filter === 1 && x > 0 ? (rgba[(y * width + x - 1) * 4 + c] as number) : 0;
        rgba[(y * width + x) * 4 + c] = (byte + left) & 255;
      }
      if (channels === 3) rgba[(y * width + x) * 4 + 3] = 255;
    }
  }
  return { width, height, colorType, rgba };
}

function image(width: number, height: number, alpha: (x: number, y: number) => number): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data.set([(x * 9) & 255, (y * 17) & 255, (x * y) & 255, alpha(x, y)], (y * width + x) * 4);
  }
  return { width, height, data };
}

describe("encodePng", () => {
  it("writes straight RGBA exactly, including the color of nearly transparent pixels", async () => {
    const source = image(37, 21, (x, y) => (x + y) % 5 === 0 ? 0 : (x * 7 + y) & 255);
    expect(hasTransparency(source)).toBe(true);
    const png = await encodePng(source);
    const out = decode(png);
    expect(out).toMatchObject({ width: 37, height: 21, colorType: 6 });
    expect(Array.from(out.rgba)).toEqual(Array.from(source.data));
  });

  it("writes an opaque frame as RGB (a quarter smaller before compression), and can force alpha", async () => {
    const source = image(40, 30, () => 255);
    expect(hasTransparency(source)).toBe(false);
    const rgb = decode(await encodePng(source));
    expect(rgb.colorType).toBe(2);
    expect(Array.from(rgb.rgba)).toEqual(Array.from(source.data));
    expect(decode(await encodePng(source, true)).colorType).toBe(6);
    expect(filterRows(source, false).length).toBe(30 * (40 * 3 + 1));
    expect(filterRows(source, true).length).toBe(30 * (40 * 4 + 1));
  });

  it("compresses flat areas", async () => {
    const flat: RgbaImage = { width: 200, height: 200, data: new Uint8ClampedArray(200 * 200 * 4).fill(7) };
    expect((await encodePng(flat)).length).toBeLessThan(800);
  });
});
