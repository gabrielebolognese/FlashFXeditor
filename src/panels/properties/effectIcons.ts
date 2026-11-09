// Effects (spec §21.19, Batch 74): the icon and the Add command of each type, shared by the command catalog
// and the Effects section.
import { Aperture, Blend, Columns2, Contrast, Droplets, Grid3x3, Layers2, PaintBucket, Palette, Scissors, SlidersHorizontal, Sparkles, SquareDashed, Sun, SunDim, Triangle, Waves, Wind, Zap, type LucideIcon } from "lucide-react";
import type { EffectType } from "../../core/document/types.js";

export const EFFECT_ICONS: Readonly<Record<EffectType, LucideIcon>> = {
  gaussianBlur: Droplets,
  directionalBlur: Wind,
  glow: Sun,
  dropShadow: Layers2,
  outline: SquareDashed,
  colorAdjust: SlidersHorizontal,
  vignette: Aperture,
  sharpen: Triangle,
  grain: Sparkles,
  chromaKey: Scissors,
  lumaKey: SunDim,
  lut: Palette,
  rgbSplit: Blend,
  pixelate: Grid3x3,
  mirror: Columns2,
  wave: Waves,
  glitch: Zap,
  posterize: PaintBucket,
  invert: Contrast,
};

/** The palette title of each type's Add command. */
export const EFFECT_ADD_TITLES: Readonly<Record<EffectType, string>> = {
  gaussianBlur: "Add Gaussian blur",
  directionalBlur: "Add directional blur",
  glow: "Add glow",
  dropShadow: "Add drop shadow",
  outline: "Add outline",
  colorAdjust: "Add color adjust",
  vignette: "Add vignette",
  sharpen: "Add sharpen",
  grain: "Add grain",
  chromaKey: "Add chroma key",
  lumaKey: "Add luma key",
  lut: "Add LUT",
  rgbSplit: "Add RGB split",
  pixelate: "Add pixelate",
  mirror: "Add mirror",
  wave: "Add wave",
  glitch: "Add glitch",
  posterize: "Add posterize",
  invert: "Add invert",
};

/** Search words of each type. */
export const EFFECT_KEYWORDS: Readonly<Record<EffectType, string>> = {
  gaussianBlur: "effect blur soft defocus gaussian",
  directionalBlur: "effect blur motion directional smear streak",
  glow: "effect glow bloom light neon shine",
  dropShadow: "effect shadow drop depth",
  outline: "effect outline stroke border sticker",
  colorAdjust: "effect color correct grade brightness contrast saturation exposure temperature tint hue vibrance",
  vignette: "effect vignette dark corners edges",
  sharpen: "effect sharpen detail crisp unsharp",
  grain: "effect grain noise film texture",
  chromaKey: "effect chroma key green screen blue screen remove background spill",
  lumaKey: "effect luma key black white remove background",
  lut: "effect lut cube color grade look film",
  rgbSplit: "effect rgb split chromatic aberration channel offset stylize",
  pixelate: "effect pixelate mosaic blocks censor stylize",
  mirror: "effect mirror reflect symmetry flip stylize",
  wave: "effect wave warp ripple distort wobble stylize",
  glitch: "effect glitch datamosh digital broken signal distort stylize",
  posterize: "effect posterize levels banding poster stylize",
  invert: "effect invert negative colors stylize",
};

/** The Add rows of the Effects section: blurs and light (Batch 74), color, keys and LUT (Batch 75), distortion and stylize (Batch 76). */
export const EFFECT_ADD_ROWS: readonly { label: string; types: readonly EffectType[] }[] = [
  { label: "Add", types: ["gaussianBlur", "directionalBlur", "glow", "dropShadow", "outline"] },
  { label: "Color", types: ["colorAdjust", "vignette", "sharpen", "grain", "chromaKey", "lumaKey", "lut"] },
  { label: "Stylize", types: ["rgbSplit", "pixelate", "mirror", "wave", "glitch", "posterize", "invert"] },
];

/** The command id adding an effect of `type` to the selected clips. */
export const effectAddCommand = (type: EffectType): string => `clip.effect.add.${type}`;
