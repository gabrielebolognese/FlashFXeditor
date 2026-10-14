// Timing tests run in their own Vitest project, after the unit tests and one file at a time, so CPU
// contention from parallel workers cannot fail them (Batch 03 follow-up).
import { describe, expect, it } from "vitest";
import type { Command } from "../commands/command.js";
import { makeMedia, makeMediaClip, makeProject, makeTrack, withClips } from "../document/fixtures.js";
import { DocumentStore } from "./DocumentStore.js";
import { createSessionStore } from "./sessionStore.js";

function store(): DocumentStore {
  let project = makeProject();
  project.media.m1 = makeMedia("m1");
  project.tracks.push(makeTrack("v1"), makeTrack("v2"), makeTrack("a1", "audio"));
  project = withClips(project, [
    makeMediaClip(project, { id: "c1", trackId: "v1", start: 0, duration: 30, mediaId: "m1" }),
    makeMediaClip(project, { id: "c2", trackId: "v1", start: 30, duration: 30, mediaId: "m1" }),
  ]);
  return new DocumentStore(project, { session: createSessionStore(), validate: true });
}

describe("DocumentStore performance", () => {
  it("dispatches 10,000 trivial commands in under 300 ms", () => {
    const command = (i: number): Command => ({
      id: "test.trivial",
      label: "Trivial",
      affects: ["settings"],
      run: (draft) => {
        draft.settings.width = 1000 + (i % 2);
      },
    });
    const run = (count: number) => {
      const target = store(); // dev validation on
      const start = performance.now();
      for (let i = 0; i < count; i++) target.dispatch(command(i));
      return performance.now() - start;
    };
    run(1_000); // JIT warm-up
    const times = [run(10_000), run(10_000), run(10_000)];
    console.info(`[perf] 10,000 dispatches: ${times.map((t) => t.toFixed(1)).join(" / ")} ms`);
    expect(Math.min(...times)).toBeLessThan(300);
  });
});
