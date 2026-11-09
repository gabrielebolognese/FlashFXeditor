// Masks (spec §21.18, Batch 73): the edits of the Masks section and of the canvas mask mode. Each is one
// undo step; locked clips are left out. A mask's fields are written as keys at the playhead when their
// stopwatch is on (they have keys), else as the base value. Adding or deleting a path point edits the
// base path and every key of it alike, so a keyed path keeps morphing (equal point counts).
import type { Draft } from "immer";
import type { Command } from "../../core/commands/command.js";
import { setKey, withKeys, type Key } from "../../core/document/keyframes.js";
import { secondsToFrames } from "../../core/document/time.js";
import { sequenceOfTrack } from "../../core/document/sequences.js";
import { MASKABLE_KINDS } from "../../core/document/keyframes.js";
import type { Clip, ClipId, Frame, Keyframes, Mask, MaskMode, Project } from "../../core/document/types.js";
import { maskKeys, maskProp, maskBase, maskHasField, maskValueAt, maskPointsAt, writeMaskBase, isPropOfMask, MASK_NUMBER_FIELDS, type MaskField, type MaskNumberField } from "../../core/masks/maskEval.js";
import { buildMaskReveal, revealBox, type MaskRevealKind } from "../../core/masks/maskReveal.js";
import { deleteAnchor, formatMaskPath, maskPathData, maskPathPoints, parseMaskPath, pathPoints, polygonPath, splitSegment, withPoints, type SegmentRef } from "../../core/masks/maskPath.js";
import { isClipLocked } from "../model/queries.js";

export type MaskShapeKind = Mask["shape"]["kind"];
/** A content box size (content px). */
export interface ContentSize {
  w: number;
  h: number;
}
/** The content size of a clip, as the caller knows it (a text's layout box comes from the preview). */
export type SizeOf = (clip: Clip) => ContentSize | null;

type MaskedClip = Clip & { masks?: Mask[]; keyframes?: Keyframes };

const MASKABLE: ReadonlySet<string> = new Set(MASKABLE_KINDS);

/** Whether `clip` can have masks (a visual kind). */
export function isMaskable(clip: Clip): boolean {
  return MASKABLE.has(clip.kind);
}

/** The maskable clips among `ids` that are not locked. */
export function maskableClips(project: Project, ids: readonly ClipId[]): MaskedClip[] {
  const out: MaskedClip[] = [];
  for (const id of ids) {
    const clip = project.clips[id];
    if (clip && isMaskable(clip) && !isClipLocked(project, id)) out.push(clip as MaskedClip);
  }
  return out;
}

/**
 * The content box of `clip` without the preview (spec §21.18 "content px"): a solid's or shape's size,
 * a picture's shown size (rotation applied), a compound's sequence size. Null for a text (its layout box
 * is measured by the preview) and for clips without one.
 */
export function maskContentSize(project: Project, clip: Clip): ContentSize | null {
  switch (clip.kind) {
    case "solid":
    case "shape":
      return { w: clip.size.w, h: clip.size.h };
    case "video":
    case "image": {
      const item = project.media[clip.mediaId];
      if (!item || !item.width || !item.height) return null;
      const quarter = item.rotation === 90 || item.rotation === 270;
      return quarter ? { w: item.height, h: item.width } : { w: item.width, h: item.height };
    }
    case "compound": {
      const sequence = project.sequences[clip.sequenceId];
      return sequence ? { w: sequence.size.w, h: sequence.size.h } : null;
    }
    case "adjustment": {
      // Its content box is the frame of the sequence it is in (spec §21.20): masks in project px.
      const sequence = sequenceOfTrack(project, clip.trackId);
      return sequence ? { w: sequence.size.w, h: sequence.size.h } : { w: project.settings.width, h: project.settings.height };
    }
    default:
      return null;
  }
}

/** A mask id not used by `masks` (`mask1`, `mask2`, ...). */
export function nextMaskId(masks: readonly Mask[] | undefined): string {
  const used = new Set((masks ?? []).map((m) => m.id));
  let n = 1;
  while (used.has(`mask${n}`)) n += 1;
  return `mask${n}`;
}

