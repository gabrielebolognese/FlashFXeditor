import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TextureHandle } from "../../render/gpu/renderer.js";
import { TexturePool } from "../cache/TexturePool.js";
import type { DeliveredFrame, Method, VideoInfo } from "../workers/protocol.js";
import type { RequestOptions } from "../workers/WorkerPool.js";
import { FrameService, MAX_IN_FLIGHT_PER_MEDIA, UnsupportedCodecError, type FrameResult, type FrameSource } from "./FrameService.js";
import { fitWithin } from "../../render/gpu/fitWithin.js";
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

function texture(width = 4, height = 4): TextureHandle & { destroyed: boolean } {
  return {
    width,
    height,
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
function setup(options: { info?: VideoInfo; cachedIndex?: boolean; ready?: boolean; uploadSize?: number | (() => number); proxyReady?: (mediaId: string) => boolean; failProxy?: boolean } = {}) {
  const calls: Call[] = [];
  const opens: unknown[] = [];
  const workers = {
    request: vi.fn((method: Method, params: unknown, requestOptions: RequestOptions<DeliveredFrame> = {}) => {
      if (method === "openVideo") {
        opens.push(params);
        if (options.failProxy && (params as { lod: string }).lod === "proxy") return Promise.reject(new Error("The media file is missing"));
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
  const uploadOptions: unknown[] = [];
  const renderer = {
    ready: options.ready ?? true,
    uploadVideoFrame: (frame: VideoFrame, opts?: { maxSize?: number }) => {
      uploads.push(frame as unknown as FakeFrame);
      uploadOptions.push(opts);
      frame.close();
      // Sized frames (detail tests) give textures of the upload size.
      if (!frame.displayWidth) return texture();
      const size = fitWithin(frame.displayWidth, frame.displayHeight, opts?.maxSize);
      return texture(size.width, size.height);
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
  const { uploadSize } = options;
  const frames = new FrameService({
    workers: workers as never,
    renderer,
    pool,
    now: () => clock,
    ...(uploadSize && { uploadSize: typeof uploadSize === "function" ? uploadSize : () => uploadSize }),
    ...(options.proxyReady && { proxyReady: options.proxyReady }),
  });
  const detach = frames.attach(source);
  const frameCalls = () => calls.filter((c) => c.method === "requestFrame" && !c.options.signal?.aborted);
  /** Answers a frame request with a frame at its requested time (or `timeUs`). */
  const deliver = (call: Call, timeUs = call.params.timeUs as number) => call.resolve({ frame: new FakeFrame(timeUs), timeUs, approximate: false });
  const tick = (ms: number) => {
    clock += ms;
  };
  return { frames, workers, calls, frameCalls, opens, deliver, pool, uploads, uploadOptions, writes, detach, tick };
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

  it("sends playback windows with their priority and stride and reports each frame in the pool", async () => {
    const { frames, calls, pool } = setup();
    await frames.video("m1");
    const received: FrameResult[] = [];
    const done = frames.prefetch("m1", 4 * FRAME, 12 * FRAME, { priority: "playback", stride: 4, onFrame: (result) => received.push(result) });
    await settle();
    const call = calls.find((c) => c.method === "prefetch") as Call;
    expect(call.params).toMatchObject({ mediaId: "m1", fromUs: 4 * FRAME, toUs: 12 * FRAME, priority: "playback", stride: 4 });
    expect(call.options.priority).toBe("playback");
    for (const i of [4, 8, 12]) call.options.onProgress?.({ frame: new FakeFrame(i * FRAME) as unknown as VideoFrame, timeUs: i * FRAME, approximate: false });
    call.resolve({ frames: 3 });
    expect(await done).toBe(3);
    expect(received.map((r) => r.key.timeUs)).toEqual([4 * FRAME, 8 * FRAME, 12 * FRAME]);
    expect(received.every((r) => pool.get(r.key) === r.texture)).toBe(true);
  });

  it("uploads frames at most at the configured long edge", async () => {
    const { frames, frameCalls, deliver, uploadOptions } = setup({ uploadSize: 1920 });
    const request = frames.getFrame("m1", 0);
    await settle();
    deliver(frameCalls()[0] as Call);
    await request;
    expect(uploadOptions[0]).toMatchObject({ maxSize: 1920 });
  });

  it("decodes a cached frame again for more detail and replaces the smaller texture (spec §7.1)", async () => {
    let size = 1920;
    const { frames, frameCalls, pool } = setup({ uploadSize: () => size });
    const uhd = (call: Call) => {
      const timeUs = call.params.timeUs as number;
      call.resolve({ frame: Object.assign(new FakeFrame(timeUs), { displayWidth: 3840, displayHeight: 2160 }), timeUs, approximate: false });
    };
    const first = frames.getFrame("m1", 0, { priority: "idle" });
    await settle();
    uhd(frameCalls()[0] as Call);
    const small = await first;
    expect([small.texture.width, small.texture.height]).toEqual([1920, 1080]);
    // At the same upload size a cached frame answers at once, even with a larger wish.
    expect((await frames.getFrame("m1", 0, { priority: "idle" })).texture).toBe(small.texture);
    size = 3840;
    const refreshed = frames.getFrame("m1", 0, { priority: "idle", minLongEdge: 3840 });
    await settle();
    expect(frameCalls()).toHaveLength(2);
    uhd(frameCalls()[1] as Call);
    const big = await refreshed;
    expect([big.texture.width, big.texture.height]).toEqual([3840, 2160]);
    expect(pool.get(big.key)).toBe(big.texture);
    expect(small.texture.valid).toBe(false);
    // A smaller upload never replaces a bigger texture.
    size = 1920;
    const again = frames.getFrame("m1", 0, { priority: "idle", minLongEdge: 4000 });
    await settle();
    uhd(frameCalls()[2] as Call);
    expect((await again).texture).toBe(big.texture);
  });

  it("maps media time to the nearest frame key of an opened video, media time 0 being the first frame", async () => {
    const { frames } = setup({ info: info({ frameTimesUs: Float64Array.from([1000, 1000 + FRAME, 1000 + 2 * FRAME]) }) });
    const key = { mediaId: "", lod: "full" as const, timeUs: 0 };
    expect(frames.frameKeyInto(key, "m1", 0)).toBe(-1);
    await frames.video("m1");
    expect(frames.frameKeyInto(key, "m1", FRAME - 100)).toBe(1);
    expect(key).toEqual({ mediaId: "m1", lod: "full", timeUs: 1000 + FRAME });
    expect(frames.frameKeyInto(key, "m1", 10 * FRAME)).toBe(2);
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

  it("routes proxy requests to media with a ready proxy only (spec §9.5)", () => {
    const { frames } = setup({ proxyReady: (mediaId) => mediaId === "px" });
    expect(frames.lodFor("px", "proxy")).toBe("proxy");
    expect(frames.lodFor("px", "full")).toBe("full");
    expect(frames.lodFor("m1", "proxy")).toBe("full");
    expect(setup().frames.lodFor("px", "proxy")).toBe("full");
  });

  it("goes back to the full file when the proxy fails to open, until the proxy is released", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { frames } = setup({ proxyReady: () => true, failProxy: true });
    await expect(frames.video("px", "proxy")).rejects.toThrow("missing");
    expect(frames.lodFor("px", "proxy")).toBe("full");
    expect(warn).toHaveBeenCalledTimes(1);
    frames.release("px", "proxy");
    expect(frames.lodFor("px", "proxy")).toBe("proxy");
    warn.mockRestore();
  });

  it("releases one lod of a media: its proxy sessions and textures, not the full ones", async () => {
    const { frames, frameCalls, deliver, workers, pool, opens } = setup({ proxyReady: () => true });
    const full = frames.getFrame("m1", 0, { priority: "playback" });
    const proxy = frames.getFrame("m1", 0, { priority: "playback", lod: "proxy" });
    await settle();
    expect(opens.map((o) => (o as { lod: string }).lod)).toEqual(["full", "proxy"]);
    for (const call of frameCalls()) deliver(call);
    const [fullFrame, proxyFrame] = await Promise.all([full, proxy]);
    expect(proxyFrame.key.lod).toBe("proxy");
    frames.release("m1", "proxy");
    expect(workers.request).toHaveBeenCalledWith("closeVideo", { mediaId: "m1", lod: "proxy" }, expect.anything());
    expect(pool.has(proxyFrame.key)).toBe(false);
    expect(pool.has(fullFrame.key)).toBe(true);
    expect(frames.info("m1", "proxy")).toBeNull();
    expect(frames.info("m1")).not.toBeNull();
  });

  it("uploads at least at `uploadAtLeast` (Export frame at full resolution)", async () => {
    const { frames, frameCalls, deliver, uploadOptions } = setup({ uploadSize: 960 });
    const request = frames.getFrame("m1", 0, { uploadAtLeast: 1920 });
    await settle();
    deliver(frameCalls()[0] as Call);
    await request;
    expect(uploadOptions[0]).toMatchObject({ maxSize: 1920 });
  });

  it("closes every video when the project detaches", async () => {
    const { frames, workers, detach } = setup();
    await Promise.all([frames.video("m1"), frames.video("m2")]);
    detach();
    const closed = workers.request.mock.calls.filter(([method]) => method === "closeVideo").map(([, params]) => params);
    expect(closed).toEqual([{ mediaId: "m1" }, { mediaId: "m2" }]);
    await expect(frames.video("m1")).rejects.toThrow(/No project/);
  });

  it("cancels the open of a media released while it opens", async () => {
    const { frames, workers, opens } = setup();
    // Released while the project files are read: the open never reaches the worker.
    const early = frames.video("m1");
    frames.release("m1");
    await expect(early).rejects.toMatchObject({ name: "AbortError" });
    expect(opens).toHaveLength(0);
    // Released while the worker opens it: the worker request is cancelled, then the video closed.
    let openSignal: AbortSignal | undefined;
    workers.request.mockImplementationOnce((_method, _params, options = {}) => {
      openSignal = options.signal;
      return new Promise((_resolve, reject) => options.signal?.addEventListener("abort", () => reject(options.signal?.reason), { once: true }));
    });
    const late = frames.video("m1");
    await settle();
    expect(openSignal?.aborted).toBe(false);
    frames.release("m1");
    expect(openSignal?.aborted).toBe(true);
    await expect(late).rejects.toMatchObject({ name: "AbortError" });
    expect(workers.request).toHaveBeenLastCalledWith("closeVideo", { mediaId: "m1" }, expect.anything());
  });

  it("passes on a frame the decoder could only approximate, with no exact-latency sample", async () => {
    const { frames, frameCalls, tick } = setup();
    const request = frames.getFrame("m1", 12 * FRAME, { priority: "playback" });
    await settle();
    tick(20);
    (frameCalls()[0] as Call).resolve({ frame: new FakeFrame(13 * FRAME), timeUs: 13 * FRAME, approximate: true });
    expect(await request).toMatchObject({ timeUs: 13 * FRAME, approximate: true, key: { timeUs: 13 * FRAME } });
    expect(frames.stats).toMatchObject({ exactLastMs: null, approxLastMs: 20, openFrames: 0 });
    expect(frameCounter.open).toBe(0);
  });
});

describe("FrameService decode activity", () => {
  it("announces and counts the frame requests that go to the decoder, not pool hits", async () => {
    const t = setup();
    const announced = vi.fn();
    t.frames.onDecodeRequest(announced);
    const first = t.frames.getFrame("m", 10 * FRAME, { priority: "idle" });
    await settle();
    expect(announced).toHaveBeenCalledTimes(1);
    expect(t.frames.decodesInFlight).toBe(1);
    t.deliver(t.frameCalls()[0] as Call);
    await first;
    expect(t.frames.decodesInFlight).toBe(0);
    await t.frames.getFrame("m", 10 * FRAME, { priority: "idle" });
    expect(announced).toHaveBeenCalledTimes(1);
    expect(t.frames.decodesInFlight).toBe(0);
  });

  it("stops counting a request cancelled before it reached the decoder", async () => {
    const t = setup();
    const controller = new AbortController();
    const pending = t.frames.getFrame("m", 20 * FRAME, { priority: "idle", signal: controller.signal }).catch(() => "cancelled");
    await settle();
    controller.abort();
    expect(await pending).toBe("cancelled");
    expect(t.frames.decodesInFlight).toBe(0);
  });
});
