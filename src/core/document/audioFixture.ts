// The project and media of fixtures/interop/audio (Batch 77, spec §21.21), 360 x 640 at 30 fps:
// - media/mix.wav: 4 s, stereo, 48 kHz, 16 bit; a 997 Hz tone with a sharp click every second, scaled to
//   -20.0 LUFS integrated (the file the export test normalizes to -14 LUFS with a true peak under -1 dBTP).
// - media/click.wav: 6 s, mono, 48 kHz, 16 bit; a 120 BPM click track, one 5 ms 1 kHz burst every 0.5 s from
//   t = 0 (detect beats puts a marker every 15 frames).
// The project: A1 "Mix" (gain 0, pan 0) with mix.wav; A2 "Click" (gain -6 dB, pan -1) with click.wav at
// clip pan -0.5 and an exponential fade in; project loudness -14 LUFS / -1 dBTP; the beat markers of the click.
// Shared by the fixture test and the writer
// (`WRITE_AUDIO_FIXTURE=1 npx vitest run --project unit src/core/document/audioFixture.test.ts`).
import { measureLoudness } from "../../audio/dsp/loudness.js";
import { makeMedia, makeMediaClip } from "./fixtures.js";
import { createProject, emptyTrack } from "./project.js";
import { frameToUs } from "./time.js";
import type { Clip, MediaItem, Project } from "./types.js";

export const AUDIO_FIXTURE_RATE = 48000;
export const MIX_SECONDS = 4;
export const CLICK_SECONDS = 6;
export const CLICK_BPM = 120;
export const MIX_LUFS = -20;

/** Little-endian 16-bit PCM WAV bytes of `channels` (equal length, -1..1). */
export function wavBytes(channels: readonly Float32Array[], sampleRate: number): Uint8Array {
  const count = channels.length;
  const frames = (channels[0] as Float32Array).length;
  const bytes = new Uint8Array(44 + frames * count * 2);
  const view = new DataView(bytes.buffer);
  const text = (at: number, value: string) => [...value].forEach((ch, i) => view.setUint8(at + i, ch.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, count, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * count * 2, true);
  view.setUint16(32, count * 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, frames * count * 2, true);
  for (let n = 0; n < frames; n++) {
    for (let c = 0; c < count; c++) {
      const v = Math.max(-1, Math.min(1, (channels[c] as Float32Array)[n] as number));
      view.setInt16(44 + (n * count + c) * 2, Math.round(v * 32767), true);
    }
  }
  return bytes;
}

/** The samples of mix.wav (two equal channels), already 16-bit quantized values. */
export function mixChannels(): Float32Array[] {
  const length = MIX_SECONDS * AUDIO_FIXTURE_RATE;
  const raw = new Float32Array(length);
  for (let n = 0; n < length; n++) {
    raw[n] = 0.1 * Math.sin((2 * Math.PI * 997 * n) / AUDIO_FIXTURE_RATE);
    if (n % AUDIO_FIXTURE_RATE === 0) raw[n] = (raw[n] as number) + 0.5;
  }
  const measured = measureLoudness([raw, raw], AUDIO_FIXTURE_RATE).integrated;
  const gain = 10 ** ((MIX_LUFS - measured) / 20);
  const scaled = raw.map((v) => Math.round(v * gain * 32767) / 32767);
  return [scaled, scaled];
}

/** The samples of click.wav (mono). */
export function clickChannels(): Float32Array[] {
  const length = CLICK_SECONDS * AUDIO_FIXTURE_RATE;
  const data = new Float32Array(length);
  const interval = (60 / CLICK_BPM) * AUDIO_FIXTURE_RATE;
  const burst = Math.round(0.005 * AUDIO_FIXTURE_RATE);
  for (let beat = 0; beat * interval < length; beat++) {
    const at = Math.round(beat * interval);
    for (let i = 0; i < burst && at + i < length; i++) data[at + i] = 0.8 * (1 - i / burst) * Math.sin((2 * Math.PI * 1000 * i) / AUDIO_FIXTURE_RATE);
  }
  return [data];
}

/** The frames of the click's beats at 30 fps. */
export const CLICK_BEAT_FRAMES: readonly number[] = Array.from({ length: CLICK_SECONDS * 2 }, (_, i) => i * 15);

export function buildAudioFixture(): Project {
  const project = createProject({ id: "a8d1c6e4-3f57-4b09-9c2e-6a0b7d4e1f83", name: "Interop audio", now: "2026-11-09T12:00:00.000Z", appVersion: "1.1.0" });
  project.settings = { ...project.settings, width: 360, height: 640, loudness: { targetLufs: -14, truePeakDb: -1 } };
  project.meta.generator = { name: "interop-fixture", version: "1", source: "fixtures/interop/audio (Batch 77)" };
  project.tracks = [
    emptyTrack("a1", "audio", "Mix"),
    { ...emptyTrack("a2", "audio", "Click"), gainDb: -6, pan: -1 },
  ];
  const added = "2026-11-09T12:00:00.000Z";
  const wav = (id: string, name: string, seconds: number, size: number): MediaItem => ({ ...makeMedia(id, "audio", seconds * 1_000_000), name, file: { relPath: `media/${name}` }, audioCodec: "pcm", size, addedAt: added });
  project.media.mix = wav("mix", "mix.wav", MIX_SECONDS, 44 + MIX_SECONDS * AUDIO_FIXTURE_RATE * 4);
  project.media.click = wav("click", "click.wav", CLICK_SECONDS, 44 + CLICK_SECONDS * AUDIO_FIXTURE_RATE * 2);
  const fps = project.settings.fps;
  const add = (clip: Clip) => {
    project.clips[clip.id] = clip;
    project.tracks.find((t) => t.id === clip.trackId)?.clipIds.push(clip.id);
  };
  add({ ...makeMediaClip(project, { id: "mix-clip", trackId: "a1", start: 0, duration: MIX_SECONDS * 30, mediaId: "mix", kind: "audio" }), in: 0, out: frameToUs(MIX_SECONDS * 30, fps) });
  const click = makeMediaClip(project, { id: "click-clip", trackId: "a2", start: 0, duration: CLICK_SECONDS * 30, mediaId: "click", kind: "audio" });
  add({ ...click, in: 0, out: frameToUs(CLICK_SECONDS * 30, fps), volume: { gainDb: 0, muted: false, pan: -0.5 }, fades: { in: 9, out: 0, curve: "exponential" } });
  project.markers = CLICK_BEAT_FRAMES.map((frame, i) => ({ id: `beat-${i}`, frame, color: "teal", label: "Beat" }));
  return project;
}
