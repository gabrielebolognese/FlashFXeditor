// Time remap, reverse and frame blend as commands (spec §21.22, Batch 78). Pure: they read the project and return
// a `Command`; the controllers pick the clips. Each edit is one command (one undo step).
import type { Command } from "../../core/commands/command.js";
import { identityRemap, rampKeys, RAMP_LABELS, remapUs, type RampId, type RemapKey } from "../../core/document/timeRemap.js";
import type { Clip, ClipId, MediaClip, Project } from "../../core/document/types.js";

const AFFECTS = ["clips", "timeline", "composite", "audio"] as const;

const unlocked = (project: Project, clip: Clip) => project.tracks.find((track) => track.id === clip.trackId)?.locked !== true;

/** The unlocked video clips of `ids` (time remap and frame blending are the pictures'). */
function videoClips(project: Project, ids: readonly ClipId[]): MediaClip[] {
  const out: MediaClip[] = [];
  for (const id of ids) {
    const clip = project.clips[id];
    if (clip?.kind === "video" && unlocked(project, clip)) out.push(clip);
  }
  return out;
}

/** The clips `reverse` applies to: the video and audio clips of `ids` and the ones linked to them. */
function reversibleClips(project: Project, ids: readonly ClipId[]): MediaClip[] {
  const wanted = new Set<ClipId>();
  const groups = new Set<string>();
  for (const id of ids) {
    const clip = project.clips[id];
    if (!clip || (clip.kind !== "video" && clip.kind !== "audio") || !unlocked(project, clip)) continue;
    wanted.add(id);
    if (clip.linkGroup !== undefined) groups.add(clip.linkGroup);
  }
  if (groups.size > 0) {
    for (const id in project.clips) {
      const clip = project.clips[id] as Clip;
      if ((clip.kind === "video" || clip.kind === "audio") && clip.linkGroup !== undefined && groups.has(clip.linkGroup) && unlocked(project, clip)) wanted.add(clip.id);
    }
  }
  return [...wanted].map((id) => project.clips[id] as MediaClip);
}

/** Whether every reversible clip of `ids` (and its linked ones) plays reversed (the switch shows on). */
export function reversedAll(project: Project, ids: readonly ClipId[]): boolean {
  const clips = reversibleClips(project, ids);
  return clips.length > 0 && clips.every((clip) => clip.reverse === true);
}

/** Reverse (or restore) the selected clips and the clips linked to them (one command). */
export function setReverse(project: Project, ids: readonly ClipId[], on: boolean): Command | null {
  const targets = reversibleClips(project, ids).filter((clip) => (clip.reverse === true) !== on).map((clip) => clip.id);
  if (targets.length === 0) return null;
  return {
    id: "clip.reverse",
    label: on ? "Reverse" : "Play forward",
    affects: [...AFFECTS],
    run(draft) {
      for (const id of targets) {
        const clip = draft.clips[id] as MediaClip;
        if (on) clip.reverse = true;
        else delete clip.reverse;
      }
    },
  };
}

/** Whether every video clip of `ids` blends frames. */
export function frameBlendAll(project: Project, ids: readonly ClipId[]): boolean {
  const clips = videoClips(project, ids);
  return clips.length > 0 && clips.every((clip) => clip.frameBlend === true);
}

/** Frame blending on or off for the video clips of `ids`. */
export function setFrameBlend(project: Project, ids: readonly ClipId[], on: boolean): Command | null {
  const targets = videoClips(project, ids).filter((clip) => (clip.frameBlend === true) !== on).map((clip) => clip.id);
  if (targets.length === 0) return null;
  return {
    id: "clip.frameBlend",
    label: on ? "Frame blending on" : "Frame blending off",
    affects: ["clips", "composite"],
    run(draft) {
      for (const id of targets) {
        const clip = draft.clips[id] as MediaClip;
        if (on) clip.frameBlend = true;
        else delete clip.frameBlend;
      }
    },
  };
}

