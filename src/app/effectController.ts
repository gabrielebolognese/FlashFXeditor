// Effects (spec §21.19, Batch 74): the actions on the selected clips' effects (add each type, remove all) and
// what the Effects section edits: number field bindings (bound outside React; a scrub shows live through the
// live effects, one command on release, P2), colors, choices, enable toggles, stopwatches, key diamonds,
// drag to reorder and remove. Batch 75: loading a LUT file into a LUT effect (copied into the project's luts/),
// and looks: the selected clip's stack saved by name, a saved look applied to the selected clips in one click.
import type { Command } from "../core/commands/command.js";
import type { Clip, ClipId, Effect, EffectType, Keyframes, RGBA } from "../core/document/types.js";
import { effectValueAt } from "../core/effects/effectEval.js";
import { clampParam, EFFECT_DEFS, effectParamDef } from "../core/effects/effectParams.js";
import { addEffect, applyLook, effectClips, moveEffect, removeAllEffects, removeEffect, setEffectEnabled, setEffectParam, setEffectStopwatch, toggleEffectKey } from "../timeline/edit/effects.js";
import { lookFromEffects, nextLookName, type Look } from "../project/looks.js";
import { showToast } from "../ui/toasts.js";
import { pickFile, type PickerType } from "./filePickers.js";
import { ensureLuts, importLut, lutText } from "./lutController.js";
import type { NumberBinding } from "../ui/NumberField.js";
import { liveEdit, patchLiveEdit } from "./liveEdit.js";
import { documentStore, lookStore, sessionStore } from "./services.js";

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

const CUBE_TYPES: readonly PickerType[] = [{ description: "3D LUT", accept: { "application/octet-stream": [".cube"] } }];

/** Picks a `.cube` file and copies it into the project; the path, or null (cancelled or refused, with a toast). */
async function pickLut(): Promise<string | null> {
  const file = await pickFile(CUBE_TYPES);
  if (!file) return null;
  const result = await importLut(file);
  if ("error" in result) {
    showToast({ tone: "warning", message: "Can't load this LUT", detail: result.error });
    return null;
  }
  return result.path;
}

/** Load .cube on a LUT effect's File row: the file is copied into luts/ and the effect uses it (one undo step). */
export async function loadLut(clipId: ClipId, effectId: string): Promise<boolean> {
  const path = await pickLut();
  return path !== null && run(setEffectParam(documentStore.getState(), clipId, effectId, "file", path, playhead()));
}

/**
 * The "Load LUT" command: a `.cube` for the selected clips: each one's first LUT effect uses it, a clip without
 * one gets a LUT effect (one undo step for each kind of change).
 */
export async function loadLutForSelection(): Promise<boolean> {
  const project = documentStore.getState();
  const targets = effectClips(project, selectedIds());
  if (targets.length === 0) return false;
  const path = await pickLut();
  if (path === null) return false;
  const current = documentStore.getState();
  const without: ClipId[] = [];
  let done = false;
  for (const clip of effectClips(current, targets.map((t) => t.id))) {
    const lut = clip.effects?.find((e) => e.type === "lut");
    if (lut) done = run(setEffectParam(documentStore.getState(), clip.id, lut.id, "file", path, playhead())) || done;
    else without.push(clip.id);
  }
  if (without.length > 0) done = run(addEffect(documentStore.getState(), without, "lut", { file: path })) || done;
  return done;
}

/** The one selected clip's stack, or null (none or several selected, or no effects). */
function selectedStack(): Effect[] | null {
  const ids = selectedIds();
  if (ids.length !== 1) return null;
  const clip = documentStore.getState().clips[ids[0] as ClipId] as EffectClip | undefined;
  return clip?.effects && clip.effects.length > 0 ? clip.effects : null;
}

/** Saves the selected clip's effect stack as a look named `name` (the next free "Look n" when empty). */
export function saveLook(name = ""): Look | null {
  const effects = selectedStack();
  if (!effects) {
    showToast({ tone: "info", message: "Select one clip with effects to save a look" });
    return null;
  }
  const taken = lookStore.list.getState().map((look) => look.name);
  const look = lookFromEffects(effects, { id: crypto.randomUUID(), name: name.trim() === "" ? nextLookName(taken) : name, now: new Date().toISOString() }, lutText);
  if (!look) return null;
  void lookStore.save(look);
  showToast({ tone: "success", message: `Saved look "${look.name}"` });
  return look;
}

/** Applies a saved look to the selected clips: its LUT files are copied in first, then one command. */
export async function applyLookToSelection(id: string): Promise<boolean> {
  const look = lookStore.find(id);
  if (!look || effectClips(documentStore.getState(), selectedIds()).length === 0) return false;
  await ensureLuts(look.luts);
  return run(applyLook(documentStore.getState(), selectedIds(), look.effects, look.name));
}

/** The palette's "Apply last saved look". */
export function applyLastLook(): Promise<boolean> {
  const look = lookStore.list.getState()[0];
  return look ? applyLookToSelection(look.id) : Promise.resolve(false);
}

export const removeLook = (id: string): Promise<void> => lookStore.remove(id);

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
