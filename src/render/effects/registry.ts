// The effect registry (spec §21.19, Batch 74): for each effect type its parameters (core/effects/effectParams.ts),
// its passes (programs of EFFECT_WGSL / EFFECT_FRAGMENT, planned by effectPlan.ts), its reach and whether it
// reads neighboring pixels. Shared by both backends so they draw the same passes. Pure.
// Ported from FlashFX-v2 src/core/effects/effectRegistry.ts @ a91c675, adapted: string types instead of numeric
// ids, and only the Batch 74 types (FlashFX-v2 wires its blur and glow to real render-to-texture passes, as here).
// Batch 75 adds the per-pixel color, stylize, key and LUT passes (FlashFX-v2 applyColorEffect in
// src/engine/renderer.ts @ a91c675; their math is core/effects/colorMath.ts and core/effects/lut.ts).
import { EFFECT_DEFS, type EffectParamDef } from "../../core/effects/effectParams.js";
import { EFFECT_BLOCK, EFFECT_FRAME_SLOT, effectTypeOf, paramOffset } from "../../core/effects/effectEval.js";
import type { EffectType } from "../../core/document/types.js";
import { dominantChannel } from "../../core/effects/colorMath.js";
import { lutLibrary } from "./lutLibrary.js";

/** The programs of the effect shader (`code` in its uniform). */
export const FX_PROGRAM = {
  blur: 1,
  directional: 2,
  glowExtract: 3,
  glowComposite: 4,
  shadowExtract: 5,
  shadowComposite: 6,
  outline: 7,
  mask: 8,
  dilate: 9,
  colorAdjust: 10,
  vignette: 11,
  sharpen: 12,
  grain: 13,
  chromaKey: 14,
  lumaKey: 15,
  lut: 16,
} as const;
export type FxProgram = (typeof FX_PROGRAM)[keyof typeof FX_PROGRAM];

/** Taps on each side of a blur pass at most: wider blurs space their taps out (FlashFX-v2 uses 15 to 20). */
export const MAX_BLUR_TAPS = 32;
/** Samples of a directional blur at most (FlashFX-v2 uses 31). */
export const MAX_DIRECTIONAL_SAMPLES = 65;
/** Rings of an outline step at most, and samples per ring. */
export const MAX_OUTLINE_RINGS = 12;
export const MAX_RING_SAMPLES = 48;
/** Stage px an outline step reaches (4 rings of samples 1.5 px apart), and steps at most (wider steps past it). */
export const OUTLINE_STEP = 6;
export const MAX_OUTLINE_STEPS = 16;

/** The steps of an outline `width` stage px wide: how many and each one's radius and rings. */
export function outlineSteps(width: number): { steps: number; radius: number; rings: number } {
  if (!(width >= 0.25)) return { steps: 1, radius: 0, rings: 0 };
  const steps = Math.min(MAX_OUTLINE_STEPS, Math.max(1, Math.ceil(width / OUTLINE_STEP)));
  const radius = width / steps;
  return { steps, radius, rings: Math.min(MAX_OUTLINE_RINGS, Math.max(1, Math.ceil(radius / 1.5))) };
}

/** One pass as the planner asks for it: a program and whether it also reads the effect's input (`orig`). */
export interface PassWriter {
  /** Adds a pass of `program` reading the current picture; `withInput`: the pass also reads the effect's input. Returns its uniform floats to fill. */
  pass(program: FxProgram, withInput: boolean): Float32Array;
  /** Adds a LUT pass reading the current picture and the LUT texture of `handle`. Returns its uniform floats. */
  lutPass(handle: number): Float32Array;
}

export interface EffectRenderDef {
  type: EffectType;
  params: readonly EffectParamDef[];
  /** Whether a pass reads pixels around the one it writes (every Batch 74 type, and the sharpen). */
  neighbors: boolean;
  /** Content px the picture grows by on each side, from the packed block at `o` of `data`. */
  reach(data: Float32Array, o: number): number;
  /** Adds the type's passes for the block at `o`; `scale`: stage px per content px. */
  passes(writer: PassWriter, data: Float32Array, o: number, scale: number): void;
}

