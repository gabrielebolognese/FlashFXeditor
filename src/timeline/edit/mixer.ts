// Audio v2 edits (spec §21.21, Batch 77). Pure `(doc, params) -> Command` functions, one undo step each.
// - Track mixer (`track.audio`): an audio track's gain (-60..+12 dB) and pan (-1..1). A zero value is not
//   stored (absent = 0 dB, centered), so a mixer left alone leaves the document as it was.
// - Clip pan (`clip.pan`): -1..1 on audio clips; a clip whose pan is keyed (`volume.pan`) gets a key at
//   the playhead instead, as the gain does.
// - Fade curve (`clip.fadeCurve`): linear, equal power (the default, not stored) or exponential, for the
//   fades of audio clips.
// - Loudness target (`project.loudness`): the export target of the project, or off.
import type { Draft } from "immer";
import type { Command } from "../../core/commands/command.js";
import { clipRel, panAt, writeKeys } from "../../core/document/keyframes.js";
import { MAX_GAIN_DB, MIN_GAIN_DB } from "../../core/document/limits.js";
import type { ClipId, FadeCurve, Frame, LoudnessTarget, MediaClip, Project, Track, TrackId } from "../../core/document/types.js";
import { isClipLocked } from "../model/queries.js";
import { isAudioClip } from "./volume.js";

export const clampTrackGain = (db: number) => Math.min(MAX_GAIN_DB, Math.max(MIN_GAIN_DB, db));
export const clampPan = (pan: number) => Math.min(1, Math.max(-1, pan));

/** The track's gain (dB) and pan as the mixer shows them. */
export const trackMix = (track: Pick<Track, "gainDb" | "pan">) => ({ gainDb: track.gainDb ?? 0, pan: track.pan ?? 0 });

export interface TrackMixChange {
  gainDb?: number;
  pan?: number;
}

/** Sets the gain and/or pan of audio tracks as one command `track.audio`; null when nothing changes. */
export function setTrackMix(project: Project, trackIds: readonly TrackId[], change: TrackMixChange, options: { coalesceKey?: string } = {}): Command | null {
  const ids = new Set(trackIds);
  const gainDb = change.gainDb !== undefined && Number.isFinite(change.gainDb) ? clampTrackGain(Math.round(change.gainDb * 10) / 10) : undefined;
  const pan = change.pan !== undefined && Number.isFinite(change.pan) ? clampPan(Math.round(change.pan * 100) / 100) : undefined;
  const changed = project.tracks.filter((track) => {
    if (!ids.has(track.id) || track.kind !== "audio") return false;
    const now = trackMix(track);
    return (gainDb !== undefined && gainDb !== now.gainDb) || (pan !== undefined && pan !== now.pan);
  });
  if (changed.length === 0) return null;
  return {
    id: "track.audio",
    label: "Change track mix",
    ...(options.coalesceKey !== undefined && { coalesceKey: options.coalesceKey }),
    affects: ["tracks", "audio"],
    run(draft) {
      for (const track of draft.tracks) {
        if (!ids.has(track.id) || track.kind !== "audio") continue;
        if (gainDb !== undefined) {
          if (gainDb === 0) delete track.gainDb;
          else track.gainDb = gainDb;
        }
        if (pan !== undefined) {
          if (pan === 0) delete track.pan;
          else track.pan = pan;
        }
      }
    },
  };
}

// --- Clip pan ------------------------------------------------------------------------------------

/** The pan a clip shows at the playhead `at` when its pan is keyed, else its own. */
export function shownPan(clip: MediaClip, at: Frame | null): number {
  return at !== null && (clip.keyframes?.["volume.pan"]?.length ?? 0) > 0 ? panAt(clip, clipRel(clip, at)) : clip.volume.pan ?? 0;
}

/** Sets the pan (-1..1) of audio clips by id as one command `clip.pan`; with `at`, a keyed pan gets its key there. Null when nothing changes. */
export function setPans(project: Project, changes: ReadonlyMap<ClipId, number>, options: { coalesceKey?: string; at?: Frame } = {}): Command | null {
  const writes: { id: ClipId; pan?: number; keyframes?: MediaClip["keyframes"] }[] = [];
  for (const [id, value] of changes) {
    const clip = project.clips[id];
    if (!isAudioClip(clip) || isClipLocked(project, id) || !Number.isFinite(value)) continue;
    const pan = clampPan(Math.round(value * 100) / 100);
    const keyed = (clip.keyframes?.["volume.pan"]?.length ?? 0) > 0;
    if (options.at === undefined || !keyed) {
      if (pan !== (clip.volume.pan ?? 0)) writes.push({ id, pan });
      continue;
    }
    const rel = clipRel(clip, options.at);
    if (pan !== panAt(clip, rel)) writes.push({ id, keyframes: writeKeys(clip.keyframes, rel, { "volume.pan": pan }) });
  }
  if (writes.length === 0) return null;
  return {
    id: "clip.pan",
    label: "Change pan",
    ...(options.coalesceKey !== undefined && { coalesceKey: options.coalesceKey }),
    affects: ["audio", "clips"],
    run(draft) {
      for (const write of writes) {
        const clip = draft.clips[write.id] as Draft<MediaClip> | undefined;
        if (!clip) throw new Error(`clip.pan: clip ${write.id} does not exist`);
        if (write.pan !== undefined) {
          if (write.pan === 0) delete clip.volume.pan;
          else clip.volume.pan = write.pan;
        }
        if (write.keyframes) clip.keyframes = structuredClone(write.keyframes);
      }
    },
  };
}

// --- Fade curve ----------------------------------------------------------------------------------

/** The curve of a clip's audio fades. */
export const curveOf = (clip: MediaClip): FadeCurve => clip.fades.curve ?? "equalPower";

/** Sets the fade curve of audio clips (the default, equal power, is not stored) as one command `clip.fadeCurve`. Null when nothing changes. */
export function setFadeCurve(project: Project, ids: readonly ClipId[], curve: FadeCurve): Command | null {
  const targets = ids.filter((id) => {
    const clip = project.clips[id];
    return isAudioClip(clip) && !isClipLocked(project, id) && curveOf(clip) !== curve;
  });
  if (targets.length === 0) return null;
  return {
    id: "clip.fadeCurve",
    label: "Change fade curve",
    affects: ["clips", "audio"],
    run(draft) {
      for (const id of targets) {
        const clip = draft.clips[id] as Draft<MediaClip>;
        if (curve === "equalPower") delete clip.fades.curve;
        else clip.fades.curve = curve;
      }
    },
  };
}

// --- Loudness target -----------------------------------------------------------------------------

/** Sets (or clears, null) the project's export loudness target as one command `project.loudness`. Null when nothing changes. */
export function setLoudnessTarget(project: Project, target: LoudnessTarget | null): Command | null {
  const now = project.settings.loudness ?? null;
  if (now === target || (now && target && now.targetLufs === target.targetLufs && now.truePeakDb === target.truePeakDb)) return null;
  return {
    id: "project.loudness",
    label: target ? "Set loudness target" : "Clear loudness target",
    affects: ["settings"],
    run(draft) {
      if (target) draft.settings.loudness = { targetLufs: target.targetLufs, truePeakDb: target.truePeakDb };
      else delete draft.settings.loudness;
    },
  };
}
