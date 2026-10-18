// The export queue (spec §16, Batch 44): jobs run one at a time, in the order they were added. A
// queued job that is cancelled leaves the queue at once; cancelling the running job aborts it and the
// next one starts. `jobs` (queued and running, in order) is what the Export tab's cards show; each job
// ends as done, cancelled (an AbortError, or its signal aborted with one) or failed (any other error,
// or the reason its signal was aborted with: a failed write).
import { createStore, type Store } from "../core/store/createStore.js";
import { isAbortError } from "../media/workers/protocol.js";

export type JobStatus = "queued" | "running";

export interface QueueJob<S> {
  id: string;
  spec: S;
  status: JobStatus;
}

export type JobOutcome<R> = { status: "done"; result: R } | { status: "cancelled" } | { status: "failed"; error: unknown };

export interface QueueHandlers<S, R> {
  /** Runs one job; rejects to end it as cancelled or failed. `fail` aborts it with a reason (a failed write). */
  run(job: QueueJob<S>, signal: AbortSignal, fail: (reason: unknown) => void): Promise<R>;
  /** A job ended (also a queued job that was cancelled). Runs before the next job starts. */
  ended(job: QueueJob<S>, outcome: JobOutcome<R>): void;
}

export class ExportQueue<S, R> {
  readonly jobs: Store<readonly QueueJob<S>[]> = createStore<readonly QueueJob<S>[]>([]);
  private readonly controllers = new Map<string, AbortController>();
  private nextId = 1;

  constructor(private readonly handlers: QueueHandlers<S, R>) {}

  /** The running job, or null. */
  get running(): QueueJob<S> | null {
    const first = this.jobs.getState()[0];
    return first?.status === "running" ? first : null;
  }

  get(id: string): QueueJob<S> | undefined {
    return this.jobs.getState().find((job) => job.id === id);
  }

  /** Adds a job at the end; it starts at once when nothing runs. Returns its id. */
  add(spec: S): string {
    const id = `job-${this.nextId++}`;
    this.jobs.set((jobs) => [...jobs, { id, spec, status: "queued" }]);
    this.startNext();
    return id;
  }

  /** Cancels a job: a queued one leaves the queue, the running one is aborted. */
  cancel(id: string): void {
    const job = this.get(id);
    if (!job) return;
    if (job.status === "running") {
      this.controllers.get(id)?.abort();
      return;
    }
    this.jobs.set((jobs) => jobs.filter((j) => j.id !== id));
    this.handlers.ended(job, { status: "cancelled" });
  }

  /** Cancels every job (the queued ones first, so none starts). */
  cancelAll(): void {
    for (const job of [...this.jobs.getState()].reverse()) this.cancel(job.id);
  }

  private startNext(): void {
    const jobs = this.jobs.getState();
    if (jobs.length === 0 || jobs[0]?.status === "running") return;
    const job: QueueJob<S> = { ...(jobs[0] as QueueJob<S>), status: "running" };
    this.jobs.set([job, ...jobs.slice(1)]);
    const controller = new AbortController();
    this.controllers.set(job.id, controller);
    void this.runJob(job, controller);
  }

  private async runJob(job: QueueJob<S>, controller: AbortController): Promise<void> {
    const { signal } = controller;
    let outcome: JobOutcome<R>;
    try {
      outcome = { status: "done", result: await this.handlers.run(job, signal, (reason) => controller.abort(reason)) };
    } catch (error) {
      // An abort with a reason that is no AbortError is that failure (a failed write stops the export).
      const reason: unknown = signal.aborted ? signal.reason : null;
      const failure = reason !== null && !isAbortError(reason) ? reason : error;
      outcome = isAbortError(failure) ? { status: "cancelled" } : { status: "failed", error: failure };
    }
    this.controllers.delete(job.id);
    this.jobs.set((jobs) => jobs.filter((j) => j.id !== job.id));
    try {
      this.handlers.ended(job, outcome);
    } finally {
      this.startNext();
    }
  }
}
