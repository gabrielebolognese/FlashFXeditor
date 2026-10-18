// Export audio (spec §16 extras), run by export.worker: the mixdown of the range as a WAV (16-bit PCM,
// wav.ts) or an M4A (AAC-LC, else Opus, in an audio-only MP4 with its moov at the front). Bytes go out
// with their file positions (`bytes`), the progress as samples done (`frames`, every PROGRESS_MS), the
// codec first (`started`); `gate` pauses between blocks, the signal aborts. The encoder is closed
// whatever happens.
import { audioEncoderConfigs, chooseConfig, muxerAudioCodec } from "./codecs.js";
import { AUDIO_BLOCK, ExportEncoderError, MAX_AUDIO_QUEUE, PauseGate, PROGRESS_MS, type AudioEncoderLike, type EncoderCallbacks, type PipelineFrame, type PipelineProgress } from "./pipeline.js";
import { audioChunkSamples, sampleTimestampUs } from "./plan.js";
import { pcm16, wavHeader, WAV_HEADER_BYTES } from "./wav.js";

export type AudioFileFormat = "wav" | "m4a";

export const AUDIO_FILE_EXTENSIONS: Record<AudioFileFormat, string> = { wav: "wav", m4a: "m4a" };

/** Sample frames per WAV write (1 s at 48 kHz). */
export const WAV_BLOCK = 48_000;

export interface AudioExportJob {
  format: AudioFileFormat;
  /** The mix (one plane per channel; shorter planes end in silence), or null: silence. */
  planes: readonly Float32Array[] | null;
  sampleRate: number;
  channels: number;
  /** Sample frames of the file. */
  samples: number;
  /** AAC bitrate (M4A). */
  audioBitrate: number;
}

export interface AudioMuxerLike<AC> {
  addAudio(chunk: AC, meta?: unknown): void;
  finalize(): void;
}

export interface AudioMuxOptions {
  codec: "aac" | "opus";
  sampleRate: number;
  channels: number;
  /** Upper bound of the chunks (room for the tables at the front of the file). */
  expectedChunks: number;
}

export interface AudioExportDeps<A extends PipelineFrame, AC> {
  createAudioEncoder(callbacks: EncoderCallbacks<AC>): AudioEncoderLike<A>;
  audioSupported(config: AudioEncoderConfig): Promise<boolean>;
  audioData(planes: readonly Float32Array[], sampleRate: number, timestampUs: number): A;
  createAudioMuxer(options: AudioMuxOptions, onData: (data: Uint8Array, position: number) => void): AudioMuxerLike<AC>;
  now(): number;
}

export interface AudioExportResult {
  samples: number;
  /** "pcm-s16" for WAV, else the encoder's codec string. */
  codec: string;
  ms: number;
}

/** Planes [from, from + count) of the mix, silence past its end (a mono mix on every channel). */
function block(job: AudioExportJob, from: number, count: number): Float32Array[] {
  const planes: Float32Array[] = [];
  for (let c = 0; c < job.channels; c++) {
    const source = job.planes?.[Math.min(c, job.planes.length - 1)];
    const plane = new Float32Array(count);
    if (source && from < source.length) plane.set(source.subarray(from, Math.min(source.length, from + count)));
    planes.push(plane);
  }
  return planes;
}

export async function runAudioExport<A extends PipelineFrame, AC>(
  job: AudioExportJob,
  deps: AudioExportDeps<A, AC>,
  signal: AbortSignal,
  emit: (progress: PipelineProgress) => void,
  gate: PauseGate = new PauseGate(),
): Promise<AudioExportResult> {
  const started = deps.now();
  let lastProgress = -Infinity;
  const progress = (done: number, force = false) => {
    const now = deps.now();
    if (!force && now - lastProgress < PROGRESS_MS) return;
    lastProgress = now;
    emit({ kind: "frames", done, total: job.samples });
  };
  const bytes = (data: Uint8Array, position: number) => emit({ kind: "bytes", position, data: data.slice().buffer });
  signal.throwIfAborted();

  if (job.format === "wav") {
    emit({ kind: "started", videoCodec: "", audioCodec: "pcm-s16" });
    bytes(wavHeader(job.samples, job.channels, job.sampleRate), 0);
    for (let done = 0; done < job.samples; ) {
      await gate.wait(signal);
      signal.throwIfAborted();
      const count = Math.min(WAV_BLOCK, job.samples - done);
      bytes(pcm16(block(job, done, count), job.channels, 0, count), WAV_HEADER_BYTES + done * job.channels * 2);
      done += count;
      progress(done);
      // Yields between blocks, so a pause or a cancel is heard.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    progress(job.samples, true);
    return { samples: job.samples, codec: "pcm-s16", ms: deps.now() - started };
  }

  const config = await chooseConfig(audioEncoderConfigs(job), (c) => deps.audioSupported(c));
  if (!config) throw new ExportEncoderError("This browser cannot encode AAC or Opus audio");
  signal.throwIfAborted();
  emit({ kind: "started", videoCodec: "", audioCodec: config.codec });
  const codec = muxerAudioCodec(config.codec);
  const muxer = deps.createAudioMuxer(
    { codec, sampleRate: job.sampleRate, channels: job.channels, expectedChunks: Math.ceil(job.samples / audioChunkSamples(codec, job.sampleRate)) + 8 },
    bytes,
  );
  let failure: Error | null = null;
  let waiters: (() => void)[] = [];
  const wake = () => {
    for (const resolve of waiters.splice(0)) resolve();
  };
  const encoder = deps.createAudioEncoder({
    output: (chunk, meta) => muxer.addAudio(chunk, meta),
    error: (error) => {
      failure ??= error;
      wake();
    },
    dequeue: wake,
  });
  const check = () => {
    signal.throwIfAborted();
    if (failure) throw failure;
  };
  signal.addEventListener("abort", wake);
  try {
    encoder.configure(config);
    for (let done = 0; done < job.samples; ) {
      await gate.wait(signal);
      while (encoder.encodeQueueSize >= MAX_AUDIO_QUEUE) {
        check();
        await new Promise<void>((resolve) => waiters.push(resolve));
      }
      check();
      const count = Math.min(AUDIO_BLOCK, job.samples - done);
      const data = deps.audioData(block(job, done, count), job.sampleRate, sampleTimestampUs(done, job.sampleRate));
      try {
        encoder.encode(data);
      } finally {
        data.close();
      }
      done += count;
      progress(done);
    }
    await encoder.flush();
    check();
    muxer.finalize();
    progress(job.samples, true);
    return { samples: job.samples, codec: config.codec, ms: deps.now() - started };
  } finally {
    signal.removeEventListener("abort", wake);
    waiters = [];
    try {
      encoder.close();
    } catch {
      // Closed already (an encoder error closes it).
    }
  }
}
