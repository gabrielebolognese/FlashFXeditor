// Main-thread side of the protocol (spec §3.5): one worker per kind, created on the first request.
// `request` resolves with the typed result; aborting its signal cancels it in the worker and rejects
// at once with an AbortError. A crashed worker rejects everything it had with a WorkerCrashError and is
// recreated on the next request; `stop` ends one on purpose the same way (with AbortErrors).
// Crashes (Batch 47): an uncaught error in the worker fires its `error` event; a worker that dies
// without one (closed from DevTools, killed by the browser) is found by the watchdog of its kind:
// while requests wait and the worker has been quiet for `pingAfterMs`, it is pinged, and with no
// message back within `deadAfterMs` it is treated as crashed. `onCrash` listeners hear of both.
import { abortError, closeTransferables, fromErrorInfo, METHOD_WORKER, WorkerCrashError, type FromWorker, type Method, type Params, type Priority, type Progress, type Result, type ToWorker, type WorkerKind } from "./protocol.js";

export interface WorkerLike {
  postMessage(message: ToWorker, transfer?: Transferable[]): void;
  addEventListener(type: "message", listener: (event: MessageEvent<FromWorker>) => void): void;
  addEventListener(type: "error" | "messageerror", listener: (event: Event) => void): void;
  terminate(): void;
}

export type WorkerFactories = Record<WorkerKind, () => WorkerLike>;

/** How long a worker with waiting requests may stay quiet before a ping, and then without an answer. */
export interface WatchdogTimes {
  pingAfterMs: number;
  deadAfterMs: number;
}

export interface WorkerPoolOptions {
  /** Kinds watched for a silent death (a worker busy for seconds on purpose, as transcription, is not). */
  watchdog?: Partial<Record<WorkerKind, WatchdogTimes>>;
  now?: () => number;
}

/** How often the watchdog looks, while requests of a watched kind wait. */
export const WATCHDOG_TICK_MS = 100;

export type CrashListener = (kind: WorkerKind, error: WorkerCrashError) => void;

interface Watch {
  /** The last message from the worker, or when requests started waiting on an idle worker. */
  heardAt: number;
  pingAt: number | null;
  /** When the last request settled with none left (null while requests wait). */
  idleAt: number | null;
}

export interface RequestOptions<P = unknown> {
  priority?: Priority;
  signal?: AbortSignal;
  transfer?: Transferable[];
  /** Receives the request's progress values (and owns their frames). Without it they are closed. */
  onProgress?: (value: P) => void;
}

interface Pending {
  kind: WorkerKind;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
  progress: ((value: unknown) => void) | undefined;
  cleanup: () => void;
}

export class WorkerPool {
  private readonly workers = new Map<WorkerKind, WorkerLike>();
  private readonly pending = new Map<number, Pending>();
  private readonly waiting = new Map<WorkerKind, number>();
  private readonly watches = new Map<WorkerKind, Watch>();
  private readonly crashListeners = new Set<CrashListener>();
  private watchTimer: ReturnType<typeof setInterval> | null = null;
  private lastTick = 0;
  private nextId = 1;
  private readonly now: () => number;
  /** Crashes so far per kind (dev stats). */
  readonly crashes: Partial<Record<WorkerKind, number>> = {};
  /** False: no worker is pinged or restarted for its silence (dev: a worker paused in a debugger). */
  watchdogEnabled = true;

  constructor(
    private readonly factories: WorkerFactories,
    private readonly options: WorkerPoolOptions = {},
  ) {
    this.now = options.now ?? (() => performance.now());
  }

  /** Calls `listener` after a worker crashed and its requests were rejected (the next request restarts it). */
  onCrash(listener: CrashListener): () => void {
    this.crashListeners.add(listener);
    return () => this.crashListeners.delete(listener);
  }

  /**
   * Ends the worker of `kind` from inside, without an error event, as DevTools or the browser would
   * (dev checks of the watchdog). Its requests stay pending until the watchdog notices.
   */
  exitForTest(kind: WorkerKind): void {
    this.workers.get(kind)?.postMessage({ type: "exit" });
  }

