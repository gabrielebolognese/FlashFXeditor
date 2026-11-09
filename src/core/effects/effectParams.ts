// The parameters of each effect type (spec §21.19, Batch 74): name, kind, default, range, whether it can be
// keyed. The model's side of the effect registry: validation, the field table, the manifest, the Effects
// section and the evaluation read it; render/effects/registry.ts adds each type's passes and reach.
// Ranges and defaults follow FlashFX-v2 src/core/effectDefaults.ts (DEFAULT_BLUR, DEFAULT_GLOW,
// DEFAULT_SHADOW) @ a91c675 where it has the parameter: blurs reach `radius` px with sigma radius / 2, the
// directional blur smears `length` px each way along `angle`, a shadow falls `distance` px towards `angle`
// (0 = right, 90 = down). Pure.
import { EFFECT_TYPES, type Effect, type EffectType } from "../document/types.js";

/** A number (with a unit and a range), an on / off switch stored as 0 or 1, a color [r, g, b, a] or a choice. */
export type EffectParamKind = "number" | "toggle" | "color" | "choice";

export interface EffectParamDef {
  name: string;
  label: string;
  kind: EffectParamKind;
  default: number | number[] | string;
  /** Numbers: the range values are clamped to. */
  min?: number;
  max?: number;
  /** Numbers: shown after the value ("px", "°"). */
  unit?: string;
  /** Choices: the allowed values. */
  options?: readonly string[];
  keyframeable: boolean;
}

export interface EffectTypeDef {
  type: EffectType;
  label: string;
  params: readonly EffectParamDef[];
}

const px = (name: string, label: string, value: number, max: number): EffectParamDef => ({ name, label, kind: "number", default: value, min: 0, max, unit: "px", keyframeable: true });
const angle = (value: number): EffectParamDef => ({ name: "angle", label: "Angle", kind: "number", default: value, min: -360, max: 360, unit: "°", keyframeable: true });
const color = (value: number[]): EffectParamDef => ({ name: "color", label: "Color", kind: "color", default: value, keyframeable: true });
const repeatEdges: EffectParamDef = { name: "repeatEdges", label: "Repeat edges", kind: "toggle", default: 0, keyframeable: false };

/** The Batch 74 types, in the Add menu's order. */
export const EFFECT_DEFS: Readonly<Record<EffectType, EffectTypeDef>> = {
  gaussianBlur: { type: "gaussianBlur", label: "Gaussian blur", params: [px("radius", "Radius", 10, 500), repeatEdges] },
  directionalBlur: { type: "directionalBlur", label: "Directional blur", params: [px("length", "Length", 20, 500), angle(0), repeatEdges] },
  glow: {
    type: "glow",
    label: "Glow",
    params: [
      { name: "mode", label: "Mode", kind: "choice", default: "outer", options: ["outer", "inner"], keyframeable: false },
      px("radius", "Radius", 20, 500),
      { name: "intensity", label: "Intensity", kind: "number", default: 1, min: 0, max: 5, keyframeable: true },
      { name: "threshold", label: "Threshold", kind: "number", default: 0, min: 0, max: 1, keyframeable: true },
      color([1, 1, 1, 1]),
    ],
  },
  dropShadow: { type: "dropShadow", label: "Drop shadow", params: [color([0, 0, 0, 0.55]), angle(90), px("distance", "Distance", 12, 1000), px("blur", "Blur", 16, 500)] },
  outline: { type: "outline", label: "Outline", params: [px("width", "Width", 6, 200), color([1, 1, 1, 1])] },
};

const TYPE_SET: ReadonlySet<string> = new Set(EFFECT_TYPES);

export function isEffectType(type: unknown): type is EffectType {
  return typeof type === "string" && TYPE_SET.has(type);
}

/** The definition of `name` on `type`, or undefined. */
export function effectParamDef(type: EffectType, name: string): EffectParamDef | undefined {
  return EFFECT_DEFS[type].params.find((param) => param.name === name);
}

/**
 * The keyframe properties of effects (spec §21.19): `effects.<id>.<param>` for a keyframeable parameter of the
 * effect `<id>` (numbers, and colors as vectors). Groups: 1 the effect id, 2 the parameter.
 */
export const EFFECT_PROP_PATTERN = /^effects\.([A-Za-z0-9_-]+)\.([A-Za-z][A-Za-z0-9]*)$/;
/** The template id listed in the manifest and INTEROP.md. */
export const EFFECT_KEYFRAME_PROPS = ["effects.<id>.<param>"] as const;

export function isEffectProp(prop: string): boolean {
  return EFFECT_PROP_PATTERN.test(prop);
}

/** The prop id of an effect parameter. */
export const effectProp = (id: string, param: string): string => `effects.${id}.${param}`;

/** Clip kinds that draw a picture: the ones that take effects (spec §21.19). */
export const EFFECT_KINDS: readonly string[] = ["video", "image", "text", "solid", "shape", "compound"];

/** The value a definition gives a parameter missing from `params` (a copy for colors). */
function fallback(def: EffectParamDef): number | number[] | string {
  return Array.isArray(def.default) ? [...def.default] : def.default;
}

/** The parameter `name` of `effect` (its default when missing or of the wrong shape). */
export function effectParam(effect: Pick<Effect, "type" | "params">, name: string): number | number[] | string {
  const def = effectParamDef(effect.type, name);
  const value = effect.params[name];
  if (!def) return value ?? 0;
  return paramFits(def, value) ? (value as number | number[] | string) : fallback(def);
}

/** A number parameter (its default when missing). */
export function effectNumber(effect: Pick<Effect, "type" | "params">, name: string): number {
  const value = effectParam(effect, name);
  return typeof value === "number" ? value : 0;
}

