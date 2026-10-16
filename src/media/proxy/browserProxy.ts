// The WebCodecs, canvas and muxer parts of the proxy pipeline in proxy.worker (spec §9.5, §3.1):
// the VideoEncoder behind `EncoderLike`, the scaler, the sample index, and the MP4 writer (mp4-muxer
// streaming its bytes as they are produced, no fast start: the moov goes at the end and the mdat size
// is written back at its start, so the main thread writes at positions).
import { Muxer, StreamTarget } from "mp4-muxer";
import { ByteSource } from "../bytes/ByteSource.js";
import { sampleIndexFromMp4, type SampleIndex } from "../demux/sampleIndex.js";
import { readSampleIndex } from "../demux/sampleIndexFile.js";
import { readMp4 } from "../probe/mp4Probe.js";
import { ProbeError } from "../probe/types.js";
import type { EncoderCallbacks, EncoderLike, MuxerLike, MuxerOptions } from "./ProxyMaker.js";
import { halvingSteps } from "./proxyFormat.js";

/** The muxer hands its bytes over in chunks of this size (and once more for the moov and the patch). */
export const MUX_CHUNK_BYTES = 1 << 20;

/** A WebCodecs VideoEncoder behind `EncoderLike`. */
export function createVideoEncoder(callbacks: EncoderCallbacks<EncodedVideoChunk>): EncoderLike<VideoFrame> {
  const encoder = new VideoEncoder({ output: (chunk, meta) => callbacks.output(chunk, meta), error: (error) => callbacks.error(error) });
  encoder.addEventListener("dequeue", () => callbacks.dequeue());
  return {
    get encodeQueueSize() {
      return encoder.encodeQueueSize;
    },
    configure: (config) => encoder.configure(config),
    encode: (frame, options) => encoder.encode(frame, options),
    flush: () => encoder.flush(),
    close: () => encoder.close(),
  };
}

/**
 * Scales frames on 2D OffscreenCanvases (GPU-backed in Chrome's workers) by successive halvings with
 * bilinear filtering: each 2x step averages 2 x 2 pixels, so a 4K frame reaches 540p through a 4 x 4
 * box filter, without the aliasing of one bilinear step. Measured on the development machine (4K60
 * HEVC to 960x540, encode included): 37-52 fps, against 13-19 fps for one "high" or "medium" quality
 * step (resampled on the CPU) and for the encoder's own scaling. The result is wrapped in a new
 * VideoFrame with the source's time; the pixels stay in coded orientation (the proxy's track matrix
 * carries the rotation).
 */
export function halvingScaler(): (frame: VideoFrame, width: number, height: number) => VideoFrame {
  let chain: { canvas: OffscreenCanvas; ctx: OffscreenCanvasRenderingContext2D }[] = [];
  let key = "";
  return (frame, width, height) => {
    const sizeKey = `${frame.displayWidth}x${frame.displayHeight}>${width}x${height}`;
    if (key !== sizeKey) {
      key = sizeKey;
      chain = halvingSteps(frame.displayWidth, frame.displayHeight, { width, height }).map((size) => {
        const canvas = new OffscreenCanvas(size.width, size.height);
        const ctx = canvas.getContext("2d", { alpha: false });
        if (!ctx) throw new Error("No 2D context to scale the proxy frames");
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "low";
        return { canvas, ctx };
      });
    }
    let source: CanvasImageSource = frame;
    for (const { canvas, ctx } of chain) {
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
      source = canvas;
    }
    const last = chain[chain.length - 1] as { canvas: OffscreenCanvas };
    return new VideoFrame(last.canvas, { timestamp: frame.timestamp, ...(frame.duration !== null && { duration: frame.duration }) });
  };
}

/** The cached sample index when it still matches the file, else the one parsed from its moov. */
export async function loadSampleIndex(source: ByteSource, file: File, cachedIndex: Blob | null, signal: AbortSignal): Promise<SampleIndex> {
  const stamp = { size: file.size, lastModified: file.lastModified };
  const cached = cachedIndex ? readSampleIndex(await cachedIndex.arrayBuffer(), stamp) : null;
  if (cached) return cached;
  const { video } = await readMp4(source, signal);
  if (!video || video.samples.length === 0) throw new ProbeError("The file has no video track");
  return sampleIndexFromMp4(video);
}

/** The proxy's MP4: H.264 frames with their times (the first at 0) and the source's rotation. */
export function createMp4Writer(options: MuxerOptions, onData: (data: Uint8Array, position: number) => void): MuxerLike<EncodedVideoChunk> {
  const muxer = new Muxer({
    target: new StreamTarget({ onData, chunked: true, chunkSize: MUX_CHUNK_BYTES }),
    video: { codec: "avc", width: options.width, height: options.height, rotation: options.rotation },
    fastStart: false,
    firstTimestampBehavior: "offset",
  });
  return {
    add: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    finalize: () => muxer.finalize(),
  };
}

export { ByteSource };
