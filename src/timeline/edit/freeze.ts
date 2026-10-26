// Freeze frame and punch zoom (spec §6.1 toolbar, §6.16 clip menu, §11/§17 quick row, §18 Shift+F /
// Shift+Z; Batch 27), the pure edits behind both one-clicks:
// - Freeze frame: the video clip under the playhead is split there (with its linked partners, always:
//   its sound must stay in sync) and a FREEZE_SECONDS clip holding the frame at the playhead goes
//   between the halves. The freeze is a video clip of the same media with `speed = 0` (`in` = the
//   source time shown at the playhead, `out` one project frame later): the compositor shows `in` on
//   every frame and the playback engine asks the decoder for that single frame. Every clip from the
//   playhead on, on every unlocked track, shifts right by the freeze (ripple): the clip's own sound is
//   silent during the freeze, while clips that span the playhead without being split (a music bed)
//   play on under it. The freeze keeps the clip's look (name, label color, enabled, transform, crop,
//   opacity) and nothing time-based (fades, keyframes, transitions, link, group).
// - Punch zoom: the clips are split at the playhead (linked partners with them while Linked selection
//   is on, as Split at playhead does) and the right pieces scaled by the punch zoom setting (1.2x)
//   around their anchor, so the cut punches in. TODO(batch 35): the `punchZoomAnimated` setting makes
//   it an animated zoom (scale keyframes) instead.
// The targets: the selected clips under the playhead (videos for a freeze, any layer for a punch
// zoom); with none of those selected, the topmost clip under the playhead (a video; a video or image
// for a punch zoom) on a targeted, unlocked, visible video track. A clip starting at the playhead is
// not split: the freeze goes before it, the punch zoom scales all of it. Clips on locked tracks never
// change. One command each (one undo step).
import type { Draft } from "immer";
import type { Command } from "../../core/commands/command.js";
import { framesToSourceUs, frameToUs, secondsToFrames } from "../../core/document/time.js";
import type { Clip, ClipId, Frame, MediaClip, Project, Transform } from "../../core/document/types.js";
import { clipInIndex, isClipLocked, linkedPartners, trackIndex } from "../model/queries.js";
import { splitClips, splitsAt } from "./split.js";
import { isLayerClip } from "./transform.js";

/** How long a new freeze frame holds (Batch 27: "a 2 s frozen clip"). */
export const FREEZE_SECONDS = 2;

/** Why nothing could be frozen or zoomed: nothing fits under the playhead, or the selected clips are not under it. */
export type OneClickMiss = "none" | "notUnderPlayhead";

export interface FreezeResult {
  command: Command;
  /** The new freeze frames (one per frozen clip). */
  freezeIds: ClipId[];
}

export interface PunchZoomResult {
  command: Command;
  /** The zoomed clips: the right pieces (or the clips that start at the playhead). */
  zoomedIds: ClipId[];
}

const under = (clip: Clip, frame: Frame) => clip.start <= frame && frame < clip.start + clip.duration;

/**
 * The clips a one-click at `frame` acts on: the selected ones `selected` accepts that are under the
 * frame; with none accepted in the selection, the topmost `topmost` accepts under the frame on a
 * targeted, unlocked, visible video track.
 */
function targetsAt(project: Project, frame: Frame, selection: readonly ClipId[], selected: (clip: Clip) => boolean, topmost: (clip: Clip) => boolean): Clip[] | OneClickMiss {
  const candidates = selection.map((id) => project.clips[id]).filter((clip): clip is Clip => clip !== undefined && selected(clip) && !isClipLocked(project, clip.id));
  if (candidates.length > 0) {
    const picked = candidates.filter((clip) => under(clip, frame));
    return picked.length > 0 ? picked : "notUnderPlayhead";
  }
  // Index 0 is the bottom video track: the last video track is the top layer.
  for (let i = project.tracks.length - 1; i >= 0; i--) {
    const track = project.tracks[i];
    if (!track || track.kind !== "video" || !track.targeted || track.locked || track.hidden) continue;
    const clip = clipInIndex(trackIndex(project, track), frame);
    if (clip?.enabled && topmost(clip)) return [clip];
  }
  return "none";
}

/** `clips` and their partners (with `linked`) that a split at `frame` cuts. */
function splitSet(project: Project, clips: readonly Clip[], frame: Frame, linked: boolean): ClipId[] {
  const ids = new Set<ClipId>();
  const add = (clip: Clip | undefined) => {
    if (clip && splitsAt(clip, frame) && !isClipLocked(project, clip.id)) ids.add(clip.id);
  };
  for (const clip of clips) {
    add(clip);
    if (linked) for (const partner of linkedPartners(project, clip.id)) add(project.clips[partner]);
  }
  return [...ids];
}

