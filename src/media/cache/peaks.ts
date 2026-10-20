// Waveform peaks pyramid (spec §9.6): level 0 holds the min/max of every 256 sample frames (~5 ms at
// 48 kHz) per channel as Int8 pairs, and each next level halves the resolution, down to one bucket.
// Built in analysis.worker from PCM the main thread transfers; stored in cache/peaks/<mediaId>.bin
// stamped with the source file, so a replaced or damaged file reads as null and is built again.
import type { SourceStamp } from "../demux/sampleIndexFile.js";

/** Sample frames per level-0 bucket. */
export const PEAKS_BUCKET = 256;
const MAGIC = 0x4b414550; // "PEAK" little-endian
export const PEAKS_VERSION = 1;
const HEADER_BYTES = 48;

export interface Peaks {
  sampleRate: number;
  /** Sample frames the peaks cover (from media time 0). */
  frames: number;
  /** 1 or 2. */
  channels: number;
  /**
   * `levels[n]` covers PEAKS_BUCKET << n sample frames per bucket. Per bucket, per channel: min then
   * max, in -127..127 (full scale).
   */
  levels: Int8Array[];
}

const quantizeMin = (value: number) => Math.max(-127, Math.min(127, Math.floor(value * 127)));
const quantizeMax = (value: number) => Math.max(-127, Math.min(127, Math.ceil(value * 127)));

/** Level 0 of `channels` (equal lengths); a last partial bucket covers the frames left. */
export function peaksLevel0(channels: readonly Float32Array[]): Int8Array {
  const count = channels.length;
  const frames = channels[0]?.length ?? 0;
  const buckets = Math.ceil(frames / PEAKS_BUCKET);
  const out = new Int8Array(buckets * count * 2);
  for (let c = 0; c < count; c++) {
    const data = channels[c] as Float32Array;
    for (let b = 0; b < buckets; b++) {
      let min = Infinity;
      let max = -Infinity;
      const end = Math.min(frames, (b + 1) * PEAKS_BUCKET);
      for (let i = b * PEAKS_BUCKET; i < end; i++) {
        const value = data[i] as number;
        if (value < min) min = value;
        if (value > max) max = value;
      }
      const at = (b * count + c) * 2;
      out[at] = quantizeMin(min);
      out[at + 1] = quantizeMax(max);
    }
  }
  return out;
}

/** Joins the level-0 arrays of consecutive segments (each a whole number of buckets but the last). */
export function joinLevels(parts: readonly Int8Array[]): Int8Array {
  const out = new Int8Array(parts.reduce((n, part) => n + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** The next level: each bucket merges two of `level` (the last one alone when the count is odd). */
function halve(level: Int8Array, channels: number): Int8Array {
  const stride = channels * 2;
  const buckets = level.length / stride;
  const next = Math.ceil(buckets / 2);
  const out = new Int8Array(next * stride);
  for (let b = 0; b < next; b++) {
    const a = 2 * b * stride;
    const hasPair = 2 * b + 1 < buckets;
    for (let c = 0; c < channels; c++) {
      const min = level[a + 2 * c] as number;
      const max = level[a + 2 * c + 1] as number;
      out[b * stride + 2 * c] = hasPair ? Math.min(min, level[a + stride + 2 * c] as number) : min;
      out[b * stride + 2 * c + 1] = hasPair ? Math.max(max, level[a + stride + 2 * c + 1] as number) : max;
    }
  }
  return out;
}

/** The whole pyramid from level 0. */
export function buildPeaks(level0: Int8Array, info: { sampleRate: number; frames: number; channels: number }): Peaks {
  const levels = [level0];
  const stride = info.channels * 2;
  for (let level = level0; level.length > stride; ) {
    level = halve(level, info.channels);
    levels.push(level);
  }
  return { sampleRate: info.sampleRate, frames: info.frames, channels: info.channels, levels };
}

const align4 = (n: number) => (n + 3) & ~3;

export function writePeaksFile(peaks: Peaks, source: SourceStamp): ArrayBuffer {
  let size = HEADER_BYTES;
  for (const level of peaks.levels) size = align4(size + 4 + level.length);
  const buffer = new ArrayBuffer(size);
  const view = new DataView(buffer);
  view.setUint32(0, MAGIC, true);
  view.setUint32(4, PEAKS_VERSION, true);
  view.setFloat64(8, source.size, true);
  view.setFloat64(16, source.lastModified, true);
  view.setUint32(24, peaks.sampleRate, true);
  view.setUint16(28, peaks.channels, true);
  view.setUint16(30, PEAKS_BUCKET, true);
  view.setFloat64(32, peaks.frames, true);
  view.setUint32(40, peaks.levels.length, true);
  const bytes = new Int8Array(buffer);
  let at = HEADER_BYTES;
  for (const level of peaks.levels) {
    view.setUint32(at, level.length / (peaks.channels * 2), true);
    bytes.set(level, at + 4);
    at = align4(at + 4 + level.length);
  }
  return buffer;
}

/** The peaks in `buffer`, or null when it is not a peaks file, is damaged, or was built from another version of the source. */
export function readPeaksFile(buffer: ArrayBuffer, source: SourceStamp): Peaks | null {
  if (buffer.byteLength < HEADER_BYTES) return null;
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== MAGIC || view.getUint32(4, true) !== PEAKS_VERSION) return null;
  if (view.getFloat64(8, true) !== source.size || view.getFloat64(16, true) !== source.lastModified) return null;
  const sampleRate = view.getUint32(24, true);
  const channels = view.getUint16(28, true);
  const frames = view.getFloat64(32, true);
  const count = view.getUint32(40, true);
  if (view.getUint16(30, true) !== PEAKS_BUCKET || (channels !== 1 && channels !== 2) || sampleRate === 0 || count === 0) return null;
  const levels: Int8Array[] = [];
  let at = HEADER_BYTES;
  let expected = Math.ceil(frames / PEAKS_BUCKET);
  for (let n = 0; n < count; n++) {
    if (at + 4 > buffer.byteLength) return null;
    const buckets = view.getUint32(at, true);
    const length = buckets * channels * 2;
    if (buckets !== expected || at + 4 + length > buffer.byteLength) return null;
    levels.push(new Int8Array(buffer.slice(at + 4, at + 4 + length)));
    at = align4(at + 4 + length);
    expected = Math.ceil(buckets / 2);
  }
  return { sampleRate, frames, channels, levels };
}
