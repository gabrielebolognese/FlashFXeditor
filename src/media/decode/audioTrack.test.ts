import { describe, expect, it } from "vitest";
import { ByteSource, ChunkCache } from "../bytes/ByteSource.js";
import { readMp4 } from "../probe/mp4Probe.js";
import { buildMp4, videoSamples, type TestMp4Options, type TestSample, type TestTrack } from "../probe/testMp4.js";
import { audioPlan, decodeAudioRange, downmix, packetRange, PREROLL_SAMPLES, type AudioDataLike, type AudioDecodeDeps, type AudioTrackPlan } from "./audioTrack.js";

const RATE = 48_000;
const aacSamples = (count: number): TestSample[] => Array.from({ length: count }, () => ({ duration: 1024 }));

async function parse(options: TestMp4Options) {
  const bytes = buildMp4(options);
  const source = new ByteSource(new Blob([bytes as Uint8Array<ArrayBuffer>]), new ChunkCache());
  return { file: await readMp4(source), source };
}

const audioTrack = (extra: Partial<TestTrack> = {}): TestTrack => ({ kind: "audio", codec: "mp4a", timescale: RATE, channels: 2, sampleRate: RATE, samples: aacSamples(100), ...extra });
const videoTrack = (extra: Partial<TestTrack> = {}): TestTrack => ({ kind: "video", codec: "avc1", timescale: 600, width: 64, height: 64, samples: videoSamples(60, 20), ...extra });

async function planOf(options: TestMp4Options): Promise<AudioTrackPlan> {
  const plan = audioPlan((await parse(options)).file);
  if (!plan) throw new Error("no audio plan");
  return plan;
}

describe("audioPlan", () => {
  it("skips the AAC priming the audio edit list names", async () => {
    const plan = await planOf({ tracks: [videoTrack({ edit: { mediaTime: 0 } }), audioTrack({ edit: { mediaTime: 2112 } })] });
    expect(plan.trackStart).toBeCloseTo(2112 / RATE, 9);
    expect(plan.duration).toBeCloseTo((100 * 1024 - 2112) / RATE, 9);
    expect(plan.description).toEqual(Uint8Array.from([0x11, 0x90]));
    expect(plan.sampleRate).toBe(RATE);
    expect(plan.channels).toBe(2);
  });

  it("starts media time at the video's first frame (composition offset with or without an edit list)", async () => {
    const shifted = videoSamples(60, 20).map((sample) => ({ ...sample, ctsOffset: 20 }));
    const withEdit = await planOf({ tracks: [videoTrack({ samples: shifted, edit: { mediaTime: 20 } }), audioTrack({ edit: { mediaTime: 1024 } })] });
    expect(withEdit.trackStart).toBeCloseTo(1024 / RATE, 9);
    // No video edit list: the first frame shows at movie time 1/30 s, and so does audio media time 0.
    const noEdit = await planOf({ tracks: [videoTrack({ samples: shifted }), audioTrack({ edit: { mediaTime: 1024 } })] });
    expect(noEdit.trackStart).toBeCloseTo(20 / 600 + 1024 / RATE, 9);
  });

  it("delays audio after a leading empty edit and ends it where the edit ends", async () => {
    const plan = await planOf({ movieTimescale: 1000, tracks: [audioTrack({ edit: { empty: 500, mediaTime: 0, duration: 1000 } })] });
    expect(plan.trackStart).toBeCloseTo(-0.5, 9);
    expect(plan.duration).toBeCloseTo(1.5, 9);
  });

  it("needs an audio track", async () => {
    expect(audioPlan((await parse({ tracks: [videoTrack()] })).file)).toBeNull();
  });
});

describe("packetRange", () => {
  it("feeds the packets of a range plus the preroll", async () => {
    const plan = await planOf({ tracks: [audioTrack()] });
    // Packet i covers [i * 1024, (i + 1) * 1024) frames.
    expect(packetRange(plan, 0, 1024 / RATE)).toEqual({ first: 0, last: 0 });
    expect(packetRange(plan, (10 * 1024 + 5) / RATE, (12 * 1024) / RATE)).toEqual({ first: 10 - PREROLL_SAMPLES, last: 11 });
    expect(packetRange(plan, 200, 201)).toBeNull();
  });
});

