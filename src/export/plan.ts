// The frames and samples of an export (spec §16, §5.1, P4). Integer arithmetic throughout, so 29.97
// exports never drift:
// - Exported frame k shows project frame `start + floor(k * projectFps / exportFps)` (presets.ts makes
//   the export rate divide the project's: a whole step) at `frameToUs(k, exportFps)` (integer us).
// - The video lasts `frameToUs(frames, exportFps)`; the audio has as many samples as fit in it at the
//   mix rate (rounded), so both tracks end together.
// - A keyframe is forced every `keyInterval` frames (spec §16: at most `keyframeSeconds` apart).
import { frameToUs } from "../core/document/time.js";
import type { Frame, Rational } from "../core/document/types.js";

export interface ExportPlan {
  /** The project frames exported, [start, end). */
  start: Frame;
  end: Frame;
  projectFps: Rational;
  fps: Rational;
  /** Exported frames. */
  frames: number;
  /** Frames between forced keyframes. */
  keyInterval: number;
  sampleRate: number;
  /** Audio sample frames (per channel) of the export. */
  samples: number;
}

function ceilDiv(n: number, d: number): number {
  return Math.floor((n + d - 1) / d);
}

export function exportPlan(range: { start: Frame; end: Frame }, projectFps: Rational, fps: Rational, keyframeSeconds: number, sampleRate: number): ExportPlan {
  const length = Math.max(0, range.end - range.start);
  // length / projectFps seconds at fps, rounded up: the last frame shows the range's last frames.
  const frames = ceilDiv(length * fps.num * projectFps.den, fps.den * projectFps.num);
  const keyInterval = Math.max(1, Math.floor((keyframeSeconds * fps.num) / fps.den));
  const samples = Math.round((frames * fps.den * sampleRate) / fps.num);
  return { start: range.start, end: range.end, projectFps, fps, frames, keyInterval, sampleRate, samples };
}

/** The project frame exported frame `k` shows. */
export function projectFrameAt(plan: ExportPlan, k: number): Frame {
  const { projectFps, fps } = plan;
  return plan.start + Math.floor((k * projectFps.num * fps.den) / (projectFps.den * fps.num));
}

/** Exported frame `k`'s timestamp (us). */
export function frameTimestampUs(plan: ExportPlan, k: number): number {
  return frameToUs(k, plan.fps);
}

/** Exported frame `k`'s duration (us): to the next frame's timestamp. */
export function frameDurationUs(plan: ExportPlan, k: number): number {
  return frameToUs(k + 1, plan.fps) - frameToUs(k, plan.fps);
}

export function isKeyFrame(plan: ExportPlan, k: number): boolean {
  return k % plan.keyInterval === 0;
}

/** Audio samples from the start to the end of exported frame `k` (the audio fed before frame k + 1). */
export function samplesThrough(plan: ExportPlan, k: number): number {
  return Math.min(plan.samples, Math.round(((k + 1) * plan.fps.den * plan.sampleRate) / plan.fps.num));
}

/** Sample `n`'s timestamp (us). */
export function sampleTimestampUs(n: number, sampleRate: number): number {
  return Math.round((n * 1_000_000) / sampleRate);
}

/** Sample frames per encoded audio chunk: AAC frames hold 1024, Opus 20 ms. */
export function audioChunkSamples(codec: "aac" | "opus", sampleRate: number): number {
  return codec === "aac" ? 1024 : Math.round(sampleRate / 50);
}

/**
 * The most chunks the muxer may receive (it reserves room for their tables at the front of the file):
 * one per frame, and the audio's packets plus a few an encoder may add when it flushes.
 */
export function expectedChunks(plan: ExportPlan, audio: "aac" | "opus" | null): { video: number; audio: number } {
  return { video: plan.frames, audio: audio ? ceilDiv(plan.samples, audioChunkSamples(audio, plan.sampleRate)) + 8 : 0 };
}

/** A timescale for the video track: a whole number of ticks per frame, at least 90 kHz (whole us timestamps round onto ticks exactly). */
export function videoTimescale(fps: Rational): number {
  return fps.num * Math.ceil(90_000 / fps.num);
}
