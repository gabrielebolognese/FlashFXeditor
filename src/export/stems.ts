// Audio stems (spec §21.25, Batch 81): one WAV per audio track over the export range.
// - A stem is the mixdown of a project in which only that track is heard: every other audio track is
//   muted and the track itself is unmuted and soloed, so the scheduler, gains, fades, pan and keyframes
//   are the mixdown's own and the stems add up to it (the null test, `nullTestDb`). The loudness
//   normalization of Export audio is not applied: a stem is the track as the timeline mixes it.
// - Tracks that are not heard in the mixdown (muted, or not soloed while another is) or hold no audio
//   clip are left out: they would be silent files.
// - The audio of compound clips (spec §21.10) is mixed on virtual tracks (`flattenAudio`); each of
//   those is a stem too ("Compound audio", numbered), so nothing the mix has is missing from the sum.
import { flattenAudio } from "../audio/compoundAudio.js";
import { audibleTracks } from "../audio/AudioMixer.js";
import type { Project, Track, TrackId } from "../core/document/types.js";
import { pcm16, wavHeader } from "./wav.js";

export interface Stem {
  trackId: TrackId;
  /** The track's name (a number is added to a repeated one). */
  name: string;
  /** The project to mix: only this track is heard. */
  project: Project;
}

/** The stems of `project`, in track order. */
export function stemsOf(source: Project): Stem[] {
  const flat = flattenAudio(source);
  const audible = audibleTracks(flat);
  // The flattened project is mixed as it is: no sequences left to flatten a second time.
  const base: Project = { ...flat, sequences: {} };
  const stems: Stem[] = [];
  const used = new Set<string>();
  let compound = 0;
  for (const track of flat.tracks) {
    if (track.kind !== "audio" || audible.get(track.id) !== true || track.clipIds.length === 0) continue;
    const virtual = track.id.includes("/");
    const label = virtual ? `Compound audio ${++compound}` : track.name.trim() === "" ? `Audio ${stems.length + 1}` : track.name.trim();
    let name = label;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${label} ${n}`;
    used.add(name.toLowerCase());
    const tracks: Track[] = flat.tracks.map((t) => (t.kind === "audio" ? { ...t, muted: t.id !== track.id, solo: t.id === track.id } : t));
    stems.push({ trackId: track.id, name, project: { ...base, tracks } });
  }
  return stems;
}

/** `<project>-stems`, the folder a stem export writes into (the file name template's base). */
export const STEMS_SUFFIX = "-stems";

/** The stem's file name: `01 Voice.wav` (the number keeps the track order in a file listing). */
export function stemFileName(index: number, name: string, count: number): string {
  const width = Math.max(2, String(count).length);
  return `${String(index + 1).padStart(width, "0")} ${name}.wav`;
}

/** A 16-bit PCM WAV file of `planes` (`frames` sample frames; shorter planes end in silence). */
export function wavFile(planes: readonly Float32Array[], channels: number, sampleRate: number, frames: number): Uint8Array {
  const header = wavHeader(frames, channels, sampleRate);
  const body = pcm16(planes, channels, 0, frames);
  const out = new Uint8Array(header.length + body.length);
  out.set(header);
  out.set(body, header.length);
  return out;
}

/**
 * The null test: the largest sample of `mix` minus the sum of the stems, in dB below full scale (-Infinity
 * when they are identical). Planes are per channel; a missing stem sample is silence.
 */
export function nullTestDb(mix: readonly Float32Array[], stems: readonly (readonly Float32Array[])[]): number {
  let worst = 0;
  for (let c = 0; c < mix.length; c++) {
    const plane = mix[c] as Float32Array;
    for (let i = 0; i < plane.length; i++) {
      let sum = 0;
      for (const stem of stems) sum += stem[Math.min(c, stem.length - 1)]?.[i] ?? 0;
      worst = Math.max(worst, Math.abs(plane[i]! - sum));
    }
  }
  return worst === 0 ? -Infinity : 20 * Math.log10(worst);
}
