import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { COMPOSITING_FIXTURE_FRAMES } from "../document/compositingFixture.js";
import { BLEND_MODES, compositeBlend, type Premultiplied } from "./blendModes.js";

// Acceptance (Batch 72): every blend mode matches its reference formula on the test chart. The expected
// frames of fixtures/interop/compositing (rendered by the headless CLI on WebGPU, which `npm run
// test:render` holds both backends to) are compared pixel by pixel with the CPU formulas applied to the
// chart's own pictures: the ramp (opaque top half, alpha 128 bottom half) over the color bars.

const DIR = "fixtures/interop/compositing";
/** 8-bit rounding of the sources and the frame, plus the GPU's float path. */
const TOLERANCE = 3 / 255;
/** Color burn and dodge divide by the source: the 8-bit rounding of the sources grows near the pole. */
const DIVIDING = new Set(["colorBurn", "colorDodge"]);

interface Picture {
  width: number;
  height: number;
  /** RGBA, 8 bits per channel, straight alpha. */
  data: Uint8Array;
}

/** A minimal decoder for 8-bit non-interlaced RGBA or RGB PNGs (the fixture pictures and CLI frames). */
function readPng(path: string): Picture {
  const file = readFileSync(path);
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 4;
  const idat: Buffer[] = [];
  while (offset < file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.toString("ascii", offset + 4, offset + 8);
    const body = file.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      if (body[8] !== 8 || body[12] !== 0) throw new Error(`${path}: only 8-bit non-interlaced PNGs`);
      channels = body[9] === 6 ? 4 : body[9] === 2 ? 3 : 0;
      if (channels === 0) throw new Error(`${path}: color type ${body[9]}`);
    } else if (type === "IDAT") idat.push(body);
    offset += length + 12;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const rows = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)] as number;
    for (let x = 0; x < stride; x++) {
      const value = raw[y * (stride + 1) + 1 + x] as number;
      const a = x >= channels ? (rows[y * stride + x - channels] as number) : 0;
      const b = y > 0 ? (rows[(y - 1) * stride + x] as number) : 0;
      const c = x >= channels && y > 0 ? (rows[(y - 1) * stride + x - channels] as number) : 0;
      let predicted = 0;
      if (filter === 1) predicted = a;
      else if (filter === 2) predicted = b;
      else if (filter === 3) predicted = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        predicted = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      rows[y * stride + x] = (value + predicted) & 0xff;
    }
  }
  if (channels === 4) return { width, height, data: rows };
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([rows[i * 3] as number, rows[i * 3 + 1] as number, rows[i * 3 + 2] as number, 255], i * 4);
  return { width, height, data };
}

const premultiplied = (picture: Picture, x: number, y: number): Premultiplied => {
  const i = (y * picture.width + x) * 4;
  const a = (picture.data[i + 3] as number) / 255;
  return [((picture.data[i] as number) / 255) * a, ((picture.data[i + 1] as number) / 255) * a, ((picture.data[i + 2] as number) / 255) * a, a];
};

describe("blend modes on the test chart (Batch 72)", () => {
  const bars = readPng(`${DIR}/media/bars.png`);
  const ramp = readPng(`${DIR}/media/ramp.png`);

  it.each(BLEND_MODES.map((mode, i) => [mode, COMPOSITING_FIXTURE_FRAMES[i] as number] as const))("%s matches its formula (frame %i)", (mode, frame) => {
    const out = readPng(`${DIR}/expected/Interop compositing-frame-${frame}.png`);
    expect([out.width, out.height]).toEqual([bars.width, bars.height]);
    let worst = 0;
    let samples = 0;
    // Pixel centers on a grid, away from the bar and band edges (where a texel's neighbours differ).
    for (let y = 3; y < out.height; y += 7) {
      for (let x = 2; x < out.width; x += 5) {
        const near = (picture: Picture) => {
          const here = premultiplied(picture, x, y);
          return [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx = 0, dy = 0]) => {
            const there = premultiplied(picture, Math.min(picture.width - 1, Math.max(0, x + dx)), Math.min(picture.height - 1, Math.max(0, y + dy)));
            return here.every((v, c) => Math.abs(v - (there[c] as number)) < 8 / 255);
          });
        };
        if (!near(bars) || !near(ramp)) continue;
        const want = compositeBlend(premultiplied(bars, x, y), premultiplied(ramp, x, y), mode);
        const got = premultiplied(out, x, y);
        for (let c = 0; c < 4; c++) worst = Math.max(worst, Math.abs((want[c] as number) - (got[c] as number)));
        samples++;
      }
    }
    expect(samples).toBeGreaterThan(2000);
    expect(worst).toBeLessThanOrEqual(DIVIDING.has(mode) ? 2 * TOLERANCE : TOLERANCE);
  });
});
