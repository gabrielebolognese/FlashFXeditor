import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TextureHandle } from "../../render/gpu/renderer.js";
import { TexturePool } from "../cache/TexturePool.js";
import type { DeliveredFrame, Method, VideoInfo } from "../workers/protocol.js";
import type { RequestOptions } from "../workers/WorkerPool.js";
import { FrameService, MAX_IN_FLIGHT_PER_MEDIA, UnsupportedCodecError, type FrameResult, type FrameSource } from "./FrameService.js";
import { FakeFrame, frameCounter } from "./testDecoder.js";

const FRAME = 33_333;
const times = (count: number) => Float64Array.from({ length: count }, (_, i) => i * FRAME);

function info(overrides: Partial<VideoInfo> = {}): VideoInfo {
  return { frameTimesUs: times(300), codec: "hvc1.2.4.L153.B0", codedWidth: 3840, codedHeight: 2160, rotation: 0, decodable: true, indexFromCache: false, ...overrides };
}

interface Call {
  method: Method;
  params: Record<string, unknown>;
  options: RequestOptions<DeliveredFrame>;
  resolve(value: unknown): void;
  reject(error: unknown): void;
}

function texture(): TextureHandle & { destroyed: boolean } {
  return {
    width: 4,
    height: 4,
    mipLevels: 1,
    bytes: 64,
    destroyed: false,
    get valid() {
      return !this.destroyed;
    },
    destroy() {
      this.destroyed = true;
    },
  };
}

/** A FrameService over a scripted worker: openVideo answers at once, frame requests wait for `deliver`. */
function setup(options: { info?: VideoInfo; cachedIndex?: boolean; ready?: boolean } = {}) {
  const calls: Call[] = [];
  const opens: unknown[] = [];
  const workers = {
    request: vi.fn((method: Method, params: unknown, requestOptions: RequestOptions<DeliveredFrame> = {}) => {
      if (method === "openVideo") {
        opens.push(params);
        return Promise.resolve({ info: { ...(options.info ?? info()), indexFromCache: options.cachedIndex ?? false }, index: options.cachedIndex ? null : new ArrayBuffer(8) });
      }
      if (method === "closeVideo") return Promise.resolve(null);
      return new Promise((resolve, reject) => {
        const call: Call = { method, params: params as Record<string, unknown>, options: requestOptions, resolve, reject };
        calls.push(call);
        requestOptions.signal?.addEventListener("abort", () => reject(requestOptions.signal?.reason), { once: true });
      });
    }),
  };
  const uploads: FakeFrame[] = [];
  const renderer = {
    ready: options.ready ?? true,
    uploadVideoFrame: (frame: VideoFrame) => {
      uploads.push(frame as unknown as FakeFrame);
      frame.close();
      return texture();
    },
  };
  const pool = new TexturePool(1024 * 1024);
  const writes: string[] = [];
  const source: FrameSource = {
    file: async (mediaId) => new File(["x"], `${mediaId}.mov`),
    readIndex: async () => (options.cachedIndex ? new Blob(["index"]) : null),
    writeIndex: async (mediaId) => {
      writes.push(mediaId);
    },
  };
  let clock = 0;
  const frames = new FrameService({ workers: workers as never, renderer, pool, now: () => clock });
  const detach = frames.attach(source);
  const frameCalls = () => calls.filter((c) => c.method === "requestFrame" && !c.options.signal?.aborted);
  /** Answers a frame request with a frame at its requested time (or `timeUs`). */
  const deliver = (call: Call, timeUs = call.params.timeUs as number) => call.resolve({ frame: new FakeFrame(timeUs), timeUs, approximate: false });
  const tick = (ms: number) => {
    clock += ms;
  };
  return { frames, workers, calls, frameCalls, opens, deliver, pool, uploads, writes, detach, tick };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  frameCounter.open = 0;
});

