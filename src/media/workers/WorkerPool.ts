// Main-thread side of the protocol (spec §3.5): one worker per kind, created on the first request.
// `request` resolves with the typed result; aborting its signal cancels it in the worker and rejects
// at once with an AbortError. A crashed worker rejects everything it had and is recreated on the next
// request; `stop` ends one on purpose the same way (with AbortErrors).
import { abortError, closeTransferables, fromErrorInfo, METHOD_WORKER, type FromWorker, type Method, type Params, type Priority, type Progress, type Result, type ToWorker, type WorkerKind } from "./protocol.js";

export interface WorkerLike {
  postMessage(message: ToWorker, transfer?: Transferable[]): void;
  addEventListener(type: "message", listener: (event: MessageEvent<FromWorker>) => void): void;
  addEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
  terminate(): void;
}

export type WorkerFactories = Record<WorkerKind, () => WorkerLike>;

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
  private nextId = 1;

  constructor(private readonly factories: WorkerFactories) {}

  /** Requests in flight (for tests and diagnostics). */
  get inFlight(): number {
    return this.pending.size;
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
    worker.addEventListener("message", (event) => this.receive(event.data));
    worker.addEventListener("error", (event) => {
      event.preventDefault?.();
      console.error(`[media] ${kind} worker crashed`, event.message);
      this.fail(kind, new Error(`The ${kind} worker crashed: ${event.message || "unknown error"}`), worker);
    });
    this.workers.set(kind, worker);
    return worker;
  }

  private receive(message: FromWorker): void {
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
  }
}
