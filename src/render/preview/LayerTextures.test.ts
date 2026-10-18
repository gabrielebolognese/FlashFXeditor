import { describe, expect, it, vi } from "vitest";
import { imageKey, TexturePool, type Lod, type TextureKey } from "../../media/cache/TexturePool.js";
import type { FrameRequestOptions, FrameResult } from "../../media/decode/FrameService.js";
import type { FramePriority, VideoInfo } from "../../media/workers/protocol.js";
import type { Composite, MediaLayer, SolidLayer, TextureLayer } from "../compositor/drawList.js";
import type { TextureHandle } from "../gpu/renderer.js";
import type { Mat3 } from "../mat3.js";
import { CRASH_RETRY_MS, LayerTextures } from "./LayerTextures.js";

const FRAME = 33_333;
/** Frame times starting at a composition offset of 1000 us. */
const times = (count: number) => Float64Array.from({ length: count }, (_, i) => 1000 + i * FRAME);

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

interface Request {
  mediaId: string;
  timeUs: number;
  options: FrameRequestOptions;
  resolve(result: FrameResult): void;
  reject(error: unknown): void;
}

function info(overrides: Partial<VideoInfo> = {}): VideoInfo {
  return { frameTimesUs: times(300), codec: "avc1.64001f", codedWidth: 1920, codedHeight: 1080, rotation: 0, decodable: true, indexFromCache: true, ...overrides };
}

function setup(options: { wantedLod?: (mediaId: string) => Lod; proxies?: Set<string> } = {}) {
  const pool = new TexturePool();
  /** Opened videos by `mediaId` (full) or `mediaId|proxy`. */
  const infos = new Map<string, VideoInfo>([
    ["a", info()],
    ["b", info()],
  ]);
  const proxies = options.proxies ?? new Set<string>();
  const requests: Request[] = [];
  const prefetches: { mediaId: string; fromUs: number; toUs: number; lod?: Lod }[] = [];
  const opens: string[] = [];
  let openResolve: (() => void) | null = null;
  const frames = {
    info: (mediaId: string, lod: Lod = "full") => infos.get(lod === "full" ? mediaId : `${mediaId}|${lod}`) ?? null,
    video: vi.fn((mediaId: string, lod: Lod = "full") => {
      opens.push(lod === "full" ? mediaId : `${mediaId}|${lod}`);
      return new Promise<VideoInfo>((resolve) => {
        openResolve = () => {
          const value = info();
          infos.set(lod === "full" ? mediaId : `${mediaId}|${lod}`, value);
          resolve(value);
        };
      });
    }),
    lodFor: (mediaId: string, wanted: Lod): Lod => (wanted === "proxy" && proxies.has(mediaId) ? "proxy" : "full"),
    getFrame: vi.fn((mediaId: string, timeUs: number, options: FrameRequestOptions = {}) => {
      // Like FrameService: the nearest cached frame of the lod as a stand-in, synchronously.
      const near = pool.nearest(mediaId, options.lod ?? "full", timeUs);
      if (near && options.onApproximate) options.onApproximate({ texture: near.texture, key: near.key, timeUs: near.key.timeUs, approximate: true });
      return new Promise<FrameResult>((resolve, reject) => {
        requests.push({ mediaId, timeUs, options, resolve, reject });
        options.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
      });
    }),
    prefetch: vi.fn(async (mediaId: string, fromUs: number, toUs: number, prefetchOptions: { lod?: Lod } = {}) => {
      prefetches.push({ mediaId, fromUs, toUs, ...(prefetchOptions.lod === "proxy" && { lod: "proxy" }) });
      return 1;
    }),
  };
  const images = {
    get: (mediaId: string) => pool.get(imageKey(mediaId)),
    load: vi.fn(() => new Promise<TextureHandle | null>(() => undefined)),
    frameKey: ((mediaId: string) => imageKey(mediaId)) as (mediaId: string, timeUs: number) => TextureKey | null,
    vectorSize: (() => null) as (mediaId: string) => { width: number; height: number } | null,
    refine: vi.fn(async (): Promise<TextureHandle | null> => null),
  };
  const onChange = vi.fn();
  const textures = new LayerTextures({ frames, images, pool, onChange, ...(options.wantedLod && { wantedLod: options.wantedLod }) });
  /** Uploads a frame into the pool, as the frame service does on delivery. */
  const cache = (mediaId: string, timeUs: number, lod: Lod = "full") => {
    const tex = texture();
    pool.put({ mediaId, lod, timeUs }, tex);
    return tex;
  };
  const deliver = (request: Request, timeUs = request.timeUs, approximate = false) => {
    const lod = request.options.lod ?? "full";
    const tex = cache(request.mediaId, timeUs, lod);
    const key: TextureKey = { mediaId: request.mediaId, lod, timeUs };
    request.resolve({ texture: tex, key, timeUs, approximate });
    return tex;
  };
  const live = () => requests.filter((r) => !r.options.signal?.aborted);
  const flush = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };
  return { pool, infos, requests, live, prefetches, opens, frames, images, onChange, textures, cache, deliver, flush, open: () => openResolve?.() };
}

