import { describe, expect, it } from "vitest";
import { PauseGate } from "./pipeline.js";
import { ExportPauseSync } from "./pauseSync.js";

describe("ExportPauseSync", () => {
  it("records a pause made before the job is posted and posts the job in it", () => {
    const sent: boolean[] = [];
    const sync = new ExportPauseSync((paused) => sent.push(paused));
    expect(sync.toggle()).toBe(true);
    expect(sync.paused).toBe(true);
    // Nothing reaches the worker before the job (it would start it, and the job would reset the gate).
    expect(sent).toEqual([]);
    expect(sync.post()).toBe(true);
    expect(sent).toEqual([]);
  });

  it("sends the changes made after the post", () => {
    const sent: boolean[] = [];
    const sync = new ExportPauseSync((paused) => sent.push(paused));
    sync.toggle();
    sync.toggle();
    expect(sync.post()).toBe(false);
    expect(sync.toggle()).toBe(true);
    expect(sync.toggle()).toBe(false);
    expect(sent).toEqual([true, false]);
  });

  it("keeps the worker's gate in the toast's state whatever the order of pauses and the post", () => {
    // The worker: the job sets the gate to its state, then each message sets it, in the order sent.
    for (const before of [0, 1, 2, 3]) {
      for (const after of [0, 1, 2]) {
        const gate = new PauseGate();
        const sync = new ExportPauseSync((paused) => gate.set(paused));
        for (let i = 0; i < before; i++) sync.toggle();
        gate.set(sync.post());
        for (let i = 0; i < after; i++) sync.toggle();
        expect(gate.paused).toBe(sync.paused);
      }
    }
  });
});
