import { describe, expect, it } from "vitest";
import { runAudioExport, WAV_BLOCK, type AudioExportDeps, type AudioExportJob, type AudioMuxOptions } from "./audioExport.js";
import { AUDIO_BLOCK, ExportEncoderError, PauseGate, type EncoderCallbacks, type PipelineProgress } from "./pipeline.js";
import { pcm16, wavBytes, wavHeader, WAV_HEADER_BYTES } from "./wav.js";

describe("wav", () => {
  it("writes a 16-bit PCM RIFF header", () => {
    const header = wavHeader(48_000, 2, 48_000);
    const view = new DataView(header.buffer);
    const text = (offset: number) => String.fromCharCode(...header.subarray(offset, offset + 4));
    expect(header.length).toBe(WAV_HEADER_BYTES);
    expect([text(0), text(8), text(12), text(36)]).toEqual(["RIFF", "WAVE", "fmt ", "data"]);
    expect(view.getUint32(4, true)).toBe(36 + 192_000);
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(48_000);
    expect(view.getUint32(28, true)).toBe(192_000);
    expect(view.getUint16(32, true)).toBe(4);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(192_000);
    expect(wavBytes(48_000, 2)).toBe(44 + 192_000);
  });

  it("interleaves channels, clamps and rounds, and gives silence past a plane's end", () => {
    const left = new Float32Array([0, 1, -1, 2, 0.5]);
    const right = new Float32Array([0.25, -2, NaN]);
    const bytes = pcm16([left, right], 2, 1, 4);
    const view = new DataView(bytes.buffer);
    const samples = Array.from({ length: 8 }, (_, i) => view.getInt16(i * 2, true));
    expect(samples).toEqual([32767, -32767, -32767, 0, 32767, 0, 16384, 0]);
    // A mono mix feeds both channels.
    const mono = new DataView(pcm16([new Float32Array([0.5])], 2, 0, 1).buffer);
    expect([mono.getInt16(0, true), mono.getInt16(2, true)]).toEqual([16384, 16384]);
  });
});

class FakeAudio {
  closed = false;
  constructor(
    readonly planes: readonly Float32Array[],
    readonly timestamp: number,
  ) {}
  close(): void {
    this.closed = true;
  }
}

interface Chunk {
  timestamp: number;
  samples: number;
}

function harness(options: { supported?: (config: AudioEncoderConfig) => boolean } = {}) {
  const muxed: { chunks: Chunk[]; options: AudioMuxOptions | null; finalized: boolean } = { chunks: [], options: null, finalized: false };
  const state = { encoder: null as { config: AudioEncoderConfig | null; closed: boolean } | null };
  const deps: AudioExportDeps<FakeAudio, Chunk> = {
    createAudioEncoder: (callbacks: EncoderCallbacks<Chunk>) => {
      const encoder = {
        encodeQueueSize: 0,
        config: null as AudioEncoderConfig | null,
        closed: false,
        configure(config: AudioEncoderConfig) {
          encoder.config = config;
        },
        encode(data: FakeAudio) {
          if (data.closed) throw new Error("closed data");
          callbacks.output({ timestamp: data.timestamp, samples: data.planes[0]?.length ?? 0 });
        },
        flush: async () => undefined,
        close() {
          encoder.closed = true;
        },
      };
      state.encoder = encoder;
      return encoder;
    },
    audioSupported: async (config) => options.supported?.(config) ?? true,
    audioData: (planes, _rate, timestampUs) => new FakeAudio(planes, timestampUs),
    createAudioMuxer: (muxOptions, onData) => {
      muxed.options = muxOptions;
      return {
        addAudio: (chunk) => muxed.chunks.push(chunk),
        finalize: () => {
          muxed.finalized = true;
          onData(new Uint8Array([1, 2, 3]), 0);
        },
      };
    },
    now: () => 0,
  };
  return { deps, muxed, state };
}

const job = (format: "wav" | "m4a", samples: number, planes: Float32Array[] | null = null): AudioExportJob => ({ format, planes, sampleRate: 48_000, channels: 2, samples, audioBitrate: 192_000 });