/** A decoder whose packet i (by timestamp) decodes to 1024 frames of (i + 1) / 1000 (negated on the second channel). */
function fakeDeps(source: ByteSource, channels = 2): AudioDecodeDeps & { fed: number[] } {
  const fed: number[] = [];
  return {
    fed,
    read: (offset, size) => source.read(offset, size),
    createChunk: (init) => init as unknown as EncodedAudioChunk,
    createDecoder: ({ output }) => {
      const queue: AudioDataLike[] = [];
      return {
        decodeQueueSize: 0,
        configure: () => undefined,
        decode: (chunk) => {
          const index = Math.round((chunk.timestamp / 1e6) * (RATE / 1024));
          fed.push(index);
          const value = (index + 1) / 1000;
          queue.push({
            timestamp: chunk.timestamp,
            numberOfFrames: 1024,
            numberOfChannels: channels,
            sampleRate: RATE,
            copyTo: (destination, { planeIndex }) => destination.fill(planeIndex % 2 === 0 ? value : -value, 0, 1024),
            close: () => undefined,
          });
        },
        flush: async () => {
          for (const data of queue.splice(0)) output(data);
        },
        close: () => undefined,
      };
    },
  };
}

describe("decodeAudioRange", () => {
  it("places every output by its timestamp, past the priming, and drops the preroll", async () => {
    const { file, source } = await parse({ tracks: [audioTrack({ edit: { mediaTime: 1024 + 512 } })] });
    const plan = audioPlan(file) as AudioTrackPlan;
    const deps = fakeDeps(source);
    // Media frame 0 is packet 1's frame 512.
    const result = await decodeAudioRange(plan, { from: 1000, to: 3000, rate: RATE }, deps);
    expect(result.sampleRate).toBe(RATE);
    expect(result.channels).toHaveLength(2);
    const [left, right] = result.channels as [Float32Array, Float32Array];
    expect(left).toHaveLength(2000);
    const packetOf = (mediaFrame: number) => Math.floor((mediaFrame + 1024 + 512) / 1024);
    for (const frame of [1000, 1535, 1536, 2559, 2560, 2999]) {
      expect(left[frame - 1000]).toBeCloseTo((packetOf(frame) + 1) / 1000, 6);
      expect(right[frame - 1000]).toBeCloseTo(-(packetOf(frame) + 1) / 1000, 6);
    }
    expect(deps.fed[0]).toBe(packetOf(1000) - PREROLL_SAMPLES);
  });

  it("leaves frames before a delayed track silent", async () => {
    const { file, source } = await parse({ movieTimescale: 1000, tracks: [audioTrack({ edit: { empty: 10, mediaTime: 0 } })] });
    const plan = audioPlan(file) as AudioTrackPlan;
    const result = await decodeAudioRange(plan, { from: 0, to: 960, rate: RATE }, fakeDeps(source));
    const left = result.channels[0] as Float32Array;
    expect(left[479]).toBe(0);
    expect(left[480]).toBeCloseTo(0.001, 6);
  });

  it("mixes 5.1 down to stereo", async () => {
    const { file, source } = await parse({ tracks: [audioTrack({ channels: 6 })] });
    const plan = audioPlan(file) as AudioTrackPlan;
    const result = await decodeAudioRange(plan, { from: 0, to: 1024, rate: RATE }, fakeDeps(source, 6));
    expect(result.channels).toHaveLength(2);
    // Even channels (L, C, SL) carry +0.001, odd ones (R, LFE, SR) -0.001: L = L + 0.707 (C + SL), R = R + 0.707 (C + SR).
    expect((result.channels[0] as Float32Array)[0]).toBeCloseTo(0.001 * (1 + 2 * Math.SQRT1_2), 6);
    expect((result.channels[1] as Float32Array)[0]).toBeCloseTo(-0.001, 6);
  });

  it("stops when aborted", async () => {
    const { file, source } = await parse({ tracks: [audioTrack()] });
    const controller = new AbortController();
    controller.abort();
    await expect(decodeAudioRange(audioPlan(file) as AudioTrackPlan, { from: 0, to: 4096, rate: RATE }, fakeDeps(source), controller.signal)).rejects.toThrow();
  });
});

describe("downmix", () => {
  it("keeps mono and stereo, and mixes quad", () => {
    const mono = [Float32Array.of(1)];
    expect(downmix(mono)).toEqual(mono);
    const [l, r] = downmix([Float32Array.of(1), Float32Array.of(0.5), Float32Array.of(0), Float32Array.of(0.5)]);
    expect(l?.[0]).toBeCloseTo(0.5, 6);
    expect(r?.[0]).toBeCloseTo(0.5, 6);
  });
});
