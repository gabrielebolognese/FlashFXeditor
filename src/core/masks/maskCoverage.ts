// Ported from FlashFX-v2 src/core/maskCoverage.ts @ a91c675, adapted.
// Mask coverage (spec §21.18, Batch 73): the packed block a clip's masks upload for the coverage pass
// (render/gpu shaders.ts MASK_WGSL and glShaders.ts MASK_FS) and its CPU twin, line for line the shader.
// What is kept from FlashFX: the signed distances (rounded box, ellipse approximation, a closed outline's
// nearest edge with a nonzero winding sign), the feathered edge (1 - smoothstep(-f, f, d - expansion)),
// inversion, and the combination top to bottom (add = min(1, acc + o c), subtract = max(0, acc - o c),
// intersect = acc (1 - o (1 - c)); the stack starts full when the first mask subtracts or intersects).
// Adapted: one block per clip in the clip's content px (not composition space) packed as texels of 4
// floats (an rgba32float data texture on both backends, not uniform slots); outlines are flattened on the
// CPU into line segments (one texel each); a feather under half a pixel keeps a one pixel antialiased edge.
//
// Block layout (texel = 4 floats):
//   texel 0                 count, content width, content height, segment texel count
//   4 texels per mask i     [kind (0 rect, 1 ellipse, 2 path), mode (0 add, 1 subtract, 2 intersect), inverted, opacity]
//                           box:  [cx, cy, half width, half height]   path: [first segment texel, segment count, 0, 0]
//                           [radius, feather, expansion, 0]
//                           path bounds [x0, y0, x1, y1] (box masks: their box)
//   then one texel per segment [ax, ay, bx, by] (a closed outline's edges; nonzero winding over all of them).
// Pure: no DOM, no GPU.
import type { Mask, MaskMode } from "../document/types.js";
import { flattenPath } from "../shapes/flatten.js";
import { parseMaskPath } from "./maskPath.js";

/** Masks drawn per clip (the rest are ignored). */
export const MAX_MASKS = 16;
/** Outline segments per clip (a longer outline is flattened more coarsely). */
export const MAX_MASK_SEGMENTS = 4096;
/** Texels before the first mask. */
export const MASK_HEADER_TEXELS = 1;
export const MASK_TEXELS = 4;
/** The data texture's width in texels. */
export const MASK_DATA_WIDTH = 256;
/** The smallest feather (content px): an unfeathered edge is antialiased over one pixel. */
export const MIN_FEATHER = 0.5;

export const MASK_KIND_CODE = { rect: 0, ellipse: 1, path: 2 } as const;
export const MASK_MODE_CODE: Readonly<Record<MaskMode, number>> = { add: 0, subtract: 1, intersect: 2 };

/** A mask's values at a frame (its keys applied): what is packed. */
export type ResolvedMask = Mask;

/** The flattened segments of an outline (content px), cached by path data: a static path is flattened once. */
const segmentCache = new Map<string, Float32Array>();
const SEGMENT_CACHE_LIMIT = 256;

/** The edges of the closed outline `d` as [ax, ay, bx, by] runs; empty when `d` does not parse. */
export function outlineSegments(d: string): Float32Array {
  const cached = segmentCache.get(d);
  if (cached) return cached;
  const path = parseMaskPath(d);
  const lines = path ? flattenPath(path, 0.35) : [];
  const out: number[] = [];
  for (const line of lines) {
    const pts = line.pts;
    const n = pts.length / 2;
    if (n < 2) continue;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      out.push(pts[2 * i] as number, pts[2 * i + 1] as number, pts[2 * j] as number, pts[2 * j + 1] as number);
    }
  }
  const segments = new Float32Array(out);
  if (segmentCache.size >= SEGMENT_CACHE_LIMIT) segmentCache.delete(segmentCache.keys().next().value as string);
  segmentCache.set(d, segments);
  return segments;
}

