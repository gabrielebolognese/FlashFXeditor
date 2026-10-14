import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildMp4, ROTATE_90_MATRIX, videoSamples } from "../probe/testMp4.js";
import { DecodeSessions, IDLE_MS, NotOpenError, UnsupportedCodecError, type Delivered } from "./DecodeSessions.js";
import { FakeDecoder, frameCounter, type FakeFrame, type FakeOptions } from "./testDecoder.js";

const FRAME_US = 33_367; // 1001 ticks at 30000
const frameUs = (n: number) => Math.round((n * 1001 * 1e6) / 30000);

function videoFile(name: string, frames = 90, lastModified = 1_000): File {
  const bytes = buildMp4({ tracks: [{ kind: "video", codec: "hvc1", timescale: 30000, width: 1920, height: 1080, matrix: ROTATE_90_MATRIX, samples: videoSamples(frames, 1001, 30) }] });
  return new File([bytes as Uint8Array<ArrayBuffer>], name, { lastModified });
}

function setup(options: { supported?: boolean; maxLiveDecoders?: number; decoder?: FakeOptions } = {}) {
  const decoders: FakeDecoder[] = [];
  const sessions = new DecodeSessions<FakeFrame>({
    createDecoder: (callbacks) => {
      const decoder = new FakeDecoder(callbacks, options.decoder ?? {});
      decoders.push(decoder);
      return decoder;
    },
    isConfigSupported: async () => options.supported ?? true,
    ...(options.maxLiveDecoders !== undefined && { maxLiveDecoders: options.maxLiveDecoders }),
  });
  const signal = new AbortController().signal;
  /** The frame at `timeUs` (closed at once); approximate frames are closed too. */
  const frame = async (mediaId: string, timeUs: number, priority: "scrub" | "playback" = "playback") => {
    const approximate: number[] = [];
    const result = await sessions.requestFrame({ mediaId, lod: "full", timeUs, priority }, signal, (value: Delivered<FakeFrame>) => {
      approximate.push(value.timeUs);
      value.frame.close();
    });
    result.frame.close();
    return { timeUs: result.timeUs, approximate };
  };
  return { sessions, decoders, frame, signal };
}