function media(fields: Partial<MediaLayer> & { trackId: string; mediaId: string }): MediaLayer {
  return { kind: "media", clipId: `${fields.trackId}-${fields.mediaId}`, still: false, timeUs: 0, transform: [100, 0, 0, 50, 10, 20], opacity: 1, crop: { u0: 0, v0: 0, u1: 1, v1: 1 }, ...fields };
}

function composite(...layers: (MediaLayer | SolidLayer)[]): Composite {
  return { width: 1080, height: 1920, background: { r: 0, g: 0, b: 0, a: 1 }, layers };
}

const textureOf = (layer: unknown) => (layer as TextureLayer).texture;
const resolve = (textures: LayerTextures, priority: FramePriority, ...layers: (MediaLayer | SolidLayer)[]) => textures.resolve(composite(...layers), priority).layers;

describe("LayerTextures", () => {
  it("decodes a cached frame again once for detail at rest, drawing it meanwhile (spec §7.1)", async () => {
    const { textures, infos, pool, requests, flush, onChange } = setup();
    infos.set("a", info({ codedWidth: 3840, codedHeight: 2160 }));
    infos.set("b", info({ codedWidth: 1920, codedHeight: 1088 }));
    const key: TextureKey = { mediaId: "a", lod: "full", timeUs: 1000 };
    const small = texture(1920, 1080);
    pool.put(key, small);
    const layer = media({ trackId: "v1", mediaId: "a", timeUs: 0 });
    const pass = (priority: FramePriority) => textures.resolve(composite(layer), priority, 3840).layers;
    // Playing or scrubbing: the cached frame as it is.
    pass("playback");
    pass("scrub");
    expect(requests).toHaveLength(0);
    expect(textureOf(pass("idle")[0])).toBe(small);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.options).toMatchObject({ priority: "idle", minLongEdge: 3456 });
    expect(requests[0]?.options.onApproximate).toBeUndefined();
    // Asked once: later passes draw the small texture and leave the request running.
    expect(textureOf(pass("idle")[0])).toBe(small);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.options.signal?.aborted).toBe(false);
    const big = texture(3840, 2160);
    pool.put(key, big);
    requests[0]?.resolve({ texture: big, key, timeUs: 1000, approximate: false });
    await flush();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(textureOf(pass("idle")[0])).toBe(big);
    expect(requests).toHaveLength(1);
    // A frame at its video's size (coded 1088 for 1080) is not decoded again.
    pool.put({ mediaId: "b", lod: "full", timeUs: 1000 }, texture(1920, 1080));
    textures.resolve(composite(media({ trackId: "v1", mediaId: "b", timeUs: 0 })), "idle", 3840);
    expect(requests).toHaveLength(1);
  });

  it("draws a cached frame at once, picking the frame time nearest to the media time, and pins it", () => {
    const { textures, cache, pool, frames } = setup();
    // Media time 50 ms = cts 51 000: nearest frame 2 (67 666 us is 16.7 ms away, 34 333 is 16.7 ms + 1 away).
    const tex = cache("a", 1000 + 2 * FRAME);
    const layers = resolve(textures, "idle", media({ trackId: "v1", mediaId: "a", timeUs: 50_000 }));
    expect(layers).toHaveLength(1);
    expect(textureOf(layers[0])).toBe(tex);
    expect((layers[0] as TextureLayer).transform).toEqual([100, 0, 0, 50, 10, 20]);
    expect(frames.getFrame).not.toHaveBeenCalled();
    expect(pool.isPinned({ mediaId: "a", lod: "full", timeUs: 1000 + 2 * FRAME })).toBe(true);
    expect(textures.stats).toMatchObject({ layers: 1, exact: 1, held: 0 });
  });

  it("requests a missing frame with scrub priority, draws the nearest cached one meanwhile, then the exact one", async () => {
    const { textures, cache, live, deliver, onChange, pool, flush } = setup();
    const near = cache("a", 1000);
    const layers = resolve(textures, "scrub", media({ trackId: "v1", mediaId: "a", timeUs: 10 * FRAME }));
    expect(live()).toHaveLength(1);
    expect(live()[0]).toMatchObject({ mediaId: "a", timeUs: 1000 + 10 * FRAME });
    expect(live()[0]?.options.priority).toBe("scrub");
    // The stand-in is used by this pass: no extra redraw for it.
    expect(textureOf(layers[0])).toBe(near);
    expect(onChange).not.toHaveBeenCalled();
    expect(textures.stats).toMatchObject({ standIns: 1, pending: 1 });
    // The same frame again: no second request.
    resolve(textures, "scrub", media({ trackId: "v1", mediaId: "a", timeUs: 10 * FRAME }));
    expect(live()).toHaveLength(1);

    const exact = deliver(live()[0] as never);
    await flush();
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = resolve(textures, "scrub", media({ trackId: "v1", mediaId: "a", timeUs: 10 * FRAME }));
    expect(textureOf(next[0])).toBe(exact);
    expect(pool.isPinned({ mediaId: "a", lod: "full", timeUs: 1000 })).toBe(false);
    expect(pool.isPinned({ mediaId: "a", lod: "full", timeUs: 1000 + 10 * FRAME })).toBe(true);
  });

  it("aborts the request of a frame no longer wanted", () => {
    const { textures, requests } = setup();
    resolve(textures, "scrub", media({ trackId: "v1", mediaId: "a", timeUs: 10 * FRAME }));
    resolve(textures, "scrub", media({ trackId: "v1", mediaId: "a", timeUs: 20 * FRAME }));
    expect(requests).toHaveLength(2);
    expect(requests[0]?.options.signal?.aborted).toBe(true);
    expect(requests[1]?.options.signal?.aborted).toBe(false);
  });

  it("gives only the first layer of a media the scrub priority in a pass", () => {
    const { textures, live } = setup();
    resolve(textures, "scrub", media({ trackId: "v1", mediaId: "a", timeUs: 10 * FRAME }), media({ trackId: "v2", mediaId: "a", timeUs: 50 * FRAME }), media({ trackId: "v3", mediaId: "b", timeUs: 0 }));
    expect(live().map((r) => [r.mediaId, r.options.priority])).toEqual([
      ["a", "scrub"],
      ["a", "idle"],
      ["b", "scrub"],
    ]);
    resolve(textures, "idle", media({ trackId: "v1", mediaId: "a", timeUs: 11 * FRAME }));
    expect(live().at(-1)?.options.priority).toBe("idle");
  });

  it("holds the track's previous layer, with its own geometry, across a cut to a frame not ready yet", async () => {
    const { textures, cache, live, deliver, flush } = setup();
    const first = cache("a", 1000 + 29 * FRAME);
    resolve(textures, "scrub", media({ trackId: "v1", mediaId: "a", timeUs: 29 * FRAME }));
    // The cut: track v1 now shows media b, whose frame is not cached.
    const held = resolve(textures, "scrub", media({ trackId: "v1", mediaId: "b", timeUs: 0, transform: [1, 0, 0, 1, 0, 0], opacity: 0.5 }));
    expect(held).toHaveLength(1);
    expect(textureOf(held[0])).toBe(first);
    expect((held[0] as TextureLayer).transform).toEqual([100, 0, 0, 50, 10, 20]);
    expect((held[0] as TextureLayer).opacity).toBe(1);
    expect(textures.stats).toMatchObject({ held: 1, missing: 0 });
    const exact = deliver(live().at(-1) as never);
    await flush();
    const after = resolve(textures, "scrub", media({ trackId: "v1", mediaId: "b", timeUs: 0, transform: [1, 0, 0, 1, 0, 0], opacity: 0.5 }));
    expect(textureOf(after[0])).toBe(exact);
    expect((after[0] as TextureLayer).transform).toEqual([1, 0, 0, 1, 0, 0]);
    expect((after[0] as TextureLayer).opacity).toBe(0.5);
  });

  it("draws a frame the decoder settled on instead, and asks again only once another frame was wanted", async () => {
    const { textures, live, deliver, flush, requests } = setup();
    const wanted = media({ trackId: "v1", mediaId: "a", timeUs: 40 * FRAME });
    resolve(textures, "idle", wanted);
    const nearest = deliver(live()[0] as never, 1000 + 38 * FRAME, true);
    await flush();
    const layers = resolve(textures, "idle", wanted);
    expect(textureOf(layers[0])).toBe(nearest);
    expect(requests).toHaveLength(1);
    resolve(textures, "idle", media({ trackId: "v1", mediaId: "a", timeUs: 41 * FRAME }));
    resolve(textures, "idle", wanted);
    expect(requests.map((r) => r.timeUs)).toEqual([1000 + 40 * FRAME, 1000 + 41 * FRAME, 1000 + 40 * FRAME]);
  });

  it("while playing, asks for nothing and uses no stand-in: a frame not decoded yet holds the track's previous layer", () => {
    const { textures, cache, requests, frames } = setup();
    const shown = cache("a", 1000 + 10 * FRAME);
    cache("a", 1000);
    resolve(textures, "playback", media({ trackId: "v1", mediaId: "a", timeUs: 10 * FRAME }));
    expect(textures.stats).toMatchObject({ exact: 1 });
    // Frame 11 is not decoded yet: the nearest cached frame (0) is not shown, frame 10 stays.
    const held = resolve(textures, "playback", media({ trackId: "v1", mediaId: "a", timeUs: 11 * FRAME }));
    expect(textureOf(held[0])).toBe(shown);
    expect(textures.stats).toMatchObject({ exact: 0, standIns: 0, held: 1 });
    expect(requests).toHaveLength(0);
    expect(frames.getFrame).not.toHaveBeenCalled();
    const next = cache("a", 1000 + 11 * FRAME);
    expect(textureOf(resolve(textures, "playback", media({ trackId: "v1", mediaId: "a", timeUs: 11 * FRAME }))[0])).toBe(next);
  });

  it("cancels a paused-time request for another frame once playing", () => {
    const { textures, requests } = setup();
    resolve(textures, "idle", media({ trackId: "v1", mediaId: "a", timeUs: 10 * FRAME }));
    expect(requests).toHaveLength(1);
    resolve(textures, "playback", media({ trackId: "v1", mediaId: "a", timeUs: 12 * FRAME }));
    expect(requests[0]?.options.signal?.aborted).toBe(true);
    expect(requests).toHaveLength(1);
  });

  it("releases a track that shows nothing at the frame (pin and request)", () => {
    const { textures, cache, pool, requests } = setup();
    cache("a", 1000);
    resolve(textures, "idle", media({ trackId: "v1", mediaId: "a", timeUs: 0 }), media({ trackId: "v2", mediaId: "b", timeUs: 0 }));
    expect(pool.isPinned({ mediaId: "a", lod: "full", timeUs: 1000 })).toBe(true);
    expect(resolve(textures, "idle")).toEqual([]);
    expect(pool.isPinned({ mediaId: "a", lod: "full", timeUs: 1000 })).toBe(false);
    expect(requests[0]?.options.signal?.aborted).toBe(true);
  });

  it("opens an unknown video first, then requests its frame", async () => {
    const { textures, opens, open, onChange, live, flush } = setup();
    const layers = resolve(textures, "idle", media({ trackId: "v1", mediaId: "new", timeUs: 0 }));
    expect(layers).toEqual([]);
    expect(textures.stats.missing).toBe(1);
    resolve(textures, "idle", media({ trackId: "v1", mediaId: "new", timeUs: 0 }));
    expect(opens).toEqual(["new"]);
    open();
    await flush();
    expect(onChange).toHaveBeenCalled();
    resolve(textures, "idle", media({ trackId: "v1", mediaId: "new", timeUs: 0 }));
    expect(live()[0]).toMatchObject({ mediaId: "new", timeUs: 1000 });
  });

  it("asks again after a decode worker crash instead of failing the media (Batch 47)", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { textures, requests, onChange, flush } = setup();
    const layer = media({ trackId: "v1", mediaId: "a", timeUs: 0 });
    resolve(textures, "idle", layer);
    requests[0]?.reject(Object.assign(new Error("The decode worker stopped responding"), { name: "WorkerCrashError" }));
    await flush();
    expect(textures.stats.failed).toBe(0);
    expect(onChange).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(CRASH_RETRY_MS);
    expect(onChange).toHaveBeenCalledTimes(1);
    // Not settled: the next pass asks for the same frame again.
    resolve(textures, "idle", layer);
    expect(requests).toHaveLength(2);
    expect(requests[1]).toMatchObject({ mediaId: "a", timeUs: 1000 });
    vi.useRealTimers();
  });

  it("leaves out media this browser cannot decode", () => {
    const { textures, infos, frames } = setup();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    infos.set("hevc", info({ decodable: false, codec: "hvc1" }));
    expect(resolve(textures, "scrub", media({ trackId: "v1", mediaId: "hevc", timeUs: 0 }))).toEqual([]);
    expect(frames.getFrame).not.toHaveBeenCalled();
    expect(textures.stats.failed).toBe(1);
  });

  it("loads images once and draws them when uploaded; solids pass through", () => {
    const { textures, images, pool } = setup();
    const solid: SolidLayer = { kind: "solid", transform: [1, 0, 0, 1, 0, 0] as Mat3, opacity: 1, color: { r: 1, g: 0, b: 0, a: 1 } };
    const still = media({ trackId: "v2", mediaId: "img", still: true });
    expect(resolve(textures, "idle", solid, still)).toEqual([solid]);
    resolve(textures, "idle", solid, still);
    expect(images.load).toHaveBeenCalledTimes(1);
    const tex = texture();
    pool.put(imageKey("img"), tex);
    const layers = resolve(textures, "idle", solid, still);
    expect(layers[0]).toBe(solid);
    expect(textureOf(layers[1])).toBe(tex);
    expect(pool.isPinned(imageKey("img"))).toBe(true);
  });

  it("draws an animated image's frame at the layer's time, holding the last one while a frame loads (Batch 34)", () => {
    const { textures, images, pool } = setup();
    const starts = [0, 100_000, 200_000];
    images.frameKey = (mediaId: string, timeUs: number): TextureKey => ({ mediaId, lod: "full", timeUs: starts.filter((s) => s <= timeUs).at(-1) ?? 0 });
    const frame0 = texture();
    const frame2 = texture();
    pool.put({ mediaId: "gif", lod: "full", timeUs: 0 }, frame0);
    pool.put({ mediaId: "gif", lod: "full", timeUs: 200_000 }, frame2);
    const at = (timeUs: number) => textureOf(resolve(textures, "playback", media({ trackId: "v1", mediaId: "gif", still: true, timeUs }))[0]);
    expect(at(50_000)).toBe(frame0);
    expect(at(250_000)).toBe(frame2);
    expect(pool.isPinned({ mediaId: "gif", lod: "full", timeUs: 200_000 })).toBe(true);
    // Frame 1 is not uploaded: the track holds frame 2 and the animation loads.
    expect(at(150_000)).toBe(frame2);
    expect(images.load).toHaveBeenCalledWith("gif");
  });

  it("rasterizes an SVG again at rest when it is drawn bigger than its raster, or much smaller (spec §7.1)", async () => {
    const { textures, images, pool, flush, onChange } = setup();
    images.vectorSize = (mediaId: string) => (mediaId === "svg" ? { width: 100, height: 50 } : null);
    const sharp = texture(4096, 2048);
    images.refine.mockImplementation(async () => sharp);
    pool.put(imageKey("svg"), texture(1920, 960));
    // Drawn 1000 x 500 project px.
    const layer = media({ trackId: "v1", mediaId: "svg", still: true, transform: [1000, 0, 0, 500, 0, 0] });
    const pass = (priority: FramePriority, scale: number) => textures.resolve(composite(layer), priority, 0, scale);
    pass("idle", 1);
    pass("playback", 4);
    expect(images.refine).not.toHaveBeenCalled();
    pass("idle", 4);
    // 4000 px wanted: the next half-octave step, 4096 at most.
    expect(images.refine).toHaveBeenCalledWith("svg", 4096);
    pass("idle", 4);
    expect(images.refine).toHaveBeenCalledTimes(1);
    await flush();
    expect(onChange).toHaveBeenCalled();
    // Drawn at 0.25: 250 px wanted (256), the 4096 px raster is far too big.
    pool.put(imageKey("svg"), sharp);
    pass("idle", 1.5);
    expect(images.refine).toHaveBeenCalledTimes(1);
    pass("idle", 0.25);
    expect(images.refine).toHaveBeenLastCalledWith("svg", 256);
  });

  it("warms the cut neighbours that are not cached, once, leaving the media being drawn alone", async () => {
    const { textures, prefetches, cache, images, flush } = setup();
    cache("b", 1000);
    resolve(textures, "scrub", media({ trackId: "v1", mediaId: "a", timeUs: 0 }));
    const neighbors = [
      { mediaId: "a", still: false, timeUs: 10 * FRAME },
      { mediaId: "b", still: false, timeUs: 0 },
      { mediaId: "b", still: false, timeUs: 30 * FRAME },
      { mediaId: "img", still: true, timeUs: 0 },
    ];
    textures.warm(neighbors);
    textures.warm(neighbors);
    expect(prefetches).toEqual([{ mediaId: "b", fromUs: 1000 + 30 * FRAME, toUs: 1000 + 30 * FRAME }]);
    expect(images.load).toHaveBeenCalledWith("img");
    await flush();
    expect(textures.stats.warming).toBe(0);
  });
});