/** A color parameter as [r, g, b, a] (its default when missing). */
export function effectColor(effect: Pick<Effect, "type" | "params">, name: string): readonly number[] {
  const value = effectParam(effect, name);
  return Array.isArray(value) ? value : [0, 0, 0, 0];
}

/** Whether `value` has the shape `def` takes (ranges not checked). */
function paramFits(def: EffectParamDef, value: unknown): boolean {
  switch (def.kind) {
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "toggle":
      return value === 0 || value === 1;
    case "color":
      return Array.isArray(value) && value.length === 4 && value.every((channel) => typeof channel === "number" && Number.isFinite(channel));
    case "choice":
      return typeof value === "string" && (def.options ?? []).includes(value);
  }
}

/** `value` clamped into `def`'s range (numbers), 0 / 1 (toggles), 0..1 per channel (colors); choices unchanged. */
export function clampParam(def: EffectParamDef, value: number | number[] | string): number | number[] | string {
  if (def.kind === "number" && typeof value === "number") return Math.min(def.max ?? Infinity, Math.max(def.min ?? -Infinity, value));
  if (def.kind === "toggle" && typeof value === "number") return value >= 0.5 ? 1 : 0;
  if (def.kind === "color" && Array.isArray(value)) return value.map((channel) => Math.min(1, Math.max(0, channel)));
  return value;
}

/** A new effect of `type` with every parameter at its default. */
export function newEffect(type: EffectType, id: string): Effect {
  const params: Effect["params"] = {};
  for (const def of EFFECT_DEFS[type].params) params[def.name] = fallback(def);
  return { id, type, enabled: true, params };
}

const EFFECT_ID = /^[A-Za-z0-9_-]+$/;

/**
 * What is wrong with a clip's `effects` (spec §21.19): a list of objects, each with a unique id (letters,
 * digits, `_`, `-`), a known type, a boolean `enabled` and params the type has, each of its kind and in its
 * range. Empty when fine.
 */
export function effectIssues(effects: unknown, label: string): string[] {
  if (effects === undefined) return [];
  if (!Array.isArray(effects)) return [`${label}: effects must be a list`];
  const issues: string[] = [];
  const ids = new Set<string>();
  effects.forEach((raw: unknown, index) => {
    const at = `${label}: effects[${index}]`;
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      issues.push(`${at} must be an object`);
      return;
    }
    const effect = raw as Record<string, unknown>;
    const id = effect.id;
    if (typeof id !== "string" || !EFFECT_ID.test(id)) issues.push(`${at}: id must be letters, digits, _ or -`);
    else if (ids.has(id)) issues.push(`${at}: id "${id}" is used twice`);
    else ids.add(id);
    if (typeof effect.enabled !== "boolean") issues.push(`${at}: enabled must be true or false`);
    if (!isEffectType(effect.type)) {
      issues.push(`${at}: type must be one of ${EFFECT_TYPES.join(", ")}`);
      return;
    }
    const params = effect.params;
    if (typeof params !== "object" || params === null || Array.isArray(params)) {
      issues.push(`${at}: params must be an object`);
      return;
    }
    for (const [name, value] of Object.entries(params as Record<string, unknown>)) {
      const def = effectParamDef(effect.type, name);
      if (!def) {
        issues.push(`${at}: ${effect.type} has no parameter "${name}"`);
        continue;
      }
      const issue = paramIssue(def, value);
      if (issue) issues.push(`${at}: params.${name} ${issue}`);
    }
  });
  return issues;
}

/** What is wrong with a parameter value, or null. */
export function paramIssue(def: EffectParamDef, value: unknown): string | null {
  if (!paramFits(def, value)) {
    if (def.kind === "number") return "must be a finite number";
    if (def.kind === "toggle") return "must be 0 or 1";
    if (def.kind === "color") return "must be a color [r, g, b, a]";
    return `must be one of ${(def.options ?? []).join(", ")}`;
  }
  if (def.kind === "number" && ((def.min !== undefined && (value as number) < def.min) || (def.max !== undefined && (value as number) > def.max))) return `must be in ${def.min}..${def.max}`;
  if (def.kind === "color" && (value as number[]).some((channel) => channel < 0 || channel > 1)) return "must have channels in 0..1";
  return null;
}

/**
 * What a clip lacks for keys of the effect property `prop` (its effect, a keyframeable parameter of its type);
 * null when it has it. `vector` says whether the parameter is a color.
 */
export function effectPropIssue(prop: string, effects: unknown): string | null {
  const match = EFFECT_PROP_PATTERN.exec(prop);
  if (!match) return "not an effect property";
  const list = Array.isArray(effects) ? (effects as { id?: unknown; type?: unknown }[]) : [];
  const effect = list.find((candidate) => candidate?.id === match[1]);
  if (!effect) return `the clip has no effect "${match[1]}"`;
  if (!isEffectType(effect.type)) return "the effect's type is unknown";
  const def = effectParamDef(effect.type, match[2] as string);
  if (!def) return `${effect.type} has no parameter "${match[2]}"`;
  if (!def.keyframeable) return `${effect.type} ${def.name} cannot be keyed`;
  return null;
}

/** Whether the effect property `prop` of a clip with `effects` is a color (its keys are [r, g, b, a]). */
export function isEffectColorProp(prop: string, effects: unknown): boolean {
  const match = EFFECT_PROP_PATTERN.exec(prop);
  if (!match) return false;
  const effect = (Array.isArray(effects) ? (effects as { id?: unknown; type?: unknown }[]) : []).find((candidate) => candidate?.id === match[1]);
  return effect !== undefined && isEffectType(effect.type) && effectParamDef(effect.type, match[2] as string)?.kind === "color";
}