/** A new mask of `kind` over the middle of a `size` content box (inset by a tenth on each side). */
export function defaultMask(kind: MaskShapeKind, size: ContentSize, id: string): Mask {
  const x = round(size.w * 0.1);
  const y = round(size.h * 0.1);
  const w = round(size.w * 0.8);
  const h = round(size.h * 0.8);
  const base = { id, mode: "add" as MaskMode, feather: 0, expansion: 0, opacity: 1, inverted: false };
  if (kind === "path") return { ...base, shape: { kind: "path", d: polygonPath([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]) } };
  return { ...base, shape: kind === "rect" ? { kind: "rect", x, y, w, h, radius: 0 } : { kind: "ellipse", x, y, w, h } };
}

/** Adds a mask of `kind` to each clip `ids` (one undo step). */
export function addMask(project: Project, ids: readonly ClipId[], kind: MaskShapeKind, sizeOf: SizeOf): Command | null {
  const targets = maskableClips(project, ids)
    .map((clip) => ({ clip, size: sizeOf(clip) }))
    .filter((t): t is { clip: MaskedClip; size: ContentSize } => t.size !== null && t.size.w > 0 && t.size.h > 0);
  if (targets.length === 0) return null;
  const adds = targets.map(({ clip, size }) => ({ id: clip.id, mask: defaultMask(kind, size, nextMaskId(clip.masks)) }));
  return {
    id: "clip.mask.add",
    label: kind === "rect" ? "Add rectangle mask" : kind === "ellipse" ? "Add ellipse mask" : "Add path mask",
    affects: ["clips", "composite"],
    run(draft) {
      for (const { id, mask } of adds) {
        const clip = draft.clips[id] as Draft<MaskedClip>;
        (clip.masks ??= []).push(mask);
      }
    },
  };
}

/** Removes the keys of every field of mask `maskId` from a (draft) clip. */
function dropMaskKeys(clip: Draft<MaskedClip>, maskId: string): void {
  if (!clip.keyframes) return;
  for (const prop of Object.keys(clip.keyframes)) if (isPropOfMask(prop, maskId)) delete clip.keyframes[prop];
  if (Object.keys(clip.keyframes).length === 0) delete clip.keyframes;
}

/** Removes mask `maskId` of `clipId` and its keys. */
export function removeMask(project: Project, clipId: ClipId, maskId: string): Command | null {
  const clip = maskableClips(project, [clipId])[0];
  if (!clip?.masks?.some((m) => m.id === maskId)) return null;
  return {
    id: "clip.mask.remove",
    label: "Remove mask",
    affects: ["clips", "composite"],
    run(draft) {
      const target = draft.clips[clipId] as Draft<MaskedClip>;
      target.masks = (target.masks ?? []).filter((m) => m.id !== maskId);
      if (target.masks.length === 0) delete target.masks;
      dropMaskKeys(target, maskId);
    },
  };
}

/** Removes every mask of the clips `ids` (one undo step). */
export function removeAllMasks(project: Project, ids: readonly ClipId[]): Command | null {
  const targets = maskableClips(project, ids).filter((clip) => (clip.masks?.length ?? 0) > 0);
  if (targets.length === 0) return null;
  const work = targets.map((clip) => ({ id: clip.id, maskIds: (clip.masks ?? []).map((m) => m.id) }));
  return {
    id: "clip.mask.removeAll",
    label: "Remove masks",
    affects: ["clips", "composite"],
    run(draft) {
      for (const { id, maskIds } of work) {
        const clip = draft.clips[id] as Draft<MaskedClip>;
        delete clip.masks;
        for (const maskId of maskIds) dropMaskKeys(clip, maskId);
      }
    },
  };
}

/** Moves mask `maskId` one place up (-1, combined earlier) or down (1) in its clip's list. */
export function reorderMask(project: Project, clipId: ClipId, maskId: string, direction: -1 | 1): Command | null {
  const clip = maskableClips(project, [clipId])[0];
  const masks = clip?.masks ?? [];
  const from = masks.findIndex((m) => m.id === maskId);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= masks.length) return null;
  return {
    id: "clip.mask.reorder",
    label: "Reorder masks",
    affects: ["clips", "composite"],
    run(draft) {
      const list = (draft.clips[clipId] as Draft<MaskedClip>).masks as Draft<Mask>[];
      const [moved] = list.splice(from, 1);
      if (moved) list.splice(to, 0, moved);
    },
  };
}

/** The clip and mask, when editable. */
function editable(project: Project, clipId: ClipId, maskId: string): { clip: MaskedClip; mask: Mask } | null {
  const clip = maskableClips(project, [clipId])[0];
  const mask = clip?.masks?.find((m) => m.id === maskId);
  return clip && mask ? { clip, mask } : null;
}

