// Audio edits (spec §11 Audio section, §14, §6.4 rubber band; Batch 37). Pure `(doc, params) -> Command`
// functions, one undo step each.
// - What they edit: audio clips. A selected video clip stands for the audio clips linked to it (its
//   sound plays through them, spec §14), so the Audio section and its actions work on a picked video
//   too (`audioTargets`). Locked clips are skipped.
// - Gain (`clip.volume`): -60 dB to +12 dB (spec §14). A clip whose Volume is keyed (the stopwatch, the
//   rubber band's keys) gets a key at the playhead instead, as Transform and Opacity do (Batch 35).
// - Mute (`clip.mute`); Normalize (`clip.normalize`): the gain that brings the clip's peak, from the
//   waveform peaks (refined from the decoded samples when they are in memory), to -1 dBFS; a keyed
//   clip shifts every volume key by the same amount, so the loudest point of its keyed gain lands there.
// - Rubber band (`bandEdit`): a drag of the line of a clip without keys sets its gain; with keys, a
//   drag of the line between two keys moves both (before the first or after the last: that key), and
//   a drag of a key moves it in time (between its neighbours, inside the clip) and value.
// - Auto-duck music (`clip.autoDuck`): for each music clip, wherever audio clips on audible tracks above
//   it (closer to the divider) play, volume keys lower its gain by `depthDb`, reached `rampFrames`
//   before the voice starts and left `rampFrames` after it ends; voices closer than two ramps stay one
//   dip. The music's own gain curve is kept (the dip is relative to it).
// - Detach audio (`clip.detachAudio`): a video clip's linked audio leaves the link (it already sits on
//   its own audio track); a video whose media has sound but no audio clip gets one, on the first audio
//   track free over its span (else a new one at the bottom), unlinked.
import type { Draft } from "immer";
import type { Command } from "../../core/commands/command.js";
import { emptyTrack, nextTrackName } from "../../core/document/project.js";
import { clipRel, gainDbAt, hasSectionKeys, setKey, withKeys, writeKeys, type Key } from "../../core/document/keyframes.js";
import { usPerFrame } from "../../core/document/time.js";
import type { ClipId, Frame, Keyframes, MediaClip, MediaId, Project, Track, TrackId } from "../../core/document/types.js";
import type { Peaks } from "../../media/cache/peaks.js";
import { PEAKS_BUCKET } from "../../media/cache/peaks.js";
import { clipsInRange, isClipLocked, linkGroupOf, linkedPartners } from "../model/queries.js";

/** The clip gain range (spec §14). */
export const MIN_GAIN_DB = -60;
export const MAX_GAIN_DB = 12;
/** Normalize's target peak (spec §14). */
export const NORMALIZE_PEAK_DB = -1;
/** Auto-duck's defaults (spec §14: keyframes at -12 dB, 10-frame ramps; app settings `duckDepthDb`, `duckRampFrames`). */
export const DUCK_DEPTH_DB = 12;
export const DUCK_RAMP_FRAMES = 10;

const PROP = "volume.gainDb";

export const clampGain = (db: number) => Math.min(MAX_GAIN_DB, Math.max(MIN_GAIN_DB, db));
const dbToGain = (db: number) => 10 ** (db / 20);
const gainToDb = (gain: number) => 20 * Math.log10(gain);

/** An audio clip (the clips with a gain that is heard). */
export const isAudioClip = (clip: unknown): clip is MediaClip => (clip as MediaClip | undefined)?.kind === "audio";

/** The volume keys of a clip (empty when its Volume is not keyed). */
export const volumeKeys = (clip: { keyframes?: Keyframes | undefined }): readonly Key[] => clip.keyframes?.[PROP] ?? [];

/**
 * The audio clips the Audio section and the audio actions edit for a selection: the audio clips in it and
 * the audio clips linked to the video clips in it (once each, in order), unlocked.
 */
export function audioTargets(project: Project, ids: Iterable<ClipId>): ClipId[] {
  const out: ClipId[] = [];
  const seen = new Set<ClipId>();
  const add = (id: ClipId) => {
    if (seen.has(id) || !isAudioClip(project.clips[id]) || isClipLocked(project, id)) return;
    seen.add(id);
    out.push(id);
  };
  for (const id of ids) {
    const clip = project.clips[id];
    if (clip?.kind === "audio") add(id);
    else if (clip?.kind === "video") for (const partner of linkedPartners(project, id)) add(partner);
  }
  return out;
}

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

