// The offline mixdown (spec §14): the timeline's audio mix of a frame range, rendered by the playback
// code itself (AudioScheduler voices -> AudioMixer track gains, mute and solo -> mix bus) against an
// OfflineAudioContext instead of the live one, so what is rendered is what is heard. Transcription
// (spec §10.6) renders it at 48 kHz mono, the export (§16, Batch 43) at 48 kHz stereo.
// - The audio of every clip heard in the range is loaded first and held here while rendering, so the
//   512 MB LRU cannot drop a segment before it is scheduled. Media whose audio cannot be decoded are
//   left out (as in playback).
// - A stand-in clock steps the scheduler through the range, STEP_SECONDS apart; each step schedules
//   the voices starting within AHEAD_SECONDS, exactly as during playback. Context times run LEAD
//   seconds ahead of the clock, so no voice starts late (with a fade-in); the lead is cut off after.
// - The master volume knob is monitoring only (spec §14): the monitor gain stays at 1.
import { fpsToNumber } from "../core/document/time.js";
import type { Clip, Frame, MediaClip, Project } from "../core/document/types.js";
import { AudioMixer, audibleTracks, type AudioGraphContext } from "./AudioMixer.js";
import type { DecodedAudio } from "./decode/DecodedAudio.js";
import { segmentsIn } from "./decode/segments.js";
import { AudioScheduler, playingClips, STEP_SECONDS, type PlayMapping } from "./scheduler/AudioScheduler.js";
import { extendedEnd, extendedStart } from "../core/document/transitions.js";

/** Context time ahead of the stand-in clock (s). */
const LEAD = 0.05;

/** The OfflineAudioContext parts the mixdown uses (tests use fakes). */
export interface OfflineGraphContext extends AudioGraphContext {
  startRendering(): Promise<AudioBuffer>;
}

export interface MixdownDeps {
  audio: Pick<DecodedAudio, "open" | "load" | "layout" | "hasFailed">;
  createContext(options: { numberOfChannels: number; length: number; sampleRate: number }): OfflineGraphContext;
}

export interface MixdownOptions {
  sampleRate: number;
  channels: 1 | 2;
  signal?: AbortSignal;
}

export interface Mixdown {
  sampleRate: number;
  /** One plane per channel, (end - start) / fps seconds long. */
  channels: Float32Array<ArrayBuffer>[];
}

// As the scheduler: speed 0 is a video freeze frame only (Batch 27).
const isHeard = (clip: Clip): clip is MediaClip => clip.kind === "audio" && clip.enabled && clip.speed > 0;

/** The audio clips heard in [start, end): enabled, on audible tracks (mute, solo), with the partners of their crossfades (Batch 36). */
export function heardClips(project: Project, start: Frame, end: Frame): MediaClip[] {
  const audible = audibleTracks(project);
  const clips: MediaClip[] = [];
  for (const track of project.tracks) {
    if (track.kind !== "audio" || audible.get(track.id) !== true) continue;
    for (const clip of playingClips(project, track, start, end)) if (isHeard(clip) && extendedEnd(clip) > start && extendedStart(clip) < end) clips.push(clip);
  }
  return clips;
}

const keyOf = (mediaId: string, segment: number) => `${mediaId}#${segment}`;

/**
 * The mix of frames [start, end) of `project`, or null when no audio is heard there (no clip, every
 * track muted, no decodable audio). Rejects with the signal's reason when it is aborted.
 */
export async function renderMixdown(project: Project, range: { start: Frame; end: Frame }, options: MixdownOptions, deps: MixdownDeps): Promise<Mixdown | null> {
  const { signal } = options;
  const fps = fpsToNumber(project.settings.fps);
  const clips = heardClips(project, range.start, range.end);
  // Load what the range plays, segment by segment.
  const held = new Map<string, AudioBuffer>();
  for (const clip of clips) {
    signal?.throwIfAborted();
    let layout;
    try {
      layout = await deps.audio.open(clip.mediaId);
    } catch {
      continue;
    }
    const clipStart = clip.start / fps;
    // Past its edges under a crossfade (its handles).
    const from = Math.max(0, clip.in / 1e6 + (Math.max(extendedStart(clip), range.start) / fps - clipStart) * clip.speed);
    const to = clip.in / 1e6 + (Math.min(extendedEnd(clip), range.end) / fps - clipStart) * clip.speed;
    for (const segment of segmentsIn(layout, from, to)) {
      if (held.has(keyOf(clip.mediaId, segment))) continue;
      try {
        held.set(keyOf(clip.mediaId, segment), (await deps.audio.load(clip.mediaId, segment, "background")).buffer);
      } catch {
        break;
      }
    }
  }
  signal?.throwIfAborted();
  if (held.size === 0) return null;

  const seconds = (range.end - range.start) / fps;
  const lead = Math.round(LEAD * options.sampleRate);
  const length = Math.ceil(seconds * options.sampleRate);
  const ctx = deps.createContext({ numberOfChannels: options.channels, length: lead + length, sampleRate: options.sampleRate });
  const mixer = new AudioMixer(ctx);
  let now = 0;
  const scheduler = new AudioScheduler({
    clock: { now: () => now, epoch: 0, contextTime: (clockTime) => clockTime + LEAD, renderLead: () => 0 },
    mixer: () => mixer,
    document: { getState: () => project, subscribe: () => () => undefined },
    audio: {
      layout: (mediaId) => deps.audio.layout(mediaId),
      segment: (mediaId, index) => held.get(keyOf(mediaId, index)) ?? null,
      request: () => undefined,
      open: (mediaId) => deps.audio.open(mediaId),
      hasFailed: (mediaId) => deps.audio.hasFailed(mediaId),
    },
  });
  const mapping: PlayMapping = { frame: range.start, clock: 0, speed: 1, start: range.start, end: range.end, loop: false, fps: project.settings.fps };
  // Every step covers [now, now + AHEAD_SECONDS); a step a hair over STEP_SECONDS is never skipped.
  for (now = 0; now <= seconds; now += STEP_SECONDS * 1.001) scheduler.sync(mapping);
  const rendered = await ctx.startRendering();
  mixer.dispose();
  signal?.throwIfAborted();
  const channels: Float32Array<ArrayBuffer>[] = [];
  for (let c = 0; c < options.channels; c++) {
    const plane = new Float32Array(length);
    plane.set(rendered.getChannelData(Math.min(c, rendered.numberOfChannels - 1)).subarray(lead, lead + length));
    channels.push(plane);
  }
  return { sampleRate: options.sampleRate, channels };
}
