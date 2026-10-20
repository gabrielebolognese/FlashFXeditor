// Batch 15 acceptance: Compact on 500 clips with 300 gaps completes in under 50 ms and is one undo
// step. Runs in the "perf" Vitest project (after the unit tests, one file at a time).
import { describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { Clip, Project } from "../../core/document/types.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { trackGaps } from "../model/queries.js";
import { compactGaps } from "./gaps.js";

/** 500 clips on 8 tracks (6 targeted, 2 untargeted that follow the ripple), 300 gaps on the targeted ones. */
function project(): Project {
  const p = makeProject();
  p.media.m = makeMedia("m", "video", 3_600_000_000);
  const ids = ["v1", "v2", "v3", "v4", "a1", "a2", "a3", "a4"];
  p.tracks.push(...ids.map((id) => ({ ...makeTrack(id, id.startsWith("a") ? "audio" : "video"), targeted: id !== "v4" && id !== "a4" })));
  const clips: Clip[] = [];
  let gaps = 0;
  ids.forEach((trackId, t) => {
    const targeted = trackId !== "v4" && trackId !== "a4";
    const count = targeted ? 70 : 40;
    let cursor = 0;
    for (let i = 0; i < count; i++) {
      // Every targeted track gets 50 gaps (one before 50 of its 70 clips); the untargeted ones are
      // spread out so the ripple has room.
      const gap = targeted ? (i % 7 < 5 ? 3 + ((i * 13 + t) % 17) : 0) : 1000;
      if (gap > 0 && targeted) gaps += 1;
      cursor += gap;
      const duration = 10 + ((i * 7 + t * 3) % 40);
      clips.push(makeMediaClip(p, { id: `${trackId}-${i}`, trackId, start: cursor, duration, mediaId: "m", kind: trackId.startsWith("a") ? "audio" : "video" }));
      cursor += duration;
    }
  });
  expect(clips.length).toBe(500);
  expect(gaps).toBe(300);
  return withClips(p, clips);
}

describe("compactGaps performance", () => {
  it("compacts 500 clips with 300 gaps in under 50 ms, as one undo step", () => {
    const run = () => {
      const base = project();
      const doc = new DocumentStore(base, { session: createSessionStore(), validate: false });
      const start = performance.now();
      const result = compactGaps(doc.getState());
      if (result.command) doc.dispatch(result.command);
      const ms = performance.now() - start;
      return { ms, doc, base };
    };
    run(); // JIT warm-up
    const runs = [run(), run(), run()];
    console.info(`[perf] compact 500 clips / 300 gaps: ${runs.map((r) => r.ms.toFixed(1)).join(" / ")} ms`);
    expect(Math.min(...runs.map((r) => r.ms))).toBeLessThan(50);
    const { doc, base } = runs[0] as (typeof runs)[number];
    const after = doc.getState();
    for (const track of after.tracks) if (track.targeted) expect(trackGaps(after, track.id)).toEqual([]);
    expect(doc.history.getState().undoLabel).toBe("Close all gaps");
    doc.undo();
    expect(doc.history.getState().canUndo).toBe(false);
    expect(doc.getState()).toEqual(base);
  });
});
