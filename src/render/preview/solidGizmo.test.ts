import { describe, expect, it } from "vitest";
import type { Transform } from "../../core/document/types.js";
import { defaultSolid } from "../../timeline/edit/solid.js";
import { IDENTITY_TRANSFORM, layerPoint } from "../../timeline/edit/transform.js";
import { solidSizeGesture, type SolidGestureStart } from "./solidGizmo.js";

const frame = { width: 1080, height: 1920 };
const t = (fields: Partial<Transform> = {}): Transform => ({ ...IDENTITY_TRANSFORM, ...fields });

function start(transform: Transform): SolidGestureStart {
  return { clipId: "s", look: { ...defaultSolid(frame), size: { w: 200, h: 100 } }, transform, frame };
}

describe("solidSizeGesture", () => {
  it("turns the scale a handle asks for into a size at the solid's own scale, the opposite corner in place", () => {
    const s = start(t({ x: 10, y: 20 }));
    const result = solidSizeGesture(s, t({ x: 60, y: 45, scale: 1.5 }), "se", { alt: false });
    expect(result.look.size).toEqual({ w: 300, h: 150 });
    expect(result.look.cornerRadius).toBe(s.look.cornerRadius);
    expect(result.transform.scale).toBe(1);
    // The nw corner stays at (540 + 10 - 100, 960 + 20 - 50).
    expect(layerPoint(result.transform, { width: 300, height: 150 }, frame, 0, 0)).toEqual({ x: 450, y: 930 });
    expect(result.readout).toBe("300 × 150 px");
    expect(result.box[0]).toEqual({ x: 450, y: 930 });
    expect(result.box[2]).toEqual({ x: 750, y: 1080 });
  });

  it("sizes per axis from a side, from the center with Alt, rounded to whole px, on a turned and scaled solid", () => {
    const s = start(t({ rotation: 30, scale: 2 }));
    const side = solidSizeGesture(s, t({ rotation: 30, scale: 2.5, scaleY: 2 }), "e", { alt: false });
    expect(side.look.size).toEqual({ w: 250, h: 100 });
    expect(side.transform.scale).toBe(2);
    // The left side's middle stays where it was on the frame.
    const before = layerPoint(s.transform, { width: 200, height: 100 }, frame, 0, 50);
    const after = layerPoint(side.transform, { width: 250, height: 100 }, frame, 0, 50);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
    const centered = solidSizeGesture(s, t({ rotation: 30, scale: 2.01, scaleY: 3.333 }), "se", { alt: true });
    expect(centered.look.size).toEqual({ w: 201, h: 167 });
    const c0 = layerPoint(s.transform, { width: 200, height: 100 }, frame, 100, 50);
    const c1 = layerPoint(centered.transform, { width: 201, height: 167 }, frame, 100.5, 83.5);
    expect(c1.x).toBeCloseTo(c0.x, 9);
    expect(c1.y).toBeCloseTo(c0.y, 9);
  });
});
