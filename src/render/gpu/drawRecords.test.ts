import { describe, expect, it } from "vitest";
import type { RGBA } from "../../core/document/types.js";
import { FULL_UV, type DrawList, type Layer, type MaskFrame } from "../compositor/drawList.js";
import { applyToPoint, IDENTITY, mutableIdentity, rectTransform, type Mat3 } from "../mat3.js";
import { blurRegionInto, DrawRecords, MASK_MAP, MAX_BLUR_SIGMA, premultipliedInto, showBlurred, writeMaskMap, type BlurRegion } from "./drawRecords.js";
import { SHAPE_CODE } from "./layerUniforms.js";
import type { Pane, TextureHandle, Viewport } from "./renderer.js";

class FakeTexture implements TextureHandle {
  readonly mipLevels = 1;
  readonly bytes = 0;
  valid = true;
  constructor(
    readonly width: number,
    readonly height: number,
  ) {}
  destroy(): void {
    this.valid = false;
  }
}

const usable = (texture: TextureHandle): texture is FakeTexture => texture instanceof FakeTexture && texture.valid;
const RED: RGBA = { r: 1, g: 0, b: 0, a: 1 };
const BLACK: RGBA = { r: 0, g: 0, b: 0, a: 1 };

function list(layers: Layer[], width = 100, height = 200): DrawList {
  return { width, height, background: BLACK, layers };
}

function pane(drawList: DrawList, transform: Mat3, bounds = { x: 0, y: 0, width: 400, height: 400 }, border: Viewport["border"] = null): Pane {
  return { list: drawList, viewport: { transform, outside: BLACK, border }, bounds };
}

const corner = (m: Mat3, x: number, y: number) => applyToPoint(m, x, y);

