// CPU side of the shader uniforms (see `shaders.ts`): one Float32Array holds every layer of a draw at
// a fixed 256-byte stride, bound with dynamic offsets, so a frame never creates a bind group per layer.
import type { RGBA } from "../../core/document/types.js";
import type { UvRect } from "../compositor/drawList.js";
import type { Mat3, MutableMat3 } from "../mat3.js";

/** Bytes between layers: a multiple of WebGPU's default minUniformBufferOffsetAlignment (256). */
export const LAYER_STRIDE = 512;
/** Bytes the shader reads per layer (32 vec4: the Batch 58 style follows the 13 of Batch 48, the Batch 71 transition parameters come last). */
export const LAYER_SIZE = 512;
export const VIEW_SIZE = 48;
const STRIDE_FLOATS = LAYER_STRIDE / 4;

/** How a solid is cut (shaders.ts SOLID_WGSL): the hard quad, a box with rounded corners, or an ellipse. */
export const SHAPE_CODE = { quad: 0, box: 1, ellipse: 2 } as const;

/** What a solid is drawn with beyond its shape (shaders.ts SOLID_WGSL); all zero is a plain fill. */
export interface StyleUniform {
  /** 0 color or two-stop (`color`, `to`), 1 linear, 2 radial. */
  fillKind: number;
  /** Radians, linear. */
  fillAngle: number;
  fillRadius: number;
  fillCx: number;
  fillCy: number;
  stopCount: number;
  stopAt: Float32Array;
  /** 8 stops x (r, g, b, a), straight alpha. */
  stopColor: Float32Array;
  strokeColor: RGBA;
  /** 0: no stroke. */
  strokeWidth: number;
  /** -1 inside, 0 center, 1 outside. */
  strokeAlign: number;
  dashOffset: number;
  /** Stretches the dash pattern so a whole number of periods fits the outline. */
  dashScale: number;
  dash: Float32Array;
  shadowColor: RGBA;
  shadowX: number;
  shadowY: number;
  shadowBlur: number;
  shadowSpread: number;
  /** 0 everything, 1 only the shadow, 2 only the stroke. */
  part: number;
  /** The outline length in layer px (dash positions of ellipses). */
  perimeter: number;
}

export function newStyleUniform(): StyleUniform {
  const clear = () => ({ r: 0, g: 0, b: 0, a: 0 });
  return {
    fillKind: 0, fillAngle: 0, fillRadius: 1, fillCx: 0.5, fillCy: 0.5, stopCount: 0,
    stopAt: new Float32Array(8), stopColor: new Float32Array(32),
    strokeColor: clear(), strokeWidth: 0, strokeAlign: 0, dashOffset: 0, dashScale: 1, dash: new Float32Array(4),
    shadowColor: clear(), shadowX: 0, shadowY: 0, shadowBlur: 0, shadowSpread: 0,
    part: 0, perimeter: 1,
  };
}

/** Puts `style` back to a plain fill. */
export function resetStyleUniform(style: StyleUniform): void {
  style.fillKind = 0;
  style.stopCount = 0;
  style.strokeWidth = 0;
  style.strokeColor.a = 0;
  style.dashOffset = 0;
  style.dashScale = 1;
  style.dash.fill(0);
  style.shadowColor.a = 0;
  style.shadowBlur = 0;
  style.shadowX = 0;
  style.shadowY = 0;
  style.shadowSpread = 0;
  style.part = 0;
  style.perimeter = 1;
}

/** The bottom row (g, h, i) of a layer's projective matrix (spec §21.15): (0, 0, 1) for a flat layer. */
export type WRow = [g: number, h: number, i: number];

export interface LayerUniform {
  transform: Mat3;
  /** With `transform`, the 3x3 projective map of the unit quad (a 2.5D layer, render/projection.ts): w = g x + h y + i. */
  wRow: WRow;
  uv: UvRect;
  /** Straight alpha (solids; a gradient's top); ignored by textured layers. */
  color: RGBA;
  /** A solid gradient's bottom color (straight alpha; `color` again for a flat fill). */
  to: RGBA;
  /** A solid's shape: its size in its own px, corner radius, and SHAPE_CODE. */
  shape: { width: number; height: number; radius: number; code: number };
  /** Corner radii tl, tr, br, bl (layer px) of a shaped solid or a framed picture. */
  radii: Float32Array;
  style: StyleUniform;
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
  /**
   * A dissolve's transition (Batch 71, spec §21.16): the kind code (0 = the plain mix), the direction,
   * the edge softness and the iris center. Absent = the plain mix.
   */
  fx?: { code: number; dx: number; dy: number; softness: number; cx: number; cy: number };
}

/** Writes `m` as three vec4 columns (WGSL mat3x3 padding) at `offset` (in floats), with the bottom row `w` (flat: 0, 0, 1). Allocates nothing. */
export function packMat3(out: Float32Array, offset: number, m: Mat3, w: Readonly<WRow> = FLAT_ROW): void {
  write4(out, offset, m[0], m[1], w[0], 0);
  write4(out, offset + 4, m[2], m[3], w[1], 0);
  write4(out, offset + 8, m[4], m[5], w[2], 0);
}

const FLAT_ROW: Readonly<WRow> = [0, 0, 1];

export function packLayer(out: Float32Array, index: number, layer: LayerUniform): void {
  const o = index * STRIDE_FLOATS;
  packMat3(out, o, layer.transform, layer.wRow);
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
  const fx = layer.fx;
  write4(out, o + 48, clamp01(layer.sides.from), clamp01(layer.sides.to), fx?.cx ?? 0, fx?.cy ?? 0);
  const st = layer.style;
  write4(out, o + 52, st.strokeColor.r, st.strokeColor.g, st.strokeColor.b, st.strokeColor.a);
  write4(out, o + 56, st.strokeWidth, st.strokeAlign, st.dashOffset, st.dashScale);
  write4(out, o + 60, st.dash[0] as number, st.dash[1] as number, st.dash[2] as number, st.dash[3] as number);
  write4(out, o + 64, st.shadowColor.r, st.shadowColor.g, st.shadowColor.b, st.shadowColor.a);
  write4(out, o + 68, st.shadowX, st.shadowY, st.shadowBlur, st.shadowSpread);
  write4(out, o + 72, layer.radii[0] as number, layer.radii[1] as number, layer.radii[2] as number, layer.radii[3] as number);
  write4(out, o + 76, st.fillKind, st.fillAngle, st.fillRadius, st.stopCount);
  write4(out, o + 80, st.fillCx, st.fillCy, st.part, st.perimeter);
  for (let i = 0; i < 32; i++) out[o + 84 + i] = st.stopColor[i] as number;
  for (let i = 0; i < 8; i++) out[o + 116 + i] = st.stopAt[i] as number;
  write4(out, o + 124, fx?.dx ?? 0, fx?.dy ?? 0, fx?.softness ?? 0, fx?.code ?? 0);
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
