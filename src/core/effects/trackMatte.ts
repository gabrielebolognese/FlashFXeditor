// Ported from FlashFX-v2 src/core/trackMatte.ts @ a91c675, adapted.
// Track mattes (spec §21.17, Batch 72): a clip shows only where its matte clip is opaque (alpha) or
// bright (luma), optionally inverted. This module is the pure per-pixel rule; the renderers' composite
// shaders (shaders.ts, glShaders.ts) implement exactly `matteCoverage` on the matte picture's
// premultiplied pixel.
// Adapted: the editor names the matte clip by id (`ClipBase.matte.clipId`, any visual clip of the same
// sequence) instead of FlashFX's "the layer directly above", so `pairTrackMattes` is not ported; the
// modes are spelled `alphaInverted` / `lumaInverted` as in the spec; the luma of a premultiplied pixel
// (`matteLuma` of its color) already carries its alpha, so a half transparent bright matte keys half.
import type { Clip, MatteMode } from "../document/types.js";

/** Whether a clip draws a picture (spec §21.17: blend modes, mattes and matte sources are visual clips). */
export function isVisualClip(clip: Pick<Clip, "kind">): boolean {
  return clip.kind === "video" || clip.kind === "image" || clip.kind === "text" || clip.kind === "solid" || clip.kind === "shape" || clip.kind === "compound";
}

/** Whether a matte mode uses luminance (else alpha), and whether it is inverted - for the shader. */
export function matteFlags(mode: MatteMode): { luma: boolean; invert: boolean } {
  return {
    luma: mode === "luma" || mode === "lumaInverted",
    invert: mode === "alphaInverted" || mode === "lumaInverted",
  };
}

/** Rec.709 luma of a 0..1 rgb triple - the luminance a luma matte keys on. The shaders mirror it. */
export function matteLuma(r: number, g: number, b: number): number {
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

/**
 * The coverage multiplier a track matte applies to the matted layer (premultiplied: all four channels),
 * from the matte pixel's alpha and luma and the mode flags: alpha / luma pick the channel, invert flips
 * it, clamped to 0..1. kept = matted * matteCoverage(...).
 */
export function matteCoverage(srcAlpha: number, srcLuma: number, flags: { luma: boolean; invert: boolean }): number {
  let c = flags.luma ? srcLuma : srcAlpha;
  if (flags.invert) c = 1 - c;
  return c < 0 ? 0 : c > 1 ? 1 : c;
}

/** The shaders' matte code: 0 none, 1 alpha, 2 alpha inverted, 3 luma, 4 luma inverted. */
export function matteCode(mode: MatteMode | null | undefined): number {
  if (!mode) return 0;
  const { luma, invert } = matteFlags(mode);
  return 1 + (luma ? 2 : 0) + (invert ? 1 : 0);
}
