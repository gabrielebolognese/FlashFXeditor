import { describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeSolidClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import { frameToUs } from "../../core/document/time.js";
import type { Clip, MediaClip, MediaItem, Project, Transform } from "../../core/document/types.js";
import type { TextureHandle } from "../gpu/renderer.js";
import { layerPoint } from "../../timeline/edit/transform.js";
import { applyToPoint, invert, type Mat3 } from "../mat3.js";
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

  it("uses a gesture's ephemeral transforms instead of the document's (spec P2)", () => {
    let doc = project(["v1", "v2"], [video("m1", 200, 100)]);
    doc = withClips(doc, [clip(doc, { id: "c", trackId: "v1", start: 0, duration: 30 }), { ...makeSolidClip({ id: "s", trackId: "v2", start: 0, duration: 30 }) }]);
    const compositor = new Compositor();
    const overrides = new Map([
      ["c", transform({ x: 10, flipH: true })],
      ["s", transform({ y: -40, scale: 2 })],
    ]);
    const [c, s] = compositor.evaluate(doc, 0, overrides).layers;
    close(applyToPoint(media(c).transform, 1, 0), { x: W / 2 - 100 + 10, y: H / 2 - 50 });
    close(applyToPoint((s as SolidLayer).transform, 0, 0), { x: W / 2 - 100, y: H / 2 - 100 - 40 });
    // Without them, the document's.
    const [plain] = compositor.evaluate(doc, 0).layers;
    close(applyToPoint(media(plain).transform, 0, 0), { x: W / 2 - 100, y: H / 2 - 50 });
  });

  it("evaluates keyed transforms and opacities at the frame; live values still win (Batch 35)", () => {
    let doc = project(["v1", "v2"], [video("m1", 200, 100)]);
    const keyframes = {
      "transform.x": [
        { frame: 0, value: 0, ease: "linear" as const },
        { frame: 20, value: 200, ease: "hold" as const },
        { frame: 30, value: -100, ease: "linear" as const },
      ],
      opacity: [{ frame: 0, value: 0, ease: "linear" as const }, { frame: 10, value: 1, ease: "linear" as const }],
    };
    doc = withClips(doc, [clip(doc, { id: "c", trackId: "v1", start: 10, duration: 40, keyframes }), { ...makeSolidClip({ id: "s", trackId: "v2", start: 0, duration: 60 }), keyframes: { "transform.scale": [{ frame: 0, value: 1, ease: "linear" as const }, { frame: 10, value: 3, ease: "linear" as const }] } }]);
    const compositor = new Compositor();
    const at = (frame: number) => compositor.evaluate(doc, frame).layers;
    const left = (frame: number) => applyToPoint(media(at(frame)[0]).transform, 0, 0).x;
    expect(left(10)).toBeCloseTo(W / 2 - 100);
    expect(left(20)).toBeCloseTo(W / 2 - 100 + 100);
    // Hold: stays at 200 until the next key, then jumps.
    expect(left(39)).toBeCloseTo(W / 2 - 100 + 200);
    expect(left(40)).toBeCloseTo(W / 2 - 100 - 100);
    expect(media(at(15)[0]).opacity).toBeCloseTo(0.5);
    // The solid's scale at frame 5: 2 (its 100 px box drawn 200 px wide).
    expect(corners((at(5)[0] as SolidLayer).transform).right - corners((at(5)[0] as SolidLayer).transform).left).toBeCloseTo(2 * makeSolidClip({ id: "x", trackId: "v2", start: 0, duration: 1 }).size.w);
    // A gesture's live transform and a scrub's opacity replace the keyed values.
    const live = compositor.evaluate(doc, 20, new Map([["c", transform({ x: 5 })]]), new Map([["c", 0.25]])).layers;
    expect(applyToPoint(media(live[0]).transform, 0, 0).x).toBeCloseTo(W / 2 - 100 + 5);
    expect(media(live[0]).opacity).toBe(0.25);
    // The document's transform object is not written.
    expect((doc.clips.c as MediaClip).transform.x).toBe(0);
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

  it("samples cropped, turned and flipped media like a reference image built pixel by pixel (Batch 26 acceptance 3)", () => {
    // A coded 8 x 6 texture whose pixels are numbered; the reference turns it upright (the metadata,
    // clockwise), mirrors it (the flips), cuts the crop off the shown sides, and places each remaining
    // pixel's center with the clip transform (here a quarter turn too). The compositor's layer must
    // sample the same coded pixel there (the matrix to the unit quad, then the crop's UV rectangle).
    const CW = 8;
    const CH = 6;
    const coded = (x: number, y: number) => y * CW + x;
    const crop = { left: 2 / 6, top: 1 / 8, right: 1 / 6, bottom: 2 / 8 };
    for (const rotation of [0, 90, 180, 270] as const) {
      const quarter = rotation === 90 || rotation === 270;
      const SW = quarter ? CH : CW;
      const SH = quarter ? CW : CH;
      // Upright pixel (x, y) from the coded one (spec §9.3: the texture stays as coded).
      const upright = (x: number, y: number) =>
        rotation === 90 ? coded(y, CH - 1 - x) : rotation === 180 ? coded(CW - 1 - x, CH - 1 - y) : rotation === 270 ? coded(CW - 1 - y, x) : coded(x, y);
      for (const flipH of [false, true]) {
        for (const flipV of [false, true]) {
          for (const turn of [0, 90]) {
            const t = transform({ flipH, flipV, rotation: turn, scale: 40, x: 25, y: -60 });
            let doc = project(["v1"], [video("m1", CW, CH, rotation)]);
            const cropped = { ...crop, left: crop.left * (6 / SW), right: crop.right * (6 / SW), top: crop.top * (8 / SH), bottom: crop.bottom * (8 / SH) };
            doc = withClips(doc, [clip(doc, { id: "c", trackId: "v1", start: 0, duration: 10, transform: t, crop: cropped })]);
            const layer = media(new Compositor().evaluate(doc, 0).layers[0]);
            const toQuad = invert(layer.transform) as Mat3;
            const x0 = Math.round(cropped.left * SW);
            const x1 = Math.round((1 - cropped.right) * SW);
            const y0 = Math.round(cropped.top * SH);
            const y1 = Math.round((1 - cropped.bottom) * SH);
            for (let y = y0; y < y1; y++) {
              for (let x = x0; x < x1; x++) {
                // The shown (flipped) picture at content pixel (x, y), and where its center lands.
                const expected = upright(flipH ? SW - 1 - x : x, flipV ? SH - 1 - y : y);
                const p = layerPoint(t, { width: SW, height: SH }, { width: W, height: H }, x + 0.5, y + 0.5);
                const q = applyToPoint(toQuad, p.x, p.y);
                expect(q.x).toBeGreaterThan(0);
                expect(q.x).toBeLessThan(1);
                expect(q.y).toBeGreaterThan(0);
                expect(q.y).toBeLessThan(1);
                const u = layer.crop.u0 + q.x * (layer.crop.u1 - layer.crop.u0);
                const v = layer.crop.v0 + q.y * (layer.crop.v1 - layer.crop.v0);
                expect(coded(Math.floor(u * CW), Math.floor(v * CH))).toBe(expected);
              }
            }
          }
        }
      }
    }
  });

  it("uses a gesture's ephemeral crops instead of the document's (spec P2)", () => {
    let doc = project(["v1"]);
    doc = withClips(doc, [clip(doc, { id: "c", trackId: "v1", start: 0, duration: 30 })]);
    const compositor = new Compositor();
    expect(media(compositor.evaluate(doc, 0, null, null, new Map([["c", { left: 0.25, top: 0, right: 0, bottom: 0.5 }]])).layers[0]).crop).toEqual({ u0: 0.25, v0: 0, u1: 1, v1: 0.5 });
    expect(media(compositor.evaluate(doc, 0).layers[0]).crop).toEqual({ u0: 0, v0: 0, u1: 1, v1: 1 });
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

  it("fades a solid's opacity when it has fades (Batch 36)", () => {
    let doc = project(["v1"]);
    doc = withClips(doc, [{ ...makeSolidClip({ id: "s", trackId: "v1", start: 0, duration: 21 }), fades: { in: 10, out: 0 } }]);
    const compositor = new Compositor();
    expect((compositor.evaluate(doc, 5).layers[0] as SolidLayer).opacity).toBeCloseTo(0.5, 9);
    expect((compositor.evaluate(doc, 15).layers[0] as SolidLayer).opacity).toBe(1);
  });

  it("dissolves the two clips of a transition, each playing into its handle (Batch 36)", () => {
    let doc = project(["v1"], [video("m1", 1920, 1080), video("m2", 1080, 1920)]);
    const t = { id: "t", kind: "crossDissolve" as const, before: 2, after: 2 };
    doc = withClips(doc, [
      clip(doc, { id: "a", trackId: "v1", start: 0, duration: 30, in: frameToUs(30, doc.settings.fps), out: frameToUs(60, doc.settings.fps), transitionOut: t, fades: { in: 0, out: 10 } }),
      clip(doc, { id: "b", trackId: "v1", start: 30, duration: 30, mediaId: "m2", in: frameToUs(90, doc.settings.fps), out: frameToUs(120, doc.settings.fps), transitionIn: t }),
    ]);
    const compositor = new Compositor();
    const fps = doc.settings.fps;
    const at = (frame: number) => compositor.evaluate(doc, frame).layers[0] as unknown as { kind: string; mix: number; from: MediaLayer; to: MediaLayer };
    expect((compositor.evaluate(doc, 27).layers[0] as MediaLayer).kind).toBe("media");
    const first = at(28);
    expect(first.kind).toBe("dissolve");
    expect(first.mix).toBeCloseTo(0.2, 9);
    expect(first.from.clipId).toBe("a");
    expect(first.to.clipId).toBe("b");
    // B shows its source 2 frames before its in point, on its own texture slot.
    expect(first.to.timeUs).toBe(frameToUs(88, fps));
    expect(first.to.trackId).toBe("v1#in");
    expect(first.from.trackId).toBe("v1");
    const late = at(31);
    expect(late.mix).toBeCloseTo(0.8, 9);
    // A plays one frame past its out point, faded as on its last frame.
    expect(late.from.timeUs).toBe(frameToUs(61, fps));
    expect(late.from.opacity).toBe(0);
    expect((compositor.evaluate(doc, 32).layers[0] as MediaLayer).clipId).toBe("b");
  });

  it("dips to a color in the clip's own quad: out of the first clip, into the second (Batch 36)", () => {
    let doc = project(["v1"]);
    const t = { id: "t", kind: "dipToWhite" as const, before: 2, after: 2 };
    doc = withClips(doc, [
      clip(doc, { id: "a", trackId: "v1", start: 0, duration: 30, out: frameToUs(30, doc.settings.fps), transitionOut: t, transform: transform({ scale: 0.5 }) }),
      clip(doc, { id: "b", trackId: "v1", start: 30, duration: 30, in: frameToUs(60, doc.settings.fps), out: frameToUs(90, doc.settings.fps), transitionIn: t }),
    ]);
    const compositor = new Compositor();
    const at = (frame: number) => compositor.evaluate(doc, frame).layers;
    const [pictureA, dipA] = at(29) as [MediaLayer, SolidLayer];
    expect(pictureA.clipId).toBe("a");
    expect(dipA.color).toEqual({ r: 1, g: 1, b: 1, a: 1 });
    expect(dipA.opacity).toBeCloseTo(0.8, 9);
    expect([...dipA.transform]).toEqual([...pictureA.transform]);
    const [pictureB, dipB] = at(30) as [MediaLayer, SolidLayer];
    expect(pictureB.clipId).toBe("b");
    expect(dipB.opacity).toBeCloseTo(0.8, 9);
  });

  it("draws solids as their shape over their size's box, flat or as a vertical gradient (Batch 34)", () => {
    let doc = project(["v1", "v2", "v3"]);
    const rect = { ...makeSolidClip({ id: "s1", trackId: "v1", start: 0, duration: 10 }), fill: { r: 1, g: 0, b: 0, a: 0.5 }, opacity: 0.8, transform: transform({ x: 10 }) };
    const red = { r: 1, g: 0, b: 0, a: 1 };
    const blue = { r: 0, g: 0, b: 1, a: 0.5 };
    const ellipse = { ...makeSolidClip({ id: "s2", trackId: "v2", start: 0, duration: 10 }), shape: "ellipse" as const, size: { w: 300, h: 200 }, cornerRadius: 40, fill: { from: red, to: blue } };
    const rounded = { ...makeSolidClip({ id: "s3", trackId: "v3", start: 0, duration: 10 }), shape: "roundedRect" as const, size: { w: 200, h: 60 }, cornerRadius: 500 };
    doc = withClips(doc, [rect, ellipse, rounded] as Clip[]);
    const layers = new Compositor().evaluate(doc, 0).layers as SolidLayer[];
    expect(layers).toHaveLength(3);
    const [a, b, c] = layers as [SolidLayer, SolidLayer, SolidLayer];
    expect(a.kind).toBe("solid");
    expect(a.color).toEqual({ r: 1, g: 0, b: 0, a: 0.5 });
    expect(a.to).toBeNull();
    expect(a.shape).toEqual({ kind: "box", width: 100, height: 100, radius: 0 });
    expect(a.opacity).toBe(0.8);
    close(applyToPoint(a.transform, 0, 0), { x: W / 2 + 10 - 50, y: H / 2 - 50 });
    close(applyToPoint(a.transform, 1, 1), { x: W / 2 + 10 + 50, y: H / 2 + 50 });
    expect(b.color).toEqual(red);
    expect(b.to).toEqual(blue);
    expect(b.shape).toEqual({ kind: "ellipse", width: 300, height: 200, radius: 0 });
    close(applyToPoint(b.transform, 0, 0), { x: W / 2 - 150, y: H / 2 - 100 });
    // A radius past half the shorter side is drawn as half of it (a pill).
    expect(c.shape).toEqual({ kind: "box", width: 200, height: 60, radius: 30 });
  });

  it("mirrors a solid's fill inside its box on flips and draws live looks (a field scrub, a size drag)", () => {
    let doc = project(["v1"]);
    doc = withClips(doc, [{ ...makeSolidClip({ id: "s", trackId: "v1", start: 0, duration: 10 }), transform: transform({ flipV: true }) }] as Clip[]);
    const compositor = new Compositor();
    const flipped = compositor.evaluate(doc, 0).layers[0] as SolidLayer;
    // The quad's top edge (where the gradient starts) is the box's bottom.
    close(applyToPoint(flipped.transform, 0, 0), { x: W / 2 - 50, y: H / 2 + 50 });
    const live = new Map([["s", { shape: "line" as const, fill: { r: 0, g: 1, b: 0, a: 1 }, size: { w: 400, h: 8 }, cornerRadius: 4 }]]);
    const layer = compositor.evaluate(doc, 0, null, null, null, null, null, null, live).layers[0] as SolidLayer;
    expect(layer.shape).toEqual({ kind: "box", width: 400, height: 8, radius: 4 });
    expect(layer.color).toEqual({ r: 0, g: 1, b: 0, a: 1 });
    close(applyToPoint(layer.transform, 1, 0), { x: W / 2 + 200, y: H / 2 + 4 });
  });

  it("plays an animated image from its in point and loops it", () => {
    let doc = project(["v1"], [{ ...makeMedia("gif", "image", 1_000_000), width: 400, height: 300, codec: "gif" }]);
    doc = withClips(doc, [clip(doc, { id: "c", trackId: "v1", start: 30, duration: 150, mediaId: "gif", kind: "image", in: 500_000, out: 500_000 + frameToUs(150, doc.settings.fps) })]);
    const compositor = new Compositor();
    const at = (frame: number) => media(compositor.evaluate(doc, frame).layers[0]).timeUs;
    expect(at(30)).toBe(500_000);
    expect(at(36)).toBe(700_000);
    expect(at(45)).toBe(0);
    expect(at(75)).toBe(0);
    expect(media(compositor.evaluate(doc, 46).layers[0]).still).toBe(true);
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
    const t0 = (l0 as MediaLayer).transform;
    const second = compositor.evaluate(doc, 20);
    expect(second).toBe(first);
    expect(second.layers[0]).toBe(l0);
    expect(second.layers[1]).toBe(l1);
    expect((second.layers[0] as MediaLayer).transform).toBe(t0);
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

  it("sees a solid's gradient and shape change (Batch 34)", () => {
    const snapshot = new DrawListSnapshot();
    const solid = (fields: Partial<SolidLayer>): DrawList => ({ width: W, height: H, background: { r: 0, g: 0, b: 0, a: 1 }, layers: [{ kind: "solid", transform: [2, 0, 0, 2, 5, 5], opacity: 1, color: { r: 1, g: 1, b: 1, a: 1 }, ...fields }] });
    const box = { kind: "box" as const, width: 100, height: 50, radius: 10 };
    expect(snapshot.update(solid({ shape: box }))).toBe(true);
    expect(snapshot.update(solid({ shape: { ...box } }))).toBe(false);
    expect(snapshot.update(solid({ shape: { ...box, radius: 12 } }))).toBe(true);
    expect(snapshot.update(solid({ shape: { ...box, radius: 12, kind: "ellipse" } }))).toBe(true);
    expect(snapshot.update(solid({ shape: { ...box, radius: 12, kind: "ellipse" }, to: { r: 0, g: 0, b: 0, a: 1 } }))).toBe(true);
    expect(snapshot.update(solid({ shape: null }))).toBe(true);
    // A flat fill without `to` draws what one with `to` = its color draws.
    expect(snapshot.update(solid({ shape: null, to: { r: 1, g: 1, b: 1, a: 1 } }))).toBe(false);
  });

  it("sees a dissolve's sides and mix change (Batch 36)", () => {
    const snapshot = new DrawListSnapshot();
    const a = texture();
    const b = texture();
    const side = (tex: TextureHandle, opacity = 1) => ({ texture: tex, transform: [10, 0, 0, 10, 0, 0] as Mat3, crop: { u0: 0, v0: 0, u1: 1, v1: 1 }, opacity });
    const dissolve = (mix: number, opacity = 1): DrawList => ({ width: W, height: H, background: { r: 0, g: 0, b: 0, a: 1 }, layers: [{ kind: "dissolve", transform: [W, 0, 0, H, 0, 0], opacity: 1, from: side(a, opacity), to: side(b), mix }] });
    expect(snapshot.update(dissolve(0.5))).toBe(true);
    expect(snapshot.update(dissolve(0.5))).toBe(false);
    expect(snapshot.update(dissolve(0.6))).toBe(true);
    expect(snapshot.update(dissolve(0.6, 0.5))).toBe(true);
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
