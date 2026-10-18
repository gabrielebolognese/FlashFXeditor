// A new, empty document with the default settings (spec §5.1: 30 fps; §11: 9:16 1080x1920).
import { FPS_30 } from "./time.js";
import { SCHEMA_VERSION, type Project, type Track, type TrackKind } from "./types.js";

export function createProject(options: { id: string; name: string; now: string; appVersion: string }): Project {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: options.id,
    name: options.name,
    settings: { width: 1080, height: 1920, fps: { ...FPS_30 }, background: { r: 0, g: 0, b: 0, a: 1 }, sampleRate: 48000 },
    media: {},
    bins: [],
    tracks: [],
    clips: {},
    markers: [],
    captionTracks: {},
    textPresetsLocal: [],
    meta: { createdAt: options.now, modifiedAt: options.now, appVersion: options.appVersion },
  };
}

/** An empty, targeted track at the default height. */
export function emptyTrack(id: string, kind: TrackKind, name: string): Track {
  return { id, kind, name, clipIds: [], locked: false, muted: false, solo: false, hidden: false, targeted: true, height: "M" };
}

const TRACK_PREFIX: Record<TrackKind, string> = { video: "V", audio: "A", caption: "CC" };

/** The next free default name for a track of `kind`: V1, V2... / A1... / CC1... */
export function nextTrackName(tracks: readonly Pick<Track, "kind" | "name">[], kind: TrackKind): string {
  const names = new Set(tracks.map((track) => track.name));
  let n = tracks.filter((track) => track.kind === kind).length + 1;
  while (names.has(`${TRACK_PREFIX[kind]}${n}`)) n += 1;
  return `${TRACK_PREFIX[kind]}${n}`;
}

/** The tracks a project created from the start screen begins with: one video and one audio track. */
export function defaultTracks(newId: () => string): Track[] {
  return [emptyTrack(newId(), "video", "V1"), emptyTrack(newId(), "audio", "A1")];
}

/**
 * `next` with the height of every track that also exists in `current` taken from `current` (the same
 * object when nothing differs). Track heights are session state (spec §5.3, Batch 16): they live in the
 * document (one source of truth, §5.2) but are written with no undo step, so an undo or redo that puts
 * back a whole track object (a reorder, a removed track) must not bring an old height back with it.
 */
export function carryTrackHeights(next: Project, current: Project): Project {
  const heights = new Map(current.tracks.map((track) => [track.id, track.height]));
  if (next.tracks.every((track) => (heights.get(track.id) ?? track.height) === track.height)) return next;
  return { ...next, tracks: next.tracks.map((track) => ({ ...track, height: heights.get(track.id) ?? track.height })) };
}
