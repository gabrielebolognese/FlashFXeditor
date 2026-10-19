// Paste attributes (spec §18 Mod+Alt+V, Batch 39): the look of a copied clip onto the selected clips,
// by groups the user checks in a small popover: Transform, Opacity, Crop, Speed, Text style, Text
// animations, Caption style (Batch 53, spec §20.3), Audio gain, Fades and Keyframes.
// - Each group takes its values from the first copied clip that has them, the primary one first (a
//   copied video and its linked audio give the picture groups and the audio gain).
// - Targets: Transform and Opacity the selected layers, Crop the selected video and image clips, Speed
//   the selected video and audio clips (partners follow with Linked selection, `setSpeeds`), Text
//   style and animations the selected text clips, Caption style the selected cues (a copied cue's own
//   style and preset link: none puts them back to the track style), Audio gain the audio the Audio
//   section edits (the
//   selected audio clips and those linked to selected video clips), Fades every selected clip that
//   fades and its linked audio (audio targets take an audio clip's fades when one was copied).
// - Keyframes decides how the animatable groups (Transform, Opacity, Audio gain) arrive: checked, a
//   target's keys of that section are replaced by the copied clip's (cut to the target's length: the
//   motion stays exact at its end; none when the copied clip has none); unchecked, the copied clip's
//   values at its first frame arrive static (the target's keys of that section go).
// - Text style keeps the target's anchored point in place (`textEdit`), unless Transform comes too;
//   the preset link goes along with the style. Crops are clamped to the target's media, fades to its
//   length.
// One command `clip.pasteAttributes` for every group but Speed, whose change of durations goes through
// `setSpeeds` (ripple and neighbors as the Speed section has them): the controller runs both in one
// transaction ("Paste attributes", one undo step).
import type { Draft } from "immer";
import type { Command } from "../../core/commands/command.js";
import { animatedOpacity, animatedTransform, gainDbAt, SECTION_PROPS, sliceKeyframes, type KeyframeSection } from "../../core/document/keyframes.js";
import { isMediaClip, type Clip, type ClipId, type Keyframes, type Project } from "../../core/document/types.js";
import { isClipLocked } from "../model/queries.js";
import type { ClipsPayload } from "./clipboard.js";
import { clampCrop, cropSize, isCropClip } from "./crop.js";
import { canFade, fadesOf, fadeTargets } from "./fades.js";
import { hasSpeed } from "./speed.js";
import { textEdit } from "./text.js";
import { isLayerClip, shiftedWrite } from "./transform.js";
import { audioTargets } from "./volume.js";

export const ATTRIBUTE_GROUPS = ["transform", "opacity", "crop", "speed", "textStyle", "animations", "captionStyle", "audio", "fades", "keyframes"] as const;
export type AttributeGroup = (typeof ATTRIBUTE_GROUPS)[number];

export const ATTRIBUTE_LABELS: Readonly<Record<AttributeGroup, string>> = {
  transform: "Transform",
  opacity: "Opacity",
  crop: "Crop",
  speed: "Speed",
  textStyle: "Text style",
  animations: "Text animations",
  captionStyle: "Caption style",
  audio: "Audio gain",
  fades: "Fades",
  keyframes: "Keyframes",
};

/** The keyframe section each animatable group carries. */
const SECTION_OF: Partial<Record<AttributeGroup, KeyframeSection>> = { transform: "transform", opacity: "opacity", audio: "volume" };

/** Whether a copied clip gives values to `group`. */
function gives(group: AttributeGroup, clip: Clip): boolean {
  switch (group) {
    case "transform":
    case "opacity":
      return isLayerClip(clip);
    case "crop":
      return isCropClip(clip);
    case "speed":
      return hasSpeed(clip);
    case "textStyle":
    case "animations":
      return clip.kind === "text";
    case "captionStyle":
      return clip.kind === "caption";
    case "audio":
      return clip.kind === "audio";
    case "fades":
      return canFade(clip);
    case "keyframes":
      return false;
  }
}

