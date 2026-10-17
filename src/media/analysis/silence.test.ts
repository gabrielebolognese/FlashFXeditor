import { describe, expect, it } from "vitest";
import { PEAKS_BUCKET, peaksLevel0 } from "../cache/peaks.js";
import { SILENCE_WINDOW_US, silenceSpans, thresholdLevel, windowLevel, type PeaksInfo, type SilenceParams } from "./silence.js";

const RATE = 48_000;
/** Sample frames per 20 ms window at 48 kHz. */
const WINDOW = (RATE * SILENCE_WINDOW_US) / 1e6;

/** Mono PCM at 48 kHz: `sections` of [seconds, amplitude] (a square-ish tone at that peak). */
function pcm(sections: readonly (readonly [number, number])[]): Float32Array {
  const total = sections.reduce((n, [seconds]) => n + Math.round(seconds * RATE), 0);
  const out = new Float32Array(total);
  let at = 0;
  for (const [seconds, amplitude] of sections) {
    const n = Math.round(seconds * RATE);
    for (let i = 0; i < n; i++) out[at + i] = i % 2 === 0 ? amplitude : -amplitude;
    at += n;
  }
  return out;
}

function peaksOf(channels: Float32Array[]): { level0: Int8Array; info: PeaksInfo } {
  return { level0: peaksLevel0(channels), info: { sampleRate: RATE, channels: channels.length, frames: channels[0]?.length ?? 0 } };
}

const PARAMS: SilenceParams = { thresholdDb: -40, minSilenceUs: 500_000, paddingUs: 100_000 };
const whole = (frames: number) => ({ fromUs: 0, toUs: Math.round((frames * 1e6) / RATE), speed: 1 });

describe("thresholdLevel", () => {
  it("maps dBFS to the peaks' n/127 units", () => {
    expect(thresholdLevel(0)).toBeCloseTo(127);
    expect(thresholdLevel(-6.0206)).toBeCloseTo(63.5, 2);
    // The quietest step (1/127) is about -42 dBFS.
    expect(thresholdLevel(-42.08)).toBeCloseTo(1, 2);
  });
});

describe("windowLevel", () => {
  it("takes the loudest bucket a 20 ms window overlaps, over both channels", () => {
    const left = new Float32Array(WINDOW * 3);
    const right = new Float32Array(WINDOW * 3);
    // Window 1 covers samples 960..1919: bucket 3 (768..1023) straddles windows 0 and 1.
    left[1000] = 0.5;
    right[1500] = -0.75;
    const { level0, info } = peaksOf([left, right]);
    expect(windowLevel(level0, info, 1)).toBe(96);
    // Bucket 3 counts in window 0 too: sound never leaks into a silence.
    expect(windowLevel(level0, info, 0)).toBe(64);
    expect(windowLevel(level0, info, 2)).toBe(0);
    // Past the end of the audio: silent.
    expect(windowLevel(level0, info, 50)).toBe(0);
  });

  it("follows the sample rate's window length (44.1 kHz: 882 frames per window)", () => {
    const data = new Float32Array(882 * 4);
    data[882 * 2 + 10] = 1;
    const level0 = peaksLevel0([data]);
    const info = { sampleRate: 44_100, channels: 1, frames: data.length };
    expect([0, 1, 2, 3].map((w) => windowLevel(level0, info, w))).toEqual([0, 127, 127, 0]);
    expect(Math.floor((882 * 2 + 10) / PEAKS_BUCKET)).toBe(6);
  });
});

