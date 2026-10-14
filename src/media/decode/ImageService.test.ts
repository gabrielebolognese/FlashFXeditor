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
  const svgBitmap = vi.fn(async () => {
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

  it("cancels running loads when the project detaches", async () => {
    const { service, detach, settle, renderer } = setup();
    const load = service.load("png");
    await settle();
    detach();
    await expect(load).rejects.toMatchObject({ name: "AbortError" });
    expect(renderer.uploadImageBitmap).not.toHaveBeenCalled();
  });
});