/** The clip-relative frame of `at`, inside the clip. */
function relOf(clip: Clip, at: Frame): Frame {
  return Math.max(0, Math.min(clip.duration - 1, at - clip.start));
}

/** Mode, inversion or name-less flags of a mask (never keyed). */
export function setMaskFlags(project: Project, clipId: ClipId, maskId: string, patch: { mode?: MaskMode; inverted?: boolean }): Command | null {
  const found = editable(project, clipId, maskId);
  if (!found) return null;
  const { mask } = found;
  if ((patch.mode === undefined || patch.mode === mask.mode) && (patch.inverted === undefined || patch.inverted === mask.inverted)) return null;
  return {
    id: "clip.mask.flags",
    label: patch.mode !== undefined ? "Mask mode" : "Invert mask",
    affects: ["clips", "composite"],
    run(draft) {
      const target = ((draft.clips[clipId] as Draft<MaskedClip>).masks ?? []).find((m) => m.id === maskId);
      if (!target) return;
      if (patch.mode !== undefined) target.mode = patch.mode;
      if (patch.inverted !== undefined) target.inverted = patch.inverted;
    },
  };
}

/** Sets number field `field` of a mask to `value`: a key at the playhead when it has keys, else its base. */
export function setMaskField(project: Project, clipId: ClipId, maskId: string, field: MaskNumberField, value: number, at: Frame): Command | null {
  const found = editable(project, clipId, maskId);
  if (!found || !maskHasField(found.mask, field) || !Number.isFinite(value)) return null;
  const { clip, mask } = found;
  const rel = relOf(clip, at);
  const keys = maskKeys(clip.keyframes, maskId, field);
  const clamped = clampField(field, value);
  if (keys ? maskValueAt(mask, clip.keyframes, field, rel) === clamped : maskBase(mask, field) === clamped) return null;
  return {
    id: "clip.mask.field",
    label: `Mask ${FIELD_LABEL[field]}`,
    affects: ["clips", "composite"],
    run(draft) {
      const target = draft.clips[clipId] as Draft<MaskedClip>;
      writeField(target, maskId, field, clamped, rel);
    },
  };
}

/** Writes one field on a draft clip (a key when keyed, else the base). */
function writeField(clip: Draft<MaskedClip>, maskId: string, field: MaskField, value: number | number[], rel: Frame): void {
  const prop = maskProp(maskId, field);
  const keys = clip.keyframes?.[prop] as Key[] | undefined;
  if (keys && keys.length > 0) {
    clip.keyframes = withKeys(clip.keyframes as never, prop, setKey(keys, rel, value)) as never;
    return;
  }
  const mask = (clip.masks ?? []).find((m) => m.id === maskId);
  if (!mask) return;
  if (field === "path") {
    if (mask.shape.kind === "path" && Array.isArray(value)) mask.shape.d = maskPathData(mask.shape.d, value);
  } else if (typeof value === "number") writeMaskBase(mask as Mask, field, value);
}

const FIELD_LABEL: Record<MaskField, string> = { x: "X", y: "Y", w: "width", h: "height", radius: "roundness", feather: "feather", expansion: "expansion", opacity: "opacity", path: "path" };

function clampField(field: MaskNumberField, value: number): number {
  if (field === "feather" || field === "w" || field === "h" || field === "radius") return Math.max(0, value);
  if (field === "opacity") return Math.min(1, Math.max(0, value));
  return value;
}

/** The stopwatch of a mask field (spec §21.18 keyframe props): on keys the shown value at the playhead; off drops the keys, keeping that value. */
export function setMaskStopwatch(project: Project, clipId: ClipId, maskId: string, field: MaskField, on: boolean, at: Frame): Command | null {
  const found = editable(project, clipId, maskId);
  if (!found || !maskHasField(found.mask, field)) return null;
  const { clip, mask } = found;
  const keys = maskKeys(clip.keyframes, maskId, field);
  if (on === (keys !== undefined && keys.length > 0)) return null;
  const rel = relOf(clip, at);
  const shown: number | number[] | undefined = field === "path" ? (maskPointsAt(mask, clip.keyframes, rel) ?? undefined) : maskValueAt(mask, clip.keyframes, field, rel);
  if (shown === undefined) return null;
  const prop = maskProp(maskId, field);
  return {
    id: "clip.mask.stopwatch",
    label: on ? "Animate mask" : "Stop animating mask",
    affects: ["clips", "composite"],
    run(draft) {
      const target = draft.clips[clipId] as Draft<MaskedClip>;
      if (on) {
        target.keyframes = withKeys(target.keyframes as never, prop, setKey([], rel, shown)) as never;
        return;
      }
      target.keyframes = withKeys(target.keyframes as never, prop, undefined) as never;
      if (target.keyframes === undefined) delete target.keyframes;
      writeField(target, maskId, field, shown, rel);
    },
  };
}