  /** Requests in flight (for tests and diagnostics). */
  get inFlight(): number {
    return this.pending.size;
  }

  /** Requests in flight per worker kind (dev stats: queue depths). */
  inFlightByKind(): Partial<Record<WorkerKind, number>> {
    const counts: Partial<Record<WorkerKind, number>> = {};
    for (const { kind } of this.pending.values()) counts[kind] = (counts[kind] ?? 0) + 1;
    return counts;
  }

  /** The kinds whose worker runs now. */
  get running(): WorkerKind[] {
    return [...this.workers.keys()];
  }

  request<M extends Method>(method: M, params: Params<M>, options: RequestOptions<Progress<M>> = {}): Promise<Result<M>> {
    const { signal, priority = "background", transfer = [], onProgress } = options;
    if (signal?.aborted) return Promise.reject(signal.reason ?? abortError());
    const kind = METHOD_WORKER[method];
    const worker = this.worker(kind);
    const id = this.nextId++;
    return new Promise<Result<M>>((resolve, reject) => {
      const onAbort = () => {
        if (!this.pending.has(id)) return;
        this.settle(id);
        worker.postMessage({ type: "cancel", id });
        reject(signal?.reason ?? abortError());
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      this.pending.set(id, {
        kind,
        resolve: resolve as (value: unknown) => void,
        reject,
        progress: onProgress as ((value: unknown) => void) | undefined,
        cleanup: () => signal?.removeEventListener("abort", onAbort),
      });
      this.startWaiting(kind);
      worker.postMessage({ type: "request", id, method, priority, params } as ToWorker, transfer);
    });
  }

  terminate(): void {
    for (const [kind, worker] of this.workers) this.fail(kind, new Error(`The ${kind} worker was stopped`), worker);
  }

  /**
   * Terminates the worker of `kind` (if it runs), freeing its memory at once; its requests reject with
   * an AbortError. The next request starts a new one (transcription: a cancel, or done with the model).
   */
  stop(kind: WorkerKind): void {
    const worker = this.workers.get(kind);
    if (worker) this.fail(kind, abortError(), worker);
  }

  private worker(kind: WorkerKind): WorkerLike {
    const existing = this.workers.get(kind);
    if (existing) return existing;
    const worker = this.factories[kind]();
    worker.addEventListener("message", (event) => {
      if (this.workers.get(kind) === worker) this.heard(kind);
      this.receive(event.data);
    });
    worker.addEventListener("error", (event) => {
      event.preventDefault?.();
      // Everything the event has, so a crash can be traced (its message is often empty).
      const { message, filename, lineno, colno, error } = event as ErrorEvent;
      const where = filename ? ` at ${filename}:${lineno ?? 0}:${colno ?? 0}` : "";
      console.error(`[media] ${kind} worker crashed${where}: ${message || "unknown error"}`, error ?? "");
      if (this.workers.get(kind) === worker) this.crash(kind, worker, `crashed: ${message || "unknown error"}${where}`);
    });
    worker.addEventListener("messageerror", () => {
      // A message the worker posted could not be read here; its request stays pending (the watchdog of its kind covers it).
      console.error(`[media] a message from the ${kind} worker could not be read`);
    });
    this.workers.set(kind, worker);
    return worker;
  }

  private crash(kind: WorkerKind, worker: WorkerLike, what: string): void {
    this.crashes[kind] = (this.crashes[kind] ?? 0) + 1;
    const error = new WorkerCrashError(kind, `The ${kind} worker ${what}`);
    this.fail(kind, error, worker);
    for (const listener of [...this.crashListeners]) {
      try {
        listener(kind, error);
      } catch (listenerError) {
        console.error("[media] crash listener failed", listenerError);
      }
    }
  }

  private startWaiting(kind: WorkerKind): void {
    const count = this.waiting.get(kind) ?? 0;
    this.waiting.set(kind, count + 1);
    if (!this.options.watchdog?.[kind]) return;
    const now = this.now();
    const watch = this.watches.get(kind);
    if (!watch) this.watches.set(kind, { heardAt: now, pingAt: null, idleAt: null });
    else if (count === 0) {
      // Quiet while nothing was asked does not count, but a request cancelled and asked again at once
      // (playback windows) does not start the clock again.
      if (watch.idleAt !== null && now - watch.idleAt > WATCHDOG_TICK_MS) {
        watch.heardAt = now;
        watch.pingAt = null;
      }
      watch.idleAt = null;
    }
    if (this.watchTimer === null) {
      this.lastTick = now;
      this.watchTimer = setInterval(this.watch, WATCHDOG_TICK_MS);
    }
  }

  private stopWaiting(kind: WorkerKind): void {
    const count = (this.waiting.get(kind) ?? 1) - 1;
    if (count > 0) {
      this.waiting.set(kind, count);
      return;
    }
    this.waiting.delete(kind);
    const watch = this.watches.get(kind);
    if (watch) watch.idleAt = this.now();
  }

  private heard(kind: WorkerKind): void {
    const watch = this.watches.get(kind);
    if (!watch) return;
    watch.heardAt = this.now();
    watch.pingAt = null;
  }

  private readonly watch = (): void => {
    const now = this.now();
    // The main thread was busy (a long task): answers may sit unread in its queue, so this tick decides nothing.
    const stalled = now - this.lastTick > WATCHDOG_TICK_MS * 3;
    this.lastTick = now;
    for (const [kind, watch] of [...this.watches]) {
      const times = this.options.watchdog?.[kind];
      const worker = this.workers.get(kind);
      // Idle for a while: stop watching (the timer stops with the last watch).
      if (watch.idleAt !== null) {
        if (now - watch.idleAt > WATCHDOG_TICK_MS) this.watches.delete(kind);
        continue;
      }
      if (!times || !worker || !this.watchdogEnabled) continue;
      if (stalled) {
        if (watch.pingAt !== null) watch.pingAt = now;
        continue;
      }
      if (watch.pingAt === null) {
        if (now - watch.heardAt < times.pingAfterMs) continue;
        watch.pingAt = now;
        worker.postMessage({ type: "ping" });
      } else if (now - watch.pingAt >= times.deadAfterMs) {
        console.error(`[media] the ${kind} worker stopped responding`);
        this.crash(kind, worker, "stopped responding");
      }
    }
    if (this.watches.size === 0 && this.watchTimer !== null) {
      clearInterval(this.watchTimer);
      this.watchTimer = null;
    }
  };

  private receive(message: FromWorker): void {
    if (message.type === "pong") return;
    if (message.type === "progress") {
      const progress = this.pending.get(message.id)?.progress;
      // Nobody takes it (cancelled, or no listener): free its frames (P13).
      if (!progress) closeTransferables(message.value);
      else {
        try {
          progress(message.value);
        } catch (error) {
          console.error("[media] progress listener failed", error);
        }
      }
      return;
    }
    const entry = this.settle(message.id);
    if (!entry) {
      // Cancelled or failed already. A result the worker posted before the cancel reached it still
      // carries transferred bitmaps or frames: close them here (P13).
      if (message.type === "result") closeTransferables(message.value);
      return;
    }
    if (message.type === "result") entry.resolve(message.value);
    else entry.reject(fromErrorInfo(message.error));
  }

  private settle(id: number): Pending | undefined {
    const entry = this.pending.get(id);
    if (!entry) return undefined;
    this.pending.delete(id);
    entry.cleanup();
    this.stopWaiting(entry.kind);
    return entry;
  }

  private fail(kind: WorkerKind, error: Error, worker: WorkerLike): void {
    if (this.workers.get(kind) === worker) this.workers.delete(kind);
    worker.terminate();
    for (const [id, entry] of [...this.pending]) {
      if (entry.kind !== kind) continue;
      this.settle(id);
      entry.reject(error);
    }
    // The next worker of this kind starts with a fresh clock.
    this.watches.delete(kind);
  }
}
