// Blend modes and track mattes in the compositor (spec §21.17, Batch 72): group layers, the matte's
// layers on their own slot, matte-only clips, the dominant side of a transition, 2.5D inside a group.
import { describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeSolidClip, makeTextClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import { frameToUs } from "../../core/document/time.js";
import type { Clip, MediaClip, MediaItem, Project } from "../../core/document/types.js";
import { Compositor } from "./Compositor.js";
import { MATTE_SLOT, plainLayers, type CompositeLayer, type GroupCompositeLayer, type MediaLayer } from "./drawList.js";
import { DrawListSnapshot } from "./DrawListSnapshot.js";

function project(tracks = ["v1", "v2", "v3"]): Project {
  const doc = makeProject();
  doc.tracks = [...tracks.map((id) => makeTrack(id, "video")), makeTrack("a1", "audio")];
  for (const item of [video("m1"), video("m2")]) doc.media[item.id] = item;
  return doc;
}

function video(id: string): MediaItem {
  return { ...makeMedia(id, "video"), width: 1080, height: 1920 };
}

function clip(doc: Project, fields: { id: string; trackId: string; start: number; duration: number; mediaId?: string } & Partial<MediaClip>): MediaClip {
  const { id, trackId, start, duration, mediaId = "m1", ...rest } = fields;
  return { ...makeMediaClip(doc, { id, trackId, start, duration, mediaId }), ...rest };
}

const solid = (id: string, trackId: string, fields: Partial<Clip> = {}): Clip => ({ ...makeSolidClip({ id, trackId, start: 0, duration: 30 }), ...fields }) as Clip;
const group = (layer: CompositeLayer | undefined) => layer as GroupCompositeLayer;
const clipIds = (layers: readonly CompositeLayer[]) => layers.map((l) => ("clipId" in l ? l.clipId : l.kind));

describe("Compositor blend modes and track mattes (Batch 72)", () => {
  it("draws a normal clip without a matte as before: no group", () => {
    let doc = project();
    doc = withClips(doc, [solid("bg", "v1"), solid("top", "v2", { blend: "normal" })]);
    const layers = new Compositor().evaluate(doc, 5).layers;
    expect(layers.map((l) => l.kind)).toEqual(["solid", "solid"]);
  });

  it("groups a clip with a blend mode, keeping its place in the stack", () => {
    let doc = project();
    doc = withClips(doc, [solid("bg", "v1"), solid("top", "v2", { blend: "multiply" }), solid("over", "v3")]);
    const layers = new Compositor().evaluate(doc, 5).layers;
    expect(layers.map((l) => l.kind)).toEqual(["solid", "group", "solid"]);
    const g = group(layers[1]);
    expect(g.blend).toBe("multiply");
    expect(g.clipId).toBe("top");
    expect(g.matte).toBeNull();
    expect(g.layers.map((l) => l.kind)).toEqual(["solid"]);
  });

  it("draws every layer of a text clip inside its group", () => {
    let doc = project();
    const text = { ...makeTextClip({ id: "t", trackId: "v2", start: 0, duration: 30, value: "Hi" }), blend: "screen" as const };
    doc = withClips(doc, [solid("bg", "v1"), text]);
    const g = group(new Compositor().evaluate(doc, 5).layers[1]);
    expect(g.kind).toBe("group");
    expect(g.layers.length).toBeGreaterThan(0);
    expect(g.layers.every((l) => l.kind === "text")).toBe(true);
  });

  it("evaluates the matte clip on its own texture slot; a matte-only clip is not drawn by itself", () => {
    let doc = project();
    doc = withClips(doc, [
      clip(doc, { id: "v", trackId: "v1", start: 0, duration: 30, matte: { clipId: "m", mode: "luma" } }),
      clip(doc, { id: "m", trackId: "v2", start: 0, duration: 30, mediaId: "m2", matteOnly: true }),
    ]);
    const layers = new Compositor().evaluate(doc, 5).layers;
    expect(layers).toHaveLength(1);
    const g = group(layers[0]);
    expect(g.blend).toBe("normal");
    expect(g.matte?.mode).toBe("luma");
    const matte = g.matte?.layers[0] as MediaLayer;
    expect(matte.clipId).toBe("m");
    expect(matte.trackId).toBe("v2" + MATTE_SLOT);
    expect(matte.timeUs).toBe(frameToUs(5, doc.settings.fps));
    expect((g.layers[0] as MediaLayer).trackId).toBe("v1");
  });

  it("draws a matte clip without matteOnly both as the matte and by itself", () => {
    let doc = project();
    doc = withClips(doc, [solid("v", "v1", { matte: { clipId: "m", mode: "alpha" } }), solid("m", "v2")]);
    const layers = new Compositor().evaluate(doc, 5).layers;
    expect(layers.map((l) => l.kind)).toEqual(["group", "solid"]);
    expect(group(layers[0]).matte?.layers).toHaveLength(1);
  });

  it("ignores a matte whose clip is gone, is the clip itself or is not visual", () => {
    let doc = project();
    doc = withClips(doc, [solid("gone", "v1", { matte: { clipId: "nothing", mode: "alpha" } }), solid("self", "v2", { matte: { clipId: "self", mode: "alpha" } })]);
    expect(new Compositor().evaluate(doc, 5).layers.map((l) => l.kind)).toEqual(["solid", "solid"]);
  });

  it("gives an empty matte when the matte clip is not at the frame (alpha hides the clip, inverted shows it)", () => {
    let doc = project();
    doc = withClips(doc, [solid("v", "v1", { duration: 60, matte: { clipId: "m", mode: "alphaInverted" } } as Partial<Clip>), solid("m", "v2", { matteOnly: true })]);
    const g = group(new Compositor().evaluate(doc, 40).layers[0]);
    expect(g.matte?.mode).toBe("alphaInverted");
    expect(g.matte?.layers).toEqual([]);
  });

  it("takes blend and matte of the dominant side of a transition and groups the whole transition picture", () => {
    let doc = project(["v1", "v2"]);
    const fps = doc.settings.fps;
    const t = { id: "t", kind: "crossDissolve" as const, before: 2, after: 2 };
    doc = withClips(doc, [
      clip(doc, { id: "a", trackId: "v2", start: 0, duration: 30, out: frameToUs(32, fps), transitionOut: t, blend: "screen" }),
      clip(doc, { id: "b", trackId: "v2", start: 30, duration: 30, mediaId: "m2", in: frameToUs(60, fps), out: frameToUs(90, fps), transitionIn: t, blend: "multiply" }),
    ]);
    const compositor = new Compositor();
    const early = group(compositor.evaluate(doc, 28).layers[0]);
    expect(early.kind).toBe("group");
    expect(early.blend).toBe("screen");
    expect(early.layers.map((l) => l.kind)).toEqual(["dissolve"]);
    const late = group(compositor.evaluate(doc, 31).layers[0]);
    expect(late.blend).toBe("multiply");
  });

  it("keeps a 2.5D clip's projection on its layers inside the group (the matte follows the projected picture)", () => {
    let doc = project();
    doc = withClips(doc, [solid("v", "v1", { blend: "overlay", transform: { x: 0, y: 0, scale: 1, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false, rotationY: 30 } } as Partial<Clip>)]);
    const g = group(new Compositor().evaluate(doc, 5).layers[0]);
    expect((g.layers[0] as { persp?: unknown }).persp).toBeTruthy();
  });

  it("opens groups for code that needs every layer (plainLayers)", () => {
    let doc = project();
    doc = withClips(doc, [solid("bg", "v1"), clip(doc, { id: "v", trackId: "v2", start: 0, duration: 30, matte: { clipId: "m", mode: "alpha" } }), clip(doc, { id: "m", trackId: "v3", start: 0, duration: 30, matteOnly: true })]);
    const layers = new Compositor().evaluate(doc, 5).layers;
    expect(layers).toHaveLength(2);
    expect(clipIds(plainLayers(layers))).toEqual(["solid", "v", "m"]);
  });

  it("reuses its group layers between frames", () => {
    let doc = project();
    doc = withClips(doc, [solid("v", "v1", { blend: "difference" })]);
    const compositor = new Compositor();
    const first = compositor.evaluate(doc, 5).layers[0];
    expect(compositor.evaluate(doc, 6).layers[0]).toBe(first);
  });
});

describe("DrawListSnapshot groups (Batch 72)", () => {
  const solidLayer = { kind: "solid" as const, transform: [1, 0, 0, 1, 0, 0] as const, opacity: 1, color: { r: 1, g: 0, b: 0, a: 1 } };
  const list = (blend: "multiply" | "screen", mode: "alpha" | "luma" | null) => ({
    width: 10,
    height: 10,
    background: { r: 0, g: 0, b: 0, a: 1 },
    layers: [{ kind: "group" as const, transform: [1, 0, 0, 1, 0, 0] as const, opacity: 1, blend, layers: [solidLayer], matte: mode ? { mode, layers: [solidLayer] } : null }],
  });

  it("sees a blend mode or matte change", () => {
    const snapshot = new DrawListSnapshot();
    expect(snapshot.update(list("multiply", null))).toBe(true);
    expect(snapshot.update(list("multiply", null))).toBe(false);
    expect(snapshot.update(list("screen", null))).toBe(true);
    expect(snapshot.update(list("screen", "alpha"))).toBe(true);
    expect(snapshot.update(list("screen", "luma"))).toBe(true);
    expect(snapshot.update(list("screen", "luma"))).toBe(false);
  });
});
