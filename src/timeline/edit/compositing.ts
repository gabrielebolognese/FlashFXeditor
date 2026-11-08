// Blend modes and track mattes (spec §21.17, Batch 72): the edits of the Compositing section. Each is
// one undo step over the selected visual clips; locked clips are left out. Picking a matte also hides
// the matte clip (`matteOnly`, as a track matte does in compositing apps), in the same command.
import type { Draft } from "immer";
import type { Command } from "../../core/commands/command.js";
import { sequenceOfTrack } from "../../core/document/sequences.js";
import type { BlendMode, Clip, ClipId, MatteMode, Project, TrackMatte } from "../../core/document/types.js";
import { BLEND_MODE_META } from "../../core/effects/blendModes.js";
import { isVisualClip } from "../../core/effects/trackMatte.js";
import { isClipLocked } from "../model/queries.js";

/** A visual clip that can be edited (not locked), else null. */
function compositingClip(project: Project, id: ClipId): Clip | null {
  const clip = project.clips[id];
  return clip && isVisualClip(clip) && !isClipLocked(project, id) ? clip : null;
}

/** The editable visual clips among `ids`. */
export function compositingClips(project: Project, ids: readonly ClipId[]): Clip[] {
  return ids.map((id) => compositingClip(project, id)).filter((clip): clip is Clip => clip !== null);
}

/** The shared value of `read` over the clips (null without clips, "mixed" when they differ). */
function shared<T>(clips: readonly Clip[], read: (clip: Clip) => T): T | "mixed" | null {
  if (clips.length === 0) return null;
  const first = read(clips[0] as Clip);
  return clips.every((clip) => read(clip) === first) ? first : "mixed";
}

/** The blend mode of the clips `ids` (normal when unset). */
export function blendOf(project: Project, ids: readonly ClipId[]): BlendMode | "mixed" | null {
  return shared(compositingClips(project, ids), (clip) => clip.blend ?? "normal");
}

/** The matte clip of the clips `ids` ("" for none). */
export function matteClipOf(project: Project, ids: readonly ClipId[]): ClipId | "mixed" | null {
  return shared(compositingClips(project, ids), (clip) => clip.matte?.clipId ?? "");
}

/** The matte mode of the clips `ids` with a matte. */
export function matteModeOf(project: Project, ids: readonly ClipId[]): MatteMode | "mixed" | null {
  return shared(
    compositingClips(project, ids).filter((clip) => clip.matte),
    (clip) => clip.matte?.mode ?? "alpha",
  );
}

/** Whether the clips `ids` are hidden as mattes (`matteOnly`). */
export function matteOnlyOf(project: Project, ids: readonly ClipId[]): boolean | "mixed" | null {
  return shared(compositingClips(project, ids), (clip) => clip.matteOnly === true);
}

/** Blend the clips `ids` with `blend` (normal removes the field). */
export function setBlend(project: Project, ids: readonly ClipId[], blend: BlendMode): Command | null {
  const targets = compositingClips(project, ids).filter((clip) => (clip.blend ?? "normal") !== blend);
  if (targets.length === 0) return null;
  const ids2 = targets.map((clip) => clip.id);
  return {
    id: "clip.blend",
    label: `Blend: ${BLEND_MODE_META[blend].label}`,
    affects: ["clips", "composite"],
    run(draft) {
      for (const id of ids2) {
        const clip = draft.clips[id] as Draft<Clip>;
        if (blend === "normal") delete clip.blend;
        else clip.blend = blend;
      }
    },
  };
}

/**
 * The clips a clip can use as its matte (spec §21.17): visual clips on the video tracks of its own
 * sequence (the root timeline or a compound's), not itself, in track then time order.
 */
export function matteCandidates(project: Project, id: ClipId): Clip[] {
  const clip = project.clips[id];
  if (!clip) return [];
  const sequence = sequenceOfTrack(project, clip.trackId);
  const tracks = sequence ? sequence.tracks : project.tracks;
  const out: Clip[] = [];
  for (const track of tracks) {
    if (track.kind !== "video") continue;
    for (const clipId of track.clipIds) {
      const candidate = project.clips[clipId];
      if (candidate && clipId !== id && isVisualClip(candidate)) out.push(candidate);
    }
  }
  return out;
}

/**
 * Matte the clips `ids` with `clipId` in `mode` (null clears the matte). A clip cannot be its own matte
 * and the matte must be a candidate (`matteCandidates`). Picking a matte hides the matte clip.
 */
export function setMatte(project: Project, ids: readonly ClipId[], matte: TrackMatte | null): Command | null {
  const targets = compositingClips(project, ids).filter((clip) => {
    if (!matte) return clip.matte !== undefined;
    if (clip.id === matte.clipId || !matteCandidates(project, clip.id).some((c) => c.id === matte.clipId)) return false;
    return clip.matte?.clipId !== matte.clipId || clip.matte.mode !== matte.mode;
  });
  if (targets.length === 0) return null;
  const ids2 = targets.map((clip) => clip.id);
  const source = matte ? project.clips[matte.clipId] : undefined;
  const hide = matte !== null && source !== undefined && source.matteOnly !== true && !ids2.includes(source.id) && !isClipLocked(project, source.id);
  return {
    id: "clip.matte",
    label: matte ? "Set track matte" : "Remove track matte",
    affects: ["clips", "composite"],
    run(draft) {
      for (const id of ids2) {
        const clip = draft.clips[id] as Draft<Clip>;
        if (matte) clip.matte = { clipId: matte.clipId, mode: matte.mode };
        else delete clip.matte;
      }
      if (hide && matte) (draft.clips[matte.clipId] as Draft<Clip>).matteOnly = true;
    },
  };
}

/** The matte mode of the matted clips among `ids` (clips without a matte are left alone). */
export function setMatteMode(project: Project, ids: readonly ClipId[], mode: MatteMode): Command | null {
  const targets = compositingClips(project, ids).filter((clip) => clip.matte && clip.matte.mode !== mode);
  if (targets.length === 0) return null;
  const ids2 = targets.map((clip) => clip.id);
  return {
    id: "clip.matteMode",
    label: "Track matte mode",
    affects: ["clips", "composite"],
    run(draft) {
      for (const id of ids2) {
        const matte = (draft.clips[id] as Draft<Clip>).matte;
        if (matte) matte.mode = mode;
      }
    },
  };
}

/** Hide (or show) the clips `ids` as mattes: a matte-only clip is drawn only as another clip's matte. */
export function setMatteOnly(project: Project, ids: readonly ClipId[], on: boolean): Command | null {
  const targets = compositingClips(project, ids).filter((clip) => (clip.matteOnly === true) !== on);
  if (targets.length === 0) return null;
  const ids2 = targets.map((clip) => clip.id);
  return {
    id: "clip.matteOnly",
    label: on ? "Use as matte only" : "Show matte clip",
    affects: ["clips", "composite"],
    run(draft) {
      for (const id of ids2) {
        const clip = draft.clips[id] as Draft<Clip>;
        if (on) clip.matteOnly = true;
        else delete clip.matteOnly;
      }
    },
  };
}
