import { describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeSolidClip, makeTrack, withClips } from "./fixtures.js";
import { frameToUs } from "./time.js";
import {
  alignedSides,
  alignmentOf,
  extendedEnd,
  extendedStart,
  fitTransition,
  handleOf,
  handleTimeUs,
  hasTransitions,
  reconciled,
  reconcileTransitions,
  repeatedFrames,
  transitionIssues,
  transitionMix,
} from "./transitions.js";
import type { Clip, MediaClip, Project, Transition } from "./types.js";
import { validateProject } from "./validate.js";
import { produce } from "immer";

const fps = makeProject().settings.fps;
/** 100 s of media: 3000 frames at 30 fps. */
const MEDIA_US = 100_000_000;

/** A video clip on `track` at `start`, `frames` long, playing its media from frame `from`. */
function clip(id: string, start: number, frames: number, from: number, extra: Partial<MediaClip> = {}, track = "v1"): MediaClip {
  const base = makeMediaClip(makeProject(), { id, trackId: track, start, duration: frames, mediaId: "m", kind: track.startsWith("a") ? "audio" : "video" });
  return { ...base, in: frameToUs(from, fps), out: frameToUs(from + frames, fps), ...extra };
}

function project(clips: Clip[]): Project {
  const p = makeProject();
  p.media.m = makeMedia("m", "video", MEDIA_US);
  p.media.img = makeMedia("img", "image", 0);
  p.tracks.push(makeTrack("v1"), makeTrack("v2"), makeTrack("a1", "audio"));
  return withClips(p, clips);
}

const T = (before: number, after: number, id = "t", kind: Transition["kind"] = "crossDissolve"): Transition => ({ id, kind, before, after });

/** A and B abut at frame 60 with transition `t` (A plays media 0..60, B media `bFrom`..). */
function pair(t: Transition, bFrom = 300, aFrom = 0): Project {
  return project([clip("a", 0, 60, aFrom, { transitionOut: t }), clip("b", 60, 60, bFrom, { transitionIn: t })]);
}

const reconcile = (base: Project, next: Project) => produce(next, (draft) => reconcileTransitions(base, draft, () => "new"));
const tOut = (p: Project, id: string) => (p.clips[id] as MediaClip).transitionOut;
const tIn = (p: Project, id: string) => (p.clips[id] as MediaClip).transitionIn;

describe("handles", () => {
  it("counts source frames before in and after out at the clip's speed; stills and freezes never run out", () => {
    const p = project([clip("a", 0, 60, 30), clip("i", 100, 30, 0, { kind: "image", mediaId: "img" }), clip("f", 200, 30, 10, { speed: 0 })]);
    const a = p.clips.a as MediaClip;
    expect(handleOf(p, a, "head")).toBe(30);
    expect(handleOf(p, a, "tail")).toBe(3000 - 90);
    expect(handleOf(p, { ...a, speed: 2, out: a.in + frameToUs(120, fps) }, "head")).toBe(15);
    expect(handleOf(p, p.clips.i as MediaClip, "head")).toBe(Infinity);
    expect(handleOf(p, p.clips.f as MediaClip, "tail")).toBe(Infinity);
    expect(handleOf(p, makeSolidClip({ id: "s", trackId: "v1", start: 0, duration: 10 }), "tail")).toBe(0);
  });

  it("maps frames outside the clip to its source, repeating the edge frame where the media ends", () => {
    const a = clip("a", 100, 60, 12);
    expect(handleTimeUs(a, 94, fps, MEDIA_US)).toBe(frameToUs(6, fps));
    expect(handleTimeUs(a, 80, fps, MEDIA_US)).toBe(0);
    expect(handleTimeUs(a, 100 + 60 + 5000, fps, MEDIA_US)).toBe(MEDIA_US - 1);
    expect(extendedStart({ ...a, transitionIn: T(4, 6) })).toBe(96);
    expect(extendedEnd({ ...a, transitionOut: T(4, 6) })).toBe(166);
  });
});

describe("fitTransition", () => {
  it("centers the frames on the cut (the odd frame after it)", () => {
    const p = pair(T(1, 1), 300, 0);
    expect(fitTransition(p, p.clips.a as MediaClip, p.clips.b as MediaClip, 15)).toEqual({ before: 7, after: 8, repeated: false });
  });

  it("takes the maximum available: a short side gives its frames to the other", () => {
    // B has 3 frames of head; A plenty of tail.
    const p = pair(T(1, 1), 3);
    expect(fitTransition(p, p.clips.a as MediaClip, p.clips.b as MediaClip, 15)).toEqual({ before: 3, after: 12, repeated: false });
    // A has no tail (its out is the media end): everything before the cut.
    const q = project([clip("a", 0, 60, 3000 - 60), clip("b", 60, 60, 300)]);
    expect(fitTransition(q, q.clips.a as MediaClip, q.clips.b as MediaClip, 15)).toEqual({ before: 15, after: 0, repeated: false });
  });

  it("with no handle at all keeps the length and repeats edge frames", () => {
    const p = project([clip("a", 0, 60, 3000 - 60), clip("b", 60, 60, 0)]);
    expect(fitTransition(p, p.clips.a as MediaClip, p.clips.b as MediaClip, 15)).toEqual({ before: 7, after: 8, repeated: true });
    const left = p.clips.a as MediaClip;
    const right = p.clips.b as MediaClip;
    expect(repeatedFrames(p, left, right, T(7, 8))).toEqual({ before: 7, after: 8 });
  });

  it("stays inside the clips and their other transitions", () => {
    const p = project([clip("a", 0, 4, 100, { transitionIn: T(0, 2, "x") }), clip("b", 4, 3, 300)]);
    // A has 4 frames, 2 taken by its own transition in; B has 3.
    expect(fitTransition(p, p.clips.a as MediaClip, p.clips.b as MediaClip, 15)).toEqual({ before: 2, after: 3, repeated: false });
  });
});

