// Lottie clip edits (spec §21.23, Batch 79): Loop and the color overrides of the Lottie section. Each is one
// undo step over the selected Lottie clips (locked clips are left out).
import type { Draft } from "immer";
import type { Command } from "../../core/commands/command.js";
import type { ClipId, MediaClip, Project, RGBA } from "../../core/document/types.js";
import { sameOverrides, type ColorOverride } from "../../media/lottie/lottieFile.js";
import { isClipLocked } from "../model/queries.js";

/** The editable Lottie clips among `ids`. */
export function lottieClips(project: Project, ids: readonly ClipId[]): MediaClip[] {
  const clips: MediaClip[] = [];
  for (const id of ids) {
    const clip = project.clips[id];
    if (clip?.kind === "lottie" && !isClipLocked(project, id)) clips.push(clip);
  }
  return clips;
}

/** Loop on or off for the clips: the animation repeats from its start, or holds its last frame. */
export function setLottieLoop(project: Project, ids: readonly ClipId[], on: boolean): Command | null {
  const targets = lottieClips(project, ids).filter((clip) => (clip.loop === true) !== on);
  if (targets.length === 0) return null;
  const list = targets.map((clip) => clip.id);
  return {
    id: "clip.lottie.loop",
    label: on ? "Loop animation" : "Hold last frame",
    affects: ["clips", "composite"],
    run(draft) {
      for (const id of list) {
        const clip = draft.clips[id] as Draft<MediaClip>;
        if (on) clip.loop = true;
        else delete clip.loop;
      }
    },
  };
}

/** Sets the color overrides of the clips (an empty list removes them). Null when nothing changes. */
export function setColorOverrides(project: Project, ids: readonly ClipId[], overrides: readonly ColorOverride[], label = "Change animation colors"): Command | null {
  const targets = lottieClips(project, ids).filter((clip) => !sameOverrides(clip.colorOverrides, overrides));
  if (targets.length === 0) return null;
  const list = targets.map((clip) => clip.id);
  const next = overrides.map((o) => ({ from: { ...o.from }, to: { ...o.to } }));
  return {
    id: "clip.lottie.colors",
    label,
    coalesceKey: `lottie.colors:${list.join(",")}`,
    affects: ["clips", "composite"],
    run(draft) {
      for (const id of list) {
        const clip = draft.clips[id] as Draft<MediaClip>;
        if (next.length === 0) delete clip.colorOverrides;
        else clip.colorOverrides = next.map((o) => ({ from: { ...o.from }, to: { ...o.to } }));
      }
    },
  };
}

/** `overrides` with the `to` color of row `index` replaced. */
export function withTo(overrides: readonly ColorOverride[], index: number, to: RGBA): ColorOverride[] {
  return overrides.map((o, i) => (i === index ? { from: o.from, to } : o));
}

/** `overrides` with the `from` color of row `index` replaced. */
export function withFrom(overrides: readonly ColorOverride[], index: number, from: RGBA): ColorOverride[] {
  return overrides.map((o, i) => (i === index ? { from, to: o.to } : o));
}

/** `overrides` without row `index`. */
export function withoutRow(overrides: readonly ColorOverride[], index: number): ColorOverride[] {
  return overrides.filter((_, i) => i !== index);
}
