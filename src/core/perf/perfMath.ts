// Measurement helpers for the performance pass (spec §4, Batch 45): event rates over a sliding
// window (React commits, canvas redraws per second), percentiles of latency samples, and a log of
// main-thread long tasks. Framework-free; times are milliseconds from any monotonic clock.

/** Events per second over a sliding window (default 1 s). Keeps only the timestamps inside it. */
export class RateCounter {
  private readonly times: number[] = [];
  private head = 0;
  private total = 0;

  constructor(private readonly windowMs = 1000) {}

  /** Records `count` events at `now`. */
  add(now: number, count = 1): void {
    for (let i = 0; i < count; i++) this.times.push(now);
    this.total += count;
    this.trim(now);
  }

  /** Events in the window ending at `now`, scaled to one second. */
  rate(now: number): number {
    this.trim(now);
    return ((this.times.length - this.head) * 1000) / this.windowMs;
  }

  /** Every event recorded so far. */
  get count(): number {
    return this.total;
  }

  private trim(now: number): void {
    const from = now - this.windowMs;
    while (this.head < this.times.length && (this.times[this.head] as number) <= from) this.head += 1;
    // Compact once the dropped prefix dominates, so the array stays the window's size.
    if (this.head > 64 && this.head * 2 > this.times.length) {
      this.times.splice(0, this.head);
      this.head = 0;
    }
  }
}

/** Nearest-rank percentiles (`ps` in 0..100) of `samples`; null for each when there are none. */
export function percentiles(samples: readonly number[], ps: readonly number[]): (number | null)[] {
  if (samples.length === 0) return ps.map(() => null);
  const sorted = [...samples].sort((a, b) => a - b);
  return ps.map((p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((sorted.length * p) / 100) - 1))] as number);
}

/** A fixed-size ring of the last samples (latencies), oldest dropped first. */
export class SampleRing {
  private readonly values: number[] = [];
  private next = 0;

  constructor(private readonly size = 128) {}

  push(value: number): void {
    if (this.values.length < this.size) this.values.push(value);
    else this.values[this.next] = value;
    this.next = (this.next + 1) % this.size;
  }

  get samples(): readonly number[] {
    return this.values;
  }

  clear(): void {
    this.values.length = 0;
    this.next = 0;
  }
}

export interface LongTask {
  /** Start time (ms, the observer's clock). */
  start: number;
  duration: number;
}

/** Main-thread tasks of 50 ms or more (the Long Tasks API threshold), the last `size` kept. */
export class LongTaskLog {
  private readonly tasks: LongTask[] = [];
  private total = 0;
  private longest = 0;

  constructor(private readonly size = 200) {}

  add(task: LongTask): void {
    this.tasks.push(task);
    if (this.tasks.length > this.size) this.tasks.shift();
    this.total += 1;
    this.longest = Math.max(this.longest, task.duration);
  }

  /** Tasks recorded so far. */
  get count(): number {
    return this.total;
  }

  /** The longest task so far (ms), 0 when none. */
  get max(): number {
    return this.longest;
  }

  /** The kept tasks that started at or after `from` and are longer than `over` ms. */
  since(from: number, over = 0): LongTask[] {
    return this.tasks.filter((task) => task.start >= from && task.duration > over);
  }

  /** Tasks in the window ending at `now`. */
  inWindow(now: number, windowMs: number): number {
    return this.since(now - windowMs).length;
  }

  clear(): void {
    this.tasks.length = 0;
    this.total = 0;
    this.longest = 0;
  }
}

/** Summary of rAF frame intervals: mean fps, the longest gap, and frames over 1.5 vsyncs (missed). */
export function frameSummary(intervals: readonly number[], vsyncMs = 1000 / 60): { frames: number; fps: number; maxMs: number; p95Ms: number | null; missed: number } {
  if (intervals.length === 0) return { frames: 0, fps: 0, maxMs: 0, p95Ms: null, missed: 0 };
  let sum = 0;
  let max = 0;
  let missed = 0;
  for (const interval of intervals) {
    sum += interval;
    max = Math.max(max, interval);
    if (interval > vsyncMs * 1.5) missed += 1;
  }
  const [p95] = percentiles(intervals, [95]);
  return { frames: intervals.length, fps: (intervals.length * 1000) / sum, maxMs: max, p95Ms: p95 ?? null, missed };
}
