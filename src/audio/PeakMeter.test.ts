import { describe, expect, it } from "vitest";
import { CEILING_DB, FALL_DB_PER_SECOND, FLOOR_DB, HOLD_SECONDS, meterFraction, PeakMeter, toDb } from "./PeakMeter.js";

describe("PeakMeter", () => {
  it("rises at once and falls at the release rate", () => {
    const meter = new PeakMeter();
    meter.update([0.5, 0.25], 0);
    expect(meter.channels[0].level).toBeCloseTo(-6.02, 2);
    expect(meter.channels[1].level).toBeCloseTo(-12.04, 2);
    meter.update([0, 0], 0.5);
    expect(meter.channels[0].level).toBeCloseTo(-6.02 - FALL_DB_PER_SECOND * 0.5, 2);
  });

  it("holds the peak for 1.5 s, then lets it fall", () => {
    const meter = new PeakMeter();
    meter.update([1, 1], 0);
    meter.update([0.1, 0.1], 1);
    expect(meter.channels[0].hold).toBeCloseTo(0, 6);
    meter.update([0.1, 0.1], HOLD_SECONDS - 0.01);
    expect(meter.channels[0].hold).toBeCloseTo(0, 6);
    meter.update([0.1, 0.1], HOLD_SECONDS + 0.5);
    expect(meter.channels[0].hold).toBeLessThan(0);
    expect(meter.channels[0].hold).toBeGreaterThanOrEqual(meter.channels[0].level);
  });

  it("latches the clip indicator above full scale until reset", () => {
    const meter = new PeakMeter();
    meter.update([0.99, 1], 0);
    expect(meter.clipped).toBe(false);
    meter.update([0.5, 1.8], 0.1);
    expect(meter.channels[1].clipped).toBe(true);
    for (let t = 0.2; t < 5; t += 0.1) meter.update([0, 0], t);
    expect(meter.clipped).toBe(true);
    meter.resetClip();
    expect(meter.clipped).toBe(false);
  });

  it("reports when it has settled back to silence", () => {
    const meter = new PeakMeter();
    expect(meter.update([0, 0], 0)).toBe(false);
    expect(meter.update([0.5, 0.5], 0.1)).toBe(true);
    expect(meter.update([0, 0], 10)).toBe(false);
  });
});

describe("meter scale", () => {
  it("maps dBFS from the floor to the ceiling", () => {
    expect(toDb(0)).toBe(FLOOR_DB);
    expect(toDb(1e-9)).toBe(FLOOR_DB);
    expect(meterFraction(FLOOR_DB)).toBe(0);
    expect(meterFraction(CEILING_DB)).toBe(1);
    expect(meterFraction(0)).toBeCloseTo(60 / 66, 9);
  });
});