/** The file the `bytes` progress values write. */
function assemble(progress: PipelineProgress[]): Uint8Array {
  const writes = progress.flatMap((p) => (p.kind === "bytes" ? [p] : []));
  const size = Math.max(...writes.map((w) => w.position + w.data.byteLength));
  const file = new Uint8Array(size);
  for (const w of writes) file.set(new Uint8Array(w.data), w.position);
  return file;
}

describe("runAudioExport", () => {
  it("writes a WAV whose samples are the mix, with silence past its end", async () => {
    const h = harness();
    const samples = WAV_BLOCK * 2 + 100;
    const left = new Float32Array(WAV_BLOCK + 10).fill(0.5);
    const right = new Float32Array(WAV_BLOCK + 10).fill(-0.5);
    const progress: PipelineProgress[] = [];
    const result = await runAudioExport(job("wav", samples, [left, right]), h.deps, new AbortController().signal, (p) => progress.push(p));
    expect(result).toMatchObject({ samples, codec: "pcm-s16" });
    expect(progress[0]).toEqual({ kind: "started", videoCodec: "", audioCodec: "pcm-s16" });
    const file = assemble(progress);
    expect(file.length).toBe(wavBytes(samples, 2));
    const view = new DataView(file.buffer);
    const at = (frame: number, channel: number) => view.getInt16(WAV_HEADER_BYTES + (frame * 2 + channel) * 2, true);
    expect([at(0, 0), at(0, 1)]).toEqual([16384, -16384]);
    expect([at(WAV_BLOCK + 9, 0), at(WAV_BLOCK + 10, 0), at(samples - 1, 1)]).toEqual([16384, 0, 0]);
    expect(progress.at(-1)).toEqual({ kind: "frames", done: samples, total: samples });
  });

  it("encodes an M4A in blocks with exact timestamps, then finalizes the muxer", async () => {
    const h = harness();
    const samples = AUDIO_BLOCK * 3 + 7;
    const progress: PipelineProgress[] = [];
    const result = await runAudioExport(job("m4a", samples, null), h.deps, new AbortController().signal, (p) => progress.push(p));
    expect(result.codec).toBe("mp4a.40.2");
    expect(h.muxed.options).toEqual({ codec: "aac", sampleRate: 48_000, channels: 2, expectedChunks: Math.ceil(samples / 1024) + 8 });
    expect(h.muxed.chunks.map((c) => [c.timestamp, c.samples])).toEqual([
      [0, AUDIO_BLOCK],
      [100_000, AUDIO_BLOCK],
      [200_000, AUDIO_BLOCK],
      [300_000, 7],
    ]);
    expect(h.muxed.finalized).toBe(true);
    expect(h.state.encoder?.closed).toBe(true);
    expect(h.state.encoder?.config).toMatchObject({ codec: "mp4a.40.2", bitrate: 192_000, sampleRate: 48_000, numberOfChannels: 2 });
  });

  it("falls back to Opus, and fails when no encoder is supported", async () => {
    const opus = harness({ supported: (config) => config.codec === "opus" });
    expect((await runAudioExport(job("m4a", 10), opus.deps, new AbortController().signal, () => undefined)).codec).toBe("opus");
    expect(opus.muxed.options?.codec).toBe("opus");
    const none = harness({ supported: () => false });
    await expect(runAudioExport(job("m4a", 10), none.deps, new AbortController().signal, () => undefined)).rejects.toBeInstanceOf(ExportEncoderError);
  });

  it("holds while paused and stops when aborted, closing the encoder", async () => {
    const h = harness();
    const gate = new PauseGate();
    gate.set(true);
    const controller = new AbortController();
    const progress: PipelineProgress[] = [];
    const run = runAudioExport(job("m4a", AUDIO_BLOCK * 4), h.deps, controller.signal, (p) => progress.push(p), gate);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(h.muxed.chunks).toHaveLength(0);
    controller.abort();
    await expect(run).rejects.toMatchObject({ name: "AbortError" });
    expect(h.state.encoder?.closed).toBe(true);
    expect(h.muxed.finalized).toBe(false);
    const wav = harness();
    const wavController = new AbortController();
    wavController.abort();
    await expect(runAudioExport(job("wav", 10), wav.deps, wavController.signal, () => undefined)).rejects.toMatchObject({ name: "AbortError" });
  });
});
