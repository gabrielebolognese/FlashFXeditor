// Effects at a frame (spec §21.19, Batch 74): a clip's enabled effects with their `effects.<id>.<param>` keys
// applied, packed into one float block per effect for the renderer (render/effects/registry.ts reads it).
// Block layout: EFFECT_BLOCK floats, [type code, then each parameter in EFFECT_DEFS order: a number or a
// toggle one float, a color four (straight alpha), a choice its option index, a file the handle the caller's
// resolver gives it (0: none or not loaded; a LUT, Batch 75)]; the last float holds the clip-relative frame for
// a type whose picture changes every frame (an animated grain), the seconds of a moving wave and the pattern
// index of a glitch (Batch 76, `motionSlot`). Packing allocates nothing. Pure.
import { sampleKeys, sampleVector, type Key } from "../document/keyframes.js";
import { EFFECT_TYPES, type Effect, type EffectType, type Frame, type Keyframes } from "../document/types.js";
import { clampParam, EFFECT_DEFS, effectParam, effectProp, isEffectType, type EffectParamDef } from "./effectParams.js";

/** Floats per packed effect (the type code, at most 14 parameter floats and the frame slot). */
export const EFFECT_BLOCK = 16;
/** Where a block holds the clip-relative frame of a type that changes every frame (an animated grain), else 0. */
export const EFFECT_FRAME_SLOT = EFFECT_BLOCK - 1;
/** Turns a file parameter (a project path) into the handle the renderer knows it by; 0 when it is not loaded. */
export type EffectFileResolver = (path: string) => number;

/** The code of a type in a packed block (1-based: 0 is no effect). */
export function effectCode(type: EffectType): number {
  return EFFECT_TYPES.indexOf(type) + 1;
}

/** The type of a packed code, or null. */
export function effectTypeOf(code: number): EffectType | null {
  return EFFECT_TYPES[Math.round(code) - 1] ?? null;
}

/** Where each parameter of `type` starts in its block (after the code). */
const OFFSETS: Readonly<Record<EffectType, Readonly<Record<string, number>>>> = (() => {
  const out = {} as Record<EffectType, Record<string, number>>;
  for (const type of EFFECT_TYPES) {
    const offsets: Record<string, number> = {};
    let at = 1;
    for (const def of EFFECT_DEFS[type].params) {
      offsets[def.name] = at;
      at += def.kind === "color" ? 4 : 1;
    }
    if (at > EFFECT_FRAME_SLOT) throw new Error(`${type} packs ${at} floats, more than ${EFFECT_FRAME_SLOT}`);
    out[type] = offsets;
  }
  return out;
})();

/** The offset of parameter `name` in a block of `type` (from the block's start). */
export function paramOffset(type: EffectType, name: string): number {
  const offset = OFFSETS[type][name];
  if (offset === undefined) throw new Error(`${type} has no parameter ${name}`);
  return offset;
}

/** The keys of an effect parameter, or undefined. */
export function effectKeys(keyframes: Keyframes | undefined, id: string, param: string): readonly Key[] | undefined {
  const keys = keyframes?.[effectProp(id, param)];
  return keys && keys.length > 0 ? keys : undefined;
}

/** Whether `keyframes` keys any effect parameter. */
export function hasEffectKeys(keyframes: Keyframes | undefined): boolean {
  if (!keyframes) return false;
  for (const prop in keyframes) if (prop.startsWith("effects.") && (keyframes[prop]?.length ?? 0) > 0) return true;
  return false;
}

const colorScratch: number[] = [];

/** The value parameter `def` of `effect` shows `rel` frames into the clip (its keys, clamped, else the base). */
export function effectValueAt(effect: Effect, keyframes: Keyframes | undefined, def: EffectParamDef, rel: Frame): number | number[] | string {
  const keys = def.keyframeable ? effectKeys(keyframes, effect.id, def.name) : undefined;
  if (!keys) return effectParam(effect, def.name);
  if (def.kind === "color") return clampParam(def, sampleVector(keys, rel, []));
  return clampParam(def, sampleKeys(keys, rel));
}

