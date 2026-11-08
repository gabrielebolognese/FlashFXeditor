// Ported from FlashFX-v2 src/engine/renderer.ts (`fs_directional` of BLUR_EFFECT_SHADER) and src/core/effects/blurFxPack.ts
// (`BLURFX_MODE`, the directional uniform: strength in px, angle in radians) @ a91c675, adapted: the taps as pure math for
// the transition Whip (spec §21.16, Batch 71). FlashFX-v2 averages 2 * TAPS + 1 samples at offsets `i / TAPS` (i from -TAPS to
// TAPS) of `dir / dims * strength`, `dir` = (cos angle, sin angle); a transition samples two pictures per tap, so it uses
// WHIP_TAPS = 4 (9 taps, 18 reads per pixel) instead of 15 (31 taps): the same symmetric pattern at a bounded cost.

/** Taps on each side of the center of the transition's directional blur (FlashFX-v2 uses 15). */
export const WHIP_TAPS = 4;

/** FlashFX-v2's mode number of the directional blur (`BLURFX_MODE.directional`). */
export const BLURFX_DIRECTIONAL_MODE = 1;

/** The number of samples averaged for `taps` on each side. */
export function directionalSampleCount(taps: number): number {
  return taps * 2 + 1;
}

/** The step of tap `i` (-taps..taps) along the blur direction, as a fraction of the full length: `i / taps`. */
export function directionalTapOffset(i: number, taps: number): number {
  return taps > 0 ? i / taps : 0;
}

/**
 * The uv offset of tap `i` for a blur of `strengthPx` pixels at `angle` radians over a `width` x `height` picture
 * (FlashFX-v2: `vec2(cos, sin) / dims * strength * off`).
 */
export function directionalUvOffset(i: number, taps: number, angle: number, strengthPx: number, width: number, height: number): { x: number; y: number } {
  const off = directionalTapOffset(i, taps);
  return { x: ((Math.cos(angle) * strengthPx) / width) * off, y: ((Math.sin(angle) * strengthPx) / height) * off };
}

/** The Whip's spread (uv units along its direction) at progress `t`: it peaks at the cut (`sin(pi t)`), as the shader has it. */
export function whipSpread(t: number): number {
  return Math.sin(Math.PI * t) * 0.08;
}

/** The shift of whip tap `k` (-WHIP_TAPS..WHIP_TAPS) in units of the direction vector, as the shader samples it: `k * spread / WHIP_TAPS`. */
export function whipShift(k: number, t: number): number {
  return directionalTapOffset(k, WHIP_TAPS) * whipSpread(t);
}
