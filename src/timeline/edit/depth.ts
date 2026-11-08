// 2.5D layer edits (spec §21.15, Batch 70): the backface switch of layers, Reset 3D (their X and Y
// rotations and depth back to 0, keyed at the playhead when the Transform section is keyed), and the
// depth sort of the sequences inside compound clips. Each is one undo step; locked clips are left out.
import type { Command } from "../../core/commands/command.js";
import type { Draft } from "immer";
import type { Clip, ClipId, CompoundClip, Frame, Project, SequenceId, Transform } from "../../core/document/types.js";
import { isClipLocked } from "../model/queries.js";
import { editedTransform, isTransformClip, setTransforms } from "./transform.js";

/** Whether a clip can turn in 2.5D (has a transform). */
const turnable = (project: Project, id: ClipId): Clip | null => {
  const clip = project.clips[id];
  return clip && isTransformClip(clip) && !isClipLocked(project, id) ? clip : null;
};

/** Hide (or show) the back side of the layers `ids` once turned past 90° (spec §21.15). */
export function setBackfaceHidden(project: Project, ids: readonly ClipId[], hidden: boolean): Command | null {
  const targets = ids.filter((id) => {
    const clip = turnable(project, id);
    return clip !== null && (clip.backfaceHidden === true) !== hidden;
  });
  if (targets.length === 0) return null;
  return {
    id: "clip.backface",
    label: hidden ? "Hide back side" : "Show back side",
    affects: ["clips", "composite"],
    run(draft) {
      for (const id of targets) {
        const clip = draft.clips[id] as Draft<Clip>;
        if (hidden) clip.backfaceHidden = true;
        else delete clip.backfaceHidden;
      }
    },
  };
}

/** Whether every turnable clip of `ids` hides its back side (the switch shows on). */
export function backfaceHiddenAll(project: Project, ids: readonly ClipId[]): boolean {
  const clips = ids.map((id) => turnable(project, id)).filter((clip): clip is Clip => clip !== null);
  return clips.length > 0 && clips.every((clip) => clip.backfaceHidden === true);
}

/** Reset 3D: the layers' X and Y rotations and depth back to 0 at `at` (keys there when keyed). */
export function resetDepth(project: Project, ids: readonly ClipId[], at: Frame): Command | null {
  const changes = new Map<ClipId, Transform>();
  for (const id of ids) {
    const clip = turnable(project, id);
    if (!clip || !isTransformClip(clip)) continue;
    const shown = editedTransform(clip, at);
    if ((shown.rotationX ?? 0) === 0 && (shown.rotationY ?? 0) === 0 && (shown.z ?? 0) === 0) continue;
    changes.set(id, { ...shown, rotationX: 0, rotationY: 0, z: 0 });
  }
  if (changes.size === 0) return null;
  const command = setTransforms(project, changes, { label: "Reset 3D rotation", at });
  return command && { ...command, id: "transform.reset3d" };
}

/** The sequences of the compound clips among `ids`. */
function sequencesOf(project: Project, ids: readonly ClipId[]): SequenceId[] {
  const out = new Set<SequenceId>();
  for (const id of ids) {
    const clip = project.clips[id];
    if (clip?.kind === "compound" && !isClipLocked(project, id) && project.sequences[(clip as CompoundClip).sequenceId]) out.add((clip as CompoundClip).sequenceId);
  }
  return [...out];
}

/** Whether every compound among `ids` draws its inner layers by depth (the switch shows on); null without compounds. */
export function depthSortOf(project: Project, ids: readonly ClipId[]): boolean | null {
  const sequences = sequencesOf(project, ids);
  return sequences.length === 0 ? null : sequences.every((id) => project.sequences[id]?.depthSort === true);
}

/** Inner layers drawn by depth (z, farther first) instead of track order in the compounds `ids` (spec §21.15). */
export function setDepthSort(project: Project, ids: readonly ClipId[], on: boolean): Command | null {
  const targets = sequencesOf(project, ids).filter((id) => (project.sequences[id]?.depthSort === true) !== on);
  if (targets.length === 0) return null;
  return {
    id: "compound.depthSort",
    label: on ? "Sort layers by depth" : "Sort layers by track",
    affects: ["composite"],
    run(draft) {
      for (const id of targets) {
        const sequence = draft.sequences[id];
        if (!sequence) continue;
        if (on) sequence.depthSort = true;
        else delete sequence.depthSort;
      }
    },
  };
}
