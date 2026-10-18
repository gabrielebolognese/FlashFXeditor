import { describe, expect, it } from "vitest";
import { ProbeError } from "../probe/types.js";
import { blobReader } from "./ebml.js";
import { frameAt, keyFor } from "./sampleIndex.js";
import { buildWebm, fakeFrame, interleave, videoBlocks, vp9KeyFrame, type TestBlock, type TestWebmOptions, type TestWebmTrack } from "./testWebm.js";
import { decodeAudioRange, type AudioDataLike, type AudioDecodeDeps } from "../decode/audioTrack.js";
import { probeWebm, readWebm, sampleIndexFromWebm, webmAudioLeadUs, webmAudioPlan, webmProbeResult } from "./webm.js";

const VP9: TestWebmTrack = { number: 1, type: "video", codecId: "V_VP9", width: 1920, height: 1080 };
const OPUS: TestWebmTrack = { number: 2, type: "audio", codecId: "A_OPUS", channels: 2, sampleRate: 48000, codecPrivate: new TextEncoder().encode("OpusHead") };
const reader = (bytes: Uint8Array) => blobReader(new Blob([bytes as Uint8Array<ArrayBuffer>]));
const read = (options: TestWebmOptions, windowBytes?: number) => readWebm(reader(buildWebm(options)), undefined, windowBytes);
/** 30 fps in ms: 33, 33, 34. */
const ms30 = (i: number) => (i % 3 === 2 ? 34 : 33);
/** VP9 frames whose key frames carry a profile 0 header; the others hold their frame index. */
const vp9Frames = (count: number, gop = 30): TestBlock[] => videoBlocks(count, ms30, gop).map((block, i) => ({ ...block, data: block.key ? concat(vp9KeyFrame(0), fakeFrame(i)) : fakeFrame(i) }));
const concat = (a: Uint8Array, b: Uint8Array) => {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
};

describe("readWebm: live recordings (MediaRecorder, screen recorders)", () => {
  const live: TestWebmOptions = { live: true, tracks: [VP9, OPUS], blocks: interleave(vp9Frames(300), 20) };

  it("probes a VP9 + Opus recording with unknown sizes, no Cues and no Duration", async () => {
    const result = await probeWebm(reader(buildWebm(live)));
    // 300 frames 33-34 ms apart: the last starts at 9966 ms and lasts as long as the one before (33 ms).
    expect(result).toEqual({
      kind: "video",
      durationUs: 9_999_000,
      width: 1920,
      height: 1080,
      rotation: 0,
      fps: { num: 30, den: 1 },
      hasAudio: true,
      codec: "vp09.00.40.08",
      audioCodec: "opus",
      audio: { channels: 2, sampleRate: 48000 },
    });
  });

  it("indexes every frame: payload offsets, ms times, key frames", async () => {
    const bytes = buildWebm(live);
    const index = sampleIndexFromWebm(await readWebm(reader(bytes)));
    expect(index.count).toBe(300);
    expect(index.timescale).toBe(1000);
    expect(index.codec).toBe("vp09.00.40.08");
    expect(index.description.length).toBe(0);
    expect(index.timesUs[1]).toBe(33_000);
    expect(index.timesUs[299]).toBe(9_966_000);
    expect([...index.sync].filter(Boolean).length).toBe(10);
    // Offsets point at the frame payloads (a key frame starts with its VP9 header, the others with their index).
    for (const i of [1, 2, 29, 31, 299]) {
      const at = index.offsets[i] as number;
      expect(new DataView(bytes.buffer, at, 4).getUint32(0)).toBe(i + 1);
      expect(index.sizes[i]).toBe(12);
    }
    expect([...bytes.subarray(index.offsets[30] as number, (index.offsets[30] as number) + 4)]).toEqual([...vp9KeyFrame(0).subarray(0, 4)]);
    expect(keyFor(index, frameAt(index, 5_000_000))).toBe(150);
    expect([...index.feedUntil.subarray(0, 5)]).toEqual([0, 1, 2, 3, 4]);
  });

  it("ends a recording cut short at its last complete block", async () => {
    const file = await read({ ...live, truncate: 7 });
    expect(file.video?.times.length).toBe(299);
    const cut = await read({ ...live, truncate: 1 });
    expect(cut.video?.times.length).toBe(299);
  });

  it("reads the same with small windows (block headers across window edges)", async () => {
    const whole = await read(live);
    for (const window of [64, 100, 333]) {
      const small = await read(live, window);
      expect(small.video?.offsets).toEqual(whole.video?.offsets);
      expect(small.video?.times).toEqual(whole.video?.times);
      expect(small.audio).toEqual(whole.audio);
    }
  });

  it("reads several clusters of mixed blocks per window, not one read per block", async () => {
    const source = reader(buildWebm(live));
    let reads = 0;
    await readWebm({ size: source.size, read: (offset, length) => (reads++, source.read(offset, length)) });
    expect(reads).toBeLessThan(5);
  });
});

