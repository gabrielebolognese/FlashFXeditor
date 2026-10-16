// Small document builders for unit tests. Not imported by app code.
import { createProject } from "./project.js";
import { frameToUs } from "./time.js";
import { DEFAULT_TEXT_STYLE, textContent } from "../../text/style.js";
import type { Clip, MediaClip, MediaItem, Project, SolidClip, TextClip, Track, TrackKind } from "./types.js";

export function makeProject(): Project {
  return createProject({ id: "project-1", name: "Test", now: "2026-01-01T00:00:00.000Z", appVersion: "test" });
}

export function makeTrack(id: string, kind: TrackKind = "video", clipIds: string[] = []): Track {
  return { id, kind, name: id.toUpperCase(), clipIds, locked: false, muted: false, solo: false, hidden: false, targeted: false, height: "M" };
}

export function makeMedia(id: string, kind: MediaItem["kind"] = "video", durationUs = 3_600_000_000): MediaItem {
  return {
    id,
    kind,
    name: `${id}.mp4`,
    file: { relPath: `media/${id}.mp4` },
    durationUs,
    hasAudio: kind !== "image",
    analysis: { thumbs: "none", peaks: "none" },
    addedAt: "2026-01-01T00:00:00.000Z",
  };
}

export function makeMediaClip(
  project: Project,
  fields: { id: string; trackId: string; start: number; duration: number; mediaId: string; kind?: MediaClip["kind"] },
): MediaClip {
  return {
    kind: "video",
    name: fields.id,
    enabled: true,
    in: 0,
    out: frameToUs(fields.duration, project.settings.fps),
    speed: 1,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false },
    opacity: 1,
    crop: { left: 0, top: 0, right: 0, bottom: 0 },
    volume: { gainDb: 0, muted: false },
    fades: { in: 0, out: 0 },
    ...fields,
  };
}

export function makeSolidClip(fields: { id: string; trackId: string; start: number; duration: number }): SolidClip {
  return {
    kind: "solid",
    name: fields.id,
    enabled: true,
    fill: { r: 1, g: 1, b: 1, a: 1 },
    shape: "rect",
    size: { w: 100, h: 100 },
    cornerRadius: 0,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false },
    opacity: 1,
    ...fields,
  };
}

export function makeTextClip(fields: { id: string; trackId: string; start: number; duration: number; value?: string }): TextClip {
  const { value = "Text", ...rest } = fields;
  return {
    kind: "text",
    name: rest.id,
    enabled: true,
    text: textContent(value),
    style: structuredClone(DEFAULT_TEXT_STYLE),
    transform: { x: 0, y: 0, scale: 1, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false },
    opacity: 1,
    fades: { in: 0, out: 0 },
    ...rest,
  };
}

/** Puts clips into the project and onto their tracks (sorted), without validation. */
export function withClips(project: Project, clips: Clip[]): Project {
  const next = structuredClone(project);
  for (const clip of clips) {
    next.clips[clip.id] = clip;
    next.tracks.find((t) => t.id === clip.trackId)?.clipIds.push(clip.id);
  }
  for (const track of next.tracks) track.clipIds.sort((a, b) => (next.clips[a]?.start ?? 0) - (next.clips[b]?.start ?? 0));
  return next;
}
