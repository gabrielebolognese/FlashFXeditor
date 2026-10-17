import { describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeTrack, withClips } from "../../core/document/fixtures.js";
import { frameToUs } from "../../core/document/time.js";
import type { Clip, MediaClip, Project, Transition } from "../../core/document/types.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { dragFade, fadesOf, fadeTargets, presetFade, quickFade } from "./fades.js";
import { rippleDelete } from "./delete.js";
import { setSpeeds } from "./speed.js";
import { addTransition, clipCut, cutNear, defaultTransitionCut, dragTransitionEdge, linkedCuts, removeTransitions, transitionAt, updateTransition } from "./transitions.js";
import { rollEdit, trimEdge } from "./trim.js";

const fps = makeProject().settings.fps;

function clip(id: string, track: string, start: number, frames: number, from: number, extra: Partial<MediaClip> = {}): MediaClip {
  const base = makeMediaClip(makeProject(), { id, trackId: track, start, duration: frames, mediaId: "m", kind: track.startsWith("a") ? "audio" : "video" });
  return { ...base, in: frameToUs(from, fps), out: frameToUs(from + frames, fps), ...extra };
}

function project(clips: Clip[]): Project {
  const p = makeProject();
  p.media.m = makeMedia("m", "video", 100_000_000);
  p.tracks.push({ ...makeTrack("v1"), targeted: true }, { ...makeTrack("v2"), targeted: true }, { ...makeTrack("a1", "audio"), targeted: true });
  return withClips(p, clips);
}

/** A|B on V1 at 60 and their linked audio a|b on A1 (B and b play from frame 300). */
function linkedPair(bFrom = 300): Project {
  return project([
    clip("A", "v1", 0, 60, 0, { linkGroup: "L1" }),
    clip("B", "v1", 60, 60, bFrom, { linkGroup: "L2" }),
    clip("a", "a1", 0, 60, 0, { linkGroup: "L1" }),
    clip("b", "a1", 60, 60, bFrom, { linkGroup: "L2" }),
  ]);
}

function store(p: Project): DocumentStore {
  let n = 0;
  return new DocumentStore(p, { session: createSessionStore(), validate: true, newId: () => `id${++n}` });
}

const ids = () => {
  let n = 0;
  return () => `t${++n}`;
};
const clipFades = (p: Project, id: string) => fadesOf(p.clips[id] as Clip);
const out = (p: Project, id: string) => (p.clips[id] as MediaClip).transitionOut;
const into = (p: Project, id: string) => (p.clips[id] as MediaClip).transitionIn;

describe("addTransition", () => {
  it("adds a centered 15-frame dissolve on both halves, with the linked audio's crossfade, in one undo step", () => {
    const p = linkedPair();
    const result = addTransition(p, { left: "A", right: "B" }, "crossDissolve", { linked: true, newId: ids() });
    expect(result?.repeated).toBe(false);
    const doc = store(p);
    doc.dispatch(result!.command);
    const next = doc.getState();
    expect(out(next, "A")).toEqual({ id: "t1", kind: "crossDissolve", before: 7, after: 8 });
    expect(into(next, "B")).toEqual(out(next, "A"));
    expect(out(next, "a")).toEqual({ id: "t2", kind: "crossDissolve", before: 7, after: 8 });
    expect(doc.history.getState().undoLabel).toBe("Add cross dissolve");
    doc.undo();
    expect(doc.getState()).toEqual(p);
  });

  it("gives the audio a crossfade for a dip, and keeps the frames of a cut that has one (kind only)", () => {
    const p = linkedPair();
    const doc = store(p);
    doc.dispatch(addTransition(p, { left: "A", right: "B" }, "dipToBlack", { linked: true, newId: ids() })!.command);
    expect(out(doc.getState(), "A")?.kind).toBe("dipToBlack");
    expect(out(doc.getState(), "a")?.kind).toBe("crossDissolve");
    doc.dispatch(updateTransition(doc.getState(), { left: "A", right: "B" }, { before: 3, after: 4 })!);
    doc.dispatch(addTransition(doc.getState(), { left: "A", right: "B" }, "dipToWhite", { newId: ids() })!.command);
    expect(out(doc.getState(), "A")).toMatchObject({ kind: "dipToWhite", before: 3, after: 4 });
  });

  it("repeats edge frames when the cut has no handle (and says so)", () => {
    const p = project([clip("A", "v1", 0, 60, 3000 - 60), clip("B", "v1", 60, 60, 0)]);
    const result = addTransition(p, { left: "A", right: "B" }, "crossDissolve", { newId: ids() });
    expect(result?.repeated).toBe(true);
    const doc = store(p);
    doc.dispatch(result!.command);
    expect(out(doc.getState(), "A")).toMatchObject({ before: 7, after: 8 });
  });

  it("refuses cuts that are not cuts: a gap, other tracks, locked tracks", () => {
    const p = project([clip("A", "v1", 0, 60, 0), clip("B", "v1", 61, 60, 300), clip("C", "v2", 61, 30, 0)]);
    expect(addTransition(p, { left: "A", right: "B" }, "crossDissolve", { newId: ids() })).toBeNull();
    expect(addTransition(p, { left: "A", right: "C" }, "crossDissolve", { newId: ids() })).toBeNull();
    const locked = linkedPair();
    locked.tracks[0] = { ...locked.tracks[0]!, locked: true };
    expect(addTransition(locked, { left: "A", right: "B" }, "crossDissolve", { newId: ids() })).toBeNull();
  });
});

