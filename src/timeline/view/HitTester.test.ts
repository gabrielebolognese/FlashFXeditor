import { describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeTrack, withClips } from "../../core/document/fixtures.js";
import { METRICS } from "./fixtures.js";
import { TimelineGeometry } from "./geometry.js";
import { HitTester } from "./HitTester.js";
import { layoutScrollbars } from "./scrollbars.js";

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

  it("finds keyframe diamonds on a shown lane before the trim zones; elsewhere in the band a clip hit with its lane (Batch 35)", () => {
    let project = makeProject();
    project.media.m = makeMedia("m");
    project.tracks.push(makeTrack("v1"), makeTrack("v2"));
    const keyframes = { "transform.x": [{ frame: 0, value: 0, ease: "linear" as const }, { frame: 15, value: 1, ease: "linear" as const }] };
    project = withClips(project, [
      { ...makeMediaClip(project, { id: "c1", trackId: "v1", start: 10, duration: 30, mediaId: "m" }), keyframes },
      { ...makeMediaClip(project, { id: "c2", trackId: "v2", start: 10, duration: 30, mediaId: "m" }), keyframes },
    ]);
    const geometry = new TimelineGeometry({ width: 1000, height: 428, tracks: project.tracks, pxPerFrame: 4, scrollFrame: 0, scrollY: 0, metrics: METRICS });
    let show = true;
    const scene = () => ({ show, section: () => "transform" as const, selected: null });
    const band = (row: { y: number; height: number }) => ({ y: row.y + row.height - 14, height: 12 });
    const hits = new HitTester({
      geometry: () => geometry,
      project: () => project,
      playhead: () => 0,
      playheadHeadWidth: 11,
      trimZone: 8,
      junctionZone: 6,
      keyframes: { scene, selected: (id) => id === "c1", band, size: 8, inset: 7 },
    });
    const row = geometry.rowOf("v1");
    if (!row) throw new Error("no row");
    const laneY = row.y + row.height - 8;
    // The key at the clip's first frame is drawn 7 px inside its in edge: the diamond wins over the trim zone.
    expect(hits.hit(x(10) + 7, laneY)).toMatchObject({ type: "keyframe", clipId: "c1", keyframe: { section: "transform", frame: 0 } });
    expect(hits.hit(x(10) + 2, laneY)).toMatchObject({ type: "keyframe", keyframe: { frame: 0 } });
    expect(hits.hit(x(25) - 5, laneY)).toMatchObject({ type: "keyframe", keyframe: { frame: 15 } });
    expect(hits.hit(x(20), laneY)).toMatchObject({ type: "clip", clipId: "c1", lane: "transform", keyframe: null });
    // Above the band: the body (and the edge zones) as before.
    expect(hits.hit(x(10) + 2, row.y + 20)).toMatchObject({ type: "clipEdgeIn", lane: null });
    // An unselected clip on an M track has no lane; nor any clip with the toggle off.
    const other = geometry.rowOf("v2");
    expect(hits.hit(x(25), (other?.y ?? 0) + (other?.height ?? 0) - 8)).toMatchObject({ type: "clip", clipId: "c2", lane: null });
    show = false;
    expect(hits.hit(x(25), laneY)).toMatchObject({ type: "clip", lane: null });
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

  it("finds the scrollbars before anything else, and nothing in the corners beside them", () => {
    let project = makeProject();
    project.media.m = makeMedia("m");
    project.tracks.push(makeTrack("v1"), makeTrack("a1", "audio"));
    project = withClips(project, [makeMediaClip(project, { id: "c1", trackId: "v1", start: 0, duration: 3000, mediaId: "m" })]);
    // 12 px scrollbars: track area 176..988 x 28..416, the horizontal bar under it, the vertical bar right of it.
    const geometry = new TimelineGeometry({ width: 1000, height: 428, tracks: project.tracks, pxPerFrame: 1, scrollFrame: 100, scrollY: 0, metrics: { ...METRICS, scrollbarSize: 12 } });
    expect(geometry.area).toEqual({ x: 176, y: 28, width: 812, height: 388 });
    expect(geometry.hScrollbar).toEqual({ x: 176, y: 416, width: 812, height: 12 });
    expect(geometry.vScrollbar).toEqual({ x: 988, y: 28, width: 12, height: 388 });
    const context = { width: geometry.area.width, contentEnd: 3000, fps: project.settings.fps };
    const layout = layoutScrollbars({ pxPerFrame: 1, scrollFrame: 100 }, context, { h: geometry.hScrollbar, v: geometry.vScrollbar, scrollY: 0, scrollYRange: { min: -400, max: 400 }, viewHeight: 388 }, 36);
    const hits = new HitTester({ geometry: () => geometry, project: () => project, playhead: () => 0, playheadHeadWidth: 11, trimZone: 8, junctionZone: 6, scrollbars: () => layout });
    const { thumb } = layout.h;
    expect(hits.hit(thumb.x + 1, 420)).toMatchObject({ type: "scrollbar", scrollbar: { axis: "x", part: "start" } });
    expect(hits.hit(thumb.x + thumb.width - 1, 420)).toMatchObject({ type: "scrollbar", scrollbar: { axis: "x", part: "end" } });
    expect(hits.hit(thumb.x + thumb.width / 2, 420)).toMatchObject({ type: "scrollbar", scrollbar: { axis: "x", part: "thumb" } });
    expect(hits.hit(994, 30)).toMatchObject({ type: "scrollbar", scrollbar: { axis: "y" } });
    // The clip row reaches under the vertical bar; the header column's foot and the ruler's end are empty.
    expect(hits.hit(990, 200).type).toBe("scrollbar");
    expect(hits.hit(985, 200)).toMatchObject({ type: "clip", clipId: "c1" });
    expect(hits.hit(100, 420)).toMatchObject({ type: "empty", trackId: null });
    expect(hits.hit(994, 10)).toMatchObject({ type: "empty" });
  });
});

