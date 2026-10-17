// Keyframe commands (spec §6.4 keyframe row, §6.15, §11 stopwatch and navigator; Batch 35). Pure
// `(doc, params) -> Command` functions over core/document/keyframes.ts, one undo step each.
// - What can be keyed: Transform and Opacity on layer clips (video, image, text, solid), Volume on video
//   and audio clips (model only until Batch 37). Locked clips are skipped.
// - A section's keys share their frames (core/document/keyframes.ts): every command here writes,
//   moves, eases or removes the keys of all the section's properties at a frame together.
// - Stopwatch on: a key at the playhead with the values shown there. Off: every key of the section
//   goes and the clip keeps the look it has at the playhead (its base values set to them).
// - Frames are relative to the clip start; an edit at a playhead outside the clip writes at the
//   clip's nearest frame (`clipRel`). Lane edits keep keys inside the clip.
// - Copy / paste (spec §6.15): `copyKeys` takes a section's keys at some frames, timed from the first;
//   `pasteKeys` writes them from the playhead on. TODO(batch 39): Mod+C / Mod+V route here while keys
//   are selected.
import type { Draft } from "immer";
import type { Affect, Command } from "../../core/commands/command.js";
import {
  animatedOpacity,
  animatedTransform,
  clipRel,
  gainDbAt,
  hasSectionKeys,
  removeSectionKeys,
  moveSectionKeys,
  SECTION_LABELS,
  SECTION_PROPS,
  sectionFrames,
  sectionValues,
  setKey,
  setSectionEase,
  withKeys,
  writeKeys,
  type KeyframeProp,
  type KeyframeSection,
} from "../../core/document/keyframes.js";
import type { Clip, ClipId, EaseId, Frame, Keyframes, MediaClip, Project, SolidClip, TextClip, Transform } from "../../core/document/types.js";
import { isClipLocked } from "../model/queries.js";
import { isLayerClip, normalizeTransform } from "./transform.js";

/** Clips that carry keyframes (spec §5.2): media, text and solid clips. */
export type KeyedClip = MediaClip | TextClip | SolidClip;

/** Whether `clip` can be keyed in `section`: Transform and Opacity on layers, Volume on video and audio clips. */
export function keyable(clip: Clip, section: KeyframeSection): clip is KeyedClip {
  return section === "volume" ? clip.kind === "video" || clip.kind === "audio" : isLayerClip(clip);
}

/** The unlocked clips among `ids` that can be keyed in `section`. */
function targets(project: Project, ids: Iterable<ClipId>, section: KeyframeSection): KeyedClip[] {
  const out: KeyedClip[] = [];
  for (const id of new Set(ids)) {
    const clip = project.clips[id];
    if (clip && keyable(clip, section) && !isClipLocked(project, id)) out.push(clip);
  }
  return out;
}

/** A clip's new keys, and the base values it takes (stopwatch off, last keys deleted). */
interface KeyEdit {
  keyframes: Keyframes | undefined;
  base?: KeyBase;
}

interface KeyBase {
  transform?: Transform;
  opacity?: number;
  gainDb?: number;
}

const AFFECTS: Readonly<Record<KeyframeSection, readonly Affect[]>> = {
  transform: ["composite", "clips"],
  opacity: ["composite", "clips"],
  volume: ["audio", "clips"],
};

function editCommand(id: string, label: string, section: KeyframeSection, edits: ReadonlyMap<ClipId, KeyEdit>): Command | null {
  if (edits.size === 0) return null;
  return {
    id,
    label,
    affects: AFFECTS[section],
    run(draft) {
      for (const [clipId, edit] of edits) {
        const clip = draft.clips[clipId] as Draft<KeyedClip>;
        if (edit.keyframes) clip.keyframes = structuredClone(edit.keyframes);
        else delete clip.keyframes;
        const base = edit.base;
        if (base?.transform) clip.transform = structuredClone(base.transform);
        if (base?.opacity !== undefined && "opacity" in clip) clip.opacity = base.opacity;
        if (base?.gainDb !== undefined && "volume" in clip) clip.volume.gainDb = base.gainDb;
      }
    },
  };
}

/** The base values that keep `clip` looking as it does at `rel` once `section` has no keys. */
function baseAt(clip: KeyedClip, section: KeyframeSection, rel: Frame): KeyBase {
  switch (section) {
    case "transform":
      return { transform: normalizeTransform(animatedTransform(clip, rel)) };
    case "opacity":
      return "opacity" in clip ? { opacity: animatedOpacity(clip, rel) } : {};
    case "volume":
      return "volume" in clip ? { gainDb: gainDbAt(clip, rel) } : {};
  }
}

/** The section's values shown at `rel` (what a new key there holds). */
function valuesAt(clip: KeyedClip, section: KeyframeSection, rel: Frame): Partial<Record<KeyframeProp, number>> {
  return sectionValues(clip, section, rel);
}

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

