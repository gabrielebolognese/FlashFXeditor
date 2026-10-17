// Audio scrub (spec §8 "plays 40 ms grains at the scrub position from the decoded audio buffers, pitched
// 1x, so cuts can be found by ear"; §6.1 the Audio scrub toggle; Batch 37). Framework-free; the audio
// controller calls `grain` for each frame a ruler scrub or a frame step shows while the toggle is on.
// - A grain: for every audio clip heard at the frame (mixdown.ts `heardClips`: enabled, audible tracks),
//   GRAIN_SECONDS of its decoded audio from the frame's media time, at the clip's speed (what playback
//   sounds like there), through the playback graph's track inputs (mute and solo apply, the meters see
//   it), at the clip's level there (gain, volume keys, fades). Its envelope rises and falls over
//   GRAIN_RAMP_SECONDS, so it starts and ends at silence: no clicks at any position.
// - A new grain takes over: grains still sounding fade out over the ramp, so fast scrubs never pile up.
//   The fade is on a node of its own after the envelope (its first automation), so nothing scheduled
//   is cancelled: cancelling a ramp in progress would jump (Web Audio drops it whole).
// - Only audio already in memory plays; a missing segment is asked for (the next grains have it).
import { fpsToNumber } from "../../core/document/time.js";
import type { Frame, MediaClip, Project } from "../../core/document/types.js";
import type { AudioMixer } from "../AudioMixer.js";
import type { DecodedAudio } from "../decode/DecodedAudio.js";
import { segmentAt, segmentStartSeconds } from "../decode/segments.js";
import { heardClips } from "../mixdown.js";
import { audioLimits, clipGain } from "../scheduler/AudioScheduler.js";
import { automationAt } from "../scheduler/envelope.js";

/** A grain's length (spec §8: 40 ms). */
export const GRAIN_SECONDS = 0.04;
/** Its rise and fall ("a tiny envelope"). */
export const GRAIN_RAMP_SECONDS = 0.004;
/**
 * A grain starts this far ahead of the render clock: the context renders in callback-sized blocks
 * (up to ~21 ms at 48 kHz) ahead of `currentTime`, and a source started in a block already rendered
 * would begin late, after its envelope's rise (a click).
 */
export const GRAIN_LEAD_SECONDS = 0.03;

export interface AudioScrubberDeps {
  /** The running graph; null before the AudioContext runs. */
  mixer(): AudioMixer | null;
  audio: Pick<DecodedAudio, "layout" | "segment" | "request" | "open" | "hasFailed">;
}

interface Grain {
  source: AudioBufferSourceNode;
  gain: GainNode;
  /** The take-over fade (1 until a new grain starts). */
  release: GainNode;
  /** Context times. */
  start: number;
  end: number;
  level: number;
}

export class AudioScrubber {
  readonly stats = { grains: 0, voices: 0 };
  private grains: Grain[] = [];

  constructor(private readonly deps: AudioScrubberDeps) {}

  /** Plays a grain of the timeline's audio at `frame`; returns how many clips it sounds. */
  grain(project: Project, frame: Frame): number {
    const mixer = this.deps.mixer();
    if (!mixer) return 0;
    const ctx = mixer.context;
    const at = ctx.currentTime + GRAIN_LEAD_SECONDS;
    this.release(at);
    mixer.updateTracks(project);
    const fps = fpsToNumber(project.settings.fps);
    const s = frame / fps;
    let started = 0;
    for (const clip of heardClips(project, frame, frame + 1)) {
      const durationUs = project.media[clip.mediaId]?.durationUs ?? clip.out;
      const media = clip.in / 1e6 + (s - clip.start / fps) * clip.speed;
      if (media < 0 || media >= durationUs / 1e6) continue;
      const level = clipGain(clip) * automationAt(clip, fps, s, audioLimits(clip, fps, durationUs));
      if (level <= 0) continue;
      const buffer = this.buffer(clip, media);
      if (!buffer) continue;
      if (buffer.offset >= buffer.buffer.duration) continue;
      this.start(mixer, clip, buffer.buffer, buffer.offset, at, level);
      started += 1;
    }
    if (started > 0) this.stats.grains += 1;
    return started;
  }

  /** Stops every grain (the project closes). */
  stop(): void {
    for (const grain of [...this.grains]) {
      try {
        grain.source.stop();
      } catch {
        // Not started or already stopped.
      }
      this.forget(grain);
    }
  }

  /** The segment holding media second `media` of the clip's audio and the offset in it, or null (asked for). */
  private buffer(clip: MediaClip, media: number): { buffer: AudioBuffer; offset: number } | null {
    const { audio } = this.deps;
    if (audio.hasFailed(clip.mediaId)) return null;
    const layout = audio.layout(clip.mediaId);
    if (!layout) {
      audio.open(clip.mediaId).catch(() => undefined);
      return null;
    }
    const index = segmentAt(layout, media);
    const buffer = audio.segment(clip.mediaId, index);
    if (!buffer) {
      audio.request(clip.mediaId, index, "playback");
      return null;
    }
    return { buffer, offset: media - segmentStartSeconds(layout, index) };
  }

  private start(mixer: AudioMixer, clip: MediaClip, buffer: AudioBuffer, offset: number, at: number, level: number): void {
    const ctx = mixer.context;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = clip.speed;
    const gain = ctx.createGain();
    const release = ctx.createGain();
    const end = at + GRAIN_SECONDS;
    // Silent before its first event too: a source starting a fraction of a sample early would play
    // its first sample at the node's default gain of 1 (a one-sample spike).
    gain.gain.value = 0;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(level, at + GRAIN_RAMP_SECONDS);
    gain.gain.setValueAtTime(level, end - GRAIN_RAMP_SECONDS);
    gain.gain.linearRampToValueAtTime(0, end);
    source.connect(gain);
    gain.connect(release);
    release.connect(mixer.trackInput(clip.trackId));
    const grain: Grain = { source, gain, release, start: at, end, level };
    source.onended = () => this.forget(grain);
    source.start(at, offset);
    source.stop(end);
    this.grains.push(grain);
    this.stats.voices = this.grains.length;
  }

  /** Grains still sounding at `at` fall to silence over the ramp (on their release node); ones not started yet are dropped. */
  private release(at: number): void {
    for (const grain of [...this.grains]) {
      if (grain.end <= at) continue;
      try {
        if (grain.start >= at) {
          grain.source.stop(grain.start);
          this.forget(grain);
          continue;
        }
        const param = grain.release.gain;
        param.setValueAtTime(1, at);
        param.linearRampToValueAtTime(0, at + GRAIN_RAMP_SECONDS);
        grain.end = Math.min(grain.end, at + GRAIN_RAMP_SECONDS);
        grain.source.stop(grain.end);
      } catch {
        this.forget(grain);
      }
    }
  }

  private forget(grain: Grain): void {
    const at = this.grains.indexOf(grain);
    if (at !== -1) this.grains.splice(at, 1);
    grain.source.onended = null;
    grain.source.disconnect();
    grain.gain.disconnect();
    grain.release.disconnect();
    this.stats.voices = this.grains.length;
  }
}
