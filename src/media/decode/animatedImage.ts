// Animated image frames (spec §9.1, §9.3, Batch 34), run in decode.worker with ImageDecoder (its
// frames come out fully composed):
// - `decodeAnimation`: a first pass reads every frame's duration (closing each frame), then the kept
//   frames (animation.ts `keptFrames`: within the memory budget) are decoded again, scaled to fit
//   `maxSize`, and posted one by one as transferable ImageBitmaps after a `frames` message with the
//   kept frames' start times. `only` limits the second pass to some kept frames (the ones the texture
//   pool let go of).
// - `animationStrip`: the timeline's filmstrip of an animation (spec §6.4): up to `maxCells` frames
//   spread over it, side by side in one bitmap `cellHeight` px tall, with each cell's start time.
import { textureBytes, mipLevelCount } from "../../render/gpu/mipmaps.js";
import type { AnimationProgress, AnimationStrip } from "../workers/protocol.js";
import { frameDurationUs, keptFrames } from "./animation.js";

interface Opened {
  decoder: ImageDecoder;
  durations: number[];
  width: number;
  height: number;
}

/** The decoder of `blob` with its frames' durations and size. Close `decoder` when done. */
async function open(blob: Blob, type: string, signal: AbortSignal): Promise<Opened> {
  const decoder = new ImageDecoder({ data: await blob.arrayBuffer(), type });
  try {
    // Both: `completed` can resolve before the track list is ready (selectedTrack still null).
    await Promise.all([decoder.tracks.ready, decoder.completed]);
    const count = decoder.tracks.selectedTrack?.frameCount ?? 0;
    if (count === 0) throw new Error("The image has no frames");
    const durations: number[] = [];
    let width = 0;
    let height = 0;
    for (let frameIndex = 0; frameIndex < count; frameIndex++) {
      signal.throwIfAborted();
      const { image } = await decoder.decode({ frameIndex });
      if (frameIndex === 0) [width, height] = [image.displayWidth, image.displayHeight];
      durations.push(frameDurationUs(image.duration));
      image.close();
    }
    return { decoder, durations, width, height };
  } catch (error) {
    decoder.close();
    throw error;
  }
}

/** `width` x `height` scaled down to fit `maxSize` (never up). */
function fit(width: number, height: number, maxSize: number): { w: number; h: number } {
  const scale = Math.min(1, maxSize / Math.max(width, height, 1));
  return { w: Math.max(1, Math.round(width * scale)), h: Math.max(1, Math.round(height * scale)) };
}

/** Frame `frameIndex` as a `w` x `h` bitmap. */
async function frameBitmap(decoder: ImageDecoder, frameIndex: number, w: number, h: number, native: boolean): Promise<ImageBitmap> {
  const { image } = await decoder.decode({ frameIndex });
  try {
    return await createImageBitmap(image, native ? {} : { resizeWidth: w, resizeHeight: h, resizeQuality: "high" });
  } finally {
    image.close();
  }
}

export interface DecodeAnimationParams {
  blob: Blob;
  type: string;
  maxSize: number;
  budgetBytes: number;
  /** Kept frame positions to decode (null: all). */
  only: number[] | null;
}

export async function decodeAnimation(params: DecodeAnimationParams, signal: AbortSignal, emit: (value: AnimationProgress) => void): Promise<{ frames: number }> {
  const { decoder, durations, width, height } = await open(params.blob, params.type, signal);
  try {
    const { w, h } = fit(width, height, params.maxSize);
    const kept = keptFrames(durations, textureBytes(w, h, mipLevelCount(w, h)), params.budgetBytes);
    emit({ kind: "frames", startsUs: kept.startsUs, durationUs: kept.durationUs, width: w, height: h });
    const only = params.only ? new Set(params.only) : null;
    const native = w === width && h === height;
    for (let k = 0; k < kept.indexes.length; k++) {
      if (only && !only.has(k)) continue;
      signal.throwIfAborted();
      emit({ kind: "frame", index: k, bitmap: await frameBitmap(decoder, kept.indexes[k] as number, w, h, native) });
    }
    return { frames: kept.indexes.length };
  } finally {
    decoder.close();
  }
}

export async function animationStrip(params: { blob: Blob; type: string; cellHeight: number; maxCells: number }, signal: AbortSignal): Promise<AnimationStrip> {
  const { decoder, durations, width, height } = await open(params.blob, params.type, signal);
  try {
    const cellHeight = Math.max(1, Math.round(Math.min(params.cellHeight, height)));
    const cellWidth = Math.max(1, Math.round((width * cellHeight) / Math.max(1, height)));
    // Every k-th frame, for the smallest k that gives at most maxCells cells.
    const cells = keptFrames(durations, 1, params.maxCells);
    const canvas = new OffscreenCanvas(cellWidth * cells.indexes.length, cellHeight);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No 2D context for the strip");
    ctx.imageSmoothingQuality = "high";
    for (let k = 0; k < cells.indexes.length; k++) {
      signal.throwIfAborted();
      const { image } = await decoder.decode({ frameIndex: cells.indexes[k] as number });
      try {
        ctx.drawImage(image, k * cellWidth, 0, cellWidth, cellHeight);
      } finally {
        image.close();
      }
    }
    return { bitmap: canvas.transferToImageBitmap(), cellWidth, cellHeight, startsUs: cells.startsUs, durationUs: cells.durationUs };
  } finally {
    decoder.close();
  }
}
