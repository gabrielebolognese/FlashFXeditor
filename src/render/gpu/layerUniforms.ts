// CPU side of the shader uniforms (see `shaders.ts`): one Float32Array holds every layer of a draw at
// a fixed 256-byte stride, bound with dynamic offsets, so a frame never creates a bind group per layer.
import type { RGBA } from "../../core/document/types.js";
import type { UvRect } from "../compositor/drawList.js";
import type { Mat3, MutableMat3 } from "../mat3.js";

/** Bytes between layers: WebGPU's default minUniformBufferOffsetAlignment. */
export const LAYER_STRIDE = 256;
/** Bytes the shader reads per layer (13 vec4). */
export const LAYER_SIZE = 208;
export const VIEW_SIZE = 48;
const STRIDE_FLOATS = LAYER_STRIDE / 4;

/** How a solid is cut (shaders.ts SOLID_WGSL): the hard quad, a box with rounded corners, or an ellipse. */
export const SHAPE_CODE = { quad: 0, box: 1, ellipse: 2 } as const;

export interface LayerUniform {
  transform: Mat3;
  uv: UvRect;
  /** Straight alpha (solids; a gradient's top); ignored by textured layers. */
  color: RGBA;
  /** A solid gradient's bottom color (straight alpha; `color` again for a flat fill). */
  to: RGBA;
  /** A solid's shape: its size in its own px, corner radius, and SHAPE_CODE. */
  shape: { width: number; height: number; radius: number; code: number };
  opacity: number;
  flipX: boolean;
  flipY: boolean;
  /** Dissolve amount, 0 = from, 1 = to. */
  mix: number;
  /**
   * A dissolve's two pictures (Batch 36): `uv` is the first one's crop, `uv2` the second one's; `mapA` /
   * `mapB` map the layer's unit quad onto each picture's unit quad (a point outside 0..1 is not on it);
   * `sides` are their own opacities. Other layers leave them at rest.
   */
  uv2: UvRect;
  mapA: Mat3;
  mapB: Mat3;
  sides: { from: number; to: number };
}

/** Writes `m` as three vec4 columns (WGSL mat3x3 padding) at `offset` (in floats). Allocates nothing. */
export function packMat3(out: Float32Array, offset: number, m: Mat3): void {
  write4(out, offset, m[0], m[1], 0, 0);
  write4(out, offset + 4, m[2], m[3], 0, 0);
  write4(out, offset + 8, m[4], m[5], 1, 0);
}

export function packLayer(out: Float32Array, index: number, layer: LayerUniform): void {
  const o = index * STRIDE_FLOATS;
  packMat3(out, o, layer.transform);
  write4(out, o + 12, layer.uv.u0, layer.uv.v0, layer.uv.u1, layer.uv.v1);
  write4(out, o + 16, layer.color.r, layer.color.g, layer.color.b, layer.color.a);
  write4(out, o + 20, clamp01(layer.opacity), layer.flipX ? 1 : 0, layer.flipY ? 1 : 0, clamp01(layer.mix));
  write4(out, o + 24, layer.to.r, layer.to.g, layer.to.b, layer.to.a);
  write4(out, o + 28, layer.shape.width, layer.shape.height, layer.shape.radius, layer.shape.code);
  write4(out, o + 32, layer.uv2.u0, layer.uv2.v0, layer.uv2.u1, layer.uv2.v1);
  const a = layer.mapA;
  const b = layer.mapB;
  write4(out, o + 36, a[0], a[1], a[2], a[3]);
  write4(out, o + 40, b[0], b[1], b[2], b[3]);
  write4(out, o + 44, a[4], a[5], b[4], b[5]);
  write4(out, o + 48, clamp01(layer.sides.from), clamp01(layer.sides.to), 0, 0);
}

function write4(out: Float32Array, offset: number, x: number, y: number, z: number, w: number): void {
  out[offset] = x;
  out[offset + 1] = y;
  out[offset + 2] = z;
  out[offset + 3] = w;
}

/** Floats needed for `count` layers. */
export function layerFloats(count: number): number {
  return count * STRIDE_FLOATS;
}

/** Target px (y down) -> clip space (y up). */
export function pixelsToClip(width: number, height: number): Mat3 {
  return [2 / width, 0, 0, -2 / height, -1, 1];
}

/** `pixelsToClip(width, height) * m`, written into `out`. */
export function pixelsToClipInto(out: MutableMat3, width: number, height: number, m: Mat3): MutableMat3 {
  const sx = 2 / width;
  const sy = -2 / height;
  out[0] = sx * m[0];
  out[1] = sy * m[1];
  out[2] = sx * m[2];
  out[3] = sy * m[3];
  out[4] = sx * m[4] - 1;
  out[5] = sy * m[5] + 1;
  return out;
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}
