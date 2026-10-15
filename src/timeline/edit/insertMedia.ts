// Media items as clips (spec §6.14, §12): a media item becomes a clip at its natural duration (images
// 5 s), or over its source range (set in the media hover-scrub); a video with audio also gets its audio
// clip, linked through `linkGroup`. The building blocks of every way media enters the timeline
// (`dropMedia.ts`: drags, insert and overwrite at the playhead, drops on the preview canvas). Pure.
import { frameToUs, secondsToFrames, usToFrameFloor } from "../../core/document/time.js";
import type { Frame, MediaClip, MediaItem, Rational, TrackId, Transform, Us } from "../../core/document/types.js";
import type { SourceRange } from "../../core/store/sessionStore.js";
import { displaySize } from "../../media/probe/rotation.js";

/** Natural duration of a still image on the timeline (spec §6.14). */
export const IMAGE_SECONDS = 5;

export type { SourceRange };

/** The source span [inUs, outUs) of a video or audio item: its range inside the media, else all of it; null without a duration. */
export function sourceSpan(media: MediaItem, range: SourceRange | null): { inUs: Us; outUs: Us } | null {
  if (media.durationUs <= 0) return null;
  const clamp = (us: Us) => Math.min(Math.max(us, 0), media.durationUs);
  const inUs = clamp(range?.inUs ?? 0);
  const outUs = clamp(range?.outUs ?? media.durationUs);
  return outUs > inUs ? { inUs, outUs } : { inUs: 0, outUs: media.durationUs };
}

/** Timeline duration of a media item (over its source range) at speed 1; null when it has no usable duration. */
export function naturalDuration(media: MediaItem, fps: Rational, range: SourceRange | null = null): Frame | null {
  if (media.kind === "image") return secondsToFrames(IMAGE_SECONDS, fps);
  const span = sourceSpan(media, range);
  return span ? Math.max(1, usToFrameFloor(span.outUs - span.inUs, fps)) : null;
}

/** The kinds of track a media item's clips go to: its picture on a video track, its sound on an audio track. */
export function mediaLanes(media: MediaItem): { video: boolean; audio: boolean } {
  return { video: media.kind !== "audio", audio: media.kind === "audio" || (media.kind === "video" && media.hasAudio) };
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

/** The tracks a media item's clips go to (null for a kind it has no clip of). */
export interface ClipTracks {
  video: TrackId | null;
  audio: TrackId | null;
}

function mediaClip(fields: Pick<MediaClip, "id" | "trackId" | "kind" | "name" | "start" | "duration" | "mediaId" | "in" | "out" | "transform"> & { linkGroup?: string }): MediaClip {
  return {
    ...fields,
    enabled: true,
    speed: 1,
    opacity: 1,
    crop: { left: 0, top: 0, right: 0, bottom: 0 },
    volume: { gainDb: 0, muted: false },
    fades: { in: 0, out: 0 },
  };
}

/**
 * The clips of one media item at `start` (picture first, then sound) on `tracks`, linked when there
 * are two. `transform` replaces the picture's default (Fit). Null when the item has no duration or a
 * track it needs is missing.
 */
export function mediaClips(
  media: MediaItem,
  range: SourceRange | null,
  start: Frame,
  tracks: ClipTracks,
  settings: { width: number; height: number; fps: Rational },
  newId: () => string,
  transform?: Transform,
): MediaClip[] | null {
  const { fps } = settings;
  const duration = naturalDuration(media, fps, range);
  const lanes = mediaLanes(media);
  if (duration === null || (lanes.video && tracks.video === null) || (lanes.audio && tracks.audio === null)) return null;
  // Stills hold for any length; media clips end inside the media (at most one frame short of a sub-frame span).
  const span = sourceSpan(media, range) ?? { inUs: 0, outUs: frameToUs(duration, fps) };
  const inUs = media.kind === "image" ? 0 : span.inUs;
  const out = media.kind === "image" ? frameToUs(duration, fps) : Math.min(span.outUs, span.inUs + frameToUs(duration, fps));
  const picture = transform ?? defaultTransform(media, settings);
  const linkGroup = lanes.video && lanes.audio ? { linkGroup: newId() } : {};
  const fields = { name: media.name, start, duration, mediaId: media.id, in: inUs, out, ...linkGroup };
  const clips: MediaClip[] = [];
  if (lanes.video) clips.push(mediaClip({ ...fields, id: newId(), trackId: tracks.video as TrackId, kind: media.kind === "image" ? "image" : "video", transform: picture }));
  // The audio clip of a video draws nothing: it keeps scale 1.
  if (lanes.audio) clips.push(mediaClip({ ...fields, id: newId(), trackId: tracks.audio as TrackId, kind: "audio", transform: { ...picture, scale: 1 } }));
  return clips;
}
