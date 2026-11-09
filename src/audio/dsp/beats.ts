// Ported from FlashFX-v2 src/core/beatDetection.ts (commit a91c675), adapted: strict TypeScript, the
// editor's frame conversion (`beatFrames`). Pure, no DOM: it runs in the analysis worker.
//
// Energy-flux onset detection: the mono signal is cut into short hops, the positive change of the RMS
// energy is the onset strength, an adaptive threshold and peak picking give onset times, and the tempo
// is the inter-onset-interval histogram folded into a musical range.
import { usToFrame } from "../../core/document/time.js";
import type { Rational } from "../../core/document/types.js";

export interface BeatDetectionResult {
  /** Onset times in seconds. */
  beats: number[];
  /** Estimated tempo in BPM (0 when undetermined). */
  bpm: number;
}

export interface BeatDetectionOptions {
  /** Analysis hop in seconds (envelope resolution). */
  hopSeconds?: number;
  /** Local-mean window (seconds) for the adaptive threshold. */
  windowSeconds?: number;
  /** Threshold = localMean * sensitivity; higher gives fewer onsets. */
  sensitivity?: number;
  /** Refractory gap (seconds) between accepted onsets (tempo ceiling). */
  minGapSeconds?: number;
}

const DEFAULTS: Required<BeatDetectionOptions> = {
  hopSeconds: 0.01,
  windowSeconds: 0.2,
  sensitivity: 1.5,
  minGapSeconds: 0.12,
};

export function detectBeats(samples: Float32Array, sampleRate: number, options: BeatDetectionOptions = {}): BeatDetectionResult {
  const opts = { ...DEFAULTS, ...options };
  if (samples.length === 0 || sampleRate <= 0) return { beats: [], bpm: 0 };

  const hop = Math.max(1, Math.floor(sampleRate * opts.hopSeconds));
  const frameCount = Math.floor(samples.length / hop);
  if (frameCount < 4) return { beats: [], bpm: 0 };

  // 1. Per-hop RMS energy envelope.
  const energy = new Float32Array(frameCount);
  for (let f = 0; f < frameCount; f++) {
    const start = f * hop;
    const end = Math.min(start + hop, samples.length);
    let sum = 0;
    for (let i = start; i < end; i++) sum += (samples[i] as number) * (samples[i] as number);
    energy[f] = Math.sqrt(sum / Math.max(1, end - start));
  }

  // 2. Energy flux: half-wave-rectified first difference (onset strength).
  // Silence before the first hop: a click at sample 0 is an onset (the FlashFX-v2 original starts at the second hop).
  const flux = new Float32Array(frameCount);
  for (let f = 0; f < frameCount; f++) {
    const d = (energy[f] as number) - (f > 0 ? (energy[f - 1] as number) : 0);
    flux[f] = d > 0 ? d : 0;
  }

  // 3. Adaptive-threshold peak picking with a refractory gap.
  const win = Math.max(1, Math.round(opts.windowSeconds / opts.hopSeconds));
  const minGapFrames = Math.max(1, Math.round(opts.minGapSeconds / opts.hopSeconds));
  const beats: number[] = [];
  let lastBeatFrame = -Infinity;
  for (let f = 0; f < frameCount - 1; f++) {
    let mean = 0;
    let count = 0;
    const lo = Math.max(0, f - win);
    const hi = Math.min(frameCount - 1, f + win);
    for (let k = lo; k <= hi; k++) {
      mean += flux[k] as number;
      count++;
    }
    mean /= Math.max(1, count);
    const thresh = mean * opts.sensitivity + 1e-6;
    const v = flux[f] as number;
    if (v > thresh && v >= (f > 0 ? (flux[f - 1] as number) : 0) && v >= (flux[f + 1] as number) && f - lastBeatFrame >= minGapFrames) {
      beats.push((f * hop) / sampleRate);
      lastBeatFrame = f;
    }
  }
  return { beats, bpm: estimateBpm(beats) };
}

/**
 * Tempo from onset times by an inter-onset-interval vote, octave-folded into [minBpm, maxBpm), pooling
 * buckets within 2 BPM, so a missed or extra onset does not change it.
 */
export function estimateBpm(beats: readonly number[], minBpm = 60, maxBpm = 200): number {
  if (beats.length < 4) return 0;
  const votes = new Map<number, number>();
  for (let i = 1; i < beats.length; i++) {
    const ioi = (beats[i] as number) - (beats[i - 1] as number);
    if (ioi <= 0) continue;
    let bpm = 60 / ioi;
    while (bpm < minBpm) bpm *= 2;
    while (bpm >= maxBpm) bpm /= 2;
    const key = Math.round(bpm);
    votes.set(key, (votes.get(key) ?? 0) + 1);
  }
  let bestBpm = 0;
  let bestScore = -1;
  for (const bpm of votes.keys()) {
    let score = 0;
    for (let d = -2; d <= 2; d++) score += votes.get(bpm + d) ?? 0;
    if (score > bestScore) {
      bestScore = score;
      bestBpm = bpm;
    }
  }
  return bestBpm;
}

/** Beat times (seconds of the source) as timeline frames of a clip: `clipStart` + (beat - in) / speed, in the clip's range only. */
export function beatFrames(beats: readonly number[], clip: { start: number; duration: number; in: number; speed: number }, fps: Rational): number[] {
  const frames: number[] = [];
  for (const beat of beats) {
    const rel = usToFrame(Math.round((beat * 1e6 - clip.in) / clip.speed), fps);
    if (rel < 0 || rel >= clip.duration) continue;
    const frame = clip.start + rel;
    if (frames[frames.length - 1] !== frame) frames.push(frame);
  }
  return frames;
}
