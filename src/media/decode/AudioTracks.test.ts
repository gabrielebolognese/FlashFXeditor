import { describe, expect, it, vi } from "vitest";
import { buildWebm, type TestBlock } from "../demux/testWebm.js";
import type { AudioDataLike, AudioDecodeDeps } from "./audioTrack.js";
import { AudioTracks } from "./AudioTracks.js";

/** A recording: video at 0 and 33 ms, `codecId` audio packets every 20 ms from 44 ms. */
function recording(codecId: string): File {
  const blocks: TestBlock[] = [
    { track: 1, time: 0, key: true },
    { track: 1, time: 33, key: false },
    ...Array.from({ length: 50 }, (_, i): TestBlock => ({ track: 2, time: 44 + i * 20, key: true })),
  ].sort((a, b) => a.time - b.time);
  const bytes = buildWebm({ live: true, tracks: [{ number: 1, type: "video", codecId: "V_VP9" }, { number: 2, type: "audio", codecId, channels: 2, sampleRate: 48_000 }], blocks });
  return new File([bytes as Uint8Array<ArrayBuffer>], "Screen Recording.webm");
}

/** Decoder deps whose decoder outputs 960 silent stereo frames at 48 kHz per packet. */
const decodeDeps = (): AudioDecodeDeps => ({
  read: async (_offset, size) => new ArrayBuffer(size),
  createChunk: (init) => init as unknown as EncodedAudioChunk,
  createDecoder: ({ output }) => {
    const queue: AudioDataLike[] = [];
    return {
      decodeQueueSize: 0,
      configure: () => undefined,
      decode: (chunk) => queue.push({ timestamp: (chunk as unknown as EncodedAudioChunkInit).timestamp, numberOfFrames: 960, numberOfChannels: 2, sampleRate: 48_000, copyTo: () => undefined, close: () => undefined }),
      flush: async () => {
        for (const data of queue.splice(0)) output(data);
      },
      close: () => undefined,
    };
  },
});

describe("AudioTracks (WebM, Batch 49)", () => {
  it("decodes Opus from the clusters in the worker, like MP4 audio", async () => {
    const isConfigSupported = vi.fn(async () => true);
    const tracks = new AudioTracks({ decodeDeps, isConfigSupported });
    const file = recording("A_OPUS");
    // 44 ms + 50 packets of 20 ms after the first frame: 1.044 s at 48 kHz.
    expect(await tracks.open({ mediaId: "r", file })).toEqual({ supported: true, codec: "opus", sampleRate: 48_000, channels: 2, frames: 50_112 });
    expect(isConfigSupported).toHaveBeenCalledWith({ codec: "opus", sampleRate: 48_000, numberOfChannels: 2 });
    const pcm = await tracks.decode({ mediaId: "r", file, from: 0, to: 4800 });
    expect(pcm.channels).toHaveLength(2);
    expect(pcm.channels[0]?.byteLength).toBe(4800 * 4);
  });

  it("reads other WebM audio as unsupported, with the lead of its first block, so the main thread decodes it whole", async () => {
    const isConfigSupported = vi.fn(async () => true);
    const tracks = new AudioTracks({ decodeDeps, isConfigSupported });
    const file = recording("A_VORBIS");
    expect(await tracks.open({ mediaId: "v", file })).toEqual({ supported: false, codec: "", sampleRate: 0, channels: 0, frames: 0, leadUs: 44_000 });
    expect(isConfigSupported).not.toHaveBeenCalled();
    await expect(tracks.decode({ mediaId: "v", file, from: 0, to: 100 })).rejects.toThrow(/No audio decoder/);
  });

  it("falls back the same way when this browser has no Opus decoder", async () => {
    const tracks = new AudioTracks({ decodeDeps, isConfigSupported: async () => false });
    expect(await tracks.open({ mediaId: "r", file: recording("A_OPUS") })).toMatchObject({ supported: false, codec: "opus", leadUs: 44_000 });
  });
});
