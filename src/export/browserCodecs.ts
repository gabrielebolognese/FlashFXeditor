// The WebCodecs and muxer parts of the export loop in export.worker (spec §16, §3.1): VideoEncoder and
// AudioEncoder behind the pipeline's interfaces, planar AudioData, and the MP4 writer.
// The MP4 keeps its moov at the front (spec §16 "moov first": Instagram and players read it before any
// media) by reserving room for it from the expected chunk counts (mp4-muxer's fastStart object): the
// mdat streams out as it is encoded and the moov is written into the reserved room at the end, so
// memory stays flat for any length (no in-memory file, no fragmented MP4 for large ones). Bytes go out
// in MUX_CHUNK_BYTES pieces with their positions.
import { Muxer, StreamTarget } from "mp4-muxer";
import type { AudioMuxerLike, AudioMuxOptions } from "./audioExport.js";
import type { AudioEncoderLike, EncoderCallbacks, MuxerLike, MuxOptions, PipelineFrame, VideoEncoderLike } from "./pipeline.js";
import { WebmMuxer, type WebmAudioPacket, type WebmVideoPacket } from "./webm/WebmMuxer.js";

export const MUX_CHUNK_BYTES = 4 << 20;

export function createVideoEncoder(callbacks: EncoderCallbacks<EncodedVideoChunk>): VideoEncoderLike<VideoFrame> {
  const encoder = new VideoEncoder({ output: (chunk, meta) => callbacks.output(chunk, meta), error: (error) => callbacks.error(error) });
  encoder.addEventListener("dequeue", () => callbacks.dequeue());
  return {
    get encodeQueueSize() {
      return encoder.encodeQueueSize;
    },
    configure: (config) => encoder.configure(config),
    encode: (frame, options) => encoder.encode(frame, options),
    flush: () => encoder.flush(),
    close: () => {
      if (encoder.state !== "closed") encoder.close();
    },
  };
}

export function createAudioEncoder(callbacks: EncoderCallbacks<EncodedAudioChunk>): AudioEncoderLike<AudioData> {
  const encoder = new AudioEncoder({ output: (chunk, meta) => callbacks.output(chunk, meta), error: (error) => callbacks.error(error) });
  encoder.addEventListener("dequeue", () => callbacks.dequeue());
  return {
    get encodeQueueSize() {
      return encoder.encodeQueueSize;
    },
    configure: (config) => encoder.configure(config),
    encode: (data) => encoder.encode(data),
    flush: () => encoder.flush(),
    close: () => {
      if (encoder.state !== "closed") encoder.close();
    },
  };
}

/** Planar float samples as AudioData (the planes are copied into one buffer). */
export function planarAudioData(planes: readonly Float32Array[], sampleRate: number, timestampUs: number): AudioData {
  const frames = planes[0]?.length ?? 0;
  const data = new Float32Array(frames * planes.length);
  planes.forEach((plane, c) => data.set(plane, c * frames));
  return new AudioData({ format: "f32-planar", sampleRate, numberOfChannels: planes.length, numberOfFrames: frames, timestamp: timestampUs, data });
}

/** Runs `make` with the clock fixed at `FIXED_CREATION_MS` (mp4-muxer stamps its header with the time it is made). */
function withFixedClock<T>(fixed: boolean, make: () => T): T {
  if (!fixed) return make();
  const now = Date.now;
  Date.now = () => FIXED_CREATION_MS;
  try {
    return make();
  } finally {
    Date.now = now;
  }
}

/** 2026-01-01T00:00:00Z: the creation time of headless renders. */
export const FIXED_CREATION_MS = Date.UTC(2026, 0, 1);

/** The video muxer; `fixedCreationTime`: a header that does not depend on when it was made (headless renders). */
export function createMp4Muxer(options: MuxOptions, onData: (data: Uint8Array, position: number) => void, fixedCreationTime = false): MuxerLike<EncodedVideoChunk, EncodedAudioChunk> {
  const muxer = withFixedClock(fixedCreationTime, () => new Muxer({
    target: new StreamTarget({ onData, chunked: true, chunkSize: MUX_CHUNK_BYTES }),
    // `frameRate` is the track's timescale: a whole number of ticks per frame.
    video: { codec: options.video.codec, width: options.video.width, height: options.video.height, frameRate: options.video.timescale },
    ...(options.audio && { audio: { codec: options.audio.codec, sampleRate: options.audio.sampleRate, numberOfChannels: options.audio.channels } }),
    fastStart: { expectedVideoChunks: options.expectedVideoChunks, ...(options.audio && { expectedAudioChunks: options.expectedAudioChunks }) },
    firstTimestampBehavior: "strict",
  }));
  return {
    addVideo: (chunk, meta) => muxer.addVideoChunk(chunk, meta as EncodedVideoChunkMetadata | undefined),
    addAudio: (chunk, meta) => muxer.addAudioChunk(chunk, meta as EncodedAudioChunkMetadata | undefined),
    finalize: () => muxer.finalize(),
  };
}

