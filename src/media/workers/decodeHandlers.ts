// The decode worker's request handlers (spec §3.5): probes (MP4/MOV, WebM since Batch 49) and image posters, animated image frames
// and strips (Batch 34), the video decode sessions (sample index, requestFrame, prefetch) and MP4/MOV
// audio (decode/AudioTracks.ts). Frame methods start at once (each session orders its own jobs);
// probes, posters, image decodes and audio decodes share DECODE_CONCURRENCY queued slots, in priority
// order. decode.worker serves them; the export worker (Batch 43) runs its own set in-thread
// (loopback.ts), so an export decodes with its own sessions and never waits for the preview's.
import { alphaPlaneOf, createAlphaDecoder, PairedFrame } from "../decode/AlphaDecoder.js";
import { browserAudioDecodeDeps } from "../decode/audioTrack.js";
import { AudioTracks } from "../decode/AudioTracks.js";
import { DecodeSessions, type Delivered } from "../decode/DecodeSessions.js";
import { animationStrip, decodeAnimation, sequenceStrip } from "../decode/animatedImage.js";
import { decodeImage, imagePoster } from "../decode/poster.js";
import { browserSequenceDeps, createSequenceDecoder } from "../decode/SequenceDecoder.js";
import { createVideoDecoder } from "../decode/VideoDecodeSession.js";
import { probeVideoFile } from "../demux/container.js";
import { createLottieRenderer, lottiePoster } from "../lottie/lottieRender.js";
import { probeImage } from "../probe/imageProbe.js";
import type { DeliveredFrame, Method } from "./protocol.js";
import type { Handlers } from "./WorkerHost.js";

export const DECODE_CONCURRENCY = 2;
export const DECODE_IMMEDIATE: ReadonlySet<Method> = new Set<Method>(["openVideo", "requestFrame", "prefetch", "closeVideo", "decodeStats", "closeAudio", "closeLottie"]);

/** What a worker session holds: a plain frame, or the color and alpha frames of a WebM with alpha (Batch 64). */
type WorkerFrame = VideoFrame | PairedFrame<VideoFrame>;

/**
 * The frame for the main thread. An alpha pair becomes its color frame plus the alpha channel as bytes
 * (raw luma of the alpha frame, no YUV range conversion); the pair is closed. Without alpha data (a
 * format `alphaPlaneOf` cannot read) the frame is delivered opaque.
 */
export async function toDelivered(value: Delivered<WorkerFrame>): Promise<DeliveredFrame> {
  const { frame, timeUs, approximate } = value;
  if (!(frame instanceof PairedFrame)) return { frame, timeUs, approximate };
  try {
    const plane = frame.alpha ? await alphaPlaneOf(frame.alpha).catch(() => null) : null;
    return { frame: frame.color, timeUs, approximate, ...(plane && { alphaPlane: plane.data, alphaWidth: plane.width, alphaHeight: plane.height }) };
  } finally {
    frame.alpha?.close();
  }
}

/** Delivers emitted frames one after the other as `toDelivered` finishes them (alpha conversion is asynchronous). */
function emitInOrder(emit: (value: DeliveredFrame) => void): { emit: (value: Delivered<WorkerFrame>) => void; done: () => Promise<void> } {
  let tail: Promise<void> = Promise.resolve();
  return {
    emit: (value) => {
      tail = tail.then(async () => emit(await toDelivered(value))).catch(() => undefined);
    },
    done: () => tail,
  };
}

/** A new set of decode sessions and the handlers serving them. */
export function decodeHandlers(): Handlers {
  const videos = new DecodeSessions<WorkerFrame>({
    createDecoder: (callbacks, mode) =>
      mode === "sequence"
        ? createSequenceDecoder<VideoFrame>(callbacks as never, browserSequenceDeps)
        : mode === "alpha"
          ? createAlphaDecoder<VideoFrame>(createVideoDecoder, callbacks as never)
          : createVideoDecoder(callbacks as never),
    isConfigSupported: async (config) => (await VideoDecoder.isConfigSupported(config)).supported === true,
  });
  const audio = new AudioTracks({
    decodeDeps: (source) => browserAudioDecodeDeps((offset, size) => source.read(offset, size)),
    isConfigSupported: async (config) => (await AudioDecoder.isConfigSupported(config)).supported === true,
  });
  const lottie = createLottieRenderer();
  return {
    probe: ({ file, container, type }, signal) => (container === "image" ? probeImage(file, type, signal) : probeVideoFile(file, signal, container)),
    poster: ({ file, kind, maxSize }) => (kind === "lottie" ? lottiePoster(lottie, file, maxSize) : imagePoster(file, maxSize)),
    renderLottie: async ({ file, variant, timesUs, longEdge }, signal, emit) => {
      await lottie.render(file, variant, timesUs, longEdge, (timeUs, bitmap) => emit({ timeUs, bitmap }), signal);
      return { frames: timesUs.length };
    },
    closeLottie: async ({ mediaId }) => {
      lottie.close(mediaId);
      return null;
    },
    decodeImage: ({ blob, maxSize }) => decodeImage(blob, maxSize),
    decodeAnimation: (params, signal, emit) => decodeAnimation(params, signal, emit),
    animationStrip: (params, signal) => animationStrip(params, signal),
    sequenceStrip: (params, signal) => sequenceStrip(params, signal),
    openVideo: ({ sequence, ...params }, signal) => videos.open({ ...params, sequence }, signal),
    requestFrame: async (params, signal, emit) => {
      const sent = emitInOrder(emit);
      const result = await videos.requestFrame(params, signal, sent.emit);
      await sent.done();
      return toDelivered(result);
    },
    prefetch: async (params, signal, emit) => {
      const sent = emitInOrder(emit);
      const result = await videos.prefetch(params, signal, sent.emit);
      await sent.done();
      return result;
    },
    closeVideo: async ({ mediaId, lod }) => {
      videos.close(mediaId, lod);
      return null;
    },
    decodeStats: async () => videos.stats(),
    openAudio: (params, signal) => audio.open(params, signal),
    decodeAudio: (params, signal) => audio.decode(params, signal),
    closeAudio: async ({ mediaId }) => {
      audio.close(mediaId);
      return null;
    },
  };
}
