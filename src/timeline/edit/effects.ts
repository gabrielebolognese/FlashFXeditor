// Effects (spec §21.19, Batch 74): the edits of the Effects section. Each is one undo step; locked clips are
// left out. A keyframeable parameter is written as a key at the playhead when its stopwatch is on (it has
// keys), else as its base value; a choice or a toggle is never keyed.
import type { Draft } from "immer";
import type { Command } from "../../core/commands/command.js";
import { setKey, withKeys, type Key } from "../../core/document/keyframes.js";
import type { Clip, ClipId, Effect, EffectType, Frame, Keyframes, Project } from "../../core/document/types.js";
import { effectKeys, effectValueAt } from "../../core/effects/effectEval.js";
import { clampParam, EFFECT_DEFS, EFFECT_KINDS, effectParam, effectParamDef, effectProp, isProjectFile, newEffect, type EffectParamDef } from "../../core/effects/effectParams.js";
import { isClipLocked } from "../model/queries.js";

type EffectClip = Clip & { effects?: Effect[]; keyframes?: Keyframes };

const KINDS: ReadonlySet<string> = new Set(EFFECT_KINDS);

/** Whether `clip` can have effects (a visual kind). */
export function takesEffects(clip: Clip): boolean {
  return KINDS.has(clip.kind);
}

/** The clips among `ids` that take effects and are not locked. */
export function effectClips(project: Project, ids: readonly ClipId[]): EffectClip[] {
  const out: EffectClip[] = [];
  for (const id of ids) {
    const clip = project.clips[id];
    if (clip && takesEffects(clip) && !isClipLocked(project, id)) out.push(clip as EffectClip);
  }
  return out;
}

/** An effect id not used by `effects` (`fx1`, `fx2`, ...). */
export function nextEffectId(effects: readonly Effect[] | undefined): string {
  const used = new Set((effects ?? []).map((e) => e.id));
  let n = 1;
  while (used.has(`fx${n}`)) n += 1;
  return `fx${n}`;
}

/**
 * Adds an effect of `type` (every parameter at its default, or as `params` sets it) at the end of each clip's
 * stack (one undo step).
 */
export function addEffect(project: Project, ids: readonly ClipId[], type: EffectType, params: Effect["params"] = {}): Command | null {
  const targets = effectClips(project, ids);
  if (targets.length === 0) return null;
  const adds = targets.map((clip) => {
    const effect = newEffect(type, nextEffectId(clip.effects));
    effect.params = { ...effect.params, ...structuredClone(params) };
    return { id: clip.id, effect };
  });
  return {
    id: "clip.effect.add",
    label: `Add ${EFFECT_DEFS[type].label.toLowerCase()}`,
    affects: ["clips", "composite"],
    run(draft) {
      for (const { id, effect } of adds) (((draft.clips[id] as Draft<EffectClip>).effects ??= []) as Effect[]).push(effect);
    },
  };
}

/** Removes the keys of effect `effectId` from a (draft) clip. */
function dropEffectKeys(clip: Draft<EffectClip>, effectId: string): void {
  if (!clip.keyframes) return;
  const prefix = `effects.${effectId}.`;
  for (const prop of Object.keys(clip.keyframes)) if (prop.startsWith(prefix)) delete clip.keyframes[prop];
  if (Object.keys(clip.keyframes).length === 0) delete clip.keyframes;
}

/** Removes effect `effectId` of `clipId` and its keys. */
export function removeEffect(project: Project, clipId: ClipId, effectId: string): Command | null {
  const clip = effectClips(project, [clipId])[0];
  if (!clip?.effects?.some((e) => e.id === effectId)) return null;
  return {
    id: "clip.effect.remove",
    label: "Remove effect",
    affects: ["clips", "composite"],
    run(draft) {
      const target = draft.clips[clipId] as Draft<EffectClip>;
      target.effects = (target.effects ?? []).filter((e) => e.id !== effectId);
      // An adjustment clip keeps its (required) list, empty (spec §21.20).
      if (target.effects.length === 0 && target.kind !== "adjustment") delete target.effects;
      dropEffectKeys(target, effectId);
    },
  };
}

/** Removes every effect of the clips `ids` and their keys (one undo step). */
export function removeAllEffects(project: Project, ids: readonly ClipId[]): Command | null {
  const targets = effectClips(project, ids).filter((clip) => (clip.effects?.length ?? 0) > 0);
  if (targets.length === 0) return null;
  const work = targets.map((clip) => ({ id: clip.id, effectIds: (clip.effects ?? []).map((e) => e.id) }));
  return {
    id: "clip.effect.removeAll",
    label: "Remove effects",
    affects: ["clips", "composite"],
    run(draft) {
      for (const { id, effectIds } of work) {
        const clip = draft.clips[id] as Draft<EffectClip>;
        if (clip.kind === "adjustment") clip.effects = [];
        else delete clip.effects;
        for (const effectId of effectIds) dropEffectKeys(clip, effectId);
      }
    },
  };
}

