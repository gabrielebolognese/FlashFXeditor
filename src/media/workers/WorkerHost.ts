// Worker side of the protocol: queues requests by priority (then arrival), runs at most
// `concurrency` at once, and cancels queued or running requests. A cancelled request always answers
// with an AbortError, whatever its handler does afterwards. `immediate` methods (frame requests) skip
// the queue and start at once: their handlers schedule themselves (one decoder per media).
import { abortError, closeTransferables, PRIORITY_RANK, toErrorInfo, transferablesOf, type FromWorker, type Method, type Params, type Progress, type RequestMessage, type Result, type ToWorker } from "./protocol.js";

export interface HostScope {
  postMessage(message: FromWorker, transfer: Transferable[]): void;
  addEventListener(type: "message", listener: (event: MessageEvent<ToWorker>) => void): void;
  /** Ends the worker (a worker's `self.close`); absent in-thread. */
  close?(): void;
}

/** `emit` posts a progress value (with its transferables) while the request is still running. */
export type Handler<M extends Method> = (params: Params<M>, signal: AbortSignal, emit: (value: Progress<M>) => void) => Promise<Result<M>>;
export type Handlers = { [M in Method]?: Handler<M> };

interface Running {
  controller: AbortController;
  settled: boolean;
  immediate: boolean;
}

export class WorkerHost {
  private readonly queue: RequestMessage[] = [];
  private readonly running = new Map<number, Running>();

  constructor(
    private readonly scope: HostScope,
    private readonly handlers: Handlers,
    private readonly concurrency = 2,
    private readonly immediate: ReadonlySet<Method> = new Set(),
  ) {
    scope.addEventListener("message", (event) => this.receive(event.data));
  }

  /** Requests waiting to start (for tests). */
  get queued(): number {
    return this.queue.length;
  }

  receive(message: ToWorker): void {
    if (message.type === "cancel") {
      this.cancel(message.id);
      return;
    }
    // The pool's watchdog: answered at once, whatever runs (a busy synchronous task delays it, as it should).
    if (message.type === "ping") {
      this.post({ type: "pong" });
      return;
    }
    if (message.type === "exit") {
      this.scope.close?.();
      return;
    }
    if (this.immediate.has(message.method)) {
      this.start(message);
      return;
    }
    const rank = PRIORITY_RANK[message.priority];
    let at = this.queue.length;
    while (at > 0 && PRIORITY_RANK[(this.queue[at - 1] as RequestMessage).priority] > rank) at--;
    this.queue.splice(at, 0, message);
    this.pump();
  }

  private cancel(id: number): void {
    const queuedAt = this.queue.findIndex((m) => m.id === id);
    if (queuedAt !== -1) {
      this.queue.splice(queuedAt, 1);
      this.post({ type: "error", id, error: toErrorInfo(abortError()) });
      return;
    }
    const running = this.running.get(id);
    if (running && !running.settled) {
      running.settled = true;
      running.controller.abort(abortError());
      this.post({ type: "error", id, error: toErrorInfo(abortError()) });
    }
  }

  private pump(): void {
    while (this.queuedRunning() < this.concurrency && this.queue.length > 0) this.start(this.queue.shift() as RequestMessage);
  }

  private queuedRunning(): number {
    let count = 0;
    for (const entry of this.running.values()) if (!entry.immediate) count += 1;
    return count;
  }

  private start(message: RequestMessage): void {
    const entry: Running = { controller: new AbortController(), settled: false, immediate: this.immediate.has(message.method) };
    this.running.set(message.id, entry);
    const handler = this.handlers[message.method] as Handler<Method> | undefined;
    const emit = (value: unknown) => {
      if (entry.settled) closeTransferables(value);
      else this.post({ type: "progress", id: message.id, value }, transferablesOf(value));
    };
    const work = handler
      ? Promise.resolve().then(() => handler(message.params as Params<Method>, entry.controller.signal, emit as (value: never) => void))
      : Promise.reject(new Error(`No handler for ${message.method}`));
    work
      .then(
        (value) => {
          if (entry.settled) {
            closeTransferables(value);
            return;
          }
          this.post({ type: "result", id: message.id, value }, transferablesOf(value));
        },
        (error: unknown) => {
          if (!entry.settled) this.post({ type: "error", id: message.id, error: toErrorInfo(error) });
        },
      )
      .finally(() => {
        entry.settled = true;
        this.running.delete(message.id);
        if (!entry.immediate) this.pump();
      });
  }

  private post(message: FromWorker, transfer: Transferable[] = []): void {
    this.scope.postMessage(message, transfer);
  }
}
