// Dev tooling for the audio checks (Batch 10). Loaded only in dev builds (`__editor.audio`).
// - `clapTest()`: a sync test timeline. A WAV of short ticks (one every `interval` seconds, each on a
//   frame start) goes on a new audio track, and a 1-frame white solid on a new video track flashes on
//   each tick's frame. While it plays, the flash's preview draw time (performance clock) is paired
//   with the tick's output time: the tick's onset is found in the mix (an analyser on the mix bus) and
//   its context time turned into the time the speakers play it (`getOutputTimestamp`). `syncReport()`
//   (also logged at each pause) gives the offsets, video minus audio, at the start and after 5 min.
// - `toneTest()`: a 1 kHz tone clip at a set level with a clip gain (the +6 dB clip-indicator check).
import { addClip, addTrack } from "../core/commands/basicCommands.js";
import type { Command } from "../core/commands/command.js";
import { emptyTrack, nextTrackName } from "../core/document/project.js";
import { frameToUs, secondsToFrames, usToFrameFloor } from "../core/document/time.js";
import type { Clip, MediaClip, MediaId, SolidClip } from "../core/document/types.js";
import type { RenderView } from "../core/scheduler/FrameScheduler.js";
import { showToast } from "../ui/toasts.js";
import { audioScheduler } from "./audioController.js";
import { importMediaFiles } from "./mediaController.js";
import { playbackEngine } from "./previewController.js";
import { audioClock, documentStore, scheduler, sessionStore } from "./services.js";

const RATE = 48_000;
const IDENTITY = { x: 0, y: 0, scale: 1, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false };

/** 16-bit PCM mono WAV. */
export function wavFile(samples: Float32Array, sampleRate = RATE): Blob {
  const data = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const text = (at: number, value: string) => [...value].forEach((char, i) => data.setUint8(at + i, char.charCodeAt(0)));
  text(0, "RIFF");
  data.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true);
  data.setUint16(22, 1, true);
  data.setUint32(24, sampleRate, true);
  data.setUint32(28, sampleRate * 2, true);
  data.setUint16(32, 2, true);
  data.setUint16(34, 16, true);
  text(36, "data");
  data.setUint32(40, samples.length * 2, true);
  samples.forEach((value, i) => data.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, value)) * 32767), true));
  return new Blob([data.buffer], { type: "audio/wav" });
}

/** Imports a generated file and returns its media id. */
async function importGenerated(name: string, blob: Blob): Promise<MediaId> {
  const before = new Set(Object.keys(documentStore.getState().media));
  await importMediaFiles([new File([blob], name, { type: blob.type, lastModified: Date.now() })]);
  const added = Object.values(documentStore.getState().media).find((item) => !before.has(item.id) && item.name === name);
  if (!added) throw new Error(`${name} was not imported`);
  return added.id;
}

function audioClip(fields: Pick<MediaClip, "id" | "trackId" | "name" | "start" | "duration" | "mediaId" | "out"> & { gainDb?: number }): MediaClip {
  const { gainDb = 0, ...rest } = fields;
  return { ...rest, kind: "audio", enabled: true, in: 0, speed: 1, transform: IDENTITY, opacity: 1, crop: { left: 0, top: 0, right: 0, bottom: 0 }, volume: { gainDb, muted: false }, fades: { in: 0, out: 0 } };
}

function bulkAdd(clips: readonly Clip[]): Command {
  return {
    id: "dev.clapTest",
    label: "Clap test",
    affects: ["clips", "timeline"],
    run(draft) {
      for (const clip of clips) {
        draft.clips[clip.id] = structuredClone(clip);
        draft.tracks.find((track) => track.id === clip.trackId)?.clipIds.push(clip.id);
      }
    },
  };
}

interface Clap {
  /** Flash frames, in order. */
  frames: number[];
  /** Flash frame -> preview draw time (performance ms). */
  video: Map<number, number>;
  /** Tick onsets heard (performance ms). */
  audio: number[];
  intervalMs: number;
  stop: () => void;
}

let clap: Clap | null = null;