describe("mix and alignment", () => {
  it("weighs the incoming clip (i + 1) / (d + 1) at the i-th frame", () => {
    const t = T(2, 2);
    expect([58, 59, 60, 61].map((frame) => transitionMix(t, 60, frame))).toEqual([0.2, 0.4, 0.6, 0.8]);
  });

  it("names the alignment and builds sides from it", () => {
    expect(alignmentOf(T(7, 8))).toBe("center");
    expect(alignmentOf(T(0, 15))).toBe("start");
    expect(alignmentOf(T(15, 0))).toBe("end");
    expect(alignmentOf(T(3, 12))).toBe("custom");
    expect(alignedSides(15, "center")).toEqual({ before: 7, after: 8 });
    expect(alignedSides(15, "end")).toEqual({ before: 15, after: 0 });
  });
});

describe("reconcileTransitions", () => {
  it("drops a half whose partner is gone or no longer abuts, both halves", () => {
    const base = pair(T(7, 8));
    const moved = produce(base, (draft) => {
      (draft.clips.b as MediaClip).start = 70;
    });
    const next = reconcile(base, moved);
    expect(tOut(next, "a")).toBeUndefined();
    expect(tIn(next, "b")).toBeUndefined();
    const deleted = produce(base, (draft) => {
      delete draft.clips.b;
      draft.tracks[0]!.clipIds = ["a"];
    });
    expect(tOut(reconcile(base, deleted), "a")).toBeUndefined();
  });

  it("shortens a side to the handle an edit leaves, and removes the transition when it is used up", () => {
    // B plays from frame 12: 12 frames of head for the 7 before the cut (multiples of 3 frames are
    // whole 100 ms steps at 30 fps: no rounding in the handles).
    const base = pair(T(7, 8), 12);
    const rolled = (frames: number) =>
      produce(base, (draft) => {
        const a = draft.clips.a as MediaClip;
        const b = draft.clips.b as MediaClip;
        // A roll of the cut `frames` earlier: A ends sooner, B starts sooner and earlier in its media.
        a.duration -= frames;
        a.out -= frameToUs(frames, fps);
        b.start -= frames;
        b.duration += frames;
        b.in -= frameToUs(frames, fps);
      });
    expect(tOut(reconcile(base, rolled(3)), "a")).toEqual(T(7, 8));
    expect(tOut(reconcile(base, rolled(6)), "a")).toEqual(T(6, 8));
    expect(tIn(reconcile(base, rolled(6)), "b")).toEqual(T(6, 8));
    const gone = reconcile(base, rolled(12));
    expect(tOut(gone, "a")).toBeUndefined();
    expect(tIn(gone, "b")).toBeUndefined();
  });

  it("keeps a side that already repeats frames, within its clip", () => {
    const base = project([clip("a", 0, 60, 3000 - 60, { transitionOut: T(7, 8) }), clip("b", 60, 60, 0, { transitionIn: T(7, 8) })]);
    const shorter = produce(base, (draft) => {
      const b = draft.clips.b as MediaClip;
      b.duration = 5;
      b.out = b.in + frameToUs(5, fps);
    });
    expect(tOut(reconcile(base, shorter), "a")).toEqual(T(7, 5));
  });

  it("gives pairs copied together a new id and leaves valid documents untouched", () => {
    const base = pair(T(7, 8));
    const copied = produce(base, (draft) => {
      draft.clips.c = { ...(draft.clips.a as MediaClip), id: "c", start: 200 };
      draft.clips.d = { ...(draft.clips.b as MediaClip), id: "d", start: 260 };
      draft.tracks[1]!.clipIds = ["c", "d"];
      (draft.clips.c as MediaClip).trackId = "v2";
      (draft.clips.d as MediaClip).trackId = "v2";
    });
    const next = reconcile(base, copied);
    expect(tOut(next, "c")?.id).toBe("new");
    expect(tIn(next, "d")?.id).toBe("new");
    expect(tOut(next, "a")?.id).toBe("t");
    expect(validateProject(next)).toEqual([]);
    expect(reconcile(base, base)).toBe(base);
    expect(reconciled(base, base)).toBe(base);
  });

  it("caches whether a project has transitions", () => {
    expect(hasTransitions(pair(T(1, 1)))).toBe(true);
    expect(hasTransitions(project([clip("a", 0, 60, 0)]))).toBe(false);
  });
});

describe("transitionIssues", () => {
  it("reports unmatched halves, bad shapes and transitions that do not fit", () => {
    const label = (c: Clip) => c.id;
    const p = project([clip("a", 0, 10, 0, { transitionOut: T(7, 8) }), clip("b", 10, 5, 300, { transitionIn: T(7, 9) })]);
    const issues = transitionIssues(p, [p.clips.a as Clip, p.clips.b as Clip], label);
    expect(issues.some((issue) => issue.includes("a: transition out does not match"))).toBe(true);
    expect(issues.some((issue) => issue.includes("b: its transitions take more"))).toBe(true);
    const audio = project([clip("x", 0, 30, 0, { transitionOut: T(2, 2, "u", "dipToBlack") }, "a1"), clip("y", 30, 30, 300, { transitionIn: T(2, 2, "u", "dipToBlack") }, "a1")]);
    expect(validateProject(audio).some((issue) => issue.includes("audio transitions are crossfades"))).toBe(true);
    expect(validateProject(pair(T(7, 8)))).toEqual([]);
  });
});
