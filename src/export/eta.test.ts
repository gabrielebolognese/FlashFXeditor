import { describe, expect, it } from "vitest";
import { EtaEstimator, formatRemaining } from "./eta.js";

describe("EtaEstimator", () => {
  it("knows nothing before two samples apart in time", () => {
    const eta = new EtaEstimator();
    expect(eta.remainingMs(100)).toBeNull();
    eta.update(10, 1000);
    expect(eta.remainingMs(100)).toBeNull();
    eta.update(10, 1000);
    expect(eta.remainingMs(100)).toBeNull();
  });

  it("divides the frames left by the rate of the window", () => {
    const eta = new EtaEstimator(5000);
    eta.update(0, 0);
    eta.update(60, 1000);
    // 60 frames per second, 240 left.
    expect(eta.rate()).toBe(60);
    expect(eta.remainingMs(300)).toBe(4000);
  });

  it("follows a change of speed within the window (a moving average)", () => {
    const eta = new EtaEstimator(2000);
    for (let t = 0; t <= 4000; t += 500) eta.update(t / 10, t); // 100 fps
    for (let t = 4500; t <= 8000; t += 500) eta.update(400 + (t - 4000) / 50, t); // 20 fps
    expect(eta.rate()).toBeCloseTo(20, 6);
  });

  it("leaves paused time out", () => {
    const eta = new EtaEstimator(5000);
    eta.update(0, 0);
    eta.update(30, 1000);
    eta.pause(1000);
    eta.update(30, 5000); // ignored while paused
    eta.resume(61_000);
    eta.update(60, 62_000);
    expect(eta.rate()).toBe(30);
    expect(eta.remainingMs(90)).toBe(1000);
  });
});

describe("formatRemaining", () => {
  it("reads m:ss, h:mm:ss over an hour, rounded up to the second", () => {
    expect(formatRemaining(0)).toBe("0:00");
    expect(formatRemaining(1)).toBe("0:01");
    expect(formatRemaining(61_000)).toBe("1:01");
    expect(formatRemaining(3_725_000)).toBe("1:02:05");
  });
});