/** Floats the block of `masks` needs. */
export function maskBlockFloats(masks: readonly ResolvedMask[]): number {
  let segments = 0;
  const count = Math.min(masks.length, MAX_MASKS);
  for (let i = 0; i < count; i++) {
    const shape = (masks[i] as ResolvedMask).shape;
    if (shape.kind === "path") segments += outlineSegments(shape.d).length / 4;
  }
  return (MASK_HEADER_TEXELS + count * MASK_TEXELS + Math.min(segments, MAX_MASK_SEGMENTS)) * 4;
}

/**
 * Packs `masks` (content `width` x `height` px) into `out` (at least `maskBlockFloats` long); returns the
 * floats written. Allocates nothing once the outlines are cached.
 */
export function packMasks(masks: readonly ResolvedMask[], width: number, height: number, out: Float32Array): number {
  const count = Math.min(masks.length, MAX_MASKS);
  let segmentTexel = MASK_HEADER_TEXELS + count * MASK_TEXELS;
  let segmentsLeft = MAX_MASK_SEGMENTS;
  for (let i = 0; i < count; i++) {
    const mask = masks[i] as ResolvedMask;
    const o = (MASK_HEADER_TEXELS + i * MASK_TEXELS) * 4;
    const shape = mask.shape;
    out[o] = MASK_KIND_CODE[shape.kind];
    out[o + 1] = MASK_MODE_CODE[mask.mode] ?? 0;
    out[o + 2] = mask.inverted ? 1 : 0;
    out[o + 3] = clamp01(mask.opacity);
    out[o + 9] = Math.max(0, finite(mask.feather));
    out[o + 10] = finite(mask.expansion);
    out[o + 11] = 0;
    if (shape.kind === "path") {
      const segments = outlineSegments(shape.d);
      const n = Math.min(segments.length / 4, segmentsLeft);
      out[o + 4] = segmentTexel;
      out[o + 5] = n;
      out[o + 6] = 0;
      out[o + 7] = 0;
      out[o + 8] = 0;
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (let k = 0; k < n * 4; k++) {
        const v = segments[k] as number;
        out[segmentTexel * 4 + k] = v;
        if (k % 2 === 0) {
          if (v < x0) x0 = v;
          if (v > x1) x1 = v;
        } else {
          if (v < y0) y0 = v;
          if (v > y1) y1 = v;
        }
      }
      out[o + 12] = n > 0 ? x0 : 0;
      out[o + 13] = n > 0 ? y0 : 0;
      out[o + 14] = n > 0 ? x1 : 0;
      out[o + 15] = n > 0 ? y1 : 0;
      segmentTexel += n;
      segmentsLeft -= n;
    } else {
      const w = Math.max(0, finite(shape.w));
      const h = Math.max(0, finite(shape.h));
      out[o + 4] = finite(shape.x) + w / 2;
      out[o + 5] = finite(shape.y) + h / 2;
      out[o + 6] = w / 2;
      out[o + 7] = h / 2;
      out[o + 8] = shape.kind === "rect" ? Math.max(0, Math.min(finite(shape.radius ?? 0), w / 2, h / 2)) : 0;
      out[o + 12] = finite(shape.x);
      out[o + 13] = finite(shape.y);
      out[o + 14] = finite(shape.x) + w;
      out[o + 15] = finite(shape.y) + h;
    }
  }
  out[0] = count;
  out[1] = width;
  out[2] = height;
  out[3] = segmentTexel - MASK_HEADER_TEXELS - count * MASK_TEXELS;
  return segmentTexel * 4;
}