describe("where the default transition goes", () => {
  it("at the selected edit point, else the cut nearest the playhead on targeted tracks", () => {
    const p = project([clip("A", "v1", 0, 60, 0), clip("B", "v1", 60, 60, 300), clip("C", "v1", 120, 60, 600), clip("x", "a1", 0, 100, 0), clip("y", "a1", 100, 50, 900)]);
    expect(defaultTransitionCut(p, { left: "A", right: "B" }, 500)).toEqual({ left: "A", right: "B" });
    expect(defaultTransitionCut(p, null, 70)).toEqual({ left: "A", right: "B" });
    expect(defaultTransitionCut(p, null, 104)).toEqual({ left: "x", right: "y" });
    expect(defaultTransitionCut(p, null, 115)).toEqual({ left: "B", right: "C" });
    expect(clipCut(p, "B", 70)).toEqual({ left: "A", right: "B" });
    expect(clipCut(p, "B", 110)).toEqual({ left: "B", right: "C" });
    expect(cutNear(p, "v1", 63, 4)).toEqual({ left: "A", right: "B" });
    expect(cutNear(p, "v1", 90, 4)).toBeNull();
  });

  it("finds the linked cut at the same frame only", () => {
    const p = linkedPair();
    expect(linkedCuts(p, { left: "A", right: "B" }, true).map((cut) => cut.left.id)).toEqual(["A", "a"]);
    expect(linkedCuts(p, { left: "A", right: "B" }, false).map((cut) => cut.left.id)).toEqual(["A"]);
  });
});

