import { describe, expect, it } from "vitest";
import { estimateFps, reduceRational, snapToStandardRate } from "./fps.js";

/** Presentation times from per-sample deltas. */
function times(deltas: readonly number[]): number[] {
  const out = [0];
  for (const delta of deltas) out.push((out[out.length - 1] ?? 0) + delta);
  return out;
}

describe("estimateFps", () => {
  it("reads exact rationals from the timescale", () => {
    expect(estimateFps(times(Array(119).fill(1001)), 30000)).toEqual({ num: 30000, den: 1001 });
    expect(estimateFps(times(Array(119).fill(1001)), 24000)).toEqual({ num: 24000, den: 1001 });
    expect(estimateFps(times(Array(119).fill(512)), 15360)).toEqual({ num: 30, den: 1 });
    expect(estimateFps(times(Array(119).fill(10)), 600)).toEqual({ num: 60, den: 1 });
  });

  it("averages 20/21-tick alternation at timescale 600 to 29.97", () => {
    const deltas = Array.from({ length: 119 }, (_, i) => (i % 50 === 49 ? 21 : 20));
    expect(estimateFps(times(deltas), 600)).toEqual({ num: 30000, den: 1001 });
  });

  it("takes the dominant delta of variable-frame-rate phone video", () => {
    // Android: 90 kHz, one tick of jitter, a few dropped frames (double deltas).
    const deltas = Array.from({ length: 119 }, (_, i) => (i % 17 === 0 ? 6000 : i % 3 === 0 ? 2999 : i % 3 === 1 ? 3001 : 3000));
    expect(estimateFps(times(deltas), 90000)).toEqual({ num: 30, den: 1 });
    // Microsecond timescale with jitter around 33 333 us.
    const jitter = Array.from({ length: 119 }, (_, i) => 33333 + ((i * 7) % 3) - 1);
    expect(estimateFps(times(jitter), 1_000_000)).toEqual({ num: 30, den: 1 });
  });

  it("sorts B-frame presentation order and uses only the first 120 samples", () => {
    const decodeOrder = [0, 3, 1, 2, 6, 4, 5, 9, 7, 8].map((i) => i * 1001);
    expect(estimateFps(decodeOrder, 30000)).toEqual({ num: 30000, den: 1001 });
    const long = [...times(Array(119).fill(1000)), ...times(Array(500).fill(2000)).map((t) => t + 1e6)];
    expect(estimateFps(long, 30000)).toEqual({ num: 30, den: 1 });
  });

  it("snaps millisecond times (WebM) within their rounding: 30, 60 and 15 fps", () => {
    // A Chrome screen recording at 30 fps: mostly 33 ms, some 34 and 32 (capture jitter), a few long gaps.
    const recording = Array.from({ length: 119 }, (_, i) => (i % 9 === 4 ? 34 : i % 13 === 6 ? 32 : i % 31 === 30 ? 67 : 33));
    expect(estimateFps(times(recording), 1000)).toEqual({ num: 30, den: 1 });
    expect(estimateFps(times(Array.from({ length: 119 }, (_, i) => (i % 3 === 2 ? 16 : 17))), 1000)).toEqual({ num: 60, den: 1 });
    expect(estimateFps(times(Array.from({ length: 119 }, (_, i) => (i % 3 === 0 ? 66 : 67))), 1000)).toEqual({ num: 15, den: 1 });
    // 29.97 at 600 stays 29.97 (the nearest within the looser tolerance).
    expect(estimateFps(times(Array.from({ length: 119 }, (_, i) => (i % 50 === 49 ? 21 : 20))), 600)).toEqual({ num: 30000, den: 1001 });
  });

  it("keeps an unusual rate as the reduced rational", () => {
    expect(estimateFps(times(Array(50).fill(3)), 37)).toEqual({ num: 37, den: 3 });
  });

  it("returns null without two distinct times", () => {
    expect(estimateFps([], 30000)).toBeNull();
    expect(estimateFps([5], 30000)).toBeNull();
    expect(estimateFps([5, 5, 5], 30000)).toBeNull();
    expect(estimateFps([0, 1000], 0)).toBeNull();
  });
});

describe("helpers", () => {
  it("reduces and snaps", () => {
    expect(reduceRational(90000, 3000)).toEqual({ num: 30, den: 1 });
    expect(snapToStandardRate(29.97)).toEqual({ num: 30000, den: 1001 });
    expect(snapToStandardRate(27)).toBeNull();
    expect(snapToStandardRate(30.26)).toBeNull();
    expect(snapToStandardRate(30.26, 0.015)).toEqual({ num: 30, den: 1 });
  });
});