/** Uniform floats of a pass (6 vec4: size and flags, a, b, color, rect, c). */
export const FX_FLOATS = 24;
/** Where each part of a pass uniform starts. */
export const FX_SLOT = { size: 0, a: 4, b: 8, color: 12, rect: 16, c: 20 } as const;

const p = (data: Float32Array, o: number, type: EffectType, name: string): number => data[o + paramOffset(type, name)] as number;

/** A blur's sigma (FlashFX-v2: radius / 2, at least half a px) and its taps along each side (spacing the taps when wide). */
export function blurTaps(radius: number): { sigma: number; taps: number; step: number } {
  if (!(radius >= 0.5)) return { sigma: 0.5, taps: 0, step: 1 };
  const taps = Math.min(MAX_BLUR_TAPS, Math.ceil(radius));
  return { sigma: Math.max(radius * 0.5, 0.5), taps, step: radius / taps };
}

/** Writes a separable blur's direction, sigma, taps and step into `u.a`. */
function writeBlur(u: Float32Array, dirX: number, dirY: number, radius: number): void {
  const { sigma, taps, step } = blurTaps(radius);
  u[FX_SLOT.a] = dirX;
  u[FX_SLOT.a + 1] = dirY;
  u[FX_SLOT.a + 2] = sigma;
  u[FX_SLOT.a + 3] = taps;
  u[FX_SLOT.c + 1] = step;
}

function writeColor(u: Float32Array, data: Float32Array, at: number): void {
  for (let i = 0; i < 4; i++) u[FX_SLOT.color + i] = data[at + i] as number;
}

const rad = (degrees: number) => (degrees * Math.PI) / 180;

