import { describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { Clip, MediaClip, Project, Track } from "../../core/document/types.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { deleteClips, deletionSet, removedSpans, rippleDelete } from "./delete.js";

function clip(id: string, trackId: string, start: number, duration: number, extra: Partial<MediaClip> = {}): MediaClip {
  const base = makeMediaClip(makeProject(), { id, trackId, start, duration, mediaId: "m", kind: trackId.startsWith("a") ? "audio" : "video" });
  return { ...base, ...extra };
}

const TRACKS = () => [makeTrack("v1"), makeTrack("v2"), makeTrack("a1", "audio"), makeTrack("a2", "audio")];

function project(clips: Clip[], tracks: Track[] = TRACKS()): Project {
  const p = makeProject();
  p.media.m = makeMedia("m", "video", 100_000_000);
  p.tracks.push(...tracks.map((track) => ({ ...track, targeted: true })));
  return withClips(p, clips);
}

function store(p: Project): DocumentStore {
  return new DocumentStore(p, { session: createSessionStore(), validate: true });
}

const starts = (p: Project, ...ids: string[]) => ids.map((id) => p.clips[id]?.start);

describe("deleteClips (spec §6.11 Delete)", () => {
  const linked = () => project([clip("v", "v1", 0, 100, { linkGroup: "L" }), clip("a", "a1", 0, 100, { linkGroup: "L" }), clip("b", "v1", 100, 100)]);

  it("removes the clips and their linked partners, leaving gaps; one undo step", () => {
    const p = linked();
    const command = deleteClips(p, ["v"]);
    expect(command?.label).toBe("Delete clips");
    const doc = store(p);
    doc.dispatch(command!);
    expect(Object.keys(doc.getState().clips)).toEqual(["b"]);
    expect(starts(doc.getState(), "b")).toEqual([100]);
    doc.undo();
    expect(doc.getState()).toEqual(p);
  });

  it("removes one side with Linked selection off; never touches locked tracks", () => {
    expect(deletionSet(linked(), ["v"], { linked: false })).toEqual(["v"]);
    const tracks = [makeTrack("v1"), { ...makeTrack("a1", "audio"), locked: true }];
    const p = project([clip("v", "v1", 0, 100, { linkGroup: "L" }), clip("a", "a1", 0, 100, { linkGroup: "L" })], tracks);
    expect(deletionSet(p, ["v"])).toEqual(["v"]);
    expect(deleteClips(p, ["a"])).toBeNull();
    expect(deleteClips(p, [])).toBeNull();
  });
});

describe("removedSpans", () => {
  it("joins touching removed clips; a gap or a kept clip between them splits the span", () => {
    const p = project([clip("a", "v1", 0, 10), clip("b", "v1", 10, 10), clip("c", "v1", 25, 5), clip("d", "v1", 30, 10), clip("e", "v1", 40, 10)]);
    expect(removedSpans(p, new Set(["a", "b", "c", "e"]))).toEqual([
      { trackId: "v1", start: 0, end: 20 },
      { trackId: "v1", start: 25, end: 30 },
      { trackId: "v1", start: 40, end: 50 },
    ]);
  });
});

describe("rippleDelete (spec §6.11, §6.19)", () => {
  it("closes the span of a linked pair on its tracks and moves the other unlocked tracks with it", () => {
    const p = project([
      clip("v", "v1", 0, 100, { linkGroup: "L" }),
      clip("b", "v1", 100, 100),
      clip("a", "a1", 0, 100, { linkGroup: "L" }),
      clip("c", "a1", 100, 100),
      clip("t", "v2", 150, 30),
    ]);
    const result = rippleDelete(p, ["v"]);
    expect(result?.limit).toBeNull();
    const doc = store(p);
    doc.dispatch(result!.command!);
    expect(doc.history.getState().undoLabel).toBe("Ripple delete clips");
    expect(Object.keys(doc.getState().clips).sort()).toEqual(["b", "c", "t"]);
    expect(starts(doc.getState(), "b", "c", "t")).toEqual([0, 0, 50]);
    doc.undo();
    expect(doc.getState()).toEqual(p);
  });

  // Acceptance 2: two tracks with gaps of different sizes, a1 holding a bed across them.
  const twoTracks = (nextOnA1: number) =>
    project([
      clip("A", "v1", 0, 100),
      clip("B", "v1", 100, 100),
      clip("C", "v1", 200, 100),
      clip("D", "v2", 0, 100),
      clip("E", "v2", 100, 50),
      clip("F", "v2", 150, 100),
      clip("M", "a1", 0, 300),
      clip("N", "a1", nextOnA1, 50),
    ]);

  it("closes each gap by its own amount when nothing is in the way", () => {
    const p = twoTracks(500);
    const result = rippleDelete(p, ["B", "E"]);
    expect(result?.closed).toEqual([100, 50]);
    expect(result?.limit).toBeNull();
    const doc = store(p);
    doc.dispatch(result!.command!);
    expect(starts(doc.getState(), "C", "F", "M", "N")).toEqual([100, 100, 0, 400]);
  });

  it("limits each gap to the largest safe amount when a clip on another track would collide", () => {
    // N sits 70 frames after the bed: the bigger gap closes 70 of its 100, the smaller all its 50.
    const p = twoTracks(370);
    const result = rippleDelete(p, ["B", "E"]);
    expect(result?.closed).toEqual([70, 50]);
    expect(result?.limit).toEqual({ trackId: "a1", clipId: "N" });
    const doc = store(p);
    doc.dispatch(result!.command!);
    expect(starts(doc.getState(), "C", "F", "N")).toEqual([130, 100, 300]);
    expect(doc.getState().clips.B).toBeUndefined();
    // Only 20 frames free: both stop at 20.
    const tight = rippleDelete(twoTracks(320), ["B", "E"]);
    expect(tight?.closed).toEqual([20, 20]);
  });

  it("with a locked track: it neither moves nor limits (spec §6.19)", () => {
    const tracks = [makeTrack("v1"), { ...makeTrack("a1", "audio"), locked: true }];
    const p = project([clip("a", "v1", 0, 50), clip("b", "v1", 50, 50), clip("x", "a1", 0, 80), clip("y", "a1", 80, 50)], tracks);
    const result = rippleDelete(p, ["a"]);
    expect(result?.limit).toBeNull();
    const doc = store(p);
    doc.dispatch(result!.command!);
    expect(starts(doc.getState(), "b", "x", "y")).toEqual([0, 0, 80]);
  });

  it("removes one side only with Linked selection off: its partner then blocks the ripple", () => {
    const p = project([clip("v", "v1", 0, 100, { linkGroup: "L" }), clip("b", "v1", 100, 50), clip("a", "a1", 0, 100, { linkGroup: "L" }), clip("c", "a1", 100, 50)]);
    const result = rippleDelete(p, ["v"], { linked: false });
    expect(result?.closed).toEqual([0]);
    expect(result?.limit).toEqual({ trackId: "a1", clipId: "c" });
    const doc = store(p);
    doc.dispatch(result!.command!);
    // The clip goes; nothing moves.
    expect(Object.keys(doc.getState().clips).sort()).toEqual(["a", "b", "c"]);
    expect(starts(doc.getState(), "b", "c")).toEqual([100, 100]);
  });

  it("deletes nothing on locked tracks", () => {
    const p = project([clip("x", "a1", 0, 80)], [makeTrack("v1"), { ...makeTrack("a1", "audio"), locked: true }]);
    expect(rippleDelete(p, ["x"])).toBeNull();
  });
});
