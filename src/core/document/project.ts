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
    tracks: [],
    clips: {},
    markers: [],
    captionTracks: {},
    textPresetsLocal: [],
    meta: { createdAt: options.now, modifiedAt: options.now, appVersion: options.appVersion },
  };
}

function emptyTrack(id: string, kind: TrackKind, name: string): Track {
  return { id, kind, name, clipIds: [], locked: false, muted: false, solo: false, hidden: false, targeted: true, height: "M" };
}

/** The tracks a project created from the start screen begins with: one video and one audio track. */
export function defaultTracks(newId: () => string): Track[] {
  return [emptyTrack(newId(), "video", "V1"), emptyTrack(newId(), "audio", "A1")];
}
