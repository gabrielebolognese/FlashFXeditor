import { describe, expect, it } from "vitest";
import { IDLE_FRAME_CHECK_MS, IdleFrameCheck, type OpenFrames } from "./idleFrames.js";

function setup(open: OpenFrames) {
  let activity = 0;
  let busy = false;
  const reports: string[] = [];
  let reads = 0;
  const check = new IdleFrameCheck({
    activity: () => activity,
    busy: () => busy,
    openFrames: async () => {
      reads += 1;
      return open;
    },
    report: (message) => reports.push(message),
  });
  const flush = async () => {
    for (let i = 0; i < 3; i++) await Promise.resolve();
  };
  return {
    check,
    reports,
    reads: () => reads,
    flush,
    act: () => (activity += 1),
    setBusy: (value: boolean) => (busy = value),
    setOpen: (value: OpenFrames) => Object.assign(open, value),
  };
}

describe("IdleFrameCheck (Batch 47 dev assertion)", () => {
  it("reports frames still open once the app has been idle long enough, once per idle stretch", async () => {
    const t = setup({ main: 0, worker: 2 });
    t.check.tick(0);
    t.check.tick(1000);
    t.check.tick(IDLE_FRAME_CHECK_MS);
    expect(t.reads()).toBe(0);
    t.check.tick(1000 + IDLE_FRAME_CHECK_MS);
    await t.flush();
    expect(t.reports).toEqual(["[dev] 2 VideoFrames still open after 3 s idle (main 0, decode worker 2): a frame is not closed (P13)"]);
    t.check.tick(10_000);
    await t.flush();
    expect(t.reads()).toBe(1);
    // New activity, then a new idle stretch: checked again.
    t.act();
    t.check.tick(11_000);
    t.check.tick(12_000);
    t.check.tick(12_000 + IDLE_FRAME_CHECK_MS);
    await t.flush();
    expect(t.reports).toHaveLength(2);
  });

  it("says nothing when every frame is closed, and never checks while busy", async () => {
    const t = setup({ main: 0, worker: null });
    t.setBusy(true);
    for (let at = 0; at <= 20_000; at += 1000) t.check.tick(at);
    expect(t.reads()).toBe(0);
    t.setBusy(false);
    for (let at = 21_000; at <= 26_000; at += 1000) t.check.tick(at);
    await t.flush();
    expect(t.reads()).toBe(1);
    expect(t.check.counts).toEqual({ checks: 1, leaks: 0 });
    expect(t.reports).toEqual([]);
  });

  it("drops a reading that activity overtook", async () => {
    const t = setup({ main: 1, worker: 0 });
    t.check.tick(0);
    t.check.tick(1000);
    t.check.tick(1000 + IDLE_FRAME_CHECK_MS);
    t.act();
    await t.flush();
    expect(t.reports).toEqual([]);
    expect(t.check.counts.checks).toBe(0);
  });
});
