import { describe, expect, it } from "vitest";
import { FULL_UV } from "../compositor/drawList.js";
import { applyToPoint, multiply, rectTransform } from "../mat3.js";
import { layerFloats, LAYER_SIZE, LAYER_STRIDE, packLayer, packMat3, pixelsToClip } from "./layerUniforms.js";

describe("layer uniforms", () => {
  it("fits one layer in the dynamic-offset stride", () => {
    expect(LAYER_SIZE).toBeLessThanOrEqual(LAYER_STRIDE);
    expect(LAYER_STRIDE % 256).toBe(0);
    expect(layerFloats(3)).toBe(192);
  });

  it("packs a matrix as three padded vec4 columns", () => {
    const out = new Float32Array(12);
    packMat3(out, 0, [1, 2, 3, 4, 5, 6]);
    expect([...out]).toEqual([1, 2, 0, 0, 3, 4, 0, 0, 5, 6, 1, 0]);
  });

  it("packs each layer at its own 256-byte slot", () => {
    const out = new Float32Array(layerFloats(2));
    packLayer(out, 1, {
      transform: rectTransform(10, 20, 30, 40),
      uv: { u0: 0.1, v0: 0.2, u1: 0.9, v1: 0.8 },
      color: { r: 1, g: 0.5, b: 0.25, a: 0.5 },
      opacity: 0.75,
      flipX: true,
      flipY: false,
      mix: 0.3,
    });
    const slot = [...out.slice(64, 64 + 24)].map((v) => Math.round(v * 1000) / 1000);
    expect(slot).toEqual([30, 0, 0, 0, 0, 40, 0, 0, 10, 20, 1, 0, 0.1, 0.2, 0.9, 0.8, 1, 0.5, 0.25, 0.5, 0.75, 1, 0, 0.3]);
    expect([...out.slice(0, 64)].every((v) => v === 0)).toBe(true);
  });

  it("clamps opacity and mix to 0..1", () => {
    const out = new Float32Array(layerFloats(1));
    packLayer(out, 0, { transform: rectTransform(0, 0, 1, 1), uv: FULL_UV, color: { r: 0, g: 0, b: 0, a: 1 }, opacity: 2, flipX: false, flipY: true, mix: Number.NaN });
    expect([...out.slice(20, 24)]).toEqual([1, 0, 1, 0]);
  });

  it("maps target pixels to clip space with y up", () => {
    const toClip = pixelsToClip(200, 100);
    expect(applyToPoint(toClip, 0, 0)).toEqual({ x: -1, y: 1 });
    expect(applyToPoint(toClip, 200, 100)).toEqual({ x: 1, y: -1 });
    const quad = multiply(toClip, rectTransform(50, 25, 100, 50));
    expect(applyToPoint(quad, 0.5, 0.5)).toEqual({ x: 0, y: 0 });
  });
});
