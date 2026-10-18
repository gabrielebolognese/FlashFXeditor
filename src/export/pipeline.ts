// The export loop (spec §16, P5, P13), run by export.worker; the browser parts (renderer, WebCodecs,
// mp4-muxer) are injected, fakes in the tests.
// - The first encoder configuration the browser supports (codecs.ts), and AAC (else Opus) for the
//   audio; no audio encoder at all leaves the file without sound rather than failing.
// - Each exported frame is rendered, then encoded once the encoder holds fewer than MAX_ENCODE_QUEUE
//   frames (backpressure: the next frame is rendered only then), with a keyframe every
//   `keyInterval` frames, and closed at once.
// - Audio is fed after each frame until it reaches that frame's end, in AUDIO_BLOCK pieces (at most
//   one block ahead: interleaved with the video in the file), from the mixdown's planes; past their
//   end (or with no mix) it is silence.
// - Chunks go to the muxer as they come out; through `emit` go the chosen codecs (`started`), the
//   muxer's bytes with their file positions (`bytes`) and the progress every PROGRESS_MS (`frames`).
// - `gate` pauses between frames; an aborted signal stops at the next wait with its reason, an
//   encoder error with that error. Encoders are closed whatever happens; the muxer is finalized only
//   when every frame and sample was encoded.
import type { Frame } from "../core/document/types.js";
import { abortError } from "../media/workers/protocol.js";
import { audioEncoderConfigs, chooseConfig, muxerAudioCodec, muxerVideoCodec, videoEncoderConfigs, type VideoConfigFormat } from "./codecs.js";
import { expectedChunks, frameDurationUs, frameTimestampUs, isKeyFrame, projectFrameAt, samplesThrough, sampleTimestampUs, videoTimescale, type ExportPlan } from "./plan.js";
import type { ExportFormat, VideoCodecId } from "./presets.js";

/** Frames the video encoder may hold before the next one is rendered (spec §16). */
export const MAX_ENCODE_QUEUE = 4;
/** Audio chunks the audio encoder may hold before more is fed. */
export const MAX_AUDIO_QUEUE = 8;
/** Audio sample frames per AudioData (100 ms at 48 kHz). */
export const AUDIO_BLOCK = 4800;
/** At most one `frames` progress value this often (ms), and one at the end. */
export const PROGRESS_MS = 100;

/** A frame the encoder takes (VideoFrame in the worker). */
export interface PipelineFrame {
  close(): void;
}

export interface EncoderCallbacks<C> {
  output(chunk: C, meta?: unknown): void;
  error(error: Error): void;
  /** The encoder's queue went down. */
  dequeue(): void;
}

export interface VideoEncoderLike<F> {
  readonly encodeQueueSize: number;
  configure(config: VideoEncoderConfig): void;
  encode(frame: F, options: { keyFrame: boolean }): void;
  flush(): Promise<void>;
  close(): void;
}

export interface AudioEncoderLike<A> {
  readonly encodeQueueSize: number;
  configure(config: AudioEncoderConfig): void;
  encode(data: A): void;
  flush(): Promise<void>;
  close(): void;
}

export interface MuxOptions {
  video: { codec: VideoCodecId; width: number; height: number; timescale: number };
  audio: { codec: "aac" | "opus"; sampleRate: number; channels: number } | null;
  /** Upper bounds of the chunks it will get (room for the tables at the front of the file). */
  expectedVideoChunks: number;
  expectedAudioChunks: number;
}

export interface MuxerLike<VC, AC> {
  addVideo(chunk: VC, meta?: unknown): void;
  addAudio(chunk: AC, meta?: unknown): void;
  finalize(): void;
}

export interface PipelineDeps<F extends PipelineFrame, A extends PipelineFrame, VC, AC> {
  /** The exported frame showing project frame `frame` at `timestampUs` for `durationUs`. */
  render(frame: Frame, timestampUs: number, durationUs: number, signal: AbortSignal): Promise<F>;
  createVideoEncoder(callbacks: EncoderCallbacks<VC>): VideoEncoderLike<F>;
  createAudioEncoder(callbacks: EncoderCallbacks<AC>): AudioEncoderLike<A>;
  videoSupported(config: VideoEncoderConfig): Promise<boolean>;
  audioSupported(config: AudioEncoderConfig): Promise<boolean>;
  /** Planar float samples (one array per channel, `count` each) as the audio encoder's input. */
  audioData(planes: readonly Float32Array[], sampleRate: number, timestampUs: number): A;
  /** The muxer; `onData` gets the file's bytes and their positions as they are produced. */
  createMuxer(options: MuxOptions, onData: (data: Uint8Array, position: number) => void): MuxerLike<VC, AC>;
  now(): number;
}

export type PipelineProgress =
  | { kind: "started"; videoCodec: string; audioCodec: string | null }
  | { kind: "frames"; done: number; total: number }
  | { kind: "bytes"; position: number; data: ArrayBuffer };

export interface PipelineResult {
  frames: number;
  samples: number;
  videoCodec: string;
  audioCodec: string | null;
  /** Wall time of the loop (ms). */
  ms: number;
}

/** No encoder configuration was accepted. */
export class ExportEncoderError extends Error {
  override name = "ExportEncoderError";
}

/** Pauses an export between frames. */
export class PauseGate {
  private pausedValue = false;
  private waiters: (() => void)[] = [];

  get paused(): boolean {
    return this.pausedValue;
  }

  set(paused: boolean): void {
    this.pausedValue = paused;
    if (!paused) for (const wake of this.waiters.splice(0)) wake();
  }