/** The section's keys inside `clip` (spec §11 "keyframe count"). */
export function keyCount(clip: Clip, section: KeyframeSection): number {
  return keyable(clip, section) ? sectionFrames(clip.keyframes, section, clip.duration).length : 0;
}

/** Whether `clip`'s section is animated (its stopwatch is on). */
export function stopwatchOn(clip: Clip, section: KeyframeSection): boolean {
  return keyable(clip, section) && hasSectionKeys(clip.keyframes, section);
}

/** Whether `clip` has a key of `section` at timeline frame `at` (inside the clip). */
export function keyAt(clip: Clip, section: KeyframeSection, at: Frame): boolean {
  if (!keyable(clip, section) || at < clip.start || at >= clip.start + clip.duration) return false;
  return sectionFrames(clip.keyframes, section).includes(at - clip.start);
}

/**
 * The stopwatch of `section` on the clips among `ids` (spec §11): on, each clip not animated yet gets
 * a key at the playhead `at` with the values it shows; off, the animated ones lose every key of the
 * section and keep the look they have at the playhead. Null when nothing changes.
 */
export function setStopwatch(project: Project, ids: Iterable<ClipId>, section: KeyframeSection, on: boolean, at: Frame): Command | null {
  const edits = new Map<ClipId, KeyEdit>();
  for (const clip of targets(project, ids, section)) {
    const animated = hasSectionKeys(clip.keyframes, section);
    if (animated === on) continue;
    const rel = clipRel(clip, at);
    if (on) edits.set(clip.id, { keyframes: writeKeys(clip.keyframes, rel, valuesAt(clip, section, rel)) });
    else edits.set(clip.id, { keyframes: removeSectionKeys(clip.keyframes, section, null), base: baseAt(clip, section, rel) });
  }
  const name = SECTION_LABELS[section];
  return editCommand("keyframe.stopwatch", on ? `Animate ${name.toLowerCase()}` : `Remove ${name.toLowerCase()} keyframes`, section, edits);
}

/**
 * The navigator's add / remove at the playhead (spec §11): when every clip among `ids` has a key of
 * `section` at `at`, they are removed; else the clips without one get one (the values shown there).
 */
export function toggleKeyAt(project: Project, ids: Iterable<ClipId>, section: KeyframeSection, at: Frame): Command | null {
  const clips = targets(project, ids, section);
  if (clips.length === 0) return null;
  const remove = clips.every((clip) => sectionFrames(clip.keyframes, section).includes(clipRel(clip, at)));
  const edits = new Map<ClipId, KeyEdit>();
  for (const clip of clips) {
    const rel = clipRel(clip, at);
    const has = sectionFrames(clip.keyframes, section).includes(rel);
    if (remove) edits.set(clip.id, deletion(clip, section, [rel]));
    else if (!has) edits.set(clip.id, { keyframes: writeKeys(clip.keyframes, rel, valuesAt(clip, section, rel)) });
  }
  return editCommand(remove ? "keyframe.delete" : "keyframe.add", remove ? "Remove keyframe" : "Add keyframe", section, edits);
}

/** A key of `section` on `clipId` at `rel` (Alt+click on the lane, spec §6.4) with the values shown there. Null when one is there. */
export function addKeyAt(project: Project, clipId: ClipId, section: KeyframeSection, rel: Frame): Command | null {
  const clip = targets(project, [clipId], section)[0];
  if (!clip || rel < 0 || rel >= clip.duration || sectionFrames(clip.keyframes, section).includes(rel)) return null;
  return editCommand("keyframe.add", "Add keyframe", section, new Map([[clipId, { keyframes: writeKeys(clip.keyframes, rel, valuesAt(clip, section, rel)) }]]));
}

/** `clip`'s keys of `section` at `frames` removed; the last ones leave the look of the first removed key as the base. */
function deletion(clip: KeyedClip, section: KeyframeSection, frames: readonly Frame[]): KeyEdit {
  const keyframes = removeSectionKeys(clip.keyframes, section, new Set(frames));
  if (hasSectionKeys(keyframes, section)) return { keyframes };
  return { keyframes, base: baseAt(clip, section, frames[0] ?? 0) };
}

/** Deletes `clipId`'s keys of `section` at `frames` (Delete with keys selected, the keyframe menu). */
export function deleteKeys(project: Project, clipId: ClipId, section: KeyframeSection, frames: readonly Frame[]): Command | null {
  const clip = targets(project, [clipId], section)[0];
  const own = new Set(sectionFrames(clip?.keyframes, section));
  const gone = frames.filter((frame) => own.has(frame));
  if (!clip || gone.length === 0) return null;
  return editCommand("keyframe.delete", plural(gone.length, "Delete keyframe", "Delete keyframes"), section, new Map([[clipId, deletion(clip, section, gone)]]));
}