interface GainWrite {
  id: ClipId;
  gainDb?: number;
  keyframes?: Keyframes | undefined;
}

function gainCommand(id: string, label: string, writes: readonly GainWrite[], coalesceKey?: string): Command | null {
  if (writes.length === 0) return null;
  return {
    id,
    label,
    ...(coalesceKey !== undefined && { coalesceKey }),
    // `clips`: the timeline draws the gain (waveform, rubber band).
    affects: ["audio", "clips"],
    run(draft) {
      for (const write of writes) {
        const clip = draft.clips[write.id] as Draft<MediaClip> | undefined;
        if (!clip) throw new Error(`${id}: clip ${write.id} does not exist`);
        if (write.gainDb !== undefined) clip.volume.gainDb = write.gainDb;
        if ("keyframes" in write) {
          if (write.keyframes) clip.keyframes = structuredClone(write.keyframes);
          else delete clip.keyframes;
        }
      }
    },
  };
}

/**
 * Sets the gain (dB, clamped to the range) of audio clips by id as one command `clip.volume`. With `at`
 * (the playhead) a clip whose Volume is keyed gets its key there. Null when nothing changes.
 */
export function setGains(project: Project, changes: ReadonlyMap<ClipId, number>, options: { label?: string; coalesceKey?: string; at?: Frame } = {}): Command | null {
  const writes: GainWrite[] = [];
  for (const [id, value] of changes) {
    const clip = project.clips[id];
    if (!isAudioClip(clip) || isClipLocked(project, id) || !Number.isFinite(value)) continue;
    const gainDb = clampGain(value);
    if (options.at === undefined || !hasSectionKeys(clip.keyframes, "volume")) {
      if (gainDb !== clip.volume.gainDb) writes.push({ id, gainDb });
      continue;
    }
    const rel = clipRel(clip, options.at);
    if (gainDb !== gainDbAt(clip, rel)) writes.push({ id, keyframes: writeKeys(clip.keyframes, rel, { [PROP]: gainDb }) });
  }
  return gainCommand("clip.volume", options.label ?? "Change volume", writes, options.coalesceKey);
}

/** Mutes or unmutes audio clips (spec §11 Audio section, quick row Mute) as one command `clip.mute`. Null when nothing changes. */
export function setMuted(project: Project, ids: Iterable<ClipId>, muted: boolean): Command | null {
  const changed = [...new Set(ids)].filter((id) => {
    const clip = project.clips[id];
    return isAudioClip(clip) && !isClipLocked(project, id) && clip.volume.muted !== muted;
  });
  if (changed.length === 0) return null;
  return {
    id: "clip.mute",
    label: `${muted ? "Mute" : "Unmute"} ${plural(changed.length, "clip", "clips")}`,
    affects: ["audio", "clips"],
    run(draft) {
      for (const id of changed) (draft.clips[id] as Draft<MediaClip>).volume.muted = muted;
    },
  };
}

/** Mute toggled on audio clips: muted unless every one is muted already. */
export function toggleMuted(project: Project, ids: readonly ClipId[]): Command | null {
  const clips = ids.map((id) => project.clips[id]).filter(isAudioClip);
  return setMuted(project, ids, !(clips.length > 0 && clips.every((clip) => clip.volume.muted)));
}

/** Whether every one of the audio clips is muted (the quick row's pressed Mute). */
export function allMuted(project: Project, ids: readonly ClipId[]): boolean {
  const clips = ids.map((id) => project.clips[id]).filter(isAudioClip);
  return clips.length > 0 && clips.every((clip) => clip.volume.muted);
}

// --- Normalize ------------------------------------------------------------------------------------

/** The exact peak (0..1) of sample frames [from, to) of a media's audio, or null when its samples are not in memory. */
export type ExactPeak = (mediaId: MediaId, from: number, to: number) => number | null;

/** At most this many level-0 buckets are read back exactly (a long, heavily limited track keeps the peaks' value). */
const MAX_REFINED_BUCKETS = 4096;

