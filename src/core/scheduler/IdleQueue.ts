// Background work queue (spec §3.4): runs small tasks in requestIdleCallback slices with a deadline,
// and pauses entirely while playing or dragging.
// TODO(batch 09): pause/resume from the playback engine; gestures pause it from Batch 11 on.

export type IdleTask = () => void;

interface IdleDeadlineLike {
  timeRemaining(): number;
}

type RequestIdle = (callback: (deadline: IdleDeadlineLike) => void) => number;
type CancelIdle = (handle: number) => void;

/** Minimum time left in a slice before another task is started. */
const MIN_SLICE_MS = 1;

export class IdleQueue {
  private readonly tasks: IdleTask[] = [];
  private handle: number | null = null;
  private paused = false;

  constructor(
    private readonly requestIdle: RequestIdle = (cb) => requestIdleCallback(cb),
    private readonly cancelIdle: CancelIdle = (handle) => cancelIdleCallback(handle),
  ) {}

  /** Adds a task. Returns a cancel function that removes it if it has not run yet. */
  enqueue(task: IdleTask): () => void {
    this.tasks.push(task);
    this.schedule();
    return () => {
      const index = this.tasks.indexOf(task);
      if (index !== -1) this.tasks.splice(index, 1);
    };
  }

  get size(): number {
    return this.tasks.length;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  pause(): void {
    this.paused = true;
    if (this.handle !== null) this.cancelIdle(this.handle);
    this.handle = null;
  }

  resume(): void {
    this.paused = false;
    this.schedule();
  }

  private schedule(): void {
    if (this.paused || this.handle !== null || this.tasks.length === 0) return;
    this.handle = this.requestIdle(this.run);
  }

  private readonly run = (deadline: IdleDeadlineLike): void => {
    this.handle = null;
    while (!this.paused && this.tasks.length > 0 && deadline.timeRemaining() > MIN_SLICE_MS) {
      const task = this.tasks.shift()!;
      try {
        task();
      } catch (error) {
        console.error("[idle] task failed", error);
      }
    }
    this.schedule();
  };
}