describe("LayerTextures: split panes (spec §6.10)", () => {
  it("resolves two composites in one pass, one scrub request per media, each pane with its own slots", async () => {
    const t = setup();
    const left = composite(media({ trackId: "v1", mediaId: "a", timeUs: 1000 + 10 * FRAME }));
    const right = composite(media({ trackId: "v1", mediaId: "a", timeUs: 1000 + 11 * FRAME }));
    const [l, r] = t.textures.resolveSplit(left, right, "scrub");
    // Same media in both panes: only the first request is a scrub, so they never supersede each other.
    expect(t.requests.map((request) => [request.timeUs, request.options.priority])).toEqual([
      [1000 + 10 * FRAME, "scrub"],
      [1000 + 11 * FRAME, "idle"],
    ]);
    const leftTex = t.deliver(t.requests[0] as Request);
    const rightTex = t.deliver(t.requests[1] as Request);
    await t.flush();
    const [l2, r2] = t.textures.resolveSplit(left, right, "scrub");
    expect(l2).toBe(l);
    expect(r2).toBe(r);
    expect(textureOf(l2.layers[0])).toBe(leftTex);
    expect(textureOf(r2.layers[0])).toBe(rightTex);
    expect(t.textures.stats).toMatchObject({ layers: 2, exact: 2 });
    // Back to one pane: the right pane's slot is released (its pin with it), the left one stays.
    expect(textureOf(resolve(t.textures, "idle", media({ trackId: "v1", mediaId: "a", timeUs: 1000 + 10 * FRAME }))[0])).toBe(leftTex);
    expect(t.pool.stats.pinned).toBe(1);
  });
});

