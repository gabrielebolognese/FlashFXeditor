import { describe, expect, it, vi } from "vitest";
import { createProject } from "../../core/document/project.js";
import type { MediaItem, Project } from "../../core/document/types.js";
import { FakeAudioBuffer } from "../testAudio.js";
import { DecodedAudio, type DecodedAudioDeps } from "./DecodedAudio.js";

const media = (id: string, relPath: string, extra: Partial<MediaItem> = {}): MediaItem => ({
  id,
  kind: "video",
  name: relPath,
  file: { relPath },
  durationUs: 10_000_000,
  hasAudio: true,
  analysis: { thumbs: "none", peaks: "pending" },
  addedAt: "2026-10-15T00:00:00.000Z",
  ...extra,
});

function setup(items: MediaItem[], worker: { supported?: boolean; frames?: number; decodedLength?: number; crashes?: number } = {}) {
  const project: Project = { ...createProject({ id: "p", name: "P", now: "2026-10-15T00:00:00.000Z", appVersion: "0" }), media: Object.fromEntries(items.map((m) => [m.id, m])) };
  const requests: { method: string; params: Record<string, unknown> }[] = [];
  let crashes = worker.crashes ?? 0;
  const request = vi.fn(async (method: string, params: Record<string, unknown>) => {
    requests.push({ method, params });
    if (method === "decodeAudio" && crashes-- > 0) throw Object.assign(new Error("The decode worker crashed: out of memory"), { name: "WorkerCrashError" });
    if (method === "openAudio") return { supported: worker.supported ?? true, codec: "mp4a.40.2", sampleRate: 48_000, channels: 2, frames: worker.frames ?? 480_000 };
    if (method === "decodeAudio") {
      const length = (params.to as number) - (params.from as number);
      return { sampleRate: 48_000, channels: [new Float32Array(length).fill(0.25).buffer, new Float32Array(length).fill(-0.25).buffer] };
    }
    return null;
  });
  const decodeFile = vi.fn(async () => {
    const buffer = new FakeAudioBuffer({ length: worker.decodedLength ?? 4800, numberOfChannels: 6, sampleRate: 48_000 });
    for (let c = 0; c < 6; c++) buffer.getChannelData(c).fill(c % 2 === 0 ? 0.1 : -0.1);
    return buffer as unknown as AudioBuffer;
  });
  const yieldToMain = vi.fn(async () => undefined);
  const deps: DecodedAudioDeps = {
    workers: { request } as unknown as DecodedAudioDeps["workers"],
    document: { getState: () => project },
    file: async (id) => (project.media[id] ? new File([new Uint8Array(16)], "x") : null),
    decodeFile,
    createBuffer: (options) => new FakeAudioBuffer(options) as unknown as AudioBuffer,
    yieldToMain,
  };
  return { audio: new DecodedAudio(deps), requests, decodeFile, yieldToMain };
}