/**
 * The loudest point of `clip` (0..1 full scale, its keyed gain applied when keyed, the base gain not),
 * from the level-0 peaks over its source range, refined from the decoded samples (`exact`) in the
 * buckets that may hold it. Null when the peaks do not cover the clip.
 */
export function clipPeak(peaks: Peaks, clip: MediaClip, fps: { num: number; den: number }, exact?: ExactPeak): number | null {
  const data = peaks.levels[0];
  if (!data || clip.speed <= 0) return null;
  const { channels, sampleRate } = peaks;
  const s0 = Math.max(0, Math.floor((clip.in * sampleRate) / 1e6));
  const s1 = Math.min(peaks.frames, Math.ceil((clip.out * sampleRate) / 1e6));
  if (s1 <= s0) return null;
  const keyed = hasSectionKeys(clip.keyframes, "volume");
  const usPerClipFrame = usPerFrame(fps) * clip.speed;
  const gainAt = (sample: number) => (keyed ? dbToGain(gainDbAt(clip, ((sample * 1e6) / sampleRate - clip.in) / usPerClipFrame)) : 1);
  const b0 = Math.floor(s0 / PEAKS_BUCKET);
  const b1 = Math.ceil(s1 / PEAKS_BUCKET);
  const peakOf = (b: number) => {
    const at = b * channels * 2;
    let peak = 0;
    for (let c = 0; c < channels; c++) peak = Math.max(peak, -(data[at + 2 * c] ?? 0), data[at + 2 * c + 1] ?? 0);
    return peak / 127;
  };
  // Quantized peaks round up (peaks.ts): the true peak of a bucket is within one step below its value.
  let max = 0;
  const gained: number[] = [];
  for (let b = b0; b < b1; b++) {
    const value = peakOf(b) * gainAt((b + 0.5) * PEAKS_BUCKET);
    gained.push(value);
    if (value > max) max = value;
  }
  if (max <= 0) return 0;
  if (!exact) return max;
  const candidates: number[] = [];
  for (let b = b0; b < b1; b++) {
    const step = gainAt((b + 0.5) * PEAKS_BUCKET) / 127;
    if ((gained[b - b0] as number) >= max - step) candidates.push(b);
    if (candidates.length > MAX_REFINED_BUCKETS) return max;
  }
  let refined = 0;
  for (const b of candidates) {
    const from = Math.max(s0, b * PEAKS_BUCKET);
    const to = Math.min(s1, (b + 1) * PEAKS_BUCKET);
    const value = exact(clip.mediaId, from, to);
    const gain = gainAt((b + 0.5) * PEAKS_BUCKET);
    refined = Math.max(refined, value === null ? (gained[b - b0] as number) : value * gain);
  }
  return refined;
}

export interface NormalizeResult {
  command: Command | null;
  /** Clips with no sound (nothing to normalize). */
  silent: ClipId[];
  /** Clips whose peaks are not loaded yet. */
  missing: ClipId[];
}

/**
 * Normalize (spec §14): each audio clip's gain set so its peak hits -1 dBFS (clamped to the gain
 * range); a keyed clip has every volume key shifted by the same dB instead. One command `clip.normalize`.
 */
export function normalizeClips(project: Project, ids: readonly ClipId[], peaksOf: (mediaId: MediaId) => Peaks | null, exact?: ExactPeak): NormalizeResult {
  const writes: GainWrite[] = [];
  const silent: ClipId[] = [];
  const missing: ClipId[] = [];
  for (const id of ids) {
    const clip = project.clips[id];
    if (!isAudioClip(clip) || isClipLocked(project, id)) continue;
    const peaks = peaksOf(clip.mediaId);
    const peak = peaks ? clipPeak(peaks, clip, project.settings.fps, exact) : null;
    if (peak === null) {
      missing.push(id);
      continue;
    }
    if (peak <= 0) {
      silent.push(id);
      continue;
    }
    const keys = volumeKeys(clip);
    if (keys.length === 0) {
      const gainDb = clampGain(NORMALIZE_PEAK_DB - gainToDb(peak));
      if (gainDb !== clip.volume.gainDb) writes.push({ id, gainDb });
      continue;
    }
    const delta = NORMALIZE_PEAK_DB - gainToDb(peak);
    if (Math.abs(delta) < 1e-9) continue;
    writes.push({ id, keyframes: withKeys(clip.keyframes, PROP, keys.map((key) => ({ ...key, value: clampGain(key.value + delta) }))) });
  }
  return { command: gainCommand("clip.normalize", plural(writes.length, "Normalize clip", "Normalize clips"), writes), silent, missing };
}