describe("LayerTextures: proxies (spec §9.5)", () => {
  /** Media time of frame `n` (frame times start at 1000 us; media time 0 is the first frame). */
  const at = (n: number) => n * FRAME;
  const timeOf = (n: number) => 1000 + n * FRAME;

  it("asks for proxy frames when the pass wants them and the media has a proxy, opening the proxy first", async () => {
    let wanted: Lod = "proxy";
    const t = setup({ wantedLod: () => wanted, proxies: new Set(["a"]) });
    resolve(t.textures, "scrub", media({ trackId: "v1", mediaId: "a", timeUs: at(10) }));
    expect(t.opens).toEqual(["a|proxy"]);
    expect(t.requests).toHaveLength(0);
    t.open();
    await t.flush();
    resolve(t.textures, "scrub", media({ trackId: "v1", mediaId: "a", timeUs: at(10) }));
    expect(t.live()[0]?.options).toMatchObject({ lod: "proxy", priority: "scrub" });
    const tex = t.deliver(t.live()[0] as Request);
    await t.flush();
    expect(textureOf(resolve(t.textures, "scrub", media({ trackId: "v1", mediaId: "a", timeUs: at(10) }))[0])).toBe(tex);
    expect(t.textures.stats).toMatchObject({ exact: 1, proxy: 1 });
    // A media without a proxy stays on its full frames.
    wanted = "proxy";
    resolve(t.textures, "scrub", media({ trackId: "v2", mediaId: "b", timeUs: at(3) }));
    expect(t.live().at(-1)).toMatchObject({ mediaId: "b" });
    expect(t.live().at(-1)?.options.lod).toBe("full");
  });

  it("shows the proxy frame of the same time while the full one decodes, then the full one", async () => {
    const t = setup({ wantedLod: () => "full", proxies: new Set(["a"]) });
    t.infos.set("a|proxy", info());
    const proxyTex = t.cache("a", timeOf(10), "proxy");
    // A full frame at another time is no match for the right picture.
    t.cache("a", timeOf(9));
    const layers = resolve(t.textures, "idle", media({ trackId: "v1", mediaId: "a", timeUs: at(10) }));
    expect(textureOf(layers[0])).toBe(proxyTex);
    expect(t.textures.stats).toMatchObject({ standIns: 1, exact: 0, proxy: 1 });
    expect(t.live()).toHaveLength(1);
    expect(t.live()[0]?.options).toMatchObject({ priority: "idle" });
    expect(t.live()[0]?.options.lod).toBe("full");
    const full = t.deliver(t.live()[0] as Request);
    await t.flush();
    expect(textureOf(resolve(t.textures, "idle", media({ trackId: "v1", mediaId: "a", timeUs: at(10) }))[0])).toBe(full);
    expect(t.textures.stats).toMatchObject({ exact: 1, proxy: 0 });
  });

  it("draws a cached full frame as big as the proxy where the proxy is wanted, with nothing to decode", () => {
    const t = setup({ wantedLod: () => "proxy", proxies: new Set(["a"]) });
    t.infos.set("a|proxy", info({ codedWidth: 960, codedHeight: 540 }));
    const full = texture(1920, 1080);
    t.pool.put({ mediaId: "a", lod: "full", timeUs: timeOf(4) }, full);
    expect(textureOf(resolve(t.textures, "scrub", media({ trackId: "v1", mediaId: "a", timeUs: at(4) }))[0])).toBe(full);
    expect(t.requests).toHaveLength(0);
    expect(t.textures.stats).toMatchObject({ exact: 1, proxy: 0 });
  });

  it("asks for the proxy when the cached full frame is smaller (a 1/4 playback's), showing that one meanwhile", () => {
    const t = setup({ wantedLod: () => "proxy", proxies: new Set(["a"]) });
    t.infos.set("a|proxy", info({ codedWidth: 960, codedHeight: 540 }));
    const small = texture(240, 135);
    t.pool.put({ mediaId: "a", lod: "full", timeUs: timeOf(4) }, small);
    expect(textureOf(resolve(t.textures, "scrub", media({ trackId: "v1", mediaId: "a", timeUs: at(4) }))[0])).toBe(small);
    expect(t.live()[0]?.options.lod).toBe("proxy");
    expect(t.textures.stats).toMatchObject({ exact: 0, standIns: 1 });
  });

  it("never refreshes proxy frames for detail", () => {
    const t = setup({ wantedLod: () => "proxy", proxies: new Set(["a"]) });
    t.infos.set("a|proxy", info());
    const small = texture(960, 540);
    t.pool.put({ mediaId: "a", lod: "proxy", timeUs: timeOf(2) }, small);
    expect(textureOf(t.textures.resolve(composite(media({ trackId: "v1", mediaId: "a", timeUs: at(2) })), "idle", 3840).layers[0])).toBe(small);
    expect(t.requests).toHaveLength(0);
  });

  it("warms the neighbours on the lod the pass uses", () => {
    const t = setup({ wantedLod: () => "proxy", proxies: new Set(["b"]) });
    t.infos.set("b|proxy", info());
    t.textures.warm([{ mediaId: "b", timeUs: at(5), still: false }]);
    expect(t.prefetches).toEqual([{ mediaId: "b", fromUs: timeOf(5), toUs: timeOf(5), lod: "proxy" }]);
  });

  it("resolves exact full frames at the export size whatever is cached, and lets go of them", async () => {
    const t = setup({ wantedLod: () => "proxy", proxies: new Set(["a"]) });
    t.cache("a", timeOf(7), "proxy");
    const solid: SolidLayer = { kind: "solid", color: { r: 1, g: 0, b: 0, a: 1 }, transform: [10, 0, 0, 10, 0, 0], opacity: 1 };
    // At scale 1 (one source px per project px).
    const exporting = t.textures.resolveExact(composite(solid, media({ trackId: "v1", mediaId: "a", timeUs: at(7), transform: [1920, 0, 0, 1080, 0, 0] })), 4096);
    await t.flush();
    expect(t.requests).toHaveLength(1);
    // At the video's own size (1920 x 1080 coded).
    expect(t.requests[0]?.options).toMatchObject({ lod: "full", priority: "playback", minLongEdge: Math.floor(1920 * 0.9), uploadAtLeast: 1920 });
    const full = t.deliver(t.requests[0] as Request);
    const { list, release } = await exporting;
    expect(list.layers.map((layer) => layer.kind)).toEqual(["solid", "texture"]);
    expect(textureOf(list.layers[1])).toBe(full);
    expect(t.pool.isPinned({ mediaId: "a", lod: "full", timeUs: timeOf(7) })).toBe(true);
    release();
    expect(t.pool.isPinned({ mediaId: "a", lod: "full", timeUs: timeOf(7) })).toBe(false);
  });
});
