import { describe, expect, it, vi } from "vitest";
import type { ProbeResult } from "../probe/types.js";
import type { DeliveredFrame, FromWorker, Method, ToWorker } from "./protocol.js";
import { WorkerHost, type Handlers, type HostScope } from "./WorkerHost.js";
import { WATCHDOG_TICK_MS, WorkerPool, type WorkerLike, type WorkerPoolOptions } from "./WorkerPool.js";

const AUDIO: ProbeResult = { kind: "audio", durationUs: 1_000_000, hasAudio: true };
const file = new Blob(["x"]);

interface FakeWorker extends WorkerLike {
  host: WorkerHost;
  terminated: boolean;
  /** Ended from inside (`self.close`): nothing goes in or out any more, and no event fires. */
  closed: boolean;
  /** Messages the pool posted to it. */
  received: ToWorker[];
  crash(message: string, where?: { filename: string; lineno: number; colno: number }): void;
}

const noWorker = (): WorkerLike => {
  throw new Error("only the decode worker in these tests");
};

/** A pool whose workers are in-process hosts; messages are delivered asynchronously, like postMessage. */
function setup(handlers: Handlers, concurrency = 2, immediate: ReadonlySet<Method> = new Set(), options: WorkerPoolOptions = {}) {
  const workers: FakeWorker[] = [];
  const pool = new WorkerPool(
    {
      decode: () => {
        const toMain: { message: ((event: MessageEvent<FromWorker>) => void)[]; error: ((event: Event) => void)[]; messageerror: ((event: Event) => void)[] } = { message: [], error: [], messageerror: [] };
        let toHost: ((event: MessageEvent<ToWorker>) => void) | null = null;
        const scope: HostScope = {
          postMessage: (message) =>
            queueMicrotask(() => {
              if (!worker.closed) toMain.message.forEach((l) => l({ data: message } as MessageEvent<FromWorker>));
            }),
          addEventListener: (_type, listener) => {
            toHost = listener;
          },
          close: () => {
            worker.closed = true;
          },
        };
        const worker: FakeWorker = {
          host: new WorkerHost(scope, handlers, concurrency, immediate),
          terminated: false,
          closed: false,
          received: [],
          postMessage: (message) => {
            worker.received.push(message);
            queueMicrotask(() => {
              if (!worker.closed) toHost?.({ data: message } as MessageEvent<ToWorker>);
            });
          },
          addEventListener: ((type: "message" | "error" | "messageerror", listener: never) => toMain[type].push(listener)) as WorkerLike["addEventListener"],
          terminate: () => {
            worker.terminated = true;
          },
          crash: (message, where) => toMain.error.forEach((l) => l({ message, ...where, preventDefault() {} } as unknown as ErrorEvent)),
        };
        workers.push(worker);
        return worker;
      },
      analysis: noWorker,
      proxy: noWorker,
      transcribe: noWorker,
      export: noWorker,
    },
    options,
  );
  return { pool, workers };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("WorkerPool + WorkerHost", () => {
  it("creates the worker lazily and resolves typed results", async () => {
    const probe = vi.fn(async () => AUDIO);
    const { pool, workers } = setup({ probe });
    expect(workers).toHaveLength(0);
    await expect(pool.request("probe", { file, container: "mp4", type: "audio/mp4" })).resolves.toEqual(AUDIO);
    expect(workers).toHaveLength(1);
    expect(probe).toHaveBeenCalledWith({ file, container: "mp4", type: "audio/mp4" }, expect.any(AbortSignal), expect.any(Function));
    expect(pool.inFlight).toBe(0);
  });

  it("counts the requests in flight per worker kind", async () => {
    const gate = deferred<typeof AUDIO>();
    const { pool } = setup({ probe: () => gate.promise });
    expect(pool.inFlightByKind()).toEqual({});
    expect(pool.running).toEqual([]);
    const first = pool.request("probe", { file, container: "mp4", type: "audio/mp4" });
    const second = pool.request("probe", { file, container: "mp4", type: "audio/mp4" });
    expect(pool.inFlightByKind()).toEqual({ decode: 2 });
    expect(pool.running).toEqual(["decode"]);
    gate.resolve(AUDIO);
    await Promise.all([first, second]);
    expect(pool.inFlightByKind()).toEqual({});
  });

  it("rejects with the handler's error name and message", async () => {
    const { pool } = setup({
      probe: async () => {
        const error = new Error("The file has no video or audio track");
        error.name = "ProbeError";
        throw error;
      },
    });
    await expect(pool.request("probe", { file, container: "mp4", type: "" })).rejects.toMatchObject({ name: "ProbeError", message: "The file has no video or audio track" });
  });

  it("starts queued requests by priority, then arrival", async () => {
    const order: string[] = [];
    const gate = deferred<void>();
    const { pool } = setup(
      {
        probe: async ({ type }) => {
          order.push(type);
          if (type === "first") await gate.promise;
          return AUDIO;
        },
      },
      1,
    );
    const requests = [
      pool.request("probe", { file, container: "mp4", type: "first" }),
      pool.request("probe", { file, container: "mp4", type: "bg-1" }, { priority: "background" }),
      pool.request("probe", { file, container: "mp4", type: "prefetch" }, { priority: "prefetch" }),
      pool.request("probe", { file, container: "mp4", type: "user" }, { priority: "user" }),
      pool.request("probe", { file, container: "mp4", type: "bg-2" }, { priority: "background" }),
    ];
    await flush();
    gate.resolve();
    await Promise.all(requests);
    expect(order).toEqual(["first", "user", "prefetch", "bg-1", "bg-2"]);
  });

  it("cancels a queued request without running it", async () => {
    const gate = deferred<void>();
    const probe = vi.fn(async ({ type }: { type: string }) => {
      if (type === "busy") await gate.promise;
      return AUDIO;
    });
    const { pool, workers } = setup({ probe }, 1);
    const busy = pool.request("probe", { file, container: "mp4", type: "busy" });
    const controller = new AbortController();
    const queued = pool.request("probe", { file, container: "mp4", type: "queued" }, { signal: controller.signal });
    await flush();
    expect(workers[0]?.host.queued).toBe(1);
    controller.abort();
    await expect(queued).rejects.toMatchObject({ name: "AbortError" });
    await flush();
    expect(workers[0]?.host.queued).toBe(0);
    gate.resolve();
    await busy;
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("aborts a running request: the handler sees the signal, the caller is rejected at once", async () => {
    const gate = deferred<void>();
    let seen: AbortSignal | null = null;
    const { pool } = setup({
      probe: async (_params, signal) => {
        seen = signal;
        await gate.promise;
        return AUDIO;
      },
    });
    const controller = new AbortController();
    const request = pool.request("probe", { file, container: "mp4", type: "" }, { signal: controller.signal });
    await flush();
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    await flush();
    expect((seen as AbortSignal | null)?.aborted).toBe(true);
    gate.resolve();
    await flush();
    expect(pool.inFlight).toBe(0);
  });

  it("closes the bitmaps of a result that arrives after its request was aborted", async () => {
    // jsdom has no ImageBitmap; a stand-in class makes `transferablesOf` pick the bitmap up.
    class FakeBitmap {
      readonly close = vi.fn();
    }
    vi.stubGlobal("ImageBitmap", FakeBitmap);
    try {
      const posted: ToWorker[] = [];
      let deliver: ((event: MessageEvent<FromWorker>) => void) | null = null;
      const worker: WorkerLike = {
        postMessage: (message) => posted.push(message),
        addEventListener: ((type: "message" | "error", listener: (event: MessageEvent<FromWorker>) => void) => {
          if (type === "message") deliver = listener;
        }) as WorkerLike["addEventListener"],
        terminate: () => undefined,
      };
      const pool = new WorkerPool({ decode: () => worker, analysis: noWorker, proxy: noWorker, transcribe: noWorker, export: noWorker });
      const controller = new AbortController();
      const request = pool.request("poster", { file, kind: "image", maxSize: 320 }, { signal: controller.signal });
      const first = posted[0];
      const id = first && "id" in first ? first.id : -1;
      // The worker has already posted its result when the cancel goes out.
      controller.abort();
      await expect(request).rejects.toMatchObject({ name: "AbortError" });
      expect(posted[1]).toEqual({ type: "cancel", id });
      const bitmap = new FakeBitmap();
      const send = deliver as ((event: MessageEvent<FromWorker>) => void) | null;
      send?.({ data: { type: "result", id, value: { bitmap, blob: file } } } as MessageEvent<FromWorker>);
      expect(bitmap.close).toHaveBeenCalledTimes(1);
      // A late error has nothing to free and is ignored.
      send?.({ data: { type: "error", id, error: { name: "AbortError", message: "cancelled" } } } as MessageEvent<FromWorker>);
      expect(pool.inFlight).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("delivers progress values before the result", async () => {
    const { pool } = setup({
      prefetch: async (_params, _signal, emit) => {
        emit({ frame: "f1" as unknown as VideoFrame, timeUs: 1, approximate: false });
        emit({ frame: "f2" as unknown as VideoFrame, timeUs: 2, approximate: false });
        return { frames: 2 };
      },
    });
    const seen: number[] = [];
    const result = await pool.request("prefetch", { mediaId: "m", lod: "full", fromUs: 1, toUs: 2 }, { onProgress: (value) => seen.push(value.timeUs) });
    expect(result).toEqual({ frames: 2 });
    expect(seen).toEqual([1, 2]);
  });

  it("closes the frames of progress nobody takes: no listener, or a cancelled request", async () => {
    // jsdom has no VideoFrame; a stand-in class makes `transferablesOf` pick the frame up.
    class FakeVideoFrame {
      readonly close = vi.fn();
    }
    vi.stubGlobal("VideoFrame", FakeVideoFrame);
    try {
      const frames: FakeVideoFrame[] = [];
      const gate = deferred<void>();
      const emitted = deferred<void>();
      let calls = 0;
      const { pool } = setup({
        requestFrame: async (_params, signal, emit) => {
          const frame = new FakeVideoFrame();
          frames.push(frame);
          emit({ frame, timeUs: 0, approximate: true } as unknown as DeliveredFrame);
          if (++calls === 1) return { frame: new FakeVideoFrame(), timeUs: 0, approximate: false } as unknown as DeliveredFrame;
          emitted.resolve();
          await gate.promise;
          // Emitted after the cancel reached the host: closed in the worker.
          if (signal.aborted) {
            const late = new FakeVideoFrame();
            frames.push(late);
            emit({ frame: late, timeUs: 1, approximate: true } as unknown as DeliveredFrame);
          }
          return { frame: new FakeVideoFrame(), timeUs: 0, approximate: false } as unknown as DeliveredFrame;
        },
      });
      const params = { mediaId: "m", lod: "full" as const, timeUs: 0, priority: "scrub" as const };
      await pool.request("requestFrame", params);
      await flush();
      expect(frames[0]?.close).toHaveBeenCalledTimes(1);

      const controller = new AbortController();
      const cancelled = pool.request("requestFrame", params, { signal: controller.signal, onProgress: () => undefined });
      await emitted.promise;
      controller.abort();
      await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
      await flush();
      gate.resolve();
      await flush();
      expect(frames[2]?.close).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("starts immediate methods at once, beside a full queue", async () => {
    const gate = deferred<void>();
    const { pool } = setup(
      {
        probe: async () => {
          await gate.promise;
          return AUDIO;
        },
        decodeStats: async () => ({ sessions: 7 }) as never,
      },
      1,
      new Set<Method>(["decodeStats"]),
    );
    const busy = pool.request("probe", { file, container: "mp4", type: "" });
    const queued = pool.request("probe", { file, container: "mp4", type: "" });
    await expect(pool.request("decodeStats", {})).resolves.toEqual({ sessions: 7 });
    gate.resolve();
    await Promise.all([busy, queued]);
  });

  it("rejects an already aborted signal without contacting a worker", async () => {
    const { pool, workers } = setup({ probe: async () => AUDIO });
    const controller = new AbortController();
    controller.abort();
    await expect(pool.request("probe", { file, container: "mp4", type: "" }, { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(workers).toHaveLength(0);
  });

  it("rejects everything in flight when the worker crashes and recreates it on the next request", async () => {
    const gate = deferred<void>();
    const { pool, workers } = setup({
      probe: async ({ type }) => {
        if (type === "hang") await gate.promise;
        return AUDIO;
      },
    });
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const a = pool.request("probe", { file, container: "mp4", type: "hang" });
    const b = pool.request("probe", { file, container: "mp4", type: "hang" });
    await flush();
    workers[0]?.crash("out of memory");
    await expect(a).rejects.toThrow(/crashed: out of memory/);
    await expect(b).rejects.toThrow(/crashed/);
    expect(workers[0]?.terminated).toBe(true);
    expect(errors).toHaveBeenCalled();
    await expect(pool.request("probe", { file, container: "mp4", type: "ok" })).resolves.toEqual(AUDIO);
    expect(workers).toHaveLength(2);
  });

  it("rejects with a WorkerCrashError naming where the worker failed, and tells the crash listeners", async () => {
    const gate = deferred<void>();
    const { pool, workers } = setup({ probe: () => gate.promise.then(() => AUDIO) });
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const crashes: string[] = [];
    pool.onCrash((kind, error) => crashes.push(`${kind}: ${error.name}`));
    const a = pool.request("probe", { file, container: "mp4", type: "" });
    await flush();
    workers[0]?.crash("", { filename: "decode.worker.js", lineno: 12, colno: 7 });
    await expect(a).rejects.toMatchObject({ name: "WorkerCrashError", kind: "decode", message: "The decode worker crashed: unknown error at decode.worker.js:12:7" });
    expect(errors.mock.calls[0]?.[0]).toBe("[media] decode worker crashed at decode.worker.js:12:7: unknown error");
    expect(crashes).toEqual(["decode: WorkerCrashError"]);
    expect(pool.crashes).toEqual({ decode: 1 });
    // A late error event of the dead worker is not a second crash.
    workers[0]?.crash("again");
    expect(crashes).toHaveLength(1);
  });

  it("stops a worker on purpose: its requests reject with AbortErrors, the next request starts a new one", async () => {
    const gate = deferred<void>();
    const { pool, workers } = setup({
      probe: async ({ type }) => {
        if (type === "hang") await gate.promise;
        return AUDIO;
      },
    });
    pool.stop("decode");
    expect(workers).toHaveLength(0);
    const a = pool.request("probe", { file, container: "mp4", type: "hang" });
    await flush();
    pool.stop("decode");
    await expect(a).rejects.toMatchObject({ name: "AbortError" });
    expect(workers[0]?.terminated).toBe(true);
    expect(pool.inFlight).toBe(0);
    await expect(pool.request("probe", { file, container: "mp4", type: "ok" })).resolves.toEqual(AUDIO);
    expect(workers).toHaveLength(2);
  });

  it("reports a missing handler as an error", async () => {
    const { pool } = setup({});
    await expect(pool.request("decodeImage", { blob: file, maxSize: 10 })).rejects.toThrow(/No handler for decodeImage/);
  });
});

describe("WorkerPool watchdog (Batch 47)", () => {
  const WATCH = { watchdog: { decode: { pingAfterMs: 500, deadAfterMs: 1000 } } };

  function watched(handlers: Handlers, options: WorkerPoolOptions = WATCH) {
    let clock = 0;
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
    const result = setup(handlers, 2, new Set(), { ...options, now: () => clock });
    /** Moves the clock and the timers together, a watchdog tick at a time. */
    const advance = async (ms: number) => {
      for (let left = ms; left > 0; left -= WATCHDOG_TICK_MS) {
        clock += Math.min(WATCHDOG_TICK_MS, left);
        await vi.advanceTimersByTimeAsync(Math.min(WATCHDOG_TICK_MS, left));
      }
    };
    return { ...result, advance, jump: (ms: number) => (clock += ms) };
  }

  it("finds a worker that died without a word: pings it, then fails its requests and restarts it", async () => {
    const gate = deferred<void>();
    const { pool, workers, advance } = watched({ probe: async ({ type }) => (type === "hang" ? gate.promise.then(() => AUDIO) : AUDIO) });
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const crashes: string[] = [];
    pool.onCrash((kind) => crashes.push(kind));
    const a = pool.request("probe", { file, container: "mp4", type: "hang" });
    const failed = a.catch((error: unknown) => error);
    pool.exitForTest("decode");
    await advance(250);
    expect(workers[0]?.closed).toBe(true);
    expect(workers[0]?.received.some((m) => m.type === "ping")).toBe(false);
    // Quiet for 500 ms since the request: one ping; no answer for 1000 ms more: crashed.
    await advance(250);
    expect(workers[0]?.received.filter((m) => m.type === "ping")).toHaveLength(1);
    await advance(750);
    expect(crashes).toEqual([]);
    await advance(250);
    await expect(failed).resolves.toMatchObject({ name: "WorkerCrashError", message: "The decode worker stopped responding" });
    expect(crashes).toEqual(["decode"]);
    expect(workers[0]?.terminated).toBe(true);
    expect(errors).toHaveBeenCalledWith("[media] the decode worker stopped responding");
    await expect(pool.request("probe", { file, container: "mp4", type: "ok" })).resolves.toEqual(AUDIO);
    expect(workers).toHaveLength(2);
    vi.useRealTimers();
  });

  it("leaves a worker that answers alone, however long its request takes", async () => {
    const gate = deferred<void>();
    const { pool, workers, advance } = watched({ probe: () => gate.promise.then(() => AUDIO) });
    const crashes: string[] = [];
    pool.onCrash((kind) => crashes.push(kind));
    const a = pool.request("probe", { file, container: "mp4", type: "" });
    await advance(10_000);
    expect(workers[0]?.received.filter((m) => m.type === "ping").length).toBeGreaterThan(3);
    expect(crashes).toEqual([]);
    gate.resolve();
    await expect(a).resolves.toEqual(AUDIO);
    // Nothing waits: the watchdog stops ticking soon after.
    await advance(500);
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });

  it("keeps the clock running through requests cancelled and asked again at once (playback windows)", async () => {
    const { pool, advance } = watched({ probe: () => new Promise(() => undefined) });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const crashes: string[] = [];
    pool.onCrash((kind) => crashes.push(kind));
    let controller = new AbortController();
    void pool.request("probe", { file, container: "mp4", type: "" }, { signal: controller.signal }).catch(() => undefined);
    pool.exitForTest("decode");
    for (let i = 0; i < 8 && crashes.length === 0; i++) {
      await advance(250);
      controller.abort();
      controller = new AbortController();
      void pool.request("probe", { file, container: "mp4", type: "" }, { signal: controller.signal }).catch(() => undefined);
    }
    expect(crashes).toEqual(["decode"]);
    vi.useRealTimers();
  });

  it("starts the clock again after the worker was idle", async () => {
    const gate = deferred<void>();
    const { pool, workers, advance } = watched({ probe: async ({ type }) => (type === "hang" ? gate.promise.then(() => AUDIO) : AUDIO) });
    await expect(pool.request("probe", { file, container: "mp4", type: "ok" })).resolves.toEqual(AUDIO);
    // Idle for 3 s, then a slow request: no ping before it has waited 500 ms.
    await advance(3000);
    void pool.request("probe", { file, container: "mp4", type: "hang" });
    await advance(250);
    expect(workers[0]?.received.some((m) => m.type === "ping")).toBe(false);
    await advance(500);
    expect(workers[0]?.received.some((m) => m.type === "ping")).toBe(true);
    vi.useRealTimers();
  });

  it("decides nothing on a tick that follows a long task of the main thread", async () => {
    const gate = deferred<void>();
    const { pool, advance, jump } = watched({ probe: () => gate.promise.then(() => AUDIO) });
    const crashes: string[] = [];
    pool.onCrash((kind) => crashes.push(kind));
    void pool.request("probe", { file, container: "mp4", type: "" }).catch(() => undefined);
    pool.exitForTest("decode");
    await advance(750);
    // A ping is out; the main thread then blocks for 3 s before the next tick.
    jump(3000);
    await advance(250);
    expect(crashes).toEqual([]);
    await advance(1000);
    expect(crashes).toEqual(["decode"]);
    vi.useRealTimers();
  });

  it("leaves a silent worker alone while the watchdog is switched off (a worker paused in a debugger)", async () => {
    const { pool, workers, advance } = watched({ probe: () => new Promise(() => undefined) });
    pool.watchdogEnabled = false;
    void pool.request("probe", { file, container: "mp4", type: "" });
    pool.exitForTest("decode");
    await advance(5000);
    expect(workers[0]?.received.some((m) => m.type === "ping")).toBe(false);
    expect(pool.crashes).toEqual({});
    vi.useRealTimers();
  });

  it("does not watch kinds without watchdog times", async () => {
    const gate = deferred<void>();
    const { pool, workers, advance } = watched({ probe: () => gate.promise.then(() => AUDIO) }, {});
    void pool.request("probe", { file, container: "mp4", type: "" });
    pool.exitForTest("decode");
    await advance(5000);
    expect(workers[0]?.received.some((m) => m.type === "ping")).toBe(false);
    expect(pool.inFlight).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
});