export const EFFECT_REGISTRY: Readonly<Record<EffectType, EffectRenderDef>> = {
  // Separable Gaussian (FlashFX-v2 BLUR_EFFECT_SHADER fs_gauss_h / fs_gauss_v): taps over +-radius, sigma radius / 2.
  gaussianBlur: {
    type: "gaussianBlur",
    params: EFFECT_DEFS.gaussianBlur.params,
    neighbors: true,
    reach: (data, o) => (p(data, o, "gaussianBlur", "repeatEdges") ? 0 : p(data, o, "gaussianBlur", "radius")),
    passes(writer, data, o, scale) {
      const radius = p(data, o, "gaussianBlur", "radius") * scale;
      const repeat = p(data, o, "gaussianBlur", "repeatEdges");
      const across = writer.pass(FX_PROGRAM.blur, false);
      writeBlur(across, 1, 0, radius);
      across[FX_SLOT.size + 3] = repeat;
      const down = writer.pass(FX_PROGRAM.blur, false);
      writeBlur(down, 0, 1, radius);
      down[FX_SLOT.size + 3] = repeat;
    },
  },
  // FlashFX-v2 fs_directional: the mean of samples spread over +-length along (cos angle, sin angle).
  directionalBlur: {
    type: "directionalBlur",
    params: EFFECT_DEFS.directionalBlur.params,
    neighbors: true,
    reach: (data, o) => (p(data, o, "directionalBlur", "repeatEdges") ? 0 : p(data, o, "directionalBlur", "length")),
    passes(writer, data, o, scale) {
      const length = p(data, o, "directionalBlur", "length") * scale;
      const angle = rad(p(data, o, "directionalBlur", "angle"));
      const u = writer.pass(FX_PROGRAM.directional, false);
      const samples = length >= 0.5 ? Math.min(MAX_DIRECTIONAL_SAMPLES, 2 * Math.ceil(length) + 1) : 1;
      u[FX_SLOT.a] = Math.cos(angle) * length;
      u[FX_SLOT.a + 1] = Math.sin(angle) * length;
      u[FX_SLOT.a + 2] = samples;
      u[FX_SLOT.size + 3] = p(data, o, "directionalBlur", "repeatEdges");
    },
  },
  // FlashFX-v2 GLOW_SHADER: extract (bright pixels' alpha, or its inverse for inner), blur, tint by color and
  // intensity; composited with screen over the picture (inner: confined to the picture's alpha).
  glow: {
    type: "glow",
    params: EFFECT_DEFS.glow.params,
    neighbors: true,
    reach: (data, o) => (p(data, o, "glow", "mode") === 1 ? 0 : p(data, o, "glow", "radius")),
    passes(writer, data, o, scale) {
      const radius = p(data, o, "glow", "radius") * scale;
      const mode = p(data, o, "glow", "mode");
      const threshold = p(data, o, "glow", "threshold");
      const across = writer.pass(FX_PROGRAM.glowExtract, false);
      writeBlur(across, 1, 0, radius);
      across[FX_SLOT.b + 3] = threshold;
      across[FX_SLOT.c] = mode;
      const down = writer.pass(FX_PROGRAM.glowComposite, true);
      writeBlur(down, 0, 1, radius);
      down[FX_SLOT.b + 2] = p(data, o, "glow", "intensity");
      down[FX_SLOT.c] = mode;
      writeColor(down, data, o + paramOffset("glow", "color"));
    },
  },
  // FlashFX-v2 SHADOW_SHADER: the alpha moved by the light offset and blurred, tinted, under the picture.
  dropShadow: {
    type: "dropShadow",
    params: EFFECT_DEFS.dropShadow.params,
    neighbors: true,
    reach: (data, o) => p(data, o, "dropShadow", "distance") + p(data, o, "dropShadow", "blur"),
    passes(writer, data, o, scale) {
      const distance = p(data, o, "dropShadow", "distance") * scale;
      const angle = rad(p(data, o, "dropShadow", "angle"));
      const radius = p(data, o, "dropShadow", "blur") * scale;
      const across = writer.pass(FX_PROGRAM.shadowExtract, false);
      writeBlur(across, 1, 0, radius);
      across[FX_SLOT.b] = Math.cos(angle) * distance;
      across[FX_SLOT.b + 1] = Math.sin(angle) * distance;
      const down = writer.pass(FX_PROGRAM.shadowComposite, true);
      writeBlur(down, 0, 1, radius);
      writeColor(down, data, o + paramOffset("dropShadow", "color"));
    },
  },
  // A stroke outside the picture's alpha: the largest alpha within `width`, tinted, under it. The alpha is
  // dilated in steps of at most OUTLINE_STEP px (dilate passes, then the outline pass composites the last one
  // under the input), so a wide stroke stays round without a ring of far-apart samples.
  outline: {
    type: "outline",
    params: EFFECT_DEFS.outline.params,
    neighbors: true,
    reach: (data, o) => p(data, o, "outline", "width") + 1,
    passes(writer, data, o, scale) {
      const { steps, radius, rings } = outlineSteps(p(data, o, "outline", "width") * scale);
      // Dilate passes read the input too, so their output never overwrites it before the outline pass reads it.
      for (let i = 1; i < steps; i++) {
        const step = writer.pass(FX_PROGRAM.dilate, true);
        step[FX_SLOT.a] = radius;
        step[FX_SLOT.a + 1] = rings;
      }
      const u = writer.pass(FX_PROGRAM.outline, true);
      u[FX_SLOT.a] = radius;
      u[FX_SLOT.a + 1] = rings;
      writeColor(u, data, o + paramOffset("outline", "color"));
    },
  },
  // Batch 75. Color adjustment: a = brightness, contrast, saturation, exposure; b = temperature, tint, hue, vibrance.
  colorAdjust: pixelPass("colorAdjust", FX_PROGRAM.colorAdjust, ["brightness", "contrast", "saturation", "exposure"], ["temperature", "tint", "hue", "vibrance"]),
  // a = amount, radius, softness (over the content box).
  vignette: pixelPass("vignette", FX_PROGRAM.vignette, ["amount", "radius", "softness"]),
  // Unsharp mask: a = amount, radius (stage px).
  sharpen: {
    type: "sharpen",
    params: EFFECT_DEFS.sharpen.params,
    neighbors: true,
    reach: () => 0,
    passes(writer, data, o, scale) {
      const u = writer.pass(FX_PROGRAM.sharpen, false);
      u[FX_SLOT.a] = p(data, o, "sharpen", "amount");
      u[FX_SLOT.a + 1] = Math.max(0.5, p(data, o, "sharpen", "radius") * scale);
    },
  },
  // a = amount, cell size (stage px), frame (0 when static).
  grain: {
    type: "grain",
    params: EFFECT_DEFS.grain.params,
    neighbors: false,
    reach: () => 0,
    passes(writer, data, o, scale) {
      const u = writer.pass(FX_PROGRAM.grain, false);
      u[FX_SLOT.a] = p(data, o, "grain", "amount");
      u[FX_SLOT.a + 1] = Math.max(0.5, p(data, o, "grain", "size")) * scale;
      u[FX_SLOT.a + 2] = data[o + EFFECT_FRAME_SLOT] as number;
    },
  },
  // color = the key; a = tolerance, softness, spill, the key's dominant channel.
  chromaKey: {
    type: "chromaKey",
    params: EFFECT_DEFS.chromaKey.params,
    neighbors: false,
    reach: () => 0,
    passes(writer, data, o) {
      const u = writer.pass(FX_PROGRAM.chromaKey, false);
      const at = o + paramOffset("chromaKey", "color");
      writeColor(u, data, at);
      copyParams(u, FX_SLOT.a, data, o, "chromaKey", ["tolerance", "softness", "spill"]);
      u[FX_SLOT.a + 3] = dominantChannel(data[at] as number, data[at + 1] as number, data[at + 2] as number);
    },
  },
  // a = threshold, softness, invert.
  lumaKey: pixelPass("lumaKey", FX_PROGRAM.lumaKey, ["threshold", "softness", "invert"]),
  // a = intensity, grid size; b.xyz = domain min; color.xyz = domain max. Nothing when the LUT is not loaded.
  lut: {
    type: "lut",
    params: EFFECT_DEFS.lut.params,
    neighbors: false,
    reach: () => 0,
    passes(writer, data, o) {
      const handle = p(data, o, "lut", "file");
      const intensity = p(data, o, "lut", "intensity");
      const entry = handle > 0 ? lutLibrary.get(handle) : undefined;
      if (!entry || !(intensity > 0)) return;
      const u = writer.lutPass(handle);
      u[FX_SLOT.a] = intensity;
      u[FX_SLOT.a + 1] = entry.atlas.size;
      for (let i = 0; i < 3; i++) {
        u[FX_SLOT.b + i] = entry.atlas.domainMin[i] as number;
        u[FX_SLOT.color + i] = entry.atlas.domainMax[i] as number;
      }
    },
  },
};