describe("readWebm: muxed files (ffmpeg, mkvmerge)", () => {
  it("reads known sizes, SeekHead, Duration, Cues, Void elements and BlockGroups", async () => {
    const blocks = vp9Frames(90).map((block, i) => (i === 89 ? { ...block, group: { duration: 40 } } : i % 10 === 5 ? { ...block, group: {} } : block));
    const file = await read({ tracks: [VP9, OPUS], blocks: interleave(blocks, 20), seekHead: true, cues: true, voids: true, duration: 3000 });
    expect(file.video?.times.length).toBe(90);
    expect(file.video?.keys.filter(Boolean).length).toBe(3);
    // A BlockGroup without a ReferenceBlock is a key frame; with one, an inter frame.
    expect(file.video?.keys[5]).toBe(false);
    expect(file.video?.lastDuration).toBe(40);
    const result = webmProbeResult(file);
    // The duration comes from the frames (last start 2966 + its BlockDuration 40), not from Info.
    expect(result.durationUs).toBe(3_006_000);
  });

  it("reads Matroska files and non-default timestamp scales", async () => {
    // TimestampScale 1 us: times in us, 29.97 fps (one block per cluster: block times relative to their cluster are 16 bits).
    const file = await read({ docType: "matroska", timestampScale: 1000, tracks: [{ ...VP9, codecId: "V_VP8" }], blocks: videoBlocks(60, (i) => (i % 3 === 0 ? 33_367 : 33_366)), clusterBlocks: 1 });
    expect(file.timescale).toBe(1_000_000);
    expect(webmProbeResult(file)).toMatchObject({ kind: "video", codec: "vp8", fps: { num: 30000, den: 1001 }, hasAudio: false });
    expect(sampleIndexFromWebm(file).timesUs[3]).toBe(100_099);
  });

  it("converts timestamp scales that are not a whole number of ticks per second to microseconds", async () => {
    const file = await read({ timestampScale: 333_333, tracks: [VP9], blocks: videoBlocks(10, 100) });
    expect(file.timescale).toBe(1_000_000);
    expect(file.video?.times[1]).toBe(33_333);
  });

  it("sorts the decode times of reordered H.264 frames and finds what each one needs", async () => {
    // Decode order I P B B P B B: presentation 0, 3, 1, 2, 6, 4, 5 frames of 40 ms.
    const pts = [0, 3, 1, 2, 6, 4, 5];
    const avcC = Uint8Array.of(1, 0x64, 0x00, 0x1f, 0xff, 0xe1, 0x00);
    const file = await read({ tracks: [{ ...VP9, codecId: "V_MPEG4/ISO/AVC", codecPrivate: avcC }], blocks: pts.map((p, i) => ({ track: 1, time: p * 40, key: i === 0 })) });
    const index = sampleIndexFromWebm(file);
    expect(index.codec).toBe("avc1.64001f");
    expect([...index.description]).toEqual([...avcC]);
    expect([...index.dts]).toEqual([0, 40, 80, 120, 160, 200, 240]);
    expect([...index.displayOrder]).toEqual([0, 2, 3, 1, 5, 6, 4]);
    // B-frame 2 (shown at 80 ms) needs P frame 1 fed first.
    expect(index.feedUntil[2]).toBe(2);
    expect(index.feedUntil[5]).toBe(5);
    expect(index.durations[4]).toBe(40);
    expect(webmProbeResult(file).durationUs).toBe(280_000);
  });

  it("probes audio-only files (voice recordings, music) as audio", async () => {
    const audio = Array.from({ length: 150 }, (_, i): TestBlock => ({ track: 2, time: i * 20, key: true }));
    expect(await probeWebm(reader(buildWebm({ tracks: [OPUS], blocks: audio, live: true })))).toEqual({ kind: "audio", durationUs: 3_000_000, hasAudio: true, audioCodec: "opus", audio: { channels: 2, sampleRate: 48000 } });
    const vorbis = { ...OPUS, codecId: "A_VORBIS", sampleRate: 44100, channels: 1, defaultDuration: 0 };
    const grouped = audio.map((block, i) => (i === 149 ? { ...block, group: { duration: 5 } } : block));
    expect(await probeWebm(reader(buildWebm({ tracks: [vorbis], blocks: grouped })))).toMatchObject({ kind: "audio", durationUs: 2_985_000, audioCodec: "vorbis", audio: { channels: 1, sampleRate: 44100 } });
  });

  it("refuses sound decoded whole (Vorbis, laced blocks) past 45 minutes, not Opus (Batch 50)", async () => {
    const vorbis = { ...OPUS, codecId: "A_VORBIS", sampleRate: 44100, channels: 1, defaultDuration: 0 };
    const long = (minutes: number, laced = false): TestBlock[] => [
      { track: 2, time: 0, key: true, laced },
      { track: 2, time: minutes * 60_000 - 20, key: true, laced, group: { duration: 20 } },
    ];
    const probe = (tracks: TestWebmTrack[], blocks: TestBlock[]) => probeWebm(reader(buildWebm({ tracks, blocks, clusterBlocks: 1 })));
    await expect(probe([vorbis], long(46))).rejects.toThrow("decoded whole, which works up to 45 minutes (this one is 46 minutes)");
    await expect(probe([OPUS], long(46, true))).rejects.toBeInstanceOf(ProbeError);
    await expect(probe([vorbis], long(44))).resolves.toMatchObject({ kind: "audio", audioCodec: "vorbis" });
    await expect(probe([OPUS], long(46))).resolves.toMatchObject({ kind: "audio", audioCodec: "opus" });
    // A video with whole-decoded sound is refused too: its sound would be decoded the same way.
    const withVideo = [...vp9Frames(2), ...long(46)].sort((a, b) => a.time - b.time);
    await expect(probe([VP9, vorbis], withVideo)).rejects.toBeInstanceOf(ProbeError);
  });

  it("takes the first enabled track of each kind", async () => {
    const tracks: TestWebmTrack[] = [{ ...VP9, number: 1, enabled: false, codecId: "V_THEORA" }, { ...VP9, number: 3 }, { ...VP9, number: 4, codecId: "V_AV1" }, OPUS];
    const blocks = [...vp9Frames(30).map((block) => ({ ...block, track: 3 })), ...videoBlocks(30, 33, 30, 4), ...videoBlocks(30, 33, 30, 1)];
    const file = await read({ tracks, blocks: blocks.sort((a, b) => a.time - b.time) });
    expect(file.video?.track.number).toBe(3);
    expect(file.video?.times.length).toBe(30);
    expect(file.audio).toBeNull();
    expect(webmProbeResult(file).hasAudio).toBe(false);
  });
});

