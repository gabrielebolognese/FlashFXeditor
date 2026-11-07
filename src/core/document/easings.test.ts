import { describe, expect, it } from "vitest";
import golden from "./easings.golden.json";
import { EASINGS, cubicBezier, springProgress } from "./easings.js";
import { ease, keyEase, sampleKeys, sampleVector, type Key } from "./keyframes.js";
import { PENNER_EASES } from "./types.js";

// `easings.golden.json` holds the 30 Penner curves at t = 0, 0.01, ..., 1 as FlashFX-v2's
// src/core/easings.ts (fc934bb) computes them, and its cubicBezier for (0.68, -0.55, 0.27, 1.55).

describe("Penner eases (spec §21.9)", () => {
  it("has the 30 of FlashFX-v2", () => {
    expect([...PENNER_EASES].sort()).toEqual(Object.keys(golden.penner).sort());
    expect(PENNER_EASES).toHaveLength(30);
  });

  it("matches the FlashFX-v2 curve of each at 101 sample points", () => {
    for (const id of PENNER_EASES) {
      const expected = (golden.penner as Record<string, number[]>)[id] as number[];
      expect(expected).toHaveLength(101);
      for (let i = 0; i <= 100; i++) {
        const t = i / 100;
        expect(EASINGS[id](t), `${id} at ${t}`).toBeCloseTo(expected[i] as number, 12);
        // The keyframe ease selector gives the same number.
        expect(ease(id, t), `${id} at ${t} through ease()`).toBeCloseTo(expected[i] as number, 12);
      }
    }
  });

  it("starts exactly at 0 and ends exactly at 1", () => {
    for (const id of PENNER_EASES) {
      expect(ease(id, 0)).toBe(0);
      expect(ease(id, 1)).toBe(1);
    }
  });

  it("overshoots where its name says so", () => {
    expect(Math.max(...Array.from({ length: 101 }, (_, i) => ease("backOut", i / 100)))).toBeGreaterThan(1.05);
    expect(Math.min(...Array.from({ length: 101 }, (_, i) => ease("backIn", i / 100)))).toBeLessThan(-0.05);
    expect(Math.max(...Array.from({ length: 101 }, (_, i) => ease("elasticOut", i / 100)))).toBeGreaterThan(1.1);
    expect(Math.max(...Array.from({ length: 101 }, (_, i) => ease("bounceOut", i / 100)))).toBeLessThanOrEqual(1);
  });
});

/** CSS cubic-bezier by bisection on x (the definition, not the solver under test). */
function cssBezier(x1: number, y1: number, x2: number, y2: number, t: number): number {
  const at = (a: number, b: number, s: number) => 3 * a * (1 - s) ** 2 * s + 3 * b * (1 - s) * s ** 2 + s ** 3;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (at(x1, x2, mid) < t) lo = mid;
    else hi = mid;
  }
  return at(y1, y2, (lo + hi) / 2);
}

describe("bezier ease", () => {
  const curve: [number, number, number, number] = [0.68, -0.55, 0.27, 1.55];
  const key = (extra: Partial<Key> = {}): Key => ({ frame: 0, value: 0, ease: "bezier", bezier: curve, ...extra });

  it("matches the CSS cubic-bezier(0.68, -0.55, 0.27, 1.55) and FlashFX-v2's solver at 101 points", () => {
    for (let i = 0; i <= 100; i++) {
      const t = i / 100;
      const progress = keyEase(key(), t);
      expect(progress, `at ${t}`).toBeCloseTo(cssBezier(...curve, t), 5);
      expect(progress).toBeCloseTo(golden.bezier[i] as number, 12);
      expect(cubicBezier(t, ...curve)).toBeCloseTo(golden.bezier[i] as number, 12);
    }
    expect(keyEase(key(), 0)).toBe(0);
    expect(keyEase(key(), 1)).toBe(1);
  });

  it("shapes the segment from its key to the next", () => {
    const keys: Key[] = [key(), { frame: 10, value: 100, ease: "linear" }];
    expect(sampleKeys(keys, 5)).toBeCloseTo(100 * cssBezier(...curve, 0.5), 3);
    expect(sampleKeys(keys, 0)).toBe(0);
    expect(sampleKeys(keys, 10)).toBe(100);
    expect(sampleKeys(keys, 99)).toBe(100);
  });

  it("reads the CSS ease when the key has no points", () => {
    expect(keyEase({ frame: 0, value: 0, ease: "bezier" }, 0.3)).toBeCloseTo(cssBezier(0.25, 0.1, 0.25, 1, 0.3), 5);
  });
});

describe("spring ease", () => {
  it("starts on the first value and ends exactly on the next key's value", () => {
    for (const spring of [undefined, { damping: 0.7, frequency: 4 }, { damping: 0.2, frequency: 7 }, { damping: 0, frequency: 3 }, { damping: 2, frequency: 1.5 }]) {
      const keys: Key[] = [{ frame: 0, value: 10, ease: "spring", ...(spring && { spring }) }, { frame: 24, value: 250, ease: "linear" }];
      expect(sampleKeys(keys, 0)).toBe(10);
      expect(sampleKeys(keys, 24)).toBe(250);
      expect(sampleKeys(keys, 23.999999)).toBeCloseTo(250, 2);
      expect(springProgress(1, spring?.damping, spring?.frequency)).toBe(1);
    }
  });

  it("oscillates around the target: it passes it and returns", () => {
    const values = Array.from({ length: 101 }, (_, i) => springProgress(i / 100));
    expect(Math.max(...values)).toBeGreaterThan(1.05);
    expect(values.some((v) => v < 1) && values.slice(50).some((v) => v < 1)).toBe(true);
  });

  it("defaults to damping 0.7 and frequency 4", () => {
    const plain: Key = { frame: 0, value: 0, ease: "spring" };
    const explicit: Key = { ...plain, spring: { damping: 0.7, frequency: 4 } };
    for (let i = 0; i <= 20; i++) expect(keyEase(plain, i / 20)).toBe(keyEase(explicit, i / 20));
  });
});

describe("vector values", () => {
  const red = [1, 0, 0, 1];
  const blue = [0, 0, 1, 0.5];

  it("interpolates a color per channel", () => {
    const keys: Key[] = [{ frame: 0, value: red, ease: "linear" }, { frame: 10, value: blue, ease: "linear" }];
    expect(sampleVector(keys, 5, [])).toEqual([0.5, 0, 0.5, 0.75]);
    expect(sampleVector(keys, 0, [])).toEqual(red);
    expect(sampleVector(keys, 10, [])).toEqual(blue);
    expect(sampleVector(keys, -5, [])).toEqual(red);
    expect(sampleVector(keys, 50, [])).toEqual(blue);
  });

  it("holds a color until the next key", () => {
    const keys: Key[] = [{ frame: 0, value: red, ease: "hold" }, { frame: 10, value: blue, ease: "linear" }];
    expect(sampleVector(keys, 9.9, [])).toEqual(red);
    expect(sampleVector(keys, 10, [])).toEqual(blue);
  });

  it("writes into the array it is given", () => {
    const keys: Key[] = [{ frame: 0, value: red, ease: "linear" }, { frame: 10, value: blue, ease: "easeOut" }];
    const out: number[] = [];
    expect(sampleVector(keys, 3, out)).toBe(out);
  });
});