beforeEach(() => {
  frameCounter.open = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("DecodeSessions", () => {
  it("builds the sample index on the first open and loads it from the cache on the next", async () => {
    const { sessions } = setup();
    const file = videoFile("a.mov");
    const first = await sessions.open({ mediaId: "a", lod: "full", file, cachedIndex: null });
    expect(first.index).toBeInstanceOf(ArrayBuffer);
    expect(first.info).toMatchObject({ codedWidth: 1920, codedHeight: 1080, rotation: 90, decodable: true, indexFromCache: false });
    expect(first.info.codec).toMatch(/^hvc1\./);
    expect(first.info.frameTimesUs).toHaveLength(90);
    expect(first.info.frameTimesUs[1]).toBe(FRAME_US);

    // Same size and lastModified, garbage content: only a cache hit can open it.
    const garbage = new File([new Uint8Array(file.size)], "a.mov", { lastModified: file.lastModified });
    const second = await sessions.open({ mediaId: "a", lod: "full", file: garbage, cachedIndex: new Blob([first.index as ArrayBuffer]) });
    expect(second.index).toBeNull();
    expect(second.info.indexFromCache).toBe(true);
    expect(Array.from(second.info.frameTimesUs)).toEqual(Array.from(first.info.frameTimesUs));
    expect(sessions.stats()).toMatchObject({ indexParsed: 1, indexFromCache: 1, sessions: 1 });
  });

  it("parses again when the cached index belongs to another version of the file", async () => {
    const { sessions } = setup();
    const first = await sessions.open({ mediaId: "a", lod: "full", file: videoFile("a.mov", 90, 1_000), cachedIndex: null });
    const edited = await sessions.open({ mediaId: "a", lod: "full", file: videoFile("a.mov", 60, 2_000), cachedIndex: new Blob([first.index as ArrayBuffer]) });
    expect(edited.info.indexFromCache).toBe(false);
    expect(edited.info.frameTimesUs).toHaveLength(60);
    expect(sessions.stats().indexParsed).toBe(2);
  });

  it("serves the frame shown at a time, with the keyframe first for a far scrub", async () => {
    const { sessions, frame } = setup();
    await sessions.open({ mediaId: "a", lod: "full", file: videoFile("a.mov"), cachedIndex: null });
    expect(await frame("a", frameUs(40) + 10)).toEqual({ timeUs: frameUs(40), approximate: [] });
    expect(await frame("a", frameUs(80), "scrub")).toEqual({ timeUs: frameUs(80), approximate: [frameUs(60)] });
    expect(sessions.stats()).toMatchObject({ seeks: 2, liveDecoders: 1 });
  });

  it("prefetches a range as progress frames", async () => {
    const { sessions, signal } = setup();
    await sessions.open({ mediaId: "a", lod: "full", file: videoFile("a.mov"), cachedIndex: null });
    const times: number[] = [];
    const result = await sessions.prefetch({ mediaId: "a", lod: "full", fromUs: frameUs(10), toUs: frameUs(14) }, signal, (value) => {
      times.push(value.timeUs);
      value.frame.close();
    });
    expect(result).toEqual({ frames: 5 });
    expect(times).toEqual([10, 11, 12, 13, 14].map(frameUs));
  });

  it("refuses frames of a video it cannot decode, and of one not open", async () => {
    const { sessions, frame } = setup({ supported: false });
    const { info } = await sessions.open({ mediaId: "a", lod: "full", file: videoFile("a.mov"), cachedIndex: null });
    expect(info.decodable).toBe(false);
    await expect(frame("a", 0)).rejects.toBeInstanceOf(UnsupportedCodecError);
    await expect(frame("b", 0)).rejects.toBeInstanceOf(NotOpenError);
  });

  it("closes a decoder and its frames after 10 s without requests", async () => {
    vi.useFakeTimers();
    const { sessions, frame } = setup();
    await sessions.open({ mediaId: "a", lod: "full", file: videoFile("a.mov"), cachedIndex: null });
    await frame("a", frameUs(5));
    await vi.advanceTimersByTimeAsync(IDLE_MS - 100);
    // A request restarts the countdown.
    await frame("a", frameUs(6));
    await vi.advanceTimersByTimeAsync(IDLE_MS - 100);
    expect(sessions.stats()).toMatchObject({ liveDecoders: 1, idleCloses: 0 });
    expect(sessions.stats().openFrames).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(200);
    expect(sessions.stats()).toMatchObject({ liveDecoders: 0, openFrames: 0, idleCloses: 1, sessions: 1 });
    expect(frameCounter.open).toBe(0);
    // The index stays: a new request only needs a decoder.
    expect((await frame("a", frameUs(7))).timeUs).toBe(frameUs(7));
    expect(sessions.stats().indexParsed).toBe(1);
  });

  it("switching between three videos keeps three decoders and leaks no frames", async () => {
    vi.useFakeTimers();
    const { sessions, frame, decoders } = setup();
    for (const id of ["a", "b", "c"]) await sessions.open({ mediaId: id, lod: "full", file: videoFile(`${id}.mov`), cachedIndex: null });
    for (let round = 0; round < 5; round++) {
      for (const id of ["a", "b", "c"]) await frame(id, frameUs(round * 17 + 3), "scrub");
    }
    expect(sessions.stats().liveDecoders).toBe(3);
    expect(decoders).toHaveLength(3);
    expect(frameCounter.open).toBe(sessions.stats().openFrames);
    await vi.advanceTimersByTimeAsync(IDLE_MS + 1);
    expect(sessions.stats()).toMatchObject({ liveDecoders: 0, openFrames: 0 });
    expect(frameCounter.open).toBe(0);
  });

  it("closes the least recently used idle decoder beyond the limit", async () => {
    const { sessions, frame } = setup({ maxLiveDecoders: 2 });
    for (const id of ["a", "b", "c"]) await sessions.open({ mediaId: id, lod: "full", file: videoFile(`${id}.mov`), cachedIndex: null });
    await frame("a", 0);
    await frame("b", 0);
    await frame("a", frameUs(1));
    await frame("c", 0);
    expect(sessions.stats().liveDecoders).toBe(2);
    // "b" was the least recently used: "a" still continues without a new seek.
    const seeks = sessions.stats().seeks;
    await frame("a", frameUs(2));
    expect(sessions.stats().seeks).toBe(seeks);
    await frame("b", frameUs(1));
    expect(sessions.stats().seeks).toBe(seeks + 1);
  });

  it("closes the sessions of a media", async () => {
    const { sessions, frame } = setup();
    await sessions.open({ mediaId: "a", lod: "full", file: videoFile("a.mov"), cachedIndex: null });
    await frame("a", frameUs(3));
    sessions.close("a");
    expect(sessions.stats()).toMatchObject({ sessions: 0, liveDecoders: 0, openFrames: 0, seeks: 1 });
    expect(frameCounter.open).toBe(0);
    await expect(frame("a", 0)).rejects.toBeInstanceOf(NotOpenError);
  });

  it("drops a video closed while it opens, and keeps the others", async () => {
    const { sessions, frame } = setup();
    const a = sessions.open({ mediaId: "a", lod: "full", file: videoFile("a.mov"), cachedIndex: null });
    const b = sessions.open({ mediaId: "b", lod: "full", file: videoFile("b.mov"), cachedIndex: null });
    sessions.close("a");
    await expect(a).rejects.toMatchObject({ name: "AbortError" });
    await b;
    expect(sessions.stats().sessions).toBe(1);
    await expect(frame("a", 0)).rejects.toBeInstanceOf(NotOpenError);
    expect((await frame("b", frameUs(2))).timeUs).toBe(frameUs(2));
    // Opened again, it stays.
    await sessions.open({ mediaId: "a", lod: "full", file: videoFile("a.mov"), cachedIndex: null });
    expect(sessions.stats().sessions).toBe(2);
  });

  it("marks the nearest frame approximate when the decoder cannot produce the one asked for", async () => {
    const { sessions, signal } = setup({ decoder: { drop: new Set([frameUs(12)]) } });
    await sessions.open({ mediaId: "a", lod: "full", file: videoFile("a.mov"), cachedIndex: null });
    const request = async (timeUs: number) => {
      const result = await sessions.requestFrame({ mediaId: "a", lod: "full", timeUs, priority: "playback" }, signal, (value) => value.frame.close());
      result.frame.close();
      return { timeUs: result.timeUs, approximate: result.approximate };
    };
    expect(await request(frameUs(11))).toEqual({ timeUs: frameUs(11), approximate: false });
    const nearest = await request(frameUs(12));
    expect(nearest.approximate).toBe(true);
    expect([frameUs(11), frameUs(13)]).toContain(nearest.timeUs);
    expect(frameCounter.open).toBe(sessions.stats().openFrames);
  });
});
