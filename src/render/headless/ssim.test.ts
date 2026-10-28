import { describe, expect, it } from "vitest";
import { diffImage, lumaOf, parseRegion, psnrLuma, scoreFrames, ssimLuma } from "./ssim.js";

function frame(width: number, height: number, paint: (x: number, y: number) => number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = paint(x, y);
      data.set([v, v, v, 255], (y * width + x) * 4);
    }
  }
  return data;
}

const noise = (x: number, y: number) => ((x * 73 + y * 151 + ((x * y) % 17) * 29) % 200) + 20;

describe("ssim", () => {
  it("scores a frame against itself as exactly 1 with infinite PSNR and no region", () => {
    const a = frame(64, 48, noise);
    const score = scoreFrames(a, a.slice(), 64, 48);
    expect(score.ssim).toBe(1);
    expect(score.psnr).toBe(Infinity);
    expect(score.region).toBeNull();
  });

  it("drops below the threshold and locates a block that moved", () => {
    const a = frame(128, 96, (x, y) => (x >= 40 && x < 72 && y >= 20 && y < 36 ? 250 : noise(x, y)));
    const b = frame(128, 96, (x, y) => (x >= 48 && x < 80 && y >= 20 && y < 36 ? 250 : noise(x, y)));
    const score = scoreFrames(a, b, 128, 96);
    expect(score.ssim).toBeLessThan(0.99);
    expect(score.region).not.toBeNull();
    const region = score.region!;
    expect(region.x).toBeGreaterThanOrEqual(32);
    expect(region.x + region.w).toBeLessThanOrEqual(88);
    expect(region.y).toBeLessThanOrEqual(24);
    expect(region.y + region.h).toBeGreaterThanOrEqual(32);
  });

  it("scores only the requested region", () => {
    const a = frame(64, 64, noise);
    const b = frame(64, 64, (x, y) => (x >= 32 ? 255 - noise(x, y) : noise(x, y)));
    expect(scoreFrames(a, b, 64, 64, { x: 0, y: 0, w: 24, h: 64 }).ssim).toBe(1);
    expect(scoreFrames(a, b, 64, 64, { x: 32, y: 0, w: 32, h: 64 }).ssim).toBeLessThan(0.5);
  });

  it("computes luma and PSNR", () => {
    expect(lumaOf(new Uint8Array([255, 255, 255, 255]), 1, 1)[0]).toBeCloseTo(255, 3);
    const a = new Float32Array(100).fill(100);
    const b = new Float32Array(100).fill(101);
    expect(psnrLuma(a, b)).toBeCloseTo(10 * Math.log10(255 * 255), 6);
  });

  it("handles planes smaller than a window", () => {
    expect(ssimLuma(new Float32Array(9).fill(5), new Float32Array(9).fill(5), 3, 3)).toBe(1);
  });

  it("parses regions", () => {
    expect(parseRegion("10,20,30,40")).toEqual({ x: 10, y: 20, w: 30, h: 40 });
    expect(parseRegion("10,20,0,40")).toBeNull();
    expect(parseRegion("a,b")).toBeNull();
  });

  it("amplifies differences in the diff image", () => {
    const a = new Uint8Array([10, 10, 10, 255]);
    const b = new Uint8Array([12, 10, 10, 255]);
    expect([...diffImage(a, b)]).toEqual([16, 0, 0, 255]);
  });
});
