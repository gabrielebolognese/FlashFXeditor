import { describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeSolidClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import { frameToUs } from "../../core/document/time.js";
import type { Clip, MediaClip, MediaItem, Project, Transform } from "../../core/document/types.js";
import type { TextureHandle } from "../gpu/renderer.js";
import { applyToPoint, type Mat3 } from "../mat3.js";
import { Compositor, fadeFactor, NEIGHBOR_SECONDS, sourceTimeUs } from "./Compositor.js";
import type { DrawList, MediaLayer, SolidLayer } from "./drawList.js";
import { DrawListSnapshot } from "./DrawListSnapshot.js";

const W = 1080;
const H = 1920;

function project(tracks = ["v1", "v2", "v3"], media: MediaItem[] = [video("m1", 1920, 1080)]): Project {
  const doc = makeProject();
  doc.tracks = [...tracks.map((id) => makeTrack(id, "video")), makeTrack("a1", "audio")];
  for (const item of media) doc.media[item.id] = item;
  return doc;
}

function video(id: string, width: number, height: number, rotation?: 0 | 90 | 180 | 270): MediaItem {
  return { ...makeMedia(id, "video"), width, height, ...(rotation !== undefined && { rotation }) };
}

function clip(doc: Project, fields: { id: string; trackId: string; start: number; duration: number; mediaId?: string } & Partial<MediaClip>): MediaClip {
  const { id, trackId, start, duration, mediaId = "m1", ...rest } = fields;
  return { ...makeMediaClip(doc, { id, trackId, start, duration, mediaId }), ...rest };
}

const transform = (fields: Partial<Transform> = {}): Transform => ({ x: 0, y: 0, scale: 1, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false, ...fields });

function corners(m: Mat3) {
  const points = [applyToPoint(m, 0, 0), applyToPoint(m, 1, 0), applyToPoint(m, 0, 1), applyToPoint(m, 1, 1)];
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
}

function close(actual: { x: number; y: number }, expected: { x: number; y: number }) {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
}

const media = (layer: unknown) => layer as MediaLayer;

describe("Compositor.evaluate", () => {
  it("stacks the clip at the frame of each visible video track, bottom track first", () => {
    let doc = project(["v1", "v2", "v3", "v4"]);
    doc = withClips(doc, [
      clip(doc, { id: "c1", trackId: "v1", start: 0, duration: 30 }),
      clip(doc, { id: "c2", trackId: "v2", start: 10, duration: 30 }),
      clip(doc, { id: "c3", trackId: "v3", start: 0, duration: 30, enabled: false }),
      clip(doc, { id: "c4", trackId: "v4", start: 0, duration: 30 }),
      clip(doc, { id: "late", trackId: "v1", start: 45, duration: 10 }),
    ]);
    doc.tracks[3] = { ...(doc.tracks[3] as Project["tracks"][number]), hidden: true };
    const compositor = new Compositor();
    expect(compositor.evaluate(doc, 15).layers.map((l) => media(l).clipId)).toEqual(["c1", "c2"]);
    expect(compositor.evaluate(doc, 5).layers.map((l) => media(l).clipId)).toEqual(["c1"]);
    // A gap on every track: only the background.
    expect(compositor.evaluate(doc, 42).layers).toEqual([]);
    const list = compositor.evaluate(doc, 50);
    expect(list.layers.map((l) => media(l).clipId)).toEqual(["late"]);
    expect([list.width, list.height]).toEqual([W, H]);
    expect(list.background).toBe(doc.settings.background);
    // A muted video track is out of the composite too (spec §6.12), and out of the cut warming.
    doc.tracks[1] = { ...(doc.tracks[1] as Project["tracks"][number]), muted: true };
    expect(compositor.evaluate(doc, 15).layers.map((l) => media(l).clipId)).toEqual(["c1"]);
    expect(compositor.neighbors(doc, 5).map((neighbor) => neighbor.timeUs)).toEqual(compositor.neighbors({ ...doc, tracks: doc.tracks.filter((track) => track.id !== "v2") }, 5).map((neighbor) => neighbor.timeUs));
  });

  it("computes the source time with speed and in point, inside the clip's media range", () => {
    let doc = project(["v1"]);
    const c = clip(doc, { id: "c", trackId: "v1", start: 100, duration: 30, in: 1_000_000, out: 3_000_000, speed: 2 });
    doc = withClips(doc, [c]);
    const compositor = new Compositor();
    expect(media(compositor.evaluate(doc, 100).layers[0]).timeUs).toBe(1_000_000);
    expect(media(compositor.evaluate(doc, 115).layers[0]).timeUs).toBe(2_000_000);
    expect(media(compositor.evaluate(doc, 129).layers[0]).timeUs).toBe(1_000_000 + 1_933_333);
    expect(sourceTimeUs({ start: 0, in: 0, out: 1_000_000, speed: 4 }, 29, doc.settings.fps)).toBe(999_999);
  });

  it("letterboxes a Fit-scaled 16:9 video in the 9:16 frame", () => {
    let doc = project(["v1"]);
    doc = withClips(doc, [clip(doc, { id: "c", trackId: "v1", start: 0, duration: 30, transform: transform({ scale: W / 1920 }) })]);
    const layer = media(new Compositor().evaluate(doc, 0).layers[0]);
    const box = corners(layer.transform);
    expect(box.left).toBeCloseTo(0, 6);
    expect(box.right).toBeCloseTo(W, 6);
    expect(box.top).toBeCloseTo((H - 607.5) / 2, 6);
    expect(box.bottom).toBeCloseTo((H + 607.5) / 2, 6);
    expect(layer.crop).toEqual({ u0: 0, v0: 0, u1: 1, v1: 1 });
  });

  it("turns rotation metadata upright in the layer matrix (the texture stays as coded)", () => {
    let doc = project(["v1"], [video("m1", 1920, 1080, 90)]);
    doc = withClips(doc, [clip(doc, { id: "c", trackId: "v1", start: 0, duration: 30 })]);
    const m = media(new Compositor().evaluate(doc, 0).layers[0]).transform;
    // A 90° clockwise turn: the coded top-left corner shows top right, the coded top edge on the right.
    close(applyToPoint(m, 0, 0), { x: W, y: 0 });
    close(applyToPoint(m, 1, 0), { x: W, y: H });
    close(applyToPoint(m, 0, 1), { x: 0, y: 0 });
    close(applyToPoint(m, 1, 1), { x: 0, y: H });
    const turned = (rotation: 180 | 270, width: number, height: number) => {
      let d = project(["v1"], [video("m1", width, height, rotation)]);
      d = withClips(d, [clip(d, { id: "c", trackId: "v1", start: 0, duration: 30 })]);
      return media(new Compositor().evaluate(d, 0).layers[0]).transform;
    };
    const m270 = turned(270, 1920, 1080);
    close(applyToPoint(m270, 0, 0), { x: 0, y: H });
    close(applyToPoint(m270, 1, 0), { x: 0, y: 0 });
    close(applyToPoint(m270, 0, 1), { x: W, y: H });
    const m180 = turned(180, 1080, 1920);
    close(applyToPoint(m180, 0, 0), { x: W, y: H });
    close(applyToPoint(m180, 1, 1), { x: 0, y: 0 });
  });

  it("mirrors the content in place with flips", () => {
    let doc = project(["v1"], [video("m1", 1080, 1920)]);
    doc = withClips(doc, [clip(doc, { id: "c", trackId: "v1", start: 0, duration: 30, transform: transform({ flipH: true, x: 100 }) })]);
    const m = media(new Compositor().evaluate(doc, 0).layers[0]).transform;
    close(applyToPoint(m, 0, 0), { x: W + 100, y: 0 });
    close(applyToPoint(m, 1, 1), { x: 100, y: H });
  });

  it("applies position, anchor, scale, scaleY and clockwise rotation around the anchor", () => {
    let doc = project(["v1"], [video("m1", 200, 100)]);
    doc = withClips(doc, [
      clip(doc, { id: "c", trackId: "v1", start: 0, duration: 30, transform: transform({ x: 50, y: -20, scale: 2, scaleY: 3, rotation: 90, anchor: { x: 0, y: 0 } }) }),
    ]);
    const m = media(new Compositor().evaluate(doc, 0).layers[0]).transform;
    // The anchor (top-left corner) sits at the frame center + (50, -20); the content turns clockwise around it.
    close(applyToPoint(m, 0, 0), { x: W / 2 + 50, y: H / 2 - 20 });
    close(applyToPoint(m, 1, 0), { x: W / 2 + 50, y: H / 2 - 20 + 400 });
    close(applyToPoint(m, 0, 1), { x: W / 2 + 50 - 300, y: H / 2 - 20 });
  });

  it("crops the shown sides without moving the remaining pixels, for every rotation and flip", () => {
    const crop = { left: 0.1, top: 0.2, right: 0.3, bottom: 0.05 };
    for (const rotation of [0, 90, 180, 270] as const) {
      for (const flipH of [false, true]) {
        for (const flipV of [false, true]) {
          let doc = project(["v1"], [video("m1", 300, 200, rotation)]);
          const t = transform({ flipH, flipV, x: 13, y: -7, scale: 1.5, rotation: 30 });
          doc = withClips(doc, [clip(doc, { id: "full", trackId: "v1", start: 0, duration: 10, transform: t })]);
          const compositor = new Compositor();
          const full = [...media(compositor.evaluate(doc, 0).layers[0]).transform] as unknown as Mat3;
          doc.clips.full = { ...(doc.clips.full as MediaClip), crop };
          const layer = media(compositor.evaluate(doc, 0).layers[0]);
          const { u0, v0, u1, v1 } = layer.crop;
          expect(u1).toBeGreaterThan(u0);
          expect(v1).toBeGreaterThan(v0);
          // Each corner of the cropped quad lands where its texture point lands uncropped.
          for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1], [0.3, 0.6]] as const) {
            close(applyToPoint(layer.transform, i, j), applyToPoint(full, u0 + i * (u1 - u0), v0 + j * (v1 - v0)));
          }
          // What is left is the shown rectangle minus the cropped sides (checked unrotated, unscaled).
          let plain = project(["v1"], [video("m1", 300, 200, rotation)]);
          plain = withClips(plain, [clip(plain, { id: "p", trackId: "v1", start: 0, duration: 10, transform: transform({ flipH, flipV }), crop })]);
          const box = corners(media(new Compositor().evaluate(plain, 0).layers[0]).transform);
          const shown = rotation === 90 || rotation === 270 ? { w: 200, h: 300 } : { w: 300, h: 200 };
          const x0 = W / 2 - shown.w / 2;
          const y0 = H / 2 - shown.h / 2;
          expect(box.left).toBeCloseTo(x0 + crop.left * shown.w, 6);
          expect(box.right).toBeCloseTo(x0 + (1 - crop.right) * shown.w, 6);
          expect(box.top).toBeCloseTo(y0 + crop.top * shown.h, 6);
          expect(box.bottom).toBeCloseTo(y0 + (1 - crop.bottom) * shown.h, 6);
        }
      }
    }
  });

  it("drops a layer cropped away entirely", () => {
    let doc = project(["v1"]);
    doc = withClips(doc, [clip(doc, { id: "c", trackId: "v1", start: 0, duration: 30, crop: { left: 0.6, top: 0, right: 0.4, bottom: 0 } })]);
    expect(new Compositor().evaluate(doc, 0).layers).toEqual([]);
  });

  it("multiplies the clip opacity by its fades", () => {
    let doc = project(["v1"]);
    doc = withClips(doc, [clip(doc, { id: "c", trackId: "v1", start: 10, duration: 40, opacity: 0.5, fades: { in: 10, out: 4 } })]);
    const compositor = new Compositor();
    const at = (frame: number) => media(compositor.evaluate(doc, frame).layers[0]).opacity;
    expect(at(10)).toBe(0);
    expect(at(15)).toBeCloseTo(0.25, 9);
    expect(at(20)).toBe(0.5);
    expect(at(45)).toBe(0.5);
    expect(at(47)).toBeCloseTo(0.25, 9);
    expect(at(49)).toBe(0);
    expect(fadeFactor({ start: 0, duration: 10, fades: { in: 0, out: 0 } }, 3)).toBe(1);
  });

  it("draws rect solids with a flat fill and skips the shapes of later batches", () => {
    let doc = project(["v1", "v2"]);
    const rect = { ...makeSolidClip({ id: "s1", trackId: "v1", start: 0, duration: 10 }), fill: { r: 1, g: 0, b: 0, a: 0.5 }, opacity: 0.8, transform: transform({ x: 10 }) };
    const ellipse = { ...makeSolidClip({ id: "s2", trackId: "v2", start: 0, duration: 10 }), shape: "ellipse" as const };
    doc = withClips(doc, [rect, ellipse] as Clip[]);
    const layers = new Compositor().evaluate(doc, 0).layers;
    expect(layers).toHaveLength(1);
    const layer = layers[0] as SolidLayer;
    expect(layer.kind).toBe("solid");
    expect(layer.color).toEqual({ r: 1, g: 0, b: 0, a: 0.5 });
    expect(layer.opacity).toBe(0.8);
    close(applyToPoint(layer.transform, 0, 0), { x: W / 2 + 10 - 50, y: H / 2 - 50 });
    close(applyToPoint(layer.transform, 1, 1), { x: W / 2 + 10 + 50, y: H / 2 + 50 });
  });

  it("gives images one still texture", () => {
    let doc = project(["v1"], [{ ...makeMedia("img", "image", 0), width: 400, height: 300 }]);
    doc = withClips(doc, [clip(doc, { id: "c", trackId: "v1", start: 0, duration: 150, mediaId: "img", kind: "image", out: frameToUs(150, doc.settings.fps) })]);
    const layer = media(new Compositor().evaluate(doc, 120).layers[0]);
    expect(layer.still).toBe(true);
    expect(layer.timeUs).toBe(0);
    expect(layer.mediaId).toBe("img");
  });

  it("reuses its layer structs and arrays between frames", () => {
    let doc = project(["v1", "v2"]);
    doc = withClips(doc, [clip(doc, { id: "a", trackId: "v1", start: 0, duration: 30 }), clip(doc, { id: "b", trackId: "v2", start: 0, duration: 30 })]);
    const compositor = new Compositor();
    const first = compositor.evaluate(doc, 0);
    const [l0, l1] = first.layers;
    const t0 = l0?.transform;
    const second = compositor.evaluate(doc, 20);
    expect(second).toBe(first);
    expect(second.layers[0]).toBe(l0);
    expect(second.layers[1]).toBe(l1);
    expect(second.layers[0]?.transform).toBe(t0);
  });
});

