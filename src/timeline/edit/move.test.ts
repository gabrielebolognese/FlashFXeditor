import { describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeSolidClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import { framesToSourceUs, frameToUs } from "../../core/document/time.js";
import type { Clip, MediaClip, Project, Track } from "../../core/document/types.js";
import { validateProject } from "../../core/document/validate.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { selectClips, toSnapshot } from "../../core/store/selection.js";
import { createSessionStore, setSelection } from "../../core/store/sessionStore.js";
import { trackIndex } from "../model/queries.js";
import {
  applyMoveRequest,
  clampLaneDelta,
  laneTarget,
  mapLanes,
  moveClips,
  moveToAdjacentLane,
  nudgeClips,
  overwrittenSpans,
  sliceClip,
  type MoveRequest,
  type MoveResult,
} from "./move.js";

const base = makeProject();
const fps = base.settings.fps;

function clip(id: string, trackId: string, start: number, duration: number, extra: Partial<MediaClip> = {}): MediaClip {
  return { ...makeMediaClip(base, { id, trackId, start, duration, mediaId: "m", kind: trackId.startsWith("a") ? "audio" : "video" }), ...extra };
}

function project(clips: Clip[], tracks: Track[] = [makeTrack("v1"), makeTrack("v2"), makeTrack("a1", "audio"), makeTrack("a2", "audio")]): Project {
  const p = makeProject();
  p.media.m = makeMedia("m");
  p.tracks.push(...tracks);
  return withClips(p, clips);
}

function counter(prefix = "n"): () => string {
  let n = 0;
  return () => `${prefix}${++n}`;
}

function setup(p: Project) {
  const session = createSessionStore();
  const doc = new DocumentStore(p, { session, validate: true, newId: counter("x") });
  return { session, doc };
}

/** Dispatches an ok result (with its selection), as the controller does. */
function apply(doc: DocumentStore, result: MoveResult): void {
  if (result.kind !== "ok") throw new Error(`expected ok, got ${result.kind}`);
  doc.dispatch(result.command, { selection: toSnapshot(selectClips(result.placed.values())) });
}

/** Clips of a track as [id, start, duration]. */
function layout(p: Project, trackId: string): [string, number, number][] {
  const track = p.tracks.find((t) => t.id === trackId);
  return (track?.clipIds ?? []).map((id) => {
    const c = p.clips[id] as Clip;
    return [id, c.start, c.duration];
  });
}

const noLanes = new Map<string, string>();

describe("moveClips: overwrite", () => {
  it("splits a longer clip in two around the dropped clip; undo restores the single clip and the selection", () => {
    const { doc, session } = setup(project([clip("long", "v1", 0, 100), clip("short", "v2", 0, 20)]));
    setSelection(session, selectClips(["short"]));
    apply(doc, moveClips(doc.getState(), ["short"], 40, new Map([["v2", "v1"]]), "overwrite", { newId: counter() }));
    const after = doc.getState();
    expect(layout(after, "v1")).toEqual([
      ["long", 0, 40],
      ["short", 40, 20],
      ["n1", 60, 40],
    ]);
    expect(layout(after, "v2")).toEqual([]);
    const left = after.clips.long as MediaClip;
    const right = after.clips.n1 as MediaClip;
    expect(left.in).toBe(0);
    expect(left.out).toBe(frameToUs(40, fps));
    expect(right.in).toBe(frameToUs(60, fps));
    expect(right.out).toBe(frameToUs(100, fps));
    expect(validateProject(after)).toEqual([]);
    expect([...session.selection.getState().clipIds]).toEqual(["short"]);

    expect(doc.undo()).toBe(true);
    expect(layout(doc.getState(), "v1")).toEqual([["long", 0, 100]]);
    expect(layout(doc.getState(), "v2")).toEqual([["short", 0, 20]]);
    expect([...session.selection.getState().clipIds]).toEqual(["short"]);
    expect(doc.history.getState().canUndo).toBe(false);
  });

  it("trims partly covered clips on both sides and removes fully covered ones", () => {
    const p = project([clip("a", "v1", 0, 30), clip("b", "v1", 30, 10), clip("c", "v1", 40, 30), clip("m", "v2", 0, 30)]);
    const result = moveClips(p, ["m"], 20, new Map([["v2", "v1"]]), "overwrite", { newId: counter() });
    const { doc } = setup(p);
    apply(doc, result);
    const after = doc.getState();
    expect(layout(after, "v1")).toEqual([
      ["a", 0, 20],
      ["m", 20, 30],
      ["c", 50, 20],
    ]);
    expect(after.clips.b).toBeUndefined();
    expect((after.clips.c as MediaClip).in).toBe(frameToUs(10, fps));
  });

  it("splits one clip into three when two dropped clips cover two parts of it", () => {
    const p = project([clip("long", "v1", 0, 100), clip("p", "v2", 10, 10), clip("q", "v2", 50, 10)]);
    const { doc } = setup(p);
    apply(doc, moveClips(p, ["p", "q"], 0, new Map([["v2", "v1"]]), "overwrite", { newId: counter() }));
    expect(layout(doc.getState(), "v1")).toEqual([
      ["long", 0, 10],
      ["p", 10, 10],
      ["n1", 20, 30],
      ["q", 50, 10],
      ["n2", 60, 40],
    ]);
  });

  it("is a no-op for a move onto itself, and clamps the delta at frame 0", () => {
    const p = project([clip("a", "v1", 10, 10)]);
    expect(moveClips(p, ["a"], 0, noLanes, "overwrite", { newId: counter() })).toEqual({ kind: "noop" });
    expect(moveClips(p, ["a"], 0, noLanes, "insert", { newId: counter() })).toEqual({ kind: "noop" });
    expect(moveClips(p, ["gone"], 5, noLanes, "overwrite", { newId: counter() })).toEqual({ kind: "noop" });
    const { doc } = setup(p);
    apply(doc, moveClips(p, ["a"], -50, noLanes, "overwrite", { newId: counter() }));
    expect(layout(doc.getState(), "v1")).toEqual([["a", 0, 10]]);
    expect(moveClips(doc.getState(), ["a"], -5, noLanes, "overwrite", { newId: counter() })).toEqual({ kind: "noop" });
  });

  it("keeps the relative layout of moved clips, which never overwrite each other", () => {
    const p = project([clip("a", "v1", 0, 10), clip("b", "v1", 10, 10), clip("c", "v1", 20, 10)]);
    const { doc } = setup(p);
    apply(doc, moveClips(p, ["a", "b"], 5, noLanes, "overwrite", { newId: counter() }));
    expect(layout(doc.getState(), "v1")).toEqual([
      ["a", 5, 10],
      ["b", 15, 10],
      ["c", 25, 5],
    ]);
  });

  it("partitions keyframes between the halves of a split, re-based to each half", () => {
    const keyed = clip("long", "v1", 0, 100, {
      keyframes: {
        opacity: [
          { frame: 0, value: 0, ease: "linear" },
          { frame: 45, value: 0.5, ease: "linear" },
          { frame: 70, value: 1, ease: "linear" },
          { frame: 99, value: 0.2, ease: "linear" },
        ],
        scale: [{ frame: 5, value: 2, ease: "linear" }],
      },
    });
    const p = project([keyed, clip("short", "v2", 0, 20)]);
    const { doc } = setup(p);
    apply(doc, moveClips(p, ["short"], 40, new Map([["v2", "v1"]]), "overwrite", { newId: counter() }));
    const left = doc.getState().clips.long as MediaClip;
    const right = doc.getState().clips.n1 as MediaClip;
    expect(left.keyframes).toEqual({ opacity: [{ frame: 0, value: 0, ease: "linear" }], scale: [{ frame: 5, value: 2, ease: "linear" }] });
    // [60, 100) of the original: 70 -> 10, 99 -> 39; the keyframe at 45 was overwritten.
    expect(right.keyframes).toEqual({
      opacity: [
        { frame: 10, value: 1, ease: "linear" },
        { frame: 39, value: 0.2, ease: "linear" },
      ],
    });
  });

  it("links the pieces of a linked pair split at the same frames, and unlinks a lone piece", () => {
    const p = project([
      clip("lv", "v1", 0, 100, { linkGroup: "L" }),
      clip("la", "a1", 0, 100, { linkGroup: "L" }),
      clip("sv", "v2", 0, 10, { linkGroup: "S" }),
      clip("sa", "a2", 0, 10, { linkGroup: "S" }),
      clip("solo", "v2", 200, 10),
    ]);
    const { doc } = setup(p);
    // The linked short pair drops into the middle of the linked long pair (V2 -> V1, A2 -> A1).
    apply(doc, moveClips(p, ["sv", "sa"], 40, new Map([["v2", "v1"], ["a2", "a1"]]), "overwrite", { newId: counter() }));
    let after = doc.getState();
    const rightVideo = after.clips[(after.tracks[0] as Track).clipIds[2] as string] as Clip;
    const rightAudio = after.clips[(after.tracks[2] as Track).clipIds[2] as string] as Clip;
    expect(rightVideo.linkGroup).toBeDefined();
    expect(rightVideo.linkGroup).toBe(rightAudio.linkGroup);
    expect(rightVideo.linkGroup).not.toBe("L");
    expect(after.clips.lv?.linkGroup).toBe("L");
    expect(after.clips.sv?.linkGroup).toBe("S");

    // A video-only drop splits the video alone: its right piece is unlinked.
    apply(doc, moveClips(after, ["solo"], -175, new Map([["v2", "v1"]]), "overwrite", { newId: counter("m") }));
    after = doc.getState();
    const pieces = layout(after, "v1").map(([id]) => after.clips[id] as Clip);
    const lone = pieces.find((c) => c.start === 35);
    expect(lone).toBeDefined();
    expect(lone?.linkGroup).toBeUndefined();
  });

  it("keeps the right pieces of a linked pair of different lengths linked when both are cut at the same frame", () => {
    const p = project([
      clip("lv", "v1", 0, 100, { linkGroup: "L" }),
      clip("la", "a1", 0, 120, { linkGroup: "L" }),
      clip("mv", "v2", 300, 10, { linkGroup: "M" }),
      clip("ma", "a2", 300, 10, { linkGroup: "M" }),
    ]);
    const { doc } = setup(p);
    apply(doc, moveClips(p, ["mv", "ma"], -260, new Map([["v2", "v1"], ["a2", "a1"]]), "overwrite", { newId: counter() }));
    const after = doc.getState();
    const [, , rightVideo] = layout(after, "v1");
    const [, , rightAudio] = layout(after, "a1");
    expect(rightVideo?.slice(1)).toEqual([50, 50]);
    expect(rightAudio?.slice(1)).toEqual([50, 70]);
    const video = after.clips[rightVideo?.[0] as string] as Clip;
    const audio = after.clips[rightAudio?.[0] as string] as Clip;
    expect(video.linkGroup).toBeDefined();
    expect(video.linkGroup).toBe(audio.linkGroup);
    expect(video.linkGroup).not.toBe("L");
    expect(after.clips.lv?.linkGroup).toBe("L");
    expect(after.clips.la?.linkGroup).toBe("L");
    expect(validateProject(after)).toEqual([]);
  });
});

describe("moveClips: insert", () => {
  it("shifts later clips on every unlocked track by the block length; locked tracks stay; crossing clips split", () => {
    const tracks = [makeTrack("v1"), makeTrack("v2"), { ...makeTrack("v3"), locked: true }, makeTrack("a1", "audio")];
    const p = project([clip("a", "v1", 0, 30), clip("b", "v1", 50, 10), clip("cross", "v2", 10, 40), clip("locked", "v3", 40, 10), clip("music", "a1", 0, 100), clip("m", "v2", 200, 20)], tracks);
    const { doc } = setup(p);
    apply(doc, moveClips(p, ["m"], -160, new Map([["v2", "v1"]]), "insert", { newId: counter() }));
    const after = doc.getState();
    // Insert at 40 with length 20 on V1: b (50) moves to 70; a ends at 30, before the insert frame.
    expect(layout(after, "v1")).toEqual([
      ["a", 0, 30],
      ["m", 40, 20],
      ["b", 70, 10],
    ]);
    // V2: `cross` [10, 50) splits at 40, its right part shifts to 60.
    expect(layout(after, "v2")).toEqual([
      ["cross", 10, 30],
      ["n1", 60, 10],
    ]);
    expect(layout(after, "v3")).toEqual([["locked", 40, 10]]);
    // The music bed splits too and opens the same gap.
    expect(layout(after, "a1")).toEqual([
      ["music", 0, 40],
      ["n2", 60, 60],
    ]);
    expect((after.clips.n2 as MediaClip).in).toBe(frameToUs(40, fps));
    expect(validateProject(after)).toEqual([]);
  });

  it("inserts a multi-track block at its earliest start with its full length", () => {
    const p = project([clip("x", "v1", 100, 10), clip("y", "a1", 100, 10), clip("mv", "v2", 0, 10), clip("ma", "a2", 5, 10)]);
    const { doc } = setup(p);
    apply(doc, moveClips(p, ["mv", "ma"], 100, new Map([["v2", "v1"], ["a2", "a1"]]), "insert", { newId: counter() }));
    const after = doc.getState();
    expect(layout(after, "v1")).toEqual([
      ["mv", 100, 10],
      ["x", 115, 10],
    ]);
    expect(layout(after, "a1")).toEqual([
      ["ma", 105, 10],
      ["y", 115, 10],
    ]);
  });

  it("keeps the right pieces of a linked pair of different lengths linked after the split", () => {
    const p = project([clip("lv", "v1", 0, 100, { linkGroup: "L" }), clip("la", "a1", 0, 120, { linkGroup: "L" }), clip("m", "v2", 300, 10)]);
    const { doc } = setup(p);
    apply(doc, moveClips(p, ["m"], -240, new Map([["v2", "v1"]]), "insert", { newId: counter() }));
    const after = doc.getState();
    expect(layout(after, "v1")).toEqual([
      ["lv", 0, 60],
      ["m", 60, 10],
      ["n1", 70, 40],
    ]);
    expect(layout(after, "a1")).toEqual([
      ["la", 0, 60],
      ["n2", 70, 60],
    ]);
    expect(after.clips.n1?.linkGroup).toBeDefined();
    expect(after.clips.n1?.linkGroup).toBe(after.clips.n2?.linkGroup);
    expect(after.clips.n1?.linkGroup).not.toBe("L");
    expect(after.clips.lv?.linkGroup).toBe("L");
    expect(after.clips.la?.linkGroup).toBe("L");
    expect(validateProject(after)).toEqual([]);
  });
});

describe("moveClips: refusals", () => {
  const tracks = () => [makeTrack("v1"), { ...makeTrack("v2"), locked: true }, makeTrack("a1", "audio")];

  it("refuses a drop onto a locked track in both modes", () => {
    const p = project([clip("a", "v1", 0, 10)], tracks());
    for (const mode of ["overwrite", "insert"] as const) {
      expect(moveClips(p, ["a"], 0, new Map([["v1", "v2"]]), mode, { newId: counter() })).toEqual({ kind: "refused", refusal: { reason: "lockedTarget", trackId: "v2" } });
    }
  });

  it("refuses to move clips off a locked track", () => {
    const p = project([clip("a", "v2", 0, 10)], tracks());
    expect(moveClips(p, ["a"], 5, noLanes, "overwrite", { newId: counter() })).toEqual({ kind: "refused", refusal: { reason: "lockedSource", trackId: "v2" } });
  });

  it("lets an overwrite ignore locked tracks it does not touch", () => {
    const p = project([clip("a", "v1", 0, 10), clip("b", "v2", 0, 100)], tracks());
    const result = moveClips(p, ["a"], 20, noLanes, "overwrite", { newId: counter() });
    expect(result.kind).toBe("ok");
  });
});

describe("moveClips: duplicate", () => {
  it("leaves the originals and drops linked copies with new ids and a new link group", () => {
    const p = project([clip("v", "v1", 0, 10, { linkGroup: "L" }), clip("a", "a1", 0, 10, { linkGroup: "L" })]);
    const { doc } = setup(p);
    const result = moveClips(p, ["v", "a"], 30, noLanes, "overwrite", { duplicate: true, newId: counter() });
    if (result.kind !== "ok") throw new Error("expected ok");
    expect(result.command.label).toBe("Duplicate clips");
    apply(doc, result);
    const after = doc.getState();
    const copyV = result.placed.get("v") as string;
    const copyA = result.placed.get("a") as string;
    expect(layout(after, "v1")).toEqual([
      ["v", 0, 10],
      [copyV, 30, 10],
    ]);
    expect(layout(after, "a1")).toEqual([
      ["a", 0, 10],
      [copyA, 30, 10],
    ]);
    expect(after.clips[copyV]?.linkGroup).toBe(after.clips[copyA]?.linkGroup);
    expect(after.clips[copyV]?.linkGroup).not.toBe("L");
  });

  it("drops an unlinked copy of a single linked clip, and lets a copy overwrite its original", () => {
    const p = project([clip("v", "v1", 0, 20, { linkGroup: "L" }), clip("a", "a1", 0, 20, { linkGroup: "L" })]);
    const { doc } = setup(p);
    const result = moveClips(p, ["v"], 10, noLanes, "overwrite", { duplicate: true, newId: counter() });
    apply(doc, result);
    const after = doc.getState();
    if (result.kind !== "ok") throw new Error("expected ok");
    const copy = result.placed.get("v") as string;
    expect(after.clips[copy]?.linkGroup).toBeUndefined();
    expect(layout(after, "v1")).toEqual([
      ["v", 0, 10],
      [copy, 10, 20],
    ]);
  });

  it("duplicates in place with a zero delta (the copy overwrites the original)", () => {
    const p = project([clip("v", "v1", 0, 20)]);
    const result = moveClips(p, ["v"], 0, noLanes, "overwrite", { duplicate: true, newId: counter() });
    const { doc } = setup(p);
    apply(doc, result);
    expect(layout(doc.getState(), "v1")).toEqual([["n1", 0, 20]]);
  });
});

describe("lanes", () => {
  const tracks = [makeTrack("v1"), makeTrack("v2"), makeTrack("a1", "audio"), makeTrack("a2", "audio")];

  it("maps a source track to the track at the shifted lane, or to a track to create", () => {
    expect(laneTarget(tracks, "v1", { video: 1, audio: 0 })).toMatchObject({ kind: "video", number: 1, track: { id: "v2" } });
    expect(laneTarget(tracks, "v2", { video: 1, audio: 0 })).toMatchObject({ kind: "video", number: 2, track: null });
    expect(laneTarget(tracks, "a2", { video: 0, audio: -1 })).toMatchObject({ kind: "audio", number: 0, track: { id: "a1" } });
  });

  it("clamps each kind at its first lane, keeping the block shape", () => {
    expect(clampLaneDelta(tracks, ["v2", "a1"], { video: -3, audio: -3 })).toEqual({ video: -1, audio: 0 });
    expect(clampLaneDelta(tracks, ["v1"], { video: 2, audio: 2 })).toEqual({ video: 2, audio: 0 });
  });

  it("creates the tracks past the last lane in lane order, with default names", () => {
    const { trackMap, newTracks } = mapLanes(tracks, ["v1", "v2", "a2"], { video: 2, audio: 1 }, counter("t"));
    expect(newTracks.map((t) => [t.id, t.kind, t.name])).toEqual([
      ["t1", "video", "V3"],
      ["t2", "video", "V4"],
      ["t3", "audio", "A3"],
    ]);
    expect([...trackMap]).toEqual([
      ["v1", "t1"],
      ["v2", "t2"],
      ["a2", "t3"],
    ]);
  });
});

describe("applyMoveRequest", () => {
  const request = (fields: Partial<MoveRequest>): MoveRequest => ({ clipIds: [], primary: null, deltaFrames: 0, laneDelta: { video: 0, audio: 0 }, mode: "overwrite", duplicate: false, ...fields });

  it("moves a multi-track selection up one lane keeping its offsets, creating the track above V-top", () => {
    const p = project([clip("one", "v1", 0, 10), clip("two", "v2", 20, 10)]);
    const { doc } = setup(p);
    apply(doc, applyMoveRequest(p, request({ clipIds: ["one", "two"], laneDelta: { video: 1, audio: 1 } }), counter("t")));
    const after = doc.getState();
    expect(after.tracks.map((t) => t.name)).toEqual(["V1", "V2", "V3", "A1", "A2"]);
    expect(layout(after, "v2")).toEqual([["one", 0, 10]]);
    expect(layout(after, "t1")).toEqual([["two", 20, 10]]);
    expect(doc.undo()).toBe(true);
    expect(doc.getState().tracks.map((t) => t.name)).toEqual(["V1", "V2", "A1", "A2"]);
  });

  it("takes linked audio along with the same lane delta (V1 -> V2, A1 -> A2)", () => {
    const p = project([clip("v", "v1", 0, 10, { linkGroup: "L" }), clip("a", "a1", 0, 10, { linkGroup: "L" })]);
    const { doc } = setup(p);
    apply(doc, applyMoveRequest(p, request({ clipIds: ["v", "a"], deltaFrames: 5, laneDelta: { video: 1, audio: 1 } }), counter()));
    expect(layout(doc.getState(), "v2")).toEqual([["v", 5, 10]]);
    expect(layout(doc.getState(), "a2")).toEqual([["a", 5, 10]]);
  });

  it("refuses without creating tracks when a destination is locked", () => {
    const tracks = [makeTrack("v1"), { ...makeTrack("v2"), locked: true }, makeTrack("a1", "audio")];
    const p = project([clip("v", "v1", 0, 10)], tracks);
    expect(applyMoveRequest(p, request({ clipIds: ["v"], laneDelta: { video: 1, audio: 1 } }), counter())).toEqual({ kind: "refused", refusal: { reason: "lockedTarget", trackId: "v2" } });
  });
});

describe("nudgeClips", () => {
  it("moves by frames with overwrite collisions, as coalescable steps", () => {
    const p = project([clip("a", "v1", 0, 10), clip("b", "v1", 10, 10)]);
    const { doc } = setup(p);
    const result = nudgeClips(p, ["a"], 1, counter());
    if (result.kind !== "ok") throw new Error("expected ok");
    expect(result.command.coalesceKey).toBe("clip.nudge");
    expect(result.command.label).toBe("Nudge clip");
    apply(doc, result);
    expect(layout(doc.getState(), "v1")).toEqual([
      ["a", 1, 10],
      ["b", 11, 9],
    ]);
    expect(nudgeClips(project([clip("a", "v1", 0, 10)]), ["a"], -5, counter())).toEqual({ kind: "noop" });
  });

  it("refuses a nudge of clips on a locked track", () => {
    const p = project([clip("a", "v1", 10, 10)], [{ ...makeTrack("v1"), locked: true }]);
    expect(nudgeClips(p, ["a"], 1, counter()).kind).toBe("refused");
  });
});

describe("moveToAdjacentLane", () => {
  it("moves up on screen when the span above is free, linked audio following with the same lane delta", () => {
    const p = project([clip("v", "v1", 0, 10, { linkGroup: "L" }), clip("a", "a1", 0, 10, { linkGroup: "L" })]);
    const { doc } = setup(p);
    apply(doc, moveToAdjacentLane(p, ["v", "a"], "up", "video", counter()));
    expect(layout(doc.getState(), "v2")).toEqual([["v", 0, 10]]);
    expect(layout(doc.getState(), "a2")).toEqual([["a", 0, 10]]);
    // Up from an audio clip goes toward the divider: A2 -> A1, V2 -> V1.
    apply(doc, moveToAdjacentLane(doc.getState(), ["v", "a"], "up", "audio", counter()));
    expect(layout(doc.getState(), "v1")).toEqual([["v", 0, 10]]);
    expect(layout(doc.getState(), "a1")).toEqual([["a", 0, 10]]);
  });

  it("refuses when the adjacent span is taken, and does nothing at the last track", () => {
    const p = project([clip("v", "v1", 0, 10), clip("block", "v2", 5, 10)]);
    expect(moveToAdjacentLane(p, ["v"], "up", "video", counter())).toEqual({ kind: "refused", refusal: { reason: "occupied", trackId: "v2" } });
    expect(moveToAdjacentLane(p, ["v"], "down", "video", counter())).toEqual({ kind: "noop" });
    expect(moveToAdjacentLane(p, ["block"], "up", "video", counter())).toEqual({ kind: "noop" });
  });
});

describe("sliceClip", () => {
  it("moves source in/out by the cut frames at the clip speed and drops fades and transitions on new edges", () => {
    const fast = clip("f", "v1", 10, 40, { speed: 2, in: 1_000_000, out: 1_000_000 + framesToSourceUs(40, 2, fps), fades: { in: 5, out: 6 }, transitionIn: { kind: "x" }, transitionOut: { kind: "y" } });
    const middle = sliceClip(fast, 20, 30, fps) as MediaClip;
    expect(middle).toMatchObject({ start: 20, duration: 10, fades: { in: 0, out: 0 } });
    expect(middle.in).toBe(1_000_000 + framesToSourceUs(10, 2, fps));
    expect(middle.out).toBe(1_000_000 + framesToSourceUs(20, 2, fps));
    expect(middle.transitionIn).toBeUndefined();
    expect(middle.transitionOut).toBeUndefined();
    const head = sliceClip(fast, 10, 20, fps) as MediaClip;
    expect(head).toMatchObject({ in: 1_000_000, fades: { in: 5, out: 0 }, transitionIn: { kind: "x" } });
    expect(sliceClip(fast, 10, 50, fps)).toBe(fast);
  });

  it("slices clips without source times (solids) by frames only", () => {
    const solid = makeSolidClip({ id: "s", trackId: "v1", start: 0, duration: 30 });
    expect(sliceClip(solid, 10, 30, fps)).toMatchObject({ start: 10, duration: 20 });
  });

  it("rejects a range outside the clip", () => {
    expect(() => sliceClip(clip("c", "v1", 0, 10), 5, 15, fps)).toThrow();
  });
});

describe("overwrittenSpans", () => {
  it("returns the covered parts of stationary clips, ignoring moving ones", () => {
    const p = project([clip("a", "v1", 0, 10), clip("b", "v1", 20, 10), clip("c", "v1", 40, 10)]);
    const index = trackIndex(p, p.tracks[0] as Track);
    expect(overwrittenSpans(index, 5, 45, null)).toEqual([
      [5, 10],
      [20, 30],
      [40, 45],
    ]);
    expect(overwrittenSpans(index, 5, 45, new Set(["b"]))).toEqual([
      [5, 10],
      [40, 45],
    ]);
    expect(overwrittenSpans(index, 10, 20, null)).toEqual([]);
  });
});
