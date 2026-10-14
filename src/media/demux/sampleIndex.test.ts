import { describe, expect, it } from "vitest";
import { ByteSource, ChunkCache } from "../bytes/ByteSource.js";
import { readMp4 } from "../probe/mp4Probe.js";
import { buildMp4, DEFAULT_AVCC, ROTATE_90_MATRIX, type TestSample } from "../probe/testMp4.js";
import { createSampleIndex, frameAt, keyFor, sampleIndexFromMp4, type SampleIndex, type SampleTable } from "./sampleIndex.js";
import { readSampleIndex, writeSampleIndex } from "./sampleIndexFile.js";

const DUR = 1001; // 30000/1001 fps
/** Display positions of one 7-frame GOP in decode order: I0 P3 B1 B2 P6 B4 B5. */
const GOP_DISPLAY = [0, 3, 1, 2, 6, 4, 5];

/** `gops` B-frame GOPs; composition offsets keep every cts non-negative (2 frames of delay). */
function bFrameSamples(gops: number): TestSample[] {
  return Array.from({ length: gops * 7 }, (_, i) => {
    const g = i % 7;
    return { duration: DUR, sync: g === 0, ctsOffset: ((GOP_DISPLAY[g] as number) - g + 2) * DUR };
  });
}

async function indexOf(samples: TestSample[], codec: "avc1" | "hvc1" = "avc1"): Promise<SampleIndex> {
  const bytes = buildMp4({
    tracks: [{ kind: "video", codec, timescale: 30000, width: 1920, height: 1080, samples, ...(codec === "hvc1" && { matrix: ROTATE_90_MATRIX }) }],
  });
  const file = await readMp4(new ByteSource(new Blob([bytes as Uint8Array<ArrayBuffer>]), new ChunkCache()));
  if (!file.video) throw new Error("no video");
  return sampleIndexFromMp4(file.video);
}

const us = (ticks: number) => Math.round((ticks * 1e6) / 30000);

/** A hand-made table (times in frames of `DUR` ticks). */
function table(frames: { cts: number; sync?: boolean }[]): SampleTable {
  return {
    codec: "hvc1.1.6.L93.B0",
    description: new Uint8Array([1, 2, 3]),
    codedWidth: 64,
    codedHeight: 64,
    rotation: 0,
    timescale: 30000,
    offsets: Float64Array.from(frames, (_, i) => 1000 + i * 100),
    sizes: Uint32Array.from(frames, () => 100),
    dts: Float64Array.from(frames, (_, i) => i * DUR),
    cts: Float64Array.from(frames, (f) => f.cts * DUR),
    durations: Uint32Array.from(frames, () => DUR),
    sync: Uint8Array.from(frames, (f) => (f.sync ? 1 : 0)),
  };
}

describe("sampleIndexFromMp4", () => {
  it("keeps decode order and derives display order from cts (B-frames)", async () => {
    const index = await indexOf(bFrameSamples(2));
    expect(index.count).toBe(14);
    expect(index.codec).toBe("avc1.64001f");
    expect(index.timescale).toBe(30000);
    // Decode order as stored.
    expect(Array.from(index.dts.slice(0, 4))).toEqual([0, DUR, 2 * DUR, 3 * DUR]);
    expect(Array.from(index.sync)).toEqual([1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]);
    // Display order: I0 B1(d2) B2(d3) P3(d1) B4(d5) B5(d6) P6(d4), then the next GOP.
    expect(Array.from(index.displayOrder.slice(0, 7))).toEqual([0, 2, 3, 1, 5, 6, 4]);
    expect(Array.from(index.displayOrder.slice(7))).toEqual([7, 9, 10, 8, 12, 13, 11]);
    // Display times ascend one frame apart, starting at the 2-frame composition delay.
    expect(Array.from(index.displayTimesUs)).toEqual(Array.from({ length: 14 }, (_, p) => us((p + 2) * DUR)));
    // Each sample's own time is its cts.
    expect(index.timesUs[1]).toBe(us(5 * DUR));
    for (let p = 0; p < 14; p++) expect(index.displayPos[index.displayOrder[p] as number]).toBe(p);
    // To show B1 (decode 2) the decoder needs I0, P3 and B1; B2 needs B2 too; P3 is shown after both.
    expect(Array.from(index.feedUntil.slice(0, 7))).toEqual([0, 3, 2, 3, 6, 5, 6]);
  });

  it("keeps offsets, sizes, the description and the rotation", async () => {
    const samples = bFrameSamples(1).map((s, i) => ({ ...s, data: new Uint8Array(10 + i) }));
    const index = await indexOf(samples);
    expect(Array.from(index.sizes)).toEqual([10, 11, 12, 13, 14, 15, 16]);
    for (let i = 1; i < 7; i++) expect(index.offsets[i]).toBe((index.offsets[i - 1] as number) + 10 + i - 1);
    expect(index.description).toEqual(DEFAULT_AVCC);
    expect(index.rotation).toBe(0);
    expect((await indexOf(samples, "hvc1")).rotation).toBe(90);
  });
});