describe("FrameService", () => {
  it("opens a video once and caches a newly built sample index", async () => {
    const { frames, opens, writes } = setup();
    const [a, b] = await Promise.all([frames.video("m1"), frames.video("m1")]);
    expect(a).toBe(b);
    expect(opens).toHaveLength(1);
    expect(opens[0]).toMatchObject({ mediaId: "m1", lod: "full", cachedIndex: null });
    await settle();
    expect(writes).toEqual(["m1"]);
    expect(frames.stats).toMatchObject({ indexParsed: 1, indexFromCache: 0 });
  });

  it("does not write the index back when it came from the cache", async () => {
    const { frames, opens, writes } = setup({ cachedIndex: true });
    await frames.video("m1");
    await settle();
    expect(opens[0]).toMatchObject({ cachedIndex: expect.any(Blob) });
    expect(writes).toEqual([]);
    expect(frames.stats).toMatchObject({ indexParsed: 0, indexFromCache: 1 });
  });

  it("uploads the frame into the pool under its frame time, closes it, and serves it again from the pool", async () => {
    const { frames, frameCalls, deliver, pool, uploads, tick } = setup();
    const request = frames.getFrame("m1", 10 * FRAME + 5, { priority: "playback" });
    await settle();
    expect(frameCalls()[0]?.params).toMatchObject({ mediaId: "m1", lod: "full", timeUs: 10 * FRAME, priority: "playback" });
    tick(12);
    deliver(frameCalls()[0] as Call);
    const result = await request;
    expect(result).toMatchObject({ timeUs: 10 * FRAME, approximate: false, key: { mediaId: "m1", lod: "full", timeUs: 10 * FRAME } });
    expect(pool.get(result.key)).toBe(result.texture);
    expect(uploads).toHaveLength(1);
    expect(frameCounter.open).toBe(0);
    expect(frames.stats).toMatchObject({ openFrames: 0, framesReceived: 1, exactLastMs: 12 });

    const again = await frames.getFrame("m1", 10 * FRAME + 100);
    expect(again.texture).toBe(result.texture);
    expect(frameCalls()).toHaveLength(1);
    expect(frames.stats.poolHits).toBe(1);
  });

  it("supersedes the previous scrub of the same media", async () => {
    const { frames, calls, frameCalls, deliver } = setup();
    await frames.video("m1");
    const first = frames.getFrame("m1", 5 * FRAME);
    await settle();
    const second = frames.getFrame("m1", 50 * FRAME);
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    await settle();
    expect(calls[0]?.options.signal?.aborted).toBe(true);
    deliver(frameCalls()[0] as Call);
    expect((await second).timeUs).toBe(50 * FRAME);
    expect(frames.stats).toMatchObject({ superseded: 1, failed: 0 });
  });

  it("cancels prefetches of the media being scrubbed, not of other media", async () => {
    const { frames, calls } = setup();
    await Promise.all([frames.video("m1"), frames.video("m2")]);
    const p1 = frames.prefetch("m1", 0, 30 * FRAME);
    const p2 = frames.prefetch("m2", 0, 30 * FRAME);
    await settle();
    void frames.getFrame("m1", 100 * FRAME).catch(() => undefined);
    await expect(p1).rejects.toMatchObject({ name: "AbortError" });
    const prefetches = calls.filter((c) => c.method === "prefetch");
    expect(prefetches.map((c) => c.options.signal?.aborted)).toEqual([true, false]);
    (prefetches[1] as Call).resolve({ frames: 31 });
    await expect(p2).resolves.toBe(31);
  });

  it("uploads prefetched frames as they arrive", async () => {
    const { frames, calls, pool } = setup();
    await frames.video("m1");
    const done = frames.prefetch("m1", 0, 2 * FRAME);
    await settle();
    const call = calls.find((c) => c.method === "prefetch") as Call;
    for (let i = 0; i < 3; i++) call.options.onProgress?.({ frame: new FakeFrame(i * FRAME) as unknown as VideoFrame, timeUs: i * FRAME, approximate: false });
    call.resolve({ frames: 3 });
    expect(await done).toBe(3);
    for (let i = 0; i < 3; i++) expect(pool.has({ mediaId: "m1", lod: "full", timeUs: i * FRAME })).toBe(true);
    expect(frameCounter.open).toBe(0);
  });

  it("keeps at most four requests per media at the worker, the most urgent first", async () => {
    const { frames, frameCalls, deliver } = setup();
    await frames.video("m1");
    const playback = Array.from({ length: 6 }, (_, i) => frames.getFrame("m1", i * FRAME, { priority: "playback" }));
    await settle();
    expect(frameCalls()).toHaveLength(MAX_IN_FLIGHT_PER_MEDIA);
    const scrub = frames.getFrame("m1", 200 * FRAME, { priority: "scrub" });
    await settle();
    deliver(frameCalls()[0] as Call);
    await settle();
    // The scrub took the freed slot before the two waiting playback requests.
    expect(frameCalls().map((c) => c.params.timeUs)).toEqual([0, 1, 2, 3, 200].map((i) => i * FRAME));
    for (const call of frameCalls().slice(1)) deliver(call);
    await settle();
    for (const call of frameCalls().slice(5)) deliver(call);
    await expect(Promise.all([...playback, scrub])).resolves.toHaveLength(7);
  });

  it("shows the nearest cached frame at once, then a closer keyframe, then the exact frame", async () => {
    const { frames, frameCalls, deliver, tick } = setup();
    await frames.video("m1");
    // Frame 100 is cached.
    const cachedRequest = frames.getFrame("m1", 100 * FRAME, { priority: "playback" });
    await settle();
    deliver(frameCalls()[0] as Call);
    await cachedRequest;

    const shown: FrameResult[] = [];
    const request = frames.getFrame("m1", 130 * FRAME, { onApproximate: (r) => shown.push(r) });
    // Synchronously, inside the call.
    expect(shown.map((r) => [r.timeUs, r.approximate])).toEqual([[100 * FRAME, true]]);
    await settle();
    const call = frameCalls()[1] as Call;
    tick(30);
    // A keyframe farther than the cached frame is not shown; a closer one is.
    call.options.onProgress?.({ frame: new FakeFrame(60 * FRAME) as unknown as VideoFrame, timeUs: 60 * FRAME, approximate: true });
    call.options.onProgress?.({ frame: new FakeFrame(120 * FRAME) as unknown as VideoFrame, timeUs: 120 * FRAME, approximate: true });
    expect(shown.map((r) => r.timeUs)).toEqual([100 * FRAME, 120 * FRAME]);
    tick(40);
    deliver(call);
    expect((await request).timeUs).toBe(130 * FRAME);
    expect(frames.stats).toMatchObject({ approxLastMs: 0, exactLastMs: 70 });
    expect(frameCounter.open).toBe(0);
  });

  it("refuses frames of a video the browser cannot decode", async () => {
    const { frames, frameCalls } = setup({ info: info({ decodable: false }) });
    await expect(frames.getFrame("m1", 0)).rejects.toBeInstanceOf(UnsupportedCodecError);
    expect(frameCalls()).toHaveLength(0);
    expect(frames.stats.failed).toBe(1);
  });

  it("opens the video again when the worker lost it", async () => {
    const { frames, frameCalls, deliver, opens } = setup();
    const request = frames.getFrame("m1", 3 * FRAME);
    await settle();
    const lost = new Error("Video m1 (full) is not open");
    lost.name = "NotOpenError";
    (frameCalls()[0] as Call).reject(lost);
    await settle();
    expect(opens).toHaveLength(2);
    deliver(frameCalls()[1] as Call);
    expect((await request).timeUs).toBe(3 * FRAME);
  });

  it("closes the frame and fails when the GPU device is not ready", async () => {
    const { frames, frameCalls, deliver, uploads } = setup({ ready: false });
    const request = frames.getFrame("m1", 0);
    await settle();
    deliver(frameCalls()[0] as Call);
    await expect(request).rejects.toThrow(/not ready/);
    expect(uploads).toHaveLength(0);
    expect(frameCounter.open).toBe(0);
  });

  it("releases a removed media: requests cancelled, worker sessions closed, textures freed", async () => {
    const { frames, frameCalls, deliver, workers, pool } = setup();
    const cached = frames.getFrame("m1", 0, { priority: "playback" });
    await settle();
    deliver(frameCalls()[0] as Call);
    const { key } = await cached;
    const pending = frames.getFrame("m1", 9 * FRAME);
    await settle();
    frames.release("m1");
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(workers.request).toHaveBeenCalledWith("closeVideo", { mediaId: "m1" }, expect.anything());
    expect(pool.has(key)).toBe(false);
    expect(frames.info("m1")).toBeNull();
  });

  it("closes every video when the project detaches", async () => {
    const { frames, workers, detach } = setup();
    await Promise.all([frames.video("m1"), frames.video("m2")]);
    detach();
    const closed = workers.request.mock.calls.filter(([method]) => method === "closeVideo").map(([, params]) => params);
    expect(closed).toEqual([{ mediaId: "m1" }, { mediaId: "m2" }]);
    await expect(frames.video("m1")).rejects.toThrow(/No project/);
  });
});
