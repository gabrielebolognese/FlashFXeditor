// Proxy generation in proxy.worker (spec §9.5, §3.5, P5, P13): decode every sample of the source in
// decode order, scale each frame to the proxy size, encode H.264 (a keyframe every PROXY_GOP frames,
// PROXY_BITRATE) and mux an MP4 that streams out as it grows: the bytes go to the main thread as
// progress values `{ kind: "data", position, bytes }` (it writes them into the .part file), with
// `{ kind: "progress", done, total }` every PROGRESS_EVERY frames. Frames keep their source times
// (the muxer starts them at 0, as media time 0 is the first frame) and the source's rotation goes
// into the track matrix, so proxy frames sit where full ones do. Decoded and scaled frames are closed
// at once. The feed waits while the decoder or the encoder has more than MAX_QUEUE chunks queued,
// while paused (playback, drags and export on the main thread) and stops at an abort.
import { ticksToUs } from "../../core/document/time.js";
import type { SampleIndex } from "../demux/sampleIndex.js";
import type { DecodedFrame, DecoderCallbacks, DecoderLike } from "../decode/VideoDecodeSession.js";
import { abortError } from "../workers/protocol.js";
import { PROXY_BITRATE, PROXY_GOP, proxyCodecs, proxySize } from "./proxyFormat.js";

/** Chunks queued in the decoder or the encoder before the feed waits. */
export const MAX_QUEUE = 4;
/** A progress value every this many encoded frames. */
export const PROGRESS_EVERY = 10;

export interface MakeProxyParams {
  mediaId: string;
  file: File;
  /** cache/index/<id>.bin when present. */
  cachedIndex: Blob | null;
  /** The proxy's short edge (px); the source's when it is smaller. */
  shortEdge: number;
  /** The source's frame rate (fps), for the encoder and the H.264 level; estimated from the frame times when 0. */
  fps: number;
}

export type ProxyProgress = { kind: "progress"; done: number; total: number } | { kind: "data"; position: number; bytes: ArrayBuffer };

export interface MakeProxyResult {
  width: number;
  height: number;
  codec: string;
  /** Frames encoded. */
  frames: number;
  /** Length of the file. */
  bytes: number;
}

/** The encoder could not be configured for any proxy codec. */
export class ProxyEncoderError extends Error {
  override name = "ProxyEncoderError";
}

/** A frame the scaler and the encoder take (VideoFrame in the worker, fakes in tests). */
export interface ProxyFrame extends DecodedFrame {
  readonly duration: number | null;
}

/** The parts of a VideoEncoder the maker uses. */
export interface EncoderLike<F> {
  readonly encodeQueueSize: number;
  configure(config: VideoEncoderConfig): void;
  encode(frame: F, options: { keyFrame: boolean }): void;
  flush(): Promise<void>;
  close(): void;
}

export interface EncoderCallbacks<C> {
  output(chunk: C, meta?: EncodedVideoChunkMetadata): void;
  error(error: Error): void;
  /** `encodeQueueSize` went down. */
  dequeue(): void;
}

/** The MP4 muxer: `onData` receives the file's bytes and where they go, as they are produced. */
export interface MuxerLike<C> {
  add(chunk: C, meta?: EncodedVideoChunkMetadata): void;
  finalize(): void;
}

export interface MuxerOptions {
  width: number;
  height: number;
  /** Clockwise quarter turns to show the frames upright (the source's). */
  rotation: 0 | 90 | 180 | 270;
}

export interface SampleSource {
  read(offset: number, size: number): Promise<ArrayBuffer>;
  release(): void;
}

export interface ProxyMakerDeps<F extends ProxyFrame, C, S extends SampleSource = SampleSource> {
  openSource(file: File): S;
  /** The cached sample index when it matches the file, else the one parsed from it. */
  loadIndex(source: S, file: File, cachedIndex: Blob | null, signal: AbortSignal): Promise<SampleIndex>;
  createDecoder(callbacks: DecoderCallbacks<F>): DecoderLike;
  createEncoder(callbacks: EncoderCallbacks<C>): EncoderLike<F>;
  isEncoderSupported(config: VideoEncoderConfig): Promise<boolean>;
  /** The frame scaled to `width` x `height`: a new frame with its timestamp and duration (the caller closes both). */
  scale(frame: F, width: number, height: number): F;
  createMuxer(options: MuxerOptions, onData: (data: Uint8Array, position: number) => void): MuxerLike<C>;
}

export class ProxyMaker<F extends ProxyFrame, C, S extends SampleSource = SampleSource> {
  private paused = false;
  private wakers: (() => void)[] = [];

  constructor(private readonly deps: ProxyMakerDeps<F, C, S>) {}

  /** Stops feeding the decoder while paused (frames already fed are still encoded). */
  setPaused(paused: boolean): void {
    this.paused = paused;
    if (!paused) this.wake();
  }