/** The copied clip `group` takes its values from (the primary first), or null. */
export function attributeSource(payload: ClipsPayload, group: AttributeGroup): Clip | null {
  const clips = payload.clips.map(({ clip }) => clip);
  const primary = clips.find((clip) => clip.id === payload.primary);
  return [primary, ...clips].find((clip): clip is Clip => clip !== undefined && gives(group, clip)) ?? null;
}

/** The selected clips `group` changes (see the header). */
export function attributeTargets(project: Project, ids: readonly ClipId[], group: AttributeGroup): ClipId[] {
  const unlocked = (filter: (clip: Clip) => boolean) =>
    ids.filter((id) => {
      const clip = project.clips[id];
      return clip !== undefined && filter(clip) && !isClipLocked(project, id);
    });
  switch (group) {
    case "transform":
    case "opacity":
      return unlocked(isLayerClip);
    case "crop":
      return unlocked(isCropClip);
    case "speed":
      return unlocked(hasSpeed);
    case "textStyle":
    case "animations":
      return unlocked((clip) => clip.kind === "text");
    case "captionStyle":
      return unlocked((clip) => clip.kind === "caption");
    case "audio":
      return audioTargets(project, ids);
    case "fades":
      return fadeTargets(project, ids);
    case "keyframes":
      return [];
  }
}

/**
 * The groups the popover offers for pasting `payload` onto `ids`: those with a copied source and a
 * selected target; Keyframes with any animatable group.
 */
export function availableGroups(project: Project, payload: ClipsPayload, ids: readonly ClipId[]): AttributeGroup[] {
  const groups = ATTRIBUTE_GROUPS.filter((group) => group !== "keyframes" && attributeSource(payload, group) !== null && attributeTargets(project, ids, group).length > 0);
  return groups.some((group) => SECTION_OF[group] !== undefined) ? [...groups, "keyframes"] : groups;
}

