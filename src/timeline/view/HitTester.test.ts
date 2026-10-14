import { describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeTrack, withClips } from "../../core/document/fixtures.js";
import { METRICS } from "./fixtures.js";
import { TimelineGeometry } from "./geometry.js";
import { HitTester } from "./HitTester.js";

function setup(playhead = 50) {
  let project = makeProject();
  project.media.m = makeMedia("m");
  project.tracks.push(makeTrack("v1"), makeTrack("a1", "audio"));
  project = withClips(project, [
    makeMediaClip(project, { id: "c1", trackId: "v1", start: 10, duration: 30, mediaId: "m" }),
    makeMediaClip(project, { id: "c2", trackId: "v1", start: 40, duration: 5, mediaId: "m" }),
    makeMediaClip(project, { id: "c3", trackId: "a1", start: 10, duration: 30, mediaId: "m", kind: "audio" }),
  ]);
  // 4 px/frame from x = 176; rows: v1 172..228, divider 228..232, a1 232..288; add rows at 148 and 288.
  const geometry = new TimelineGeometry({ width: 1000, height: 428, tracks: project.tracks, pxPerFrame: 4, scrollFrame: 0, scrollY: 0, metrics: METRICS });
  return new HitTester({ geometry: () => geometry, project: () => project, playhead: () => playhead, playheadHeadWidth: 11 });
}

const x = (frame: number) => 176 + frame * 4;

describe("HitTester", () => {
  it("finds clip bodies by frame on their row", () => {
    const hits = setup();
    expect(hits.hit(x(10), 180)).toMatchObject({ type: "clip", clipId: "c1", trackId: "v1" });
    expect(hits.hit(x(39) + 3.9, 227)).toMatchObject({ type: "clip", clipId: "c1" });
    expect(hits.hit(x(40), 200)).toMatchObject({ type: "clip", clipId: "c2" });
    expect(hits.hit(x(20), 260)).toMatchObject({ type: "clip", clipId: "c3", trackId: "a1" });
    expect(hits.hit(x(20), 200).frame).toBeCloseTo(20);
  });

  it("returns empty with the track for gaps and with no track outside rows", () => {
    const hits = setup();
    expect(hits.hit(x(5), 200)).toMatchObject({ type: "empty", trackId: "v1", clipId: null });
    expect(hits.hit(x(60), 260)).toMatchObject({ type: "empty", trackId: "a1" });
    expect(hits.hit(x(20), 230)).toMatchObject({ type: "empty", trackId: null }); // divider
    expect(hits.hit(x(20), 100)).toMatchObject({ type: "empty", trackId: null });
    expect(hits.hit(-1, 100).type).toBe("empty");
    expect(hits.hit(1000, 100).type).toBe("empty");
  });

  it("tells the ruler from the playhead head", () => {
    const hits = setup(50);
    expect(hits.hit(x(50), 20)).toMatchObject({ type: "playheadHead" });
    expect(hits.hit(x(50) + 7, 5).type).toBe("playheadHead");
    expect(hits.hit(x(50) + 8, 5).type).toBe("ruler");
    expect(hits.hit(x(10), 27)).toMatchObject({ type: "ruler" });
    expect(hits.hit(x(10), 27).frame).toBeCloseTo(10);
    // The corner above the headers is not the ruler.
    expect(hits.hit(50, 10).type).toBe("empty");
  });

  it("finds track headers and the + track rows in the header column", () => {
    const hits = setup();
    expect(hits.hit(20, 180)).toMatchObject({ type: "trackHeader", trackId: "v1", addTrack: null });
    expect(hits.hit(20, 250)).toMatchObject({ type: "trackHeader", trackId: "a1" });
    expect(hits.hit(20, 150)).toMatchObject({ type: "trackHeader", trackId: null, addTrack: "video" });
    expect(hits.hit(20, 300)).toMatchObject({ type: "trackHeader", trackId: null, addTrack: "audio" });
    expect(hits.hit(20, 400).type).toBe("empty");
    // The + rows are buttons in the header column only.
    expect(hits.hit(x(20), 150).type).toBe("empty");
  });
});
