import { describe, expect, it } from "vitest";
import { blobReader } from "../../media/demux/ebml.js";
import { readWebm, webmHasAlpha, webmVideoTable } from "../../media/demux/webm.js";
import { opusHead, opusPreSkip, sizeBytes, WebmMuxer, type WebmMuxOptions, type WebmVideoPacket } from "./WebmMuxer.js";

/** Runs a muxer, applying the positioned writes the way a file would. */
function build(options: WebmMuxOptions, feed: (muxer: WebmMuxer) => void): Uint8Array {
  const writes: { data: Uint8Array; position: number }[] = [];
  const muxer = new WebmMuxer(options, (data, position) => writes.push({ data: data.slice(), position }));
  feed(muxer);
  muxer.finalize();
  const size = Math.max(...writes.map((w) => w.position + w.data.length));
  const file = new Uint8Array(size);
  for (const w of writes) file.set(w.data, w.position);
  return file;
}

const reader = (bytes: Uint8Array) => blobReader(new Blob([bytes as Uint8Array<ArrayBuffer>]));
const video = (codec: "vp9" | "av1", alpha: boolean): WebmMuxOptions["video"] => ({ codec, width: 64, height: 48, fps: 30, alpha });
const frame = (i: number, alpha: boolean, key = i % 6 === 0): WebmVideoPacket => ({
  timestampUs: Math.round((i * 1_000_000) / 30),
  durationUs: 33_333,
  key,
  data: Uint8Array.from({ length: 10 }, (_, b) => (i * 7 + b) & 255),
  alpha: alpha ? Uint8Array.from({ length: 5 }, (_, b) => (i * 3 + b + 1) & 255) : null,
});

describe("sizeBytes", () => {
  it("writes the shortest EBML size, or exactly the width asked", () => {
    expect(Array.from(sizeBytes(5))).toEqual([0x85]);
    expect(Array.from(sizeBytes(300))).toEqual([0x41, 0x2c]);
    expect(sizeBytes(0, 8).length).toBe(8);
    expect(Array.from(sizeBytes(0, 8))).toEqual([1, 0, 0, 0, 0, 0, 0, 0]);
  });
});

describe("Opus helpers", () => {
  it("builds an OpusHead and reads its pre-skip back", () => {
    const head = opusHead(2, 48000, 312);
    expect(head.length).toBe(19);
    expect(opusPreSkip(head)).toBe(312);
    expect(opusPreSkip(head.buffer.slice(0) as ArrayBuffer)).toBe(312);
    expect(opusPreSkip(undefined)).toBeNull();
    expect(opusPreSkip(new Uint8Array(4))).toBeNull();
  });
});