describe("frameAt", () => {
  it("finds the frame shown at a time, between frames and outside the track", async () => {
    const index = await indexOf(bFrameSamples(2));
    const t = (p: number) => index.displayTimesUs[p] as number;
    expect(frameAt(index, t(5))).toBe(5);
    expect(frameAt(index, t(5) + 1)).toBe(5);
    expect(frameAt(index, t(6) - 1)).toBe(5);
    expect(frameAt(index, 0)).toBe(0); // before the first frame (composition delay)
    expect(frameAt(index, 1e12)).toBe(13);
  });
});

describe("keyFor", () => {
  it("starts from the sync sample of the GOP", async () => {
    const index = await indexOf(bFrameSamples(3));
    for (let d = 0; d < 21; d++) expect(keyFor(index, d)).toBe(Math.floor(d / 7) * 7);
  });

  it("goes back one GOP for a leading picture of an open GOP", () => {
    // GOP 1: I0 P2 B1; then a CRA shown at 4 followed by a leading picture shown at 3.
    const index = createSampleIndex(table([{ cts: 0, sync: true }, { cts: 2 }, { cts: 1 }, { cts: 4, sync: true }, { cts: 3 }, { cts: 5 }]));
    expect(keyFor(index, 3)).toBe(3);
    expect(keyFor(index, 4)).toBe(0);
    expect(keyFor(index, 5)).toBe(3);
  });

  it("decodes from the first sample when the track does not start with a sync sample", () => {
    const index = createSampleIndex(table([{ cts: 0 }, { cts: 1 }, { cts: 2, sync: true }, { cts: 3 }]));
    expect(keyFor(index, 1)).toBe(0);
    expect(keyFor(index, 3)).toBe(2);
  });
});

describe("sample index file", () => {
  const stamp = { size: 123_456_789, lastModified: 1_760_000_000_123 };

  it("reads back what it wrote", async () => {
    const index = await indexOf(bFrameSamples(2), "hvc1");
    const read = readSampleIndex(writeSampleIndex(index, stamp), stamp);
    expect(read).not.toBeNull();
    const back = read as SampleIndex;
    for (const key of ["codec", "codedWidth", "codedHeight", "rotation", "timescale", "count"] as const) expect(back[key]).toEqual(index[key]);
    expect(back.description).toEqual(index.description);
    for (const key of ["offsets", "sizes", "dts", "cts", "durations", "sync", "displayOrder", "displayTimesUs", "syncBefore", "feedUntil"] as const) {
      expect(Array.from(back[key])).toEqual(Array.from(index[key]));
    }
  });

  it("rejects an index of another version of the file, or a damaged one", () => {
    const index = createSampleIndex(table([{ cts: 0, sync: true }, { cts: 2 }, { cts: 1 }]));
    const bytes = writeSampleIndex(index, stamp);
    expect(readSampleIndex(bytes, { ...stamp, size: stamp.size + 1 })).toBeNull();
    expect(readSampleIndex(bytes, { ...stamp, lastModified: stamp.lastModified + 1 })).toBeNull();
    expect(readSampleIndex(bytes.slice(0, bytes.byteLength - 16), stamp)).toBeNull();
    expect(readSampleIndex(new ArrayBuffer(10), stamp)).toBeNull();
    const wrongMagic = bytes.slice(0);
    new DataView(wrongMagic).setUint32(0, 0x12345678, true);
    expect(readSampleIndex(wrongMagic, stamp)).toBeNull();
    const wrongVersion = bytes.slice(0);
    new DataView(wrongVersion).setUint32(4, 99, true);
    expect(readSampleIndex(wrongVersion, stamp)).toBeNull();
    expect(readSampleIndex(bytes, stamp)?.count).toBe(3);
  });
});