describe("silenceSpans", () => {
  it("finds the pauses between sounds, keeping the padding next to the sound", () => {
    // 1 s speech, 1 s pause, 1 s speech, 0.3 s pause, 1 s speech.
    const data = pcm([
      [1, 0.5],
      [1, 0],
      [1, 0.5],
      [0.3, 0],
      [1, 0.5],
    ]);
    const { level0, info } = peaksOf([data]);
    const [spans] = silenceSpans(level0, info, PARAMS, [whole(data.length)]);
    // The 0.3 s pause is shorter than the minimum silence. Window 50 (1.00..1.02 s) still overlaps
    // bucket 187 (0.9973..1.0027 s), which holds sound: the silence starts with window 51 (1.02 s).
    expect(spans).toEqual([1_120_000, 1_900_000]);
  });

  it("measures the minimum silence before the padding, and drops what the padding eats", () => {
    const data = pcm([
      [1, 0.5],
      [0.6, 0],
      [1, 0.5],
    ]);
    const { level0, info } = peaksOf([data]);
    expect(silenceSpans(level0, info, PARAMS, [whole(data.length)])[0]).toEqual([1_120_000, 1_500_000]);
    expect(silenceSpans(level0, info, { ...PARAMS, minSilenceUs: 600_000 }, [whole(data.length)])[0]).toEqual([]);
    expect(silenceSpans(level0, info, { ...PARAMS, paddingUs: 300_000 }, [whole(data.length)])[0]).toEqual([]);
  });

  it("removes a leading and a trailing silence up to the range's edges (no padding there)", () => {
    const data = pcm([
      [0.8, 0],
      [1, 0.5],
      [0.7, 0],
    ]);
    const { level0, info } = peaksOf([data]);
    const range = whole(data.length);
    expect(silenceSpans(level0, info, PARAMS, [range])[0]).toEqual([0, 700_000, 1_920_000, range.toUs]);
  });

  it("works inside a clip's source range only, and the range's edges count as its ends", () => {
    const data = pcm([
      [1, 0.5],
      [2, 0],
      [1, 0.5],
    ]);
    const { level0, info } = peaksOf([data]);
    // In point inside the pause: the silence there starts the range, so no padding before it. Window
    // 149 (2.98..3.00 s) overlaps bucket 562 (2.9973..3.0027 s), which holds sound.
    expect(silenceSpans(level0, info, PARAMS, [{ fromUs: 2_000_000, toUs: 4_000_000, speed: 1 }])[0]).toEqual([2_000_000, 2_880_000]);
    // Two ranges at once, one of them sound only.
    expect(silenceSpans(level0, info, PARAMS, [{ fromUs: 0, toUs: 900_000, speed: 1 }, whole(data.length)])).toEqual([[], [1_120_000, 2_880_000]]);
  });

  it("applies the minimum silence and the padding in playback time (the clip's speed)", () => {
    const data = pcm([
      [1, 0.5],
      [0.8, 0],
      [1, 0.5],
    ]);
    const { level0, info } = peaksOf([data]);
    const range = whole(data.length);
    // At 2x the 0.8 s pause plays for 0.4 s: shorter than 0.5 s.
    expect(silenceSpans(level0, info, PARAMS, [{ ...range, speed: 2 }])[0]).toEqual([]);
    // At 0.5x the padding is 50 ms of media (the silent windows: 1.02..1.78 s).
    expect(silenceSpans(level0, info, PARAMS, [{ ...range, speed: 0.5 }])[0]).toEqual([1_070_000, 1_730_000]);
    // A frozen clip (speed 0) has no silences.
    expect(silenceSpans(level0, info, PARAMS, [{ ...range, speed: 0 }])[0]).toEqual([]);
  });

  it("compares the threshold with the quantized peaks: quiet noise counts as silence below it", () => {
    // Noise at 0.005 (-46 dBFS) reads as 1/127 (-42 dBFS); at 0.02 (-34 dBFS) as 3/127 (-32.5 dBFS).
    const data = pcm([
      [1, 0.5],
      [1, 0.005],
      [1, 0.5],
      [1, 0.02],
      [1, 0.5],
    ]);
    const { level0, info } = peaksOf([data]);
    const range = whole(data.length);
    expect(silenceSpans(level0, info, PARAMS, [range])[0]).toEqual([1_120_000, 1_900_000]);
    expect(silenceSpans(level0, info, { ...PARAMS, thresholdDb: -30 }, [range])[0]).toEqual([1_120_000, 1_900_000, 3_120_000, 3_900_000]);
    expect(silenceSpans(level0, info, { ...PARAMS, thresholdDb: -50 }, [range])[0]).toEqual([]);
  });

  it("handles empty ranges and audio shorter than the range (silent past the end)", () => {
    const data = pcm([[1, 0.5]]);
    const { level0, info } = peaksOf([data]);
    expect(silenceSpans(level0, info, PARAMS, [{ fromUs: 500_000, toUs: 500_000, speed: 1 }])[0]).toEqual([]);
    // The audio ends at 1 s: window 50 holds no samples, so it is silent.
    expect(silenceSpans(level0, info, PARAMS, [{ fromUs: 0, toUs: 2_000_000, speed: 1 }])[0]).toEqual([1_100_000, 2_000_000]);
  });

  it("analyses 10 minutes of stereo peaks in well under the 2 s budget", () => {
    const frames = 600 * RATE;
    const buckets = Math.ceil(frames / PEAKS_BUCKET);
    const level0 = new Int8Array(buckets * 4);
    // Speech-like: 3 s of sound, 0.7 s of pause, repeated.
    for (let b = 0; b < buckets; b++) {
      const seconds = (b * PEAKS_BUCKET) / RATE;
      const loud = seconds % 3.7 < 3 ? 60 : 0;
      level0.set([-loud, loud, -loud, loud], b * 4);
    }
    const info = { sampleRate: RATE, channels: 2, frames };
    const start = performance.now();
    const [spans] = silenceSpans(level0, info, PARAMS, [{ fromUs: 0, toUs: 600_000_000, speed: 1 }]);
    const ms = performance.now() - start;
    expect((spans?.length ?? 0) / 2).toBe(162);
    expect(ms).toBeLessThan(500);
  });
});
