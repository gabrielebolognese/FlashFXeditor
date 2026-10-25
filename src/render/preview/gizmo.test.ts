import { describe, expect, it } from "vitest";
import type { Transform } from "../../core/document/types.js";
import { IDENTITY_TRANSFORM, layerCorners, layerPoint, scaleYOf, type ContentBox } from "../../timeline/edit/transform.js";
import type { Mat3 } from "../mat3.js";
import {
  anchorGesture,
  AngleTracker,
  gizmoBoxOf,
  handlePoint,
  hitGizmo,
  moveDelta,
  moveGesture,
  resizeCursor,
  rotateGesture,
  rotationPivot,
  scaleGesture,
  snapRotation,
  type GestureStart,
  type HeldLayer,
} from "./gizmo.js";

const FRAME = { width: 1080, height: 1920 };
const BOX: ContentBox = { width: 200, height: 100, left: 0, top: 0, right: 200, bottom: 100 };
const t = (fields: Partial<Transform> = {}): Transform => ({ ...IDENTITY_TRANSFORM, ...fields });
const NONE = { shift: false, alt: false };

function start(layers: { id: string; transform: Transform; box?: ContentBox }[]): GestureStart {
  const held: HeldLayer[] = layers.map((layer) => ({ clipId: layer.id, transform: layer.transform, box: layer.box ?? BOX }));
  const box = gizmoBoxOf(held.map((layer) => layerCorners(layer.transform, layer.box, FRAME)));
  if (!box) throw new Error("no box");
  return { layers: held, box, frame: FRAME };
}

const result = (r: { transforms: Map<string, Transform> }, id = "a") => r.transforms.get(id) as Transform;

function closeTo(actual: { x: number; y: number }, expected: { x: number; y: number }, digits = 6) {
  expect(actual.x).toBeCloseTo(expected.x, digits);
  expect(actual.y).toBeCloseTo(expected.y, digits);
}

describe("gizmo hit zones (spec §7.3)", () => {
  // Fit-like screen: 0.5 device px per project px, offset (10, 20).
  const screen: Mat3 = [0.5, 0, 0, 0.5, 10, 20];
  const metrics = { handleHit: 12, rotateZone: 16, minEdge: 24 };
  const box = start([{ id: "a", transform: t() }]).box;
  const at = (handle: Parameters<typeof handlePoint>[1]) => {
    const p = handlePoint(box, handle);
    return { x: p.x * 0.5 + 10, y: p.y * 0.5 + 20 };
  };

  it("takes handles first (corners before edges), then the body, then the rotate zones outside the corners", () => {
    const ne = at("ne");
    expect(hitGizmo(box, screen, ne.x + 5, ne.y - 5, metrics)).toEqual({ kind: "handle", handle: "ne" });
    const e = at("e");
    expect(hitGizmo(box, screen, e.x, e.y, metrics)).toEqual({ kind: "handle", handle: "e" });
    expect(hitGizmo(box, screen, e.x - 20, e.y, metrics)).toEqual({ kind: "body" });
    expect(hitGizmo(box, screen, ne.x + 12, ne.y - 8, metrics)).toEqual({ kind: "rotate", corner: "ne" });
    expect(hitGizmo(box, screen, ne.x + 30, ne.y - 30, metrics)).toBeNull();
  });

  it("drops the edge handles of a side too short on screen", () => {
    const small = { ...metrics, minEdge: 60 };
    // The box is 100 x 50 device px: its left and right sides are 50 px long.
    const e = at("e");
    expect(hitGizmo(box, screen, e.x, e.y, small)).toEqual({ kind: "body" });
    const n = at("n");
    expect(hitGizmo(box, screen, n.x, n.y, small)).toEqual({ kind: "handle", handle: "n" });
  });

  it("orients the resize cursors with the box", () => {
    expect(resizeCursor(box, screen, "e")).toBe("ew-resize");
    expect(resizeCursor(box, screen, "s")).toBe("ns-resize");
    const turned = start([{ id: "a", transform: t({ rotation: 90 }) }]).box;
    expect(resizeCursor(turned, screen, "e")).toBe("ns-resize");
  });
});