/** An audio-only MP4 (M4A, Export audio) with its moov reserved at the front, as the video's. */
export function createAudioMp4Muxer(options: AudioMuxOptions, onData: (data: Uint8Array, position: number) => void): AudioMuxerLike<EncodedAudioChunk> {
  const muxer = new Muxer({
    target: new StreamTarget({ onData, chunked: true, chunkSize: MUX_CHUNK_BYTES }),
    audio: { codec: options.codec, sampleRate: options.sampleRate, numberOfChannels: options.channels },
    fastStart: { expectedAudioChunks: options.expectedChunks },
    firstTimestampBehavior: "strict",
  });
  return {
    addAudio: (chunk, meta) => muxer.addAudioChunk(chunk, meta as EncodedAudioChunkMetadata | undefined),
    finalize: () => muxer.finalize(),
  };
}

// WebM (Batch 81). The video frame the WebM pipeline carries: the color frame and, for a transparent
// export, the alpha plane as a second frame (luma = alpha), because VideoEncoder cannot encode alpha.

export interface WebmFrame extends PipelineFrame {
  color: VideoFrame;
  alpha: VideoFrame | null;
}

/** A WebM frame from a color frame alone (no transparency). */
export function opaqueWebmFrame(color: VideoFrame): WebmFrame {
  return { color, alpha: null, close: () => color.close() };
}

/** A WebM frame from straight RGBA pixels: the color frame (alpha dropped by the encoder) and the alpha plane as a gray I420 frame. */
export function transparentWebmFrame(pixels: Uint8ClampedArray, width: number, height: number, timestampUs: number, durationUs: number): WebmFrame {
  const init = { timestamp: timestampUs, duration: durationUs };
  const color = new VideoFrame(pixels as Uint8ClampedArray<ArrayBuffer>, { format: "RGBA", codedWidth: width, codedHeight: height, ...init });
  const plane = width * height;
  const gray = new Uint8Array(plane + 2 * (plane >> 2));
  for (let i = 0; i < plane; i++) gray[i] = pixels[i * 4 + 3] as number;
  gray.fill(128, plane);
  const alpha = new VideoFrame(gray, { format: "I420", codedWidth: width, codedHeight: height, ...init });
  return { color, alpha, close: () => (color.close(), alpha.close()) };
}

/**
 * The WebM video encoder: one VideoEncoder for the color stream and, when frames carry alpha, a second
 * (same codec, a lower bitrate) for the alpha stream. Both are given the same key frames, and their
 * outputs are paired in order into one packet, which the muxer writes as a block with its BlockAdditional.
 */
export function createWebmVideoEncoder(callbacks: EncoderCallbacks<WebmVideoPacket>, alpha: boolean): VideoEncoderLike<WebmFrame> {
  const colors: { chunk: EncodedVideoChunk; meta: EncodedVideoChunkMetadata | undefined }[] = [];
  const alphas: Uint8Array[] = [];
  const bytes = (chunk: EncodedVideoChunk) => {
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    return data;
  };
  const drain = () => {
    while (colors.length > 0 && (!alpha || alphas.length > 0)) {
      const { chunk, meta } = colors.shift() as (typeof colors)[number];
      callbacks.output({ timestampUs: chunk.timestamp, durationUs: chunk.duration, key: chunk.type === "key", data: bytes(chunk), alpha: alpha ? (alphas.shift() as Uint8Array) : null }, meta);
    }
  };
  const make = (output: (chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) => void) => {
    const encoder = new VideoEncoder({ output, error: (error) => callbacks.error(error) });
    encoder.addEventListener("dequeue", () => callbacks.dequeue());
    return encoder;
  };
  const color = make((chunk, meta) => {
    colors.push({ chunk, meta });
    drain();
  });
  const side = alpha
    ? make((chunk) => {
        alphas.push(bytes(chunk));
        drain();
      })
    : null;
  const close = (encoder: VideoEncoder | null) => {
    if (encoder && encoder.state !== "closed") encoder.close();
  };
  return {
    get encodeQueueSize() {
      return Math.max(color.encodeQueueSize, side?.encodeQueueSize ?? 0);
    },
    configure: (config) => {
      color.configure(config);
      // The alpha plane is flat most of the time: a quarter of the color's bitrate is plenty.
      side?.configure({ ...config, bitrate: Math.max(200_000, Math.round((config.bitrate ?? 1_000_000) / 4)) });
    },
    encode: (frame, options) => {
      color.encode(frame.color, options);
      if (side && frame.alpha) side.encode(frame.alpha, options);
    },
    flush: async () => {
      await Promise.all([color.flush(), side?.flush()]);
      drain();
    },
    close: () => (close(color), close(side)),
  };
}

/** The WebM writer behind the pipeline's muxer interface (video packets from `createWebmVideoEncoder`, Opus chunks). */
export function createWebmMuxer(options: MuxOptions, onData: (data: Uint8Array, position: number) => void): MuxerLike<WebmVideoPacket, EncodedAudioChunk> {
  const video = options.video;
  const muxer = new WebmMuxer(
    { video: { codec: video.codec === "av1" ? "av1" : "vp9", width: video.width, height: video.height, fps: video.fps, alpha: video.alpha }, audio: options.audio ? { sampleRate: options.audio.sampleRate, channels: options.audio.channels } : null },
    onData,
  );
  return {
    addVideo: (packet) => muxer.addVideo(packet),
    addAudio: (chunk, meta) => {
      muxer.setAudioDescription((meta as EncodedAudioChunkMetadata | undefined)?.decoderConfig?.description);
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      const packet: WebmAudioPacket = { timestampUs: chunk.timestamp, durationUs: chunk.duration, data };
      muxer.addAudio(packet);
    },
    finalize: () => muxer.finalize(),
  };
}
