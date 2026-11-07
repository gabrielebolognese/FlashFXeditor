// Alpha video in decode.worker (Batch 64, spec §21.11): a VP8 or VP9 WebM with alpha stores the alpha
// channel as a second, grayscale bitstream beside each frame (Matroska BlockAdditions, BlockAddID 1).
// Chrome's VideoDecoder decodes the color stream and ignores the other, so a second decoder with the
// same configuration decodes the alpha stream and `createAlphaDecoder` pairs the two outputs by
// timestamp behind the `DecoderLike` the session already drives: the session feeds chunks that carry an
// `alpha` payload and gets `PairedFrame`s back.
// - The alpha value is the alpha frame's luma, raw: `alphaPlaneOf` copies the Y plane out as bytes, so no
//   YUV range conversion touches it (it would map 16..235 to 0..255).
// - A frame fed without an alpha payload comes out opaque (no alpha frame is awaited for it).
// - After a flush every frame the color decoder gave and the alpha decoder did not is delivered opaque
//   rather than lost; alpha frames without a color frame are closed.
import type { ChunkInit, DecodedFrame, DecoderCallbacks, DecoderLike } from "./VideoDecodeSession.js";

/** The parts of a VideoFrame `alphaPlaneOf` reads. */
export interface AlphaSource extends DecodedFrame {
  readonly format: string | null;
  readonly codedWidth: number;
  readonly codedHeight: number;
  readonly visibleRect: { width: number; height: number } | null;
  allocationSize(options?: VideoFrameCopyToOptions): number;
  copyTo(destination: AllowSharedBufferSource, options?: VideoFrameCopyToOptions): Promise<PlaneLayout[]>;
}

/** The alpha of a frame as one byte per pixel, row after row. */
export interface AlphaPlane {
  data: ArrayBuffer;
  width: number;
  height: number;
}

const PLANAR_YUV = /^(I4(20|22|44)|NV12)A?$/;
const PACKED_RGB = /^(RGBA|RGBX|BGRA|BGRX)$/;

/**
 * The raw luma of an alpha frame, or null for a format that has none to read (high bit depth).
 * Planar YUV (I420, I422, I444, NV12): the first plane, tightly packed. Packed RGB (a decoder that
 * converted): the first channel, which is the same gray value in all three.
 */
export async function alphaPlaneOf(frame: AlphaSource): Promise<AlphaPlane | null> {
  const format = frame.format ?? "";
  const width = frame.visibleRect?.width ?? frame.codedWidth;
  const height = frame.visibleRect?.height ?? frame.codedHeight;
  if (!(width > 0 && height > 0)) return null;
  const packed = PACKED_RGB.test(format);
  if (!packed && !PLANAR_YUV.test(format)) return null;
  const all = new ArrayBuffer(frame.allocationSize());
  const layout = await frame.copyTo(all);
  const first = layout[0];
  if (!first) return null;
  const bytes = new Uint8Array(all);
  const out = new Uint8Array(width * height);
  const step = packed ? 4 : 1;
  for (let y = 0; y < height; y++) {
    let from = first.offset + y * first.stride;
    const row = y * width;
    for (let x = 0; x < width; x++, from += step) out[row + x] = bytes[from] as number;
  }
  return { data: out.buffer, width, height };
}

/** A color frame and the alpha frame decoded with it (null: opaque). */
export class PairedFrame<F extends DecodedFrame = VideoFrame> implements DecodedFrame {
  constructor(
    readonly color: F,
    readonly alpha: F | null,
  ) {}

  get timestamp(): number {
    return this.color.timestamp;
  }

  clone(): this {
    return new PairedFrame(this.color.clone(), this.alpha?.clone() ?? null) as this;
  }

  close(): void {
    this.color.close();
    this.alpha?.close();
  }
}

/** A chunk of the session with the alpha payload of its frame. */
export interface AlphaChunk extends ChunkInit {
  alpha?: ArrayBuffer;
}

/**
 * A `DecoderLike` over two decoders made by `make`. `decode` takes `AlphaChunk`s (the session passes
 * them through unchanged); outputs come as `PairedFrame`s.
 */
export function createAlphaDecoder<F extends DecodedFrame>(make: (callbacks: DecoderCallbacks<F>) => DecoderLike, callbacks: DecoderCallbacks<PairedFrame<F>>): DecoderLike {
  /** Frames waiting for their partner, by timestamp (a timestamp can be fed twice across runs). */
  const colors = new Map<number, F[]>();
  const alphas = new Map<number, F[]>();
  /** Timestamps fed without alpha: their color frame is delivered opaque. */
  const opaque = new Map<number, number>();
  const push = (map: Map<number, F[]>, frame: F) => {
    const list = map.get(frame.timestamp);
    if (list) list.push(frame);
    else map.set(frame.timestamp, [frame]);
  };
  const shift = (map: Map<number, F[]>, timestamp: number): F | undefined => {
    const list = map.get(timestamp);
    const frame = list?.shift();
    if (list && list.length === 0) map.delete(timestamp);
    return frame;
  };
  const pair = (timestamp: number) => {
    if (!colors.has(timestamp) || !alphas.has(timestamp)) return;
    callbacks.output(new PairedFrame(shift(colors, timestamp) as F, shift(alphas, timestamp) as F));
  };
  const dropAll = () => {
    for (const list of [...colors.values(), ...alphas.values()]) for (const frame of list) frame.close();
    colors.clear();
    alphas.clear();
    opaque.clear();
  };
  const color = make({
    output(frame) {
      const left = opaque.get(frame.timestamp) ?? 0;
      if (left > 0) {
        if (left === 1) opaque.delete(frame.timestamp);
        else opaque.set(frame.timestamp, left - 1);
        callbacks.output(new PairedFrame(frame, null));
        return;
      }
      push(colors, frame);
      pair(frame.timestamp);
    },
    error: (error) => callbacks.error(error),
    dequeue: () => callbacks.dequeue(),
  });
  const alpha = make({
    output(frame) {
      push(alphas, frame);
      pair(frame.timestamp);
    },
    error: (error) => callbacks.error(error),
    dequeue: () => callbacks.dequeue(),
  });
  return {
    get state() {
      return color.state;
    },
    get decodeQueueSize() {
      return Math.max(color.decodeQueueSize, alpha.decodeQueueSize);
    },
    configure(config) {
      color.configure(config);
      alpha.configure(config);
    },
    decode(chunk) {
      const { alpha: payload, ...rest } = chunk as AlphaChunk;
      if (payload && payload.byteLength > 0) alpha.decode({ ...rest, data: payload });
      else opaque.set(chunk.timestamp, (opaque.get(chunk.timestamp) ?? 0) + 1);
      color.decode(rest);
    },
    async flush() {
      await Promise.all([color.flush(), alpha.flush()]);
      // Color frames whose alpha never came go out opaque; alpha frames without a color frame are closed.
      for (const [timestamp, list] of [...colors]) {
        colors.delete(timestamp);
        for (const frame of list) callbacks.output(new PairedFrame(frame, null));
      }
      for (const list of alphas.values()) for (const frame of list) frame.close();
      alphas.clear();
      opaque.clear();
    },
    reset() {
      color.reset();
      alpha.reset();
      dropAll();
    },
    close() {
      if (color.state !== "closed") color.close();
      if (alpha.state !== "closed") alpha.close();
      dropAll();
    },
  };
}
