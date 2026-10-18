// The WebCodecs and muxer parts of the export loop in export.worker (spec §16, §3.1): VideoEncoder and
// AudioEncoder behind the pipeline's interfaces, planar AudioData, and the MP4 writer.
// The MP4 keeps its moov at the front (spec §16 "moov first": Instagram and players read it before any
// media) by reserving room for it from the expected chunk counts (mp4-muxer's fastStart object): the
// mdat streams out as it is encoded and the moov is written into the reserved room at the end, so
// memory stays flat for any length (no in-memory file, no fragmented MP4 for large ones). Bytes go out
// in MUX_CHUNK_BYTES pieces with their positions.
import { Muxer, StreamTarget } from "mp4-muxer";
import type { AudioMuxerLike, AudioMuxOptions } from "./audioExport.js";
import type { AudioEncoderLike, EncoderCallbacks, MuxerLike, MuxOptions, VideoEncoderLike } from "./pipeline.js";

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

export function createMp4Muxer(options: MuxOptions, onData: (data: Uint8Array, position: number) => void): MuxerLike<EncodedVideoChunk, EncodedAudioChunk> {
  const muxer = new Muxer({
    target: new StreamTarget({ onData, chunked: true, chunkSize: MUX_CHUNK_BYTES }),
    // `frameRate` is the track's timescale: a whole number of ticks per frame.
    video: { codec: options.video.codec, width: options.video.width, height: options.video.height, frameRate: options.video.timescale },
    ...(options.audio && { audio: { codec: options.audio.codec, sampleRate: options.audio.sampleRate, numberOfChannels: options.audio.channels } }),
    fastStart: { expectedVideoChunks: options.expectedVideoChunks, ...(options.audio && { expectedAudioChunks: options.expectedAudioChunks }) },
    firstTimestampBehavior: "strict",
  });
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