describe("DrawRecords", () => {
  it("draws the background and a textured layer mapped to target px, clipped to the frame", () => {
    const texture = new FakeTexture(50, 50);
    const records = new DrawRecords(usable);
    const layer: Layer = { kind: "texture", texture, transform: rectTransform(10, 20, 30, 40), opacity: 0.5, crop: { u0: 0.1, v0: 0.2, u1: 0.9, v1: 0.8 }, flipX: true, flipY: false };
    // Project px -> target px: x2 and moved by (50, 0).
    const count = records.build([pane(list([layer]), [2, 0, 0, 2, 50, 0])], 400, 400);
    expect(count).toBe(2);
    const background = records.at(0);
    expect(background.kind).toBe("solid");
    expect(background.uniform.color).toEqual(BLACK);
    expect(corner(background.uniform.transform, 1, 1)).toEqual({ x: 250, y: 400 });
    expect(background.scissor).toEqual({ x: 50, y: 0, width: 200, height: 400 });
    const textured = records.at(1);
    expect(textured.kind).toBe("textured");
    expect(textured.texture0).toBe(texture);
    expect(corner(textured.uniform.transform, 0, 0)).toEqual({ x: 70, y: 40 });
    expect(corner(textured.uniform.transform, 1, 1)).toEqual({ x: 130, y: 120 });
    expect(textured.uniform.uv).toEqual({ u0: 0.1, v0: 0.2, u1: 0.9, v1: 0.8 });
    expect(textured.uniform.opacity).toBe(0.5);
    expect(textured.uniform.flipX).toBe(true);
    expect(textured.scissor).toEqual(background.scissor);
  });

  it("skips layers whose texture is dead or of another backend", () => {
    const dead = new FakeTexture(10, 10);
    dead.destroy();
    const foreign: TextureHandle = { width: 10, height: 10, mipLevels: 1, bytes: 0, valid: true, destroy: () => undefined };
    const records = new DrawRecords(usable);
    const layers: Layer[] = [dead, foreign].map((texture) => ({ kind: "texture", texture, transform: IDENTITY, opacity: 1, crop: FULL_UV, flipX: false, flipY: false }));
    expect(records.build([pane(list(layers), IDENTITY)], 400, 400)).toBe(1);
  });

  it("adds the border around the frame, clipped to the pane, and clips the frame to the pane", () => {
    const records = new DrawRecords(usable);
    const red = { color: RED, width: 2 };
    // The frame (100 x 200 at 1x, from (150, -50)) sticks out of the pane's top.
    const count = records.build([pane(list([]), [1, 0, 0, 1, 150, -50], { x: 100, y: 0, width: 300, height: 300 }, red)], 400, 400);
    expect(count).toBe(5);
    expect(records.at(0).scissor).toEqual({ x: 150, y: 0, width: 100, height: 150 });
    const edges = [1, 2, 3, 4].map((i) => records.at(i));
    for (const edge of edges) {
      expect(edge.uniform.color).toEqual(RED);
      expect(edge.scissor).toEqual({ x: 100, y: 0, width: 300, height: 300 });
    }
    // Top edge: (148, -52) to (252, -50).
    expect(corner(edges[0]!.uniform.transform, 0, 0)).toEqual({ x: 148, y: -52 });
    expect(corner(edges[0]!.uniform.transform, 1, 1)).toEqual({ x: 252, y: -50 });
  });

  it("draws side-by-side panes each in its own bounds, and nothing for a singular viewport", () => {
    const records = new DrawRecords(usable);
    const left = pane(list([]), [1, 0, 0, 1, 0, 0], { x: 0, y: 0, width: 200, height: 400 });
    const right = pane(list([]), [1, 0, 0, 1, 250, 0], { x: 200, y: 0, width: 200, height: 400 });
    const singular = pane(list([]), [0, 0, 0, 0, 0, 0]);
    expect(records.build([left, right, singular], 400, 400)).toBe(2);
    expect(records.at(0).scissor).toEqual({ x: 0, y: 0, width: 100, height: 200 });
    expect(records.at(1).scissor).toEqual({ x: 250, y: 0, width: 100, height: 200 });
  });

  it("grows a shaped solid by one target px on each side, its UV past 0..1", () => {
    const records = new DrawRecords(usable);
    const solid: Layer = { kind: "solid", color: RED, to: BLACK, transform: rectTransform(10, 10, 50, 20), opacity: 1, shape: { kind: "ellipse", width: 50, height: 20, radius: 0 } };
    records.build([pane(list([solid]), IDENTITY)], 400, 400);
    const record = records.at(1);
    expect(record.uniform.shape).toEqual({ width: 50, height: 20, radius: 0, code: SHAPE_CODE.ellipse });
    expect(record.uniform.to).toEqual(BLACK);
    const a = corner(record.uniform.transform, 0, 0);
    const b = corner(record.uniform.transform, 1, 1);
    expect(a.x).toBeCloseTo(9);
    expect(a.y).toBeCloseTo(9);
    expect(b.x).toBeCloseTo(61);
    expect(b.y).toBeCloseTo(31);
    expect(record.uniform.uv.u0).toBeCloseTo(-1 / 50);
    expect(record.uniform.uv.v1).toBeCloseTo(1 + 1 / 20);
  });

  it("writes a solid's style (Batch 58): radii, stops, an evenly dashed stroke, a shadow, and grows the quad by their reach", () => {
    const records = new DrawRecords(usable);
    const stop = (at: number) => ({ at, color: RED });
    const box = (align: "inside" | "center" | "outside") => {
      const solid: Layer = {
        kind: "solid", color: RED, to: null, transform: rectTransform(100, 100, 200, 100), opacity: 1,
        shape: { kind: "box", width: 200, height: 100, radius: 10, radii: [0, 10, 20, 30] },
        style: { gradient: { type: "radial", angle: 0, center: { x: 0.25, y: 0.5 }, radius: 0.5, stops: [stop(0), stop(0.3), stop(0.6), stop(1)] }, stroke: { width: 10, color: BLACK, align, dash: [20, 10] }, shadow: { x: 7, y: 7, blur: 0, spread: 0, color: BLACK }, part: "all" },
      };
      records.build([pane(list([solid]), IDENTITY)], 400, 400);
      return records.at(1).uniform;
    };
    const inside = box("inside");
    expect([...inside.radii]).toEqual([0, 10, 20, 30]);
    expect(inside.style).toMatchObject({ fillKind: 2, stopCount: 4, fillCx: 0.25, fillRadius: 0.5, strokeWidth: 10, strokeAlign: -1 });
    expect([...inside.style.stopAt.slice(0, 4)].map((v) => Math.round(v * 10) / 10)).toEqual([0, 0.3, 0.6, 1]);
    // A whole number of 30 px periods fits the outline, so the dashes meet evenly at the start.
    const periods = inside.style.perimeter / (30 * inside.style.dashScale);
    expect(periods).toBeCloseTo(Math.round(periods), 6);
    const innerCorner = corner(inside.transform, 0, 0);
    const insideGrow = 100 - innerCorner.x;
    const outside = box("outside");
    // Switching to outside only grows the quad (room for the line): the shape box in layer px is unchanged.
    expect(outside.shape).toEqual(inside.shape);
    expect(100 - corner(outside.transform, 0, 0).x).toBeGreaterThanOrEqual(insideGrow);
    expect(outside.style.strokeAlign).toBe(1);
  });

  it("maps a dissolve's unit quad onto each picture's quad", () => {
    const records = new DrawRecords(usable);
    const from = new FakeTexture(10, 10);
    const to = new FakeTexture(10, 10);
    const layer: Layer = {
      kind: "dissolve",
      transform: rectTransform(0, 0, 100, 200),
      opacity: 1,
      mix: 0.25,
      from: { texture: from, transform: rectTransform(0, 0, 100, 200), crop: FULL_UV, opacity: 1 },
      to: { texture: to, transform: rectTransform(0, 50, 100, 100), crop: { u0: 0, v0: 0, u1: 0.5, v1: 1 }, opacity: 0.8 },
    };
    records.build([pane(list([layer]), IDENTITY)], 400, 400);
    const record = records.at(1);
    expect(record.kind).toBe("dissolve");
    expect([record.texture0, record.texture1]).toEqual([from, to]);
    // The layer's center (0.5, 0.5) is at the middle of `to`'s quad; its top edge is above `to`.
    expect(applyToPoint(record.uniform.mapB, 0.5, 0.5)).toEqual({ x: 0.5, y: 0.5 });
    expect(applyToPoint(record.uniform.mapB, 0.5, 0).y).toBeCloseTo(-0.5);
    expect(applyToPoint(record.uniform.mapA, 1, 1)).toEqual({ x: 1, y: 1 });
    expect(record.uniform.uv2).toEqual({ u0: 0, v0: 0, u1: 0.5, v1: 1 });
    expect(record.uniform.sides).toEqual({ from: 1, to: 0.8 });
    expect(record.uniform.mix).toBe(0.25);
  });

  it("reuses its records and resets them between builds", () => {
    const records = new DrawRecords(usable);
    const texture = new FakeTexture(10, 10);
    const blurred: Layer = { kind: "texture", texture, transform: IDENTITY, opacity: 1, crop: FULL_UV, flipX: true, flipY: true, blur: 4 };
    records.build([pane(list([blurred]), IDENTITY)], 400, 400);
    const first = records.at(1);
    const solid: Layer = { kind: "solid", color: RED, transform: IDENTITY, opacity: 1 };
    records.build([pane(list([solid]), IDENTITY)], 400, 400);
    expect(records.pool).toHaveLength(2);
    expect(records.at(1)).toBe(first);
    expect(first.kind).toBe("solid");
    expect(first.texture0).toBeNull();
    expect(first.blur).toBe(0);
    expect(first.uniform.flipX).toBe(false);
    expect(first.uniform.shape.code).toBe(SHAPE_CODE.quad);
  });
});

