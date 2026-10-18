import { describe, expect, it } from "vitest";
import type { Rational } from "../core/document/types.js";
import { audioChunkSamples, expectedChunks, exportPlan, frameDurationUs, frameTimestampUs, isKeyFrame, projectFrameAt, samplesThrough, sampleTimestampUs, videoTimescale } from "./plan.js";

const fps = (num: number, den = 1): Rational => ({ num, den });

describe("exportPlan", () => {
  it("exports every frame of a 30 fps range at 30 fps, with 48 kHz audio of the same length", () => {
    const plan = exportPlan({ start: 0, end: 1800 }, fps(30), fps(30), 2, 48000);
    expect(plan.frames).toBe(1800);
    expect(plan.keyInterval).toBe(60);
    expect(plan.samples).toBe(60 * 48000);
    expect(projectFrameAt(plan, 0)).toBe(0);
    expect(projectFrameAt(plan, 1799)).toBe(1799);
  });

  it("takes every other frame of a 60 fps project exported at 30 fps, the last one rounded up", () => {
    const plan = exportPlan({ start: 10, end: 131 }, fps(60), fps(30), 2, 48000);
    expect(plan.frames).toBe(61);
    expect(Array.from({ length: 4 }, (_, k) => projectFrameAt(plan, k))).toEqual([10, 12, 14, 16]);
    expect(projectFrameAt(plan, 60)).toBe(130);
  });

  it("keeps 29.97 timestamps exact to the microsecond with no drift over a quarter of an hour", () => {
    const rate = fps(30000, 1001);
    const plan = exportPlan({ start: 0, end: 30000 }, rate, rate, 2, 48000);
    expect(plan.frames).toBe(30000);
    // 30000 frames of 1001/30000 s = 1001 s exactly.
    expect(frameTimestampUs(plan, plan.frames)).toBe(1_001_000_000);
    expect(plan.samples).toBe(1001 * 48000);
    let sum = 0;
    for (let k = 0; k < plan.frames; k++) {
      expect(frameTimestampUs(plan, k)).toBe(sum);
      sum += frameDurationUs(plan, k);
    }
    expect(sum).toBe(1_001_000_000);
    // A keyframe every 59 frames (1.97 s, at most 2 s).
    expect(plan.keyInterval).toBe(59);
  });

  it("forces a keyframe every keyInterval frames", () => {
    const plan = exportPlan({ start: 0, end: 300 }, fps(30), fps(30), 2, 48000);
    const keys = Array.from({ length: plan.frames }, (_, k) => k).filter((k) => isKeyFrame(plan, k));
    expect(keys).toEqual([0, 60, 120, 180, 240]);
  });

  it("an empty range exports nothing", () => {
    const plan = exportPlan({ start: 30, end: 30 }, fps(30), fps(30), 2, 48000);
    expect(plan.frames).toBe(0);
    expect(plan.samples).toBe(0);
  });
});

describe("audio of a plan", () => {
  it("feeds through the end of each frame and reaches the whole length on the last one", () => {
    const plan = exportPlan({ start: 0, end: 90 }, fps(30), fps(30), 2, 48000);
    expect(samplesThrough(plan, 0)).toBe(1600);
    expect(samplesThrough(plan, 29)).toBe(48000);
    expect(samplesThrough(plan, 89)).toBe(plan.samples);
    const odd = exportPlan({ start: 0, end: 7 }, fps(30000, 1001), fps(30000, 1001), 2, 48000);
    expect(samplesThrough(odd, 6)).toBe(odd.samples);
  });

  it("stamps samples in whole microseconds", () => {
    expect(sampleTimestampUs(0, 48000)).toBe(0);
    expect(sampleTimestampUs(4800, 48000)).toBe(100_000);
    expect(sampleTimestampUs(1, 48000)).toBe(21);
  });

  it("expects one video chunk per frame and the audio's packets with a margin", () => {
    const plan = exportPlan({ start: 0, end: 1800 }, fps(30), fps(30), 2, 48000);
    expect(audioChunkSamples("aac", 48000)).toBe(1024);
    expect(audioChunkSamples("opus", 48000)).toBe(960);
    expect(expectedChunks(plan, "aac")).toEqual({ video: 1800, audio: Math.ceil(2_880_000 / 1024) + 8 });
    expect(expectedChunks(plan, null)).toEqual({ video: 1800, audio: 0 });
  });
});

describe("videoTimescale", () => {
  it("gives every frame a whole number of ticks, at least 90 kHz", () => {
    for (const rate of [fps(24000, 1001), fps(24), fps(25), fps(30000, 1001), fps(30), fps(50), fps(60000, 1001), fps(60)]) {
      const timescale = videoTimescale(rate);
      expect(timescale).toBeGreaterThanOrEqual(90_000);
      expect((timescale * rate.den) % rate.num).toBe(0);
    }
    expect(videoTimescale(fps(30))).toBe(90_000);
    expect(videoTimescale(fps(30000, 1001))).toBe(90_000);
  });
});