/** The freeze frame of `clip` at `frame`: its look, `FREEZE_SECONDS` long, holding the source time shown there. */
function freezeOf(project: Project, clip: MediaClip, frame: Frame, duration: Frame, id: ClipId): MediaClip {
  const { fps } = project.settings;
  // The source time the clip shows at the frame (§5.1; a freeze frame's own `in`).
  const time = Math.min(clip.out - 1, clip.in + framesToSourceUs(frame - clip.start, clip.speed, fps));
  const durationUs = project.media[clip.mediaId]?.durationUs ?? clip.out;
  const freeze: MediaClip = { ...clip, id, start: frame, duration, speed: 0, in: time, out: Math.min(durationUs, time + frameToUs(1, fps)), fades: { in: 0, out: 0 } };
  delete freeze.linkGroup;
  delete freeze.group;
  delete freeze.keyframes;
  delete freeze.transitionIn;
  delete freeze.transitionOut;
  return freeze;
}

/**
 * Freeze frame at `frame` (see the header): the video clips `selection` gives (or the topmost one),
 * split there, a freeze between the halves, everything from the frame on rippled right. A miss when
 * there is nothing to freeze.
 */
export function freezeFrame(project: Project, frame: Frame, selection: readonly ClipId[], newId: () => string): FreezeResult | OneClickMiss {
  const isVideo = (clip: Clip) => clip.kind === "video";
  const targets = targetsAt(project, frame, selection, isVideo, isVideo);
  if (!Array.isArray(targets)) return targets;
  const split = splitClips(project, splitSet(project, targets, frame, true), frame, newId);
  const duration = secondsToFrames(FREEZE_SECONDS, project.settings.fps);
  const freezes = targets.map((clip) => freezeOf(project, clip as MediaClip, frame, duration, newId()));
  const command: Command = {
    id: "clip.freezeFrame",
    label: freezes.length === 1 ? "Freeze frame" : "Freeze frames",
    affects: ["clips", "timeline"],
    run(draft, ctx) {
      split?.command.run(draft, ctx);
      // Ripple: everything from the frame on (the right pieces included) moves after the freeze.
      for (const track of draft.tracks) {
        if (track.locked) continue;
        for (const id of track.clipIds) {
          const clip = draft.clips[id];
          if (clip && clip.start >= frame) clip.start += duration;
        }
      }
      for (const freeze of freezes) {
        const track = draft.tracks.find((candidate) => candidate.id === freeze.trackId);
        if (!track) throw new Error(`clip.freezeFrame: track ${freeze.trackId} does not exist`);
        const at = track.clipIds.findIndex((id) => (draft.clips[id]?.start ?? 0) > frame);
        track.clipIds.splice(at === -1 ? track.clipIds.length : at, 0, freeze.id);
        draft.clips[freeze.id] = freeze as Draft<Clip>;
      }
    },
  };
  return { command, freezeIds: freezes.map((freeze) => freeze.id) };
}

/** `transform` zoomed by `factor` around its anchor (both axes). */
function zoomed(transform: Transform, factor: number): Transform {
  const next = { ...transform, scale: transform.scale * factor };
  if (transform.scaleY !== undefined) next.scaleY = transform.scaleY * factor;
  return next;
}

/**
 * Punch zoom at `frame` (see the header): the layers `selection` gives (or the topmost video or image),
 * split there, the right pieces scaled by `factor`. A miss when there is nothing to zoom.
 */
export function punchZoom(project: Project, frame: Frame, selection: readonly ClipId[], factor: number, newId: () => string, options: { linked: boolean }): PunchZoomResult | OneClickMiss {
  const targets = targetsAt(project, frame, selection, isLayerClip, (clip) => clip.kind === "video" || clip.kind === "image");
  if (!Array.isArray(targets)) return targets;
  const split = splitClips(project, splitSet(project, targets, frame, options.linked), frame, newId);
  const zoomedIds = targets.map((clip) => split?.pieces.get(clip.id) ?? clip.id);
  const command: Command = {
    id: "clip.punchZoom",
    label: "Punch zoom",
    affects: ["clips", "timeline", "composite"],
    run(draft, ctx) {
      split?.command.run(draft, ctx);
      for (const id of zoomedIds) {
        const clip = draft.clips[id];
        if (!clip || !("transform" in clip)) throw new Error(`clip.punchZoom: clip ${id} is not a layer`);
        clip.transform = zoomed(clip.transform as Transform, factor) as Draft<Transform>;
      }
    },
  };
  return { command, zoomedIds };
}