describe("blur records", () => {
  const region: BlurRegion = { x: 0, y: 0, width: 0, height: 0, sigma: 0, reach: 0 };

  it("reads the crop of the source and reaches 3 sigma, capped", () => {
    const records = new DrawRecords(usable);
    const texture = new FakeTexture(200, 100);
    const layer: Layer = { kind: "texture", texture, transform: rectTransform(0, 0, 100, 50), opacity: 1, crop: { u0: 0.5, v0: 0, u1: 1, v1: 1 }, flipX: false, flipY: false, blur: 40 };
    records.build([pane(list([layer]), IDENTITY)], 400, 400);
    const record = records.at(1);
    expect(blurRegionInto(region, record)).toEqual({ x: 100, y: 0, width: 100, height: 100, sigma: MAX_BLUR_SIGMA, reach: 48 });
    expect(blurRegionInto(region, records.at(0))).toBeNull();
  });

  it("points the record at the blurred texture with the quad grown by the reach", () => {
    const records = new DrawRecords(usable);
    const texture = new FakeTexture(100, 50);
    const layer: Layer = { kind: "texture", texture, transform: rectTransform(0, 0, 100, 50), opacity: 1, crop: FULL_UV, flipX: false, flipY: false, blur: 2 };
    records.build([pane(list([layer]), IDENTITY)], 400, 400);
    const record = records.at(1);
    const found = blurRegionInto(region, record);
    expect(found?.reach).toBe(6);
    const blurred = new FakeTexture(128, 64);
    showBlurred(record, region, blurred, mutableIdentity());
    expect(record.texture0).toBe(blurred);
    expect(corner(record.uniform.transform, 0, 0)).toEqual({ x: -6, y: -6 });
    const end = corner(record.uniform.transform, 1, 1);
    expect(end.x).toBeCloseTo(106);
    expect(end.y).toBeCloseTo(56);
    expect(record.uniform.uv).toEqual({ u0: 0, v0: 0, u1: 112 / 128, v1: 62 / 64 });
  });

  it("premultiplies a clear color", () => {
    const out = { r: 0, g: 0, b: 0, a: 0 };
    premultipliedInto(out, { r: 1, g: 0.5, b: 0, a: 0.5 });
    expect(out).toEqual({ r: 0.5, g: 0.25, b: 0, a: 0.5 });
  });
});