/** Copies `count` floats of the block at `o` (from parameter `name`) into `u` from `slot`. */
function copyParams(u: Float32Array, slot: number, data: Float32Array, o: number, type: EffectType, names: readonly string[]): void {
  names.forEach((name, i) => {
    u[slot + i] = p(data, o, type, name);
  });
}

/** A pass of a per-pixel effect: no reach, no neighbors, one pass whose `a` (and `b`) hold the parameters. */
function pixelPass(type: EffectType, program: FxProgram, a: readonly string[], b: readonly string[] = []): EffectRenderDef {
  return {
    type,
    params: EFFECT_DEFS[type].params,
    neighbors: false,
    reach: () => 0,
    passes(writer, data, o) {
      const u = writer.pass(program, false);
      copyParams(u, FX_SLOT.a, data, o, type, a);
      copyParams(u, FX_SLOT.b, data, o, type, b);
    },
  };
}

/** The content px a packed stack (`length` floats of `data`) grows the picture by on each side: the sum of its reaches. */
export function stackReach(data: Float32Array, length: number): number {
  let reach = 0;
  for (let o = 0; o + EFFECT_BLOCK <= length; o += EFFECT_BLOCK) {
    const type = effectTypeOf(data[o] as number);
    if (type) reach += Math.max(0, EFFECT_REGISTRY[type].reach(data, o));
  }
  return reach;
}
