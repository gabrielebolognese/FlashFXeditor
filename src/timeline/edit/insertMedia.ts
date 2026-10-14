// Insert at the playhead (spec §6.14, the double-click "append to playhead" workflow). A media item
// becomes a clip at its natural duration (images 5 s) on the first targeted video track; a video with
// audio also gets its audio clip on the first targeted audio track, linked through `linkGroup`.
// Missing tracks are created. Nothing is overwritten: when the span is taken on any target track,
// the clips go to the earliest start after the playhead where they fit on all of them.
// Pure: returns the tracks and clips to add; the caller dispatches them as one transaction.
import { addClip, addTrack } from "../../core/commands/basicCommands.js";
import type { Command } from "../../core/commands/command.js";
import { emptyTrack, nextTrackName } from "../../core/document/project.js";
import { frameToUs, secondsToFrames, usToFrameFloor } from "../../core/document/time.js";
import type { Frame, MediaClip, MediaItem, Project, Rational, Track, TrackKind, Transform } from "../../core/document/types.js";
import { displaySize } from "../../media/probe/rotation.js";
import { clipsInRange } from "../model/queries.js";

/** Natural duration of a still image on the timeline (spec §6.14). */
export const IMAGE_SECONDS = 5;

export interface InsertPlan {
  /** Tracks to create first (each goes to the default place for its kind). */
  tracks: Track[];
  /** The clips, video first. */
  clips: MediaClip[];
  start: Frame;
  end: Frame;
}

/** Timeline duration of a media item at speed 1; null when it has no usable duration. */
export function naturalDuration(media: MediaItem, fps: Rational): Frame | null {
  if (media.kind === "image") return secondsToFrames(IMAGE_SECONDS, fps);
  if (media.durationUs <= 0) return null;
  return Math.max(1, usToFrameFloor(media.durationUs, fps));
}

/** The track a new clip of `kind` goes to: targeted and unlocked first, then any unlocked one. */
function targetTrack(tracks: readonly Track[], kind: TrackKind): Track | null {
  const ofKind = tracks.filter((track) => track.kind === kind && !track.locked);
  return ofKind.find((track) => track.targeted) ?? ofKind[0] ?? null;
}

/** Earliest start >= `from` where [start, start + duration) is free on every track. */
export function firstFreeStart(project: Project, trackIds: readonly string[], from: Frame, duration: Frame): Frame {
  let start = from;
  for (let moved = true; moved; ) {
    moved = false;
    for (const trackId of trackIds) {
      for (const clip of clipsInRange(project, trackId, start, start + duration)) {
        start = Math.max(start, clip.start + clip.duration);
        moved = true;
      }
    }
  }
  return start;
}

/**
 * The transform of a newly placed clip (spec §6.19): Fit, the media contained in the frame (letterboxed
 * when the aspects differ, filling it exactly when they match), centered, anchored at the media center.
 * Rotation metadata swaps width and height first. Media without a size (audio) keep scale 1.
 */
export function defaultTransform(media: MediaItem, frame: { width: number; height: number }): Transform {
  const shown = media.width && media.height ? displaySize(media.width, media.height, media.rotation) : null;
  const scale = shown ? Math.min(frame.width / shown.width, frame.height / shown.height) : 1;
  return { x: 0, y: 0, scale, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false };
}

function mediaClip(fields: Pick<MediaClip, "id" | "trackId" | "kind" | "name" | "start" | "duration" | "mediaId" | "out" | "transform"> & { linkGroup?: string }): MediaClip {
  return {
    ...fields,
    enabled: true,
    in: 0,
    speed: 1,
    opacity: 1,
    crop: { left: 0, top: 0, right: 0, bottom: 0 },
    volume: { gainDb: 0, muted: false },
    fades: { in: 0, out: 0 },
  };
}

export function planMediaInsert(project: Project, media: MediaItem, at: Frame, newId: () => string): InsertPlan | null {
  const { fps } = project.settings;
  const duration = naturalDuration(media, fps);
  if (duration === null) return null;

  const created: Track[] = [];
  const known: Track[] = [...project.tracks];
  const trackFor = (kind: TrackKind): Track => {
    const existing = targetTrack(project.tracks, kind);
    if (existing) return existing;
    const track = emptyTrack(newId(), kind, nextTrackName(known, kind));
    created.push(track);
    known.push(track);
    return track;
  };
  const visual = media.kind === "audio" ? null : trackFor("video");
  const audio = media.kind === "audio" || (media.kind === "video" && media.hasAudio) ? trackFor("audio") : null;
  const targets = [visual, audio].filter((track): track is Track => track !== null);

  const start = firstFreeStart(project, targets.map((track) => track.id), Math.max(0, at), duration);
  // Stills hold for any length; media clips must end inside the media (at most one frame short of a sub-frame file).
  const out = media.kind === "image" ? frameToUs(duration, fps) : Math.min(media.durationUs, frameToUs(duration, fps));
  const linkGroup = targets.length > 1 ? { linkGroup: newId() } : {};
  const transform = defaultTransform(media, project.settings);
  const clips = targets.map((track) =>
    mediaClip({
      id: newId(),
      trackId: track.id,
      kind: track === audio ? "audio" : media.kind === "image" ? "image" : "video",
      name: media.name,
      start,
      duration,
      mediaId: media.id,
      out,
      // The audio clip of a video draws nothing: it keeps scale 1.
      transform: track === audio ? { ...transform, scale: 1 } : transform,
      ...linkGroup,
    }),
  );
  return { tracks: created, clips, start, end: start + duration };
}

/** The plan as raw commands, in order (tracks first). */
export function insertCommands(plan: InsertPlan): Command[] {
  return [...plan.tracks.map((track) => addTrack(track)), ...plan.clips.map((clip) => addClip(clip))];
}
