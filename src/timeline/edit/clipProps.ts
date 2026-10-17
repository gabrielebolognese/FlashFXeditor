// Clip property edits of the properties panel (spec §11): the Opacity section, the Clip section's
// enabled switch (also the clip menu's Enable/Disable, §6.16) and its timecodes. Each is one command.
// - Opacity (0..1) affects only the composite (§3.4); clips that are gone, locked or not layers are skipped.
//   With the Opacity stopwatch on (keys), an edit at the playhead writes the key there (Batch 35).
// - The timecodes are trims without ripple (§6.10 regular trim; Batch 25 Build): Start moves the in
//   point (the end stays), End and Duration move the out point (the start stays), Source in / out move
//   the in / out point by the source time asked for (at the clip's speed). Linked partners take the
//   same edit unless `linked` is false; the media bounds and the neighbors clamp it (never refused).
import type { Draft } from "immer";
import type { Command } from "../../core/commands/command.js";
import { usPerFrame } from "../../core/document/time.js";
import { animatedOpacity, clipRel, hasSectionKeys, writeKeys } from "../../core/document/keyframes.js";
import { isFreeze, isMediaClip, type Clip, type ClipId, type Frame, type Keyframes, type MediaClip, type Project, type Rational, type Us } from "../../core/document/types.js";
import { isClipLocked } from "../model/queries.js";
import { isLayerClip, type LayerClip } from "./transform.js";
import { applyTrim, trimEdge, type TrimEdge, type TrimLimit } from "./trim.js";

/**
 * Writes `changes` (opacity 0..1 by clip id) as one command `clip.opacity`, or null when nothing
 * changes. Values are clamped to 0..1; non-finite ones are skipped. With `at` (the playhead, Batch 35)
 * a clip whose opacity is keyed (the Opacity stopwatch on, §11) gets its key there instead.
 */
export function setOpacities(project: Project, changes: ReadonlyMap<ClipId, number>, options: { label: string; coalesceKey?: string; at?: Frame }): Command | null {
  const writes: { id: ClipId; opacity: number; keyframes?: Keyframes | undefined }[] = [];
  for (const [id, value] of changes) {
    const clip = project.clips[id];
    if (!clip || !isLayerClip(clip) || isClipLocked(project, id) || !Number.isFinite(value)) continue;
    const opacity = Math.min(1, Math.max(0, value));
    if (options.at === undefined || !hasSectionKeys(clip.keyframes, "opacity")) {
      if (opacity !== clip.opacity) writes.push({ id, opacity });
      continue;
    }
    const rel = clipRel(clip, options.at);
    if (opacity !== animatedOpacity(clip, rel)) writes.push({ id, opacity: clip.opacity, keyframes: writeKeys(clip.keyframes, rel, { opacity }) });
  }
  if (writes.length === 0) return null;
  return {
    id: "clip.opacity",
    label: options.label,
    ...(options.coalesceKey !== undefined && { coalesceKey: options.coalesceKey }),
    affects: writes.some((write) => "keyframes" in write) ? ["composite", "clips"] : ["composite"],
    run(draft) {
      for (const write of writes) {
        const clip = draft.clips[write.id] as Draft<LayerClip>;
        if (!("keyframes" in write)) clip.opacity = write.opacity;
        else if (write.keyframes) clip.keyframes = structuredClone(write.keyframes);
      }
    },
  };
}

/** Enables or disables clips (spec §6.4: disabled clips are dimmed and hatched, out of the picture and the mix). Locked ones are skipped. */
export function setEnabled(project: Project, ids: Iterable<ClipId>, enabled: boolean): Command | null {
  const changed = [...new Set(ids)].filter((id) => {
    const clip = project.clips[id];
    return clip !== undefined && clip.enabled !== enabled && !isClipLocked(project, id);
  });
  if (changed.length === 0) return null;
  const noun = changed.length === 1 ? "clip" : "clips";
  return {
    id: "clip.enable",
    label: `${enabled ? "Enable" : "Disable"} ${noun}`,
    affects: ["clips"],
    run(draft) {
      for (const id of changed) (draft.clips[id] as Draft<Clip>).enabled = enabled;
    },
  };
}