  async make(params: MakeProxyParams, signal: AbortSignal, emit: (value: ProxyProgress) => void): Promise<MakeProxyResult> {
    const { deps } = this;
    const source = deps.openSource(params.file);
    let decoder: DecoderLike | null = null;
    let encoder: EncoderLike<F> | null = null;
    let failure: Error | null = null;
    const fail = (error: unknown) => {
      failure ??= error instanceof Error ? error : new Error(String(error));
      this.wake();
    };
    const onAbort = () => this.wake();
    signal.addEventListener("abort", onAbort);
    try {
      const index = await deps.loadIndex(source, params.file, params.cachedIndex, signal);
      signal.throwIfAborted();
      const first = index.sync.indexOf(1);
      if (index.count === 0 || first === -1) throw new Error("The video has no frames to decode");
      const { width, height } = proxySize(index.codedWidth, index.codedHeight, params.shortEdge);
      const fps = params.fps > 0 ? params.fps : estimateFps(index);
      const config = await this.encoderConfig(width, height, fps);
      signal.throwIfAborted();

      let bytes = 0;
      const muxer = deps.createMuxer({ width, height, rotation: index.rotation }, (data, position) => {
        bytes = Math.max(bytes, position + data.byteLength);
        // A copy: the muxer may reuse its buffer.
        emit({ kind: "data", position, bytes: data.slice().buffer });
      });
      const total = index.count - first;
      let encoded = 0;
      const activeEncoder = deps.createEncoder({
        output: (chunk, meta) => {
          try {
            muxer.add(chunk, meta);
          } catch (error) {
            fail(error);
          }
        },
        error: fail,
        dequeue: () => this.wake(),
      });
      encoder = activeEncoder;
      activeEncoder.configure(config);
      decoder = deps.createDecoder({
        output: (frame) => {
          try {
            if (failure || signal.aborted) return;
            const scaled = deps.scale(frame, width, height);
            try {
              activeEncoder.encode(scaled, { keyFrame: encoded % PROXY_GOP === 0 });
            } finally {
              scaled.close();
            }
            encoded += 1;
            if (encoded % PROGRESS_EVERY === 0) emit({ kind: "progress", done: encoded, total });
          } catch (error) {
            fail(error);
          } finally {
            frame.close();
          }
        },
        error: fail,
        dequeue: () => this.wake(),
      });
      const { codec, codedWidth, codedHeight, description } = index;
      decoder.configure({ codec, codedWidth, codedHeight, ...(description.length > 0 && { description }) });

      for (let d = first; d < index.count; d++) {
        await this.ready(decoder, activeEncoder, signal, () => failure);
        const data = await source.read(index.offsets[d] as number, index.sizes[d] as number);
        if (failure) throw failure;
        signal.throwIfAborted();
        decoder.decode({ type: index.sync[d] ? "key" : "delta", timestamp: index.timesUs[d] as number, duration: ticksToUs(index.durations[d] as number, index.timescale), data });
      }
      await decoder.flush();
      if (failure) throw failure;
      signal.throwIfAborted();
      await activeEncoder.flush();
      if (failure) throw failure;
      signal.throwIfAborted();
      muxer.finalize();
      emit({ kind: "progress", done: encoded, total });
      return { width, height, codec: config.codec, frames: encoded, bytes };
    } finally {
      signal.removeEventListener("abort", onAbort);
      closeQuietly(decoder);
      closeQuietly(encoder);
      source.release();
    }
  }

  /** The first proxy codec the encoder takes (Main, then High, then Baseline). */
  private async encoderConfig(width: number, height: number, fps: number): Promise<VideoEncoderConfig> {
    for (const codec of proxyCodecs(width, height, fps)) {
      const config: VideoEncoderConfig = {
        codec,
        width,
        height,
        bitrate: PROXY_BITRATE,
        framerate: fps,
        latencyMode: "quality",
        avc: { format: "avc" },
      };
      if (await this.deps.isEncoderSupported(config).catch(() => false)) return config;
    }
    throw new ProxyEncoderError(`No H.264 encoder for ${width}x${height} at ${Math.round(fps)} fps`);
  }

  /** Waits until a chunk may be fed: not paused, queues short; throws on abort or failure. */
  private async ready(decoder: DecoderLike, encoder: EncoderLike<F>, signal: AbortSignal, failure: () => Error | null): Promise<void> {
    for (;;) {
      const error = failure();
      if (error) throw error;
      if (signal.aborted) throw signal.reason ?? abortError();
      if (!this.paused && decoder.decodeQueueSize < MAX_QUEUE && encoder.encodeQueueSize < MAX_QUEUE) return;
      await new Promise<void>((resolve) => this.wakers.push(resolve));
    }
  }

  private wake(): void {
    for (const resolve of this.wakers.splice(0)) resolve();
  }
}

/** Frames per second from the frame times (sources without a frame rate). */
function estimateFps(index: SampleIndex): number {
  const times = index.displayTimesUs;
  const span = (times[times.length - 1] as number) - (times[0] as number);
  return times.length > 1 && span > 0 ? ((times.length - 1) * 1e6) / span : 30;
}

function closeQuietly(codec: { close(): void } | null): void {
  try {
    codec?.close();
  } catch {
    // Already closed (an error closes WebCodecs codecs).
  }
}