describe("DrawRecords groups (spec §21.17, Batch 72)", () => {
  const solid = (color: RGBA): Layer => ({ kind: "solid", transform: rectTransform(0, 0, 10, 10), opacity: 1, color });
  const groupLayer = (blend: "screen" | "multiply" | "normal", matte: Layer[] | null, mode: "alpha" | "lumaInverted" = "alpha"): Layer => ({
    kind: "group",
    transform: IDENTITY,
    opacity: 1,
    blend,
    mask: null,
    layers: [solid(RED)],
    matte: matte ? { mode, layers: matte, mask: null } : null,
  });

  it("puts a group's layers and matte into its pictures, then a composite record over the frame", () => {
    const records = new DrawRecords(usable);
    const count = records.build([pane(list([solid(BLACK), groupLayer("multiply", [solid(RED)], "lumaInverted"), solid(RED)]), [2, 0, 0, 2, 0, 0])], 400, 400);
    // background, solid, group layer, matte layer, composite, solid
    expect(count).toBe(6);
    const roles = Array.from({ length: count }, (_, i) => [records.at(i).kind, records.at(i).group, records.at(i).role]);
    expect(roles).toEqual([
      ["solid", 0, 0],
      ["solid", 0, 0],
      ["solid", 1, 1],
      ["solid", 1, 2],
      ["composite", 1, 0],
      ["solid", 0, 0],
    ]);
    const composite = records.at(4);
    expect(composite.uniform.fx?.code).toBe(2);
    expect(composite.uniform.fx?.dx).toBe(4);
    // The frame quad in target px.
    expect(corner(composite.uniform.transform, 1, 1)).toEqual({ x: 200, y: 400 });
    expect(records.groupCount).toBe(1);
    expect(records.groups[0]).toEqual({ backdrop: true, matte: true, mask: null, matteMask: null });
  });

  it("marks hardware modes as needing no backdrop and a group without a matte as matte 0", () => {
    const records = new DrawRecords(usable);
    const count = records.build([pane(list([groupLayer("screen", null), groupLayer("normal", [])]), IDENTITY)], 400, 400);
    expect(records.groupCount).toBe(2);
    expect(records.groups.slice(0, 2)).toEqual([
      { backdrop: false, matte: false, mask: null, matteMask: null },
      { backdrop: false, matte: true, mask: null, matteMask: null },
    ]);
    const composites = Array.from({ length: count }, (_, i) => records.at(i)).filter((r) => r.kind === "composite");
    expect(composites.map((r) => [r.group, r.uniform.fx?.code, r.uniform.fx?.dx])).toEqual([
      [1, 5, 0],
      [2, 0, 1],
    ]);
  });

  it("adds nothing for a group none of whose layers draws", () => {
    const records = new DrawRecords(usable);
    const dead = new FakeTexture(10, 10);
    dead.destroy();
    const layer: Layer = { kind: "group", transform: IDENTITY, opacity: 1, blend: "multiply", mask: null, layers: [{ kind: "texture", texture: dead, transform: IDENTITY, opacity: 1, crop: FULL_UV, flipX: false, flipY: false }], matte: null };
    expect(records.build([pane(list([layer]), IDENTITY)], 400, 400)).toBe(1);
    expect(records.groupCount).toBe(0);
  });

  it("draws a group inside a group plainly into the outer picture", () => {
    const records = new DrawRecords(usable);
    const inner = groupLayer("screen", null);
    const outer: Layer = { kind: "group", transform: IDENTITY, opacity: 1, blend: "multiply", mask: null, layers: [inner], matte: null };
    const count = records.build([pane(list([outer]), IDENTITY)], 400, 400);
    expect(count).toBe(3);
    expect([records.at(1).group, records.at(1).role, records.at(2).kind]).toEqual([1, 1, "composite"]);
  });
});

