// Export loudness (spec §21.21, Batch 77): the mixdown is measured, one gain brings it to the target
// and a true-peak limiter with 5 ms of lookahead holds the ceiling. Pure: arrays in, arrays out.
import { linearToDb, measureLoudness, pointPeak, windowBound, PEAK_SIDE } from "./loudness.js";

/** Limiter lookahead (spec §21.21: 5 ms) and release. */
export const LOOKAHEAD_SECONDS = 0.005;
export const RELEASE_SECONDS = 0.05;
/** The limiter aims this far under the ceiling (dB), for what 4x interpolation cannot see between its points. */
const SAFETY_DB = 0.1;

/**
 * A true-peak limiter: the gain each sample needs to keep the interpolated peak under `ceilingDb` (dBTP),
 * minimum-filtered over the lookahead and smoothed by a moving average of the same length, so the gain
 * has reached its value when the peak arrives; a one-pole release lets it recover (never above the
 * needed gain). Returns new channels; the input is not changed.
 */
export function limitTruePeak(channels: readonly Float32Array[], sampleRate: number, ceilingDb: number): Float32Array<ArrayBuffer>[] {
  const length = (channels[0] as Float32Array).length;
  const ceiling = 10 ** ((ceilingDb - SAFETY_DB) / 20);
  const look = Math.max(1, Math.round(LOOKAHEAD_SECONDS * sampleRate));
  // The needed gain per sample, from the interpolated peak of every channel around it.
  const padded = channels.map((channel) => {
    const p = new Float32Array(channel.length + 2 * PEAK_SIDE);
    p.set(channel, PEAK_SIDE);
    return p;
  });
  const need = new Float32Array(length).fill(1);
  for (let n = 0; n < length; n++) {
    let peak = 0;
    for (const p of padded) {
      // The interpolated points n .. n + 1 (padded index n + PEAK_SIDE), skipped when no overshoot could pass the ceiling.
      if (windowBound(p, n + PEAK_SIDE) <= Math.max(ceiling, peak)) {
        const own = Math.abs(p[n + PEAK_SIDE] as number);
        if (own > peak) peak = own;
        continue;
      }
      const a = pointPeak(p, n + PEAK_SIDE);
      if (a > peak) peak = a;
    }
    if (peak > ceiling) need[n] = ceiling / peak;
  }
  // Lookahead minimum: m[k] = min need[k .. k + look - 1] (monotonic deque).
  const min = new Float32Array(length);
  const deque: number[] = [];
  let head = 0;
  for (let k = length - 1; k >= 0; k--) {
    while (deque.length > head && (need[deque[deque.length - 1] as number] as number) >= (need[k] as number)) deque.pop();
    deque.push(k);
    while ((deque[head] as number) > k + look - 1) head++;
    min[k] = need[deque[head] as number] as number;
  }
  // Smooth: mean of m over [n - look + 1, n], then the release.
  const gain = new Float32Array(length);
  const release = 1 - Math.exp(-1 / (RELEASE_SECONDS * sampleRate));
  let sum = 0;
  let held = 1;
  for (let n = 0; n < length; n++) {
    sum += min[n] as number;
    if (n >= look) sum -= min[n - look] as number;
    // Before the window is full the missing samples count as the first minimum (a peak in the first lookahead must still be reached in time).
    const average = (sum + Math.max(0, look - (n + 1)) * (min[0] as number)) / look;
    held = Math.min(average, held + (1 - held) * release);
    gain[n] = held;
  }
  return channels.map((channel) => {
    const out = new Float32Array(length);
    for (let n = 0; n < length; n++) out[n] = (channel[n] as number) * (gain[n] as number);
    return out;
  });
}

export interface NormalizeResult {
  channels: Float32Array<ArrayBuffer>[];
  /** What was measured before: integrated LUFS and true peak. */
  before: { integrated: number; truePeakDb: number };
  /** The gain applied before limiting, dB (0 when nothing was measurable). */
  gainDb: number;
  /** The loudness and true peak of the result. */
  after: { integrated: number; truePeakDb: number };
}

/** The most the gain may rise: a silent mixdown (a noise floor) is not brought up to the target. */
const MAX_BOOST_DB = 40;

/**
 * Brings `channels` to `targetLufs` integrated with a true peak at or below `truePeakDb`: measure, one
 * gain, the limiter; when the limiter took loudness away (a peaky mix) the gain is raised by what is
 * missing and it runs again, twice at most.
 */
export function normalizeLoudness(channels: readonly Float32Array[], sampleRate: number, target: { targetLufs: number; truePeakDb: number }): NormalizeResult {
  const before = measureLoudness(channels, sampleRate);
  if (!Number.isFinite(before.integrated)) return { channels: channels.map((c) => new Float32Array(c)), before, gainDb: 0, after: before };
  let gainDb = Math.min(MAX_BOOST_DB, target.targetLufs - before.integrated);
  let out: Float32Array<ArrayBuffer>[] = [];
  let after = before;
  for (let pass = 0; pass < 3; pass++) {
    const factor = 10 ** (gainDb / 20);
    const scaled = channels.map((channel) => {
      const copy = new Float32Array(channel.length);
      for (let n = 0; n < copy.length; n++) copy[n] = (channel[n] as number) * factor;
      return copy;
    });
    out = limitTruePeak(scaled, sampleRate, target.truePeakDb);
    after = measureLoudness(out, sampleRate);
    const missing = target.targetLufs - after.integrated;
    if (missing < 0.1 || gainDb >= MAX_BOOST_DB) break;
    gainDb += missing;
  }
  return { channels: out, before, gainDb, after };
}

export { linearToDb };
