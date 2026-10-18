import { describe, expect, it } from "vitest";
import type { Frame } from "../core/document/types.js";
import { exportPlan } from "./plan.js";
import { AUDIO_BLOCK, ExportEncoderError, MAX_ENCODE_QUEUE, PauseGate, runExport, type EncoderCallbacks, type MuxOptions, type PipelineDeps, type PipelineJob, type PipelineProgress } from "./pipeline.js";

const FORMAT = { codec: "avc" as const, width: 1080, height: 1920, fps: { num: 30, den: 1 }, videoBitrate: 12_000_000, maxBitrate: 12_000_000, bitrateMode: "variable" as const, hardware: "no-preference" as const, sampleRate: 48000 as const, channels: 2 as const, audioBitrate: 192_000 };

class FakeFrame {
  closed = false;
  constructor(
    readonly frame: Frame,
    readonly timestamp: number,
    readonly duration: number,
  ) {}
  close(): void {
    this.closed = true;
  }
}

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

interface VideoChunk {
  frame: Frame;
  timestamp: number;
  duration: number;
  key: boolean;
}

interface AudioChunk {
  timestamp: number;
  samples: number;
  first: [number, number];
}

/** An encoder that takes a microtask per frame (its queue goes up and down as a real one's). */
class FakeVideoEncoder {
  encodeQueueSize = 0;
  maxQueue = 0;
  config: VideoEncoderConfig | null = null;
  closed = false;
  flushed = false;
  failAt: number | null = null;
  constructor(private readonly callbacks: EncoderCallbacks<VideoChunk>) {}
  configure(config: VideoEncoderConfig): void {
    this.config = config;
  }
  encode(frame: FakeFrame, options: { keyFrame: boolean }): void {
    if (frame.closed) throw new Error("encode of a closed frame");
    if (this.closed) throw new Error("encode after close");
    const chunk = { frame: frame.frame, timestamp: frame.timestamp, duration: frame.duration, key: options.keyFrame };
    this.encodeQueueSize += 1;
    this.maxQueue = Math.max(this.maxQueue, this.encodeQueueSize);
    setTimeout(() => {
      if (this.closed) return;
      this.encodeQueueSize -= 1;
      this.callbacks.dequeue();
      if (chunk.frame === this.failAt) {
        this.callbacks.error(new Error("encode failed"));
        return;
      }
      this.callbacks.output(chunk);
    }, 0);
  }
  async flush(): Promise<void> {
    while (this.encodeQueueSize > 0) await new Promise((resolve) => setTimeout(resolve, 0));
    this.flushed = true;
  }
  close(): void {
    this.closed = true;
  }
}

class FakeAudioEncoder {
  encodeQueueSize = 0;
  config: AudioEncoderConfig | null = null;
  closed = false;
  constructor(private readonly callbacks: EncoderCallbacks<AudioChunk>) {}
  configure(config: AudioEncoderConfig): void {
    this.config = config;
  }
  encode(data: FakeAudio): void {
    if (data.closed) throw new Error("encode of closed audio");
    const planes = data.planes;
    this.callbacks.output({ timestamp: data.timestamp, samples: planes[0]?.length ?? 0, first: [planes[0]?.[0] ?? NaN, planes[1]?.[0] ?? NaN] });
  }
  async flush(): Promise<void> {}
  close(): void {
    this.closed = true;
  }
}

interface Harness {
  deps: PipelineDeps<FakeFrame, FakeAudio, VideoChunk, AudioChunk>;
  rendered: Frame[];
  frames: FakeFrame[];
  video: () => FakeVideoEncoder;
  audio: () => FakeAudioEncoder | null;
  muxed: { video: VideoChunk[]; audio: AudioChunk[]; options: MuxOptions | null; finalized: boolean };
  /** Called before each render with the frame index rendered so far. */
  beforeRender: ((count: number) => void | Promise<void>) | null;
}

function harness(options: { video?: (config: VideoEncoderConfig) => boolean; audio?: (config: AudioEncoderConfig) => boolean } = {}): Harness {
  let video: FakeVideoEncoder | null = null;
  let audio: FakeAudioEncoder | null = null;
  const muxed: Harness["muxed"] = { video: [], audio: [], options: null, finalized: false };
  const h: Harness = {
    rendered: [],
    frames: [],
    video: () => video as FakeVideoEncoder,
    audio: () => audio,
    muxed,
    beforeRender: null,
    deps: {
      render: async (frame, timestampUs, durationUs) => {
        await h.beforeRender?.(h.rendered.length);
        h.rendered.push(frame);
        const out = new FakeFrame(frame, timestampUs, durationUs);
        h.frames.push(out);
        return out;
      },
      createVideoEncoder: (callbacks) => (video = new FakeVideoEncoder(callbacks)),
      createAudioEncoder: (callbacks) => (audio = new FakeAudioEncoder(callbacks)),
      videoSupported: async (config) => options.video?.(config) ?? true,
      audioSupported: async (config) => options.audio?.(config) ?? true,
      audioData: (planes, _sampleRate, timestampUs) => new FakeAudio(planes, timestampUs),
      createMuxer: (muxOptions, onData) => {
        muxed.options = muxOptions;
        return {
          addVideo: (chunk) => {
            muxed.video.push(chunk);
            onData(new Uint8Array([chunk.frame & 255]), muxed.video.length - 1);
          },
          addAudio: (chunk) => muxed.audio.push(chunk),
          finalize: () => {
            muxed.finalized = true;
            onData(new Uint8Array([9, 9]), 0);
          },
        };
      },
      now: () => 0,
    },
  };
  return h;
}

