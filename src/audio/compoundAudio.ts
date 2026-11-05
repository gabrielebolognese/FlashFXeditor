// The audio of compound clips (spec §21.10, Batch 62): the playback, the mixdown and the export read the
// audio clips of the project's audio tracks. A compound's sequence has audio tracks of its own, so
// `flattenAudio` returns the project with those clips placed on virtual audio tracks at the times the
// compound shows them (the window [offset, offset + duration) of the sequence, shifted to the compound's
// start), with the compound's volume added. Nested compounds flatten the same way, inside out.
// - A clip cut by the window loses the fade on the cut side and its keyframes (they are relative to its start).
// - The compound's fades and its sequence's transitions do not apply to the audio (Batch 62 follow-up).
// - A muted inner or host track is left out, solo is inherited from the host track.
// - The result is cached per project object; a project without compounds is returned as is.
import { fpsToNumber } from "../core/document/time.js";
import type { Clip, ClipId, CompoundClip, MediaClip, Project, SequenceId, Track } from "../core/document/types.js";

interface Entry {
  /** The audio clip, its times in the time of the scope it was collected in. */
  clip: MediaClip;
  /** The virtual track it plays on (a path of compound ids and the inner track id). */
  key: string;
  solo: boolean;
}

const cache = new WeakMap<Project, Project>();

const isAudio = (clip: Clip | undefined): clip is MediaClip => clip?.kind === "audio" && clip.enabled;

/** `entry` as heard through `compound`: inside its window, at its place, with its volume. Null when it falls outside. */
function through(entry: Entry, compound: CompoundClip, hostSolo: boolean, fps: number): Entry | null {
  const { clip } = entry;
  const lo = Math.max(clip.start, compound.offset);
  const hi = Math.min(clip.start + clip.duration, compound.offset + compound.duration);
  if (hi <= lo) return null;
  const microseconds = (frames: number) => Math.round((frames / fps) * 1e6 * clip.speed);
  const trimmedIn = lo > clip.start;
  const trimmedOut = hi < clip.start + clip.duration;
  const duration = hi - lo;
  const next: MediaClip = {
    ...clip,
    id: `${compound.id}/${clip.id}`,
    start: compound.start + lo - compound.offset,
    duration,
    in: clip.in + microseconds(lo - clip.start),
    out: clip.in + microseconds(hi - clip.start),
    fades: { in: trimmedIn ? 0 : Math.min(clip.fades.in, duration), out: trimmedOut ? 0 : Math.min(clip.fades.out, duration) },
    volume: { gainDb: clip.volume.gainDb + compound.volume.gainDb, muted: clip.volume.muted || compound.volume.muted },
  };
  delete next.transitionIn;
  delete next.transitionOut;
  if (trimmedIn || trimmedOut) delete next.keyframes;
  return { clip: next, key: `${compound.id}/${entry.key}`, solo: entry.solo || hostSolo };
}

function collect(project: Project, tracks: readonly Track[], fps: number, sequences: Map<SequenceId, Entry[]>, depth: number): Entry[] {
  const out: Entry[] = [];
  if (depth > 8) return out;
  for (const track of tracks) {
    if (track.muted) continue;
    for (const id of track.clipIds) {
      const clip = project.clips[id as ClipId];
      if (track.kind === "audio") {
        if (isAudio(clip)) out.push({ clip, key: track.id, solo: track.solo });
      } else if (clip?.kind === "compound" && clip.enabled) {
        const sequence = project.sequences[clip.sequenceId];
        if (!sequence) continue;
        let inner = sequences.get(clip.sequenceId);
        if (!inner) {
          inner = collect(project, sequence.tracks, fps, sequences, depth + 1);
          sequences.set(clip.sequenceId, inner);
        }
        for (const entry of inner) {
          const heard = through(entry, clip, track.solo, fps);
          if (heard) out.push(heard);
        }
      }
    }
  }
  return out;
}

/** `project` with the audio of its compound clips on virtual audio tracks (the project itself when it has none). */
export function flattenAudio(project: Project): Project {
  const sequences = project.sequences;
  if (!sequences || Object.keys(sequences).length === 0) return project;
  const known = cache.get(project);
  if (known) return known;
  const fps = fpsToNumber(project.settings.fps);
  // Only compounds on the project's own tracks start a flattening; their inner entries come back keyed by path.
  const compoundTracks = project.tracks.filter((track) => track.kind !== "audio");
  const entries = collect(project, compoundTracks, fps, new Map(), 0).filter((entry) => entry.clip.id.includes("/"));
  if (entries.length === 0) {
    cache.set(project, project);
    return project;
  }
  const byKey = new Map<string, Entry[]>();
  for (const entry of entries) {
    const list = byKey.get(entry.key);
    if (list) list.push(entry);
    else byKey.set(entry.key, [entry]);
  }
  const tracks: Track[] = [...project.tracks];
  const clips: Record<ClipId, Clip> = { ...project.clips };
  for (const [key, list] of byKey) {
    list.sort((a, b) => a.clip.start - b.clip.start);
    tracks.push({ id: key, kind: "audio", name: key, clipIds: list.map((entry) => entry.clip.id), locked: false, muted: false, solo: list[0]?.solo ?? false, hidden: false, targeted: false, height: "S" });
    for (const entry of list) clips[entry.clip.id] = { ...entry.clip, trackId: key };
  }
  const flat: Project = { ...project, tracks, clips };
  cache.set(project, flat);
  cache.set(flat, flat);
  return flat;
}
