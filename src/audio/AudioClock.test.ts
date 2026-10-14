import { describe, expect, it, vi } from "vitest";
import { AudioClock, type AudioContextLike } from "./AudioClock.js";

class FakeContext implements AudioContextLike {
  state: AudioContextState | "interrupted" = "suspended";
  currentTime = 0;
  stamp: AudioTimestamp | null = null;
  resume = vi.fn(async () => {
    this.state = "running";
  });
  close = vi.fn(async () => {
    this.state = "closed";
  });
  getOutputTimestamp(): AudioTimestamp {
    return this.stamp ?? { contextTime: 0, performanceTime: 0 };
  }
}

function setup() {
  let perf = 1000;
  const ctx = new FakeContext();
  const createContext = vi.fn(() => ctx);
  const clock = new AudioClock({ createContext, performanceNow: () => perf });
  return { clock, ctx, createContext, advance: (ms: number) => (perf += ms), perf: () => perf };
}

describe("AudioClock", () => {
  it("creates and resumes the context on the first pointer or key press only", async () => {
    const { clock, ctx, createContext } = setup();
    const target = new EventTarget();
    const stop = clock.attach(target as unknown as Window);
    expect(createContext).not.toHaveBeenCalled();
    target.dispatchEvent(new Event("keydown"));
    await Promise.resolve();
    expect(createContext).toHaveBeenCalledTimes(1);
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    expect(clock.running).toBe(true);
    target.dispatchEvent(new Event("pointerdown"));
    expect(createContext).toHaveBeenCalledTimes(1);
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    stop();
  });

  it("follows the performance clock until the context runs", () => {
    const { clock, advance } = setup();
    const t0 = clock.now();
    advance(250);
    expect(clock.now() - t0).toBeCloseTo(0.25, 9);
  });

  it("carries the output timestamp forward with the performance clock between audio callbacks", async () => {
    const { clock, ctx, advance, perf } = setup();
    clock.start();
    await Promise.resolve();
    ctx.stamp = { contextTime: 10, performanceTime: perf() };
    const t0 = clock.now();
    advance(4);
    expect(clock.now() - t0).toBeCloseTo(0.004, 9);
    // The next callback: the stamp moves on by the same amount, the clock stays smooth.
    advance(6);
    ctx.stamp = { contextTime: 10.01, performanceTime: perf() };
    expect(clock.now() - t0).toBeCloseTo(0.01, 9);
  });

  it("never runs backwards and never jumps when the source changes", async () => {
    const { clock, ctx, advance, perf } = setup();
    const t0 = clock.now();
    advance(100);
    expect(clock.now() - t0).toBeCloseTo(0.1, 9);
    clock.start();
    await Promise.resolve();
    // Running but nothing output yet (a device that has not started): its time stays still, the
    // performance clock keeps going.
    ctx.currentTime = 50;
    advance(20);
    expect(clock.now() - t0).toBeCloseTo(0.12, 9);
    // The first output timestamp, far from the performance time: the switch keeps the reading.
    ctx.stamp = { contextTime: 49.99, performanceTime: perf() };
    expect(clock.now() - t0).toBeCloseTo(0.12, 9);
    advance(10);
    expect(clock.now() - t0).toBeCloseTo(0.13, 9);
    // A stamp slightly behind the carried-forward time (jitter) holds the clock instead of stepping back.
    ctx.stamp = { contextTime: 49.995, performanceTime: perf() };
    expect(clock.now() - t0).toBeCloseTo(0.13, 9);
    advance(10);
    expect(clock.now() - t0).toBeCloseTo(0.135, 9);
    // Output resumes after a stall of 2 s: carried forward, the clock went on; it re-bases instead of
    // freezing for 2 s until the audio time catches up.
    advance(2000);
    expect(clock.now() - t0).toBeCloseTo(2.135, 9);
    ctx.stamp = { contextTime: 50.02, performanceTime: perf() };
    expect(clock.now() - t0).toBeCloseTo(2.135, 9);
    advance(10);
    expect(clock.now() - t0).toBeCloseTo(2.145, 9);
    // Suspended by the system: the performance clock takes over from where it was.
    ctx.state = "suspended";
    advance(20);
    const suspended = clock.now();
    advance(20);
    expect(clock.now() - suspended).toBeCloseTo(0.02, 9);
  });

  it("uses the context time when the browser has no output timestamps", async () => {
    let perf = 0;
    const ctx = { state: "running" as const, currentTime: 3, resume: async () => {}, close: async () => {} };
    const clock = new AudioClock({ createContext: () => ctx, performanceNow: () => perf });
    clock.start();
    const t0 = clock.now();
    perf += 1000;
    expect(clock.now()).toBe(t0);
    ctx.currentTime = 3.25;
    expect(clock.now() - t0).toBeCloseTo(0.25, 9);
  });

  it("falls back to the performance clock when no AudioContext can be created", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    let perf = 0;
    const clock = new AudioClock({
      createContext: () => {
        throw new Error("no audio");
      },
      performanceNow: () => perf,
    });
    clock.start();
    const t0 = clock.now();
    perf += 500;
    expect(clock.now() - t0).toBeCloseTo(0.5, 9);
    expect(clock.running).toBe(false);
  });
});
