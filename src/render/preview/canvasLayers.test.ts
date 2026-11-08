import { describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeSolidClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { Clip, Project, Track, Transform } from "../../core/document/types.js";
import { IDENTITY_TRANSFORM } from "../../timeline/edit/transform.js";
import { canvasLayersAt, layersInRect, layersUnder, pictureLayersAt, pointInQuad, quadIntersectsRect, quadsBounds, type Quad } from "./canvasLayers.js";

const t = (fields: Partial<Transform> = {}): Transform => ({ ...IDENTITY_TRANSFORM, ...fields });

/** V1..V3 with a 100 x 100 solid each, all at the frame center (540, 960). */
function project(tracks: Partial<Track>[] = [{}, {}, {}], extra: Clip[] = []): Project {
  const p = makeProject();
  p.media.m = { ...makeMedia("m"), width: 200, height: 100 };
  p.tracks = [...tracks.map((fields, i) => ({ ...makeTrack(`v${i + 1}`), ...fields })), makeTrack("a1", "audio")];
  const clips: Clip[] = tracks.map((_, i) => makeSolidClip({ id: `s${i + 1}`, trackId: `v${i + 1}`, start: 0, duration: 30 }));
  return withClips(p, [...clips, ...extra]);
}

describe("canvas layers (spec §7.2)", () => {
  it("lists the video layers at the frame bottom first with their visible quads", () => {
    const layers = canvasLayersAt(project(), 10);
    expect(layers.map((layer) => layer.clipId)).toEqual(["s1", "s2", "s3"]);
    expect(layers[0]?.quad).toEqual([
      { x: 490, y: 910 },
      { x: 590, y: 910 },
      { x: 590, y: 1010 },
      { x: 490, y: 1010 },
    ]);
    expect(canvasLayersAt(project(), 30)).toEqual([]);
  });

  it("hits media on a gesture's ephemeral crop before their own (spec §7.2, Batch 26)", () => {
    // The 200 x 100 media centered, its left half cropped away: 100 x 100 from x 540.
    const p = project([{}], [{ ...makeMediaClip(makeProject(), { id: "m1", trackId: "v1", start: 40, duration: 10, mediaId: "m" }), crop: { left: 0.5, top: 0, right: 0, bottom: 0 } }]);
    const [layer] = canvasLayersAt(p, 40);
    expect(layer?.quad[0]).toEqual({ x: 540, y: 910 });
    expect(layersUnder(canvasLayersAt(p, 40), 500, 960)).toEqual([]);
    const live = canvasLayersAt(p, 40, null, new Map([["m1", { left: 0, top: 0, right: 0.5, bottom: 0 }]]));
    expect(live[0]?.quad[0]).toEqual({ x: 440, y: 910 });
    expect(layersUnder(live, 500, 960).map((hit) => hit.clipId)).toEqual(["m1"]);
  });

  it("skips hidden and locked tracks and disabled clips; keeps muted ones", () => {
    const p = project([{ hidden: true }, { locked: true }, { muted: true }]);
    expect(canvasLayersAt(p, 0).map((layer) => layer.clipId)).toEqual(["s3"]);
    const q = project([{}, {}, {}]);
    (q.clips.s2 as { enabled: boolean }).enabled = false;
    expect(canvasLayersAt(q, 0).map((layer) => layer.clipId)).toEqual(["s1", "s3"]);
  });

  it("lists the picture's layers as the compositor draws them: locked kept, hidden and muted skipped (§7.4)", () => {
    const p = project([{ hidden: true }, { locked: true }, { muted: true }, {}]);
    (p.clips.s4 as { enabled: boolean }).enabled = false;
    const layers = pictureLayersAt(p, 0);
    expect(layers.map((layer) => layer.clipId)).toEqual(["s2"]);
    expect(layers[0]?.quad).toEqual(canvasLayersAt(project(), 0)[0]?.quad);
  });

  it("uses a gesture's transforms and the crop of media layers", () => {
    const p = project([{}], [{ ...makeMediaClip(makeProject(), { id: "v", trackId: "v1", start: 40, duration: 10, mediaId: "m" }), crop: { left: 0.5, top: 0, right: 0, bottom: 0 } }]);
    const [solid] = canvasLayersAt(p, 0, new Map([["s1", t({ x: 100 })]]));
    expect(solid?.quad[0]).toEqual({ x: 590, y: 910 });
    const [media] = canvasLayersAt(p, 40);
    // The right half of the 200 x 100 picture, centered on the full picture's anchor.
    expect(media?.quad[0]).toEqual({ x: 540, y: 910 });
    expect(media?.quad[2]).toEqual({ x: 640, y: 1010 });
  });

  it("hits the top layer first and cycles through what is under the pointer", () => {
    const p = project();
    (p.clips.s3 as { transform: Transform }).transform = t({ x: 300 });
    const layers = canvasLayersAt(p, 0);
    expect(layersUnder(layers, 540, 960).map((layer) => layer.clipId)).toEqual(["s2", "s1"]);
    expect(layersUnder(layers, 840, 960).map((layer) => layer.clipId)).toEqual(["s3"]);
    expect(layersUnder(layers, 10, 10)).toEqual([]);
  });

  it("tests points against turned quads and quads against rectangles", () => {
    // A diamond around (0, 0).
    const diamond: Quad = [
      { x: 0, y: -10 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
      { x: -10, y: 0 },
    ];
    expect(pointInQuad(diamond, 0, 0)).toBe(true);
    expect(pointInQuad(diamond, 8, 8)).toBe(false);
    expect(pointInQuad(diamond, 10, 0)).toBe(true);
    // The rectangle's corner region next to the diamond's edge: no overlap; the bounding boxes do overlap.
    expect(quadIntersectsRect(diamond, { x0: 6, y0: 6, x1: 20, y1: 20 })).toBe(false);
    expect(quadIntersectsRect(diamond, { x0: 4, y0: 4, x1: 20, y1: 20 })).toBe(true);
    expect(quadIntersectsRect(diamond, { x0: -1, y0: -1, x1: 1, y1: 1 })).toBe(true);
  });

  it("selects by marquee what intersects it (in either drag direction) and bounds a group", () => {
    const p = project();
    (p.clips.s1 as { transform: Transform }).transform = t({ x: -300 });
    (p.clips.s3 as { transform: Transform }).transform = t({ x: 300, rotation: 45 });
    const layers = canvasLayersAt(p, 0);
    expect(layersInRect(layers, { x0: 600, y0: 900, x1: 200, y1: 1000 }).map((layer) => layer.clipId)).toEqual(["s1", "s2"]);
    expect(layersInRect(layers, { x0: 780, y0: 900, x1: 790, y1: 910 })).toEqual([]);
    const bounds = quadsBounds(layers.map((layer) => layer.quad));
    expect(bounds?.x0).toBeCloseTo(190, 9);
    expect(bounds?.x1).toBeCloseTo(840 + 50 * Math.SQRT2, 9);
    expect(quadsBounds([])).toBeNull();
  });
});

describe("2.5D layers on the canvas (spec §21.15, Batch 70)", () => {
  /** One 400 x 400 solid at the frame center (340..740, 760..1160), turned with `fields`. */
  function card(fields: Partial<Transform>, clip: Partial<Clip> = {}): Project {
    const p = project([{}]);
    Object.assign(p.clips.s1 as Clip, { transform: t({ scale: 4, ...fields }), ...clip });
    return p;
  }

  it("hits a card turned 60° on Y on its projected shape, not on its flat box", () => {
    const [layer] = canvasLayersAt(card({ rotationY: 60 }), 0);
    expect(layer?.persp).toBeDefined();
    expect(layer?.flat?.[1]).toEqual({ x: 740, y: 760 });
    // The right side turned away (x 540 + 100 * 1600 / (1600 + 173.2)), the left one closer.
    expect(layer?.quad[1].x).toBeCloseTo(540 + (100 * 1600) / (1600 + 200 * Math.sin(Math.PI / 3)), 6);
    expect(layer?.quad[0].x).toBeCloseTo(540 - (100 * 1600) / (1600 - 200 * Math.sin(Math.PI / 3)), 6);
    const layers = canvasLayersAt(card({ rotationY: 60 }), 0);
    // Inside the flat box but past the projected right side: a miss.
    expect(layersUnder(layers, 700, 960)).toEqual([]);
    // Left of the flat center, inside the projected shape (its closer left side is at x 428).
    expect(layersUnder(layers, 440, 960).map((hit) => hit.clipId)).toEqual(["s1"]);
    expect(layersUnder(layers, 560, 960).map((hit) => hit.clipId)).toEqual(["s1"]);
    // A marquee takes it on its projected quad too.
    expect(layersInRect(layers, { x0: 680, y0: 900, x1: 730, y1: 1000 })).toEqual([]);
  });

  it("follows a gesture's live tilt, and leaves a flat layer's quad as it was", () => {
    const flat = canvasLayersAt(card({}), 0)[0];
    expect(flat?.persp).toBeUndefined();
    expect(flat?.quad[1]).toEqual({ x: 740, y: 760 });
    const live = canvasLayersAt(card({}), 0, new Map([["s1", t({ scale: 4, rotationX: 45 })]]))[0];
    // Top side away: narrower than the bottom.
    const top = (live?.quad[1].x ?? 0) - (live?.quad[0].x ?? 0);
    const bottom = (live?.quad[2].x ?? 0) - (live?.quad[3].x ?? 0);
    expect(top).toBeLessThan(400);
    expect(bottom).toBeGreaterThan(400);
  });

  it("leaves out what the compositor does not draw: a hidden back side, a layer through the viewer's plane", () => {
    expect(canvasLayersAt(card({ rotationY: 120 }), 0)).toHaveLength(1);
    expect(canvasLayersAt(card({ rotationY: 120 }, { backfaceHidden: true }), 0)).toEqual([]);
    expect(canvasLayersAt(card({ rotationY: 30 }, { backfaceHidden: true }), 0)).toHaveLength(1);
    expect(canvasLayersAt(card({ z: -1700 }), 0)).toEqual([]);
  });

  it("projects with the document's perspective: none keeps the turned card's parallel shape", () => {
    const p = card({ rotationY: 60 });
    p.settings.perspective = null;
    const [layer] = canvasLayersAt(p, 0);
    expect(layer?.quad[1].x).toBeCloseTo(640, 6);
    expect(layer?.quad[0].x).toBeCloseTo(440, 6);
  });
});