describe("move (spec §7.3)", () => {
  it("moves every layer by whole px, Shift on the dominant axis only", () => {
    const s = start([
      { id: "a", transform: t({ x: 0.25 }) },
      { id: "b", transform: t({ x: 100, y: 50 }) },
    ]);
    const r = moveGesture(s, 10.6, -3.2, NONE);
    expect(result(r)).toMatchObject({ x: 11.25, y: -3 });
    expect(result(r, "b")).toMatchObject({ x: 111, y: 47 });
    expect(r.readout).toBe("ΔX +11 · ΔY -3");
    expect(result(moveGesture(s, 10, -30, { shift: true, alt: false }))).toMatchObject({ x: 0.25, y: -30 });
    expect(moveGesture(start([{ id: "a", transform: t({ x: 4 }) }]), 6, 1, NONE).readout).toBe("X 10 · Y 1");
  });

  it("adds a snap offset after the rounding (spec §7.4: a snapped axis lands on its target)", () => {
    const s = start([{ id: "a", transform: t() }]);
    const r = moveGesture(s, 10.6, -3.2, NONE, { x: -0.5, y: 0 });
    expect(result(r)).toMatchObject({ x: 10.5, y: -3 });
    expect(r.box[0]).toEqual({ x: 450.5, y: 907 });
    expect(moveDelta(10, -30, true)).toEqual({ x: 0, y: -30, free: { x: false, y: true } });
    expect(moveDelta(10.4, -3, false)).toEqual({ x: 10, y: -3, free: { x: true, y: true } });
  });
});

describe("scale (spec §7.3)", () => {
  // The 200 x 100 box centered on the frame: corners (440, 910) to (640, 1010).
  const s = start([{ id: "a", transform: t() }]);

  it("keeps the aspect on a corner, the opposite corner fixed", () => {
    const r = scaleGesture(s, "se", { x: 840, y: 1010 }, NONE);
    const a = result(r);
    expect(a.scale).toBeCloseTo(scaleYOf(a), 12);
    // Projected on the diagonal: (400 * 200 + 100 * 100) / (200² + 100²) = 1.8.
    expect(a.scale).toBeCloseTo(1.8, 12);
    closeTo(layerPoint(a, BOX, FRAME, 0, 0), { x: 440, y: 910 });
    expect(r.readout).toBe("180%");
  });

  it("scales the axes apart with Shift+corner and one axis on an edge (writing scaleY)", () => {
    const free = result(scaleGesture(s, "se", { x: 840, y: 1010 }, { shift: true, alt: false }));
    expect(free.scale).toBeCloseTo(2, 12);
    expect(scaleYOf(free)).toBeCloseTo(1, 12);
    const edge = result(scaleGesture(s, "s", { x: 900, y: 1110 }, NONE));
    expect(edge.scale).toBe(1);
    expect(edge.scaleY).toBeCloseTo(2, 12);
    closeTo(layerPoint(edge, BOX, FRAME, 0, 0), { x: 440, y: 910 });
  });

  it("scales around the center with Alt", () => {
    const a = result(scaleGesture(s, "se", { x: 740, y: 1060 }, { shift: false, alt: true }));
    expect(a.scale).toBeCloseTo(2, 12);
    closeTo(layerPoint(a, BOX, FRAME, 100, 50), { x: 540, y: 960 });
  });

  it("works in the layer's axes when it is turned", () => {
    const turned = start([{ id: "a", transform: t({ rotation: 90 }) }]);
    // Turned clockwise, the content's bottom edge faces left: its `s` handle sits left of the center.
    closeTo(handlePoint(turned.box, "s"), { x: 490, y: 960 });
    const a = result(scaleGesture(turned, "s", { x: 390, y: 960 }, NONE));
    expect(a.scaleY).toBeCloseTo(2, 12);
    closeTo(layerPoint(a, BOX, FRAME, 100, 0), { x: 590, y: 960 });
  });

  it("snaps to 100% within 2% and never goes under the minimum", () => {
    const half = start([{ id: "a", transform: t({ scale: 0.5 }) }]);
    // 0.5 -> 1.015 would be 101.5%: snapped to 100%.
    const r = scaleGesture(half, "e", { x: 540 - 50 + 203, y: 960 }, NONE);
    expect(result(r).scale).toBe(1);
    expect(r.snapX).toBe(true);
    const past = result(scaleGesture(s, "se", { x: 100, y: 500 }, NONE));
    expect(past.scale).toBeCloseTo(0.01, 12);
    // Snapping off (§7.4's one snap state): no 100% snap.
    const free = scaleGesture(half, "e", { x: 540 - 50 + 203, y: 960 }, NONE, false);
    expect(result(free).scale).toBeCloseTo(1.015, 12);
    expect(free.snapX).toBe(false);
  });

  it("scales a group around its box: positions and sizes proportionally", () => {
    const g = start([
      { id: "a", transform: t({ x: -200 }) },
      { id: "b", transform: t({ x: 200, y: 100 }) },
    ]);
    // Group box (240, 910) to (840, 1110); the se handle doubled from the nw corner.
    const r = scaleGesture(g, "se", { x: 1440, y: 1310 }, NONE);
    const a = result(r);
    const b = result(r, "b");
    expect(a.scale).toBeCloseTo(2, 12);
    expect(b.scale).toBeCloseTo(2, 12);
    // Anchors: a (340, 960) -> (440, 1010); b (740, 1060) -> (1240, 1210).
    expect(a.x).toBeCloseTo(440 - 540, 9);
    expect(a.y).toBeCloseTo(1010 - 960, 9);
    expect(b.x).toBeCloseTo(1240 - 540, 9);
    expect(b.y).toBeCloseTo(1210 - 960, 9);
    closeTo(r.box[2], { x: 1440, y: 1310 });
  });
});

