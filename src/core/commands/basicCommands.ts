// Raw document commands: they change exactly what they are told and resolve nothing (no overlap
// handling, no ripple). Editing semantics build on them from Batch 11 on. Invalid results are
// caught by the dev validation in the DocumentStore.
import type { Draft } from "immer";
import type { Clip, ClipId, Project, Track, TrackId, TrackKind } from "../document/types.js";
import type { Affect, Command } from "./command.js";

type DraftProject = Draft<Project>;

type OptionalKeys<T> = { [K in keyof T]-?: Pick<T, K> extends Required<Pick<T, K>> ? never : K }[keyof T];
type FieldsPatch<C> = { [K in Exclude<keyof C, "id" | "kind">]?: K extends OptionalKeys<C> ? C[K] | undefined : C[K] };
type PatchOf<C> = C extends Clip ? FieldsPatch<C> : never;

/** Clip fields a raw update may set. `undefined` removes an optional field. */
export type ClipPatch = PatchOf<Clip>;

/** Video goes above the other video tracks, captions above all video, audio at the end. */
export function defaultTrackIndex(tracks: readonly Track[], kind: TrackKind): number {
  if (kind === "audio") return tracks.length;
  if (kind === "caption") {
    const firstAudio = tracks.findIndex((t) => t.kind === "audio");
    return firstAudio === -1 ? tracks.length : firstAudio;
  }
  return tracks.findLastIndex((t) => t.kind === "video") + 1;
}

function findTrack(draft: DraftProject, trackId: TrackId, commandId: string): Draft<Track> {
  const track = draft.tracks.find((t) => t.id === trackId);
  if (!track) throw new Error(`${commandId}: track ${trackId} does not exist`);
  return track;
}

/** Inserts `clipId` into a track's id list at its start-sorted position (after equal starts). */
function insertSorted(draft: DraftProject, track: Draft<Track>, clipId: ClipId, start: number): void {
  let lo = 0;
  let hi = track.clipIds.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((draft.clips[track.clipIds[mid] as ClipId]?.start ?? 0) <= start) lo = mid + 1;
    else hi = mid;
  }
  track.clipIds.splice(lo, 0, clipId);
}

function removeId(ids: ClipId[], clipId: ClipId): void {
  const at = ids.indexOf(clipId);
  if (at !== -1) ids.splice(at, 1);
}

export function addTrack(track: Track, index?: number): Command {
  return {
    id: "track.add",
    label: "Add track",
    affects: ["tracks", "timeline"],
    run(draft) {
      if (draft.tracks.some((t) => t.id === track.id)) throw new Error(`track.add: track ${track.id} already exists`);
      draft.tracks.splice(index ?? defaultTrackIndex(draft.tracks, track.kind), 0, structuredClone(track));
    },
  };
}

/** Removes a track with all its clips. */
export function removeTrack(trackId: TrackId): Command {
  return {
    id: "track.remove",
    label: "Delete track",
    affects: ["tracks", "clips", "timeline", "captions"],
    run(draft) {
      const at = draft.tracks.findIndex((t) => t.id === trackId);
      if (at === -1) return;
      const [track] = draft.tracks.splice(at, 1);
      for (const clipId of track?.clipIds ?? []) delete draft.clips[clipId];
      delete draft.captionTracks[trackId];
    },
  };
}

/** Track fields a raw update may set. */
export type TrackPatch = Partial<Pick<Track, "name" | "locked" | "muted" | "solo" | "hidden" | "targeted" | "height">>;

/** Sets track fields as given. Mute and solo also carry `audio` (the audio engine applies them). */
export function updateTrack(trackId: TrackId, patch: TrackPatch, label = "Edit track"): Command {
  return {
    id: "track.update",
    label,
    affects: "muted" in patch || "solo" in patch ? ["tracks", "audio"] : ["tracks"],
    run(draft) {
      Object.assign(findTrack(draft, trackId, "track.update"), patch);
    },
  };
}

export function addClip(clip: Clip): Command {
  return {
    id: "clip.add",
    label: "Add clip",
    affects: ["clips", "timeline"],
    run(draft) {
      const track = findTrack(draft, clip.trackId, "clip.add");
      if (draft.clips[clip.id]) throw new Error(`clip.add: clip ${clip.id} already exists`);
      draft.clips[clip.id] = structuredClone(clip);
      insertSorted(draft, track, clip.id, clip.start);
    },
  };
}

/** Removes clips (unknown ids are ignored). */
export function removeClips(clipIds: readonly ClipId[]): Command {
  return {
    id: "clip.remove",
    label: clipIds.length === 1 ? "Delete clip" : "Delete clips",
    affects: ["clips", "timeline"],
    run(draft) {
      for (const clipId of clipIds) {
        const clip = draft.clips[clipId];
        if (!clip) continue;
        const track = draft.tracks.find((t) => t.id === clip.trackId);
        if (track) removeId(track.clipIds, clipId);
        delete draft.clips[clipId];
      }
    },
  };
}

const TIMING_FIELDS = ["start", "duration", "trackId"] as const;
/** Clip fields only the rendered frame shows: changing them never redraws the timeline. */
const COMPOSITE_FIELDS: ReadonlySet<string> = new Set(["transform", "opacity", "crop"]);

/** The flags of a clip patch: `composite` for frame-only fields, `clips` (+ `timeline` for timing) otherwise. */
export function clipPatchAffects(patch: ClipPatch): Affect[] {
  const keys = Object.keys(patch);
  const affects: Affect[] = [];
  if (keys.some((key) => COMPOSITE_FIELDS.has(key))) affects.push("composite");
  if (keys.length === 0 || keys.some((key) => !COMPOSITE_FIELDS.has(key))) affects.push("clips");
  if (TIMING_FIELDS.some((field) => field in patch)) affects.push("timeline");
  return affects;
}

/** Sets clip fields as given; a new `start` or `trackId` re-sorts the clip into its track. */
export function updateClip(clipId: ClipId, patch: ClipPatch, options: { label?: string; coalesceKey?: string } = {}): Command {
  const affects = clipPatchAffects(patch);
  return {
    id: "clip.update",
    label: options.label ?? "Edit clip",
    ...(options.coalesceKey !== undefined && { coalesceKey: options.coalesceKey }),
    affects,
    run(draft) {
      const clip = draft.clips[clipId];
      if (!clip) throw new Error(`clip.update: clip ${clipId} does not exist`);
      const fromTrack = clip.trackId;
      const fromStart = clip.start;
      const fields = clip as unknown as Record<string, unknown>;
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) delete fields[key];
        else fields[key] = typeof value === "object" && value !== null ? structuredClone(value) : value;
      }
      if (clip.trackId === fromTrack && clip.start === fromStart) return;
      const target = findTrack(draft, clip.trackId, "clip.update");
      const source = draft.tracks.find((t) => t.id === fromTrack);
      if (source) removeId(source.clipIds, clipId);
      insertSorted(draft, target, clipId, clip.start);
    },
  };
}