/**
 * The delta `frames` of `clipId` can move by toward `delta`, keeping them inside the clip (a lane drag
 * stops at the clip's edges, spec §6.15).
 */
export function clampKeyDelta(clip: Pick<Clip, "duration">, frames: readonly Frame[], delta: number): number {
  if (frames.length === 0) return 0;
  const first = Math.min(...frames);
  const last = Math.max(...frames);
  return Math.max(-first, Math.min(clip.duration - 1 - last, Math.round(delta)));
}

/** Retimes `clipId`'s keys of `section` at `frames` by `delta` frames (a lane drag, spec §6.15), kept inside the clip; a key landing on another replaces it. */
export function moveKeys(project: Project, clipId: ClipId, section: KeyframeSection, frames: readonly Frame[], delta: number): Command | null {
  const clip = targets(project, [clipId], section)[0];
  if (!clip) return null;
  const own = new Set(sectionFrames(clip.keyframes, section));
  const moving = frames.filter((frame) => own.has(frame));
  const step = clampKeyDelta(clip, moving, delta);
  if (step === 0) return null;
  const keyframes = moveSectionKeys(clip.keyframes, section, new Set(moving), step);
  return editCommand("keyframe.move", plural(moving.length, "Move keyframe", "Move keyframes"), section, new Map([[clipId, { keyframes }]]));
}

/** Sets the ease of the keys of `section` at the frames given per clip (spec §6.15 keyframe menu, §11 ease selector). */
export function setKeysEase(project: Project, frames: ReadonlyMap<ClipId, readonly Frame[]>, section: KeyframeSection, ease: EaseId): Command | null {
  const edits = new Map<ClipId, KeyEdit>();
  for (const clip of targets(project, frames.keys(), section)) {
    const at = new Set((frames.get(clip.id) ?? []).filter((frame) => SECTION_PROPS[section].some((prop) => clip.keyframes?.[prop]?.some((key) => key.frame === frame && key.ease !== ease))));
    if (at.size > 0) edits.set(clip.id, { keyframes: setSectionEase(clip.keyframes, section, at, ease) });
  }
  return editCommand("keyframe.ease", "Change keyframe easing", section, edits);
}

/** Keys copied from one section (spec §6.15): per property, each key timed from the first copied frame. */
export interface KeyframeClipboard {
  section: KeyframeSection;
  keys: Partial<Record<KeyframeProp, { offset: Frame; value: number; ease: EaseId }[]>>;
}

/** `clip`'s keys of `section` at `frames`, or null when there are none. */
export function copyKeys(clip: Clip, section: KeyframeSection, frames: readonly Frame[]): KeyframeClipboard | null {
  if (!keyable(clip, section) || frames.length === 0) return null;
  const wanted = new Set(frames);
  const first = Math.min(...frames);
  const keys: KeyframeClipboard["keys"] = {};
  let any = false;
  for (const prop of SECTION_PROPS[section]) {
    const list = clip.keyframes?.[prop]?.filter((key) => wanted.has(key.frame)).map((key) => ({ offset: key.frame - first, value: key.value, ease: key.ease }));
    if (list && list.length > 0) {
      keys[prop] = list;
      any = true;
    }
  }
  return any ? { section, keys } : null;
}

/** Writes copied keys on the clips among `ids` from the playhead `at` on (keys past a clip's end are dropped). */
export function pasteKeys(project: Project, ids: Iterable<ClipId>, clipboard: KeyframeClipboard, at: Frame): Command | null {
  const { section } = clipboard;
  const edits = new Map<ClipId, KeyEdit>();
  for (const clip of targets(project, ids, section)) {
    const from = clipRel(clip, at);
    let keyframes = clip.keyframes;
    let wrote = false;
    for (const prop of SECTION_PROPS[section]) {
      for (const key of clipboard.keys[prop] ?? []) {
        const frame = from + key.offset;
        if (frame >= clip.duration) continue;
        keyframes = withKeys(keyframes, prop, setKey(keyframes?.[prop] ?? [], frame, key.value, key.ease));
        wrote = true;
      }
    }
    if (wrote) edits.set(clip.id, { keyframes });
  }
  return editCommand("keyframe.paste", "Paste keyframes", section, edits);
}

/** The timeline frame of the nearest key of `section` before (-1) or after (1) `at` among the clips of `ids` (inside them), or null. */
export function adjacentKey(project: Project, ids: Iterable<ClipId>, section: KeyframeSection, at: Frame, direction: -1 | 1): Frame | null {
  let best: Frame | null = null;
  for (const id of new Set(ids)) {
    const clip = project.clips[id];
    if (!clip || !keyable(clip, section)) continue;
    for (const rel of sectionFrames(clip.keyframes, section, clip.duration)) {
      const frame = clip.start + rel;
      if (direction === 1 ? frame > at && (best === null || frame < best) : frame < at && (best === null || frame > best)) best = frame;
    }
  }
  return best;
}
