// Text animation edits (spec §10.4, §11 Animation section): the in and out animations of text clips.
// `setTextAnims` writes them as one command `clip.animation` (one undo step; a field's arrow steps
// coalesce by key). Locked clips, clips that are not text and clips that would not change are
// skipped; null removes an animation. The stored duration is the one asked for: playback clamps it to
// half the clip (text/anim.ts), so a later trim or extend needs no rewrite.
import type { Draft } from "immer";
import type { Command } from "../../core/commands/command.js";
import type { ClipId, Project, TextAnim, TextClip } from "../../core/document/types.js";
import { sameAnim } from "../../text/anim.js";
import { isClipLocked } from "../model/queries.js";

/** A text clip's new animations: a value sets it, null removes it, absent keeps it. */
export interface AnimEdit {
  animIn?: TextAnim | null;
  animOut?: TextAnim | null;
}

export type AnimSide = "animIn" | "animOut";

/** `edits` by clip id as one command `clip.animation`, or null when nothing changes. */
export function setTextAnims(project: Project, edits: ReadonlyMap<ClipId, AnimEdit>, options: { label: string; coalesceKey?: string }): Command | null {
  const writes: [ClipId, AnimEdit][] = [];
  for (const [id, edit] of edits) {
    const clip = project.clips[id];
    if (clip?.kind !== "text" || isClipLocked(project, id)) continue;
    const changes = (side: AnimSide) => edit[side] !== undefined && !sameAnim(clip[side], edit[side] ?? undefined);
    if (changes("animIn") || changes("animOut")) writes.push([id, edit]);
  }
  if (writes.length === 0) return null;
  return {
    id: "clip.animation",
    label: options.label,
    ...(options.coalesceKey !== undefined && { coalesceKey: options.coalesceKey }),
    // The timeline shows an animation badge.
    affects: ["composite", "text", "clips"],
    run(draft) {
      for (const [id, edit] of writes) {
        const clip = draft.clips[id] as Draft<TextClip>;
        for (const side of ["animIn", "animOut"] as const) {
          const next = edit[side];
          if (next === undefined) continue;
          if (next === null) delete clip[side];
          else clip[side] = { ...next };
        }
      }
    },
  };
}

/** Each text clip among `ids` with `side` changed by `change` (its current animation in, the new one or null out). */
export function animEdits(project: Project, ids: readonly ClipId[], side: AnimSide, change: (current: TextAnim | undefined, clip: TextClip) => TextAnim | null | undefined): Map<ClipId, AnimEdit> {
  const edits = new Map<ClipId, AnimEdit>();
  for (const id of ids) {
    const clip = project.clips[id];
    if (clip?.kind !== "text" || isClipLocked(project, id)) continue;
    const next = change(clip[side], clip);
    if (next !== undefined) edits.set(id, { [side]: next });
  }
  return edits;
}
