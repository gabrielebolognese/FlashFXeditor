// Image probe (spec §9.1), run in decode.worker. GIF and WebP go through ImageDecoder to find
// animations (frame list and total duration); other images, and browsers without ImageDecoder, use
// createImageBitmap (which applies EXIF orientation) for their size. Stills have no duration.
import { frameDurationUs } from "../decode/animation.js";
import { ProbeError, type ProbeResult } from "./types.js";

const ANIMATABLE = new Set(["image/gif", "image/webp"]);

/** "image/svg+xml" -> "svg", "image/jpeg" -> "jpeg". */
export function imageCodec(type: string): string {
  return (type.split("/")[1] ?? type).split("+")[0] ?? type;
}

async function animatedProbe(blob: Blob, type: string, signal: AbortSignal | undefined): Promise<ProbeResult | null> {
  if (typeof ImageDecoder === "undefined" || !ANIMATABLE.has(type) || !(await ImageDecoder.isTypeSupported(type))) return null;
  const decoder = new ImageDecoder({ data: await blob.arrayBuffer(), type });
  try {
    // Both: `completed` can resolve before the track list is ready (selectedTrack still null).
    await Promise.all([decoder.tracks.ready, decoder.completed]);
    const track = decoder.tracks.selectedTrack;
    if (!track?.animated || track.frameCount < 2) return null;
    const frames: number[] = [];
    let width = 0;
    let height = 0;
    for (let frameIndex = 0; frameIndex < track.frameCount; frameIndex++) {
      signal?.throwIfAborted();
      const { image } = await decoder.decode({ frameIndex });
      if (frameIndex === 0) [width, height] = [image.displayWidth, image.displayHeight];
      frames.push(frameDurationUs(image.duration));
      image.close();
    }
    const durationUs = frames.reduce((sum, us) => sum + us, 0);
    return { kind: "image", durationUs, width, height, hasAudio: false, codec: imageCodec(type), frameDurationsUs: frames };
  } finally {
    decoder.close();
  }
}

export async function probeImage(blob: Blob, type: string, signal?: AbortSignal): Promise<ProbeResult> {
  try {
    const animated = await animatedProbe(blob, type, signal);
    if (animated) return animated;
  } catch (error) {
    signal?.throwIfAborted();
    console.warn("[probe] ImageDecoder failed, falling back to createImageBitmap", error);
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch (error) {
    throw new ProbeError(`The image cannot be decoded (${error instanceof Error ? error.message : String(error)})`);
  }
  const { width, height } = bitmap;
  bitmap.close();
  return { kind: "image", durationUs: 0, width, height, hasAudio: false, codec: imageCodec(type) };
}