describe("Compositor.neighbors", () => {
  it("lists the edge frames of the clips next to the playhead within reach", () => {
    let doc = project(["v1", "v2"], [video("m1", 1920, 1080), video("m2", 1920, 1080)]);
    const reach = NEIGHBOR_SECONDS * 30;
    doc = withClips(doc, [
      clip(doc, { id: "a", trackId: "v1", start: 0, duration: 30 }),
      clip(doc, { id: "b", trackId: "v1", start: 30, duration: 30, mediaId: "m2", in: 500_000, out: 1_500_000 }),
      clip(doc, { id: "far", trackId: "v2", start: 200, duration: 30 }),
    ]);
    const compositor = new Compositor();
    expect(compositor.neighbors(doc, 10).map((n) => ({ ...n }))).toEqual([{ mediaId: "m2", still: false, timeUs: 500_000 }]);
    expect(compositor.neighbors(doc, 40).map((n) => ({ ...n }))).toEqual([{ mediaId: "m1", still: false, timeUs: frameToUs(29, doc.settings.fps) }]);
    // In the gap after "b": its last frame while within reach, then "far" once it comes within reach.
    expect(compositor.neighbors(doc, 70).map((n) => n.mediaId)).toEqual(["m2"]);
    expect(compositor.neighbors(doc, 59 + reach).map((n) => n.mediaId)).toEqual(["m2"]);
    expect(compositor.neighbors(doc, 60 + reach).map((n) => n.mediaId)).toEqual([]);
    expect(compositor.neighbors(doc, 200 - reach).map((n) => n.mediaId)).toEqual(["m1"]);
  });
});

