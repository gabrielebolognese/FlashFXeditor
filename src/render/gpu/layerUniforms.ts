// CPU side of the shader uniforms (see `shaders.ts`): one Float32Array holds every layer of a draw at
// a fixed 256-byte stride, bound with dynamic offsets, so a frame never creates a bind group per layer.
import type { RGBA } from "../../core/document/types.js";
import type { UvRect } from "../compositor/drawList.js";
import type { Mat3 } from "../mat3.js";

/** Bytes between layers: WebGPU's default minUniformBufferOffsetAlignment. */
export const LAYER_STRIDE = 256;
/** Bytes the shader reads per layer (6 vec4). */
export const LAYER_SIZE = 96;
export const VIEW_SIZE = 48;
const STRIDE_FLOATS = LAYER_STRIDE / 4;

export interface LayerUniform {
  transform: Mat3;
  uv: UvRect;
  /** Straight alpha (solids); ignored by textured layers. */
  color: RGBA;
  opacity: number;
  flipX: boolean;
  flipY: boolean;
  /** Dissolve amount, 0 = from, 1 = to. */
  mix: number;
}

/** Writes `m` as three vec4 columns (WGSL mat3x3 padding) at `offset` (in floats). */
export function packMat3(out: Float32Array, offset: number, m: Mat3): void {
  out.set([m[0], m[1], 0, 0, m[2], m[3], 0, 0, m[4], m[5], 1, 0], offset);
}

export function packLayer(out: Float32Array, index: number, layer: LayerUniform): void {
  const o = index * STRIDE_FLOATS;
  packMat3(out, o, layer.transform);
  out.set([layer.uv.u0, layer.uv.v0, layer.uv.u1, layer.uv.v1], o + 12);
  out.set([layer.color.r, layer.color.g, layer.color.b, layer.color.a], o + 16);
  out.set([clamp01(layer.opacity), layer.flipX ? 1 : 0, layer.flipY ? 1 : 0, clamp01(layer.mix)], o + 20);
}

/** Floats needed for `count` layers. */
export function layerFloats(count: number): number {
  return count * STRIDE_FLOATS;
}

/** Target px (y down) -> clip space (y up). */
export function pixelsToClip(width: number, height: number): Mat3 {
  return [2 / width, 0, 0, -2 / height, -1, 1];
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}
