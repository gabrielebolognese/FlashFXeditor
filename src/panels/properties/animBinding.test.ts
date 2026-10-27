import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { makeProject, makeTextClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { Project, TextClip } from "../../core/document/types.js";
import { createStore } from "../../core/store/createStore.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { approximateMeasurer, setTextMeasurer } from "../../render/text/layoutCache.js";
import { NO_LIVE_EDIT, type LiveEdit } from "../../app/liveEdit.js";
import { animBinding, shownStagger } from "./animBinding.js";

beforeAll(() => setTextMeasurer(approximateMeasurer));
afterAll(() => setTextMeasurer(null));

// 30 fps: one frame is 1/30 s.
function project(): Project {
  const p = makeProject();
  p.tracks.push(makeTrack("v1"), makeTrack("v2"), makeTrack("v3"));
  return withClips(p, [
    { ...makeTextClip({ id: "a", trackId: "v1", start: 0, duration: 90, value: "one two three" }), animIn: { id: "wordPop", duration: 15 } },
    { ...makeTextClip({ id: "b", trackId: "v2", start: 0, duration: 90, value: "four" }), animIn: { id: "fade", duration: 30 } },
    makeTextClip({ id: "c", trackId: "v3", start: 0, duration: 90 }),
  ]);
}

function setup() {
  const document = new DocumentStore(project(), { session: createSessionStore(), validate: true });
  const live = createStore<LiveEdit>(NO_LIVE_EDIT);
  const onCommit = vi.fn();
  return { document, live, onCommit, deps: { document, live, onCommit }, clip: (id: string) => document.getState().clips[id] as TextClip };
}

describe("animation bindings (spec §11 Animation section)", () => {
  it("reads durations in seconds of the clips that have the animation; a typed value sets them in whole frames", () => {
    const { deps, document, clip, onCommit } = setup();
    expect(animBinding(deps, ["a"], "animIn", "duration").read()).toBe(0.5);
    const both = animBinding(deps, ["a", "b", "c"], "animIn", "duration");
    expect(both.read()).toBeNull();
    both.set(0.41);
    expect([clip("a").animIn?.duration, clip("b").animIn?.duration, clip("c").animIn]).toEqual([12, 12, undefined]);
    expect(document.history.getState().undoLabel).toBe("Change in animation duration");
    expect(onCommit).toHaveBeenCalledTimes(1);
    // At least one frame, at most 10 s.
    both.set(0);
    expect(clip("a").animIn?.duration).toBe(1);
    both.set(99);
    expect(clip("a").animIn?.duration).toBe(300);
  });

  it("scrubs live without touching the document, then commits one step on release", () => {
    const { deps, document, live, clip } = setup();
    const duration = animBinding(deps, ["a", "b"], "animIn", "duration");
    duration.change(0.2, "scrub");
    expect(live.getState().anims?.get("a")?.animIn).toEqual({ id: "wordPop", duration: 21 });
    expect(live.getState().anims?.get("b")?.animIn).toEqual({ id: "fade", duration: 36 });
    expect(clip("a").animIn?.duration).toBe(15);
    expect(animBinding(deps, ["a"], "animIn", "duration").read()).toBe(0.7);
    const steps = document.history.getState().undoLabel;
    duration.change(0.2, "commit");
    expect(live.getState()).toBe(NO_LIVE_EDIT);
    expect([clip("a").animIn?.duration, clip("b").animIn?.duration]).toEqual([21, 36]);
    expect(document.history.getState().undoLabel).not.toBe(steps);
    duration.change(0.1, "scrub");
    duration.change(0, "cancel");
    expect(live.getState()).toBe(NO_LIVE_EDIT);
  });

  it("shows an automatic stagger as the delay it plays with, and steps a frame at a time", () => {
    const { deps, clip } = setup();
    // 3 words in 15 frames: 15 / 4.5 frames apart.
    expect(shownStagger(clip("a"), clip("a").animIn as NonNullable<TextClip["animIn"]>)).toBeCloseTo(15 / 4.5);
    const stagger = animBinding(deps, ["a"], "animIn", "stagger");
    expect(stagger.read()).toBe(0.11);
    stagger.change(1 / 30, "step");
    expect(clip("a").animIn?.stagger).toBe(4);
    stagger.change(-1, "step");
    expect(clip("a").animIn?.stagger).toBe(0);
    // A whole-text animation has no stagger.
    expect(shownStagger(clip("b"), clip("b").animIn as NonNullable<TextClip["animIn"]>)).toBe(0);
  });
});
