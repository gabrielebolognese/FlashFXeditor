import { describe, expect, it } from "vitest";
import { blobReader } from "./ebml.js";
import { buildWebm, fakeFrame, vp9KeyFrame, type TestBlock, type TestWebmTrack } from "./testWebm.js";
import { probeWebm, readWebm, webmHasAlpha, webmIgnoredAlpha, webmVideoTable } from "./webm.js";

const reader = (bytes: Uint8Array) => blobReader(new Blob([bytes as Uint8Array<ArrayBuffer>]));
const track = (codecId: string, alphaMode?: number): TestWebmTrack => ({ number: 1, type: "video", codecId, width: 64, height: 48, ...(alphaMode !== undefined && { alphaMode }) });
const blocks = (alpha: boolean[]): TestBlock[] => alpha.map((has, i) => ({ track: 1, time: i * 33, key: i === 0, data: i === 0 ? new Uint8Array([...vp9KeyFrame(0), ...fakeFrame(i)]) : fakeFrame(i), ...(has && { alpha: fakeFrame(100 + i, 7) }) }));
const open = async (t: TestWebmTrack, flags: boolean[]) => {
  const bytes = buildWebm({ tracks: [t], blocks: blocks(flags), cues: true });
  return { bytes, file: await readWebm(reader(bytes)) };
};

describe("WebM alpha (BlockAdditions, spec §21.11)", () => {
  it("reads the alpha stream of every block that has one, in the sample table", async () => {
    const { bytes, file } = await open(track("V_VP9", 1), [true, true, false, true]);
    expect(webmHasAlpha(file)).toBe(true);
    const { table } = webmVideoTable(file);
    expect(Array.from(table.alphaSizes ?? [])).toEqual([7, 7, 0, 7]);
    const offsets = table.alphaOffsets as Float64Array;
    for (const i of [0, 1, 3]) expect(Array.from(bytes.slice(offsets[i], (offsets[i] as number) + 7))).toEqual(Array.from(fakeFrame(100 + i, 7)));
    // The color payload is untouched by the BlockGroup around it.
    expect(table.sizes[1]).toBe(12);
  });

  it("probes alpha: true, and nothing for a file without alpha streams", async () => {
    const withAlpha = await probeWebm(reader(buildWebm({ tracks: [track("V_VP9", 1)], blocks: blocks([true, true]) })));
    expect(withAlpha.alpha).toBe(true);
    // Streams without the AlphaMode element (a block with BlockAddID 1 is the alpha stream either way) are alpha all the same.
    const noElement = await probeWebm(reader(buildWebm({ tracks: [track("V_VP9")], blocks: blocks([true, true]) })));
    expect(noElement.alpha).toBe(true);
    const flagOnly = await probeWebm(reader(buildWebm({ tracks: [track("V_VP9", 1)], blocks: blocks([false, false]) })));
    expect(flagOnly.alpha).toBeUndefined();
    const plain = await probeWebm(reader(buildWebm({ tracks: [track("V_VP9")], blocks: blocks([false, false]) })));
    expect(plain.alpha).toBeUndefined();
  });

  it("does not decode AV1 alpha: the file opens opaque and the probe says what was ignored", async () => {
    const { file } = await open(track("V_AV1", 1), [true, true]);
    expect(webmHasAlpha(file)).toBe(false);
    expect(webmIgnoredAlpha(file)).toBe("AV1");
  });
});

describe("the interop fixture (a real ffmpeg VP9 alpha WebM)", () => {
  it("is probed with alpha, 30 frames and an alpha stream in every block", async () => {
    const { readFileSync } = await import("node:fs");
    const bytes = new Uint8Array(readFileSync("fixtures/interop/alpha/media/overlay.webm"));
    expect((await probeWebm(reader(bytes))).alpha).toBe(true);
    const file = await readWebm(reader(bytes));
    // ffmpeg writes the AlphaMode element (0x53C0 = 1): it must be read from a real file.
    expect(file.video?.track.alphaMode).toBe(true);
    const { table } = webmVideoTable(file);
    expect(table.sizes.length).toBe(30);
    expect(Array.from(table.alphaSizes ?? []).every((size) => size > 0)).toBe(true);
  });
});
