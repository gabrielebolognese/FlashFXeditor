// Silence detection (spec §14, Batch 38), run in analysis.worker: from a media's waveform peaks (§9.6),
// never from samples, so a 10-minute media takes a few milliseconds.
// - Media time is cut into 20 ms windows (SILENCE_WINDOW_US, from media time 0). A window's level is the
//   loudest level-0 bucket it overlaps: |min| or max over the channels, in the peaks' n/127 of full
//   scale. A bucket that straddles two windows counts in both, so sound never leaks into a silence.
//   Past the end of the audio a window is silent.
// - Windows at or below the threshold are silent; consecutive ones make a run.
// - For each source range a clip plays ([in, out) at its speed), the runs inside it become spans when
//   they last at least the minimum silence, measured in playback time (a 2x clip plays a run in half
//   the time). Each side of a span that touches sound gives up the padding (also playback time); a side
//   at the range's start or end keeps it (a clip's leading or trailing silence goes up to its edge).
// The peaks round levels up (peaks.ts: 1/127 is -42 dBFS), so every level below about -42 dBFS reads
// as one step above digital silence; thresholds there only find digital silence.
import { PEAKS_BUCKET } from "../cache/peaks.js";

export const SILENCE_WINDOW_US = 20_000;

/** The level-0 layout of a media's peaks. */
export interface PeaksInfo {
  sampleRate: number;
  /** 1 or 2. */
  channels: number;
  /** Sample frames the peaks cover. */
  frames: number;
}

export interface SilenceParams {
  /** Windows at or below this level (dBFS) are silent. */
  thresholdDb: number;
  /** Shorter silences stay (playback time). */
  minSilenceUs: number;
  /** Kept on each side of a silence next to sound (playback time). */
  paddingUs: number;
}

/** A part of the media a clip plays: media µs [fromUs, toUs) at `speed`. */
export interface SourceRange {
  fromUs: number;
  toUs: number;
  speed: number;
}

/** The loudest silent level, in the peaks' units (n/127 of full scale). */
export function thresholdLevel(thresholdDb: number): number {
  return 127 * 10 ** (thresholdDb / 20);
}

/** The level of window `w` (0..127): the loudest bucket it overlaps; 0 past the end of the audio. */
export function windowLevel(level0: Int8Array, info: PeaksInfo, w: number): number {
  const perWindow = (info.sampleRate * SILENCE_WINDOW_US) / 1e6;
  const s0 = Math.floor(w * perWindow);
  const s1 = Math.min(info.frames, Math.floor((w + 1) * perWindow));
  if (s1 <= s0) return 0;
  const stride = info.channels * 2;
  const last = Math.floor((s1 - 1) / PEAKS_BUCKET);
  let level = 0;
  for (let b = Math.floor(s0 / PEAKS_BUCKET); b <= last; b++) {
    const at = b * stride;
    for (let i = at; i < at + stride; i += 2) {
      const low = -(level0[i] ?? 0);
      const high = level0[i + 1] ?? 0;
      if (low > level) level = low;
      if (high > level) level = high;
    }
  }
  return level;
}

/**
 * The silent spans of each range (media µs, flat [start, end, start, end, ...], in order): runs of
 * silent windows lasting at least the minimum silence, shrunk by the padding where they touch sound.
 */
export function silenceSpans(level0: Int8Array, info: PeaksInfo, params: SilenceParams, ranges: readonly SourceRange[]): number[][] {
  const limit = thresholdLevel(params.thresholdDb);
  return ranges.map(({ fromUs, toUs, speed }) => {
    const spans: number[] = [];
    if (!(toUs > fromUs) || !(speed > 0) || info.sampleRate <= 0) return spans;
    const minimum = params.minSilenceUs * speed;
    const padding = params.paddingUs * speed;
    const close = (startUs: number, endUs: number) => {
      const atStart = startUs <= fromUs;
      const atEnd = endUs >= toUs;
      const start = Math.max(startUs, fromUs);
      const end = Math.min(endUs, toUs);
      if (end - start < minimum) return;
      const a = atStart ? fromUs : start + padding;
      const b = atEnd ? toUs : end - padding;
      if (b > a) spans.push(a, b);
    };
    const w1 = Math.ceil(toUs / SILENCE_WINDOW_US);
    let run = -1;
    for (let w = Math.floor(fromUs / SILENCE_WINDOW_US); w < w1; w++) {
      if (windowLevel(level0, info, w) <= limit) {
        if (run < 0) run = w;
      } else if (run >= 0) {
        close(run * SILENCE_WINDOW_US, w * SILENCE_WINDOW_US);
        run = -1;
      }
    }
    if (run >= 0) close(run * SILENCE_WINDOW_US, w1 * SILENCE_WINDOW_US);
    return spans;
  });
}
