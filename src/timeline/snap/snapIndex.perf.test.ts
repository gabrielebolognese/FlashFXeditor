// Batch 12 acceptance: the snap index rebuild for 500 clips takes under 1 ms (spec §6.9: rebuilt when
// the document changes, so it must be cheap). Runs in the "perf" Vitest project, one file at a time.
import { describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { Clip, Marker, Project } from "../../core/document/types.js";
import { buildSnapCandidates, resolveSnap } from "./snapIndex.js";

/** 500 clips over 8 tracks (6 video, 2 audio) with gaps, and 20 markers. */
function project(clipCount: number, trackCount: number): Project {
  let p = makeProject();
  p.media.m = makeMedia("m");
  for (let t = 0; t < trackCount; t++) p.tracks.push(makeTrack(`t${t}`, t < trackCount - 2 ? "video" : "audio"));
  const cursors = new Array<number>(trackCount).fill(0);
  const clips: Clip[] = [];
  for (let i = 0; i < clipCount; i++) {
    const t = i % trackCount;
    const start = (cursors[t] as number) + (i % 3 === 0 ? 7 : 0);
    const duration = 15 + ((i * 37) % 135);
    cursors[t] = start + duration;
    clips.push(makeMediaClip(p, { id: crypto.randomUUID(), trackId: `t${t}`, start, duration, mediaId: "m", kind: t < trackCount - 2 ? "video" : "audio" }));
  }
  p = withClips(p, clips);
  const markers: Marker[] = Array.from({ length: 20 }, (_, i) => ({ id: `mk${i}`, frame: i * 211, color: "red", label: "" }));
  return { ...p, markers };
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] as number;

describe("snap index performance", () => {
  it("rebuilds the candidates of 500 clips on 8 tracks in under 1 ms", () => {
    const p = project(500, 8);
    const cold = performance.now();
    const first = buildSnapCandidates(p, 120, 4000);
    const coldMs = performance.now() - cold;
    expect(first.length).toBe(2 * 500 + 20 + 2 + 1);
    for (let i = 0; i < 200; i++) buildSnapCandidates(p, 120, 4000); // JIT warm-up
    const times: number[] = [];
    for (let i = 0; i < 200; i++) {
      const start = performance.now();
      buildSnapCandidates(p, 120, 4000);
      times.push(performance.now() - start);
    }
    // A query over the same index: one binary search per edge.
    const queryStart = performance.now();
    for (let i = 0; i < 10_000; i++) resolveSnap(first, [i % 5000, (i % 5000) + 90], { thresholdPx: 8, pxPerFrame: 0.5, playhead: 300 });
    const queryUs = ((performance.now() - queryStart) / 10_000) * 1000;
    console.info(`[perf] snap index, 500 clips: cold ${coldMs.toFixed(3)} ms, median ${median(times).toFixed(3)} ms, max ${Math.max(...times).toFixed(3)} ms; query ${queryUs.toFixed(2)} us`);
    expect(median(times)).toBeLessThan(1);
  });
});
