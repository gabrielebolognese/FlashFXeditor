// The "decoder" of an image sequence (Batch 64, spec §21.11), behind the `DecoderLike` the video decode
// session drives: each chunk is one frame file's bytes (PNG or WebP), decoded with `createImageBitmap`
// (off the main thread, in decode.worker) and wrapped in a VideoFrame at the chunk's timestamp, so
// the frame travels and uploads as a video frame does (alpha kept: the frame is RGBA).
// - Up to the session's queue limits decode at once; frames are given out in the order they were fed
//   (the session expects display order), whichever finishes first.
// - `reset` and `close` abandon the frames still decoding: they are closed when they finish.
import type { ChunkInit, DecodedFrame, DecoderCallbacks, DecoderLike } from "./VideoDecodeSession.js";

/** What the decoder needs from the platform (tests fake it). */
export interface SequenceDecoderDeps<F extends DecodedFrame> {
  /** Decodes the file bytes into a frame at `timestamp` (us) lasting `duration`. */
  frameFrom(data: ArrayBuffer, timestamp: number, duration: number): Promise<F>;
}

export function createSequenceDecoder<F extends DecodedFrame>(callbacks: DecoderCallbacks<F>, deps: SequenceDecoderDeps<F>): DecoderLike {
  let state: "unconfigured" | "configured" | "closed" = "unconfigured";
  let generation = 0;
  let inFlight = 0;
  /** The chain that gives frames out in feed order. */
  let tail: Promise<void> = Promise.resolve();
  const settle = () => {
    inFlight -= 1;
    callbacks.dequeue();
  };
  return {
    get state() {
      return state;
    },
    get decodeQueueSize() {
      return inFlight;
    },
    configure() {
      state = "configured";
    },
    decode(chunk: ChunkInit) {
      if (state !== "configured") throw new DOMException("The decoder is not configured", "InvalidStateError");
      const mine = generation;
      inFlight += 1;
      const decoded = deps.frameFrom(chunk.data, chunk.timestamp, chunk.duration);
      // Rejections are handled in the chain; an unhandled one would be reported twice.
      decoded.catch(() => undefined);
      tail = tail.then(async () => {
        try {
          const frame = await decoded;
          if (mine !== generation || state === "closed") frame.close();
          else callbacks.output(frame);
        } catch (error) {
          if (mine === generation && state !== "closed") callbacks.error(error instanceof Error ? error : new Error(String(error)));
        } finally {
          settle();
        }
      });
    },
    async flush() {
      await tail;
    },
    reset() {
      generation += 1;
      state = "unconfigured";
    },
    close() {
      generation += 1;
      state = "closed";
    },
  };
}

/** The platform's frame maker: createImageBitmap, then a VideoFrame with the bitmap's pixels. */
export const browserSequenceDeps: SequenceDecoderDeps<VideoFrame> = {
  async frameFrom(data, timestamp, duration) {
    const bitmap = await createImageBitmap(new Blob([data]), { premultiplyAlpha: "none", colorSpaceConversion: "none" });
    try {
      return new VideoFrame(bitmap, { timestamp, duration, alpha: "keep" });
    } finally {
      bitmap.close();
    }
  },
};
