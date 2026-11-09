// Effects (spec §21.19, Batch 74): the actions on the selected clips' effects (add each type, remove all) and
// what the Effects section edits: number field bindings (bound outside React; a scrub shows live through the
// live effects, one command on release, P2), colors, choices, enable toggles, stopwatches, key diamonds,
// drag to reorder and remove.
import type { Command } from "../core/commands/command.js";
import type { Clip, ClipId, Effect, EffectType, Keyframes, RGBA } from "../core/document/types.js";
import { effectValueAt } from "../core/effects/effectEval.js";
import { clampParam, EFFECT_DEFS, effectParamDef } from "../core/effects/effectParams.js";
import { addEffect, moveEffect, removeAllEffects, removeEffect, setEffectEnabled, setEffectParam, setEffectStopwatch, toggleEffectKey } from "../timeline/edit/effects.js";
import type { NumberBinding } from "../ui/NumberField.js";
import { liveEdit, patchLiveEdit } from "./liveEdit.js";
import { documentStore, sessionStore } from "./services.js";

const run = (command: Command | null): boolean => {
  if (command) documentStore.dispatch(command);
  return command !== null;
};

const playhead = () => sessionStore.state.getState().playhead;

function selectedIds(): ClipId[] {
  const selection = sessionStore.selection.getState();
  return selection.kind === "clips" ? [...selection.clipIds] : [];
}

type EffectClip = Clip & { effects?: Effect[]; keyframes?: Keyframes };

export const addEffects = (type: EffectType): boolean => run(addEffect(documentStore.getState(), selectedIds(), type));
export const removeSelectedEffects = (): boolean => run(removeAllEffects(documentStore.getState(), selectedIds()));
export const removeOneEffect = (clipId: ClipId, effectId: string) => run(removeEffect(documentStore.getState(), clipId, effectId));
export const moveOneEffect = (clipId: ClipId, effectId: string, to: number) => run(moveEffect(documentStore.getState(), clipId, effectId, to));
export const enableEffect = (clipId: ClipId, effectId: string, on: boolean) => run(setEffectEnabled(documentStore.getState(), clipId, effectId, on));
export const setEffectChoice = (clipId: ClipId, effectId: string, param: string, value: string) => run(setEffectParam(documentStore.getState(), clipId, effectId, param, value, playhead()));
export const setEffectToggle = (clipId: ClipId, effectId: string, param: string, on: boolean) => run(setEffectParam(documentStore.getState(), clipId, effectId, param, on ? 1 : 0, playhead()));
export const effectStopwatch = (clipId: ClipId, effectId: string, param: string, on: boolean) => run(setEffectStopwatch(documentStore.getState(), clipId, effectId, param, on, playhead()));
export const effectToggleKey = (clipId: ClipId, effectId: string, param: string) => run(toggleEffectKey(documentStore.getState(), clipId, effectId, param, playhead()));

/** Sets a color parameter (straight RGBA). */
export function setEffectColor(clipId: ClipId, effectId: string, param: string, color: RGBA): boolean {
  patchLiveEdit({ effects: null });
  return run(setEffectParam(documentStore.getState(), clipId, effectId, param, [color.r, color.g, color.b, color.a], playhead()));
}

/** Shows a color while the picker is dragged (null: the drag ended). */
export function previewEffectColor(clipId: ClipId, effectId: string, param: string, color: RGBA | null): void {
  if (!color) {
    patchLiveEdit({ effects: null });
    return;
  }
  const effects = shownEffects(clipId);
  if (!effects) return;
  patchLiveEdit({ effects: new Map([[clipId, effects.map((e) => (e.id === effectId ? { ...e, params: { ...e.params, [param]: [color.r, color.g, color.b, color.a] } } : e))]]) });
}

/** The effects of `clipId` with their values at the playhead (keys sampled, no keys left), or null. */
function shownEffects(clipId: ClipId): Effect[] | null {
  const clip = documentStore.getState().clips[clipId] as EffectClip | undefined;
  if (!clip?.effects) return null;
  const rel = Math.max(0, Math.min(clip.duration - 1, playhead() - clip.start));
  return clip.effects.map((effect) => {
    const params: Effect["params"] = {};
    for (const def of EFFECT_DEFS[effect.type]?.params ?? []) params[def.name] = effectValueAt(effect, clip.keyframes, def, rel);
    return { ...effect, params };
  });
}

/** The value of a parameter at the playhead (a scrub's live one first). */
export function shownParam(clipId: ClipId, effectId: string, param: string): number | number[] | string | null {
  const live = liveEdit.getState().effects?.get(clipId)?.find((e) => e.id === effectId);
  if (live) return live.params[param] ?? null;
  const clip = documentStore.getState().clips[clipId] as EffectClip | undefined;
  const effect = clip?.effects?.find((e) => e.id === effectId);
  const def = effect ? effectParamDef(effect.type, param) : undefined;
  if (!clip || !effect || !def) return null;
  return effectValueAt(effect, clip.keyframes, def, Math.max(0, Math.min(clip.duration - 1, playhead() - clip.start)));
}

/**
 * A number parameter of one effect. A scrub writes the live effects (drawn at once, no command) and commits
 * one command on release; a typed value or an arrow step is one command.
 */
export function effectBinding(clipId: ClipId, effectId: string, param: string): NumberBinding {
  let start: number | null = null;
  const commit = (value: number) => run(setEffectParam(documentStore.getState(), clipId, effectId, param, value, playhead()));
  const read = (): number | null => {
    const value = shownParam(clipId, effectId, param);
    return typeof value === "number" ? value : null;
  };
  return {
    read,
    subscribe: (listener) => {
      const stops = [documentStore.subscribe(() => listener()), liveEdit.subscribe(() => listener()), sessionStore.state.select((state) => state.playhead, () => listener())];
      return () => {
        for (const stop of stops) stop();
      };
    },
    set: (value) => {
      commit(value);
    },
    change(delta, phase) {
      if (phase === "cancel") {
        start = null;
        patchLiveEdit({ effects: null });
        return;
      }
      const base = start ?? read();
      if (base === null) return;
      if (phase === "scrub") {
        start = base;
        const effects = shownEffects(clipId);
        if (!effects) return;
        const live = effects.map((e) => {
          if (e.id !== effectId) return e;
          const def = effectParamDef(e.type, param);
          return def ? { ...e, params: { ...e.params, [param]: clampParam(def, base + delta) } } : e;
        });
        patchLiveEdit({ effects: new Map([[clipId, live]]) });
        return;
      }
      start = null;
      patchLiveEdit({ effects: null });
      if (delta !== 0) commit(base + delta);
    },
  };
}
