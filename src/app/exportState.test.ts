import { afterEach, describe, expect, it } from "vitest";
import { IdleQueue } from "../core/scheduler/IdleQueue.js";
import { exportState, pausedWhileExporting } from "./exportState.js";

describe("pausedWhileExporting", () => {
  afterEach(() => exportState.set({ running: false, paused: false }));

  it("is paused while the idle queue is or while an export runs, and reports each change once", () => {
    const idle = new IdleQueue();
    const pauser = pausedWhileExporting(idle);
    const changes: boolean[] = [];
    const stop = pauser.onPauseChange((paused) => changes.push(paused));
    expect(pauser.isPaused).toBe(false);
    exportState.set({ running: true, paused: false });
    expect(pauser.isPaused).toBe(true);
    // Already paused by the export: the idle queue's pause changes nothing.
    idle.pause("drag");
    exportState.set({ running: false, paused: false });
    expect(pauser.isPaused).toBe(true);
    idle.resume("drag");
    expect(pauser.isPaused).toBe(false);
    expect(changes).toEqual([true, false]);
    stop();
    exportState.set({ running: true, paused: false });
    expect(changes).toEqual([true, false]);
  });
});