/** The Clip section's time fields: timeline frames (start, end = exclusive, duration) and source µs (in, out = exclusive). */
export type ClipTimeField = "start" | "end" | "duration" | "sourceIn" | "sourceOut";

/** The current value of `field` (frames, or µs for the source fields; null when the clip has no source). */
export function clipTime(clip: Clip, field: ClipTimeField): number | null {
  switch (field) {
    case "start":
      return clip.start;
    case "end":
      return clip.start + clip.duration;
    case "duration":
      return clip.duration;
    case "sourceIn":
      return hasSourceRange(clip) ? clip.in : null;
    case "sourceOut":
      return hasSourceRange(clip) ? clip.out : null;
  }
}

/** Video and audio clips have a source range (an image's or a freeze frame's in/out is meaningless: one still). */
export function hasSourceRange(clip: Clip): clip is MediaClip {
  return isMediaClip(clip) && clip.kind !== "image" && !isFreeze(clip);
}

/** The edge and frame delta of a trim that puts `field` of `clip` at `value` (frames, or µs for the source fields), or null. */
export function retimeDelta(clip: Clip, field: ClipTimeField, value: number, fps: Rational): { edge: TrimEdge; delta: Frame } | null {
  if (!Number.isFinite(value)) return null;
  switch (field) {
    case "start":
      return { edge: "in", delta: Math.round(value) - clip.start };
    case "end":
      return { edge: "out", delta: Math.round(value) - (clip.start + clip.duration) };
    case "duration":
      return { edge: "out", delta: Math.round(value) - clip.duration };
    case "sourceIn":
    case "sourceOut": {
      if (!hasSourceRange(clip)) return null;
      const from: Us = field === "sourceIn" ? clip.in : clip.out;
      return { edge: field === "sourceIn" ? "in" : "out", delta: Math.round((value - from) / (usPerFrame(fps) * clip.speed)) };
    }
  }
}

export interface RetimeResult {
  /** One undo step for every clip (with its partners), or null when nothing changes. */
  command: Command | null;
  /** What clamped the first clip that stopped short of the value, or null. */
  limit: TrimLimit | null;
}

/**
 * Trims each of `ids` so `field` reads `value` (spec §11 Clip section): regular trims (no ripple), one
 * after the other on the result of the previous ones, merged into one command `clip.trim`. A clip whose
 * linked partner already moved with an earlier one needs no trim of its own.
 */
export function retimeClips(project: Project, ids: readonly ClipId[], field: ClipTimeField, value: number, options: { linked: boolean }): RetimeResult {
  let current = project;
  const changes = new Map<ClipId, Clip>();
  let limit: TrimLimit | null = null;
  for (const id of ids) {
    const clip = current.clips[id];
    if (!clip || isClipLocked(current, id)) continue;
    const request = retimeDelta(clip, field, value, current.settings.fps);
    if (!request || request.delta === 0) continue;
    const result = trimEdge(current, id, request.edge, request.delta, { ripple: false, linked: options.linked });
    limit ??= result.limit;
    if (result.changes.size === 0) continue;
    current = applyTrim(current, result);
    for (const [changedId, changed] of result.changes) changes.set(changedId, changed);
  }
  if (changes.size === 0) return { command: null, limit };
  const entries = [...changes];
  const trimmed = ids.filter((id) => changes.has(id)).length;
  return {
    limit,
    command: {
      id: "clip.trim",
      label: trimmed > 1 ? "Trim clips" : "Trim clip",
      affects: ["clips", "timeline"],
      run(draft) {
        for (const [clipId, clip] of entries) {
          if (!draft.clips[clipId]) throw new Error(`clip.trim: clip ${clipId} does not exist`);
          draft.clips[clipId] = clip as Draft<Clip>;
        }
      },
    },
  };
}
