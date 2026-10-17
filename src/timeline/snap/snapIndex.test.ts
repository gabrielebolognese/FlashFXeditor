import { describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { Clip, Marker, Project } from "../../core/document/types.js";
import { buildSnapCandidates, resolveSnap, snapCandidatesOf, SNAP_KINDS, SnapIndex, snapLabel, type SnapCandidates } from "./snapIndex.js";

const marker = (id: string, frame: number, label = ""): Marker => ({ id, frame, color: "red", label });

/** V1: a [10, 30) and b [50, 80); V2 (locked): l [100, 120); A1: s [30, 40). */
function project(markers: Marker[] = []): Project {
  let p = makeProject();
  p.media.m = makeMedia("m");
  p.tracks.push(makeTrack("v1"), { ...makeTrack("v2"), locked: true }, makeTrack("a1", "audio"));
  p = withClips(p, [
    makeMediaClip(p, { id: "a", trackId: "v1", start: 10, duration: 20, mediaId: "m" }),
    makeMediaClip(p, { id: "b", trackId: "v1", start: 50, duration: 30, mediaId: "m" }),
    makeMediaClip(p, { id: "l", trackId: "v2", start: 100, duration: 20, mediaId: "m" }),
    makeMediaClip(p, { id: "s", trackId: "a1", start: 30, duration: 10, mediaId: "m", kind: "audio" }),
  ]);
  return { ...p, markers };
}

const list = (c: SnapCandidates) => Array.from({ length: c.length }, (_, i) => [c.frames[i], SNAP_KINDS[c.kinds[i] as number], c.refs[i]]);

describe("buildSnapCandidates", () => {
  it("lists clip edges on every track (locked included), markers, in/out and frame 0, sorted by frame then priority", () => {
    const c = buildSnapCandidates(project([marker("m1", 50, "Drop"), marker("m2", 5)]), 30, 200);
    expect(list(c)).toEqual([
      [0, "zero", null],
      [5, "marker", "m2"],
      [10, "clipStart", "a"],
      // Frame 30: a's end and s's start share a rank (clip edges), then the in point.
      [30, "clipStart", "s"],
      [30, "clipEnd", "a"],
      [30, "in", null],
      [40, "clipEnd", "s"],
      [50, "clipStart", "b"],
      [50, "marker", "m1"],
      [80, "clipEnd", "b"],
      [100, "clipStart", "l"],
      [120, "clipEnd", "l"],
      [200, "out", null],
    ]);
  });

  it("keeps frame 0 alone on an empty project", () => {
    expect(list(buildSnapCandidates(makeProject(), null, null))).toEqual([[0, "zero", null]]);
  });
});

describe("SnapIndex", () => {
  it("rebuilds lazily: only on the first query after the clips, markers or in/out changed", () => {
    const index = new SnapIndex();
    const p = project();
    const first = index.get(p, null, null);
    expect(index.get(p, null, null)).toBe(first);
    // A change elsewhere in the document (settings, tracks) keeps the index.
    expect(index.get({ ...p, name: "Renamed" }, null, null)).toBe(first);
    expect(index.rebuilds).toBe(1);
    const moved = { ...p, clips: { ...p.clips, a: { ...(p.clips.a as Clip), start: 12 } } };
    expect(index.get(moved, null, null).frames).toContain(12);
    expect(index.get(moved, 4, null).frames).toContain(4);
    expect(index.get({ ...moved, markers: [marker("m", 7)] }, 4, null).frames).toContain(7);
    expect(index.rebuilds).toBe(4);
  });
});

describe("resolveSnap", () => {
  const p = project([marker("m1", 60, "Beat")]);
  const c = buildSnapCandidates(p, 70, null);

  it("snaps within the threshold in screen space, at any zoom", () => {
    // One clip [200, 300): nothing else within 16 frames of its end.
    const base = makeProject();
    base.media.m = makeMedia("m");
    base.tracks.push(makeTrack("v1"));
    const lone = buildSnapCandidates(withClips(base, [makeMediaClip(base, { id: "e", trackId: "v1", start: 200, duration: 100, mediaId: "m" })]), null, null);
    // 8 px is 2 frames at 4 px/frame, 16 frames at 0.5 px/frame, 0.08 frames at 100 px/frame.
    for (const pxPerFrame of [4, 0.5, 100]) {
      const reach = 8 / pxPerFrame;
      // Just inside the threshold on either side, then just outside.
      expect(resolveSnap(lone, [300 - reach], { thresholdPx: 8, pxPerFrame })?.target).toEqual({ frame: 300, kind: "clipEnd", ref: "e" });
      expect(resolveSnap(lone, [300 + reach * 0.99], { thresholdPx: 8, pxPerFrame })?.target.frame).toBe(300);
      expect(resolveSnap(lone, [300 + reach * 1.01], { thresholdPx: 8, pxPerFrame })).toBeNull();
      expect(resolveSnap(lone, [300 - reach * 1.01], { thresholdPx: 8, pxPerFrame })).toBeNull();
    }
  });

  it("snaps a pointer exactly at the threshold whose frame comes out a hair past it", () => {
    // A clip [0, 60); at 3 px/frame a clip pressed at frame 230 (x 866) and dragged to x 454 puts its
    // start (200) 8 px after 60, as 62.666666666666686 frames: past 60 + 8/3 in floating point.
    const base = makeProject();
    base.media.m = makeMedia("m");
    base.tracks.push(makeTrack("v1"));
    const edge = 200 + ((454 - 176) / 3 - 230);
    expect(edge - 8 / 3).toBeGreaterThan(60);
    const cands = buildSnapCandidates(withClips(base, [makeMediaClip(base, { id: "x", trackId: "v1", start: 0, duration: 60, mediaId: "m" })]), null, null);
    expect(resolveSnap(cands, [edge], { thresholdPx: 8, pxPerFrame: 3 })?.target).toEqual({ frame: 60, kind: "clipEnd", ref: "x" });
  });

  it("returns the offset that puts the snapped edge on the target, and the screen distance", () => {
    expect(resolveSnap(c, [78.5], { thresholdPx: 8, pxPerFrame: 4 })).toEqual({ target: { frame: 80, kind: "clipEnd", ref: "b" }, edge: 0, offset: 1.5, distancePx: 6 });
  });

  it("takes the smallest distance first, whatever the priority", () => {
    // Frame 58.5: the marker at 60 (6 px) beats b's start at 50 (34 px, out of reach) and nothing else is near.
    expect(resolveSnap(c, [58.5], { thresholdPx: 8, pxPerFrame: 4 })?.target.kind).toBe("marker");
    // Playhead at 62 against the marker at 60: an edge at 61.6 is closer to the playhead, one at 60.4 to the marker.
    expect(resolveSnap(c, [61.6], { thresholdPx: 8, pxPerFrame: 4, playhead: 62 })?.target.kind).toBe("playhead");
    expect(resolveSnap(c, [60.4], { thresholdPx: 8, pxPerFrame: 4, playhead: 62 })?.target.kind).toBe("marker");
  });

  it("breaks distance ties by priority: playhead, clip edges, markers, in/out, frame 0", () => {
    const tie = buildSnapCandidates({ ...p, markers: [marker("m", 50)] }, 50, null);
    // At 50: b's start, the marker and the in point.
    expect(resolveSnap(tie, [51], { thresholdPx: 8, pxPerFrame: 4 })?.target.kind).toBe("clipStart");
    expect(resolveSnap(tie, [51], { thresholdPx: 8, pxPerFrame: 4, playhead: 50 })?.target.kind).toBe("playhead");
    // b excluded: the marker beats the in point.
    expect(resolveSnap(tie, [51], { thresholdPx: 8, pxPerFrame: 4, exclude: new Set(["b"]) })?.target.kind).toBe("marker");
    // Equal distances on both sides: 60 (marker) and 70 (in point) from 65 at 1 px/frame.
    expect(resolveSnap(c, [65], { thresholdPx: 8, pxPerFrame: 1 })?.target).toEqual({ frame: 60, kind: "marker", ref: "m1" });
    // Frame 0 loses to a clip edge at the same frame.
    const zero = buildSnapCandidates(withClips(p, [makeMediaClip(p, { id: "z", trackId: "v1", start: 0, duration: 5, mediaId: "m" })]), null, null);
    expect(resolveSnap(zero, [1], { thresholdPx: 8, pxPerFrame: 4 })?.target).toEqual({ frame: 0, kind: "clipStart", ref: "z" });
    // Same distance and rank on two edges: the leading edge wins.
    expect(resolveSnap(c, [8, 82], { thresholdPx: 8, pxPerFrame: 4 })).toMatchObject({ edge: 0, target: { frame: 10 } });
  });

  it("tests every edge and keeps the closest one", () => {
    // A block [44, 77): its trailing edge, 3 frames from b's end, beats the leading edge (4 from s's end).
    expect(resolveSnap(c, [44, 77], { thresholdPx: 30, pxPerFrame: 4 })).toMatchObject({ edge: 1, target: { frame: 80 }, offset: 3 });
    expect(resolveSnap(c, [49, 77], { thresholdPx: 30, pxPerFrame: 4 })).toMatchObject({ edge: 0, target: { frame: 50 }, offset: 1 });
  });

  it("skips the edges of the excluded (dragged) clips but keeps other candidates at the same frame", () => {
    // a [10, 30) dragged: its own start is no candidate, frame 0 is too far.
    expect(resolveSnap(c, [11], { thresholdPx: 8, pxPerFrame: 4, exclude: new Set(["a"]) })).toBeNull();
    // At 30: a's end is excluded, s's start (another track) still snaps.
    expect(resolveSnap(c, [31], { thresholdPx: 8, pxPerFrame: 4, exclude: new Set(["a"]) })?.target).toEqual({ frame: 30, kind: "clipStart", ref: "s" });
    // The locked track's clip is a candidate.
    expect(resolveSnap(c, [99], { thresholdPx: 8, pxPerFrame: 4 })?.target.ref).toBe("l");
    // A dragged marker is excluded by its id the same way.
    expect(resolveSnap(c, [61], { thresholdPx: 8, pxPerFrame: 4 })?.target.ref).toBe("m1");
    expect(resolveSnap(c, [61], { thresholdPx: 8, pxPerFrame: 4, exclude: new Set(["m1"]) })).toBeNull();
  });

  it("does not snap with no edge, a zero threshold away from a candidate, or a degenerate zoom", () => {
    expect(resolveSnap(c, [], { thresholdPx: 8, pxPerFrame: 4 })).toBeNull();
    expect(resolveSnap(c, [79.5], { thresholdPx: 0, pxPerFrame: 4 })).toBeNull();
    expect(resolveSnap(c, [80], { thresholdPx: 0, pxPerFrame: 4 })?.target.frame).toBe(80);
    expect(resolveSnap(c, [80], { thresholdPx: 8, pxPerFrame: 0 })).toBeNull();
  });
});

describe("snapLabel", () => {
  it("names the target", () => {
    const p = project([marker("m1", 60, "Beat"), marker("m2", 70)]);
    expect(snapLabel(p, { frame: 5, kind: "playhead", ref: null })).toBe("Playhead");
    expect(snapLabel(p, { frame: 50, kind: "clipStart", ref: "b" })).toBe("Start of b");
    expect(snapLabel(p, { frame: 80, kind: "clipEnd", ref: "b" })).toBe("End of b");
    expect(snapLabel(p, { frame: 80, kind: "clipEnd", ref: "gone" })).toBe("Clip end");
    expect(snapLabel(p, { frame: 60, kind: "marker", ref: "m1" })).toBe("Marker: Beat");
    expect(snapLabel(p, { frame: 70, kind: "marker", ref: "m2" })).toBe("Marker");
    expect(snapLabel(p, { frame: 3, kind: "in", ref: null })).toBe("In point");
    expect(snapLabel(p, { frame: 9, kind: "out", ref: null })).toBe("Out point");
    expect(snapLabel(p, { frame: 0, kind: "zero", ref: null })).toBe("Timeline start");
  });
});

describe("snapCandidatesOf (Batch 35: keyframe drags)", () => {
  it("sorts a short list by frame, then priority, and resolves against it", () => {
    const candidates = snapCandidatesOf([
      { frame: 40, kind: "keyframe", ref: null },
      { frame: 10, kind: "clipEnd", ref: "c" },
      { frame: 10, kind: "keyframe", ref: null },
      { frame: 0, kind: "clipStart", ref: "c" },
    ]);
    expect([...candidates.frames]).toEqual([0, 10, 10, 40]);
    expect([...candidates.kinds].map((kind) => SNAP_KINDS[kind])).toEqual(["clipStart", "clipEnd", "keyframe", "keyframe"]);
    const hit = resolveSnap(candidates, [38.5], { thresholdPx: 8, pxPerFrame: 4, playhead: 30 });
    expect(hit?.target).toEqual({ frame: 40, kind: "keyframe", ref: null });
    expect(snapLabel(makeProject(), { frame: 40, kind: "keyframe", ref: null })).toBe("Keyframe");
  });
});
