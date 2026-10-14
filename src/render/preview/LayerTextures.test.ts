import { describe, expect, it, vi } from "vitest";
import { imageKey, TexturePool, type TextureKey } from "../../media/cache/TexturePool.js";
import type { FrameRequestOptions, FrameResult } from "../../media/decode/FrameService.js";
import type { FramePriority, VideoInfo } from "../../media/workers/protocol.js";
import type { Composite, MediaLayer, SolidLayer, TextureLayer } from "../compositor/drawList.js";
import type { TextureHandle } from "../gpu/renderer.js";
import type { Mat3 } from "../mat3.js";
import { LayerTextures } from "./LayerTextures.js";

const FRAME = 33_333;
/** Frame times starting at a composition offset of 1000 us. */
const times = (count: number) => Float64Array.from({ length: count }, (_, i) => 1000 + i * FRAME);

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

function setup() {
  const pool = new TexturePool();
  const infos = new Map<string, VideoInfo>([
    ["a", info()],
    ["b", info()],
  ]);
  const requests: Request[] = [];
  const prefetches: { mediaId: string; fromUs: number; toUs: number }[] = [];
  const opens: string[] = [];
  let openResolve: (() => void) | null = null;
  const frames = {
    info: (mediaId: string) => infos.get(mediaId) ?? null,
    video: vi.fn((mediaId: string) => {
      opens.push(mediaId);
      return new Promise<VideoInfo>((resolve) => {
        openResolve = () => {
          const value = info();
          infos.set(mediaId, value);
          resolve(value);
        };
      });
    }),
    getFrame: vi.fn((mediaId: string, timeUs: number, options: FrameRequestOptions = {}) => {
      // Like FrameService: the nearest cached frame as a stand-in, synchronously.
      const near = pool.nearest(mediaId, "full", timeUs);
      if (near && options.onApproximate) options.onApproximate({ texture: near.texture, key: near.key, timeUs: near.key.timeUs, approximate: true });
      return new Promise<FrameResult>((resolve, reject) => {
        requests.push({ mediaId, timeUs, options, resolve, reject });
        options.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
      });
    }),
    prefetch: vi.fn(async (mediaId: string, fromUs: number, toUs: number) => {
      prefetches.push({ mediaId, fromUs, toUs });
      return 1;
    }),
  };
  const images = { get: (mediaId: string) => pool.get(imageKey(mediaId)), load: vi.fn(() => new Promise<TextureHandle | null>(() => undefined)) };
  const onChange = vi.fn();
  const textures = new LayerTextures({ frames, images, pool, onChange });
  /** Uploads a frame into the pool, as the frame service does on delivery. */
  const cache = (mediaId: string, timeUs: number) => {
    const tex = texture();
    pool.put({ mediaId, lod: "full", timeUs }, tex);
    return tex;
  };
  const deliver = (request: Request, timeUs = request.timeUs, approximate = false) => {
    const tex = cache(request.mediaId, timeUs);
    const key: TextureKey = { mediaId: request.mediaId, lod: "full", timeUs };
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