function job(frames: number, audio: Float32Array[] | null = null, projectFps = { num: 30, den: 1 }): PipelineJob {
  return { plan: exportPlan({ start: 0, end: frames }, projectFps, FORMAT.fps, 2, 48000), format: FORMAT, audio };
}

/** Resolves when the export waits at `gate` while it is paused (parked between frames): no wall-clock sleeps, which a loaded machine outlasts. */
function parked(gate: PauseGate): Promise<void> {
  return new Promise((resolve) => {
    const wait = gate.wait.bind(gate);
    gate.wait = (signal) => {
      if (gate.paused) resolve();
      return wait(signal);
    };
  });
}

describe("runExport", () => {
  it("renders, encodes and muxes every frame with exact timestamps, keyframes every 2 s, and closes each frame", async () => {
    const h = harness();
    const progress: PipelineProgress[] = [];
    const result = await runExport(job(150), h.deps, new AbortController().signal, (value) => progress.push(value));
    expect(result).toMatchObject({ frames: 150, videoCodec: "avc1.640028", audioCodec: "mp4a.40.2" });
    expect(h.rendered).toEqual(Array.from({ length: 150 }, (_, k) => k));
    expect(h.frames.every((frame) => frame.closed)).toBe(true);
    expect(h.muxed.video.map((chunk) => chunk.timestamp).slice(0, 4)).toEqual([0, 33333, 66667, 100000]);
    expect(h.muxed.video.filter((chunk) => chunk.key).map((chunk) => chunk.frame)).toEqual([0, 60, 120]);
    // Durations fill the time exactly (no gap, no overlap).
    const last = h.muxed.video[149] as VideoChunk;
    expect(last.timestamp + last.duration).toBe(5_000_000);
    expect(h.muxed.finalized).toBe(true);
    expect(h.video().flushed).toBe(true);
    expect(h.video().closed).toBe(true);
    expect(h.audio()?.closed).toBe(true);
    expect(progress[0]).toEqual({ kind: "started", videoCodec: "avc1.640028", audioCodec: "mp4a.40.2" });
    expect(progress.at(-1)).toEqual({ kind: "frames", done: 150, total: 150 });
    expect(progress.filter((value) => value.kind === "bytes")).toHaveLength(151);
  });

  it("tells the muxer the codecs, the size, a whole-tick timescale and the chunk counts", async () => {
    const h = harness();
    await runExport(job(90), h.deps, new AbortController().signal, () => undefined);
    expect(h.muxed.options).toEqual({
      video: { codec: "avc", width: 1080, height: 1920, timescale: 90_000 },
      audio: { codec: "aac", sampleRate: 48000, channels: 2 },
      expectedVideoChunks: 90,
      expectedAudioChunks: Math.ceil(144_000 / 1024) + 8,
    });
  });

  it("never lets the encoder hold more than MAX_ENCODE_QUEUE frames before rendering the next", async () => {
    const h = harness();
    let maxAtRender = 0;
    h.beforeRender = () => {
      maxAtRender = Math.max(maxAtRender, h.video().encodeQueueSize);
    };
    await runExport(job(60), h.deps, new AbortController().signal, () => undefined);
    expect(h.video().maxQueue).toBeLessThanOrEqual(MAX_ENCODE_QUEUE);
    expect(maxAtRender).toBeLessThanOrEqual(MAX_ENCODE_QUEUE);
  });

  it("exports every other frame of a 60 fps project at 30 fps", async () => {
    const h = harness();
    const plan = exportPlan({ start: 0, end: 20 }, { num: 60, den: 1 }, FORMAT.fps, 2, 48000);
    await runExport({ plan, format: FORMAT, audio: null }, h.deps, new AbortController().signal, () => undefined);
    expect(h.rendered).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18]);
  });

  it("feeds the mix in blocks interleaved with the frames, silence past its end, as long as the video", async () => {
    const h = harness();
    const left = new Float32Array(10_000).fill(0.5);
    const right = new Float32Array(10_000).fill(-0.5);
    const fedBefore: number[] = [];
    h.beforeRender = () => {
      fedBefore.push((h.muxed.audio.at(-1)?.timestamp ?? -1) + (h.muxed.audio.at(-1)?.samples ?? 0) * (1e6 / 48000));
    };
    const result = await runExport(job(30, [left, right]), h.deps, new AbortController().signal, () => undefined);
    const chunks = h.muxed.audio;
    expect(result.samples).toBe(48000);
    expect(chunks.reduce((sum, chunk) => sum + chunk.samples, 0)).toBe(48000);
    expect(chunks.every((chunk) => chunk.samples <= AUDIO_BLOCK)).toBe(true);
    // Contiguous timestamps from 0.
    let at = 0;
    for (const chunk of chunks) {
      expect(chunk.timestamp).toBe(Math.round((at * 1e6) / 48000));
      at += chunk.samples;
    }
    expect(chunks[0]?.first).toEqual([0.5, -0.5]);
    expect(chunks.at(-1)?.first).toEqual([0, 0]);
    // Before frame k is rendered, the audio reaches at least the end of frame k - 1 (interleaved).
    fedBefore.slice(1).forEach((end, k) => expect(end).toBeGreaterThanOrEqual(((k + 1) * 1e6) / 30 - 1));
  });

  it("feeds a mono mix to both channels and silence without a mix", async () => {
    const mono = harness();
    await runExport(job(3, [new Float32Array(4800).fill(0.25)]), mono.deps, new AbortController().signal, () => undefined);
    expect(mono.muxed.audio[0]?.first).toEqual([0.25, 0.25]);
    const silent = harness();
    await runExport(job(3), silent.deps, new AbortController().signal, () => undefined);
    expect(silent.muxed.audio[0]?.first).toEqual([0, 0]);
    expect(silent.muxed.audio.reduce((sum, chunk) => sum + chunk.samples, 0)).toBe(4800);
  });

  it("pauses between frames and goes on when resumed", async () => {
    const h = harness();
    const gate = new PauseGate();
    let resume: (() => void) | null = null;
    h.beforeRender = (count) => {
      if (count === 10) {
        gate.set(true);
        resume = () => gate.set(false);
      }
    };
    const parkedAt = parked(gate);
    const run = runExport(job(20), h.deps, new AbortController().signal, () => undefined, gate);
    await parkedAt;
    // It stays parked: no frame is rendered while paused.
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(h.rendered).toHaveLength(11);
    expect(gate.paused).toBe(true);
    (resume as unknown as () => void)();
    await run;
    expect(h.rendered).toHaveLength(20);
  });

  it("stops with an AbortError at the next frame, closes the encoders and never finalizes", async () => {
    const h = harness();
    const controller = new AbortController();
    h.beforeRender = (count) => {
      if (count === 12) controller.abort();
    };
    await expect(runExport(job(60), h.deps, controller.signal, () => undefined)).rejects.toMatchObject({ name: "AbortError" });
    expect(h.rendered.length).toBeLessThanOrEqual(13);
    expect(h.frames.every((frame) => frame.closed)).toBe(true);
    expect(h.video().closed).toBe(true);
    expect(h.audio()?.closed).toBe(true);
    expect(h.muxed.finalized).toBe(false);
  });

  it("starts paused when its gate is (a Pause before the job was posted), then runs once resumed", async () => {
    const h = harness();
    const gate = new PauseGate();
    gate.set(true);
    const kinds: string[] = [];
    const parkedAt = parked(gate);
    const run = runExport(job(10), h.deps, new AbortController().signal, (progress) => kinds.push(progress.kind), gate);
    await parkedAt;
    expect(kinds).toContain("started");
    expect(h.rendered).toHaveLength(0);
    gate.set(false);
    await run;
    expect(h.rendered).toHaveLength(10);
  });

  it("stops a paused export when it is aborted", async () => {
    const h = harness();
    const controller = new AbortController();
    const gate = new PauseGate();
    gate.set(true);
    const parkedAt = parked(gate);
    const run = runExport(job(10), h.deps, controller.signal, () => undefined, gate);
    await parkedAt;
    controller.abort();
    await expect(run).rejects.toMatchObject({ name: "AbortError" });
    expect(h.rendered).toHaveLength(0);
  });

  it("fails with the encoder's error", async () => {
    const h = harness();
    h.beforeRender = (count) => {
      if (count === 0) h.video().failAt = 5;
    };
    await expect(runExport(job(60), h.deps, new AbortController().signal, () => undefined)).rejects.toThrow("encode failed");
    expect(h.muxed.finalized).toBe(false);
    expect(h.video().closed).toBe(true);
  });

  it("takes the first supported configuration and fails when there is none", async () => {
    const main = harness({ video: (config) => config.codec.startsWith("avc1.4d") });
    const result = await runExport(job(3), main.deps, new AbortController().signal, () => undefined);
    expect(result.videoCodec).toBe("avc1.4d4028");
    expect(main.video().config?.codec).toBe("avc1.4d4028");
    const none = harness({ video: () => false });
    await expect(runExport(job(3), none.deps, new AbortController().signal, () => undefined)).rejects.toBeInstanceOf(ExportEncoderError);
  });

  it("writes a file without sound when no audio encoder is available", async () => {
    const h = harness({ audio: () => false });
    const result = await runExport(job(5), h.deps, new AbortController().signal, () => undefined);
    expect(result.audioCodec).toBeNull();
    expect(h.audio()).toBeNull();
    expect(h.muxed.options?.audio).toBeNull();
    expect(h.muxed.finalized).toBe(true);
  });
});
