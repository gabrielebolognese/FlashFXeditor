import { describe, expect, it, vi } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeSolidClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { Clip, MediaClip, Project, SolidClip, Transform } from "../../core/document/types.js";
import { createStore } from "../../core/store/createStore.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { layerPoint } from "../../timeline/edit/transform.js";
import { NO_LIVE_EDIT, type LiveEdit } from "../../app/liveEdit.js";
import { layerBinding } from "./bindings.js";
import { ANCHOR_X, cropProp, OPACITY, POSITION_X, scaleProp } from "./layerProps.js";

function project(): Project {
  const p = makeProject();
  p.media.m = { ...makeMedia("m"), width: 1920, height: 1080 };
  p.tracks.push(makeTrack("v1"), makeTrack("v2"), makeTrack("v3"), makeTrack("a1", "audio"));
  const clip = (id: string, trackId: string, opacity: number): MediaClip => ({ ...makeMediaClip(p, { id, trackId, start: 0, duration: 30, mediaId: "m" }), opacity });
  const clips: Clip[] = [clip("a", "v1", 1), clip("b", "v2", 0.5), clip("c", "v3", 0.25), { ...clip("x", "a1", 1), kind: "audio" }];
  return withClips(p, clips);
}

function setup(p = project()) {
  let time = 0;
  const document = new DocumentStore(p, { session: createSessionStore(), validate: true, now: () => time });
  const live = createStore<LiveEdit>(NO_LIVE_EDIT);
  return {
    document,
    live,
    deps: { document, live },
    advance(ms: number) {
      time += ms;
    },
    clip: (id: string) => document.getState().clips[id] as MediaClip,
  };
}