// --- Rubber band ------------------------------------------------------------------------------------

/** A rubber band drag (spec §6.4) at its release. */
export type BandEdit =
  /** The line of a clip without keys: its gain. */
  | { kind: "gain"; gainDb: number }
  /** Keys (frames relative to the clip): their values moved by `deltaDb`; one key may also move by `deltaFrames`. */
  | { kind: "keys"; frames: readonly Frame[]; deltaDb: number; deltaFrames: number };

/** The keys a drag of the line at `rel` (fractional frame of the clip) moves: the two around it, or the end key before the first / after the last. */
export function segmentKeys(keys: readonly Key[], rel: number): Frame[] {
  if (keys.length === 0) return [];
  const first = keys[0] as Key;
  const last = keys[keys.length - 1] as Key;
  if (rel <= first.frame) return [first.frame];
  if (rel >= last.frame) return [last.frame];
  const right = keys.findIndex((key) => key.frame > rel);
  return [(keys[right - 1] as Key).frame, (keys[right] as Key).frame];
}

/**
 * How far a key at `frame` may move in time: to its neighbours (exclusive) and the clip's frames. A key
 * with no frame of the clip between its neighbours (a trim keeps keys past the clip's end) stays.
 */
export function clampKeyShift(clip: { duration: Frame }, keys: readonly Key[], frame: Frame, delta: number): number {
  const at = keys.findIndex((key) => key.frame === frame);
  if (at === -1) return 0;
  const lo = Math.max(0, (keys[at - 1]?.frame ?? -1) + 1);
  const hi = Math.min(clip.duration - 1, (keys[at + 1]?.frame ?? clip.duration) - 1);
  if (lo > hi) return 0;
  return Math.min(hi, Math.max(lo, frame + Math.round(delta))) - frame;
}

/** `clip` as a rubber band drag leaves it (the overlay draws it so while the drag runs). */
export function bandEditedClip(clip: MediaClip, edit: BandEdit): MediaClip {
  if (edit.kind === "gain") return { ...clip, volume: { ...clip.volume, gainDb: clampGain(edit.gainDb) } };
  const keys = volumeKeys(clip);
  const moving = new Set(edit.frames.filter((frame) => keys.some((key) => key.frame === frame)));
  if (moving.size === 0) return clip;
  const shift = moving.size === 1 ? clampKeyShift(clip, keys, [...moving][0] as Frame, edit.deltaFrames) : 0;
  const next = keys.map((key) => (moving.has(key.frame) ? { ...key, frame: key.frame + shift, value: clampGain(key.value + edit.deltaDb) } : key));
  const edited: MediaClip = { ...clip };
  const keyframes = withKeys(clip.keyframes, PROP, next);
  if (keyframes) edited.keyframes = keyframes;
  else delete edited.keyframes;
  return edited;
}

/** The result of a rubber band drag on `clipId` as one command, or null when nothing changes. */
export function bandEdit(project: Project, clipId: ClipId, edit: BandEdit): Command | null {
  const clip = project.clips[clipId];
  if (!isAudioClip(clip) || isClipLocked(project, clipId)) return null;
  if (edit.kind === "gain") return setGains(project, new Map([[clipId, edit.gainDb]]), { label: "Change volume" });
  const keys = volumeKeys(clip);
  const next = volumeKeys(bandEditedClip(clip, edit));
  if (next.length === keys.length && next.every((key, i) => key.frame === keys[i]?.frame && key.value === keys[i]?.value)) return null;
  const count = edit.frames.filter((frame) => keys.some((key) => key.frame === frame)).length;
  return gainCommand("keyframe.volume", plural(count, "Move volume keyframe", "Move volume keyframes"), [{ id: clipId, keyframes: withKeys(clip.keyframes, PROP, next) }]);
}

