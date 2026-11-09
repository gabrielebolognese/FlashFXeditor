import { describe, expect, it } from "vitest";
import { chromaKeyAlpha, colorAdjust, dominantChannel, grainHash, grainNoise, hslToRgb, luma709, lumaKeyAlpha, rgbToHsl, smoothstep, suppressSpill, vignetteChannel, vignetteFactor, type ColorAdjust } from "./colorMath.js";

const NONE: ColorAdjust = { brightness: 0, contrast: 0, saturation: 0, exposure: 0, temperature: 0, tint: 0, hue: 0, vibrance: 0 };
/** A seeded generator (mulberry32): the same cases on every run. */
function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const next = random(75);
const cases = (n: number): [number, number, number][] => Array.from({ length: n }, () => [next(), next(), next()]);
const span = (min: number, max: number) => min + (max - min) * next();

describe("color math (spec §21.19, Batch 75)", () => {
  it("smoothstep is a hard step on a degenerate window", () => {
    expect(smoothstep(0.2, 0.2, 0.1)).toBe(0);
    expect(smoothstep(0.2, 0.2, 0.2)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 9);
  });

  it("round-trips HSL", () => {
    for (const [r, g, b] of cases(500)) {
      const back = hslToRgb(...rgbToHsl(r, g, b));
      expect(back[0]).toBeCloseTo(r, 6);
      expect(back[1]).toBeCloseTo(g, 6);
      expect(back[2]).toBeCloseTo(b, 6);
    }
  });

  it("leaves a color alone at the defaults and always stays in 0..1", () => {
    for (const [r, g, b] of cases(500)) {
      const out = colorAdjust([r, g, b], NONE);
      expect(out[0]).toBeCloseTo(r, 9);
      expect(out[1]).toBeCloseTo(g, 9);
      expect(out[2]).toBeCloseTo(b, 9);
    }
    for (const c of cases(2000)) {
      const p = { brightness: span(-100, 100), contrast: span(-100, 100), saturation: span(-100, 100), exposure: span(-5, 5), temperature: span(-100, 100), tint: span(-100, 100), hue: span(-180, 180), vibrance: span(-100, 100) };
      for (const v of colorAdjust(c, p)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it("does what each control says", () => {
    expect(colorAdjust([0.25, 0.25, 0.25], { ...NONE, exposure: 1 })).toEqual([0.5, 0.5, 0.5]);
    const gray = colorAdjust([0.8, 0.2, 0.4], { ...NONE, saturation: -100 });
    expect(gray[0]).toBeCloseTo(gray[1], 9);
    expect(gray[0]).toBeCloseTo(luma709(0.8, 0.2, 0.4), 9);
    const warm = colorAdjust([0.5, 0.5, 0.5], { ...NONE, temperature: 50 });
    expect(warm[0]).toBeGreaterThan(warm[2]);
    const magenta = colorAdjust([0.5, 0.5, 0.5], { ...NONE, tint: 100 });
    expect(magenta[1]).toBeLessThan(magenta[0]);
    expect(colorAdjust([0.5, 0.5, 0.5], { ...NONE, contrast: 100 })).toEqual([0.5, 0.5, 0.5]);
    // Hue 120: red becomes green.
    const turned = colorAdjust([1, 0, 0], { ...NONE, hue: 120 });
    expect(turned[1]).toBeCloseTo(1, 6);
    expect(turned[0]).toBeCloseTo(0, 6);
    // Vibrance boosts a dull color more than a vivid one.
    const dull = colorAdjust([0.5, 0.45, 0.4], { ...NONE, vibrance: 100 });
    expect(dull[0] - dull[2]).toBeGreaterThan(0.1 * 1.5);
  });

  it("darkens the vignette's corners, never its center", () => {
    expect(vignetteFactor(0.5, 0.5, 0.9, 0.6)).toBe(1);
    expect(vignetteFactor(0, 0, 0.9, 0.6)).toBe(0);
    expect(vignetteChannel(0.8, 0, 0.5)).toBeCloseTo(0.4, 9);
    expect(vignetteChannel(0.8, 0, 0)).toBe(0.8);
  });

  it("keys the screen color out and keeps a far color, with a soft edge between", () => {
    const green = [0, 0.694, 0.251];
    expect(chromaKeyAlpha(green, green, 0.18, 0.12)).toBe(0);
    expect(chromaKeyAlpha([0.9, 0.7, 0.6], green, 0.18, 0.12)).toBe(1);
    const edge = chromaKeyAlpha([0.325, 0.568, 0.413], green, 0.18, 0.12);
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(1);
    expect(dominantChannel(0, 0.7, 0.25)).toBe(1);
    expect(dominantChannel(0.1, 0.2, 0.9)).toBe(2);
    // Spill: the green of a greenish skin tone is pulled down to the red.
    expect(suppressSpill([0.6, 0.8, 0.4], 1, 1)).toEqual([0.6, 0.6, 0.4]);
    expect(suppressSpill([0.6, 0.8, 0.4], 1, 0.5)[1]).toBeCloseTo(0.7, 9);
    expect(suppressSpill([0.8, 0.5, 0.4], 1, 1)).toEqual([0.8, 0.5, 0.4]);
  });

  it("luma-keys dark parts (or bright ones, inverted)", () => {
    expect(lumaKeyAlpha([0, 0, 0], 0.1, 0.1, false)).toBe(0);
    expect(lumaKeyAlpha([1, 1, 1], 0.1, 0.1, false)).toBe(1);
    expect(lumaKeyAlpha([1, 1, 1], 0.1, 0.1, true)).toBe(0);
  });

  it("draws grain from an integer hash: deterministic, in range, centered, new each frame", () => {
    expect(grainHash(65536, 65536, 0)).toBe(grainHash(65536, 65536, 0));
    let sum = 0;
    let differs = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      const v = grainNoise((i % 80) * 1.7, Math.floor(i / 80) * 1.3, 1.5, 3);
      expect(v).toBeGreaterThanOrEqual(-0.5);
      expect(v).toBeLessThanOrEqual(0.5);
      sum += v;
      if (v !== grainNoise((i % 80) * 1.7, Math.floor(i / 80) * 1.3, 1.5, 4)) differs++;
    }
    expect(Math.abs(sum / n)).toBeLessThan(0.03);
    expect(differs).toBeGreaterThan(n * 0.9);
    // Negative content coordinates (the stage's padding) hash like any other cell.
    expect(Number.isFinite(grainNoise(-10, -3, 2, 0))).toBe(true);
  });
});
