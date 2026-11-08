import { describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeTrack, withClips } from "../../core/document/fixtures.js";
import { frameToUs } from "../../core/document/time.js";
import type { Clip, MediaClip, Project } from "../../core/document/types.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { addTransition, transitionAt, updateTransition } from "./transitions.js";

const fps = makeProject().settings.fps;
const cut = { left: "A", right: "B" };

function clip(id: string, track: string, start: number, frames: number, from: number, extra: Partial<MediaClip> = {}): MediaClip {
  const base = makeMediaClip(makeProject(), { id, trackId: track, start, duration: frames, mediaId: "m", kind: track.startsWith("a") ? "audio" : "video" });
  return { ...base, in: frameToUs(from, fps), out: frameToUs(from + frames, fps), ...extra };
}

function project(clips: Clip[]): Project {
  const p = makeProject();
  p.media.m = makeMedia("m", "video", 100_000_000);
  p.tracks.push({ ...makeTrack("v1"), targeted: true }, { ...makeTrack("a1", "audio"), targeted: true });
  return withClips(p, clips);
}

const linkedPair = () =>
  project([clip("A", "v1", 0, 60, 0, { linkGroup: "L1" }), clip("B", "v1", 60, 60, 300, { linkGroup: "L2" }), clip("a", "a1", 0, 60, 0, { linkGroup: "L1" }), clip("b", "a1", 60, 60, 300, { linkGroup: "L2" })]);

function store(p: Project): DocumentStore {
  let n = 0;
  return new DocumentStore(p, { session: createSessionStore(), validate: true, newId: () => `id${++n}` });
}

const ids = () => {
  let n = 0;
  return () => `n${++n}`;
};

describe("transitions v2 edits (Batch 71)", () => {
  it("adds a push with its defaults and edits direction and softness, one undo step each", () => {
    const doc = store(linkedPair());
    doc.dispatch(addTransition(doc.getState(), cut, "push", { newId: ids() })!.command);
    expect(transitionAt(doc.getState(), cut)).toMatchObject({ kind: "push", direction: "left", ease: "easeInOut" });
    doc.dispatch(updateTransition(doc.getState(), cut, { direction: "down" })!);
    expect((doc.getState().clips.A as MediaClip).transitionOut).toMatchObject({ direction: "down" });
    expect((doc.getState().clips.B as MediaClip).transitionIn).toMatchObject({ direction: "down" });
    doc.undo();
    expect(transitionAt(doc.getState(), cut)?.direction).toBe("left");
    doc.dispatch(updateTransition(doc.getState(), cut, { kind: "wipe" })!);
    doc.dispatch(updateTransition(doc.getState(), cut, { softness: 0.6, angle: 45 })!);
    expect(transitionAt(doc.getState(), cut)).toMatchObject({ kind: "wipe", softness: 0.6, angle: 45 });
    doc.undo();
    expect(transitionAt(doc.getState(), cut)).toMatchObject({ kind: "wipe", softness: 0.1, angle: 0 });
  });

  it("clears the ease with null (the linear mix) and keeps audio crossfades plain", () => {
    const doc = store(linkedPair());
    doc.dispatch(addTransition(doc.getState(), cut, "slide", { linked: true, newId: ids() })!.command);
    const audio = doc.getState().clips.a as MediaClip;
    expect(audio.transitionOut).toMatchObject({ kind: "crossDissolve" });
    expect(audio.transitionOut).not.toHaveProperty("ease");
    doc.dispatch(updateTransition(doc.getState(), cut, { ease: null }, { linked: true })!);
    expect(transitionAt(doc.getState(), cut)?.ease).toBeUndefined();
    expect((doc.getState().clips.a as MediaClip).transitionOut).not.toHaveProperty("direction");
  });
});
