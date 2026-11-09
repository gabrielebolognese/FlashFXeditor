// Masks (spec §21.18, Batch 73): the actions on the selected clips' masks (add a rectangle, an ellipse or a
// path, the Wipe in and Circle reveal presets, remove all), and what the Masks section edits: number field
// bindings (bound outside React; a scrub shows live through the live masks, one command on release, P2),
// mode, invert, stopwatch, key diamond, reorder and remove. Mask mode on the canvas lives in canvasInput.
import type { Command } from "../core/commands/command.js";
import type { Clip, ClipId, Keyframes, Mask, MaskMode } from "../core/document/types.js";
import { maskAt, maskBase, masksAt, type MaskField, type MaskNumberField } from "../core/masks/maskEval.js";
import { addMask, applyMaskPreset, maskContentSize, removeAllMasks, removeMask, reorderMask, setMaskField, setMaskFlags, setMaskStopwatch, toggleMaskKey, type MaskPreset, type MaskShapeKind, type SizeOf } from "../timeline/edit/masks.js";
import type { NumberBinding } from "../ui/NumberField.js";
import { liveEdit, patchLiveEdit } from "./liveEdit.js";
import { previewView } from "./previewController.js";
import { documentStore, sessionStore } from "./services.js";

const run = (command: Command | null): boolean => {
  if (command) documentStore.dispatch(command);
  return command !== null;
};

const playhead = () => sessionStore.state.getState().playhead;

/** The selected clip ids. */
function selectedIds(): ClipId[] {
  const selection = sessionStore.selection.getState();
  return selection.kind === "clips" ? [...selection.clipIds] : [];
}

/** A clip's content size: its media, solid, shape or sequence size; a text's laid-out box as last drawn. */
export const masksSizeOf: SizeOf = (clip) => {
  const size = maskContentSize(documentStore.getState(), clip);
  if (size) return size;
  const box = previewView.contentBox(clip.id);
  return box && box.width > 0 && box.height > 0 ? { w: box.width, h: box.height } : null;
};

export function addMasks(kind: MaskShapeKind): boolean {
  return run(addMask(documentStore.getState(), selectedIds(), kind, masksSizeOf));
}

export function presetMasks(preset: MaskPreset): boolean {
  return run(applyMaskPreset(documentStore.getState(), selectedIds(), preset, masksSizeOf));
}

export function removeSelectedMasks(): boolean {
  return run(removeAllMasks(documentStore.getState(), selectedIds()));
}

export const removeOneMask = (clipId: ClipId, maskId: string) => run(removeMask(documentStore.getState(), clipId, maskId));
export const moveMask = (clipId: ClipId, maskId: string, direction: -1 | 1) => run(reorderMask(documentStore.getState(), clipId, maskId, direction));
export const setMaskMode = (clipId: ClipId, maskId: string, mode: MaskMode) => run(setMaskFlags(documentStore.getState(), clipId, maskId, { mode }));
export const setMaskInverted = (clipId: ClipId, maskId: string, inverted: boolean) => run(setMaskFlags(documentStore.getState(), clipId, maskId, { inverted }));
export const maskStopwatch = (clipId: ClipId, maskId: string, field: MaskField, on: boolean) => run(setMaskStopwatch(documentStore.getState(), clipId, maskId, field, on, playhead()));
export const maskToggleKey = (clipId: ClipId, maskId: string, field: MaskField) => run(toggleMaskKey(documentStore.getState(), clipId, maskId, field, playhead()));

type MaskedClip = Clip & { masks?: Mask[]; keyframes?: Keyframes };

/** The masks of `clipId` as shown at the playhead (keys sampled), or null. */
function shownMasks(clipId: ClipId): readonly Mask[] | null {
  const clip = documentStore.getState().clips[clipId] as MaskedClip | undefined;
  if (!clip) return null;
  return masksAt(clip, Math.max(0, Math.min(clip.duration - 1, playhead() - clip.start)));
}

/** The value of `field` of mask `maskId` at the playhead (a scrub's live one first), in document units. */
function shownValue(clipId: ClipId, maskId: string, field: MaskNumberField): number | null {
  const live = liveEdit.getState().masks?.get(clipId)?.find((m) => m.id === maskId);
  if (live) return maskBase(live, field) ?? null;
  const clip = documentStore.getState().clips[clipId] as MaskedClip | undefined;
  const mask = clip?.masks?.find((m) => m.id === maskId);
  if (!clip || !mask) return null;
  const rel = Math.max(0, Math.min(clip.duration - 1, playhead() - clip.start));
  return maskBase(maskAt(mask, clip.keyframes, rel), field) ?? null;
}

/**
 * A number field of one mask (`scale`: display units per document unit, 100 for opacity in %). A scrub
 * writes the live masks (drawn at once, no command) and commits one command on release; a typed value
 * or an arrow step is one command.
 */
export function maskBinding(clipId: ClipId, maskId: string, field: MaskNumberField, scale = 1): NumberBinding {
  let start: number | null = null;
  const commit = (value: number) => run(setMaskField(documentStore.getState(), clipId, maskId, field, value / scale, playhead()));
  return {
    read: () => {
      const value = shownValue(clipId, maskId, field);
      return value === null ? null : value * scale;
    },
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
        patchLiveEdit({ masks: null });
        return;
      }
      const base = start ?? shownValue(clipId, maskId, field);
      if (base === null) return;
      if (phase === "scrub") {
        start = base;
        const masks = shownMasks(clipId);
        if (!masks) return;
        const live = masks.map((m) => (m.id === maskId ? withField(m, field, base + delta / scale) : m));
        patchLiveEdit({ masks: new Map([[clipId, live]]) });
        return;
      }
      start = null;
      patchLiveEdit({ masks: null });
      if (delta !== 0) commit((base + delta / scale) * scale);
    },
  };
}

function withField(mask: Mask, field: MaskNumberField, value: number): Mask {
  const v = field === "opacity" ? Math.min(1, Math.max(0, value)) : field === "feather" || field === "w" || field === "h" || field === "radius" ? Math.max(0, value) : value;
  if (field === "feather" || field === "expansion" || field === "opacity") return { ...mask, [field]: v };
  if (mask.shape.kind === "path") return mask;
  return { ...mask, shape: { ...mask.shape, [field]: v } };
}
