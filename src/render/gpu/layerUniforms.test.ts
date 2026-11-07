import { describe, expect, it } from "vitest";
import { FULL_UV } from "../compositor/drawList.js";
import { applyToPoint, IDENTITY, multiply, mutableIdentity, rectTransform } from "../mat3.js";
import { layerFloats, LAYER_SIZE, LAYER_STRIDE, packLayer, packMat3, pixelsToClip, newStyleUniform, pixelsToClipInto, SHAPE_CODE } from "./layerUniforms.js";

describe("layer uniforms", () => {
  it("fits one layer in the dynamic-offset stride", () => {
    expect(LAYER_SIZE).toBeLessThanOrEqual(LAYER_STRIDE);
    expect(LAYER_STRIDE % 256).toBe(0);
    expect(layerFloats(3)).toBe(384);
  });

  it("packs a matrix as three padded vec4 columns", () => {
    const out = new Float32Array(12);
    packMat3(out, 0, [1, 2, 3, 4, 5, 6]);
    expect([...out]).toEqual([1, 2, 0, 0, 3, 4, 0, 0, 5, 6, 1, 0]);
  });

  it("packs each layer at its own 512-byte slot", () => {
    const out = new Float32Array(layerFloats(2));
    packLayer(out, 1, {
      transform: rectTransform(10, 20, 30, 40),
      uv: { u0: 0.1, v0: 0.2, u1: 0.9, v1: 0.8 },
      color: { r: 1, g: 0.5, b: 0.25, a: 0.5 },
      to: { r: 0, g: 0.25, b: 1, a: 1 },
      shape: { width: 120, height: 60, radius: 12, code: SHAPE_CODE.ellipse },
      opacity: 0.75,
      flipX: true,
      flipY: false,
      mix: 0.3,
      uv2: { u0: 0.2, v0: 0.3, u1: 0.7, v1: 0.6 },
      mapA: [1, 2, 3, 4, 5, 6],
      mapB: [7, 8, 9, 10, 11, 12],
      sides: { from: 0.5, to: 2 },
      radii: new Float32Array(4),
      style: newStyleUniform(),
    });
    const slot = [...out.slice(128, 128 + 52)].map((v) => Math.round(v * 1000) / 1000);
    expect(slot).toEqual([
      30, 0, 0, 0, 0, 40, 0, 0, 10, 20, 1, 0, 0.1, 0.2, 0.9, 0.8, 1, 0.5, 0.25, 0.5, 0.75, 1, 0, 0.3, 0, 0.25, 1, 1, 120, 60, 12, 2, 0.2, 0.3, 0.7, 0.6, 1, 2, 3, 4, 7, 8, 9, 10, 5, 6, 11, 12, 0.5, 1, 0, 0,
    ]);
    expect([...out.slice(0, 128)].every((v) => v === 0)).toBe(true);
  });

  it("packs the style block (Batch 58): stroke, dash, shadow, radii, fill and stops after the v1 floats", () => {
    const out = new Float32Array(layerFloats(1));
    const style = newStyleUniform();
    style.strokeColor = { r: 0.1, g: 0.2, b: 0.3, a: 1 };
    style.strokeWidth = 3;
    style.strokeAlign = -1;
    style.dashOffset = 5;
    style.dashScale = 1.5;
    style.dash.set([6, 4, 0, 0]);
    style.shadowColor = { r: 0, g: 0, b: 0, a: 1 };
    style.shadowX = 7;
    style.shadowY = 8;
    style.shadowBlur = 2;
    style.shadowSpread = 1;
    style.fillKind = 2;
    style.fillAngle = 0.5;
    style.fillRadius = 0.75;
    style.fillCx = 0.25;
    style.fillCy = 0.5;
    style.stopCount = 4;
    style.part = 2;
    style.perimeter = 321;
    style.stopColor.set([1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1, 1, 1, 1, 1]);
    style.stopAt.set([0, 0.25, 0.5, 1]);
    packLayer(out, 0, {
      transform: rectTransform(0, 0, 1, 1), uv: FULL_UV, color: { r: 1, g: 1, b: 1, a: 1 }, to: { r: 0, g: 0, b: 0, a: 1 }, shape: { width: 10, height: 10, radius: 0, code: SHAPE_CODE.box },
      opacity: 1, flipX: false, flipY: false, mix: 0, uv2: FULL_UV, mapA: [0, 0, 0, 0, 0, 0], mapB: [0, 0, 0, 0, 0, 0], sides: { from: 1, to: 1 },
      radii: new Float32Array([1, 2, 3, 4]), style,
    });
    const at = (index: number) => [...out.slice(index * 4, index * 4 + 4)].map((v) => Math.round(v * 1000) / 1000);
    expect(at(13)).toEqual([0.1, 0.2, 0.3, 1]);
    expect(at(14)).toEqual([3, -1, 5, 1.5]);
    expect(at(15)).toEqual([6, 4, 0, 0]);
    expect(at(17)).toEqual([7, 8, 2, 1]);
    expect(at(18)).toEqual([1, 2, 3, 4]);
    expect(at(19)).toEqual([2, 0.5, 0.75, 4]);
    expect(at(20)).toEqual([0.25, 0.5, 2, 321]);
    expect(at(21)).toEqual([1, 0, 0, 1]);
    expect(at(24)).toEqual([1, 1, 1, 1]);
    expect(at(29)).toEqual([0, 0.25, 0.5, 1]);
    expect(LAYER_SIZE).toBe(31 * 16);
  });

  it("clamps opacity and mix to 0..1", () => {
    const out = new Float32Array(layerFloats(1));
    const black = { r: 0, g: 0, b: 0, a: 1 };
    packLayer(out, 0, {
      transform: rectTransform(0, 0, 1, 1),
      uv: FULL_UV,
      color: black,
      to: black,
      shape: { width: 0, height: 0, radius: 0, code: SHAPE_CODE.quad },
      opacity: 2,
      flipX: false,
      flipY: true,
      mix: Number.NaN,
      uv2: FULL_UV,
      mapA: IDENTITY,
      mapB: IDENTITY,
      sides: { from: 1, to: 1 },
      radii: new Float32Array(4),
      style: newStyleUniform(),
    });
    expect([...out.slice(20, 24)]).toEqual([1, 0, 1, 0]);
  });

  it("maps target pixels to clip space with y up", () => {
    const toClip = pixelsToClip(200, 100);
    expect(applyToPoint(toClip, 0, 0)).toEqual({ x: -1, y: 1 });
    expect(applyToPoint(toClip, 200, 100)).toEqual({ x: 1, y: -1 });
    const quad = multiply(toClip, rectTransform(50, 25, 100, 50));
    expect(applyToPoint(quad, 0.5, 0.5)).toEqual({ x: 0, y: 0 });
    const view = rectTransform(3, 4, 2, 5);
    // `+ 0` folds -0 into 0 (a zero times a negative scale).
    expect(pixelsToClipInto(mutableIdentity(), 200, 100, view).map((v) => v + 0)).toEqual(multiply(toClip, view).map((v) => v + 0));
  });
});