describe("rotate (spec §7.3)", () => {
  it("snaps to 45° multiples within 3° with Shift, else free at 0.1°", () => {
    expect(snapRotation(43.2, true)).toBe(45);
    expect(snapRotation(-88, true)).toBe(-90);
    expect(snapRotation(40, true)).toBe(40);
    expect(snapRotation(43.26, false)).toBe(43.3);
    expect(Object.is(snapRotation(-0.01, false), -0)).toBe(false);
  });

  it("turns one layer around its anchor and a group around its box center", () => {
    const single = start([{ id: "a", transform: t({ rotation: 10 }) }]);
    const r = rotateGesture(single, 34, { shift: true, alt: false });
    expect(result(r).rotation).toBe(45);
    expect(result(r)).toMatchObject({ x: 0, y: 0 });
    expect(r.readout).toBe("45.0°");
    const g = start([
      { id: "a", transform: t({ x: -200 }) },
      { id: "b", transform: t({ x: 200 }) },
    ]);
    const turned = rotateGesture(g, 90, NONE);
    expect(result(turned).rotation).toBe(90);
    expect(result(turned).x).toBeCloseTo(0, 9);
    expect(result(turned).y).toBeCloseTo(-200, 9);
    expect(result(turned, "b").y).toBeCloseTo(200, 9);
  });

  it("unwraps the pointer angle across ±180° so full turns add up", () => {
    const pivot = rotationPivot(start([{ id: "a", transform: t() }]));
    const tracker = new AngleTracker(pivot, { x: pivot.x - 100, y: pivot.y - 1 });
    tracker.update({ x: pivot.x - 100, y: pivot.y + 1 });
    expect(tracker.total).toBeCloseTo(-1.1459, 3);
    for (const [dx, dy] of [
      [0, -100],
      [100, 0],
      [0, 100],
      [-100, 0],
      [0, -100],
    ] as const)
      tracker.update({ x: pivot.x + dx, y: pivot.y + dy });
    expect(tracker.total).toBeCloseTo(360 + 90 - 0.573, 2);
  });
});

describe("anchor (spec §7.3)", () => {
  it("moves the anchor under the pointer and keeps the layer in place", () => {
    const s = start([{ id: "a", transform: t({ x: 30, rotation: 30, scale: 2 }) }]);
    const before = layerCorners(s.layers[0]!.transform, BOX, FRAME);
    const r = anchorGesture(s, { x: 700, y: 900 });
    const a = result(r);
    expect(a).toMatchObject({ x: 700 - 540, y: 900 - 960 });
    const after = layerCorners(a, BOX, FRAME);
    for (let i = 0; i < 4; i++) closeTo(after[i]!, before[i]!);
  });
});
