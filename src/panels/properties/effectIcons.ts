// Effects (spec §21.19, Batch 74): the icon and the Add command of each type, shared by the command catalog
// and the Effects section.
import { Droplets, Layers2, SquareDashed, Sun, Wind, type LucideIcon } from "lucide-react";
import type { EffectType } from "../../core/document/types.js";

export const EFFECT_ICONS: Readonly<Record<EffectType, LucideIcon>> = {
  gaussianBlur: Droplets,
  directionalBlur: Wind,
  glow: Sun,
  dropShadow: Layers2,
  outline: SquareDashed,
};

/** The palette title of each type's Add command. */
export const EFFECT_ADD_TITLES: Readonly<Record<EffectType, string>> = {
  gaussianBlur: "Add Gaussian blur",
  directionalBlur: "Add directional blur",
  glow: "Add glow",
  dropShadow: "Add drop shadow",
  outline: "Add outline",
};

/** Search words of each type. */
export const EFFECT_KEYWORDS: Readonly<Record<EffectType, string>> = {
  gaussianBlur: "effect blur soft defocus gaussian",
  directionalBlur: "effect blur motion directional smear streak",
  glow: "effect glow bloom light neon shine",
  dropShadow: "effect shadow drop depth",
  outline: "effect outline stroke border sticker",
};

/** The command id adding an effect of `type` to the selected clips. */
export const effectAddCommand = (type: EffectType): string => `clip.effect.add.${type}`;
