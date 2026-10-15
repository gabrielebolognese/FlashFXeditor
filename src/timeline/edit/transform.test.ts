import { describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeSolidClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { Clip, MediaClip, Project, SolidClip, Transform } from "../../core/document/types.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { applyToPoint, mutableIdentity } from "../../render/mat3.js";
import { writeModel } from "../../render/compositor/Compositor.js";
import {
  centerTransform,
  fillTransform,
  fitTransform,
  flipTransform,
  IDENTITY_TRANSFORM,
  isLayerClip,
  layerContent,
  layerCorners,
  layerPoint,
  normalizeTransform,
  nudgeLayers,
  resetTransform,
  setTransforms,
  type ContentBox,
} from "./transform.js";

const FRAME = { width: 1080, height: 1920 };
const t = (fields: Partial<Transform> = {}): Transform => ({ ...IDENTITY_TRANSFORM, ...fields, anchor: { ...IDENTITY_TRANSFORM.anchor, ...fields.anchor } });

function project(clips: Clip[] = []): Project {
  const p = makeProject();
  p.media.m = { ...makeMedia("m", "video"), width: 1920, height: 1080 };
  p.media.r = { ...makeMedia("r", "video"), width: 1920, height: 1080, rotation: 90 };
  p.tracks.push(makeTrack("v1"), makeTrack("v2"), makeTrack("a1", "audio"));
  return withClips(p, clips);
}

function video(id: string, fields: Partial<MediaClip> = {}): MediaClip {
  return { ...makeMediaClip(makeProject(), { id, trackId: "v1", start: 0, duration: 30, mediaId: "m" }), ...fields };
}

function store(p: Project): DocumentStore {
  return new DocumentStore(p, { session: createSessionStore(), validate: true });
}

const box = (width: number, height: number): ContentBox => ({ width, height, left: 0, top: 0, right: width, bottom: height });

describe("layer geometry (spec §5.2 Transform, §7.3)", () => {
  it("gives the content box: shown size after rotation metadata, the crop in content px", () => {
    const p = project([video("a", { crop: { left: 0.25, top: 0, right: 0.25, bottom: 0.5 } }), video("b", { mediaId: "r", trackId: "v2" })]);
    expect(layerContent(p, p.clips.a as Clip)).toEqual({ width: 1920, height: 1080, left: 480, top: 0, right: 1440, bottom: 540 });
    expect(layerContent(p, p.clips.b as Clip)).toMatchObject({ width: 1080, height: 1920 });
  });

  it("has no content box for audio, text, cropped-away media and shapes the compositor cannot draw", () => {
    const p = project([video("a", { crop: { left: 0.6, top: 0, right: 0.5, bottom: 0 } }), makeSolidClip({ id: "s", trackId: "v2", start: 0, duration: 10 })]);
    expect(layerContent(p, p.clips.a as Clip)).toBeNull();
    expect(layerContent(p, p.clips.s as Clip)).toEqual(box(100, 100));
    expect(layerContent(p, { ...(p.clips.s as Clip), shape: "ellipse" } as Clip)).toBeNull();
    expect(isLayerClip(video("x", { kind: "audio" }))).toBe(false);
  });

  it("maps content points like the compositor's model matrix", () => {
    const cases: Transform[] = [t(), t({ x: 40, y: -12, scale: 0.5, scaleY: 2, rotation: 33, anchor: { x: 0.2, y: 0.9 } }), t({ rotation: 90, scale: 1.5 })];
    for (const transform of cases) {
      const m = writeModel(mutableIdentity(), transform, 300, 200, FRAME.width, FRAME.height);
      for (const [qx, qy] of [
        [0, 0],
        [300, 0],
        [120, 170],
      ] as const) {
        const expected = applyToPoint(m, qx, qy);
        const actual = layerPoint(transform, { width: 300, height: 200 }, FRAME, qx, qy);
        expect(actual.x).toBeCloseTo(expected.x, 9);
        expect(actual.y).toBeCloseTo(expected.y, 9);
      }
    }
  });

  it("puts the anchor at the frame center plus the position", () => {
    const corners = layerCorners(t({ x: 10, y: 20, anchor: { x: 0, y: 0 } }), box(100, 50), FRAME);
    expect(corners[0]).toEqual({ x: 550, y: 980 });
    expect(corners[2]).toEqual({ x: 650, y: 1030 });
  });
});

describe("transform commands (spec P2, §7.3)", () => {
  it("writes a whole gesture as one undo step that affects only the composite", () => {
    const p = project([video("a"), video("b", { trackId: "v2" })]);
    const s = store(p);
    const command = setTransforms(
      p,
      new Map([
        ["a", t({ x: 10 })],
        ["b", t({ y: -5, scale: 2, scaleY: 2 })],
      ]),
      { label: "Move layers" },
    );
    expect(command?.id).toBe("clip.transform");
    expect(command?.affects).toEqual(["composite"]);
    s.dispatch(command!);
    const b = s.getState().clips.b as MediaClip;
    expect((s.getState().clips.a as MediaClip).transform.x).toBe(10);
    // scaleY equal to scale is not stored.
    expect(b.transform).toEqual(t({ y: -5, scale: 2 }));
    expect("scaleY" in b.transform).toBe(false);
    expect(s.history.getState().undoLabel).toBe("Move layers");
    s.undo();
    expect(s.getState()).toEqual(p);
    expect(s.history.getState().canUndo).toBe(false);
  });

  it("skips unchanged, locked, missing and non-layer clips; null when nothing changes", () => {
    const p = project([video("a"), video("b", { trackId: "v2" }), video("au", { trackId: "a1", kind: "audio" })]);
    p.tracks[1]!.locked = true;
    expect(setTransforms(p, new Map([["a", t()]]), { label: "x" })).toBeNull();
    expect(setTransforms(p, new Map([["b", t({ x: 5 })]]), { label: "x" })).toBeNull();
    expect(setTransforms(p, new Map([["zz", t({ x: 5 })]]), { label: "x" })).toBeNull();
    expect(setTransforms(p, new Map([["au", t({ x: 5 })]]), { label: "x" })).toBeNull();
    expect(setTransforms(p, new Map([["a", t({ x: Number.NaN })]]), { label: "x" })).toBeNull();
  });

  it("coalesces arrow nudges into one undo step", () => {
    let now = 0;
    const p = project([video("a"), video("b", { trackId: "v2" })]);
    const s = new DocumentStore(p, { session: createSessionStore(), validate: true, now: () => now });
    for (let i = 0; i < 5; i++) {
      s.dispatch(nudgeLayers(s.getState(), ["a", "b"], 1, 0)!);
      now += 40;
    }
    s.dispatch(nudgeLayers(s.getState(), ["a"], 0, -10)!);
    expect((s.getState().clips.a as MediaClip).transform).toMatchObject({ x: 5, y: -10 });
    expect((s.getState().clips.b as MediaClip).transform).toMatchObject({ x: 5, y: 0 });
    // The merged step keeps the label of its first nudge.
    expect(s.history.getState().undoLabel).toBe("Nudge layers");
    s.undo();
    expect(s.getState()).toEqual(p);
    // A nudge after the window is a new step.
    now += 1000;
    s.dispatch(nudgeLayers(s.getState(), ["a"], 1, 0)!);
    now += 1000;
    s.dispatch(nudgeLayers(s.getState(), ["a"], 1, 0)!);
    s.undo();
    expect((s.getState().clips.a as MediaClip).transform.x).toBe(1);
  });
});

describe("one-click transforms (spec §7.2, §11)", () => {
  it("Fit contains the visible box in the frame, Fill covers it, both centered", () => {
    const content = box(1920, 1080);
    const fit = fitTransform(t({ x: 300, y: 300, scaleY: 3 }), content, FRAME);
    expect(fit.scale).toBeCloseTo(1080 / 1920, 12);
    expect(fit.scaleY).toBeUndefined();
    expect(fit.x).toBeCloseTo(0, 9);
    expect(fit.y).toBeCloseTo(0, 9);
    expect(fillTransform(t(), content, FRAME).scale).toBeCloseTo(1920 / 1080, 12);
    // Turned a quarter: the 1920 px side runs down the frame.
    expect(fitTransform(t({ rotation: 90 }), content, FRAME).scale).toBeCloseTo(1, 12);
  });

  it("Center puts the visible (cropped) box's center on the frame center", () => {
    const content: ContentBox = { width: 200, height: 100, left: 100, top: 0, right: 200, bottom: 100 };
    const centered = centerTransform(t({ x: 77, y: 3, rotation: 90, scale: 2 }), content, FRAME);
    const center = layerPoint(centered, content, FRAME, 150, 50);
    expect(center.x).toBeCloseTo(540, 9);
    expect(center.y).toBeCloseTo(960, 9);
  });

  it("Flip toggles one axis; Reset gives media their Fit and others the identity", () => {
    expect(flipTransform(t(), "h")).toMatchObject({ flipH: true, flipV: false });
    expect(flipTransform(t({ flipV: true }), "v")).toMatchObject({ flipH: false, flipV: false });
    const p = project([video("a", { transform: t({ x: 5, rotation: 30, flipH: true }) }), makeSolidClip({ id: "s", trackId: "v2", start: 0, duration: 5 })]);
    expect(resetTransform(p, p.clips.a as MediaClip)).toEqual(t({ scale: 1080 / 1920 }));
    expect(resetTransform(p, p.clips.s as SolidClip)).toEqual(IDENTITY_TRANSFORM);
    expect(normalizeTransform(t({ scale: 2, scaleY: 1 }))).toEqual(t({ scale: 2, scaleY: 1 }));
  });
});
