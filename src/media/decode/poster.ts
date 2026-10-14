// Poster frames for the media panel (Batch 04), run in decode.worker: the first frame of a video
// (one sync sample through a VideoDecoder) or the image itself, drawn upright into an OffscreenCanvas
// of at most `maxSize` px, returned as a transferable ImageBitmap plus a WebP blob for cache/thumbs/.
// Posters keep this one-shot decoder (one key sample); preview frames come from VideoDecodeSession.
import { ticksToUs } from "../../core/document/time.js";
import { ByteSource } from "../bytes/ByteSource.js";
import { readMp4 } from "../probe/mp4Probe.js";
import { displaySize, type Rotation } from "../probe/rotation.js";
import { ProbeError } from "../probe/types.js";
import type { PosterResult } from "../workers/protocol.js";

const WEBP_QUALITY = 0.8;

/** Draws `source` (coded `width` x `height`) rotated upright and scaled to fit `maxSize`. */
async function renderPoster(source: CanvasImageSource, width: number, height: number, rotation: Rotation, maxSize: number): Promise<PosterResult> {
  const shown = displaySize(width, height, rotation);
  const scale = Math.min(1, maxSize / Math.max(shown.width, shown.height));
  const w = Math.max(1, Math.round(shown.width * scale));
  const h = Math.max(1, Math.round(shown.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D context for the poster");
  ctx.imageSmoothingQuality = "high";
  ctx.translate(w / 2, h / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  const quarter = rotation === 90 || rotation === 270;
  const drawW = quarter ? h : w;
  const drawH = quarter ? w : h;
  ctx.drawImage(source, -drawW / 2, -drawH / 2, drawW, drawH);
  // The blob first: transferToImageBitmap clears the canvas.
  const blob = await canvas.convertToBlob({ type: "image/webp", quality: WEBP_QUALITY });
  return { bitmap: canvas.transferToImageBitmap(), blob };
}

/** Decodes one key chunk; resolves with its frame (the caller closes it). */
function decodeOne(config: VideoDecoderConfig, chunk: EncodedVideoChunk, signal: AbortSignal): Promise<VideoFrame> {
  return new Promise((resolve, reject) => {
    let frame: VideoFrame | null = null;
    const decoder = new VideoDecoder({
      output: (output) => {
        if (frame) output.close();
        else frame = output;
      },
      error: (error) => reject(new ProbeError(`The video cannot be decoded (${error.message})`)),
    });
    const stop = () => {
      if (decoder.state !== "closed") decoder.close();
    };
    signal.addEventListener("abort", () => {
      stop();
      (frame as VideoFrame | null)?.close();
      reject(signal.reason);
    });
    decoder.configure(config);
    decoder.decode(chunk);
    decoder.flush().then(
      () => {
        stop();
        if (frame) resolve(frame);
        else reject(new ProbeError("The decoder returned no frame"));
      },
      (error: unknown) => {
        stop();
        reject(error);
      },
    );
  });
}

export async function videoPoster(file: Blob, maxSize: number, signal: AbortSignal): Promise<PosterResult> {
  const source = new ByteSource(file);
  try {
    const { video } = await readMp4(source, signal);
    if (!video) throw new ProbeError("The file has no video track");
    const sample = video.samples.find((s) => s.is_sync) ?? video.samples[0];
    if (!sample) throw new ProbeError("The video track has no samples");
    const config: VideoDecoderConfig = {
      codec: video.codec,
      codedWidth: video.codedWidth,
      codedHeight: video.codedHeight,
      optimizeForLatency: true,
      ...(video.description && { description: video.description }),
    };
    const support = await VideoDecoder.isConfigSupported(config);
    if (!support.supported) throw new ProbeError(`This browser cannot decode ${video.codec}`);
    const data = await source.read(sample.offset, sample.size);
    signal.throwIfAborted();
    const chunk = new EncodedVideoChunk({ type: "key", timestamp: ticksToUs(sample.cts, video.timescale), duration: ticksToUs(sample.duration, video.timescale), data });
    const frame = await decodeOne(config, chunk, signal);
    try {
      return await renderPoster(frame, frame.displayWidth, frame.displayHeight, video.rotation, maxSize);
    } finally {
      frame.close();
    }
  } finally {
    source.release();
  }
}

/** The image (first frame of an animation), EXIF orientation applied by createImageBitmap. */
export async function imagePoster(file: Blob, maxSize: number): Promise<PosterResult> {
  const bitmap = await createImageBitmap(file);
  try {
    return await renderPoster(bitmap, bitmap.width, bitmap.height, 0, maxSize);
  } finally {
    bitmap.close();
  }
}

/** An image file as a bitmap no larger than `maxSize` (cached posters are already that small). */
export async function decodeImage(blob: Blob, maxSize: number): Promise<ImageBitmap> {
  const bitmap = await createImageBitmap(blob);
  const scale = maxSize / Math.max(bitmap.width, bitmap.height);
  if (scale >= 1) return bitmap;
  try {
    return await createImageBitmap(bitmap, { resizeWidth: Math.max(1, Math.round(bitmap.width * scale)), resizeHeight: Math.max(1, Math.round(bitmap.height * scale)), resizeQuality: "high" });
  } finally {
    bitmap.close();
  }
}
