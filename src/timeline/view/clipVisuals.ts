// What clip bodies draw from (spec §6.4, §6.17): thumbnail sheets of videos, posters of images and
// waveform peaks of audio-bearing media, each available once loaded (null before: the body color is
// the placeholder). A content pass records what it would have liked to draw (`VisualWants`); the
// view hands that over after the pass, and the sources load it through the IdleQueue. The math here
// is pure: which thumbnail each filmstrip tile shows, which peaks level a zoom reads and the peak of
// each device-pixel column.
import type { MediaId } from "../../core/document/types.js";
import type { Peaks } from "../../media/cache/peaks.js";
import { PEAKS_BUCKET } from "../../media/cache/peaks.js";
import { chooseLevel, thumbIndex, type ThumbLayout, type ThumbLevel } from "../../media/cache/thumbSheets.js";
import type { SheetKey } from "../../media/ThumbnailStore.js";

/** An animated image's frames side by side in one bitmap, each cell starting at `startsUs[i]` (media us). */
export interface AnimationStripView {
  bitmap: ImageBitmap;
  cellWidth: number;
  cellHeight: number;
  startsUs: readonly number[];
  durationUs: number;
}

export interface ClipVisuals {
  /** The sheet layout of a video, or null (not a video, unknown size). */
  thumbLayout(mediaId: MediaId): ThumbLayout | null;
  /** A thumbnail sheet in memory, or null. */
  sheet(mediaId: MediaId, level: ThumbLevel, sheet: number): ImageBitmap | null;
  /** The poster of an image, or null. */
  poster(mediaId: MediaId): ImageBitmap | null;
  /** The filmstrip of an animated image (Batch 34), or null (a still, or not made yet). */
  strip(mediaId: MediaId): AnimationStripView | null;
  /** The peaks of an audio-bearing media, or null. */
  peaks(mediaId: MediaId): Peaks | null;
  /** True when the media is offline (Batch 41: missing, no access, undecodable, removed): its clips draw a slate. */
  offline?(mediaId: MediaId): boolean;
}

/** What one content pass wanted to draw. */
export interface VisualWants {
  sheets: SheetKey[];
  peaks: MediaId[];
}

/** The visuals with their loading side (the app's media stores). */
export interface ClipVisualsSource extends ClipVisuals {
  /** The wants of the latest content pass (replaces the previous ones). */
  want(wants: VisualWants): void;
  /** Calls `listener` when something arrived (sheets, posters, peaks). */
  subscribe(listener: () => void): () => void;
  /** A dev stats line. */
  stats?(): string;
}

/** The wants of a pass with what it already recorded. */
export type WantsCollector = VisualWants & { seen: Set<string> };

export function createWants(): WantsCollector {
  return { sheets: [], peaks: [], seen: new Set() };
}

export function wantSheet(wants: WantsCollector, mediaId: MediaId, level: ThumbLevel, sheet: number): void {
  const key = `${mediaId}/${level}/${sheet}`;
  if (wants.seen.has(key)) return;
  wants.seen.add(key);
  wants.sheets.push({ mediaId, level, sheet });
}

export function wantPeaks(wants: WantsCollector, mediaId: MediaId): void {
  const key = `peaks/${mediaId}`;
  if (wants.seen.has(key)) return;
  wants.seen.add(key);
  wants.peaks.push(mediaId);
}

// --- Filmstrips ---------------------------------------------------------------------------------------

/** How a clip's filmstrip is tiled: tiles of `tileWidth` CSS px from the clip's start x. */
export interface FilmstripPlan {
  level: ThumbLevel;
  /** First and last (exclusive) tile numbers on screen. */
  first: number;
  end: number;
  /** Source time (us) advanced per tile. */
  tileUs: number;
}

/**
 * The tiles of a clip body on screen between `left` and `right` (CSS px), and the level that gives
 * each its own frame. `usPerPx` is source time per CSS px (frame duration x speed / px per frame).
 */
export function planFilmstrip(layout: ThumbLayout, clipX: number, tileWidth: number, left: number, right: number, usPerPx: number): FilmstripPlan {
  const tileUs = tileWidth * usPerPx;
  return {
    level: chooseLevel(layout, tileUs),
    first: Math.max(0, Math.floor((left - clipX) / tileWidth)),
    end: Math.max(0, Math.ceil((right - clipX) / tileWidth)),
    tileUs,
  };
}

/** The thumbnail a tile shows: the frame at its left edge's source time (clip in point + tiles before it). */
export function tileThumb(layout: ThumbLayout, level: ThumbLevel, inUs: number, tile: number, tileUs: number): number {
  return thumbIndex(layout, level, inUs + tile * tileUs);
}

// --- Waveforms ----------------------------------------------------------------------------------------

/** The pyramid level whose bucket is closest to one CSS px (spec §6.17), at `samplesPerPx` sample frames per CSS px. */
export function peaksLevel(peaks: Peaks, samplesPerPx: number): number {
  if (!(samplesPerPx > 0)) return 0;
  const level = Math.round(Math.log2(samplesPerPx / PEAKS_BUCKET));
  return Math.min(peaks.levels.length - 1, Math.max(0, level));
}

/** The peak (0..1, full scale) of bucket `b` of a level, the louder channel's. 0 outside the level. */
function bucketPeak(data: Int8Array, channels: number, b: number): number {
  const at = b * channels * 2;
  if (b < 0 || at >= data.length) return 0;
  let peak = 0;
  for (let c = 0; c < channels; c++) {
    const min = -(data[at + 2 * c] as number);
    const max = data[at + 2 * c + 1] as number;
    if (min > peak) peak = min;
    if (max > peak) peak = max;
  }
  return peak / 127;
}

/**
 * Fills `out[i]` with the peak (0..1) of the column covering sample frames [s0 + i * step, s0 + (i + 1) * step)
 * from level `level`. Columns spanning buckets take the loudest; columns narrower than a bucket read
 * between bucket centers (linear), so a deep zoom draws a smooth envelope, not steps.
 */
export function columnPeaks(peaks: Peaks, level: number, s0: number, step: number, out: Float32Array, count: number): void {
  const data = peaks.levels[level];
  if (!data) {
    out.fill(0, 0, count);
    return;
  }
  const bucket = PEAKS_BUCKET << level;
  const { channels } = peaks;
  const buckets = data.length / (channels * 2);
  const end = peaks.frames;
  for (let i = 0; i < count; i++) {
    const from = s0 + i * step;
    const to = from + step;
    if (to <= 0 || from >= end) {
      out[i] = 0;
      continue;
    }
    if (step >= bucket) {
      const b0 = Math.max(0, Math.floor(from / bucket));
      const b1 = Math.min(buckets, Math.ceil(to / bucket));
      let peak = 0;
      for (let b = b0; b < b1; b++) peak = Math.max(peak, bucketPeak(data, channels, b));
      out[i] = peak;
    } else {
      const p = Math.min(buckets - 1, Math.max(0, (from + step / 2) / bucket - 0.5));
      const b = Math.floor(p);
      const t = p - b;
      out[i] = bucketPeak(data, channels, b) * (1 - t) + bucketPeak(data, channels, Math.min(buckets - 1, b + 1)) * t;
    }
  }
}
