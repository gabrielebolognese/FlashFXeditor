import { describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeSolidClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import { framesToSourceUs, frameToUs } from "../../core/document/time.js";
import type { CaptionClip, Clip, MediaClip, Project, Track } from "../../core/document/types.js";
import { validateProject } from "../../core/document/validate.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { linkOffset } from "../model/queries.js";
import { applyTrim, extendToPlayhead, headFrames, maxDurationFrames, planTrim, resolveTrim, trimEdge, trimToPlayhead, type TrimResult } from "./trim.js";

const fps = makeProject().settings.fps;
/** 10 s of media at 30 fps: 300 frames. */
const MEDIA_US = 10_000_000;

function clip(id: string, trackId: string, start: number, duration: number, extra: Partial<MediaClip> = {}): MediaClip {
  const base = makeMediaClip(makeProject(), { id, trackId, start, duration, mediaId: "m", kind: trackId.startsWith("a") ? "audio" : "video" });
  return { ...base, ...extra };
}

/** A clip `inFrames` into the media (in/out on the frame grid). */
function at(id: string, trackId: string, start: number, duration: number, inFrames: number, extra: Partial<MediaClip> = {}): MediaClip {
  return clip(id, trackId, start, duration, { in: frameToUs(inFrames, fps), out: frameToUs(inFrames + duration, fps), ...extra });
}

const TRACKS = () => [makeTrack("v1"), makeTrack("v2"), makeTrack("a1", "audio"), makeTrack("a2", "audio")];

function project(clips: Clip[], tracks: Track[] = TRACKS()): Project {
  const p = makeProject();
  p.media.m = makeMedia("m", "video", MEDIA_US);
  p.media.img = makeMedia("img", "image", 0);
  p.tracks.push(...tracks.map((track) => ({ ...track, targeted: true })));
  return withClips(p, clips);
}

/** Dispatches the result's command through a validating store; returns the new document. */
function commit(p: Project, result: TrimResult | null): Project {
  if (!result?.command) throw new Error("expected a command");
  const doc = new DocumentStore(p, { session: createSessionStore(), validate: true });
  doc.dispatch(result.command);
  expect(doc.history.getState().canUndo).toBe(true);
  expect(doc.history.getState().undoLabel).toBe(result.command.label);
  return doc.getState();
}

const span = (p: Project, id: string) => {
  const c = p.clips[id] as Clip;
  return [c.start, c.duration];
};
const source = (p: Project, id: string) => {
  const c = p.clips[id] as MediaClip;
  return [c.in, c.out];
};

describe("trimEdge: regular", () => {
  it("moves an out point within the media and the neighbors, one undo step", () => {
    const p = project([at("a", "v1", 0, 100, 0), at("b", "v1", 150, 50, 0)]);
    const shorter = commit(p, trimEdge(p, "a", "out", -30, { ripple: false }));
    expect(span(shorter, "a")).toEqual([0, 70]);
    expect(source(shorter, "a")).toEqual([0, frameToUs(70, fps)]);
    expect(span(shorter, "b")).toEqual([150, 50]);
    const longer = commit(p, trimEdge(p, "a", "out", 20, { ripple: false }));
    expect(span(longer, "a")).toEqual([0, 120]);
    expect(trimEdge(p, "a", "out", 20, { ripple: false }).command?.label).toBe("Trim clip");
  });

  it("moves an in point: start and in follow, the out stays", () => {
    const p = project([at("a", "v1", 100, 100, 60)]);
    const shorter = commit(p, trimEdge(p, "a", "in", 25, { ripple: false }));
    expect(span(shorter, "a")).toEqual([125, 75]);
    expect(source(shorter, "a")).toEqual([frameToUs(85, fps), frameToUs(160, fps)]);
    const longer = commit(p, trimEdge(p, "a", "in", -40, { ripple: false }));
    expect(span(longer, "a")).toEqual([60, 140]);
    expect(source(longer, "a")).toEqual([frameToUs(20, fps), frameToUs(160, fps)]);
  });

  it("stops at the neighbor clip instead of overlapping it (both edges)", () => {
    const p = project([at("a", "v1", 0, 100, 0), at("b", "v1", 120, 50, 100), at("c", "v1", 170, 30, 200)]);
    const out = trimEdge(p, "a", "out", 50, { ripple: false });
    expect(out.delta).toBe(20);
    expect(out.limit).toMatchObject({ reason: "neighbor", clipId: "a" });
    expect(span(commit(p, out), "a")).toEqual([0, 120]);
    const into = trimEdge(p, "b", "in", -50, { ripple: false });
    expect(into.delta).toBe(-20);
    expect(into.limit?.reason).toBe("neighbor");
    // Abutting clips: no room at all, so nothing changes (no undo step).
    const none = trimEdge(p, "c", "in", -5, { ripple: false });
    expect(none.delta).toBe(0);
    expect(none.command).toBeNull();
  });

  it("stops an in point at frame 0", () => {
    const p = project([at("a", "v1", 10, 50, 100)]);
    const result = trimEdge(p, "a", "in", -30, { ripple: false });
    expect(result.delta).toBe(-10);
    expect(result.limit?.reason).toBe("timelineStart");
    expect(span(commit(p, result), "a")).toEqual([0, 60]);
  });

  it("does nothing for a zero delta (no undo entry)", () => {
    const p = project([at("a", "v1", 0, 100, 0)]);
    const result = trimEdge(p, "a", "out", 0.4, { ripple: false });
    expect(result.delta).toBe(0);
    expect(result.changes.size).toBe(0);
    expect(result.command).toBeNull();
  });
});

describe("trimEdge: 1-frame minimum (spec §6.19)", () => {
  it("clamps an out trim to one frame, then extends back to the original", () => {
    const p = project([at("a", "v1", 0, 100, 40)]);
    const one = trimEdge(p, "a", "out", -500, { ripple: false });
    expect(one.delta).toBe(-99);
    expect(one.limit?.reason).toBe("minDuration");
    const tiny = commit(p, one);
    expect(span(tiny, "a")).toEqual([0, 1]);
    const back = commit(tiny, trimEdge(tiny, "a", "out", 99, { ripple: false }));
    expect(back.clips.a).toEqual(p.clips.a);
  });

  it("clamps an in trim to one frame, then extends back to the original, in and out exact", () => {
    const p = project([at("a", "v1", 30, 100, 40)]);
    const tiny = commit(p, trimEdge(p, "a", "in", 1000, { ripple: false }));
    expect(span(tiny, "a")).toEqual([129, 1]);
    const back = commit(tiny, trimEdge(tiny, "a", "in", -99, { ripple: false }));
    expect(back.clips.a).toEqual(p.clips.a);
  });

  it("round-trips at a speed other than 1", () => {
    const sped = at("a", "v1", 0, 60, 30, { speed: 1.5, out: frameToUs(30, fps) + framesToSourceUs(60, 1.5, fps) });
    const p = project([sped]);
    const tiny = commit(p, trimEdge(p, "a", "in", 59, { ripple: false }));
    expect((tiny.clips.a as MediaClip).in).toBe(frameToUs(30, fps) + framesToSourceUs(59, 1.5, fps));
    const back = commit(tiny, trimEdge(tiny, "a", "in", -59, { ripple: false }));
    expect(validateProject(back)).toEqual([]);
    expect(Math.abs((back.clips.a as MediaClip).in - sped.in)).toBeLessThanOrEqual(1);
    expect(span(back, "a")).toEqual([0, 60]);
  });
});

describe("trimEdge: media bounds (spec §6.10)", () => {
  it("stops an in point at the media start: red edge, Media start", () => {
    const p = project([at("a", "v1", 100, 50, 20)]);
    const result = trimEdge(p, "a", "in", -60, { ripple: false });
    expect(result.delta).toBe(-20);
    expect(result.limit).toMatchObject({ reason: "mediaStart", clipId: "a" });
    expect(result.mediaBound).toBe("start");
    const next = commit(p, result);
    expect(source(next, "a")[0]).toBe(0);
    expect(span(next, "a")).toEqual([80, 70]);
    // Inside the bound the edge is not red.
    expect(trimEdge(p, "a", "in", -19, { ripple: false }).mediaBound).toBeNull();
  });

  it("stops an out point at the media end", () => {
    const p = project([at("a", "v1", 0, 100, 150)]);
    const result = trimEdge(p, "a", "out", 200, { ripple: false });
    expect(result.delta).toBe(50);
    expect(result.limit?.reason).toBe("mediaEnd");
    expect(result.mediaBound).toBe("end");
    expect(source(commit(p, result), "a")[1]).toBe(MEDIA_US);
  });

  it("an edge already on its bound is red as soon as the trim starts", () => {
    const p = project([at("a", "v1", 100, 50, 0)]);
    expect(trimEdge(p, "a", "in", 0, { ripple: false }).mediaBound).toBe("start");
    expect(trimEdge(p, "a", "in", 5, { ripple: false }).mediaBound).toBeNull();
  });

  it("extends back a head trimmed off by one frame (33333 us is less than a frame at 30 fps)", () => {
    const p = project([at("a", "v1", 10, 50, 0)]);
    const trimmed = commit(p, trimEdge(p, "a", "in", 1, { ripple: false }));
    expect(source(trimmed, "a")[0]).toBe(33_333);
    expect(headFrames(trimmed.clips.a as MediaClip, fps)).toBe(1);
    expect(trimEdge(trimmed, "a", "in", -5, { ripple: false }).delta).toBe(-1);
  });

  it("keeps a clip that ends at an off-grid media end within it", () => {
    const p = project([clip("a", "v1", 0, 300)]);
    p.media.m = { ...(p.media.m as NonNullable<Project["media"][string]>), durationUs: 10_010_000 };
    expect(maxDurationFrames(p.clips.a as MediaClip, 10_010_000, fps)).toBe(300);
    expect(trimEdge(p, "a", "out", 10, { ripple: false }).delta).toBe(0);
  });

  it("has no bounds for images, text and solids", () => {
    const image = { ...clip("i", "v1", 100, 150), kind: "image" as const, mediaId: "img" };
    const p = project([image, { ...makeSolidClip({ id: "s", trackId: "v2", start: 100, duration: 50 }) }]);
    const left = trimEdge(p, "i", "in", -80, { ripple: false });
    expect(left.delta).toBe(-80);
    expect(left.mediaBound).toBeNull();
    const extended = commit(p, left);
    expect(span(extended, "i")).toEqual([20, 230]);
    expect(source(extended, "i")).toEqual([0, frameToUs(230, fps)]);
    const long = commit(p, trimEdge(p, "s", "out", 10_000, { ripple: false }));
    expect(span(long, "s")).toEqual([100, 10_050]);
  });
});

describe("trimEdge: keyframes, fades", () => {
  it("in trims keep media keyframes on their source frame, text and solid keyframes on the clip start", () => {
    const keyframes = { "transform.scale": [{ frame: 10, value: 1, ease: "linear" }, { frame: 40, value: 2, ease: "linear" }] };
    const solid = { ...makeSolidClip({ id: "s", trackId: "v2", start: 100, duration: 50 }), keyframes };
    const p = project([at("a", "v1", 100, 50, 100, { keyframes }), solid]);
    const media = commit(p, trimEdge(p, "a", "in", 20, { ripple: false }));
    expect((media.clips.a as MediaClip).keyframes?.["transform.scale"]?.map((key) => key.frame)).toEqual([-10, 20]);
    const back = commit(media, trimEdge(media, "a", "in", -20, { ripple: false }));
    expect((back.clips.a as MediaClip).keyframes).toEqual(keyframes);
    const kept = commit(p, trimEdge(p, "s", "in", 20, { ripple: false }));
    expect((kept.clips.s as typeof solid).keyframes).toEqual(keyframes);
    // Out trims never move keyframes.
    const out = commit(p, trimEdge(p, "a", "out", -30, { ripple: false }));
    expect((out.clips.a as MediaClip).keyframes).toEqual(keyframes);
  });

  it("clamps fades to the new duration", () => {
    const p = project([at("a", "v1", 0, 100, 0, { fades: { in: 30, out: 40 } })]);
    const next = commit(p, trimEdge(p, "a", "out", -80, { ripple: false }));
    expect((next.clips.a as MediaClip).fades).toEqual({ in: 20, out: 20 });
  });
});

describe("trimEdge: ripple", () => {
  it("shifts every later clip on every unlocked track by the duration change (out point)", () => {
    const p = project([at("a", "v1", 0, 100, 0), at("b", "v1", 100, 50, 100), at("t", "v2", 120, 20, 0), at("x", "a2", 100, 30, 0), at("early", "a2", 0, 50, 0)]);
    const result = trimEdge(p, "a", "out", -30, { ripple: true });
    expect(result.command?.label).toBe("Ripple trim");
    const next = commit(p, result);
    expect(span(next, "a")).toEqual([0, 70]);
    expect(span(next, "b")).toEqual([70, 50]);
    expect(span(next, "t")).toEqual([90, 20]);
    expect(span(next, "x")).toEqual([70, 30]);
    expect(span(next, "early")).toEqual([0, 50]);
    const longer = commit(p, trimEdge(p, "a", "out", 25, { ripple: true }));
    expect(span(longer, "a")).toEqual([0, 125]);
    expect(span(longer, "b")).toEqual([125, 50]);
    expect(span(longer, "x")).toEqual([125, 30]);
  });

  it("an in point keeps its position: the content and later clips slide left", () => {
    const p = project([at("a", "v1", 50, 100, 0), at("b", "v1", 150, 50, 0), at("t", "v2", 80, 20, 0), at("before", "v2", 0, 40, 0)]);
    const next = commit(p, trimEdge(p, "a", "in", 30, { ripple: true }));
    expect(span(next, "a")).toEqual([50, 70]);
    expect(source(next, "a")).toEqual([frameToUs(30, fps), frameToUs(100, fps)]);
    expect(span(next, "b")).toEqual([120, 50]);
    // A clip on another track over the content keeps its place on it.
    expect(span(next, "t")).toEqual([50, 20]);
    expect(span(next, "before")).toEqual([0, 40]);
  });

  it("stops at the first cross-track collision (multi-track ripple limit)", () => {
    // v2: p ends at 80, q starts at 110: q can move left by 30 at most.
    const p = project([at("a", "v1", 0, 100, 0), at("b", "v1", 100, 50, 0), at("p", "v2", 40, 40, 0), at("q", "v2", 110, 20, 0), at("r", "a1", 130, 10, 0)]);
    const result = trimEdge(p, "a", "out", -60, { ripple: true });
    expect(result.delta).toBe(-30);
    expect(result.limit).toMatchObject({ reason: "ripple", clipId: "q", trackId: "v2" });
    const next = commit(p, result);
    expect(span(next, "a")).toEqual([0, 70]);
    expect(span(next, "q")).toEqual([80, 20]);
    expect(span(next, "r")).toEqual([100, 10]);
    // An in-point ripple is limited the same way (the shift is minus the delta): the edit point is
    // a's start (0), so p shifts too and frame 0 stops it after 40.
    const inTrim = trimEdge(p, "a", "in", 60, { ripple: true });
    expect(inTrim.delta).toBe(40);
    expect(inTrim.limit).toMatchObject({ reason: "ripple", clipId: "p" });
  });

  it("a clip spanning the edit point stops the clips after it from moving left", () => {
    const p = project([at("a", "v1", 0, 100, 0), at("bed", "a2", 0, 200, 0), at("bed2", "a2", 200, 50, 0)]);
    const result = trimEdge(p, "a", "out", -30, { ripple: true });
    expect(result.delta).toBe(0);
    expect(result.limit).toMatchObject({ reason: "ripple", trackId: "a2" });
    // Alone on its track, the bed neither moves nor limits.
    const single = project([at("a", "v1", 0, 100, 0), at("b", "v1", 100, 10, 0), at("bed", "a2", 0, 200, 0)]);
    const next = commit(single, trimEdge(single, "a", "out", -30, { ripple: true }));
    expect(span(next, "b")).toEqual([70, 10]);
    expect(span(next, "bed")).toEqual([0, 200]);
  });

  it("locked tracks never move and never limit (spec §6.19)", () => {
    const tracks = TRACKS().map((track) => (track.id === "v2" ? { ...track, locked: true } : track));
    const p = project([at("a", "v1", 0, 100, 0), at("b", "v1", 100, 50, 0), at("lock1", "v2", 50, 40, 0), at("lock2", "v2", 100, 20, 0)], tracks);
    const result = trimEdge(p, "a", "out", -60, { ripple: true });
    expect(result.delta).toBe(-60);
    const next = commit(p, result);
    expect(span(next, "b")).toEqual([40, 50]);
    expect(span(next, "lock1")).toEqual([50, 40]);
    expect(span(next, "lock2")).toEqual([100, 20]);
    // A clip on a locked track is never trimmed either.
    expect(trimEdge(p, "lock1", "out", -10, { ripple: false }).command).toBeNull();
  });

  it("stops shifted clips at frame 0", () => {
    const p = project([at("a", "v1", 50, 100, 0), at("t", "v2", 60, 10, 0)]);
    // In-point ripple of 20: t (at 60, after the edit point 50) moves to 40; 70 would pass 0.
    const result = trimEdge(p, "a", "in", 80, { ripple: true });
    expect(result.delta).toBe(60);
    expect(span(commit(p, result), "t")).toEqual([0, 10]);
  });

  it("ripples caption cues too", () => {
    const cue: CaptionClip = { id: "cue", trackId: "cc", kind: "caption", name: "cue", start: 120, duration: 30, enabled: true, text: "Hi" };
    const tracks = [makeTrack("v1"), makeTrack("cc", "caption"), makeTrack("a1", "audio")];
    const p = project([at("a", "v1", 0, 100, 0), cue], tracks);
    const next = commit(p, trimEdge(p, "a", "out", -20, { ripple: true }));
    expect(span(next, "cue")).toEqual([100, 30]);
  });
});

describe("trimEdge: linked clips (spec §6.10)", () => {
  const linked = () => project([at("v", "v1", 100, 100, 50, { linkGroup: "L" }), at("au", "a1", 100, 100, 50, { linkGroup: "L", kind: "audio" }), at("next", "a1", 230, 20, 0)]);

  it("trims linked partners together", () => {
    const p = linked();
    const next = commit(p, trimEdge(p, "v", "out", 20, { ripple: false }));
    expect(span(next, "v")).toEqual([100, 120]);
    expect(span(next, "au")).toEqual([100, 120]);
    expect(linkOffset(next, "v")).toBe(0);
  });

  it("stops both when the partner hits its bound first", () => {
    const p = linked();
    // The audio's neighbor at 230 leaves it 30 frames; the video alone could go further.
    const out = trimEdge(p, "v", "out", 80, { ripple: false });
    expect(out.delta).toBe(30);
    expect(out.limit).toMatchObject({ reason: "neighbor", clipId: "au" });
    // A partner with less media before its in point limits the in trim.
    const q = project([at("v", "v1", 100, 50, 50, { linkGroup: "L" }), at("au", "a1", 100, 50, 10, { linkGroup: "L", kind: "audio" })]);
    const into = trimEdge(q, "v", "in", -40, { ripple: false });
    expect(into.delta).toBe(-10);
    expect(into.limit).toMatchObject({ reason: "mediaStart", clipId: "au" });
    expect(into.mediaBound).toBe("start");
  });

  it("trims one side alone with linked: false (Alt), leaving a sync offset", () => {
    const p = linked();
    const inTrim = commit(p, trimEdge(p, "v", "in", 12, { ripple: false, linked: false }));
    expect(span(inTrim, "v")).toEqual([112, 88]);
    expect(span(inTrim, "au")).toEqual([100, 100]);
    expect(linkOffset(inTrim, "v")).toBe(12);
    expect(linkOffset(inTrim, "au")).toBe(-12);
    const outTrim = commit(p, trimEdge(p, "au", "out", -8, { ripple: false, linked: false }));
    expect(linkOffset(outTrim, "au")).toBe(-8);
    expect(linkOffset(outTrim, "v")).toBe(8);
  });

  it("ripples after both sides, each on its own track", () => {
    const p = linked();
    const next = commit(p, trimEdge(p, "v", "out", -40, { ripple: true }));
    expect(span(next, "au")).toEqual([100, 60]);
    expect(span(next, "next")).toEqual([190, 20]);
  });
});

describe("planTrim", () => {
  it("lists what the trim moves (snapping excludes it) and keeps lo <= 0 <= hi", () => {
    const p = project([at("a", "v1", 0, 100, 0), at("b", "v1", 100, 50, 0), at("x", "a2", 120, 30, 0), at("early", "a2", 0, 50, 0)]);
    const regular = planTrim(p, ["a"], "out", { ripple: false });
    expect([...regular.moving]).toEqual(["a"]);
    const ripple = planTrim(p, ["a"], "out", { ripple: true });
    expect([...ripple.moving].sort()).toEqual(["a", "b", "x"]);
    expect(ripple.firstShifted.get("a2")).toBe(120);
    expect(ripple.lo.value).toBeLessThanOrEqual(0);
    expect(ripple.hi.value).toBeGreaterThanOrEqual(0);
    // One plan serves every delta of a drag.
    expect(resolveTrim(ripple, -10).changes.get("x")?.start).toBe(110);
    expect(resolveTrim(ripple, 10).changes.get("x")?.start).toBe(130);
  });

  it("applyTrim gives the document the command leaves", () => {
    const p = project([at("a", "v1", 0, 100, 0), at("b", "v1", 100, 50, 0), at("x", "a2", 120, 30, 0)]);
    const result = trimEdge(p, "a", "out", -20, { ripple: true });
    expect(applyTrim(p, result).clips).toEqual(commit(p, result).clips);
    expect(validateProject(applyTrim(p, result))).toEqual([]);
    expect(applyTrim(p, trimEdge(p, "a", "out", 0, { ripple: true }))).toBe(p);
  });
});

describe("trimToPlayhead (Q / W)", () => {
  it("Q trims the start of the clip under the playhead to it and closes the gap", () => {
    const p = project([at("a", "v1", 0, 60, 0), at("b", "v1", 60, 90, 0), at("c", "v1", 150, 30, 0), at("t", "v2", 160, 10, 0)]);
    const trim = trimToPlayhead(p, 100, "start");
    expect(trim?.result.command?.label).toBe("Ripple trim start to playhead");
    const next = commit(p, trim?.result ?? null);
    expect(span(next, "b")).toEqual([60, 50]);
    expect(source(next, "b")).toEqual([frameToUs(40, fps), frameToUs(90, fps)]);
    expect(span(next, "c")).toEqual([110, 30]);
    expect(span(next, "t")).toEqual([120, 10]);
    // The playhead goes to the edit point, where the frame that was under it now is.
    expect(trim?.playhead).toBe(60);
  });

  it("W trims the end of the clip under the playhead to it; the playhead stays", () => {
    const p = project([at("b", "v1", 60, 90, 0), at("c", "v1", 150, 30, 0)]);
    const trim = trimToPlayhead(p, 100, "end");
    const next = commit(p, trim?.result ?? null);
    expect(span(next, "b")).toEqual([60, 40]);
    expect(span(next, "c")).toEqual([100, 30]);
    expect(trim?.playhead).toBe(100);
  });

  it("trims linked partners and every targeted track with the edit point, not clips spanning it", () => {
    const p = project([
      at("v", "v1", 60, 90, 0, { linkGroup: "L" }),
      at("au", "a1", 60, 90, 0, { linkGroup: "L", kind: "audio" }),
      at("over", "v2", 60, 90, 0),
      at("bed", "a2", 0, 290, 0),
    ]);
    const next = commit(p, trimToPlayhead(p, 100, "start")?.result ?? null);
    expect(span(next, "v")).toEqual([60, 50]);
    expect(span(next, "au")).toEqual([60, 50]);
    expect(span(next, "over")).toEqual([60, 50]);
    expect(next.clips.bed).toEqual(p.clips.bed);
  });

  it("ignores untargeted and locked tracks and clips starting at the playhead", () => {
    const tracks = TRACKS();
    const p = project([at("a", "v1", 0, 100, 0), at("b", "v2", 40, 100, 0)], tracks);
    p.tracks = p.tracks.map((track) => (track.id === "v2" ? { ...track, targeted: false } : track));
    const next = commit(p, trimToPlayhead(p, 30, "start")?.result ?? null);
    expect(span(next, "a")).toEqual([0, 70]);
    // b is on an untargeted track: not trimmed, but it starts after the edit point, so it ripples.
    expect(span(next, "b")).toEqual([10, 100]);
    expect(trimToPlayhead(p, 0, "start")).toBeNull();
    expect(trimToPlayhead(p, 0, "end")).toBeNull();
    expect(trimToPlayhead(p, 300, "start")).toBeNull();
    const locked = project([at("a", "v1", 0, 100, 0)], TRACKS().map((track) => ({ ...track, locked: true })));
    expect(trimToPlayhead(locked, 50, "start")).toBeNull();
  });

  it("Q is limited by collisions on other tracks and says so", () => {
    // v2 is not targeted: p spans the edit point (10) and stays; q, after it, can move 10 left.
    const p = project([at("a", "v1", 10, 100, 0), at("b", "v1", 110, 20, 0), at("p", "v2", 0, 20, 0), at("q", "v2", 30, 20, 0)]);
    p.tracks = p.tracks.map((track) => (track.id === "v2" ? { ...track, targeted: false } : track));
    const trim = trimToPlayhead(p, 40, "start");
    expect(trim?.result.delta).toBe(10);
    expect(trim?.result.limit).toMatchObject({ reason: "ripple", clipId: "q", trackId: "v2" });
    expect(trim?.playhead).toBe(30);
    const next = commit(p, trim?.result ?? null);
    expect(span(next, "a")).toEqual([10, 90]);
    expect(span(next, "q")).toEqual([20, 20]);
  });
});

describe("extendToPlayhead (E)", () => {
  it("moves the nearest edge to the playhead as a regular trim", () => {
    const p = project([at("a", "v1", 100, 50, 100), at("b", "v1", 200, 50, 0)]);
    const later = commit(p, extendToPlayhead(p, "a", 170));
    expect(span(later, "a")).toEqual([100, 70]);
    expect(span(later, "b")).toEqual([200, 50]);
    const earlier = commit(p, extendToPlayhead(p, "a", 80));
    expect(span(earlier, "a")).toEqual([80, 70]);
    expect(extendToPlayhead(p, "a", 80)?.command?.label).toBe("Extend edit");
    // Inside the clip, the nearer edge trims in.
    expect(span(commit(p, extendToPlayhead(p, "a", 140)), "a")).toEqual([100, 40]);
    // Clamped by the neighbor, never ripples.
    const clamped = extendToPlayhead(p, "a", 230);
    expect(clamped?.delta).toBe(50);
    expect(clamped?.limit?.reason).toBe("neighbor");
    expect(extendToPlayhead(p, "a", 100)).toBeNull();
    expect(extendToPlayhead(p, "missing", 10)).toBeNull();
  });
});
