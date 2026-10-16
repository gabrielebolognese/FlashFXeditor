import { beforeEach, describe, expect, it } from "vitest";
import { createSampleIndex, type SampleIndex } from "../demux/sampleIndex.js";
import { FakeDecoder, FakeFrame, frameCounter } from "../decode/testDecoder.js";
import { MAX_QUEUE, PROGRESS_EVERY, ProxyMaker, type EncoderCallbacks, type EncoderLike, type MakeProxyParams, type MuxerLike, type MuxerOptions, type ProxyProgress } from "./ProxyMaker.js";

const DUR = 1000;
const TIMESCALE = 30000;

/** `count` frames, a sync sample every `gop`, starting at cts `start` (ticks of DUR). */
function index(count: number, gop = 30, start = 0, codedWidth = 3840, codedHeight = 2160): SampleIndex {
  const frames = Array.from({ length: count }, (_, i) => i);
  return createSampleIndex({
    codec: "hvc1.1.6.L153.B0",
    description: new Uint8Array([1]),
    codedWidth,
    codedHeight,
    rotation: 90,
    timescale: TIMESCALE,
    offsets: Float64Array.from(frames, (i) => i * 10),
    sizes: Uint32Array.from(frames, () => 10),
    dts: Float64Array.from(frames, (i) => (start + i) * DUR),
    cts: Float64Array.from(frames, (i) => (start + i) * DUR),
    durations: Uint32Array.from(frames, () => DUR),
    sync: Uint8Array.from(frames, (i) => (i % gop === 0 ? 1 : 0)),
  });
}

interface Chunk {
  timestamp: number;
  keyFrame: boolean;
}

class FakeEncoder implements EncoderLike<FakeFrame> {
  encodeQueueSize = 0;
  maxQueue = 0;
  config: VideoEncoderConfig | null = null;
  readonly encoded: Chunk[] = [];
  closed = false;
  failAt: number | null = null;

  constructor(private readonly callbacks: EncoderCallbacks<Chunk>) {}

  configure(config: VideoEncoderConfig): void {
    this.config = config;
  }

  encode(frame: FakeFrame, options: { keyFrame: boolean }): void {
    if (frame.isClosed) throw new Error("encode of a closed frame");
    const chunk = { timestamp: frame.timestamp, keyFrame: options.keyFrame };
    this.encodeQueueSize += 1;
    this.maxQueue = Math.max(this.maxQueue, this.encodeQueueSize);
    queueMicrotask(() => {
      if (this.closed) return;
      this.encodeQueueSize -= 1;
      this.callbacks.dequeue();
      if (chunk.timestamp === this.failAt) {
        this.callbacks.error(new Error("encode failed"));
        return;
      }
      this.encoded.push(chunk);
      this.callbacks.output(chunk);
    });
  }

  async flush(): Promise<void> {
    while (this.encodeQueueSize > 0) await Promise.resolve();
  }

  close(): void {
    this.closed = true;
  }
}

function setup(idx: SampleIndex, supported: (codec: string) => boolean = () => true) {
  const decoders: FakeDecoder[] = [];
  const encoders: FakeEncoder[] = [];
  const muxers: { options: MuxerOptions; chunks: Chunk[]; finalized: boolean }[] = [];
  const reads: number[] = [];
  let released = 0;
  const maker = new ProxyMaker<FakeFrame, Chunk>({
    openSource: () => ({
      read: async (offset) => {
        reads.push(offset);
        return new ArrayBuffer(10);
      },
      release: () => {
        released += 1;
      },
    }),
    loadIndex: async () => idx,
    createDecoder: (callbacks) => {
      const decoder = new FakeDecoder(callbacks, { auto: true });
      decoders.push(decoder);
      return decoder;
    },
    createEncoder: (callbacks) => {
      const encoder = new FakeEncoder(callbacks);
      encoders.push(encoder);
      return encoder;
    },
    isEncoderSupported: async (config) => supported(config.codec),
    scale: (frame) => new FakeFrame(frame.timestamp),
    createMuxer: (options, onData): MuxerLike<Chunk> => {
      const muxer = { options, chunks: [] as Chunk[], finalized: false };
      muxers.push(muxer);
      let position = 8;
      onData(new Uint8Array(8), 0);
      return {
        add: (chunk) => {
          muxer.chunks.push(chunk);
          onData(new Uint8Array([muxer.chunks.length]), position);
          position += 1;
        },
        finalize: () => {
          muxer.finalized = true;
          onData(new Uint8Array([0xff]), 0);
        },
      };
    },
  });
  return { maker, decoders, encoders, muxers, reads, released: () => released };
}

const params = (fps = 60): MakeProxyParams => ({ mediaId: "m", file: new File([], "m.mp4"), cachedIndex: null, shortEdge: 540, fps });

beforeEach(() => {
  frameCounter.open = 0;
});

