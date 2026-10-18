import { describe, expect, it } from "vitest";
import { frameSummary, LongTaskLog, percentiles, RateCounter, SampleRing } from "./perfMath.js";

describe("RateCounter", () => {
  it("counts the events of the last second", () => {
    const rate = new RateCounter();
    for (let t = 0; t < 1000; t += 100) rate.add(t);
    expect(rate.rate(999)).toBe(10);
    // At 1500 the events at 0..500 have left the window.
    expect(rate.rate(1500)).toBe(4);
    expect(rate.rate(5000)).toBe(0);
    expect(rate.count).toBe(10);
  });

  it("scales a shorter window to events per second", () => {
    const rate = new RateCounter(250);
    rate.add(10, 3);
    expect(rate.rate(100)).toBe(12);
  });

  it("stays the window's size over long runs", () => {
    const rate = new RateCounter(100);
    for (let t = 0; t < 100_000; t += 1) rate.add(t);
    expect(rate.rate(99_999)).toBe(1000);
    expect((rate as unknown as { times: number[] }).times.length).toBeLessThan(400);
  });
});

describe("percentiles", () => {
  it("uses the nearest rank", () => {
    const samples = Array.from({ length: 100 }, (_, i) => 100 - i);
    expect(percentiles(samples, [50, 95, 99, 100])).toEqual([50, 95, 99, 100]);
    expect(percentiles([7], [50, 99])).toEqual([7, 7]);
    expect(percentiles([], [50])).toEqual([null]);
    expect(percentiles([3, 1, 2], [0])).toEqual([1]);
  });
});

describe("SampleRing", () => {
  it("keeps the last samples", () => {
    const ring = new SampleRing(3);
    for (const value of [1, 2, 3, 4, 5]) ring.push(value);
    expect([...ring.samples].sort()).toEqual([3, 4, 5]);
    ring.clear();
    expect(ring.samples).toEqual([]);
  });
});

describe("LongTaskLog", () => {
  it("tracks count, max and the tasks since a time", () => {
    const log = new LongTaskLog(2);
    log.add({ start: 10, duration: 60 });
    log.add({ start: 20, duration: 120 });
    log.add({ start: 30, duration: 55 });
    expect(log.count).toBe(3);
    expect(log.max).toBe(120);
    expect(log.since(15)).toEqual([
      { start: 20, duration: 120 },
      { start: 30, duration: 55 },
    ]);
    expect(log.since(0, 100)).toEqual([{ start: 20, duration: 120 }]);
    expect(log.inWindow(40, 15)).toBe(1);
    log.clear();
    expect(log.count).toBe(0);
    expect(log.max).toBe(0);
  });
});

describe("frameSummary", () => {
  it("summarizes rAF intervals", () => {
    const intervals = [...Array.from({ length: 59 }, () => 1000 / 60), 50];
    const summary = frameSummary(intervals);
    expect(summary.frames).toBe(60);
    expect(summary.maxMs).toBe(50);
    expect(summary.missed).toBe(1);
    expect(summary.fps).toBeCloseTo(60 / (59 / 60 + 0.05), 5);
    expect(frameSummary([])).toEqual({ frames: 0, fps: 0, maxMs: 0, p95Ms: null, missed: 0 });
  });
});