describe("DrawListSnapshot", () => {
  const texture = (valid = true): TextureHandle => ({ width: 1, height: 1, mipLevels: 1, bytes: 4, valid, destroy: () => undefined });

  function list(tex: TextureHandle, opacity = 1): DrawList {
    return {
      width: W,
      height: H,
      background: { r: 0, g: 0, b: 0, a: 1 },
      layers: [
        { kind: "texture", texture: tex, transform: [1, 0, 0, 1, 0, 0], opacity, crop: { u0: 0, v0: 0, u1: 1, v1: 1 }, flipX: false, flipY: false },
        { kind: "solid", transform: [2, 0, 0, 2, 5, 5], opacity: 1, color: { r: 1, g: 1, b: 1, a: 1 } },
      ],
    };
  }

  it("reports a change only when what would be drawn differs", () => {
    const snapshot = new DrawListSnapshot();
    const a = texture();
    expect(snapshot.update(list(a))).toBe(true);
    expect(snapshot.update(list(a))).toBe(false);
    expect(snapshot.update(list(a, 0.5))).toBe(true);
    expect(snapshot.update(list(a, 0.5))).toBe(false);
    expect(snapshot.update(list(texture(), 0.5))).toBe(true);
    const shorter = { ...list(a), layers: list(a).layers.slice(1) };
    expect(snapshot.update(shorter)).toBe(true);
    expect(snapshot.update(shorter)).toBe(false);
    snapshot.reset();
    expect(snapshot.update(shorter)).toBe(true);
  });

  it("treats a destroyed texture as a change", () => {
    const snapshot = new DrawListSnapshot();
    let valid = true;
    const tex = { ...texture(), get valid() { return valid; } };
    snapshot.update(list(tex));
    valid = false;
    expect(snapshot.update(list(tex))).toBe(true);
  });
});
