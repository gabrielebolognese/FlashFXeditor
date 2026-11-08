import { describe, expect, it } from "vitest";
import { IDENTITY_TRANSFORM } from "../core/document/placement.js";
import type { Transform } from "../core/document/types.js";
import { rectTransform } from "./mat3.js";
import {
  affineTimesHomography,
  facesAway,
  homographyTimesAffine,
  isDepthTransform,
  newHomography,
  pointInQuad,
  projectedCorners,
  projectPoint,
  unprojectPoint,
  viewingDistance,
  writeProjection,
} from "./projection.js";

const W = 1080;
const H = 1920;
const T = (patch: Partial<Transform>): Transform => ({ ...IDENTITY_TRANSFORM, ...patch });

describe("2.5D projection (spec §21.15)", () => {
  it("a flat transform projects to the identity, wherever the layer is", () => {
    const h = writeProjection(newHomography(), T({ x: 120, y: -40, rotation: 30 }), W, H, 1600);
    const expected = [1, 0, 0, 1, 0, 0, 0, 0, 1];
    h.forEach((value, i) => expect(value).toBeCloseTo(expected[i] as number, 9));
    expect(isDepthTransform(T({ x: 5 }))).toBe(false);
    expect(isDepthTransform(T({ rotationY: 1 }))).toBe(true);
  });

  it("rotationY 60 at perspective 1600 matches the CSS perspective formula (right edge away)", () => {
    const h = writeProjection(newHomography(), T({ rotationY: 60 }), W, H, 1600);
    const theta = Math.PI / 3;
    for (const dx of [-300, -100, 100, 300]) {
      for (const dy of [-200, 0, 250]) {
        const p = projectPoint(h, W / 2 + dx, H / 2 + dy);
        // CSS: rotateY(t) sends (x, y, 0) to (x cos t, y, -x sin t), z toward the viewer; perspective d scales by d / (d - z).
        const k = 1600 / (1600 + dx * Math.sin(theta));
        expect(p?.x).toBeCloseTo(W / 2 + dx * Math.cos(theta) * k, 6);
        expect(p?.y).toBeCloseTo(H / 2 + dy * k, 6);
      }
    }
  });

  it("rotationX turns the top edge away (CSS rotateX), about the layer's own anchor", () => {
    const h = writeProjection(newHomography(), T({ x: 200, rotationX: 45 }), W, H, 1600);
    const top = projectPoint(h, W / 2 + 200, H / 2 - 100);
    const bottom = projectPoint(h, W / 2 + 200, H / 2 + 100);
    // Farther: nearer the anchor row than it was.
    expect(H / 2 - (top?.y ?? 0)).toBeLessThan((bottom?.y ?? 0) - H / 2);
    // The anchor stays where it was.
    const anchor = projectPoint(h, W / 2 + 200, H / 2);
    expect(anchor?.x).toBeCloseTo(W / 2 + 200, 6);
    expect(anchor?.y).toBeCloseTo(H / 2, 6);
  });

  it("z scales toward the frame center; no perspective leaves depth flat", () => {
    const h = writeProjection(newHomography(), T({ z: 1600 }), W, H, 1600);
    const p = projectPoint(h, W / 2 + 400, H / 2);
    expect(p?.x).toBeCloseTo(W / 2 + 200, 6);
    const flat = writeProjection(newHomography(), T({ z: 1600, rotationY: 60 }), W, H, null);
    const q = projectPoint(flat, W / 2 + 400, H / 2);
    expect(q?.x).toBeCloseTo(W / 2 + 200, 6);
    expect(flat[6]).toBe(0);
    expect(viewingDistance(undefined)).toBe(1600);
    expect(viewingDistance(null)).toBeNull();
    expect(viewingDistance(900)).toBe(900);
  });

  it("unprojectPoint inverts projectPoint; points past the horizon show nothing", () => {
    const h = writeProjection(newHomography(), T({ rotationY: 50, rotationX: -20, z: 300, rotation: 15 }), W, H, 1600);
    const p = projectPoint(h, 700, 1100);
    const back = p ? unprojectPoint(h, p.x, p.y) : null;
    expect(back?.x).toBeCloseTo(700, 6);
    expect(back?.y).toBeCloseTo(1100, 6);
  });

  it("composes with affine maps on either side", () => {
    const h = writeProjection(newHomography(), T({ rotationY: 30 }), W, H, 1600);
    const model = rectTransform(100, 200, 300, 400);
    const hm = homographyTimesAffine(newHomography(), h, model);
    const direct = projectPoint(h, 100 + 0.5 * 300, 200 + 0.25 * 400);
    const composed = projectPoint(hm, 0.5, 0.25);
    expect(composed?.x).toBeCloseTo(direct?.x ?? NaN, 9);
    expect(composed?.y).toBeCloseTo(direct?.y ?? NaN, 9);
    const view = rectTransform(10, 20, 0.5, 0.5);
    const vh = affineTimesHomography(newHomography(), view, hm);
    const viewed = projectPoint(vh, 0.5, 0.25);
    expect(viewed?.x).toBeCloseTo(10 + 0.5 * (direct?.x ?? NaN), 9);
  });

  it("projected corners, point-in-quad hit tests and the back face", () => {
    const model = rectTransform(W / 2 - 200, H / 2 - 300, 400, 600);
    const corners: number[] = [];
    const turned = writeProjection(newHomography(), T({ rotationY: 70 }), W, H, 1600);
    expect(projectedCorners(corners, turned, model, 1, 1)).toBe(true);
    // The flat box's left part is outside the projected quad.
    expect(pointInQuad(corners, W / 2 - 180, H / 2)).toBe(false);
    expect(pointInQuad(corners, W / 2 - 20, H / 2)).toBe(true);
    expect(facesAway(turned, model, 1, 1)).toBe(false);
    expect(facesAway(writeProjection(newHomography(), T({ rotationY: 120 }), W, H, 1600), model, 1, 1)).toBe(true);
    expect(facesAway(writeProjection(newHomography(), T({ rotationX: -100 }), W, H, null), model, 1, 1)).toBe(true);
    // A layer through the viewer's plane has no corners.
    expect(projectedCorners(corners, writeProjection(newHomography(), T({ z: -1700 }), W, H, 1600), model, 1, 1)).toBe(false);
  });
});