/** Adds a key of a keyed field at the playhead, or removes the key there (the diamond button). */
export function toggleMaskKey(project: Project, clipId: ClipId, maskId: string, field: MaskField, at: Frame): Command | null {
  const found = editable(project, clipId, maskId);
  if (!found) return null;
  const { clip, mask } = found;
  const keys = maskKeys(clip.keyframes, maskId, field);
  if (!keys || keys.length === 0) return null;
  const rel = relOf(clip, at);
  const there = keys.some((k) => k.frame === rel);
  const shown: number | number[] | undefined = field === "path" ? (maskPointsAt(mask, clip.keyframes, rel) ?? undefined) : maskValueAt(mask, clip.keyframes, field, rel);
  if (!there && shown === undefined) return null;
  const prop = maskProp(maskId, field);
  return {
    id: "clip.mask.key",
    label: there ? "Remove mask key" : "Add mask key",
    affects: ["clips", "composite"],
    run(draft) {
      const target = draft.clips[clipId] as Draft<MaskedClip>;
      const current = (target.keyframes?.[prop] ?? []) as Key[];
      const next = there ? current.filter((k) => k.frame !== rel) : setKey(current, rel, shown as number | number[]);
      target.keyframes = withKeys(target.keyframes as never, prop, next.length > 0 ? next : undefined) as never;
      if (target.keyframes === undefined) delete target.keyframes;
    },
  };
}

/** Whether mask `maskId` of `clip` has keys on `field`. */
export function maskFieldKeyed(clip: { keyframes?: Keyframes | undefined }, maskId: string, field: MaskField): boolean {
  return (maskKeys(clip.keyframes, maskId, field)?.length ?? 0) > 0;
}

/** Whether there is a key of `field` at the playhead. */
export function maskKeyAt(clip: { start: Frame; keyframes?: Keyframes | undefined }, maskId: string, field: MaskField, at: Frame): boolean {
  const keys = maskKeys(clip.keyframes, maskId, field);
  const rel = at - clip.start;
  return keys?.some((k) => k.frame === rel) ?? false;
}

/**
 * The canvas gesture's result (spec §21.18 canvas mask mode): `shown` is the clip's masks as the gesture
 * left them at the playhead (from `masksAt`, then edited). Every field that differs from what was shown
 * is written (a key at the playhead when keyed, else the base), as one undo step.
 */
export function commitMaskGesture(project: Project, clipId: ClipId, before: readonly Mask[], after: readonly Mask[], at: Frame): Command | null {
  const clip = maskableClips(project, [clipId])[0];
  if (!clip?.masks) return null;
  const rel = relOf(clip, at);
  const writes: { maskId: string; field: MaskField; value: number | number[] }[] = [];
  for (const edited of after) {
    const old = before.find((m) => m.id === edited.id);
    if (!old || !clip.masks.some((m) => m.id === edited.id)) continue;
    for (const field of MASK_NUMBER_FIELDS) {
      if (!maskHasField(edited, field)) continue;
      const a = maskBase(old, field);
      const b = maskBase(edited, field);
      if (b !== undefined && a !== b) writes.push({ maskId: edited.id, field, value: round(b) });
    }
    if (edited.shape.kind === "path" && old.shape.kind === "path" && edited.shape.d !== old.shape.d) {
      const points = maskPathPoints(edited.shape.d);
      if (points) writes.push({ maskId: edited.id, field: "path", value: points.map(round) });
    }
  }
  if (writes.length === 0) return null;
  return {
    id: "clip.mask.edit",
    label: "Edit mask",
    affects: ["clips", "composite"],
    run(draft) {
      const target = draft.clips[clipId] as Draft<MaskedClip>;
      for (const { maskId, field, value } of writes) writeField(target, maskId, field, value, rel);
    },
  };
}

