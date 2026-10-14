import { describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { Project } from "../../core/document/types.js";
import {
  clipAtFrame,
  clipsAtFrame,
  clipsInRange,
  contentEnd,
  editPoints,
  gapAt,
  markerFrames,
  navigationPoints,
  neighbors,
  nextEditPoint,
  prevEditPoint,
  trackEnd,
  trackGaps,
  trackIndex,
} from "./queries.js";

// v1: [10..20) [20..30) [50..150)   v2: [0..5)   a1: empty
function fixture(): Project {
  const project = makeProject();
  project.media.m1 = makeMedia("m1");
  project.tracks.push(makeTrack("v1"), makeTrack("v2"), makeTrack("a1", "audio"));
  const clip = (id: string, trackId: string, start: number, duration: number) =>
    makeMediaClip(project, { id, trackId, start, duration, mediaId: "m1" });
  return withClips(project, [clip("a", "v1", 10, 10), clip("b", "v1", 20, 10), clip("c", "v1", 50, 100), clip("d", "v2", 0, 5)]);
}

const ids = (clips: { id: string }[]) => clips.map((clip) => clip.id);

describe("timeline model queries", () => {
  const project = fixture();

  it("finds the clip at a frame per track (start inclusive, end exclusive)", () => {
    expect(clipAtFrame(project, "v1", 9)).toBeNull();
    expect(clipAtFrame(project, "v1", 10)?.id).toBe("a");
    expect(clipAtFrame(project, "v1", 19)?.id).toBe("a");
    expect(clipAtFrame(project, "v1", 20)?.id).toBe("b");
    expect(clipAtFrame(project, "v1", 30)).toBeNull();
    expect(clipAtFrame(project, "v1", 149)?.id).toBe("c");
    expect(clipAtFrame(project, "v1", 150)).toBeNull();
    expect(clipAtFrame(project, "a1", 0)).toBeNull();
    expect(clipAtFrame(project, "nope", 0)).toBeNull();
  });

  it("lists clips at a frame across tracks in track order", () => {
    expect(ids(clipsAtFrame(project, 2))).toEqual(["d"]);
    expect(ids(clipsAtFrame(project, 12))).toEqual(["a"]);
    expect(ids(clipsAtFrame(project, 7))).toEqual([]);
  });

  it("lists clips intersecting a range, including long clips starting before it", () => {
    expect(ids(clipsInRange(project, "v1", 0, 10))).toEqual([]);
    expect(ids(clipsInRange(project, "v1", 0, 11))).toEqual(["a"]);
    expect(ids(clipsInRange(project, "v1", 19, 21))).toEqual(["a", "b"]);
    expect(ids(clipsInRange(project, "v1", 100, 120))).toEqual(["c"]);
    expect(ids(clipsInRange(project, "v1", 30, 50))).toEqual([]);
    expect(ids(clipsInRange(project, "v1", 0, 1000))).toEqual(["a", "b", "c"]);
    expect(clipsInRange(project, "v1", 20, 20)).toEqual([]);
  });

  it("finds neighbors on the same track", () => {
    expect(neighbors(project, "a")).toEqual({ prev: null, next: project.clips.b });
    expect(neighbors(project, "b")).toEqual({ prev: project.clips.a, next: project.clips.c });
    expect(neighbors(project, "c")).toEqual({ prev: project.clips.b, next: null });
    expect(neighbors(project, "d")).toEqual({ prev: null, next: null });
    expect(neighbors(project, "nope")).toEqual({ prev: null, next: null });
  });

  it("lists gaps from frame 0 to the last clip", () => {
    expect(trackGaps(project, "v1")).toEqual([
      { trackId: "v1", start: 0, end: 10 },
      { trackId: "v1", start: 30, end: 50 },
    ]);
    expect(trackGaps(project, "v2")).toEqual([]);
    expect(trackGaps(project, "a1")).toEqual([]);
  });

  it("finds the gap at a frame", () => {
    expect(gapAt(project, "v1", 0)).toEqual({ trackId: "v1", start: 0, end: 10 });
    expect(gapAt(project, "v1", 35)).toEqual({ trackId: "v1", start: 30, end: 50 });
    expect(gapAt(project, "v1", 49)).toEqual({ trackId: "v1", start: 30, end: 50 });
    expect(gapAt(project, "v1", 15)).toBeNull();
    expect(gapAt(project, "v1", 200)).toBeNull();
  });

  it("computes track and content ends", () => {
    expect(trackEnd(project, "v1")).toBe(150);
    expect(trackEnd(project, "v2")).toBe(5);
    expect(trackEnd(project, "a1")).toBe(0);
    expect(contentEnd(project)).toBe(150);
    expect(contentEnd(makeProject())).toBe(0);
  });

  it("lists sorted unique edit points and steps through them", () => {
    const points = editPoints(project);
    expect(points).toEqual([0, 5, 10, 20, 30, 50, 150]);
    expect(editPoints(project, ["v2"])).toEqual([0, 5]);
    expect(nextEditPoint(points, 0)).toBe(5);
    expect(nextEditPoint(points, 20)).toBe(30);
    expect(nextEditPoint(points, 21)).toBe(30);
    expect(nextEditPoint(points, 150)).toBeNull();
    expect(prevEditPoint(points, 20)).toBe(10);
    expect(prevEditPoint(points, 21)).toBe(20);
    expect(prevEditPoint(points, 0)).toBeNull();
  });

  it("adds markers and in/out to the Up/Down stops and skips locked tracks", () => {
    const withMarkers = structuredClone(project);
    withMarkers.markers.push({ id: "m2", frame: 70, color: "red", label: "" }, { id: "m1", frame: 40, color: "red", label: "" }, { id: "m3", frame: 40, color: "red", label: "" });
    expect(markerFrames(withMarkers)).toEqual([40, 70]);
    expect(navigationPoints(withMarkers, [12, null])).toEqual([0, 5, 10, 12, 20, 30, 40, 50, 70, 150]);
    withMarkers.tracks[0]!.locked = true;
    expect(navigationPoints(withMarkers)).toEqual([0, 5, 40, 70]);
  });

  it("maintains the per-track index (max duration, end) per document version", () => {
    const track = project.tracks[0]!;
    const index = trackIndex(project, track);
    expect(index.maxDuration).toBe(100);
    expect(index.end).toBe(150);
    expect(trackIndex(project, track)).toBe(index);

    const shorter = structuredClone(project);
    shorter.clips.c!.duration = 40;
    const updated = trackIndex(shorter, shorter.tracks[0]!);
    expect(updated).not.toBe(index);
    expect(updated.maxDuration).toBe(40);
    expect(updated.end).toBe(90);
  });
});
