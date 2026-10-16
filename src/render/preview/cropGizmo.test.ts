import { describe, expect, it } from "vitest";
import type { Crop, Transform } from "../../core/document/types.js";
import { MIN_CROP_PX } from "../../timeline/edit/crop.js";
import { IDENTITY_TRANSFORM, layerCorners, layerPoint, type ContentBox, type Point } from "../../timeline/edit/transform.js";
import { contentPoint, cropGesture, type CropStart } from "./cropGizmo.js";
import { handlePoint, hitGizmo } from "./gizmo.js";

const FRAME = { width: 1080, height: 1920 };
const t = (fields: Partial<Transform> = {}): Transform => ({ ...IDENTITY_TRANSFORM, ...fields, anchor: { ...IDENTITY_TRANSFORM.anchor, ...fields.anchor } });
const full = (width: number, height: number): ContentBox => ({ width, height, left: 0, top: 0, right: width, bottom: height });

/** A 1920 x 1080 media at scale 0.5 centered: shown 960 x 540, from (60, 690) to (1020, 1230). */
function start(fields: Partial<CropStart> = {}): CropStart {
  return { clipId: "c", transform: t({ scale: 0.5 }), box: full(1920, 1080), frame: FRAME, ...fields };
}

function expectCrop(actual: Crop, expected: Crop, digits = 9): void {
  for (const key of ["left", "top", "right", "bottom"] as const) expect(actual[key]).toBeCloseTo(expected[key], digits);
}

const NO_MODS = { alt: false };

describe("contentPoint", () => {
  it("inverts layerPoint for turned, uneven, off-anchor layers", () => {
    const transform = t({ x: 30, y: -12, scale: 0.7, scaleY: 1.3, rotation: 33, anchor: { x: 0.2, y: 0.9 } });
    const box = { width: 640, height: 360 };
    const p = layerPoint(transform, box, FRAME, 123, 45);
    const q = contentPoint(transform, box, FRAME, p);
    expect(q.x).toBeCloseTo(123, 9);
    expect(q.y).toBeCloseTo(45, 9);
  });
});

describe("cropGesture (spec §7.3 crop handles)", () => {
  it("moves the dragged edges to the pointer, the box with them", () => {
    // The west handle to x = 300 on the frame: 480 media px in from the left.
    const west = cropGesture(start(), "w", { x: 300, y: 900 }, NO_MODS, false);
    expectCrop(west.crop, { left: 0.25, top: 0, right: 0, bottom: 0 });
    expect(west.box[0]).toEqual({ x: 300, y: 690 });
    expect(west.readout).toBe("L 480 · 1440 × 1080");
    // The south-east corner up and left: both of its edges.
    const corner = cropGesture(start(), "se", { x: 780, y: 1095 }, NO_MODS, false);
    expectCrop(corner.crop, { left: 0, top: 0, right: 0.25, bottom: 0.25 });
    expect(corner.readout).toBe("R 480 · B 270 · 1440 × 810");
  });

  it("clamps to the media and keeps a px before the opposite edge", () => {
    expectCrop(cropGesture(start(), "w", { x: -500, y: 900 }, NO_MODS, false).crop, { left: 0, top: 0, right: 0, bottom: 0 });
    const past = cropGesture(start(), "e", { x: 0, y: 900 }, NO_MODS, false);
    expect((1 - past.crop.right) * 1920).toBeCloseTo(MIN_CROP_PX, 9);
  });

  it("crops around the center with Alt", () => {
    const both = cropGesture(start(), "e", { x: 780, y: 900 }, { alt: true }, false);
    expectCrop(both.crop, { left: 0.25, top: 0, right: 0.25, bottom: 0 });
    expect(both.readout).toBe("L 480 · R 480 · 960 × 1080");
  });

  it("keeps the visible aspect with the lock: corners from the opposite corner, edges around the other axis' center", () => {
    // The south-east corner dragged in along the diagonal: 16:9 stays, the north-west corner stays.
    const corner = cropGesture(start(), "se", { x: 540, y: 960 }, NO_MODS, true);
    expectCrop(corner.crop, { left: 0, top: 0, right: 0.5, bottom: 0.5 });
    // Off the diagonal: projected on it.
    const off = cropGesture(start(), "se", { x: 540, y: 1100 }, NO_MODS, true);
    expect((1 - off.crop.right - off.crop.left) / (1 - off.crop.bottom - off.crop.top)).toBeCloseTo(1, 9);
    // The east edge to the middle: 960 wide, so 540 tall around the vertical center.
    const edge = cropGesture(start(), "e", { x: 540, y: 600 }, NO_MODS, true);
    expectCrop(edge.crop, { left: 0, top: 0.25, right: 0.5, bottom: 0.25 });
    expect(edge.readout).toBe("T 270 · R 960 · B 270 · 960 × 540");
    // A locked corner cannot leave the media.
    const out = cropGesture(start(), "nw", { x: -900, y: -900 }, NO_MODS, true);
    expectCrop(out.crop, { left: 0, top: 0, right: 0, bottom: 0 });
  });

  it("works in the layer's own axes: turned and flipped layers crop the edge under the handle", () => {
    // Turned a quarter: the content's top runs down the frame's right side.
    const turned = start({ transform: t({ scale: 0.5, rotation: 90 }) });
    const north = handlePoint(layerCorners(turned.transform, turned.box, FRAME), "n");
    expect(north).toEqual({ x: 810, y: 960 });
    const moved = cropGesture(turned, "n", { x: north.x - 135, y: north.y }, NO_MODS, false);
    expectCrop(moved.crop, { left: 0, top: 0.25, right: 0, bottom: 0 });
    // Flips mirror the picture in its box, not the box: the west handle still crops `left`.
    const flipped = cropGesture(start({ transform: t({ scale: 0.5, flipH: true }) }), "w", { x: 300, y: 900 }, NO_MODS, false);
    expectCrop(flipped.crop, { left: 0.25, top: 0, right: 0, bottom: 0 });
  });

  it("starts from the current crop", () => {
    const cropped = start({ box: { width: 1920, height: 1080, left: 480, top: 0, right: 1920, bottom: 1080 } });
    const p: Point = { x: 540, y: 900 };
    expectCrop(cropGesture(cropped, "w", p, NO_MODS, false).crop, { left: 0.5, top: 0, right: 0, bottom: 0 });
  });
});

describe("hitGizmo in crop mode", () => {
  it("has no rotate zones: crop handles, the body, or nothing", () => {
    const box = [
      { x: 100, y: 100 },
      { x: 300, y: 100 },
      { x: 300, y: 200 },
      { x: 100, y: 200 },
    ] as const;
    const metrics = { handleHit: 12, rotateZone: 16, minEdge: 28 };
    const screen = [1, 0, 0, 1, 0, 0] as const;
    expect(hitGizmo(box, screen, 92, 92, metrics)).toEqual({ kind: "rotate", corner: "nw" });
    expect(hitGizmo(box, screen, 92, 92, metrics, true)).toBeNull();
    expect(hitGizmo(box, screen, 102, 102, metrics, true)).toEqual({ kind: "handle", handle: "nw" });
    expect(hitGizmo(box, screen, 200, 150, metrics, true)).toEqual({ kind: "body" });
  });
});
