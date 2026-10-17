import { describe, expect, it, vi } from "vitest";
import { makeMedia, makeProject } from "../../core/document/fixtures.js";
import type { Project } from "../../core/document/types.js";
import type { TextureHandle } from "../../render/gpu/renderer.js";
import { imageKey, TexturePool } from "../cache/TexturePool.js";
import { ImageService, type ImageSource } from "./ImageService.js";

function texture(): TextureHandle {
  let destroyed = false;
  return {
    width: 4,
    height: 4,
    mipLevels: 3,
    bytes: 100,
    get valid() {
      return !destroyed;
    },
    destroy() {
      destroyed = true;
    },
  };
}

function bitmap() {
  return { width: 4, height: 4, close: vi.fn() } as unknown as ImageBitmap & { close: ReturnType<typeof vi.fn> };
}

function setup(options: { ready?: boolean } = {}) {
  const doc: Project = makeProject();
  doc.media.png = { ...makeMedia("png", "image", 0), width: 4, height: 4, codec: "png" };
  doc.media.svg = { ...makeMedia("svg", "image", 0), width: 4, height: 4, codec: "svg" };
  doc.media.vid = makeMedia("vid", "video");
  const bitmaps: ReturnType<typeof bitmap>[] = [];
  let release: (() => void) | null = null;
  const workers = {
    request: vi.fn((_method: string, _params: unknown, requestOptions: { signal?: AbortSignal } = {}) => {
      const b = bitmap();
      bitmaps.push(b);
      return new Promise((resolve, reject) => {
        release = () => resolve(b);
        requestOptions.signal?.addEventListener("abort", () => reject(requestOptions.signal?.reason), { once: true });
      });
    }),
  };
  const renderer = { ready: options.ready ?? true, maxTextureSize: 8192, uploadImageBitmap: vi.fn(() => texture()) };
  const pool = new TexturePool();
  const svgBitmap = vi.fn<(file: Blob, size: number) => Promise<ReturnType<typeof bitmap>>>(async () => {
    const b = bitmap();
    bitmaps.push(b);
    return b;
  });
  const service = new ImageService({ workers: workers as never, renderer, pool, document: { getState: () => doc }, svgBitmap });
  const files: string[] = [];
  const source: ImageSource = {
    file: async (mediaId) => {
      files.push(mediaId);
      return mediaId === "gone" ? null : new File(["x"], `${mediaId}.png`);
    },
  };
  const detach = service.attach(source);
  const settle = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };
  return { service, workers, renderer, pool, svgBitmap, bitmaps, files, detach, settle, deliver: () => release?.(), doc };
}

describe("ImageService", () => {
  it("decodes an image once in the worker, uploads it into the pool and closes the bitmap", async () => {
    const { service, workers, renderer, pool, bitmaps, deliver, settle } = setup();
    expect(service.get("png")).toBeNull();
    const first = service.load("png");
    const second = service.load("png");
    await settle();
    expect(workers.request).toHaveBeenCalledTimes(1);
    expect(workers.request.mock.calls[0]?.[1]).toMatchObject({ maxSize: 8192 });
    deliver();
    const [a, b] = await Promise.all([first, second]);
    expect(a).not.toBeNull();
    expect(b).toBe(a);
    expect(renderer.uploadImageBitmap).toHaveBeenCalledTimes(1);
    expect(bitmaps[0]?.close).toHaveBeenCalled();
    expect(pool.get(imageKey("png"))).toBe(a);
    expect(service.get("png")).toBe(a);
    // Loaded: answered from the pool.
    expect(await service.load("png")).toBe(a);
    expect(workers.request).toHaveBeenCalledTimes(1);
  });

  it("rasterizes SVG on the main thread at the frame's long side", async () => {
    const { service, svgBitmap, workers } = setup();
    expect(await service.load("svg")).not.toBeNull();
    expect(svgBitmap).toHaveBeenCalledWith(expect.any(File), 1920);
    expect(workers.request).not.toHaveBeenCalled();
  });

  it("gives null for media that is not an image, and fails for a missing file", async () => {
    const { service, doc } = setup();
    expect(await service.load("vid")).toBeNull();
    doc.media.gone = { ...makeMedia("gone", "image", 0), width: 4, height: 4 };
    await expect(service.load("gone")).rejects.toThrow(/missing/);
  });

  it("skips the upload (and closes the bitmap) while the GPU device is not ready", async () => {
    const { service, renderer, bitmaps, deliver, settle } = setup({ ready: false });
    const load = service.load("png");
    await settle();
    deliver();
    expect(await load).toBeNull();
    expect(renderer.uploadImageBitmap).not.toHaveBeenCalled();
    expect(bitmaps[0]?.close).toHaveBeenCalled();
  });

  it("rasterizes an SVG again at the size it is drawn at, bigger or smaller, replacing the raster", async () => {
    const { service, svgBitmap, pool, renderer } = setup();
    const sizes: number[] = [];
    svgBitmap.mockImplementation(async (_file: Blob, size: number) => {
      sizes.push(size);
      return { width: size, height: size, close: vi.fn() } as unknown as ReturnType<typeof bitmap>;
    });
    renderer.uploadImageBitmap.mockImplementation(((b: { width: number; height: number }) => Object.assign(texture(), { width: b.width, height: b.height })) as never);
    expect(service.vectorSize("svg")).toEqual({ width: 4, height: 4 });
    expect(service.vectorSize("png")).toBeNull();
    const first = await service.load("svg");
    expect(first?.width).toBe(1920);
    // A refine to the size that is there is answered at once.
    expect(await service.refine("svg", 1920)).toBe(first);
    const sharp = await service.refine("svg", 3000);
    expect(sharp?.width).toBe(3000);
    expect(first?.valid).toBe(false);
    expect(pool.get(imageKey("svg"))).toBe(sharp);
    // Capped at 4096 px; drawn smaller, smaller again.
    expect((await service.refine("svg", 9000))?.width).toBe(4096);
    expect((await service.refine("svg", 512))?.width).toBe(512);
    expect(sizes).toEqual([1920, 3000, 4096, 512]);
    // A load (nothing to load: the pool holds a raster) keeps the refined one.
    expect((await service.load("svg"))?.width).toBe(512);
    expect(await service.refine("png", 3000)).toBeNull();
  });

  it("cancels running loads when the project detaches", async () => {
    const { service, detach, settle, renderer } = setup();
    const load = service.load("png");
    await settle();
    detach();
    await expect(load).rejects.toMatchObject({ name: "AbortError" });
    expect(renderer.uploadImageBitmap).not.toHaveBeenCalled();
  });
});

