// Masks in the compositor (spec §21.18, Batch 73): a masked clip becomes a group carrying its mask frame
// (the packed block over its content box), kept at one version while static; a masked matte clip keys
// through its masks; live gesture masks replace the clip's.
import { describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeSolidClip, makeTextClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import { setKey } from "../../core/document/keyframes.js";
import { masksCoverage, maskStackCoverage } from "../../core/masks/maskCoverage.js";
import type { Clip, Mask, MediaClip, Project } from "../../core/document/types.js";
import { Compositor } from "./Compositor.js";
import { applyToPoint } from "../mat3.js";
import type { CompositeLayer, GroupCompositeLayer } from "./drawList.js";

function project(): Project {
  const doc = makeProject();
  doc.tracks = [makeTrack("v1", "video"), makeTrack("v2", "video"), makeTrack("a1", "audio")];
  doc.media.m1 = { ...makeMedia("m1", "video"), width: 1080, height: 1920 };
  return doc;
}

const ellipse = (fields: Partial<Mask> = {}): Mask => ({ id: "e", shape: { kind: "ellipse", x: 100, y: 100, w: 400, h: 300 }, mode: "add", feather: 40, expansion: 0, opacity: 1, inverted: false, ...fields });
const solid = (id: string, trackId: string, fields: Partial<Clip> = {}): Clip => ({ ...makeSolidClip({ id, trackId, start: 0, duration: 30 }), ...fields }) as Clip;
const group = (layer: CompositeLayer | undefined) => layer as GroupCompositeLayer;

describe("Compositor masks (Batch 73)", () => {
  it("a masked clip is a group with its mask frame over its content box", () => {
    let doc = project();
    doc = withClips(doc, [solid("bg", "v1"), solid("s", "v2", { masks: [ellipse()] })]);
    const layers = new Compositor().evaluate(doc, 5).layers;
    expect(layers.map((l) => l.kind)).toEqual(["solid", "group"]);
    const g = group(layers[1]);
    expect(g.blend).toBe("normal");
    const mask = g.mask;
    expect(mask).not.toBeNull();
    if (!mask) return;
    const s = doc.clips.s as Clip & { size: { w: number; h: number } };
    expect([mask.width, mask.height]).toEqual([s.size.w, s.size.h]);
    expect(mask.clipId).toBe("s");
    // The block is the core's: the same coverage the CPU twin computes.
    const block = mask.data.subarray(0, mask.length);
    expect(maskStackCoverage(block, 300, 250)).toBeCloseTo(masksCoverage([ellipse()], mask.width, mask.height, 300, 250), 6);
    // The model takes content px to project px: the content box's corners land on the clip's.
    const origin = applyToPoint(mask.model, 0, 0);
    expect(Number.isFinite(origin.x) && Number.isFinite(origin.y)).toBe(true);
  });

  it("static masks keep their version across frames; keyed ones get a new one when they change", () => {
    let doc = project();
    doc = withClips(doc, [solid("s", "v1", { masks: [ellipse()] })]);
    const compositor = new Compositor();
    const v1 = group(compositor.evaluate(doc, 1).layers[0]).mask?.version;
    const v2 = group(compositor.evaluate(doc, 2).layers[0]).mask?.version;
    expect(v1).toBeGreaterThan(0);
    expect(v2).toBe(v1);
    const keyed = withClips(doc, [solid("s", "v1", { masks: [ellipse()], keyframes: { "masks.e.w": setKey(setKey([], 0, 100), 20, 400) } })]);
    const a = group(compositor.evaluate(keyed, 3).layers[0]).mask?.version;
    const b = group(compositor.evaluate(keyed, 4).layers[0]).mask?.version;
    expect(a).not.toBe(v1);
    expect(b).not.toBe(a);
  });

  it("a rectangle animating its width reveals from the left", () => {
    let doc = project();
    const rect: Mask = { id: "r", shape: { kind: "rect", x: 0, y: 0, w: 0, h: 1920 }, mode: "add", feather: 0, expansion: 0, opacity: 1, inverted: false };
    doc = withClips(doc, [solid("s", "v1", { masks: [rect], keyframes: { "masks.r.w": setKey(setKey([], 0, 0), 20, 1080) } })]);
    const compositor = new Compositor();
    const at = (frame: number, x: number) => {
      const mask = group(compositor.evaluate(doc, frame).layers[0]).mask;
      return mask ? maskStackCoverage(mask.data.subarray(0, mask.length), x, 500) : -1;
    };
    expect(at(10, 200)).toBe(1);
    expect(at(10, 800)).toBe(0);
    expect(at(20, 800)).toBe(1);
  });

  it("a video's and a text's content boxes are their shown size and layout box", () => {
    let doc = project();
    const video: MediaClip = { ...makeMediaClip(doc, { id: "v", trackId: "v1", start: 0, duration: 30, mediaId: "m1" }), masks: [ellipse()] };
    const text = { ...makeTextClip({ id: "t", trackId: "v2", start: 0, duration: 30, value: "Hello" }), masks: [ellipse()] };
    doc = withClips(doc, [video, text]);
    const layers = new Compositor().evaluate(doc, 5).layers;
    const v = group(layers[0]).mask;
    expect([v?.width, v?.height]).toEqual([1080, 1920]);
    const t = group(layers[1]).mask;
    expect((t?.width ?? 0) > 0 && (t?.height ?? 0) > 0).toBe(true);
  });

  it("a masked matte clip keys through its masks (the Batch 72 follow-up)", () => {
    let doc = project();
    doc = withClips(doc, [solid("v", "v1", { matte: { clipId: "m", mode: "alpha" } }), solid("m", "v2", { matteOnly: true, masks: [ellipse()] })]);
    const g = group(new Compositor().evaluate(doc, 5).layers[0]);
    expect(g.matte?.mode).toBe("alpha");
    expect(g.matte?.mask?.clipId).toBe("m");
    expect(g.mask).toBeNull();
  });

  it("live gesture masks replace the clip's; none and an empty list draw no group", () => {
    let doc = project();
    doc = withClips(doc, [solid("s", "v1"), solid("u", "v2", { masks: [] })]);
    const compositor = new Compositor();
    expect(compositor.evaluate(doc, 5).layers.map((l) => l.kind)).toEqual(["solid", "solid"]);
    const live = new Map([["s", [ellipse({ feather: 3 })]]]);
    const layers = compositor.evaluate(doc, 5, null, null, null, null, null, null, null, null, live).layers;
    const mask = group(layers[0]).mask;
    expect(mask?.data[(1 + 0) * 4 + 9]).toBe(3);
  });
});