describe("DrawRecords masks (spec §21.18, Batch 73)", () => {
  const RED_SOLID: Layer = { kind: "solid", color: { r: 1, g: 0, b: 0, a: 1 }, transform: rectTransform(0, 0, 10, 10), opacity: 1 };
  const frame = (persp: MaskFrame["persp"] = null): MaskFrame => ({ clipId: "c", data: new Float32Array(8), length: 8, version: 7, width: 40, height: 20, model: [1, 0, 0, 1, 10, 20], persp });
  const mapAt = (maps: Float32Array, offset: number, x: number, y: number) => {
    const q = [0, 1, 2].map((r) => (maps[offset + 4 * r] as number) * x + (maps[offset + 4 * r + 1] as number) * y + (maps[offset + 4 * r + 2] as number));
    return [(q[0] as number) / (q[2] as number), (q[1] as number) / (q[2] as number)];
  };

  it("a masked group's composite holds the map from target px to its content box's unit square", () => {
    const records = new DrawRecords(usable);
    const group: Layer = { kind: "group", transform: IDENTITY, opacity: 1, blend: "normal", mask: frame(), layers: [RED_SOLID], matte: null };
    const count = records.build([pane(list([group]), [2, 0, 0, 2, 50, 0])], 400, 400);
    const composite = records.at(count - 1);
    expect(composite.kind).toBe("composite");
    expect(records.groups[0]?.mask?.version).toBe(7);
    const maps = composite.uniform.style.stopColor;
    expect([maps[MASK_MAP.flags], maps[MASK_MAP.flags + 1]]).toEqual([1, 0]);
    // Content (20, 10) -> project (30, 30) -> target (110, 60): the box's center.
    const center = mapAt(maps, MASK_MAP.mask, 110, 60);
    expect(center[0]).toBeCloseTo(0.5, 6);
    expect(center[1]).toBeCloseTo(0.5, 6);
    const corner = mapAt(maps, MASK_MAP.mask, 70, 40);
    expect(corner[0]).toBeCloseTo(0, 6);
    expect(corner[1]).toBeCloseTo(0, 6);
  });

  it("a 2.5D clip's map goes through its projection; a matte clip's mask has its own map", () => {
    const persp: NonNullable<MaskFrame["persp"]> = [1, 0, 0.1, 1, 5, 0, 0.0005, 0.001, 1];
    const records = new DrawRecords(usable);
    const group: Layer = { kind: "group", transform: IDENTITY, opacity: 1, blend: "normal", mask: frame(persp), layers: [RED_SOLID], matte: { mode: "alpha", layers: [RED_SOLID], mask: frame() } };
    const count = records.build([pane(list([group]), IDENTITY)], 400, 400);
    const maps = records.at(count - 1).uniform.style.stopColor;
    expect([maps[MASK_MAP.flags], maps[MASK_MAP.flags + 1]]).toEqual([1, 1]);
    // Forward: unit (0.25, 0.75) -> content (10, 15) -> project (20, 35) -> through the projection.
    const px = 20, py = 35;
    const w = persp[6] * px + persp[7] * py + persp[8];
    const tx = (persp[0] * px + persp[2] * py + persp[4]) / w;
    const ty = (persp[1] * px + persp[3] * py + persp[5]) / w;
    const back = mapAt(maps, MASK_MAP.mask, tx, ty);
    expect(back[0]).toBeCloseTo(0.25, 5);
    expect(back[1]).toBeCloseTo(0.75, 5);
    const matte = mapAt(maps, MASK_MAP.matteMask, 30, 30);
    expect(matte[0]).toBeCloseTo(0.5, 6);
  });

  it("a mask whose box cannot be inverted is dropped", () => {
    const out = new Float32Array(12);
    expect(writeMaskMap(out, 0, IDENTITY, { ...frame(), width: 0 })).toBe(false);
    expect(writeMaskMap(out, 0, IDENTITY, frame())).toBe(true);
  });
});