/** Whether the clip draws any effect: an enabled one of a known type. */
export function hasActiveEffects(clip: { effects?: Effect[] | undefined }): boolean {
  const effects = clip.effects;
  if (!effects) return false;
  for (const effect of effects) if (effect.enabled && isEffectType(effect.type)) return true;
  return false;
}

/** Floats `packEffects` writes for the clip (EFFECT_BLOCK per active effect). */
export function effectBlockFloats(clip: { effects?: Effect[] | undefined }): number {
  let count = 0;
  for (const effect of clip.effects ?? []) if (effect.enabled && isEffectType(effect.type)) count += 1;
  return count * EFFECT_BLOCK;
}

/**
 * What the frame slot of a block holds for a type whose picture moves over time (Batch 76): a moving wave the
 * seconds into the clip (`rel` / `fps`), a glitch with a rate the index of its pattern (a new one `rate` times
 * a second, counted from the clip's start); 0 when still. `block` is the packed block at `at`.
 */
export function motionSlot(type: EffectType, block: Float32Array, at: number, rel: Frame, fps: number): number {
  const rate = fps > 0 ? fps : 30;
  if (type === "wave") return block[at + (OFFSETS.wave.speed as number)] !== 0 ? rel / rate : 0;
  if (type === "glitch") {
    const perSecond = block[at + (OFFSETS.glitch.rate as number)] as number;
    return perSecond > 0 ? Math.floor((Math.max(0, rel) * perSecond) / rate + 1e-9) : 0;
  }
  return 0;
}

/**
 * Packs the clip's enabled effects at `rel` frames into it into `out` (EFFECT_BLOCK floats each, in stack
 * order) and returns the floats written. `out` must hold `effectBlockFloats(clip)`. `files` turns file
 * parameters into handles (0 for every file without it); `fps` (frames per second of the project) times the
 * wave and the glitch (Batch 76).
 */
export function packEffects(clip: { effects?: Effect[] | undefined; keyframes?: Keyframes | undefined }, rel: Frame, out: Float32Array, files?: EffectFileResolver, fps = 30): number {
  let at = 0;
  const keyed = hasEffectKeys(clip.keyframes);
  for (const effect of clip.effects ?? []) {
    if (!effect.enabled || !isEffectType(effect.type)) continue;
    out.fill(0, at, at + EFFECT_BLOCK);
    out[at] = effectCode(effect.type);
    const offsets = OFFSETS[effect.type];
    for (const def of EFFECT_DEFS[effect.type].params) {
      const o = at + (offsets[def.name] as number);
      // Static values are read as they are (no copy) and clamped while written.
      const value = keyed ? effectValueAt(effect, clip.keyframes, def, rel) : effectParam(effect, def.name);
      if (def.kind === "choice") out[o] = Math.max(0, (def.options ?? []).indexOf(value as string));
      else if (def.kind === "file") out[o] = typeof value === "string" && value !== "" && files ? files(value) : 0;
      else if (def.kind === "color") {
        const c = Array.isArray(value) ? value : colorScratch;
        for (let i = 0; i < 4; i++) out[o + i] = Math.min(1, Math.max(0, (c[i] as number | undefined) ?? 0));
      } else if (def.kind === "toggle") out[o] = value === 1 ? 1 : 0;
      else out[o] = typeof value === "number" ? Math.min(def.max ?? Infinity, Math.max(def.min ?? -Infinity, value)) : 0;
    }
    // An animated grain draws a new pattern each frame: the frame makes its block (and its stage) change.
    if (effect.type === "grain" && out[at + (offsets.animated as number)] === 1) out[at + EFFECT_FRAME_SLOT] = rel;
    // A moving wave and a glitch with a rate (Batch 76): their time, so a still one keeps its cached stage.
    else if (effect.type === "wave" || effect.type === "glitch") out[at + EFFECT_FRAME_SLOT] = motionSlot(effect.type, out, at, rel, fps);
    at += EFFECT_BLOCK;
  }
  return at;
}
