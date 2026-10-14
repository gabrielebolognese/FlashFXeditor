// Sample index of a video track (spec §9.2): where each sample is in the file, when it is decoded (dts)
// and shown (cts), and which ones are sync samples, in typed arrays. Built from the mp4box sample
// table of the moov, stored in cache/index/ by `sampleIndexFile.ts` so later sessions skip the parse.
// Samples are fed to the decoder in decode order (dts); frames are found and matched by cts.
import { ticksToUs } from "../../core/document/time.js";
import type { Mp4Video } from "../probe/mp4Probe.js";
import type { Rotation } from "../probe/rotation.js";

/** What is stored per track: the decoder configuration and the sample table in decode order. */
export interface SampleTable {
  codec: string;
  /** Decoder configuration record (avcC/hvcC/av1C/vpcC payload); empty when the codec has none. */
  description: Uint8Array;
  codedWidth: number;
  codedHeight: number;
  rotation: Rotation;
  timescale: number;
  /** Byte offset of each sample in the file. */
  offsets: Float64Array;
  sizes: Uint32Array;
  /** Decode and composition times in timescale ticks. */
  dts: Float64Array;
  cts: Float64Array;
  durations: Uint32Array;
  /** 1 for sync (key) samples. */
  sync: Uint8Array;
}

export interface SampleIndex extends SampleTable {
  /** Number of samples (= frames). */
  count: number;
  /** Decode index of the frame at each display position (cts ascending). */
  displayOrder: Uint32Array;
  /** Display position of each decode index. */
  displayPos: Uint32Array;
  /** Frame time (us, from cts) at each display position: ascending. */
  displayTimesUs: Float64Array;
  /** Frame time (us) of each decode index: the timestamp of its chunk and of its output frame. */
  timesUs: Float64Array;
  /** Decode index of the last sync sample at or before each decode index. */
  syncBefore: Uint32Array;
  /**
   * The last decode index a decoder must have been fed to output each decode index: every frame shown
   * before it included (B-frames shown before a later-decoded P frame need that P frame first).
   */
  feedUntil: Uint32Array;
}

/** Adds the lookup tables to a sample table. */
export function createSampleIndex(table: SampleTable): SampleIndex {
  const count = table.sizes.length;
  const timesUs = new Float64Array(count);
  for (let i = 0; i < count; i++) timesUs[i] = ticksToUs(table.cts[i] as number, table.timescale);
  // Display order: by cts, ties by decode order.
  const displayOrder = Uint32Array.from({ length: count }, (_, i) => i).sort((a, b) => (table.cts[a] as number) - (table.cts[b] as number) || a - b);
  const displayPos = new Uint32Array(count);
  const displayTimesUs = new Float64Array(count);
  displayOrder.forEach((decodeIndex, position) => {
    displayPos[decodeIndex] = position;
    displayTimesUs[position] = timesUs[decodeIndex] as number;
  });
  const feedUntil = new Uint32Array(count);
  let shownBefore = 0;
  for (let position = 0; position < count; position++) {
    const decodeIndex = displayOrder[position] as number;
    shownBefore = Math.max(shownBefore, decodeIndex);
    feedUntil[decodeIndex] = shownBefore;
  }
  // A file that does not start with a sync sample is decoded from its first sample.
  const syncBefore = new Uint32Array(count);
  let lastSync = 0;
  for (let i = 0; i < count; i++) {
    if (table.sync[i]) lastSync = i;
    syncBefore[i] = lastSync;
  }
  return { ...table, count, displayOrder, displayPos, displayTimesUs, timesUs, syncBefore, feedUntil };
}

/** The index of a probed video track. */
export function sampleIndexFromMp4(video: Mp4Video): SampleIndex {
  const { samples } = video;
  const count = samples.length;
  const table: SampleTable = {
    codec: video.codec,
    description: video.description ?? new Uint8Array(0),
    codedWidth: video.codedWidth,
    codedHeight: video.codedHeight,
    rotation: video.rotation,
    timescale: video.timescale,
    offsets: new Float64Array(count),
    sizes: new Uint32Array(count),
    dts: new Float64Array(count),
    cts: new Float64Array(count),
    durations: new Uint32Array(count),
    sync: new Uint8Array(count),
  };
  samples.forEach((sample, i) => {
    table.offsets[i] = sample.offset;
    table.sizes[i] = sample.size;
    table.dts[i] = sample.dts;
    table.cts[i] = sample.cts;
    table.durations[i] = sample.duration;
    table.sync[i] = sample.is_sync ? 1 : 0;
  });
  return createSampleIndex(table);
}

/** Display position of the frame shown at `timeUs`: the last frame starting at or before it (the first frame before the first one). */
export function frameAt(index: SampleIndex, timeUs: number): number {
  return positionAt(index.displayTimesUs, timeUs);
}

/** In ascending frame times: the position of the last one at or before `timeUs` (0 before the first). */
export function positionAt(times: ArrayLike<number>, timeUs: number): number {
  let lo = 0;
  let hi = times.length - 1;
  if (hi < 0 || timeUs < (times[0] as number)) return 0;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((times[mid] as number) <= timeUs) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** In ascending frame times: the position of the one nearest to `timeUs` (the earlier one on a tie; §5.1). */
export function nearestPosition(times: ArrayLike<number>, timeUs: number): number {
  const at = positionAt(times, timeUs);
  const next = at + 1;
  if (next >= times.length) return at;
  return (times[next] as number) - timeUs < timeUs - (times[at] as number) ? next : at;
}

/**
 * Display position of the frame a clip shows at media time `mediaTimeUs` (§5.1): media time 0 is the
 * first frame (the container's first cts may come after 0; edit lists are not applied), and the
 * nearest frame time wins. `times` must not be empty.
 */
export function mediaTimePosition(times: ArrayLike<number>, mediaTimeUs: number): number {
  return nearestPosition(times, (times[0] as number) + mediaTimeUs);
}

/**
 * Decode index of the sync sample to start from to show decode index `d`. A leading picture (shown
 * before its sync sample, e.g. RASL frames of an open-GOP HEVC CRA) needs the previous GOP too, so
 * its start is the sync sample before that one.
 */
export function keyFor(index: SampleIndex, d: number): number {
  const sync = index.syncBefore[d] as number;
  if (sync > 0 && (index.cts[d] as number) < (index.cts[sync] as number)) return index.syncBefore[sync - 1] as number;
  return sync;
}
