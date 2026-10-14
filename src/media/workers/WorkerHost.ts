// Worker side of the protocol: queues requests by priority (then arrival), runs at most
// `concurrency` at once, and cancels queued or running requests. A cancelled request always answers
// with an AbortError, whatever its handler does afterwards.
import { abortError, PRIORITY_RANK, toErrorInfo, transferablesOf, type FromWorker, type Method, type Params, type RequestMessage, type Result, type ToWorker } from "./protocol.js";

export interface HostScope {
  postMessage(message: FromWorker, transfer: Transferable[]): void;
  addEventListener(type: "message", listener: (event: MessageEvent<ToWorker>) => void): void;
}

export type Handler<M extends Method> = (params: Params<M>, signal: AbortSignal) => Promise<Result<M>>;
export type Handlers = { [M in Method]?: Handler<M> };

interface Running {
  controller: AbortController;
  settled: boolean;
}

export class WorkerHost {
  private readonly queue: RequestMessage[] = [];
  private readonly running = new Map<number, Running>();

  constructor(
    private readonly scope: HostScope,
    private readonly handlers: Handlers,
    private readonly concurrency = 2,
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
    while (this.running.size < this.concurrency && this.queue.length > 0) this.start(this.queue.shift() as RequestMessage);
  }

  private start(message: RequestMessage): void {
    const entry: Running = { controller: new AbortController(), settled: false };
    this.running.set(message.id, entry);
    const handler = this.handlers[message.method] as Handler<Method> | undefined;
    const work = handler
      ? Promise.resolve().then(() => handler(message.params as Params<Method>, entry.controller.signal))
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
        this.pump();
      });
  }

  private post(message: FromWorker, transfer: Transferable[] = []): void {
    this.scope.postMessage(message, transfer);
  }
}

/** A result nobody will receive: free its bitmaps and frames (spec P13). */
function closeTransferables(value: unknown): void {
  for (const item of transferablesOf(value)) {
    if ("close" in item && typeof item.close === "function") item.close();
  }
}