describe("webmAudioLeadUs", () => {
  /** Video from 0 ms, audio blocks every 20 ms from `audioStart`. */
  const recording = (audioStart: number, count = 300): TestWebmOptions => {
    const audio = Array.from({ length: count }, (_, i): TestBlock => ({ track: 2, time: audioStart + i * 20, key: true }));
    return { live: true, tracks: [VP9, OPUS], blocks: [...vp9Frames(count), ...audio].sort((a, b) => a.time - b.time) };
  };

  it("places the first audio sample after the first frame", async () => {
    expect(webmAudioLeadUs(await read(recording(44)))).toBe(44_000);
  });

  it("is negative when the audio starts first, and 0 without video or audio", async () => {
    const early = recording(10);
    const shifted = { ...early, blocks: early.blocks.map((block) => (block.track === 1 ? { ...block, time: block.time + 25 } : block)) };
    expect(webmAudioLeadUs(await read(shifted))).toBe(-15_000);
    expect(webmAudioLeadUs(await read({ tracks: [VP9], blocks: vp9Frames(10) }))).toBe(0);
    expect(webmAudioLeadUs(await read({ tracks: [OPUS], blocks: [{ track: 2, time: 60, key: true }] }))).toBe(0);
  });
});

describe("webmAudioPlan", () => {
  /** Video from 0 ms, Opus packets of 20 ms from 44 ms, each holding its packet index. */
  const recording = (audioStart = 44, count = 50): TestWebmOptions => {
    const audio = Array.from({ length: count }, (_, i): TestBlock => ({ track: 2, time: audioStart + i * 20, key: true, data: fakeFrame(i, 8) }));
    return { live: true, tracks: [VP9, OPUS], blocks: [...vp9Frames(30), ...audio].sort((a, b) => a.time - b.time) };
  };
  /** A decoder whose packet decodes to 960 frames (20 ms at 48 kHz) of its index + 1, from the payload. */
  const fakeDeps = (bytes: Uint8Array): AudioDecodeDeps => ({
    read: async (offset, size) => bytes.slice(offset, offset + size).buffer,
    createChunk: (init) => init as unknown as EncodedAudioChunk,
    createDecoder: ({ output }) => {
      const queue: AudioDataLike[] = [];
      return {
        decodeQueueSize: 0,
        configure: () => undefined,
        decode: (chunk) => {
          const init = chunk as unknown as EncodedAudioChunkInit;
          const value = new DataView(init.data as ArrayBuffer).getUint32(0);
          queue.push({ timestamp: init.timestamp, numberOfFrames: 960, numberOfChannels: 2, sampleRate: 48_000, copyTo: (destination) => destination.fill(value, 0, 960), close: () => undefined });
        },
        flush: async () => {
          for (const data of queue.splice(0)) output(data);
        },
        close: () => undefined,
      };
    },
  });

  it("reads the Opus packets of a recording, media time 0 at its first frame", async () => {
    const bytes = buildWebm(recording());
    const plan = webmAudioPlan(await readWebm(reader(bytes)));
    expect(plan).toMatchObject({ codec: "opus", sampleRate: 48_000, channels: 2, timescale: 1000, trackStart: 0 });
    expect([...(plan?.description ?? [])]).toEqual([...(OPUS.codecPrivate ?? [])]);
    expect([...(plan?.cts.subarray(0, 3) ?? [])]).toEqual([44, 64, 84]);
    expect([...(plan?.durations.subarray(48) ?? [])]).toEqual([20, 20]);
    expect(plan?.duration).toBeCloseTo(1.044, 9);
    expect(new DataView(bytes.buffer, plan?.offsets[7], 4).getUint32(0)).toBe(8);
    // Decoded by the worker loop: silence until 44 ms, then each packet where it plays.
    const range = await decodeAudioRange(plan!, { from: 0, to: 4800, rate: 48_000 }, fakeDeps(bytes));
    const left = range.channels[0] as Float32Array;
    expect(left[2111]).toBe(0);
    expect(left[2112]).toBe(1);
    expect(left[2112 + 960]).toBe(2);
    expect(left[4799]).toBe(3);
  });

  it("starts an audio-only file at its first packet", async () => {
    const audio = Array.from({ length: 10 }, (_, i): TestBlock => ({ track: 2, time: 60 + i * 20, key: true }));
    const plan = webmAudioPlan(await read({ tracks: [OPUS], blocks: audio }));
    expect(plan?.trackStart).toBeCloseTo(0.06, 9);
    expect(plan?.duration).toBeCloseTo(0.2, 9);
  });

  it("leaves Vorbis and laced audio to decodeAudioData", async () => {
    const opus = recording();
    expect(webmAudioPlan(await read({ ...opus, tracks: [VP9, { ...OPUS, codecId: "A_VORBIS" }] }))).toBeNull();
    expect(webmAudioPlan(await read({ ...opus, blocks: opus.blocks.map((block, i) => (block.track === 2 && i === 40 ? { ...block, laced: true } : block)) }))).toBeNull();
    expect(webmAudioPlan(await read({ tracks: [VP9], blocks: vp9Frames(10) }))).toBeNull();
  });
});