  /** Resolves at once while running; while paused, when resumed (or rejects when `signal` aborts). */
  async wait(signal: AbortSignal): Promise<void> {
    while (this.pausedValue) {
      signal.throwIfAborted();
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => reject(signal.reason ?? abortError());
        signal.addEventListener("abort", onAbort, { once: true });
        this.waiters.push(() => {
          signal.removeEventListener("abort", onAbort);
          resolve();
        });
      });
    }
  }
}

export interface PipelineJob {
  plan: ExportPlan;
  format: VideoConfigFormat & Pick<ExportFormat, "sampleRate" | "channels" | "audioBitrate">;
  /** The mix of the range (one plane per channel), or null for silence. */
  audio: readonly Float32Array[] | null;
}

export async function runExport<F extends PipelineFrame, A extends PipelineFrame, VC, AC>(
  job: PipelineJob,
  deps: PipelineDeps<F, A, VC, AC>,
  signal: AbortSignal,
  emit: (progress: PipelineProgress) => void,
  gate: PauseGate = new PauseGate(),
): Promise<PipelineResult> {
  const { plan, format } = job;
  const started = deps.now();
  signal.throwIfAborted();
  const videoConfig = await chooseConfig(videoEncoderConfigs(format), (config) => deps.videoSupported(config));
  if (!videoConfig) throw new ExportEncoderError(`This browser cannot encode ${format.width}x${format.height} video`);
  const audioConfig = await chooseConfig(audioEncoderConfigs(format), (config) => deps.audioSupported(config));
  if (!audioConfig) console.warn("[export] no audio encoder: the file has no sound");
  signal.throwIfAborted();
  emit({ kind: "started", videoCodec: videoConfig.codec, audioCodec: audioConfig?.codec ?? null });

  let failure: Error | null = null;
  let waiters: (() => void)[] = [];
  const wake = () => {
    for (const resolve of waiters.splice(0)) resolve();
  };
  const fail = (error: Error) => {
    failure ??= error;
    wake();
  };
  const check = () => {
    signal.throwIfAborted();
    if (failure) throw failure;
  };
  const onAbort = () => wake();
  signal.addEventListener("abort", onAbort);
  /** Waits for a dequeue (or a failure, or the abort) while `full()`. */
  const drain = async (full: () => boolean) => {
    while (full()) {
      check();
      await new Promise<void>((resolve) => waiters.push(resolve));
    }
    check();
  };

  const audioCodec = audioConfig ? muxerAudioCodec(audioConfig.codec) : null;
  const expected = expectedChunks(plan, audioCodec);
  const muxer = deps.createMuxer(
    {
      video: { codec: muxerVideoCodec(videoConfig.codec), width: format.width, height: format.height, timescale: videoTimescale(plan.fps) },
      audio: audioCodec ? { codec: audioCodec, sampleRate: plan.sampleRate, channels: format.channels } : null,
      expectedVideoChunks: expected.video,
      expectedAudioChunks: expected.audio,
    },
    (data, position) => emit({ kind: "bytes", position, data: data.slice().buffer }),
  );
  const video = deps.createVideoEncoder({ output: (chunk, meta) => muxer.addVideo(chunk, meta), error: fail, dequeue: wake });
  const audio = audioConfig ? deps.createAudioEncoder({ output: (chunk, meta) => muxer.addAudio(chunk, meta), error: fail, dequeue: wake }) : null;
  let lastProgress = -Infinity;
  const progress = (done: number, force = false) => {
    const now = deps.now();
    if (!force && now - lastProgress < PROGRESS_MS) return;
    lastProgress = now;
    emit({ kind: "frames", done, total: plan.frames });
  };

  let fed = 0;
  const channels = format.channels;
  /** Feeds the audio encoder up to sample `target`. */
  const feedAudio = async (target: number) => {
    if (!audio) return;
    while (fed < target) {
      await drain(() => audio.encodeQueueSize >= MAX_AUDIO_QUEUE);
      const count = Math.min(AUDIO_BLOCK, plan.samples - fed);
      const planes: Float32Array[] = [];
      for (let c = 0; c < channels; c++) {
        // A mono mix feeds both channels; past the mix's end (or without one) silence.
        const source = job.audio?.[Math.min(c, job.audio.length - 1)];
        const plane = new Float32Array(count);
        if (source && fed < source.length) plane.set(source.subarray(fed, Math.min(source.length, fed + count)));
        planes.push(plane);
      }
      const data = deps.audioData(planes, plan.sampleRate, sampleTimestampUs(fed, plan.sampleRate));
      try {
        audio.encode(data);
      } finally {
        data.close();
      }
      fed += count;
    }
  };

  try {
    video.configure(videoConfig);
    if (audio && audioConfig) audio.configure(audioConfig);
    for (let k = 0; k < plan.frames; k++) {
      await gate.wait(signal);
      check();
      const frame = await deps.render(projectFrameAt(plan, k), frameTimestampUs(plan, k), frameDurationUs(plan, k), signal);
      try {
        await drain(() => video.encodeQueueSize >= MAX_ENCODE_QUEUE);
        video.encode(frame, { keyFrame: isKeyFrame(plan, k) });
      } finally {
        frame.close();
      }
      await feedAudio(samplesThrough(plan, k));
      progress(k + 1);
    }
    await feedAudio(plan.samples);
    check();
    await video.flush();
    if (audio) await audio.flush();
    check();
    muxer.finalize();
    progress(plan.frames, true);
    return { frames: plan.frames, samples: audio ? fed : 0, videoCodec: videoConfig.codec, audioCodec: audioConfig?.codec ?? null, ms: deps.now() - started };
  } finally {
    signal.removeEventListener("abort", onAbort);
    waiters = [];
    for (const encoder of [video, audio]) {
      try {
        encoder?.close();
      } catch {
        // Closed already (an encoder error closes it).
      }
    }
  }
}
