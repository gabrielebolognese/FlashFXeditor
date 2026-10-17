import { describe, expect, it } from "vitest";
import { DEFAULT_FRAME_US, frameAt, frameDurationUs, imageTimeUs, keptFrames, loopTimeUs } from "./animation.js";

const FPS_30 = { num: 30, den: 1 };

describe("frameDurationUs", () => {
  it("shows frames shorter than 20 ms (or without a duration) for 100 ms, as browsers do", () => {
    expect(frameDurationUs(40_000)).toBe(40_000);
    expect(frameDurationUs(20_000)).toBe(20_000);
    expect(frameDurationUs(10_000)).toBe(DEFAULT_FRAME_US);
    expect(frameDurationUs(0)).toBe(DEFAULT_FRAME_US);
    expect(frameDurationUs(null)).toBe(DEFAULT_FRAME_US);
    expect(frameDurationUs(33_333.6)).toBe(33_334);
  });
});

describe("keptFrames", () => {
  it("keeps every frame when they fit the budget", () => {
    expect(keptFrames([100_000, 50_000, 50_000], 10, 100)).toEqual({ indexes: [0, 1, 2], startsUs: [0, 100_000, 150_000], durationUs: 200_000 });
  });

  it("keeps every k-th frame for the smallest k that fits, keeping each one's start and the whole length", () => {
    const durations = Array.from({ length: 10 }, () => 40_000);
    // 4 frames fit: every 3rd frame (4 kept).
    expect(keptFrames(durations, 25, 100)).toEqual({ indexes: [0, 3, 6, 9], startsUs: [0, 120_000, 240_000, 360_000], durationUs: 400_000 });
    // 1 fits: the first frame holds the whole animation.
    expect(keptFrames(durations, 1000, 100)).toEqual({ indexes: [0], startsUs: [0], durationUs: 400_000 });
    // A 128 MB budget and 6.2 MB frames (1080x1080 with mips): 20 of 60 frames.
    const kept = keptFrames(Array.from({ length: 60 }, () => 33_333), 6_220_800);
    expect(kept.indexes).toHaveLength(20);
    expect(kept.indexes.slice(0, 3)).toEqual([0, 3, 6]);
  });
});

describe("frameAt and loopTimeUs", () => {
  const starts = [0, 100_000, 150_000, 300_000];

  it("finds the frame whose span holds a time", () => {
    expect([0, 99_999, 100_000, 149_999, 150_000, 299_999, 300_000, 10_000_000].map((t) => frameAt(starts, t))).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    expect(frameAt([0], 5)).toBe(0);
  });

  it("wraps times into one loop (negative ones too), 0 for stills", () => {
    expect(loopTimeUs(450_000, 400_000)).toBe(50_000);
    expect(loopTimeUs(-50_000, 400_000)).toBe(350_000);
    expect(loopTimeUs(400_000, 400_000)).toBe(0);
    expect(loopTimeUs(123, 0)).toBe(0);
  });
});

describe("imageTimeUs", () => {
  it("plays from the clip's in point at the project rate and loops", () => {
    const clip = { start: 30, in: 0 };
    expect(imageTimeUs(clip, 30, FPS_30, 1_000_000)).toBe(0);
    expect(imageTimeUs(clip, 45, FPS_30, 1_000_000)).toBe(500_000);
    expect(imageTimeUs(clip, 60, FPS_30, 1_000_000)).toBe(0);
    expect(imageTimeUs(clip, 61, FPS_30, 1_000_000)).toBe(33_333);
    // A right piece of a split keeps the animation going.
    expect(imageTimeUs({ start: 45, in: 500_000 }, 45, FPS_30, 1_000_000)).toBe(500_000);
    expect(imageTimeUs(clip, 45, FPS_30, 0)).toBe(0);
  });
});