/**
 * Applies a look (Batch 75: an effect stack saved by name) to the clips `ids`: each clip's stack becomes a copy
 * of `effects` (new ids `fx1`, `fx2`, ...), its effect keys dropped. One undo step.
 */
export function applyLook(project: Project, ids: readonly ClipId[], effects: readonly Effect[], name: string): Command | null {
  const targets = effectClips(project, ids);
  if (targets.length === 0 || effects.length === 0) return null;
  const stack: Effect[] = effects.map((effect, i) => ({ id: `fx${i + 1}`, type: effect.type, enabled: effect.enabled, params: structuredClone(effect.params) }));
  const work = targets.map((clip) => ({ id: clip.id, old: (clip.effects ?? []).map((e) => e.id) }));
  return {
    id: "clip.effect.applyLook",
    label: `Apply look ${name}`,
    affects: ["clips", "composite"],
    run(draft) {
      for (const { id, old } of work) {
        const clip = draft.clips[id] as Draft<EffectClip>;
        for (const effectId of old) dropEffectKeys(clip, effectId);
        clip.effects = structuredClone(stack) as Draft<Effect>[];
      }
    },
  };
}

/** Moves effect `effectId` to index `to` of its clip's stack (drag to reorder; earlier effects apply first). */
export function moveEffect(project: Project, clipId: ClipId, effectId: string, to: number): Command | null {
  const clip = effectClips(project, [clipId])[0];
  const effects = clip?.effects ?? [];
  const from = effects.findIndex((e) => e.id === effectId);
  const target = Math.max(0, Math.min(effects.length - 1, Math.round(to)));
  if (from < 0 || target === from || !Number.isFinite(to)) return null;
  return {
    id: "clip.effect.order",
    label: "Reorder effects",
    affects: ["clips", "composite"],
    run(draft) {
      const list = (draft.clips[clipId] as Draft<EffectClip>).effects as Draft<Effect>[];
      const [moved] = list.splice(from, 1);
      if (moved) list.splice(target, 0, moved);
    },
  };
}

/** Turns effect `effectId` on or off (kept in the stack, not drawn while off). */
export function setEffectEnabled(project: Project, clipId: ClipId, effectId: string, enabled: boolean): Command | null {
  const found = editable(project, clipId, effectId);
  if (!found || found.effect.enabled === enabled) return null;
  return {
    id: "clip.effect.enabled",
    label: enabled ? "Enable effect" : "Disable effect",
    affects: ["clips", "composite"],
    run(draft) {
      const effect = ((draft.clips[clipId] as Draft<EffectClip>).effects ?? []).find((e) => e.id === effectId);
      if (effect) effect.enabled = enabled;
    },
  };
}

/** The clip and effect, when editable. */
function editable(project: Project, clipId: ClipId, effectId: string): { clip: EffectClip; effect: Effect } | null {
  const clip = effectClips(project, [clipId])[0];
  const effect = clip?.effects?.find((e) => e.id === effectId);
  return clip && effect ? { clip, effect } : null;
}

/** The clip-relative frame of `at`, inside the clip. */
function relOf(clip: Clip, at: Frame): Frame {
  return Math.max(0, Math.min(clip.duration - 1, at - clip.start));
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => v === b[i]);
  return a === b;
}

/** Whether parameter `def` of effect `effectId` has keys on `clip`. */
export function effectParamKeyed(clip: { keyframes?: Keyframes | undefined }, effectId: string, param: string): boolean {
  return effectKeys(clip.keyframes, effectId, param) !== undefined;
}

/** The value parameter `param` of `effect` shows at `at` (project frame). */
export function effectParamAt(clip: EffectClip, effect: Effect, param: string, at: Frame): number | number[] | string {
  const def = effectParamDef(effect.type, param);
  if (!def) return effectParam(effect, param);
  return effectValueAt(effect, clip.keyframes, def, relOf(clip, at));
}