/** True when every video clip of `ids` has a time remap curve. */
export function remappedAll(project: Project, ids: readonly ClipId[]): boolean {
  const clips = videoClips(project, ids);
  return clips.length > 0 && clips.every((clip) => clip.timeRemap !== undefined);
}

/** The curve a video clip starts from: its own (when remapped) or the straight line of its constant speed. */
export function currentKeys(project: Project, clip: MediaClip): RemapKey[] {
  return clip.timeRemap ? clip.timeRemap.map((key) => ({ ...key })) : identityRemap(clip, project.settings.fps);
}

/** Time remap on (the straight line of the clip's speed: nothing changes yet) for the video clips of `ids`. */
export function enableRemap(project: Project, ids: readonly ClipId[]): Command | null {
  const targets = videoClips(project, ids).filter((clip) => clip.timeRemap === undefined && clip.speed > 0);
  if (targets.length === 0) return null;
  const keys = new Map(targets.map((clip) => [clip.id, identityRemap(clip, project.settings.fps)] as const));
  return {
    id: "clip.timeRemap",
    label: "Time remap",
    affects: [...AFFECTS],
    run(draft) {
      for (const [id, list] of keys) {
        const clip = draft.clips[id] as MediaClip;
        clip.timeRemap = list.map((key) => ({ ...key }));
        // The curve replaces the speed and the reverse flag.
        delete clip.reverse;
      }
    },
  };
}

/** Time remap off: the clip plays at its constant speed again. */
export function clearRemap(project: Project, ids: readonly ClipId[]): Command | null {
  const targets = videoClips(project, ids).filter((clip) => clip.timeRemap !== undefined).map((clip) => clip.id);
  if (targets.length === 0) return null;
  return {
    id: "clip.timeRemapOff",
    label: "Time remap off",
    affects: [...AFFECTS],
    run(draft) {
      for (const id of targets) delete (draft.clips[id] as MediaClip).timeRemap;
    },
  };
}

/** A one-click ramp over the clip's current source range (its curve's ends, or its in and out). */
export function applyRamp(project: Project, ids: readonly ClipId[], ramp: RampId): Command | null {
  const targets = videoClips(project, ids).filter((clip) => clip.speed > 0 || clip.timeRemap !== undefined);
  if (targets.length === 0) return null;
  const curves = new Map<ClipId, RemapKey[]>();
  for (const clip of targets) {
    const keys = currentKeys(project, clip);
    const from = remapUs(keys, 0);
    const to = remapUs(keys, clip.duration);
    curves.set(clip.id, rampKeys(ramp, clip.duration, from, to));
  }
  return {
    id: `clip.ramp.${ramp}`,
    label: RAMP_LABELS[ramp],
    affects: [...AFFECTS],
    run(draft) {
      for (const [id, list] of curves) {
        const clip = draft.clips[id] as MediaClip;
        clip.timeRemap = list;
        delete clip.reverse;
      }
    },
  };
}

/** The keys of `clipId` replaced (a lane gesture's commit, a numeric edit): one command; the ends stay at frame 0 and the duration. */
export function setRemapKeys(project: Project, clipId: ClipId, keys: readonly RemapKey[], label = "Edit time remap", coalesceKey?: string): Command | null {
  const clip = project.clips[clipId];
  if (clip?.kind !== "video" || !unlocked(project, clip) || keys.length < 2) return null;
  const next = keys.map((key) => ({ frame: key.frame, sourceUs: Math.max(0, Math.round(key.sourceUs)), ease: key.ease }));
  const first = next[0] as RemapKey;
  const last = next[next.length - 1] as RemapKey;
  if (first.frame !== 0 || last.frame !== clip.duration) return null;
  for (let i = 1; i < next.length; i++) if ((next[i] as RemapKey).frame <= (next[i - 1] as RemapKey).frame) return null;
  return {
    id: "clip.timeRemapKeys",
    label,
    ...(coalesceKey ? { coalesceKey } : {}),
    affects: [...AFFECTS],
    run(draft) {
      (draft.clips[clipId] as MediaClip).timeRemap = next.map((key) => ({ ...key }));
    },
  };
}
