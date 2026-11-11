// Sampling clips for the Enhance commands (v1.3): a few frames of each video (one of an image) are drawn into
// two small canvases, a copy of the whole frame for the tone statistics and a crop at the size the clip is
// shown for the noise, and their pixels go to core/enhance/stats.ts. The frames come from a video element on
// the source file (the browser's own decoder seeks to them; nothing is uploaded to the GPU and the preview's
// decoders are left alone), so the editor and the render page of the CLI measure the same way.
import type { Clip, MediaClip, MediaItem, Project } from "../core/document/types.js";
import { addNoiseStats, addToneStats, emptyStats, finishStats, type ClipSummary } from "../core/enhance/stats.js";

/** Frames sampled per video clip, spread over the part the clip uses. */
export const SAMPLE_FRAMES = 5;
/** The long side of the tone copy, and the side of the noise crop (px). */
const TONE_SIZE = 256;
const NOISE_SIZE = 384;
const SEEK_TIMEOUT_MS = 8000;

export type SampleSource = (mediaId: string) => Promise<Blob | null>;

/** Whether the Enhance commands can measure `clip`: a video or an image with a media item. */
export function isEnhanceable(project: Project, clip: Clip | undefined): clip is MediaClip {
  if (!clip || (clip.kind !== "video" && clip.kind !== "image")) return false;
  const media = project.media[(clip as MediaClip).mediaId];
  return media !== undefined && (media.kind === "video" || media.kind === "image");
}

/** The source seconds a video clip is sampled at: SAMPLE_FRAMES spread over its in..out. */
export function sampleTimes(clip: Pick<MediaClip, "in" | "out">, durationUs: number): number[] {
  const from = Math.max(0, clip.in);
  const to = Math.max(from, Math.min(clip.out, durationUs > 0 ? durationUs : clip.out));
  const times: number[] = [];
  for (let i = 0; i < SAMPLE_FRAMES; i++) times.push((from + ((to - from) * (i + 0.5)) / SAMPLE_FRAMES) / 1e6);
  return times;
}

function context(width: number, height: number): OffscreenCanvasRenderingContext2D {
  const ctx = new OffscreenCanvas(width, height).getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("No 2D context to measure the picture");
  ctx.imageSmoothingQuality = "high";
  return ctx;
}

/** Measures one decoded picture (`width` x `height` as shown upright) into `stats`; `scale`: output px per source px. */
function measure(source: CanvasImageSource, width: number, height: number, scale: number, stats: ReturnType<typeof emptyStats>): void {
  const fit = Math.min(1, TONE_SIZE / Math.max(width, height));
  const tw = Math.max(1, Math.round(width * fit));
  const th = Math.max(1, Math.round(height * fit));
  const tone = context(tw, th);
  tone.drawImage(source, 0, 0, tw, th);
  addToneStats(stats, tone.getImageData(0, 0, tw, th).data);
  // The middle of the picture at the size it is shown: NOISE_SIZE output px take NOISE_SIZE / scale source px.
  const shown = Math.max(0.05, scale);
  const side = Math.min(NOISE_SIZE, Math.floor(width * shown), Math.floor(height * shown));
  if (side < 64) return;
  const take = side / shown;
  const noise = context(side, side);
  noise.drawImage(source, (width - take) / 2, (height - take) / 2, take, take, 0, 0, side, side);
  addNoiseStats(stats, noise.getImageData(0, 0, side, side).data, side, side);
}

function seek(video: HTMLVideoElement, seconds: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(new Error("The video did not seek in time")), SEEK_TIMEOUT_MS);
    const done = (error?: Error) => {
      clearTimeout(timer);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      if (error) reject(error);
      else resolve();
    };
    const onSeeked = () => done();
    const onError = () => done(new Error("The video could not be decoded"));
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    video.currentTime = seconds;
  });
}

async function sampleVideo(file: Blob, times: readonly number[], scale: number, stats: ReturnType<typeof emptyStats>, signal?: AbortSignal): Promise<void> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  try {
    await new Promise<void>((resolve, reject) => {
      video.addEventListener("loadedmetadata", () => resolve(), { once: true });
      video.addEventListener("error", () => reject(new Error("The video could not be opened")), { once: true });
      video.src = url;
    });
    for (const time of times) {
      signal?.throwIfAborted();
      await seek(video, Math.min(time, Math.max(0, (Number.isFinite(video.duration) ? video.duration : time) - 0.05)));
      if (video.videoWidth > 0 && video.videoHeight > 0) measure(video, video.videoWidth, video.videoHeight, scale, stats);
    }
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

async function sampleImage(file: Blob, scale: number, stats: ReturnType<typeof emptyStats>): Promise<void> {
  const bitmap = await createImageBitmap(file);
  try {
    measure(bitmap, bitmap.width, bitmap.height, scale, stats);
  } finally {
    bitmap.close();
  }
}

/** The output px per source px a clip is shown at (its scale; 1 for a clip without a transform). */
function shownScale(clip: MediaClip): number {
  const transform = (clip as { transform?: { scale?: number; scaleY?: number } }).transform;
  const x = Math.abs(transform?.scale ?? 1);
  return Math.max(x, Math.abs(transform?.scaleY ?? x));
}

export interface ClipMeasurement {
  clipId: string;
  summary: ClipSummary;
}

/**
 * Measures the clips `ids` of `project` that are videos or images whose file `source` gives; the others come
 * back in `skipped` with the reason. `progress(done, total)` after each clip.
 */
export async function measureClips(project: Project, ids: readonly string[], source: SampleSource, progress?: (done: number, total: number) => void, signal?: AbortSignal): Promise<{ measured: ClipMeasurement[]; skipped: { clipId: string; reason: string }[] }> {
  const measured: ClipMeasurement[] = [];
  const skipped: { clipId: string; reason: string }[] = [];
  for (const [index, id] of ids.entries()) {
    signal?.throwIfAborted();
    const clip = project.clips[id];
    if (!isEnhanceable(project, clip)) {
      skipped.push({ clipId: id, reason: clip ? `a ${clip.kind} clip has no picture to measure` : "no such clip" });
    } else {
      const media = project.media[clip.mediaId] as MediaItem;
      const file = await source(media.id);
      if (!file) skipped.push({ clipId: id, reason: `the file of ${media.name} is missing` });
      else {
        const stats = emptyStats();
        try {
          if (media.kind === "video") await sampleVideo(file, sampleTimes(clip, media.durationUs), shownScale(clip), stats, signal);
          else await sampleImage(file, shownScale(clip), stats);
          if (stats.count > 0) measured.push({ clipId: id, summary: finishStats(stats) });
          else skipped.push({ clipId: id, reason: `no frame of ${media.name} could be read` });
        } catch (error) {
          if (signal?.aborted) throw error;
          skipped.push({ clipId: id, reason: error instanceof Error ? error.message : String(error) });
        }
      }
    }
    progress?.(index + 1, ids.length);
  }
  return { measured, skipped };
}