function finite(v: number): number {
  return Number.isFinite(v) ? v : 0;
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Signed distance of a rounded box (center, half sizes, radius); negative inside. */
export function boxSD(px: number, py: number, hw: number, hh: number, r: number): number {
  const qx = Math.abs(px) - hw + r;
  const qy = Math.abs(py) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/** Approximate signed distance of an ellipse (FlashFX `ellipseSDF`, with its center fixed). */
export function ellipseSD(px: number, py: number, ax: number, ay: number): number {
  const a = Math.max(ax, 0.001);
  const b = Math.max(ay, 0.001);
  const k1 = Math.hypot(px / a, py / b);
  const k2 = Math.hypot(px / (a * a), py / (b * b));
  // The exact center (where the approximation degenerates to 0): the distance to the nearer side.
  if (k2 < 1e-9) return -Math.min(a, b);
  return (k1 * (k1 - 1)) / Math.max(k2, 0.0001);
}

/** Signed distance of the outline whose segments start at texel `first` (`count` of them); negative inside (nonzero winding). */
function outlineSD(b: ArrayLike<number>, first: number, count: number, x: number, y: number): number {
  let minD = 1e30;
  let winding = 0;
  for (let k = 0; k < count; k++) {
    const o = (first + k) * 4;
    const ax = b[o] as number;
    const ay = b[o + 1] as number;
    const ex = (b[o + 2] as number) - ax;
    const ey = (b[o + 3] as number) - ay;
    const wx = x - ax;
    const wy = y - ay;
    const ee = ex * ex + ey * ey;
    const t = ee > 1e-12 ? Math.min(1, Math.max(0, (wx * ex + wy * ey) / ee)) : 0;
    const d = Math.hypot(wx - ex * t, wy - ey * t);
    if (d < minD) minD = d;
    const isLeft = ex * wy - ey * wx;
    if (ay <= y) {
      if (ay + ey > y && isLeft > 0) winding += 1;
    } else if (ay + ey <= y && isLeft < 0) winding -= 1;
  }
  return winding !== 0 ? -minD : minD;
}

/** Coverage of mask `i` of the block at content point (x, y), after feather, expansion and inversion (before opacity). */
export function maskCoverageAt(b: ArrayLike<number>, i: number, x: number, y: number): number {
  const o = (MASK_HEADER_TEXELS + i * MASK_TEXELS) * 4;
  const kind = Math.round(b[o] as number);
  const feather = Math.max(b[o + 9] as number, MIN_FEATHER);
  const expansion = b[o + 10] as number;
  let sd: number;
  if (kind === MASK_KIND_CODE.path) {
    const pad = feather + 1 + Math.max(expansion, 0);
    const outside = x < (b[o + 12] as number) - pad || y < (b[o + 13] as number) - pad || x > (b[o + 14] as number) + pad || y > (b[o + 15] as number) + pad;
    const count = Math.round(b[o + 5] as number);
    sd = outside || count < 2 ? 1e30 : outlineSD(b, Math.round(b[o + 4] as number), count, x, y);
  } else {
    const px = x - (b[o + 4] as number);
    const py = y - (b[o + 5] as number);
    sd = kind === MASK_KIND_CODE.ellipse ? ellipseSD(px, py, b[o + 6] as number, b[o + 7] as number) : boxSD(px, py, b[o + 6] as number, b[o + 7] as number, b[o + 8] as number);
  }
  let a = 1 - smoothstep(-feather, feather, sd - expansion);
  if ((b[o + 2] as number) > 0.5) a = 1 - a;
  return a;
}

/** The combined coverage of the block at content point (x, y): the masks top to bottom by mode (the shader's result). */
export function maskStackCoverage(b: ArrayLike<number>, x: number, y: number): number {
  const count = Math.round(b[0] as number);
  if (count <= 0) return 1;
  const firstMode = Math.round(b[(MASK_HEADER_TEXELS) * 4 + 1] as number);
  let acc = firstMode === MASK_MODE_CODE.add ? 0 : 1;
  for (let i = 0; i < count; i++) {
    const o = (MASK_HEADER_TEXELS + i * MASK_TEXELS) * 4;
    const c = maskCoverageAt(b, i, x, y);
    const op = b[o + 3] as number;
    const mode = Math.round(b[o + 1] as number);
    if (mode === MASK_MODE_CODE.add) acc = Math.min(1, acc + op * c);
    else if (mode === MASK_MODE_CODE.subtract) acc = Math.max(0, acc - op * c);
    else acc = acc * (1 - op * (1 - c));
  }
  return acc;
}

/** The coverage of `masks` at content point (x, y) (packs them; for tests and hit tests, not per pixel). */
export function masksCoverage(masks: readonly ResolvedMask[], width: number, height: number, x: number, y: number): number {
  const block = new Float32Array(maskBlockFloats(masks));
  packMasks(masks, width, height, block);
  return maskStackCoverage(block, x, y);
}