describe("HitTester markers and in/out handles", () => {
  function ruler(inOut = { inPoint: 20 as number | null, outPoint: 60 as number | null }, playhead = 20) {
    const project = makeProject();
    project.tracks.push(makeTrack("v1"));
    project.markers = [
      { id: "m1", frame: 30, color: "green", label: "" },
      { id: "m2", frame: 31, color: "red", label: "" },
      { id: "m3", frame: 80, color: "blue", label: "" },
    ];
    const geometry = new TimelineGeometry({ width: 1000, height: 428, tracks: project.tracks, pxPerFrame: 4, scrollFrame: 0, scrollY: 0, metrics: METRICS });
    return new HitTester({
      geometry: () => geometry,
      project: () => project,
      playhead: () => playhead,
      playheadHeadWidth: 11,
      trimZone: 8,
      junctionZone: 6,
      marker: { width: 9, height: 8 },
      inOut: () => inOut,
      handleZone: 8,
    });
  }

  it("finds markers in the band at the ruler's bottom, the nearest one", () => {
    const hits = ruler();
    // The band: y >= 28 - 8 - 2 = 18; reach 4.5 + 2 px each side.
    expect(hits.hit(x(80), 24)).toMatchObject({ type: "marker", markerId: "m3" });
    expect(hits.hit(x(80) + 6.5, 20)).toMatchObject({ type: "marker", markerId: "m3" });
    expect(hits.hit(x(80) + 6.6, 20).type).toBe("ruler");
    expect(hits.hit(x(80), 17).type).toBe("ruler");
    // Two markers 4 px apart: the nearer wins.
    expect(hits.hit(x(30) + 1, 24).markerId).toBe("m1");
    expect(hits.hit(x(31) - 1, 24).markerId).toBe("m2");
  });

  it("finds the in/out handles above the marker band, before the playhead head", () => {
    const hits = ruler();
    // The playhead stands on the in point: the upper part grabs the handle, the band below the head.
    expect(hits.hit(x(20), 4).type).toBe("inHandle");
    expect(hits.hit(x(20) + 3.9, 10).type).toBe("inHandle");
    expect(hits.hit(x(20), 22).type).toBe("playheadHead");
    expect(hits.hit(x(60) - 4, 4).type).toBe("outHandle");
    expect(hits.hit(x(60) + 4.1, 4).type).toBe("ruler");
    expect(hits.hit(x(40), 4).type).toBe("ruler");
    // No points set: no handles.
    expect(ruler({ inPoint: null, outPoint: null }, 0).hit(x(20), 4).type).toBe("ruler");
  });

  it("splits a one-frame range at low zoom between its handles by side", () => {
    const hits = ruler({ inPoint: 20, outPoint: 21 }, 0);
    expect(hits.hit(x(20) - 1, 4).type).toBe("inHandle");
    expect(hits.hit(x(21) + 1, 4).type).toBe("outHandle");
  });
});
