import { describe, expect, it } from "vitest";
import { ByteSource, ChunkCache } from "../bytes/ByteSource.js";
import { buildMp4, videoSamples } from "../probe/testMp4.js";
import { ProbeError } from "../probe/types.js";
import { isEbml, parseSampleIndex, probeVideoFile } from "./container.js";
import { buildWebm, videoBlocks, vp9KeyFrame } from "./testWebm.js";

const fileOf = (bytes: Uint8Array, name: string) => new File([bytes as Uint8Array<ArrayBuffer>], name);
const webm = () => buildWebm({ live: true, tracks: [{ number: 1, type: "video", codecId: "V_VP9", width: 1280, height: 720 }], blocks: videoBlocks(60, 40, 25).map((block) => (block.key ? { ...block, data: vp9KeyFrame(0) } : block)) });
const mp4 = () => buildMp4({ tracks: [{ kind: "video", codec: "avc1", timescale: 30000, width: 640, height: 360, samples: videoSamples(30, 1001, 30) }] });
const sourceOf = (file: File) => new ByteSource(file, new ChunkCache());

describe("container", () => {
  it("tells WebM and Matroska by their EBML magic", async () => {
    expect(await isEbml(fileOf(webm(), "a.webm"))).toBe(true);
    expect(await isEbml(fileOf(mp4(), "a.mp4"))).toBe(false);
    expect(await isEbml(new Blob([]))).toBe(false);
  });

  it("probes each container, whatever the file is named", async () => {
    expect(await probeVideoFile(fileOf(webm(), "recording.webm"))).toMatchObject({ kind: "video", codec: "vp09.00.31.08", width: 1280, height: 720, fps: { num: 25, den: 1 }, durationUs: 2_400_000 });
    expect(await probeVideoFile(fileOf(webm(), "named-wrong.mp4"))).toMatchObject({ codec: "vp09.00.31.08" });
    expect(await probeVideoFile(fileOf(mp4(), "clip.mp4"))).toMatchObject({ kind: "video", codec: "avc1.64001f", width: 640 });
  });

  it("refuses a .webm that is neither container with the WebM reason", async () => {
    const text = new File(["just text"], "notes.webm");
    await expect(probeVideoFile(text, undefined, "webm")).rejects.toThrow(/Not a readable WebM file/);
    await expect(probeVideoFile(text)).rejects.toThrow(/Not a readable MP4\/MOV file/);
  });

  it("builds the sample index of each container", async () => {
    const w = fileOf(webm(), "a.webm");
    const index = await parseSampleIndex(w, sourceOf(w));
    expect(index).toMatchObject({ count: 60, codec: "vp09.00.31.08", codedWidth: 1280, rotation: 0, timescale: 1000 });
    expect(index.timesUs[59]).toBe(2_360_000);
    expect([...index.sync].filter(Boolean)).toHaveLength(3);
    const m = fileOf(mp4(), "a.mp4");
    expect(await parseSampleIndex(m, sourceOf(m))).toMatchObject({ count: 30, codec: "avc1.64001f" });
  });

  it("refuses a WebM without video for the index", async () => {
    const audioOnly = fileOf(buildWebm({ tracks: [{ number: 1, type: "audio", codecId: "A_OPUS" }], blocks: [{ track: 1, time: 0, key: true }] }), "a.webm");
    await expect(parseSampleIndex(audioOnly, sourceOf(audioOnly))).rejects.toBeInstanceOf(ProbeError);
  });
});