describe("layer bindings (spec §11 fields, P2)", () => {
  it("shows -- for different opacities; a typed value applies to all three in one undo step", () => {
    const { deps, document, clip } = setup();
    const opacity = layerBinding(deps, OPACITY, ["a", "b", "c", "x"]);
    expect(opacity.read()).toBeNull();
    opacity.set(40);
    expect(["a", "b", "c"].map((id) => clip(id).opacity)).toEqual([0.4, 0.4, 0.4]);
    expect(clip("x").opacity).toBe(1);
    expect(opacity.read()).toBe(40);
    expect(document.history.getState().undoLabel).toBe("Change opacity");
    document.undo();
    expect(["a", "b", "c"].map((id) => clip(id).opacity)).toEqual([1, 0.5, 0.25]);
  });

  it("a scrub writes live values only (the document is untouched), then one command on release", () => {
    const { deps, document, live, clip } = setup();
    const x = layerBinding(deps, POSITION_X, ["a"]);
    const changed = vi.fn();
    document.subscribe(changed);
    const notified = vi.fn();
    const stop = x.subscribe(notified);
    x.change(12, "scrub");
    x.change(30.5, "scrub");
    expect(live.getState().transforms?.get("a")?.x).toBe(30.5);
    expect(x.read()).toBe(30.5);
    expect(clip("a").transform.x).toBe(0);
    expect(changed).not.toHaveBeenCalled();
    expect(notified).toHaveBeenCalledTimes(2);
    x.change(30.5, "commit");
    expect(clip("a").transform.x).toBe(30.5);
    expect(live.getState()).toBe(NO_LIVE_EDIT);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(document.history.getState().undoLabel).toBe("Change position");
    document.undo();
    expect(clip("a").transform.x).toBe(0);
    // A cancelled scrub leaves no trace.
    x.change(50, "scrub");
    x.change(0, "cancel");
    expect(live.getState()).toBe(NO_LIVE_EDIT);
    expect(clip("a").transform.x).toBe(0);
    stop();
  });

  it("typing 100 sets exactly 100; arrow steps coalesce into one undo step and keep mixed differences", () => {
    const { deps, document, advance, clip } = setup();
    const x = layerBinding(deps, POSITION_X, ["a", "b"]);
    x.set(100);
    expect([clip("a").transform.x, clip("b").transform.x]).toEqual([100, 100]);
    document.dispatch({ id: "test", label: "Offset b", affects: ["composite"], run: (draft) => void ((draft.clips.b as MediaClip).transform.x = 90) });
    expect(x.read()).toBeNull();
    for (let i = 0; i < 5; i += 1) {
      advance(100);
      x.change(1, "step");
    }
    expect([clip("a").transform.x, clip("b").transform.x]).toEqual([105, 95]);
    document.undo();
    expect([clip("a").transform.x, clip("b").transform.x]).toEqual([100, 90]);
  });

  it("clamps and rounds (opacity 0..100, scale at least 1%), and never writes locked clips", () => {
    const p = project();
    (p.tracks[1] as { locked: boolean }).locked = true;
    const { deps, clip } = setup(p);
    const opacity = layerBinding(deps, OPACITY, ["a", "b"]);
    opacity.change(500, "step");
    expect([clip("a").opacity, clip("b").opacity]).toEqual([1, 0.5]);
    opacity.set(12.345);
    expect(clip("a").opacity).toBeCloseTo(0.123, 12);
    const scale = layerBinding(deps, scaleProp("x", true), ["a"]);
    scale.set(0);
    expect(clip("a").transform.scale).toBe(0.01);
  });

  it("the locked scale pair keeps the aspect; unlocked sets one axis", () => {
    const solid: SolidClip = { ...makeSolidClip({ id: "s", trackId: "v1", start: 0, duration: 10 }) };
    solid.transform = { ...solid.transform, scale: 2, scaleY: 1 };
    const p = withClips(project(), []);
    p.clips = { s: solid };
    for (const track of p.tracks) track.clipIds = track.id === "v1" ? ["s"] : [];
    const { deps, document } = setup(p);
    const t = () => (document.getState().clips.s as SolidClip).transform;
    layerBinding(deps, scaleProp("x", true), ["s"]).set(300);
    expect([t().scale, t().scaleY]).toEqual([3, 1.5]);
    layerBinding(deps, scaleProp("y", false), ["s"]).set(300);
    expect([t().scale, t().scaleY]).toEqual([3, undefined]);
    layerBinding(deps, scaleProp("y", true), ["s"]).set(150);
    expect([t().scale, t().scaleY]).toEqual([1.5, undefined]);
  });

  it("the anchor field moves the anchor and keeps the picture in place", () => {
    const { deps, clip } = setup();
    const before: Transform = clip("a").transform;
    layerBinding(deps, ANCHOR_X, ["a"]).set(0);
    const after = clip("a").transform;
    expect(after.anchor).toEqual({ x: 0, y: 0.5 });
    const frame = { width: 1080, height: 1920 };
    const box = { width: 1920, height: 1080 };
    expect(layerPoint(after, box, frame, 0, 0).x).toBeCloseTo(layerPoint(before, box, frame, 0, 0).x, 9);
    expect(after.x).toBe(-960);
  });

  it("binds a crop edge in media px or %, skipping clips with no crop (Batch 26)", () => {
    const p = project();
    p.clips.s = { ...makeSolidClip({ id: "s", trackId: "v1", start: 40, duration: 10 }) } as SolidClip;
    p.tracks.find((track) => track.id === "v1")?.clipIds.push("s");
    const { deps, document, clip } = setup(p);
    const px = layerBinding(deps, cropProp("left", "px", false), ["a", "s"]);
    const percent = layerBinding(deps, cropProp("left", "%", false), ["a", "s"]);
    expect(px.read()).toBe(0);
    px.set(480);
    expect(clip("a").crop).toEqual({ left: 0.25, top: 0, right: 0, bottom: 0 });
    expect(percent.read()).toBe(25);
    expect(document.history.getState().undoLabel).toBe("Change crop");
    // Past the opposite edge: one media px stays visible.
    layerBinding(deps, cropProp("right", "%", false), ["a"]).set(100);
    expect((1 - clip("a").crop.left - clip("a").crop.right) * 1920).toBeCloseTo(1, 9);
  });

  it("keeps the crop's aspect with the lock: the other axis follows around its center", () => {
    const { deps, clip } = setup();
    layerBinding(deps, cropProp("left", "px", true), ["a"]).set(480);
    expect(clip("a").crop.left).toBeCloseTo(0.25, 9);
    expect(clip("a").crop.top).toBeCloseTo(0.125, 9);
    expect(clip("a").crop.bottom).toBeCloseTo(0.125, 9);
  });

  it("scrubs a crop live (fields and preview read it), then one step on release; mixed values show --", () => {
    const { deps, document, live, clip } = setup();
    const left = layerBinding(deps, cropProp("left", "px", false), ["a", "b"]);
    left.change(100, "scrub");
    expect(live.getState().crops?.get("a")?.left).toBeCloseTo(100 / 1920, 9);
    expect(left.read()).toBe(100);
    expect(clip("a").crop.left).toBe(0);
    left.change(120, "commit");
    expect(live.getState()).toBe(NO_LIVE_EDIT);
    expect(clip("a").crop.left).toBeCloseTo(120 / 1920, 9);
    expect(clip("b").crop.left).toBeCloseTo(120 / 1920, 9);
    document.undo();
    expect(clip("a").crop.left).toBe(0);
    // A crop handle drag on the canvas writes live crops: the field follows it.
    live.set({ ...NO_LIVE_EDIT, crops: new Map([["a", { left: 0.5, top: 0, right: 0, bottom: 0 }]]) });
    expect(left.read()).toBeNull();
    expect(layerBinding(deps, cropProp("left", "px", false), ["a"]).read()).toBe(960);
  });
});