describe("readWebm: refusals", () => {
  const refusal = async (options: TestWebmOptions | Uint8Array) => {
    const bytes = ArrayBuffer.isView(options) ? options : buildWebm(options);
    const error = await probeWebm(reader(bytes)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProbeError);
    return (error as Error).message;
  };

  it("names the unsupported video codec", async () => {
    expect(await refusal({ tracks: [{ ...VP9, codecId: "V_MPEGH/ISO/HEVC" }], blocks: videoBlocks(3, 33) })).toMatch(/V_MPEGH\/ISO\/HEVC/);
  });

  it("refuses laced video blocks and compressed or encrypted video tracks", async () => {
    expect(await refusal({ tracks: [VP9], blocks: [{ track: 1, time: 0, key: true, laced: true }] })).toMatch(/lacing/);
    expect(await refusal({ tracks: [{ ...VP9, encoded: true }], blocks: videoBlocks(3, 33) })).toMatch(/compressed or encrypted/);
  });

  it("refuses files that are not WebM or are damaged, in plain words", async () => {
    const plain = /Not a readable WebM file/;
    expect(await refusal(new TextEncoder().encode("not a video at all"))).toMatch(plain);
    expect(await refusal({ docType: "foo", tracks: [VP9], blocks: videoBlocks(3, 33) })).toMatch(plain);
    // Zeros where the first cluster starts: not an element.
    const garbage = buildWebm({ tracks: [VP9], blocks: videoBlocks(30, 33) });
    const cluster = garbage.findIndex((_, i) => garbage[i] === 0x1f && garbage[i + 1] === 0x43 && garbage[i + 2] === 0xb6 && garbage[i + 3] === 0x75);
    garbage.fill(0, cluster, cluster + 8);
    expect(await refusal(garbage)).toMatch(plain);
    expect(await refusal(buildWebm({ tracks: [VP9], blocks: videoBlocks(3, 33) }).subarray(0, 30))).toMatch(plain);
  });

  it("refuses files without tracks or frames", async () => {
    expect(await refusal({ tracks: [VP9], blocks: [] })).toMatch(/no frames/);
    expect(await refusal({ tracks: [], blocks: [] })).toMatch(/no video or audio track/);
  });

  it("stops when aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(readWebm(reader(buildWebm({ tracks: [VP9], blocks: videoBlocks(3, 33) })), controller.signal)).rejects.toThrow(/abort/i);
  });
});