/** Builds the clap test timeline (one undo step after the import) and measures every playback of it. */
export async function clapTest(options: { seconds?: number; interval?: number } = {}): Promise<{ claps: number }> {
  const seconds = options.seconds ?? 330;
  const interval = options.interval ?? 1;
  const project = documentStore.getState();
  const { fps } = project.settings;
  const step = Math.max(1, secondsToFrames(interval, fps));
  const total = secondsToFrames(seconds, fps);
  const frames: number[] = [];
  // The first clap comes one interval in: a flash on frame 0 would already be on screen before play.
  for (let frame = step; frame < total; frame += step) frames.push(frame);
  // Ticks: 10 ms of a 1 kHz square at 0.8 on each flash frame's start.
  const samples = new Float32Array(Math.ceil((frameToUs(total, fps) / 1e6) * RATE) + RATE);
  const burst = Math.round(0.01 * RATE);
  for (const frame of frames) {
    const at = Math.round((frameToUs(frame, fps) / 1e6) * RATE);
    for (let i = 0; i < burst && at + i < samples.length; i++) samples[at + i] = Math.floor((i / RATE) * 2000) % 2 === 0 ? 0.8 : -0.8;
  }
  const mediaId = await importGenerated("clap-test.wav", wavFile(samples));
  const now = documentStore.getState();
  const media = now.media[mediaId];
  if (!media) throw new Error("clap-test.wav is gone");
  const video = emptyTrack(crypto.randomUUID(), "video", nextTrackName(now.tracks, "video"));
  const audio = emptyTrack(crypto.randomUUID(), "audio", nextTrackName(now.tracks, "audio"));
  const duration = Math.min(total, usToFrameFloor(media.durationUs, fps));
  const flashes: SolidClip[] = frames.map((frame, i) => ({
    id: crypto.randomUUID(),
    kind: "solid",
    trackId: video.id,
    name: `Flash ${i}`,
    start: frame,
    duration: 1,
    enabled: true,
    fill: { r: 1, g: 1, b: 1, a: 1 },
    shape: "rect",
    size: { w: now.settings.width, h: now.settings.height },
    cornerRadius: 0,
    transform: IDENTITY,
    opacity: 1,
  }));
  const tick = audioClip({ id: crypto.randomUUID(), trackId: audio.id, name: "Clap ticks", start: 0, duration, mediaId, out: Math.min(media.durationUs, frameToUs(duration, fps)) });
  documentStore.transaction("Clap test", () => {
    documentStore.dispatch(addTrack(video));
    documentStore.dispatch(addTrack(audio));
    documentStore.dispatch(bulkAdd([...flashes, tick]));
  });
  measure(frames, interval * 1000);
  return { claps: frames.length };
}

function measure(frames: number[], intervalMs: number): void {
  clap?.stop();
  const flashFrames = new Set(frames);
  const video = new Map<number, number>();
  const audio: number[] = [];
  const probe: RenderView = {
    render: () => {
      const { playhead } = sessionStore.state.getState();
      if (playbackEngine.playing && playbackEngine.speed === 1 && flashFrames.has(playhead) && !video.has(playhead)) video.set(playhead, performance.now());
    },
  };
  let analyser: AnalyserNode | null = null;
  let buffer = new Float32Array(0);
  let lastOnset = -Infinity;
  const ticker = () => {
    const ctx = audioClock.context as unknown as AudioContext | null;
    const bus = (globalThis as { __editor?: { audio?: { mixer?: { bus: AudioNode } | null } } }).__editor?.audio?.mixer?.bus;
    if (!ctx || ctx.state !== "running" || !bus || !audioScheduler.active) return;
    if (!analyser || analyser.context !== ctx) {
      analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      bus.connect(analyser);
      buffer = new Float32Array(analyser.fftSize);
    }
    const currentTime = ctx.currentTime;
    analyser.getFloatTimeDomainData(buffer);
    const stamp = ctx.getOutputTimestamp();
    for (let i = 1; i < buffer.length; i++) {
      if (Math.abs(buffer[i] as number) < 0.4 || Math.abs(buffer[i - 1] as number) > 0.2) continue;
      const onset = currentTime - (buffer.length - i) / ctx.sampleRate;
      if (onset <= lastOnset + intervalMs / 2000) continue;
      lastOnset = onset;
      if (stamp.contextTime !== undefined && stamp.performanceTime !== undefined) audio.push(stamp.performanceTime + (onset - stamp.contextTime) * 1000);
    }
  };
  let wasPlaying = false;
  const stops = [
    scheduler.register("preview", probe),
    scheduler.addTicker(ticker),
    playbackEngine.subscribe(() => {
      if (wasPlaying && !playbackEngine.playing) syncReport();
      wasPlaying = playbackEngine.playing;
    }),
  ];
  clap = {
    frames,
    video,
    audio,
    intervalMs,
    stop: () => {
      for (const stop of stops) stop();
      analyser?.disconnect();
    },
  };
}

