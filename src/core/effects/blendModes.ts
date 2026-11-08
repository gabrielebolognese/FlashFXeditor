// Ported from FlashFX-v2 src/core/effects/blendModes.ts @ a91c675, adapted.
// Blend modes (spec §21.17, Batch 72): the reference implementation of every separable W3C blend mode
// (Compositing and Blending Level 1) plus linear-dodge "add". The renderers' WGSL and GLSL mirror
// `blendChannel` and `compositeBlend` (shaders.ts, glShaders.ts), and `isHardwareBlend` is the routing
// table they consult: a hardware mode is drawn with a fixed GPU blend state, the others read a copy of
// the backdrop. Pure: no imports at runtime.
// Adapted: the mode list lives with the model constants (`BLEND_MODES` in core/document/types.ts); the
// hardware set is normal, screen and add only (FlashFX also lists darken, lighten and multiply, see
// `BLEND_MODE_META`); colorBurn and colorDodge test the backdrop first, as W3C does (backdrop 1 burns to
// 1, backdrop 0 dodges to 0); `compositeBlend` adds the W3C source-over composite of premultiplied pixels.
import { BLEND_MODES, type BlendMode } from "../document/types.js";

export { BLEND_MODES };

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Blend one channel: `cb` = backdrop (below), `cs` = source (this layer), both non-premultiplied in
 * [0,1]. Returns the blended channel value (the "B(cb,cs)" of the W3C spec), clamped to [0,1].
 */
export function blendChannel(cb: number, cs: number, mode: BlendMode): number {
  const b = clamp01(cb);
  const s = clamp01(cs);
  switch (mode) {
    case "normal": return s;
    case "darken": return Math.min(b, s);
    case "multiply": return b * s;
    case "colorBurn": return b >= 1 ? 1 : s <= 0 ? 0 : 1 - Math.min(1, (1 - b) / s);
    case "lighten": return Math.max(b, s);
    case "screen": return b + s - b * s;
    case "colorDodge": return b <= 0 ? 0 : s >= 1 ? 1 : Math.min(1, b / (1 - s));
    case "add": return clamp01(b + s);
    case "overlay": return hardLight(s, b); // overlay(cb,cs) = hardLight(cs,cb)
    case "hardLight": return hardLight(b, s);
    case "softLight": return softLight(b, s);
    case "difference": return Math.abs(b - s);
    case "exclusion": return b + s - 2 * b * s;
    default: return s;
  }
}

function hardLight(cb: number, cs: number): number {
  return cs <= 0.5 ? 2 * cb * cs : 1 - 2 * (1 - cb) * (1 - cs);
}

function softLight(cb: number, cs: number): number {
  if (cs <= 0.5) return cb - (1 - 2 * cs) * cb * (1 - cb);
  const d = cb <= 0.25 ? ((16 * cb - 12) * cb + 4) * cb : Math.sqrt(cb);
  return cb + (2 * cs - 1) * (d - cb);
}

/** Blend an RGB triple (arrays of 3 channels in [0,1]). */
export function blendRGB(backdrop: readonly [number, number, number], source: readonly [number, number, number], mode: BlendMode): [number, number, number] {
  return [blendChannel(backdrop[0], source[0], mode), blendChannel(backdrop[1], source[1], mode), blendChannel(backdrop[2], source[2], mode)];
}

/** A premultiplied pixel: r, g, b already multiplied by a. */
export type Premultiplied = readonly [r: number, g: number, b: number, a: number];

/**
 * The W3C composite of a premultiplied `source` pixel blended over a premultiplied `backdrop` pixel:
 * co = cs (1 - ab) + cb (1 - as) + as ab B(Cb, Cs), ao = as + ab - as ab (C = straight colors). What
 * the backdrop-reading shader returns for every mode. Add is the exception: premultiplied plus,
 * co = min(1, cs + cb), what its hardware blend state (one, one) draws at any alpha.
 */
export function compositeBlend(backdrop: Premultiplied, source: Premultiplied, mode: BlendMode): [number, number, number, number] {
  const ab = clamp01(backdrop[3]);
  const as = clamp01(source[3]);
  const out: [number, number, number, number] = [0, 0, 0, as + ab - as * ab];
  for (let i = 0; i < 3; i++) {
    const cb = backdrop[i] as number;
    const cs = source[i] as number;
    if (mode === "add") {
      // Add (linear dodge) is the hardware one/one blend: premultiplied plus, clamped (Batch 72).
      out[i] = Math.min(1, cs + cb);
      continue;
    }
    const blended = blendChannel(ab > 0 ? cb / ab : 0, as > 0 ? cs / as : 0, mode);
    out[i] = cs * (1 - ab) + cb * (1 - as) + as * ab * blended;
  }
  return out;
}

export interface BlendModeMeta {
  label: string;
  /**
   * True when a fixed GPU blend state draws the mode exactly from the premultiplied source alone (no
   * destination read): normal (one, one - src alpha), screen (one, one - src color) and add (one, one).
   * Adapted: FlashFX marks darken, lighten and multiply hardware too, but a min / max blend operation
   * ignores the source alpha (a half transparent darken or lighten layer, or its anti-aliased edge, comes
   * out wrong) and multiply needs an opaque backdrop; here they read the backdrop like the other seven.
   */
  hardware: boolean;
}

export const BLEND_MODE_META: Record<BlendMode, BlendModeMeta> = {
  normal: { label: "Normal", hardware: true },
  darken: { label: "Darken", hardware: false },
  multiply: { label: "Multiply", hardware: false },
  colorBurn: { label: "Color Burn", hardware: false },
  lighten: { label: "Lighten", hardware: false },
  screen: { label: "Screen", hardware: true },
  colorDodge: { label: "Color Dodge", hardware: false },
  add: { label: "Add", hardware: true },
  overlay: { label: "Overlay", hardware: false },
  softLight: { label: "Soft Light", hardware: false },
  hardLight: { label: "Hard Light", hardware: false },
  difference: { label: "Difference", hardware: false },
  exclusion: { label: "Exclusion", hardware: false },
};

/** Whether a mode can be rendered by a fixed GPU blend-state variant (no destination read). */
export function isHardwareBlend(mode: BlendMode): boolean {
  return BLEND_MODE_META[mode]?.hardware ?? false;
}

/** The shaders' mode code: the index in `BLEND_MODES` (0 = normal). */
export function blendCode(mode: BlendMode | undefined): number {
  const index = mode === undefined ? 0 : BLEND_MODES.indexOf(mode);
  return index < 0 ? 0 : index;
}
