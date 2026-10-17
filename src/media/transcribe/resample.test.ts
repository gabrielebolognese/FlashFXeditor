import { describe, expect, it } from "vitest";
import { resample } from "./resample.js";

const sine = (hz: number, rate: number, seconds: number, amplitude = 0.5) => Float32Array.from({ length: Math.round(rate * seconds) }, (_, i) => amplitude * Math.sin((2 * Math.PI * hz * i) / rate));

/** RMS level of the middle half (no edge effects). */
function rms(signal: Float32Array): number {
  const from = Math.floor(signal.length / 4);
  const to = Math.floor((signal.length * 3) / 4);
  let sum = 0;
  for (let i = from; i < to; i++) sum += (signal[i] as number) ** 2;
  return Math.sqrt(sum / (to - from));
}

/** Zero crossings per second of the middle half. */
function crossingsPerSecond(signal: Float32Array, rate: number): number {
  const from = Math.floor(signal.length / 4);
  const to = Math.floor((signal.length * 3) / 4);
  let count = 0;
  for (let i = from + 1; i < to; i++) if (((signal[i - 1] as number) < 0) !== ((signal[i] as number) < 0)) count += 1;
  return count / ((to - from) / rate);
}

describe("resample", () => {
  it("gives round(length x to / from) samples, and a copy at the same rate", () => {
    expect(resample(new Float32Array(48_000), 48_000, 16_000)).toHaveLength(16_000);
    expect(resample(new Float32Array(44_101), 44_100, 16_000)).toHaveLength(16_000);
    const same = new Float32Array([0.1, 0.2]);
    const copy = resample(same, 16_000, 16_000);
    expect([...copy]).toEqual([...same]);
    expect(copy).not.toBe(same);
    expect(() => resample(same, 0, 16_000)).toThrow();
  });

  it("keeps speech frequencies at their level and pitch (48 kHz and 44.1 kHz to 16 kHz)", () => {
    for (const from of [48_000, 44_100]) {
      for (const hz of [200, 1000, 3000, 6000]) {
        const out = resample(sine(hz, from, 0.5), from, 16_000);
        expect(rms(out)).toBeCloseTo(0.5 / Math.SQRT2, 2);
        expect(crossingsPerSecond(out, 16_000)).toBeCloseTo(2 * hz, -1);
      }
    }
  });

  it("removes what is above the new Nyquist frequency instead of folding it into the speech band", () => {
    for (const hz of [9000, 12_000, 20_000]) {
      const out = resample(sine(hz, 48_000, 0.5), 48_000, 16_000);
      // Below -50 dB of the input level.
      expect(rms(out) / (0.5 / Math.SQRT2)).toBeLessThan(10 ** (-50 / 20));
    }
  });

  it("keeps a constant level up to the edges", () => {
    const out = resample(new Float32Array(4800).fill(0.25), 48_000, 16_000);
    for (const value of [out[0], out[1], out[800], out[out.length - 1]]) expect(value).toBeCloseTo(0.25, 5);
  });

  it("converts a minute of 48 kHz audio quickly", () => {
    const input = sine(440, 48_000, 60);
    const t0 = performance.now();
    const out = resample(input, 48_000, 16_000);
    expect(out).toHaveLength(960_000);
    // Generous: the full parallel test run is several times slower than a lone one.
    expect(performance.now() - t0).toBeLessThan(10_000);
  });
});