// --- Auto-duck ----------------------------------------------------------------------------------------

export interface DuckOptions {
  depthDb: number;
  rampFrames: Frame;
}

/** Timeline frame spans [start, end) where audio plays on the audible audio tracks above `track` (closer to the divider). */
export function voiceSpans(project: Project, track: Track, from: Frame, to: Frame): { start: Frame; end: Frame }[] {
  const spans: { start: Frame; end: Frame }[] = [];
  for (const other of project.tracks) {
    if (other.id === track.id) break;
    if (other.kind !== "audio" || other.muted) continue;
    for (const clip of clipsInRange(project, other.id, from, to)) {
      if (!isAudioClip(clip) || !clip.enabled || clip.volume.muted || clip.speed <= 0) continue;
      spans.push({ start: Math.max(from, clip.start), end: Math.min(to, clip.start + clip.duration) });
    }
  }
  return spans.sort((a, b) => a.start - b.start);
}

/** The dips (clip-relative frames) of a music clip: the voice spans, joined when closer than two ramps. */
export function duckDips(project: Project, clip: MediaClip, rampFrames: Frame): { start: Frame; end: Frame }[] {
  const track = project.tracks.find((candidate) => candidate.id === clip.trackId);
  if (!track) return [];
  const dips: { start: Frame; end: Frame }[] = [];
  for (const span of voiceSpans(project, track, clip.start, clip.start + clip.duration)) {
    const start = span.start - clip.start;
    const end = span.end - clip.start;
    const last = dips[dips.length - 1];
    if (last && start - last.end <= 2 * rampFrames) last.end = Math.max(last.end, end);
    else dips.push({ start, end });
  }
  return dips;
}

/** How much of the dip (0..1) applies at clip frame `rel`: ramps of `ramp` frames before each dip and after it. */
function dipAt(dips: readonly { start: Frame; end: Frame }[], ramp: Frame, rel: number): number {
  let depth = 0;
  for (const dip of dips) {
    if (rel >= dip.start && rel <= dip.end) return 1;
    if (ramp > 0 && rel > dip.start - ramp && rel < dip.start) depth = Math.max(depth, (rel - (dip.start - ramp)) / ramp);
    if (ramp > 0 && rel > dip.end && rel < dip.end + ramp) depth = Math.max(depth, 1 - (rel - dip.end) / ramp);
  }
  return depth;
}

/**
 * Auto-duck music (spec §14) on the audio clips among `ids` as one command `clip.autoDuck`; null when
 * no voice plays over them. Returns the number of dips made.
 */
export function autoDuck(project: Project, ids: readonly ClipId[], options: DuckOptions): { command: Command | null; dips: number } {
  const ramp = Math.max(0, Math.round(options.rampFrames));
  const depth = Math.max(0, options.depthDb);
  const writes: GainWrite[] = [];
  let count = 0;
  for (const id of new Set(ids)) {
    const clip = project.clips[id];
    if (!isAudioClip(clip) || isClipLocked(project, id) || depth === 0) continue;
    const dips = duckDips(project, clip, ramp);
    if (dips.length === 0) continue;
    count += dips.length;
    const last = clip.duration - 1;
    const inside = (frame: number) => Math.min(last, Math.max(0, frame));
    // The breakpoints of the dips, and the clip's own keys, each at the music's gain there minus the dip.
    const frames = new Set<Frame>(volumeKeys(clip).map((key) => key.frame));
    for (const dip of dips) for (const frame of [dip.start - ramp, dip.start, dip.end, dip.end + ramp]) frames.add(inside(frame));
    let keys: Key[] = [...volumeKeys(clip)];
    const values = new Map<Frame, number>();
    for (const frame of frames) values.set(frame, clampGain(gainDbAt(clip, frame) - depth * dipAt(dips, ramp, frame)));
    // The dips' own keys are linear (straight ramps); the clip's keys keep their eases.
    const own = new Set(volumeKeys(clip).map((key) => key.frame));
    for (const [frame, value] of [...values].sort((a, b) => a[0] - b[0])) keys = setKey(keys, frame, value, own.has(frame) ? undefined : "linear");
    writes.push({ id, keyframes: withKeys(clip.keyframes, PROP, keys) });
  }
  return { command: gainCommand("clip.autoDuck", "Auto-duck music", writes), dips: count };
}

