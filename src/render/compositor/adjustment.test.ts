// Adjustment clips in the compositor (spec §21.20, Batch 76): an "adjust" layer over the layers below it in
// the stack, during the clip's range only, with its effects, its mask in project px and its opacity.
import { describe, expect, it } from "vitest";
import { makeProject, makeSolidClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import { newEffect } from "../../core/effects/effectParams.js";
import { EFFECT_BLOCK } from "../../core/effects/effectEval.js";
import type { AdjustmentClip, Clip, Effect, Project, SolidClip } from "../../core/document/types.js";
import { Compositor } from "./Compositor.js";
import type { AdjustLayer, CompositeLayer, DrawList } from "./drawList.js";
import { DrawListSnapshot } from "./DrawListSnapshot.js";

function project(): Project {
  const doc = makeProject();
  doc.tracks = [makeTrack("v1", "video"), makeTrack("v2", "video"), makeTrack("v3", "video"), makeTrack("a1", "audio")];
  return doc;
}

const solid = (id: string, trackId: string, z = 0): SolidClip => {
  const base = makeSolidClip({ id, trackId, start: 0, duration: 60 });
  return { ...base, transform: { ...base.transform, z } };
};
const adjustment = (fields: Partial<AdjustmentClip> = {}, effects: Effect[] = [{ ...newEffect("colorAdjust", "bw"), params: { ...newEffect("colorAdjust", "bw").params, saturation: -100 } }]): AdjustmentClip => ({
  id: "adj",
  trackId: "v2",
  kind: "adjustment",
  name: "Adjustment",
  start: 10,
  duration: 20,
  enabled: true,
  effects,
  opacity: 1,
  ...fields,
});
const kinds = (layers: readonly CompositeLayer[]) => layers.map((l) => ("clipId" in l ? `${l.kind}:${l.clipId}` : l.kind));

describe("Compositor adjustment clips (Batch 76)", () => {
  it("adds an adjust layer above the layers below it, during its range only", () => {
    const doc = withClips(project(), [solid("bg", "v1"), adjustment(), solid("top", "v3")]);
    const compositor = new Compositor();
    expect(kinds(compositor.evaluate(doc, 5).layers)).toEqual(["solid", "solid"]);
    const layers = compositor.evaluate(doc, 10).layers;
    expect(layers.map((l) => l.kind)).toEqual(["solid", "adjust", "solid"]);
    const adjust = layers[1] as AdjustLayer;
    expect(adjust.clipId).toBe("adj");
    expect(adjust.opacity).toBe(1);
    expect(adjust.mask).toBeNull();
    expect(adjust.effects.length).toBe(EFFECT_BLOCK);
    // Over the whole frame, in project px.
    expect([adjust.effects.width, adjust.effects.height]).toEqual([doc.settings.width, doc.settings.height]);
    expect(adjust.effects.model).toEqual([1, 0, 0, 1, 0, 0]);
    expect(compositor.evaluate(doc, 29).layers.map((l) => l.kind)).toContain("adjust");
    expect(compositor.evaluate(doc, 30).layers.map((l) => l.kind)).not.toContain("adjust");
  });

  it("draws nothing without an enabled effect, when disabled or on a hidden track", () => {
    const compositor = new Compositor();
    const at = (clip: Clip, change: (doc: Project) => Project = (d) => d) => compositor.evaluate(change(withClips(project(), [solid("bg", "v1"), clip])), 15).layers.map((l) => l.kind);
    expect(at(adjustment({}, []))).toEqual(["solid"]);
    expect(at(adjustment({}, [{ ...newEffect("invert", "i"), enabled: false }]))).toEqual(["solid"]);
    expect(at(adjustment({ enabled: false }))).toEqual(["solid"]);
    expect(at(adjustment(), (d) => ({ ...d, tracks: d.tracks.map((t) => (t.id === "v2" ? { ...t, hidden: true } : t)) }))).toEqual(["solid"]);
  });

  it("multiplies its opacity by its fades and keys, and keeps its mask in project px", () => {
    const compositor = new Compositor();
    const masked = adjustment({
      opacity: 0.8,
      fades: { in: 10, out: 0 },
      masks: [{ id: "m", shape: { kind: "ellipse", x: 100, y: 200, w: 400, h: 600 }, mode: "add", feather: 0, expansion: 0, opacity: 1, inverted: false }],
    });
    const doc = withClips(project(), [solid("bg", "v1"), masked]);
    const early = compositor.evaluate(doc, 12).layers[1] as AdjustLayer;
    expect(early.opacity).toBeGreaterThan(0);
    expect(early.opacity).toBeLessThan(0.8);
    const late = compositor.evaluate(doc, 25).layers[1] as AdjustLayer;
    expect(late.opacity).toBeCloseTo(0.8, 6);
    expect(late.mask?.clipId).toBe("adj");
    expect([late.mask?.width, late.mask?.height]).toEqual([doc.settings.width, doc.settings.height]);
    expect(late.mask?.model).toEqual([1, 0, 0, 1, 0, 0]);
    const keyed = withClips(project(), [solid("bg", "v1"), adjustment({ keyframes: { opacity: [{ frame: 0, value: 0, ease: "linear" }, { frame: 10, value: 1, ease: "linear" }] } })]);
    expect((compositor.evaluate(keyed, 15).layers[1] as AdjustLayer).opacity).toBeCloseTo(0.5, 6);
  });

  it("with depth sorting, sorts the layers between adjustments among themselves only", () => {
    const compositor = new Compositor();
    compositor.depthSort = true;
    const red = (id: string, trackId: string, z: number): SolidClip => ({ ...solid(id, trackId, z), fill: { r: 1, g: 0, b: 0, a: 1 } });
    const blue = (id: string, trackId: string, z: number): SolidClip => ({ ...solid(id, trackId, z), fill: { r: 0, g: 0, b: 1, a: 1 } });
    const names = (doc: Project) => compositor.evaluate(doc, 15).layers.map((l) => (l.kind === "solid" ? (l.color.r === 1 ? "near" : "far") : l.kind));
    // Far (z 900) on a track above near (z -500): sorted far first when nothing separates them.
    expect(names(withClips(project(), [red("near", "v1", -500), blue("far", "v2", 900), adjustment({ trackId: "v3" })]))).toEqual(["far", "near", "adjust"]);
    // An adjustment between them keeps each on its side.
    expect(names(withClips(project(), [red("near", "v1", -500), adjustment(), blue("far", "v3", 900)]))).toEqual(["near", "adjust", "far"]);
  });

  it("records the adjust layer in the draw list snapshot: a changed effect changes it", () => {
    const compositor = new Compositor();
    const snapshot = new DrawListSnapshot();
    const doc = withClips(project(), [solid("bg", "v1"), adjustment()]);
    expect(snapshot.update(compositor.evaluate(doc, 15) as unknown as DrawList)).toBe(true);
    expect(snapshot.update(compositor.evaluate(doc, 15) as unknown as DrawList)).toBe(false);
    const changed = withClips(project(), [solid("bg", "v1"), adjustment({}, [newEffect("invert", "i")])]);
    expect(snapshot.update(compositor.evaluate(changed, 15) as unknown as DrawList)).toBe(true);
  });
});
