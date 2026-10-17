// Fades (spec §6.4, §6.15, §11; Batch 36): the pure edits behind the fade handles on clip corners, the
// quick row's Fade in / Fade out 0.5 s and the clip menu's presets. A fade is a length in frames from
// the clip's start (`fades.in`) or end (`fades.out`): opacity for pictures (video, image, text and
// solid clips), gain for audio clips. A clip's two fades never overlap (in + out <= duration). Each edit
// is one command `clip.fades`.
// - A fade handle drag edits one clip (linked video and audio fade on their own, §6.15).
// - The quick actions apply to the selected clips and their linked partners (§6.15 "apply to both"):
//   the fade is set to its length, or taken away when every clip has it already (the button shows
//   pressed then). The menu presets set the length on the selected clips.
import type { Draft } from "immer";
import type { Command } from "../../core/commands/command.js";
import { secondsToFrames } from "../../core/document/time.js";
import type { Clip, ClipId, Frame, Project } from "../../core/document/types.js";
import { isClipLocked, linkedPartners } from "../model/queries.js";

export type FadeEdge = "in" | "out";

/** The quick row's fade length (spec §11: Fade in 0.5 s, Fade out 0.5 s). */
export const QUICK_FADE_SECONDS = 0.5;
/** The clip menu's presets (spec §6.16: 0.25 s, 0.5 s, 1 s). */
export const FADE_PRESET_SECONDS = [0.25, 0.5, 1] as const;

/** Clips with fades: every kind but cues. */
export function canFade(clip: Clip): boolean {
  return clip.kind !== "caption";
}

/** A clip's fades (none for a solid that never had one, or a cue). */
export function fadesOf(clip: Clip): { in: Frame; out: Frame } {
  return clip.kind === "caption" ? { in: 0, out: 0 } : (clip.fades ?? { in: 0, out: 0 });
}

/** The longest `edge` fade the clip takes (its other fade stays). */
export function maxFade(clip: Clip, edge: FadeEdge): Frame {
  const fades = fadesOf(clip);
  return Math.max(0, clip.duration - (edge === "in" ? fades.out : fades.in));
}

/** A fade length (whole frames) within what the clip takes. */
export function clampFade(clip: Clip, edge: FadeEdge, frames: number): Frame {
  return Math.min(maxFade(clip, edge), Math.max(0, Math.round(frames)));
}

/**
 * Sets `edge` fades by clip id (each clamped to what the clip takes) as one `clip.fades` command; clips
 * that are gone, locked or cannot fade are skipped. Null when nothing changes.
 */
export function setFades(project: Project, edge: FadeEdge, changes: ReadonlyMap<ClipId, number>, label: string): Command | null {
  const writes: { id: ClipId; fades: { in: Frame; out: Frame } }[] = [];
  for (const [id, frames] of changes) {
    const clip = project.clips[id];
    if (!clip || !canFade(clip) || isClipLocked(project, id) || !Number.isFinite(frames)) continue;
    const current = fadesOf(clip);
    const value = clampFade(clip, edge, frames);
    if (value === current[edge]) continue;
    writes.push({ id, fades: { ...current, [edge]: value } });
  }
  if (writes.length === 0) return null;
  return {
    id: "clip.fades",
    label,
    affects: ["clips", "composite", "audio"],
    run(draft) {
      for (const { id, fades } of writes) {
        const clip = draft.clips[id] as Draft<Clip> | undefined;
        if (!clip || clip.kind === "caption") throw new Error(`clip.fades: clip ${id} does not exist or has no fades`);
        clip.fades = fades;
      }
    },
  };
}

/** The clips a quick fade acts on: `ids` and their linked partners, those that can fade, unlocked. */
export function fadeTargets(project: Project, ids: Iterable<ClipId>): ClipId[] {
  const result = new Set<ClipId>();
  for (const id of ids) {
    const clip = project.clips[id];
    if (!clip || isClipLocked(project, id)) continue;
    if (canFade(clip)) result.add(id);
    for (const partner of linkedPartners(project, id)) {
      const other = project.clips[partner];
      if (other && canFade(other)) result.add(partner);
    }
  }
  return [...result];
}

/** True when every clip of `ids` that can fade has an `edge` fade of `frames` (clamped as a set would be). */
export function hasFade(project: Project, ids: readonly ClipId[], edge: FadeEdge, frames: Frame): boolean {
  let any = false;
  for (const id of ids) {
    const clip = project.clips[id];
    if (!clip || !canFade(clip)) continue;
    any = true;
    if (fadesOf(clip)[edge] !== clampFade(clip, edge, frames)) return false;
  }
  return any;
}

const edgeLabel = (edge: FadeEdge) => (edge === "in" ? "Fade in" : "Fade out");

/**
 * The quick row's Fade in / Fade out (spec §11, §6.15): `seconds` on the selected clips and their linked
 * partners, or none when every one has it already (a toggle). Null when nothing changes.
 */
export function quickFade(project: Project, ids: readonly ClipId[], edge: FadeEdge, seconds = QUICK_FADE_SECONDS): Command | null {
  const targets = fadeTargets(project, ids);
  const frames = secondsToFrames(seconds, project.settings.fps);
  const off = hasFade(project, targets, edge, frames);
  return setFades(project, edge, new Map(targets.map((id) => [id, off ? 0 : frames])), off ? `Remove ${edgeLabel(edge).toLowerCase()}` : edgeLabel(edge));
}

/** A clip menu preset (spec §6.16): an `edge` fade of `seconds` on the clips of `ids`. */
export function presetFade(project: Project, ids: readonly ClipId[], edge: FadeEdge, seconds: number): Command | null {
  const frames = secondsToFrames(seconds, project.settings.fps);
  return setFades(project, edge, new Map(ids.map((id) => [id, frames])), edgeLabel(edge));
}

/** A fade handle drag's release (spec §6.4): one clip's `edge` fade, one undo step. */
export function dragFade(project: Project, clipId: ClipId, edge: FadeEdge, frames: Frame): Command | null {
  return setFades(project, edge, new Map([[clipId, frames]]), edgeLabel(edge));
}
