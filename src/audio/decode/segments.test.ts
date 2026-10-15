import { describe, expect, it } from "vitest";
import { segmentAt, segmentLayout, segmentRange, segmentsIn, segmentStartSeconds } from "./segments.js";

describe("segmentLayout", () => {
  it("keeps media up to 10 minutes whole", () => {
    const layout = segmentLayout(48_000, 600 * 48_000);
    expect(layout.count).toBe(1);
    expect(segmentRange(layout, 0)).toEqual({ from: 0, to: 600 * 48_000 });
    expect(segmentAt(layout, 599)).toBe(0);
  });

  it("splits longer media into ~60 s segments aligned to 1024 frames", () => {
    const layout = segmentLayout(44_100, 20 * 60 * 44_100);
    expect(layout.segmentFrames % 1024).toBe(0);
    expect(layout.segmentFrames % 256).toBe(0);
    expect(Math.abs(layout.segmentFrames / 44_100 - 60)).toBeLessThan(0.02);
    expect(layout.count).toBe(Math.ceil(layout.frames / layout.segmentFrames));
    const last = segmentRange(layout, layout.count - 1);
    expect(last.to).toBe(layout.frames);
    expect(last.to - last.from).toBeLessThanOrEqual(layout.segmentFrames);
  });

  it("finds the segments of a time range, joining at exact boundaries", () => {
    const layout = segmentLayout(48_000, 11 * 60 * 48_000);
    const boundary = segmentStartSeconds(layout, 1);
    expect(segmentAt(layout, boundary)).toBe(1);
    expect(segmentAt(layout, boundary - 1 / 48_000)).toBe(0);
    expect(segmentsIn(layout, boundary - 1, boundary + 1)).toEqual([0, 1]);
    expect(segmentsIn(layout, boundary - 1, boundary)).toEqual([0]);
    expect(segmentsIn(layout, 5, 5)).toEqual([]);
    expect(segmentAt(layout, 1e9)).toBe(layout.count - 1);
  });

  it("gives empty audio one empty segment", () => {
    const layout = segmentLayout(48_000, 0);
    expect(layout.count).toBe(1);
    expect(segmentRange(layout, 0)).toEqual({ from: 0, to: 0 });
  });
});