/** `keyframes` with the `section` keys of `source` (cut to `duration`, `withKeys`) or none of that section. */
function sectionKeys(keyframes: Keyframes | undefined, source: Keyframes | undefined, section: KeyframeSection, duration: number, withKeys: boolean): Keyframes | undefined {
  const next: Keyframes = { ...keyframes };
  for (const prop of SECTION_PROPS[section]) delete next[prop];
  if (withKeys && source) {
    const own: Keyframes = {};
    for (const prop of SECTION_PROPS[section]) if (source[prop]) own[prop] = source[prop];
    Object.assign(next, sliceKeyframes(own, 0, duration, false, true));
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

type Mutable = Record<string, unknown>;

/** Sets or removes (undefined) `field` on a copied clip. */
function put(clip: Clip, field: string, value: unknown): void {
  if (value === undefined) delete (clip as unknown as Mutable)[field];
  else (clip as unknown as Mutable)[field] = structuredClone(value);
}

/**
 * Every checked group of `groups` but Speed from `payload` onto the selected clips `ids` as one command
 * `clip.pasteAttributes` (see the header), or null when nothing changes.
 */
export function pasteAttributes(project: Project, payload: ClipsPayload, ids: readonly ClipId[], groups: ReadonlySet<AttributeGroup>): Command | null {
  const withKeys = groups.has("keyframes");
  const next = new Map<ClipId, Clip>();
  const edit = (id: ClipId): Clip => {
    let clip = next.get(id);
    if (!clip) {
      clip = structuredClone(project.clips[id] as Clip);
      next.set(id, clip);
    }
    return clip;
  };
  const apply = (group: AttributeGroup, write: (target: Clip, source: Clip) => void) => {
    if (!groups.has(group)) return;
    const source = attributeSource(payload, group);
    if (source) for (const id of attributeTargets(project, ids, group)) write(edit(id), source);
  };

  // Text style first: keeping the anchored point moves the transform, which a pasted Transform replaces.
  apply("textStyle", (target, source) => {
    if (target.kind !== "text" || source.kind !== "text") return;
    const anchored = textEdit(project, target, { style: source.style });
    const write = shiftedWrite(target, anchored.transform.x - target.transform.x, anchored.transform.y - target.transform.y);
    put(target, "style", source.style);
    put(target, "presetId", source.presetId);
    if (write) {
      put(target, "transform", write.transform);
      if ("keyframes" in write) put(target, "keyframes", write.keyframes);
    }
  });
  apply("transform", (target, source) => {
    if (!isLayerClip(target) || !isLayerClip(source)) return;
    put(target, "transform", withKeys ? source.transform : animatedTransform(source, 0));
    put(target, "keyframes", sectionKeys(target.keyframes, source.keyframes, "transform", target.duration, withKeys));
  });
  apply("opacity", (target, source) => {
    if (!isLayerClip(target) || !isLayerClip(source)) return;
    put(target, "opacity", withKeys ? source.opacity : animatedOpacity(source, 0));
    put(target, "keyframes", sectionKeys(target.keyframes, source.keyframes, "opacity", target.duration, withKeys));
  });
  apply("crop", (target, source) => {
    if (!isCropClip(target) || !isCropClip(source)) return;
    const size = cropSize(project, target);
    put(target, "crop", size ? (clampCrop(source.crop, size) ?? target.crop) : source.crop);
  });
  apply("animations", (target, source) => {
    if (target.kind !== "text" || source.kind !== "text") return;
    put(target, "animIn", source.animIn);
    put(target, "animOut", source.animOut);
  });
  apply("captionStyle", (target, source) => {
    if (target.kind !== "caption" || source.kind !== "caption") return;
    put(target, "styleOverride", source.styleOverride);
    put(target, "presetId", source.presetId);
  });
  apply("audio", (target, source) => {
    if (target.kind !== "audio" || source.kind !== "audio") return;
    put(target, "volume", { gainDb: withKeys ? source.volume.gainDb : gainDbAt(source, 0), muted: source.volume.muted });
    put(target, "keyframes", sectionKeys(target.keyframes, source.keyframes, "volume", target.duration, withKeys));
  });
  if (groups.has("fades")) {
    const picture = attributeSource(payload, "fades");
    const sound = payload.clips.map(({ clip }) => clip).find((clip) => clip.kind === "audio") ?? picture;
    for (const id of attributeTargets(project, ids, "fades")) {
      const target = edit(id);
      const source = target.kind === "audio" ? sound : picture;
      if (!source || target.kind === "caption") continue;
      const fades = fadesOf(source);
      const fadeIn = Math.min(fades.in, target.duration);
      put(target, "fades", { in: fadeIn, out: Math.min(fades.out, target.duration - fadeIn) });
    }
  }

  const writes = [...next].filter(([id, clip]) => JSON.stringify(clip) !== JSON.stringify(project.clips[id]));
  if (writes.length === 0) return null;
  return {
    id: "clip.pasteAttributes",
    label: "Paste attributes",
    // `clips`: the timeline shows keys, fades, the gain and text names.
    affects: ["composite", "text", "audio", "clips"],
    run(draft) {
      for (const [id, clip] of writes) {
        if (!draft.clips[id]) throw new Error(`clip.pasteAttributes: clip ${id} does not exist`);
        draft.clips[id] = structuredClone(clip) as Draft<Clip>;
      }
    },
  };
}

/** The speed Paste attributes gives the clips, or null when Speed is not pasted. */
export function pastedSpeed(payload: ClipsPayload, groups: ReadonlySet<AttributeGroup>): number | null {
  if (!groups.has("speed")) return null;
  const source = attributeSource(payload, "speed");
  return source && isMediaClip(source) ? source.speed : null;
}