describe("edits around a transition", () => {
  const withDissolve = (bFrom = 300) => {
    const p = linkedPair(bFrom);
    const doc = store(p);
    doc.dispatch(addTransition(p, { left: "A", right: "B" }, "crossDissolve", { linked: true, newId: ids() })!.command);
    return doc;
  };

  it("drags an edge symmetrically, or one side with Alt, stopping at the handle", () => {
    const doc = withDissolve(12);
    const p = doc.getState();
    expect(dragTransitionEdge(p, { left: "A", right: "B" }, "end", 2, false)).toEqual({ before: 9, after: 10, bound: null });
    expect(dragTransitionEdge(p, { left: "A", right: "B" }, "end", 2, true)).toEqual({ before: 7, after: 10, bound: null });
    // The side before the cut uses B's 12 frames of head: it stops there.
    expect(dragTransitionEdge(p, { left: "A", right: "B" }, "start", -6, true)).toEqual({ before: 12, after: 8, bound: "mediaStart" });
    // Shrinking keeps a frame.
    expect(dragTransitionEdge(p, { left: "A", right: "B" }, "end", -30, false)).toEqual({ before: 0, after: 1, bound: null });
  });

  it("a trim across the transition shortens it, then removes it when no handle remains", () => {
    const doc = withDissolve(12);
    // Ripple trim of B's in point 6 frames earlier: B's head goes from 12 to 6.
    doc.dispatch(trimEdge(doc.getState(), "B", "in", -6, { ripple: true, linked: false }).command!);
    expect(into(doc.getState(), "B")).toMatchObject({ before: 6, after: 8 });
    expect(out(doc.getState(), "A")).toMatchObject({ before: 6, after: 8 });
    // The ripple moved the audio's right clip on (its cut opened): its crossfade went.
    expect(out(doc.getState(), "a")).toBeUndefined();
    doc.dispatch(trimEdge(doc.getState(), "B", "in", -6, { ripple: true, linked: false }).command!);
    expect(into(doc.getState(), "B")).toBeUndefined();
    expect(out(doc.getState(), "A")).toBeUndefined();
    doc.undo();
    expect(out(doc.getState(), "A")).toMatchObject({ before: 6, after: 8 });
  });

  it("a roll moves the transition with the cut and shortens the side whose handle it takes", () => {
    const doc = withDissolve(12);
    doc.dispatch(rollEdit(doc.getState(), "A", "B", -6, { linked: true }).command!);
    expect(out(doc.getState(), "A")).toMatchObject({ before: 6, after: 8 });
    expect(out(doc.getState(), "a")).toMatchObject({ before: 6, after: 8 });
  });

  it("a regular trim that opens a gap, a ripple delete and a speed change keep the document valid", () => {
    const doc = withDissolve();
    doc.dispatch(trimEdge(doc.getState(), "A", "out", -10, { ripple: false, linked: false }).command!);
    expect(out(doc.getState(), "A")).toBeUndefined();
    expect(into(doc.getState(), "B")).toBeUndefined();
    expect(out(doc.getState(), "a")).toBeDefined();
    doc.dispatch(rippleDelete(doc.getState(), ["a"], { linked: false })!.command!);
    expect(into(doc.getState(), "b")).toBeUndefined();
    const sped = withDissolve();
    // Linked, the audio speeds up too and the ripple closes both cuts: the transitions stay.
    sped.dispatch(setSpeeds(sped.getState(), ["A"], 2, { link: true, ripple: true, linked: true }).command!);
    expect(out(sped.getState(), "A")).toMatchObject({ before: 7, after: 8 });
    expect(out(sped.getState(), "a")).toMatchObject({ before: 7, after: 8 });
    // Not linked, the audio blocks the ripple: a gap opens at the picture's cut and its transition goes.
    const alone = withDissolve();
    alone.dispatch(setSpeeds(alone.getState(), ["A"], 2, { link: true, ripple: true, linked: false }).command!);
    expect(out(alone.getState(), "A")).toBeUndefined();
  });

  it("removes the transition at a cut with its linked crossfade", () => {
    const doc = withDissolve();
    doc.dispatch(removeTransitions(doc.getState(), [{ left: "A", right: "B" }], { linked: true })!);
    expect(transitionAt(doc.getState(), { left: "A", right: "B" })).toBeNull();
    expect(transitionAt(doc.getState(), { left: "a", right: "b" })).toBeNull();
    expect(doc.history.getState().undoLabel).toBe("Delete transitions");
  });

  it("changes the kind of a picture's transition, never an audio crossfade's", () => {
    const doc = withDissolve();
    doc.dispatch(updateTransition(doc.getState(), { left: "A", right: "B" }, { kind: "dipToWhite" }, { linked: true })!);
    expect(out(doc.getState(), "A")?.kind).toBe("dipToWhite");
    expect(out(doc.getState(), "a")?.kind).toBe("crossDissolve" satisfies Transition["kind"]);
  });
});

describe("fades", () => {
  it("a handle drag sets one clip's fade, clamped so its two fades never overlap", () => {
    const p = linkedPair();
    const doc = store(p);
    doc.dispatch(dragFade(p, "A", "in", 20)!);
    expect(clipFades(doc.getState(), "A")).toEqual({ in: 20, out: 0 });
    expect(clipFades(doc.getState(), "a")).toEqual({ in: 0, out: 0 });
    doc.dispatch(dragFade(doc.getState(), "A", "out", 100)!);
    expect(clipFades(doc.getState(), "A")).toEqual({ in: 20, out: 40 });
    expect(doc.history.getState().undoLabel).toBe("Fade out");
    doc.undo();
    expect(clipFades(doc.getState(), "A")).toEqual({ in: 20, out: 0 });
  });

  it("the quick action fades the clips and their linked audio, and a second click removes it", () => {
    const p = linkedPair();
    expect(fadeTargets(p, ["A"]).sort()).toEqual(["A", "a"]);
    const doc = store(p);
    doc.dispatch(quickFade(p, ["A"], "in")!);
    expect(clipFades(doc.getState(), "A").in).toBe(15);
    expect(clipFades(doc.getState(), "a").in).toBe(15);
    doc.dispatch(quickFade(doc.getState(), ["A"], "in")!);
    expect(clipFades(doc.getState(), "a").in).toBe(0);
    expect(doc.history.getState().undoLabel).toBe("Remove fade in");
    doc.dispatch(presetFade(doc.getState(), ["B"], "out", 1)!);
    expect(clipFades(doc.getState(), "B").out).toBe(30);
  });
});
