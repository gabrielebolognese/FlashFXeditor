// The sample index of an image sequence (Batch 64, spec §21.11): one sync sample per frame file, so the
// video decode session (seek, prefetch, ring, frame requests) serves a sequence as it serves a video.
// A sample's `offset` is the frame's number in the list and its `size` the file's size; the "decoder"
// (decode/SequenceDecoder.ts) turns the file bytes into a frame. Frame times are the exact integer
// microseconds of frame i at the sequence's rate; the timescale is microseconds.
import { frameToUs } from "../../core/document/time.js";
import type { Rational } from "../../core/document/types.js";
import { createSampleIndex, type SampleIndex } from "./sampleIndex.js";

/** The `codec` of a sequence's index: not a WebCodecs string, never given to a VideoDecoder. */
export const SEQUENCE_CODEC = "image-sequence";

/** The index of `sizes.length` frame files at `fps`, `width` x `height` px. */
export function sequenceIndex(sizes: readonly number[], fps: Rational, width: number, height: number): SampleIndex {
  const count = sizes.length;
  const cts = new Float64Array(count);
  const durations = new Uint32Array(count);
  for (let i = 0; i < count; i++) {
    cts[i] = frameToUs(i, fps);
    durations[i] = frameToUs(i + 1, fps) - (cts[i] as number);
  }
  return createSampleIndex({
    codec: SEQUENCE_CODEC,
    description: new Uint8Array(0),
    codedWidth: width,
    codedHeight: height,
    rotation: 0,
    timescale: 1_000_000,
    offsets: Float64Array.from({ length: count }, (_, i) => i),
    sizes: Uint32Array.from(sizes),
    dts: cts.slice(),
    cts,
    durations,
    sync: new Uint8Array(count).fill(1),
  });
}