describe("WebmMuxer", () => {
  it("writes a WebM the app's own demuxer reads: frames, keys, times, the Cluster per key frame", async () => {
    const file = build({ video: video("vp9", false), audio: null }, (m) => {
      for (let i = 0; i < 20; i++) m.addVideo(frame(i, false));
    });
    const parsed = await readWebm(reader(file));
    expect(parsed.docType).toBe("webm");
    expect(parsed.timescale).toBe(1_000_000_000 / 1_000_000);
    const v = parsed.video;
    expect(v?.track.codecId).toBe("V_VP9");
    expect(v?.track.width).toBe(64);
    expect(v?.track.height).toBe(48);
    expect(v?.track.alphaMode).toBe(false);
    expect(v?.times.length).toBe(20);
    expect(v?.keys.filter(Boolean).length).toBe(4);
    expect(v?.times[10]).toBe(333);
    // The payloads are where the offsets say.
    const first = v as NonNullable<typeof v>;
    expect(Array.from(file.slice(first.offsets[7], (first.offsets[7] as number) + 10))).toEqual(Array.from(frame(7, false).data));
    expect(webmHasAlpha(parsed)).toBe(false);
  });

  it("patches the Segment size and the Duration, and the SeekHead points at Info, Tracks and Cues", async () => {
    const file = build({ video: video("vp9", false), audio: null }, (m) => {
      for (let i = 0; i < 12; i++) m.addVideo(frame(i, false));
    });
    // Segment: ID 18 53 80 67, then an 8-byte size covering the rest of the file.
    const at = file.findIndex((_, i) => file[i] === 0x18 && file[i + 1] === 0x53 && file[i + 2] === 0x80 && file[i + 3] === 0x67);
    expect(at).toBeGreaterThan(0);
    const sizeField = file.slice(at + 4, at + 12);
    let size = 0;
    for (let i = 1; i < 8; i++) size = size * 256 + sizeField[i]!;
    expect(at + 12 + size).toBe(file.length);
    // Duration (ms) = the last frame's end.
    const durationId = file.findIndex((_, i) => file[i] === 0x44 && file[i + 1] === 0x89 && file[i + 2] === 0x88);
    const duration = new DataView(file.buffer, file.byteOffset + durationId + 3, 8).getFloat64(0);
    expect(duration).toBe(Math.round((11 * 1_000_000) / 30 / 1000 + 33.333));
    // The Cues element is at the position the SeekHead's third entry holds.
    const cuesId = [0x1c, 0x53, 0xbb, 0x6b];
    const cuesAt = file.findLastIndex((_, i) => cuesId.every((b, k) => file[i + k] === b));
    expect(cuesAt).toBeGreaterThan(0);
    const seekIds = [0x53, 0xab, 0x84, ...cuesId, 0x53, 0xac, 0x88];
    const seek = file.findIndex((_, i) => seekIds.every((b, k) => file[i + k] === b));
    const position = new DataView(file.buffer, file.byteOffset + seek + seekIds.length, 8);
    expect(at + 12 + Number(position.getBigUint64(0))).toBe(cuesAt);
  });

  it("carries the alpha stream of each frame as a BlockAdditional, with the AlphaMode flag", async () => {
    const file = build({ video: video("vp9", true), audio: null }, (m) => {
      for (let i = 0; i < 8; i++) m.addVideo(frame(i, true));
    });
    const parsed = await readWebm(reader(file));
    expect(parsed.video?.track.alphaMode).toBe(true);
    expect(webmHasAlpha(parsed)).toBe(true);
    const { table } = webmVideoTable(parsed);
    expect(Array.from(table.alphaSizes ?? [])).toEqual(new Array(8).fill(5));
    const offsets = table.alphaOffsets as Float64Array;
    for (let i = 0; i < 8; i++) expect(Array.from(file.slice(offsets[i], (offsets[i] as number) + 5))).toEqual(Array.from(frame(i, true).alpha as Uint8Array));
    // The color payload and the key flags are intact around the BlockGroups.
    expect(Array.from(table.sync)).toEqual([1, 0, 0, 0, 0, 0, 1, 0]);
    expect(table.sizes[3]).toBe(10);
  });

  it("writes an Opus track with its OpusHead, and interleaves audio blocks with the video", async () => {
    const file = build({ video: video("vp9", false), audio: { sampleRate: 48000, channels: 2 } }, (m) => {
      for (let i = 0; i < 14; i++) {
        m.addVideo(frame(i, false));
        for (let a = 0; a < 2; a++) m.addAudio({ timestampUs: i * 33_333 + a * 16_666, durationUs: 20_000, data: Uint8Array.of(i, a, 9) });
      }
    });
    const parsed = await readWebm(reader(file));
    expect(parsed.audio?.track.codecId).toBe("A_OPUS");
    expect(parsed.audio?.track.channels).toBe(2);
    expect(parsed.audio?.track.sampleRate).toBe(48000);
    expect(parsed.audio?.offsets.length).toBe(28);
    expect(opusPreSkip(parsed.audio?.track.codecPrivate)).toBe(312);
    expect(parsed.video?.times.length).toBe(14);
  });

  it("takes the pre-skip from the encoder's description when it comes before the first Cluster", async () => {
    const file = build({ video: video("vp9", false), audio: { sampleRate: 48000, channels: 2 } }, (m) => {
      m.addVideo(frame(0, false));
      m.setAudioDescription(opusHead(2, 48000, 648));
      m.setAudioDescription(opusHead(2, 48000, 1)); // a later one never replaces it
      m.addAudio({ timestampUs: 0, durationUs: 20_000, data: Uint8Array.of(1) });
    });
    const parsed = await readWebm(reader(file));
    expect(opusPreSkip(parsed.audio?.track.codecPrivate)).toBe(648);
  });

  it("writes AV1 video, and refuses chunks after the end", () => {
    const file = build({ video: video("av1", false), audio: null }, (m) => m.addVideo(frame(0, false)));
    expect(new TextDecoder().decode(file).includes("V_AV1")).toBe(true);
    const muxer = new WebmMuxer({ video: video("vp9", false), audio: null }, () => undefined);
    muxer.addVideo(frame(0, false));
    muxer.finalize();
    expect(() => muxer.addVideo(frame(1, false))).toThrow();
    expect(() => new WebmMuxer({ video: video("vp9", false), audio: null }, () => undefined).addAudio({ timestampUs: 0, durationUs: null, data: Uint8Array.of(1) })).toThrow();
  });
});