describe("DecodedAudio", () => {
  it("decodes MP4 audio in the worker and caches the buffer, handing the PCM to the first caller", async () => {
    const { audio, requests } = setup([media("v", "media/clip.mp4")]);
    const layout = await audio.open("v");
    expect(layout).toMatchObject({ sampleRate: 48_000, frames: 480_000, count: 1 });
    const [first, second] = await Promise.all([audio.load("v", 0), audio.load("v", 0)]);
    expect(first).toBe(second);
    expect(requests.filter((r) => r.method === "decodeAudio")).toHaveLength(1);
    expect(first?.buffer.length).toBe(480_000);
    expect(first?.buffer.getChannelData(1)[123]).toBe(-0.25);
    expect(first?.pcm).toHaveLength(2);
    const again = await audio.load("v", 0);
    expect(again.pcm).toBeNull();
    expect(again.buffer).toBe(first?.buffer);
    expect(audio.segment("v", 0)).toBe(first?.buffer);
  });

  it("decodes long MP4 audio by ~60 s segments on demand", async () => {
    const { audio, requests } = setup([media("v", "media/long.mov")], { frames: 15 * 60 * 48_000 });
    const layout = await audio.open("v");
    expect(layout.count).toBeGreaterThan(14);
    await audio.load("v", 3);
    const decode = requests.find((r) => r.method === "decodeAudio");
    expect(decode?.params).toMatchObject({ from: 3 * layout.segmentFrames, to: 4 * layout.segmentFrames });
  });

  it("uses decodeAudioData for other files and mixes more than 2 channels down", async () => {
    const { audio, decodeFile } = setup([media("a", "media/song.mp3", { kind: "audio" })]);
    const { buffer } = await audio.load("a", 0);
    expect(decodeFile).toHaveBeenCalledTimes(1);
    expect(buffer.numberOfChannels).toBe(2);
    expect(audio.layout("a")).toMatchObject({ frames: 4800, count: 1 });
  });

  it("mixes long 5.1 audio down in slices, yielding between them", async () => {
    const { audio, yieldToMain } = setup([media("a", "media/long.wav", { kind: "audio" })], { decodedLength: 600_000 });
    const { buffer } = await audio.load("a", 0);
    expect(buffer.numberOfChannels).toBe(2);
    expect(buffer.length).toBe(600_000);
    // 600,000 frames in 2^18-frame slices: two yields between three slices.
    expect(yieldToMain).toHaveBeenCalledTimes(2);
    // L + (C + SL) / sqrt(2) and R + (C + SR) / sqrt(2), the LFE dropped, in every slice.
    for (const at of [0, 300_000, 599_999]) {
      expect(buffer.getChannelData(0)[at]).toBeCloseTo(0.1 + Math.SQRT1_2 * 0.2, 6);
      expect(buffer.getChannelData(1)[at]).toBeCloseTo(-0.1, 6);
    }
  });

  it("falls back to decodeAudioData when the worker has no decoder for the codec", async () => {
    const { audio, decodeFile, requests } = setup([media("v", "media/clip.mp4")], { supported: false });
    await audio.load("v", 0);
    expect(decodeFile).toHaveBeenCalledTimes(1);
    expect(requests.some((r) => r.method === "decodeAudio")).toBe(false);
  });

  it("reuses a buffer the import probe decoded", async () => {
    const { audio, decodeFile } = setup([media("a", "media/song.wav", { kind: "audio" })]);
    const decoded = new FakeAudioBuffer({ length: 960, numberOfChannels: 1, sampleRate: 48_000 }) as unknown as AudioBuffer;
    audio.put("a", decoded);
    expect((await audio.load("a", 0)).buffer).toBe(decoded);
    expect(decodeFile).not.toHaveBeenCalled();
  });

  it("mixes a 5.1 buffer from the probe down without decoding the file again", async () => {
    const { audio, decodeFile } = setup([media("a", "media/surround.wav", { kind: "audio" })]);
    const decoded = new FakeAudioBuffer({ length: 960, numberOfChannels: 6, sampleRate: 48_000 });
    audio.put("a", decoded as unknown as AudioBuffer);
    expect(audio.layout("a")).toMatchObject({ frames: 960, count: 1 });
    const { buffer } = await audio.load("a", 0);
    expect(buffer.numberOfChannels).toBe(2);
    expect(audio.segment("a", 0)).toBe(buffer);
    expect(decodeFile).not.toHaveBeenCalled();
  });

  it("closes the worker's audio tracks when the project closes, including opens in flight", async () => {
    const { audio, requests } = setup([media("v", "media/clip.mp4"), media("w", "media/other.mp4")]);
    await audio.open("v");
    const opening = audio.open("w");
    audio.reset();
    expect(requests.filter((r) => r.method === "closeAudio").map((r) => r.params.mediaId)).toEqual(["v"]);
    await opening;
    expect(requests.filter((r) => r.method === "closeAudio").map((r) => r.params.mediaId)).toEqual(["v", "w"]);
    expect(audio.layout("w")).toBeNull();
  });

  it("does not count a crashed decode worker as a failure of the media: the next load asks again (Batch 47)", async () => {
    const { audio, requests } = setup([media("v", "media/clip.mp4")], { crashes: 1 });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(audio.load("v", 0)).rejects.toMatchObject({ name: "WorkerCrashError" });
    expect(audio.hasFailed("v")).toBe(false);
    const loaded = await audio.load("v", 0);
    expect(loaded.buffer.length).toBe(480_000);
    expect(requests.filter((r) => r.method === "decodeAudio")).toHaveLength(2);
  });

  it("remembers failures, and forgets media on release and reset", async () => {
    const { audio, requests } = setup([media("v", "media/clip.mp4", { hasAudio: false })]);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(audio.load("v", 0)).rejects.toThrow("no audio");
    expect(audio.hasFailed("v")).toBe(true);
    audio.request("v", 0);
    expect(requests).toHaveLength(0);
    audio.release("v");
    expect(audio.hasFailed("v")).toBe(false);
    expect(requests.at(-1)).toMatchObject({ method: "closeAudio", params: { mediaId: "v" } });
    audio.reset();
    expect(audio.cache.stats.entries).toBe(0);
  });
});
