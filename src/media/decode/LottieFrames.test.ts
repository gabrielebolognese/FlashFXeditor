import { describe, expect, it, vi } from "vitest";
import { makeMedia, makeProject } from "../../core/document/fixtures.js";
import type { TextureHandle } from "../../render/gpu/renderer.js";
import { TexturePool } from "../cache/TexturePool.js";
import { lottieVariantId } from "../lottie/lottieFile.js";
import { LOTTIE_AHEAD, LottieFrames } from "./LottieFrames.js";

const texture = (): TextureHandle => {
  let destroyed = false;
  return {
    width: 4,
    height: 4,
    mipLevels: 1,
    bytes: 64,
    get valid() {
      return !destroyed;
    },
    destroy() {
      destroyed = true;
    },
  };
};

interface Request {
  method: string;
  params: { timesUs?: number[]; longEdge?: number; variant?: string };
}

function setup() {
  const doc = makeProject();
  doc.media.l1 = { ...makeMedia("l1", "lottie", 2_000_000), width: 200, height: 100, hasAudio: false };
  doc.media.v1 = makeMedia("v1", "video");
  const requests: Request[] = [];
  const bitmaps: { close: ReturnType<typeof vi.fn> }[] = [];
  const workers = {
    request: vi.fn(async (method: string, params: never, options: { onProgress?: (v: { timeUs: number; bitmap: ImageBitmap }) => void } = {}) => {
      requests.push({ method, params });
      for (const timeUs of (params as { timesUs?: number[] }).timesUs ?? []) {
        const bitmap = { width: 4, height: 4, close: vi.fn() };
        bitmaps.push(bitmap);
        options.onProgress?.({ timeUs, bitmap: bitmap as unknown as ImageBitmap });
      }
      return undefined;
    }),
  };
  const renderer = { ready: true, maxTextureSize: 8192, uploadImageBitmap: vi.fn(() => texture()) };
  const pool = new TexturePool();
  const onChange = vi.fn();
  const frames = new LottieFrames({ workers: workers as never, renderer, pool, document: { getState: () => doc }, file: async (id) => (id === "l1" ? new File(["x"], "a.json") : null), onChange });
  frames.attach();
  return { frames, requests, bitmaps, renderer, pool, onChange, workers };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("LottieFrames (spec §21.23, Batch 79)", () => {
  it("knows its media and their size, and ignores other kinds", () => {
    const { frames } = setup();
    expect(frames.is("l1")).toBe(true);
    expect(frames.is(lottieVariantId("l1", [{ from: { r: 1, g: 0, b: 0, a: 1 }, to: { r: 0, g: 0, b: 1, a: 1 } }]))).toBe(true);
    expect(frames.is("v1")).toBe(false);
    expect(frames.is("nope")).toBe(false);
    expect(frames.size("l1")).toEqual({ width: 200, height: 100 });
    expect(frames.size("v1")).toBeNull();
    expect(frames.edgeOf("l1")).toBe(200);
  });

  it("renders the asked frame at the set edge, uploads it and closes the bitmap at once", async () => {
    const { frames, requests, bitmaps, renderer, onChange } = setup();
    frames.setEdge("l1", 400);
    frames.key("l1", 500_000);
    expect(frames.get("l1")).toBeNull();
    const loaded = await frames.load("l1");
    expect(loaded).not.toBeNull();
    expect(requests).toEqual([{ method: "renderLottie", params: expect.objectContaining({ timesUs: [500_000], longEdge: 400, variant: "l1" }) }]);
    expect(renderer.uploadImageBitmap).toHaveBeenCalledTimes(1);
    expect(bitmaps.every((b) => b.close.mock.calls.length === 1)).toBe(true);
    expect(onChange).toHaveBeenCalled();
    expect(frames.get("l1")).toBe(loaded);
  });

  it("a new edge is a new set of frames; the old ones stay until evicted", async () => {
    const { frames, requests } = setup();
    frames.setEdge("l1", 200);
    frames.key("l1", 0);
    const small = await frames.load("l1");
    frames.setEdge("l1", 800);
    frames.key("l1", 0);
    expect(frames.get("l1")).toBeNull();
    const big = await frames.load("l1");
    expect(big).not.toBe(small);
    expect(requests).toHaveLength(2);
    frames.setEdge("l1", 200);
    frames.key("l1", 0);
    expect(frames.get("l1")).toBe(small);
  });

  it("while the time steps it asks for the next frames in one request", async () => {
    const { frames, requests } = setup();
    const step = 16_667;
    frames.key("l1", 0);
    frames.key("l1", step);
    await flush();
    const ahead = requests.filter((r) => r.method === "renderLottie");
    expect(ahead).toHaveLength(1);
    expect(ahead[0]?.params.timesUs).toEqual(Array.from({ length: LOTTIE_AHEAD }, (_, k) => step + step * (k + 1)));
  });

  it("a jump asks for nothing ahead, and a loop wraps the frames ahead", async () => {
    const { frames, requests } = setup();
    frames.key("l1", 0);
    frames.key("l1", 1_000_000);
    await flush();
    expect(requests).toHaveLength(0);
    frames.key("l1", 1_990_000);
    frames.key("l1", 1_999_000);
    await flush();
    expect(requests[0]?.params.timesUs?.[0]).toBe(8_000);
  });

  it("two clips of one variant keep their own playheads and both prefetch", async () => {
    const { frames, requests } = setup();
    const step = 16_667;
    // Interleaved per frame, as the preview draws them: clip a plays at 0.., clip b one second later.
    for (let i = 0; i < 3; i++) {
      frames.key("l1", i * step, "a");
      frames.key("l1", 1_000_000 + i * step, "b");
    }
    await flush();
    const asked = requests.filter((r) => r.method === "renderLottie").flatMap((r) => r.params.timesUs ?? []);
    expect(asked.some((t) => t > 2 * step && t < 1_000_000)).toBe(true);
    expect(asked.some((t) => t > 1_000_000 + 2 * step)).toBe(true);
  });

  it("load renders the frame of every clip of the variant", async () => {
    const { frames, requests } = setup();
    frames.key("l1", 0, "a");
    frames.key("l1", 1_000_000, "b");
    await frames.load("l1");
    expect(requests[0]?.params.timesUs).toEqual([1_000_000, 0]);
  });

  it("serves exact export frames and waits for them", async () => {
    const { frames, requests } = setup();
    const first = await frames.frame("l1", 123_456, 300);
    expect(first?.texture).toBeDefined();
    expect(requests[0]?.params).toMatchObject({ timesUs: [123_456], longEdge: 300 });
    await frames.frame("l1", 123_456, 300);
    expect(requests).toHaveLength(1);
  });

  it("does nothing after detach, and release removes the textures and closes the worker's animation", async () => {
    const { frames, pool, workers } = setup();
    await frames.frame("l1", 0, 200);
    expect(pool.has({ mediaId: "l1@200", lod: "full", timeUs: 0 })).toBe(true);
    frames.release("l1");
    expect(pool.has({ mediaId: "l1@200", lod: "full", timeUs: 0 })).toBe(false);
    expect(workers.request).toHaveBeenLastCalledWith("closeLottie", { mediaId: "l1" }, expect.anything());
    frames.detach();
    expect(await frames.load("l1")).toBeNull();
  });
});