/** Applies `edit` to the base path of a path mask and to each of its keys (their points through the base's structure). */
function editPathEverywhere(project: Project, clipId: ClipId, maskId: string, label: string, edit: (path: NonNullable<ReturnType<typeof parseMaskPath>>) => ReturnType<typeof parseMaskPath>): Command | null {
  const found = editable(project, clipId, maskId);
  if (!found || found.mask.shape.kind !== "path") return null;
  const base = parseMaskPath(found.mask.shape.d);
  if (!base) return null;
  const edited = edit(base);
  if (!edited) return null;
  const d = formatMaskPath(edited);
  const newBase = parseMaskPath(d);
  if (!newBase) return null;
  const keys = maskKeys(found.clip.keyframes, maskId, "path");
  const count = pathPoints(base).length;
  const newKeys = keys?.map((key) => {
    const value = Array.isArray(key.value) && key.value.length === count ? key.value : pathPoints(base);
    const moved = edit(withPoints(base, value));
    return { ...key, value: moved ? pathPoints(moved) : pathPoints(newBase) };
  });
  return {
    id: "clip.mask.points",
    label,
    affects: ["clips", "composite"],
    run(draft) {
      const target = draft.clips[clipId] as Draft<MaskedClip>;
      const mask = (target.masks ?? []).find((m) => m.id === maskId);
      if (mask?.shape.kind === "path") mask.shape.d = d;
      if (newKeys) target.keyframes = withKeys(target.keyframes as never, maskProp(maskId, "path"), newKeys) as never;
    },
  };
}

/** Adds a point on segment `ref` at `t` (double-click on the outline), in the base path and every key. */
export function insertMaskPoint(project: Project, clipId: ClipId, maskId: string, ref: SegmentRef, t: number): Command | null {
  return editPathEverywhere(project, clipId, maskId, "Add mask point", (path) => splitSegment(path, ref, t));
}

/** Deletes anchor `pair` (Alt+click), in the base path and every key; a subpath keeps three anchors. */
export function deleteMaskPoint(project: Project, clipId: ClipId, maskId: string, pair: number): Command | null {
  return editPathEverywhere(project, clipId, maskId, "Delete mask point", (path) => deleteAnchor(path, pair));
}

/** The reveal presets of the Masks section (spec §21.18): Wipe in (left to right) and Circle reveal. */
export type MaskPreset = "wipeIn" | "circleReveal";
const PRESET_KIND: Record<MaskPreset, MaskRevealKind> = { wipeIn: "wipeRight", circleReveal: "irisIn" };

/**
 * Adds a reveal mask to each clip `ids`: the mask keyed from collapsed to its full box over the clip's
 * first second (or its whole length when shorter), as one undo step.
 */
export function applyMaskPreset(project: Project, ids: readonly ClipId[], preset: MaskPreset, sizeOf: SizeOf): Command | null {
  const kind = PRESET_KIND[preset];
  const targets = maskableClips(project, ids)
    .map((clip) => ({ clip, size: sizeOf(clip) }))
    .filter((t): t is { clip: MaskedClip; size: ContentSize } => t.size !== null && t.size.w > 0 && t.size.h > 0);
  if (targets.length === 0) return null;
  const fps = project.settings.fps;
  const work = targets.map(({ clip, size }) => {
    const id = nextMaskId(clip.masks);
    const box = revealBox(kind, size.w, size.h);
    const mask: Mask = { id, shape: box.kind === "rect" ? { ...box, kind: "rect", radius: 0 } : { ...box, kind: "ellipse" }, mode: "add", feather: 0, expansion: 0, opacity: 1, inverted: false };
    const duration = Math.max(1, Math.min(secondsToFrames(1, fps), clip.duration - 1));
    const keys = buildMaskReveal(kind, box, 0, duration);
    return { clipId: clip.id, mask, keys };
  });
  return {
    id: "clip.mask.preset",
    label: preset === "wipeIn" ? "Wipe in" : "Circle reveal",
    affects: ["clips", "composite"],
    run(draft) {
      for (const { clipId, mask, keys } of work) {
        const clip = draft.clips[clipId] as Draft<MaskedClip>;
        (clip.masks ??= []).push(mask);
        let keyframes = clip.keyframes as never;
        for (const [field, pair] of Object.entries(keys)) {
          if (!pair) continue;
          keyframes = withKeys(keyframes, maskProp(mask.id, field as MaskField), setKey(setKey([], pair[0].frame, round(pair[0].value)), pair[1].frame, round(pair[1].value))) as never;
        }
        clip.keyframes = keyframes;
      }
    },
  };
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}
