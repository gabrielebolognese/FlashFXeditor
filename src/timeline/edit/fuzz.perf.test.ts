// 10,000 random edit operations (Batch 47): every operation of the fuzz kit, the document kept at about
// 40-200 clips (growing operations favoured below, shrinking ones above), every step validated by the
// store and checked by `documentChecks`, then undone back to the original document and redone to the
// final one. Runs in node (no DOM: text layouts use the approximate measurer).
import { describe, expect, it } from "vitest";
import { FUZZ_AREAS, fuzzRun } from "./fuzzKit.js";

const STEPS = 10_000;

describe("edit fuzz, 10,000 operations", () => {
  it("validates every step, undoes to the original and redoes to the final document within 60 s", { timeout: 120_000 }, () => {
    const t0 = performance.now();
    const result = fuzzRun({ seed: 47, steps: STEPS, clipRange: { min: 40, max: 200 } });
    const ran = performance.now() - t0;
    const { store, original, final } = result;
    let undone = 0;
    while (store.undo()) undone++;
    expect(undone).toBe(result.changed);
    expect(store.getState()).toStrictEqual(original);
    let redone = 0;
    while (store.redo()) redone++;
    expect(redone).toBe(result.changed);
    expect(store.getState()).toStrictEqual(final);
    const ms = performance.now() - t0;

    const clips = Object.keys(final.clips).length;
    expect(clips).toBeGreaterThan(20);
    expect(clips).toBeLessThan(400);
    expect(new Set(result.areas.keys())).toEqual(new Set(FUZZ_AREAS));
    expect(result.changed).toBeGreaterThan(STEPS / 2);
    const areas = FUZZ_AREAS.map((area) => `${area} ${result.areas.get(area) ?? 0}`).join(", ");
    console.info(`[perf] edit fuzz: ${STEPS} ops (${result.changed} changed, ${clips} clips at the end) in ${Math.round(ran)} ms (${Math.round((STEPS / ran) * 1000)} ops/s), undo + redo all in ${Math.round(ms - ran)} ms, ${Math.round(ms)} ms in all; ${areas}`);
    expect(ms).toBeLessThan(60_000);
  });
});
