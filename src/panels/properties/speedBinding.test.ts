import { describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeTrack, withClips } from "../../core/document/fixtures.js";
import { frameToUs } from "../../core/document/time.js";
import type { ClipId, MediaClip, Project } from "../../core/document/types.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { setSpeeds } from "../../timeline/edit/speed.js";
import { speedBinding } from "./speedBinding.js";

const fps = makeProject().settings.fps;

function setup() {
  let p: Project = makeProject();
  p.media.m = makeMedia("m", "video", 60_000_000);
  p.tracks.push(makeTrack("v1"), makeTrack("v2"), makeTrack("v3"));
  const clip = (id: string, trackId: string, extra: Partial<MediaClip> = {}) => ({ ...makeMediaClip(p, { id, trackId, start: 0, duration: 300, mediaId: "m" }), ...extra });
  p = withClips(p, [clip("a", "v1"), clip("b", "v2"), clip("c", "v3", { speed: 2, duration: 150 }), clip("f", "v3", { start: 200, duration: 60, speed: 0, out: frameToUs(1, fps) })]);
  const doc = new DocumentStore(p, { session: createSessionStore(), validate: true });
  const applied: (string | undefined)[] = [];
  const apply = (ids: readonly ClipId[], speed: number | ((clip: MediaClip) => number), coalesceKey?: string) => {
    applied.push(coalesceKey);
    const result = setSpeeds(doc.getState(), ids, speed, { link: true, ripple: true, linked: true });
    if (result.command) doc.dispatch(coalesceKey === undefined ? result.command : { ...result.command, coalesceKey });
  };
  return { doc, applied, binding: (ids: ClipId[]) => speedBinding({ document: doc, apply }, ids) };
}

const speedOf = (doc: DocumentStore, id: string) => (doc.getState().clips[id] as MediaClip).speed;

describe("speedBinding", () => {
  it("reads the shared speed in %, null for mixed values, 0 for a freeze frame", () => {
    const { binding } = setup();
    expect(binding(["a", "b"]).read()).toBe(100);
    expect(binding(["a", "c"]).read()).toBeNull();
    expect(binding(["f"]).read()).toBe(0);
  });

  it("a typed value sets every clip in one step; arrow steps add to each own speed and coalesce", () => {
    const { doc, binding, applied } = setup();
    const both = binding(["a", "c"]);
    let calls = 0;
    const stop = both.subscribe(() => calls++);
    both.change(10, "step");
    both.change(10, "step");
    expect([speedOf(doc, "a"), speedOf(doc, "c")]).toEqual([1.2, 2.2]);
    expect(applied).toEqual(["properties.speed", "properties.speed"]);
    expect(calls).toBeGreaterThan(0);
    doc.undo();
    expect([speedOf(doc, "a"), speedOf(doc, "c")]).toEqual([1, 2]);
    both.set(200);
    expect([speedOf(doc, "a"), speedOf(doc, "c")]).toEqual([2, 2]);
    expect(both.read()).toBe(200);
    stop();
  });

  it("a scrub changes nothing until its release, which applies once; a cancel applies nothing", () => {
    const { doc, binding, applied } = setup();
    const field = binding(["a"]);
    field.change(30, "scrub");
    field.change(50, "scrub");
    expect(speedOf(doc, "a")).toBe(1);
    expect(doc.history.getState().canUndo).toBe(false);
    field.change(50, "cancel");
    expect(doc.history.getState().canUndo).toBe(false);
    field.change(50, "scrub");
    field.change(50, "commit");
    expect(speedOf(doc, "a")).toBe(1.5);
    expect(applied).toEqual([undefined]);
    expect(doc.history.getState().undoLabel).toBe("Change speed");
  });
});
