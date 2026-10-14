import { describe, expect, it } from "vitest";
import { ByteSource, ChunkCache } from "../bytes/ByteSource.js";
import { probeMp4, readMp4 } from "./mp4Probe.js";
import { buildMp4, DEFAULT_AVCC, ROTATE_90_MATRIX, videoSamples, type TestMp4Options, type TestSample } from "./testMp4.js";
import { ProbeError } from "./types.js";

const sourceOf = (bytes: Uint8Array, chunkSize = 64 * 1024) => new ByteSource(new Blob([bytes as Uint8Array<ArrayBuffer>]), new ChunkCache(), chunkSize);
const probe = (options: TestMp4Options) => probeMp4(sourceOf(buildMp4(options)));
const aacSamples = (count: number): TestSample[] => Array.from({ length: count }, () => ({ duration: 1024 }));

describe("probeMp4", () => {
  it("reads an iPhone-style HEVC .mov: rotation 90, timescale 600, AAC audio", async () => {
    const result = await probe({
      brand: "qt  ",
      tracks: [
        { kind: "video", codec: "hvc1", timescale: 600, width: 1920, height: 1080, matrix: ROTATE_90_MATRIX, samples: videoSamples(300, 20) },
        { kind: "audio", codec: "mp4a", timescale: 44100, channels: 2, sampleRate: 44100, samples: aacSamples(431) },
      ],
    });
    expect(result).toMatchObject({ kind: "video", durationUs: 10_000_000, width: 1920, height: 1080, rotation: 90, fps: { num: 30, den: 1 }, hasAudio: true, audioCodec: "mp4a.40.2", audio: { channels: 2, sampleRate: 44100 } });
    expect(result.codec).toMatch(/^hvc1\./);
  });

  it("reads an Android-style H.264 .mp4 with variable frame rate and the moov at the end", async () => {
    // 90 kHz, deltas jittering around 3000 with some dropped frames.
    const deltas = (i: number) => (i % 23 === 22 ? 6000 : 3000 + ((i % 3) - 1));
    const result = await probe({
      moovAtEnd: true,
      tracks: [
        { kind: "video", codec: "avc1", timescale: 90000, width: 1080, height: 1920, samples: videoSamples(240, deltas) },
        { kind: "audio", codec: "mp4a", timescale: 48000, channels: 1, sampleRate: 48000, samples: aacSamples(400) },
      ],
    });
    const total = Array.from({ length: 240 }, (_, i) => deltas(i)).reduce((a, b) => a + b, 0);
    expect(result).toMatchObject({ kind: "video", codec: "avc1.64001f", width: 1080, height: 1920, rotation: 0, fps: { num: 30, den: 1 }, hasAudio: true });
    expect(result.durationUs).toBe(Math.round((total * 1e6) / 90000));
  });

  it("does not read the mdat of a moov-at-end file", async () => {
    const big: TestSample[] = Array.from({ length: 60 }, (_, i) => ({ duration: 1001, sync: i === 0, data: new Uint8Array(100_000) }));
    const bytes = buildMp4({ moovAtEnd: true, tracks: [{ kind: "video", codec: "avc1", timescale: 30000, width: 640, height: 360, samples: big }] });
    const source = sourceOf(bytes, 64 * 1024);
    const file = await readMp4(source);
    expect(file.video?.fps).toEqual({ num: 30000, den: 1001 });
    // 6 MB file in 64 KB chunks: the first 1 MB read (16 chunks) and the moov, not all ~92 chunks.
    expect(source.chunkReads).toBeLessThanOrEqual(18);
  });

  it("keeps the decoder description and the sample table for the poster", async () => {
    const file = await readMp4(sourceOf(buildMp4({ tracks: [{ kind: "video", codec: "avc1", timescale: 30000, width: 64, height: 64, samples: videoSamples(10, 1001, 5) }] })));
    expect(file.video?.description).toEqual(DEFAULT_AVCC);
    expect(file.video?.samples.map((s) => s.is_sync)).toEqual([true, false, false, false, false, true, false, false, false, false]);
    expect(file.video?.samples[0]?.size).toBe(16);
  });

  it("probes an audio-only .m4a as audio", async () => {
    const result = await probe({ brand: "M4A ", tracks: [{ kind: "audio", codec: "mp4a", timescale: 44100, channels: 2, sampleRate: 44100, samples: aacSamples(4307) }] });
    expect(result).toEqual({ kind: "audio", durationUs: Math.round((4307 * 1024 * 1e6) / 44100), hasAudio: true, audioCodec: "mp4a.40.2", audio: { channels: 2, sampleRate: 44100 } });
  });

  it("refuses files that are not MP4 or have no usable track", async () => {
    await expect(probeMp4(sourceOf(new TextEncoder().encode("definitely not a movie, just some text")))).rejects.toBeInstanceOf(ProbeError);
    await expect(probeMp4(sourceOf(new Uint8Array(0)))).rejects.toBeInstanceOf(ProbeError);
    await expect(probe({ tracks: [{ kind: "video", codec: "avc1", timescale: 30000, width: 64, height: 64, samples: [] }] })).rejects.toThrow(/no samples/);
  });

  it("stops when aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(probeMp4(sourceOf(buildMp4({ tracks: [{ kind: "audio", codec: "mp4a", timescale: 48000, samples: aacSamples(5) }] })), controller.signal)).rejects.toThrow();
  });
});