describe("ImageService animated images (Batch 34)", () => {
  const FRAMES = [0, 100_000, 250_000];

  function animated() {
    const doc: Project = makeProject();
    doc.media.gif = { ...makeMedia("gif", "image", 400_000), width: 8, height: 8, codec: "gif" };
    const calls: { only: number[] | null; type: string }[] = [];
    const workers = {
      request: vi.fn(async (_method: string, params: { only: number[] | null; type: string }, options: { onProgress?: (value: unknown) => void; signal?: AbortSignal } = {}) => {
        calls.push({ only: params.only, type: params.type });
        options.onProgress?.({ kind: "frames", startsUs: FRAMES, durationUs: 400_000, width: 8, height: 8 });
        FRAMES.forEach((_, index) => {
          if (!params.only || params.only.includes(index)) options.onProgress?.({ kind: "frame", index, bitmap: bitmap() });
        });
        return { frames: FRAMES.length };
      }),
    };
    const renderer = { ready: true, maxTextureSize: 8192, uploadImageBitmap: vi.fn(() => texture()) };
    const pool = new TexturePool();
    const onChange = vi.fn();
    const service = new ImageService({ workers: workers as never, renderer, pool, document: { getState: () => doc }, svgBitmap: vi.fn(), onChange });
    service.attach({ file: async () => new File(["x"], "a.gif") });
    return { service, workers, renderer, pool, calls, onChange, doc };
  }

  it("uploads each kept frame as a texture keyed by its start time and finds the frame of a time, looped", async () => {
    const { service, renderer, pool, calls, onChange } = animated();
    expect(service.frameKey("gif", 0)).toBeNull();
    const first = await service.load("gif");
    expect(calls).toEqual([{ only: null, type: "image/gif" }]);
    expect(renderer.uploadImageBitmap).toHaveBeenCalledTimes(3);
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(first).toBe(pool.get({ mediaId: "gif", lod: "full", timeUs: 0 }));
    const timeOf = (t: number) => service.frameKey("gif", t)?.timeUs;
    expect([0, 99_999, 100_000, 260_000, 399_999, 400_000, 520_000].map(timeOf)).toEqual([0, 0, 100_000, 250_000, 250_000, 0, 100_000]);
    expect(service.get("gif")).toBe(first);
    // Loaded: answered from the pool.
    expect(await service.load("gif")).toBe(first);
    expect(calls).toHaveLength(1);
  });

  it("decodes again only the frames the pool let go of, and drops everything on release", async () => {
    const { service, pool, calls } = animated();
    await service.load("gif");
    pool.delete({ mediaId: "gif", lod: "full", timeUs: 250_000 });
    await service.load("gif");
    expect(calls[1]).toEqual({ only: [2], type: "image/gif" });
    expect(pool.has({ mediaId: "gif", lod: "full", timeUs: 250_000 })).toBe(true);
    service.release("gif");
    expect(pool.has({ mediaId: "gif", lod: "full", timeUs: 0 })).toBe(false);
    expect(service.frameKey("gif", 0)).toBeNull();
  });
});
