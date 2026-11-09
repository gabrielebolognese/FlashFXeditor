// The math of the Batch 76 effects (spec §21.19): RGB split, pixelate, mirror, wave, glitch, posterize and
// invert. The effect shaders (EFFECT_WGSL in render/gpu/shaders.ts and EFFECT_FRAGMENT in glShaders.ts,
// programs 17..23) mirror these functions line for line; the tests check them here. Points are stage px with
// the content box `rect` = [x0, y0, x1, y1] in the same px; `scale` is stage px per content px.
// Ported from FlashFX-v2 src/engine/renderer.ts (applyWarpEffect wave / mirror / pixelate, applySpatialEffect
// rgbSplit / digitalGlitch, applyColorEffect posterize / invert) and src/core/effects/glitchGpu.ts @ a91c675,
// adapted: named parameters in content px instead of one slider in uv units, the glitch hashed with the
// integer `grainHash` (bit-exact across GPUs) instead of FlashFX-v2's float hash21. Pure.
import { grainHash, GRAIN_OFFSET } from "./colorMath.js";

export type Rect = readonly [number, number, number, number];
export type Point = [number, number];

const TAU = 2 * Math.PI;

/** RGB split: red is read at p + offset, blue at p - offset (stage px), green at p. */
export function rgbSplitOffset(distance: number, angleDegrees: number, scale: number): Point {
  const a = (angleDegrees * Math.PI) / 180;
  return [Math.cos(a) * distance * scale, Math.sin(a) * distance * scale];
}

/**
 * Pixelate: the point a pixel at p reads, the middle of its square cell (`size` content px, from the box's
 * top-left corner).
 */
export function pixelateSample(p: Point, rect: Rect, size: number, scale: number): Point {
  const cell = Math.max(1, size) * scale;
  return [rect[0] + (Math.floor((p[0] - rect[0]) / cell) + 0.5) * cell, rect[1] + (Math.floor((p[1] - rect[1]) / cell) + 0.5) * cell];
}

/** Mirror sides (the choice index of `side`): the half that is kept. */
export const MIRROR_SIDES = ["left", "right", "top", "bottom"] as const;

/**
 * Mirror: the point a pixel at p reads. The line sits at `center` (0..1) across the box (vertical for left and
 * right, horizontal for top and bottom); the kept side reads itself, the other side its reflection.
 */
export function mirrorSample(p: Point, rect: Rect, side: number, center: number): Point {
  const horizontal = side < 2;
  const line = horizontal ? rect[0] + center * (rect[2] - rect[0]) : rect[1] + center * (rect[3] - rect[1]);
  const v = horizontal ? p[0] : p[1];
  const keepLow = side === 0 || side === 2;
  const reflect = keepLow ? v > line : v < line;
  const w = reflect ? 2 * line - v : v;
  return horizontal ? [w, p[1]] : [p[0], w];
}

/**
 * Wave: the point a pixel at p reads. Horizontal (direction 0) moves each row along x by
 * amplitude * sin(TAU * (y - y0) / wavelength - TAU * phase); vertical moves each column along y. Lengths in
 * content px, `phase` in waves (speed x seconds).
 */
export function waveSample(p: Point, rect: Rect, amplitude: number, wavelength: number, direction: number, phase: number, scale: number): Point {
  const length = Math.max(2, wavelength) * scale;
  if (direction === 0) return [p[0] + amplitude * scale * Math.sin((TAU * (p[1] - rect[1])) / length - TAU * phase), p[1]];
  return [p[0], p[1] + amplitude * scale * Math.sin((TAU * (p[0] - rect[0])) / length - TAU * phase)];
}

/**
 * Glitch: how far the band holding p moves along x (stage px), 0 for a band that stays. Bands are `band`
 * content px high from the box's top; a band moves when its hash for the pattern (`seed`, `pattern`) is under
 * `amount`, by a second hash mapped to -shift..shift.
 */
export function glitchShift(p: Point, rect: Rect, amount: number, band: number, shift: number, seed: number, pattern: number, scale: number): number {
  const row = Math.floor((p[1] - rect[1]) / (Math.max(2, band) * scale)) + GRAIN_OFFSET;
  const key = (Math.round(seed) * 7919 + Math.round(pattern)) >>> 0;
  if (grainHash(row, key, 1) >= amount) return 0;
  return (grainHash(row, key, 2) * 2 - 1) * shift * scale;
}

/** Posterize one straight channel (0..1) to `levels` steps (at least 2). */
export function posterize(c: number, levels: number): number {
  const n = Math.max(2, Math.round(levels)) - 1;
  return Math.round(Math.min(1, Math.max(0, c)) * n) / n;
}

/** Invert one straight channel (0..1), mixed in by `amount`. */
export function invert(c: number, amount: number): number {
  return c + (1 - 2 * c) * Math.min(1, Math.max(0, amount));
}

/** The pixel an RGB split writes from its three reads (premultiplied rgba): red of `r`, green of `g`, blue of `b`, the largest alpha. */
export function rgbSplitPixel(r: readonly number[], g: readonly number[], b: readonly number[]): [number, number, number, number] {
  return [r[0] as number, g[1] as number, b[2] as number, Math.max(r[3] as number, g[3] as number, b[3] as number)];
}