// --- Detach audio -------------------------------------------------------------------------------------

/** Whether `clipId` is a video clip whose sound can be detached: linked audio, or media with sound and no audio clip. */
export function canDetach(project: Project, clipId: ClipId): boolean {
  const clip = project.clips[clipId];
  if (clip?.kind !== "video" || isClipLocked(project, clipId)) return false;
  if (linkedPartners(project, clipId).some((id) => project.clips[id]?.kind === "audio")) return true;
  const media = project.media[clip.mediaId];
  return media?.kind === "video" && media.hasAudio && clip.speed > 0;
}

/**
 * Detach audio (spec §11) on the video clips among `ids` as one command `clip.detachAudio`: linked audio
 * is unlinked from its video; a video with sound and no audio clip gets one (`newId` for the clip and a
 * new track). Returns the audio clips it detached or made. Null when no video clip has sound to detach.
 */
export function detachAudio(project: Project, ids: readonly ClipId[], newId: () => string): { command: Command | null; audio: ClipId[] } {
  const unlink = new Set<ClipId>();
  const created: MediaClip[] = [];
  const newTracks: Track[] = [];
  const audio: ClipId[] = [];
  const tracks = () => [...project.tracks, ...newTracks];
  const busy = new Map<TrackId, { start: Frame; end: Frame }[]>();
  const free = (track: Track, start: Frame, end: Frame) =>
    !track.locked && clipsInRange(project, track.id, start, end).length === 0 && !(busy.get(track.id) ?? []).some((span) => span.start < end && span.end > start);
  for (const id of new Set(ids)) {
    if (!canDetach(project, id)) continue;
    const video = project.clips[id] as MediaClip;
    // Its linked audio (locked or not): unlinked, unless a member of the link is locked (no edits there).
    const members = video.linkGroup === undefined ? [] : linkGroupOf(project, id);
    const partners = members.filter((other) => project.clips[other]?.kind === "audio");
    if (partners.length > 0) {
      if (members.some((member) => isClipLocked(project, member))) continue;
      for (const member of members) unlink.add(member);
      audio.push(...partners);
      continue;
    }
    const start = video.start;
    const end = video.start + video.duration;
    let track = tracks().find((candidate) => candidate.kind === "audio" && free(candidate, start, end));
    if (!track) {
      track = emptyTrack(newId(), "audio", nextTrackName(tracks(), "audio"));
      newTracks.push(track);
    }
    busy.set(track.id, [...(busy.get(track.id) ?? []), { start, end }]);
    const clip: MediaClip = {
      id: newId(),
      trackId: track.id,
      kind: "audio",
      name: video.name,
      start,
      duration: video.duration,
      enabled: true,
      mediaId: video.mediaId,
      in: video.in,
      out: video.out,
      speed: video.speed,
      transform: { x: 0, y: 0, scale: 1, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false },
      opacity: 1,
      crop: { left: 0, top: 0, right: 0, bottom: 0 },
      volume: { ...video.volume },
      fades: { in: 0, out: 0 },
    };
    created.push(clip);
    audio.push(clip.id);
  }
  if (unlink.size === 0 && created.length === 0) return { command: null, audio: [] };
  return {
    audio,
    command: {
      id: "clip.detachAudio",
      label: "Detach audio",
      affects: ["clips", "timeline", "audio", ...(newTracks.length > 0 ? (["tracks"] as const) : [])],
      run(draft) {
        for (const id of unlink) {
          const clip = draft.clips[id];
          if (clip) delete clip.linkGroup;
        }
        for (const track of newTracks) draft.tracks.push(structuredClone(track));
        for (const clip of created) {
          draft.clips[clip.id] = structuredClone(clip) as Draft<MediaClip>;
          const track = draft.tracks.find((candidate) => candidate.id === clip.trackId);
          if (!track) throw new Error(`clip.detachAudio: track ${clip.trackId} does not exist`);
          const at = track.clipIds.findIndex((other) => (draft.clips[other]?.start ?? 0) > clip.start);
          track.clipIds.splice(at === -1 ? track.clipIds.length : at, 0, clip.id);
        }
      },
    },
  };
}