describe("ProxyMaker", () => {
  it("decodes every sample in order, scales, encodes a keyframe every 15 frames and streams the file", async () => {
    const t = setup(index(40));
    const values: ProxyProgress[] = [];
    const result = await t.maker.make(params(), new AbortController().signal, (value) => values.push(value));
    expect(result).toEqual({ width: 960, height: 540, codec: "avc1.4d4020", frames: 40, bytes: 48 });
    const encoder = t.encoders[0] as FakeEncoder;
    expect(encoder.config).toMatchObject({ codec: "avc1.4d4020", width: 960, height: 540, bitrate: 3_000_000, framerate: 60, avc: { format: "avc" } });
    expect(encoder.encoded.map((c) => c.keyFrame).flatMap((key, i) => (key ? [i] : []))).toEqual([0, 15, 30]);
    // Source times (us) kept on every frame.
    expect(encoder.encoded.map((c) => c.timestamp)).toEqual(t.decoders[0]?.fed.map((c) => c.timestamp));
    expect(t.muxers[0]?.options).toEqual({ width: 960, height: 540, rotation: 90 });
    expect(t.muxers[0]?.finalized).toBe(true);
    const data = values.filter((v) => v.kind === "data");
    expect(data[0]).toMatchObject({ position: 0 });
    expect(data.at(-1)).toMatchObject({ position: 0 });
    expect(data.slice(1, -1).map((v) => v.position)).toEqual(Array.from({ length: 40 }, (_, i) => 8 + i));
    const progress = values.filter((v) => v.kind === "progress");
    expect(progress.map((v) => v.done)).toEqual([10, 20, 30, 40, 40]);
    expect(progress.every((v) => v.total === 40)).toBe(true);
    expect(PROGRESS_EVERY).toBe(10);
    expect(frameCounter.open).toBe(0);
    expect(encoder.closed).toBe(true);
    expect(t.decoders[0]?.state).toBe("closed");
    expect(t.released()).toBe(1);
  });

  it("keeps the decoder and encoder queues short", async () => {
    const t = setup(index(60));
    await t.maker.make(params(), new AbortController().signal, () => undefined);
    expect(t.decoders[0]?.maxQueue).toBeLessThanOrEqual(MAX_QUEUE);
    expect(t.encoders[0]?.maxQueue).toBeLessThanOrEqual(MAX_QUEUE + 1);
  });

  it("starts at the first sync sample", async () => {
    const idx = index(10, 4);
    idx.sync[0] = 0;
    const t = setup(idx);
    const result = await t.maker.make(params(), new AbortController().signal, () => undefined);
    expect(result.frames).toBe(6);
    expect(t.reads[0]).toBe(40);
  });

  it("stops feeding while paused and goes on when resumed", async () => {
    const t = setup(index(30));
    t.maker.setPaused(true);
    let done = false;
    const making = t.maker.make(params(), new AbortController().signal, () => undefined).then((r) => {
      done = true;
      return r;
    });
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(t.reads).toEqual([]);
    expect(done).toBe(false);
    t.maker.setPaused(false);
    expect((await making).frames).toBe(30);
  });

  it("stops at an abort, closes the codecs and every frame", async () => {
    const t = setup(index(300));
    const controller = new AbortController();
    const making = t.maker.make(params(), controller.signal, (value) => {
      if (value.kind === "progress" && value.done === 20) controller.abort();
    });
    await expect(making).rejects.toMatchObject({ name: "AbortError" });
    expect(t.reads.length).toBeLessThan(60);
    expect(t.muxers[0]?.finalized).toBe(false);
    expect(t.encoders[0]?.closed).toBe(true);
    expect(t.released()).toBe(1);
    await Promise.resolve();
    expect(frameCounter.open).toBe(0);
  });

  it("falls back to High, then Baseline, and fails without any H.264 encoder", async () => {
    const high = setup(index(5), (codec) => codec.startsWith("avc1.64"));
    expect((await high.maker.make(params(30), new AbortController().signal, () => undefined)).codec).toBe("avc1.64001f");
    const none = setup(index(5), () => false);
    await expect(none.maker.make(params(30), new AbortController().signal, () => undefined)).rejects.toMatchObject({ name: "ProxyEncoderError" });
    expect(none.released()).toBe(1);
  });

  it("estimates the frame rate from the frame times when none is given", async () => {
    const t = setup(index(31));
    await t.maker.make(params(0), new AbortController().signal, () => undefined);
    expect(t.encoders[0]?.config?.framerate).toBeCloseTo(30, 6);
  });

  it("rejects when the encoder fails", async () => {
    const t = setup(index(40));
    const making = t.maker.make(params(), new AbortController().signal, () => {
      const encoder = t.encoders[0];
      if (encoder && encoder.failAt === null) encoder.failAt = Math.round((5 * DUR * 1e6) / TIMESCALE);
    });
    await expect(making).rejects.toThrow("encode failed");
    expect(t.muxers[0]?.finalized).toBe(false);
  });
});
