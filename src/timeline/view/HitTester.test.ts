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
  return new HitTester({ geometry: () => geometry, project: () => project, playhead: () => playhead, playheadHeadWidth: 11, trimZone: 8, junctionZone: 6 });
}

const x = (frame: number) => 176 + frame * 4;

describe("HitTester", () => {
  it("finds clip bodies by frame on their row", () => {
    const hits = setup();
    expect(hits.hit(x(12), 180)).toMatchObject({ type: "clip", clipId: "c1", trackId: "v1" });
    expect(hits.hit(x(37), 227)).toMatchObject({ type: "clip", clipId: "c1" });
    expect(hits.hit(x(42), 200)).toMatchObject({ type: "clip", clipId: "c2" });
    expect(hits.hit(x(20), 260)).toMatchObject({ type: "clip", clipId: "c3", trackId: "a1" });
    expect(hits.hit(x(20), 200).frame).toBeCloseTo(20);
  });

  it("finds the trim zones: 8 px inside each edge, split at a junction, a third of a narrow clip", () => {
    const hits = setup();
    // c1 [10, 40) spans x 216..336; c2 [40, 45) abuts it (336..356, 20 px: zones of 6.67 px).
    expect(hits.hit(x(10), 200)).toMatchObject({ type: "clipEdgeIn", clipId: "c1", trackId: "v1" });
    expect(hits.hit(x(10) + 7.9, 200).type).toBe("clipEdgeIn");
    expect(hits.hit(x(10) + 8, 200).type).toBe("clip");
    expect(hits.hit(x(40) - 8, 200)).toMatchObject({ type: "clipEdgeOut", clipId: "c1" });
    expect(hits.hit(x(40) - 8.1, 200).type).toBe("clip");
    expect(hits.hit(x(40) - 3.1, 200)).toMatchObject({ type: "clipEdgeOut", clipId: "c1" });
    expect(hits.hit(x(40) + 3, 200)).toMatchObject({ type: "clipEdgeIn", clipId: "c2" });
    expect(hits.hit(x(40) + 6.6, 200).type).toBe("clipEdgeIn");
    expect(hits.hit(x(42.5), 200)).toMatchObject({ type: "clip", clipId: "c2" });
    expect(hits.hit(x(45) - 6.6, 200)).toMatchObject({ type: "clipEdgeOut", clipId: "c2" });
    // Outside a clip there is no zone (the gap before c1).
    expect(hits.hit(x(10) - 1, 200).type).toBe("gap");
  });

  it("finds the junction: the 6 px band centered on a cut between abutting clips, the side under the pointer", () => {
    const hits = setup();
    const cut = { left: "c1", right: "c2", frame: 40 };
    expect(hits.hit(x(40) - 3, 200)).toMatchObject({ type: "junction", clipId: "c1", junction: cut });
    expect(hits.hit(x(40) - 0.1, 200)).toMatchObject({ type: "junction", clipId: "c1", junction: cut });
    expect(hits.hit(x(40), 200)).toMatchObject({ type: "junction", clipId: "c2", junction: cut });
    expect(hits.hit(x(40) + 2.9, 200)).toMatchObject({ type: "junction", clipId: "c2", junction: cut });
    expect(hits.hit(x(40) + 3, 200)).toMatchObject({ type: "clipEdgeIn", junction: null });
    // An edge with a gap or nothing beyond it has no junction.
    expect(hits.hit(x(10), 200)).toMatchObject({ type: "clipEdgeIn", junction: null });
    expect(hits.hit(x(45) - 1, 200)).toMatchObject({ type: "clipEdgeOut", junction: null });
    expect(hits.hit(x(40) - 1, 260)).toMatchObject({ type: "clipEdgeOut", clipId: "c3", junction: null });
  });

  it("gives clips on locked tracks no trim zones", () => {
    let project = makeProject();
    project.media.m = makeMedia("m");
    project.tracks.push({ ...makeTrack("v1"), locked: true });
    project = withClips(project, [makeMediaClip(project, { id: "c1", trackId: "v1", start: 10, duration: 30, mediaId: "m" })]);
    const geometry = new TimelineGeometry({ width: 1000, height: 428, tracks: project.tracks, pxPerFrame: 4, scrollFrame: 0, scrollY: 0, metrics: METRICS });
    const hits = new HitTester({ geometry: () => geometry, project: () => project, playhead: () => 0, playheadHeadWidth: 11, trimZone: 8, junctionZone: 6 });
    const row = geometry.rowOf("v1");
    expect(hits.hit(x(10), (row?.y ?? 0) + 10)).toMatchObject({ type: "clip", clipId: "c1" });
  });

  it("finds gaps: the empty span before a clip, from the previous clip or frame 0 (spec §6.7)", () => {
    let project = makeProject();
    project.media.m = makeMedia("m");
    project.tracks.push(makeTrack("v1"), { ...makeTrack("v2"), locked: true });
    project = withClips(project, [
      makeMediaClip(project, { id: "a", trackId: "v1", start: 10, duration: 20, mediaId: "m" }),
      makeMediaClip(project, { id: "b", trackId: "v1", start: 50, duration: 10, mediaId: "m" }),
      makeMediaClip(project, { id: "c", trackId: "v2", start: 50, duration: 10, mediaId: "m" }),
    ]);
    const geometry = new TimelineGeometry({ width: 1000, height: 428, tracks: project.tracks, pxPerFrame: 4, scrollFrame: 0, scrollY: 0, metrics: METRICS });
    const hits = new HitTester({ geometry: () => geometry, project: () => project, playhead: () => 0, playheadHeadWidth: 11, trimZone: 8, junctionZone: 6 });
    const v1 = (geometry.rowOf("v1")?.y ?? 0) + 20;
    const v2 = (geometry.rowOf("v2")?.y ?? 0) + 20;
    expect(hits.hit(x(5), v1)).toMatchObject({ type: "gap", trackId: "v1", clipId: null, gap: { trackId: "v1", start: 0, end: 10 } });
    expect(hits.hit(x(40), v1)).toMatchObject({ type: "gap", gap: { trackId: "v1", start: 30, end: 50 } });
    // After the last clip there is no gap, only empty track space; locked tracks have none.
    expect(hits.hit(x(70), v1)).toMatchObject({ type: "empty", trackId: "v1", gap: null });
    expect(hits.hit(x(40), v2)).toMatchObject({ type: "empty", trackId: "v2", gap: null });
  });

  it("returns empty with the track after the last clip and with no track outside rows", () => {
    const hits = setup();
    expect(hits.hit(x(5), 200)).toMatchObject({ type: "gap", trackId: "v1", clipId: null });
    expect(hits.hit(x(60), 200)).toMatchObject({ type: "empty", trackId: "v1", clipId: null });
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

  it("finds the header toggles of each track kind", () => {
    const hits = setup();
    // a1 232..288: first line 232..264, toggles 16 px centered on it (240..256), 4 px apart, right-aligned
    // 8 px in: target 72..88, lock 92..108, mute 112..128, solo 132..148, height 152..168.
    const audio = [80, 100, 120, 140, 160].map((at) => hits.hit(at, 248).toggle);
    expect(audio).toEqual(["target", "lock", "mute", "solo", "height"]);
    expect(hits.hit(160, 248)).toMatchObject({ type: "headerToggle", toggle: "height", trackId: "a1" });
    expect(hits.hit(150, 248)).toMatchObject({ type: "trackHeader", toggle: null, trackId: "a1" });
    expect(hits.hit(160, 270)).toMatchObject({ type: "trackHeader", toggle: null });
    // Video: hide where audio has solo (v1's first line 172..204, toggles 180..196).
    expect([80, 100, 120, 140, 160].map((at) => hits.hit(at, 188).toggle)).toEqual(["target", "lock", "mute", "hide", "height"]);
    expect(hits.hit(40, 188)).toMatchObject({ type: "trackHeader", toggle: null, trackId: "v1" });
  });
});
