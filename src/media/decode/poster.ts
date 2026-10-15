// Image posters (Batch 04), run in decode.worker: the image drawn into an OffscreenCanvas of at most
// `maxSize` px, returned as a transferable ImageBitmap plus a WebP blob for cache/thumbs/; cached
// images decoded back to bitmaps. Videos show their thumbnail sheets since Batch 17 (thumbSheet.ts in
// analysis.worker, which shares the upright drawing below).
import { displaySize, type Rotation } from "../probe/rotation.js";
import type { PosterResult } from "../workers/protocol.js";

/** WebP quality of the cached posters and thumbnail sheets. */
export const WEBP_QUALITY = 0.8;

/** Draws coded `source` into the upright rect (x, y, w, h), turned by `rotation` (clockwise). */
export function drawUpright(ctx: OffscreenCanvasRenderingContext2D, source: CanvasImageSource, x: number, y: number, w: number, h: number, rotation: Rotation): void {
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  const quarter = rotation === 90 || rotation === 270;
  const drawW = quarter ? h : w;
  const drawH = quarter ? w : h;
  ctx.drawImage(source, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();
}

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
  drawUpright(ctx, source, 0, 0, w, h, rotation);
  // The blob first: transferToImageBitmap clears the canvas.
  const blob = await canvas.convertToBlob({ type: "image/webp", quality: WEBP_QUALITY });
  return { bitmap: canvas.transferToImageBitmap(), blob };
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