/** Writes one parameter on a draft clip: a key at `rel` when keyed, else the base. */
function writeParam(clip: Draft<EffectClip>, effectId: string, def: EffectParamDef, value: number | number[] | string, rel: Frame): void {
  const prop = effectProp(effectId, def.name);
  const keys = clip.keyframes?.[prop] as Key[] | undefined;
  if (def.keyframeable && keys && keys.length > 0 && typeof value !== "string") {
    clip.keyframes = withKeys(clip.keyframes as never, prop, setKey(keys, rel, value)) as never;
    return;
  }
  const effect = (clip.effects ?? []).find((e) => e.id === effectId);
  if (effect) effect.params[def.name] = Array.isArray(value) ? [...value] : value;
}

/** Sets parameter `param` of an effect to `value` (clamped into its range): a key at the playhead when keyed, else its base. */
export function setEffectParam(project: Project, clipId: ClipId, effectId: string, param: string, value: number | number[] | string, at: Frame): Command | null {
  const found = editable(project, clipId, effectId);
  if (!found) return null;
  const { clip, effect } = found;
  const def = effectParamDef(effect.type, param);
  if (!def || !fits(def, value)) return null;
  const clamped = clampParam(def, value);
  const rel = relOf(clip, at);
  if (sameValue(effectValueAt(effect, clip.keyframes, def, rel), clamped)) return null;
  return {
    id: "clip.effect.param",
    label: `${EFFECT_DEFS[effect.type].label} ${def.label.toLowerCase()}`,
    affects: ["clips", "composite"],
    run(draft) {
      writeParam(draft.clips[clipId] as Draft<EffectClip>, effectId, def, clamped, rel);
    },
  };
}

function fits(def: EffectParamDef, value: unknown): boolean {
  if (def.kind === "choice") return typeof value === "string" && (def.options ?? []).includes(value);
  if (def.kind === "file") return typeof value === "string" && (value === "" || isProjectFile(def, value));
  if (def.kind === "color") return Array.isArray(value) && value.length === 4 && value.every((v) => typeof v === "number" && Number.isFinite(v));
  return typeof value === "number" && Number.isFinite(value);
}

/** The stopwatch of a parameter (spec §21.19 `effects.<id>.<param>`): on keys the shown value at the playhead; off drops the keys, keeping that value. */
export function setEffectStopwatch(project: Project, clipId: ClipId, effectId: string, param: string, on: boolean, at: Frame): Command | null {
  const found = editable(project, clipId, effectId);
  if (!found) return null;
  const { clip, effect } = found;
  const def = effectParamDef(effect.type, param);
  if (!def || !def.keyframeable) return null;
  if (on === effectParamKeyed(clip, effectId, param)) return null;
  const rel = relOf(clip, at);
  const shown = effectValueAt(effect, clip.keyframes, def, rel);
  if (typeof shown === "string") return null;
  const prop = effectProp(effectId, param);
  return {
    id: "clip.effect.stopwatch",
    label: on ? "Animate effect" : "Stop animating effect",
    affects: ["clips", "composite"],
    run(draft) {
      const target = draft.clips[clipId] as Draft<EffectClip>;
      if (on) {
        target.keyframes = withKeys(target.keyframes as never, prop, setKey([], rel, shown)) as never;
        return;
      }
      target.keyframes = withKeys(target.keyframes as never, prop, undefined) as never;
      if (target.keyframes === undefined) delete target.keyframes;
      writeParam(target, effectId, def, shown, rel);
    },
  };
}

/** Adds a key of a keyed parameter at the playhead, or removes the key there (the diamond button). */
export function toggleEffectKey(project: Project, clipId: ClipId, effectId: string, param: string, at: Frame): Command | null {
  const found = editable(project, clipId, effectId);
  if (!found) return null;
  const { clip, effect } = found;
  const def = effectParamDef(effect.type, param);
  const keys = effectKeys(clip.keyframes, effectId, param);
  if (!def || !keys) return null;
  const rel = relOf(clip, at);
  const there = keys.some((k) => k.frame === rel);
  const shown = effectValueAt(effect, clip.keyframes, def, rel);
  if (!there && typeof shown === "string") return null;
  const prop = effectProp(effectId, param);
  return {
    id: "clip.effect.key",
    label: there ? "Remove effect key" : "Add effect key",
    affects: ["clips", "composite"],
    run(draft) {
      const target = draft.clips[clipId] as Draft<EffectClip>;
      const current = (target.keyframes?.[prop] ?? []) as Key[];
      const next = there ? current.filter((k) => k.frame !== rel) : setKey(current, rel, shown as number | number[]);
      target.keyframes = withKeys(target.keyframes as never, prop, next.length > 0 ? next : undefined) as never;
      if (target.keyframes === undefined) delete target.keyframes;
    },
  };
}
