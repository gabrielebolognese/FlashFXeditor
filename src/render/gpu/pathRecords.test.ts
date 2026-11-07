import { describe, expect, it } from "vitest";
import type { RGBA } from "../../core/document/types.js";
import type { DrawList, PathDraw, PathLayer } from "../compositor/drawList.js";
import { applyToPoint, mutableIdentity, setMat } from "../mat3.js";
import { DrawRecords, newRecordUniform, pathRegionInto, showPath, writePathUniform, type Rect } from "./drawRecords.js";
import type { Pane, TextureHandle } from "./renderer.js";

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
const BLACK: RGBA = { r: 0, g: 0, b: 0, a: 1 };

function draw(extra: Partial<PathDraw> = {}): PathDraw {
  return { rule: "nonzero", triangles: new Float32Array([0, 0, 10, 0, 10, 10]), clip: null, clipRule: "nonzero", cover: [0, 0, 10, 10], color: { r: 1, g: 0, b: 0, a: 1 }, gradient: null, box: [0, 0, 10, 10], ...extra };
}

/** A path layer whose view box px map to project px by scale 2 and offset (20, 30). */
function shape(bounds: [number, number, number, number] = [0, 0, 10, 10]): PathLayer {
  return { kind: "path", transform: setMat(mutableIdentity(), 2, 0, 0, 2, 20, 30), opacity: 0.5, draws: [draw()], bounds };
}

function panes(layer: PathLayer, zoom = 1): Pane[] {
  const list: DrawList = { width: 100, height: 100, background: BLACK, layers: [layer] };
  return [{ list, viewport: { transform: setMat(mutableIdentity(), zoom, 0, 0, zoom, 0, 0), outside: BLACK, border: null }, bounds: { x: 0, y: 0, width: 400, height: 400 } }];
}

describe("path records (spec §21.12, Batch 65)", () => {
  it("a path layer becomes a path record whose matrix maps view-box px to target px", () => {
    const records = new DrawRecords(usable);
    expect(records.build(panes(shape(), 2), 400, 400)).toBe(2);
    const record = records.at(1);
    expect(record.kind).toBe("path");
    expect(record.uniform.opacity).toBe(0.5);
    expect(applyToPoint(record.uniform.transform, 10, 10)).toEqual({ x: 80, y: 100 });
  });

  it("the region is the draws' box in target px grown by a px, rounded out, clipped to the frame", () => {
    const records = new DrawRecords(usable);
    records.build(panes(shape([0.25, 0, 10, 10]), 1), 400, 400);
    const region = pathRegionInto({ x: 0, y: 0, width: 0, height: 0 }, records.at(1));
    // x: 20.5 .. 40 -> 19 .. 41; y: 30 .. 50 -> 29 .. 51.
    expect(region).toEqual({ x: 19, y: 29, width: 22, height: 22 });
    const outside = new DrawRecords(usable);
    outside.build(panes(shape([100, 100, 120, 120]), 1), 400, 400);
    expect(pathRegionInto({ x: 0, y: 0, width: 0, height: 0 }, outside.at(1))).toBeNull();
  });

  it("a draw's uniform maps the region's top-left to the scratch's clip corner (y turned for GL framebuffers)", () => {
    const records = new DrawRecords(usable);
    records.build(panes(shape(), 1), 400, 400);
    const record = records.at(1);
    const region: Rect = { x: 19, y: 29, width: 22, height: 22 };
    const u = newRecordUniform();
    writePathUniform(u, record, draw({ cover: [1, 2, 3, 4], box: [0, 0, 10, 20] }), region, 256, 256, false);
    // View-box (-0.5, -0.5) is target (19, 29): the region's top-left -> clip (-1, 1).
    const p = applyToPoint(u.transform, -0.5, -0.5);
    expect(p.x).toBeCloseTo(-1);
    expect(p.y).toBeCloseTo(1);
    expect(u.uv).toEqual({ u0: 1, v0: 2, u1: 3, v1: 4 });
    expect(u.shape).toMatchObject({ width: 0, height: 0, radius: 10, code: 20 });
    writePathUniform(u, record, draw(), region, 256, 256, true);
    expect(applyToPoint(u.transform, -0.5, -0.5).y).toBeCloseTo(-1);
  });

  it("showPath turns the record into a textured quad over the region, its UV the region's part of the texture", () => {
    const records = new DrawRecords(usable);
    records.build(panes(shape(), 1), 400, 400);
    const record = records.at(1);
    const texture = new FakeTexture(64, 128);
    showPath(record, { x: 19, y: 29, width: 22, height: 22 }, texture);
    expect(record.kind).toBe("textured");
    expect(record.texture0).toBe(texture);
    expect(record.path).toBeNull();
    expect(applyToPoint(record.uniform.transform, 1, 1)).toEqual({ x: 41, y: 51 });
    expect(record.uniform.uv).toEqual({ u0: 0, v0: 0, u1: 22 / 64, v1: 22 / 128 });
    expect(record.uniform.opacity).toBe(0.5);
  });

  it("a path layer without draws or fully transparent adds no record", () => {
    const records = new DrawRecords(usable);
    expect(records.build(panes({ ...shape(), draws: [] }), 400, 400)).toBe(1);
    expect(records.build(panes({ ...shape(), opacity: 0 }), 400, 400)).toBe(1);
  });
});
