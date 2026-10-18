import { afterEach, describe, expect, it, vi } from "vitest";
import { loopbackWorker } from "./loopback.js";
import type { WorkerKind } from "./protocol.js";
import { WorkerPool, type WorkerLike } from "./WorkerPool.js";

const noWorker = (kind: WorkerKind) => (): WorkerLike => {
  throw new Error(`no ${kind} worker`);
};

function pool(handlers: Parameters<typeof loopbackWorker>[0]) {
  return new WorkerPool({ decode: () => loopbackWorker(handlers, 1), analysis: noWorker("analysis"), proxy: noWorker("proxy"), transcribe: noWorker("transcribe"), export: noWorker("export") });
}

describe("loopbackWorker", () => {
  it("serves requests in-thread, asynchronously, with their progress values", async () => {
    const order: string[] = [];
    const workers = pool({
      decodeStats: async () => {
        order.push("handled");
        return { sessions: 1, liveDecoders: 0, openFrames: 0, queued: 0, seeks: 0, decoded: 0, dropped: 0, ringHits: 0, stalls: 0, indexParsed: 0, indexFromCache: 0, idleCloses: 0 };
      },
      prefetch: async (_params, _signal, emit) => {
        emit({ frame: { close: () => undefined } as unknown as VideoFrame, timeUs: 5, approximate: false });
        return { frames: 1 };
      },
    });
    const stats = workers.request("decodeStats", {});
    order.push("requested");
    expect((await stats).sessions).toBe(1);
    expect(order).toEqual(["requested", "handled"]);
    const seen: number[] = [];
    const result = await workers.request("prefetch", { mediaId: "m", lod: "full", fromUs: 0, toUs: 10 }, { onProgress: (value) => seen.push(value.timeUs) });
    expect(result).toEqual({ frames: 1 });
    expect(seen).toEqual([5]);
  });

  it("cancels a running request (its signal aborts) and rejects it with an AbortError", async () => {
    let aborted = false;
    const workers = pool({
      decodeImage: (_params, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            aborted = true;
            reject(signal.reason);
          });
        }),
    });
    const controller = new AbortController();
    const request = workers.request("decodeImage", { blob: new Blob(), maxSize: 1 }, { signal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(aborted).toBe(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("delivers nothing after terminate and closes the frames of results nobody receives", async () => {
    let close = 0;
    // jsdom has no VideoFrame: a stand-in class, so the protocol recognizes the frame as transferable.
    class FakeVideoFrame {
      close(): void {
        close += 1;
      }
    }
    vi.stubGlobal("VideoFrame", FakeVideoFrame);
    const frame = new FakeVideoFrame() as unknown as VideoFrame;
    let release = () => undefined as void;
    const decoded = new Promise<void>((resolve) => (release = resolve));
    const worker = loopbackWorker(
      {
        requestFrame: async () => {
          await decoded;
          return { frame, timeUs: 0, approximate: false };
        },
      },
      1,
    );
    const received: unknown[] = [];
    worker.addEventListener("message", (event) => received.push(event.data));
    worker.postMessage({ type: "request", id: 1, method: "requestFrame", priority: "user", params: { mediaId: "m", lod: "full", timeUs: 0, priority: "scrub" } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    worker.terminate();
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(received).toEqual([]);
    expect(close).toBe(1);
  });
});
