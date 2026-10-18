import { describe, expect, it } from "vitest";
import type { RGBA } from "../../core/document/types.js";
import { FULL_UV, type DrawList, type Layer } from "../compositor/drawList.js";
import { applyToPoint, IDENTITY, mutableIdentity, rectTransform, type Mat3 } from "../mat3.js";
import { blurRegionInto, DrawRecords, MAX_BLUR_SIGMA, premultipliedInto, showBlurred, type BlurRegion } from "./drawRecords.js";
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