export interface SyncReport {
  frameMs: number;
  pairs: { frame: number; offsetMs: number }[];
  start: { claps: number; maxAbsMs: number; meanMs: number };
  after5min: { claps: number; maxAbsMs: number; meanMs: number };
}

/** Pairs each flash draw with the nearest tick heard: video minus audio, ms. */
export function syncReport(): SyncReport | null {
  const run = clap;
  if (!run) return null;
  const { fps } = documentStore.getState().settings;
  const pairs: SyncReport["pairs"] = [];
  for (const [frame, drawn] of run.video) {
    let best: number | null = null;
    for (const heard of run.audio) if (Math.abs(drawn - heard) < run.intervalMs / 2 && (best === null || Math.abs(drawn - heard) < Math.abs(drawn - best))) best = heard;
    if (best !== null) pairs.push({ frame, offsetMs: drawn - best });
  }
  pairs.sort((a, b) => a.frame - b.frame);
  const summary = (list: typeof pairs) => ({
    claps: list.length,
    maxAbsMs: list.reduce((max, pair) => Math.max(max, Math.abs(pair.offsetMs)), 0),
    meanMs: list.length > 0 ? list.reduce((sum, pair) => sum + pair.offsetMs, 0) / list.length : 0,
  });
  const fiveMinutes = secondsToFrames(300, fps);
  const report: SyncReport = {
    frameMs: 1000 / (fps.num / fps.den),
    pairs,
    start: summary(pairs.filter((pair) => pair.frame < secondsToFrames(10, fps))),
    after5min: summary(pairs.filter((pair) => pair.frame >= fiveMinutes)),
  };
  console.info("[clap] video - audio offsets (ms)", report.start, report.after5min);
  showToast({
    tone: "info",
    message: `Clap test: ${pairs.length} claps`,
    detail: `start max ${report.start.maxAbsMs.toFixed(1)} ms · after 5 min max ${report.after5min.maxAbsMs.toFixed(1)} ms · 1 frame = ${report.frameMs.toFixed(1)} ms`,
  });
  return report;
}

/** A 1 kHz tone at `levelDb` dBFS on a new audio track at the playhead, with `gainDb` of clip gain. */
export async function toneTest(options: { gainDb?: number; levelDb?: number; seconds?: number } = {}): Promise<string> {
  const { gainDb = 6, levelDb = -3, seconds = 10 } = options;
  const amplitude = 10 ** (levelDb / 20);
  const samples = Float32Array.from({ length: seconds * RATE }, (_, i) => amplitude * Math.sin((2 * Math.PI * 1000 * i) / RATE));
  const mediaId = await importGenerated(`tone ${levelDb} dBFS.wav`, wavFile(samples));
  const project = documentStore.getState();
  const media = project.media[mediaId];
  if (!media) throw new Error("the tone is gone");
  const { fps } = project.settings;
  const track = emptyTrack(crypto.randomUUID(), "audio", nextTrackName(project.tracks, "audio"));
  const duration = usToFrameFloor(media.durationUs, fps);
  const clip = audioClip({ id: crypto.randomUUID(), trackId: track.id, name: `Tone ${gainDb >= 0 ? "+" : ""}${gainDb} dB`, start: sessionStore.state.getState().playhead, duration, mediaId, out: Math.min(media.durationUs, frameToUs(duration, fps)), gainDb });
  documentStore.transaction("Tone test", () => {
    documentStore.dispatch(addTrack(track));
    documentStore.dispatch(addClip(clip));
  });
  return clip.id;
}
