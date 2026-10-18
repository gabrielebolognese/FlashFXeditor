// Time left of an export (spec §16 "ETA by a moving average"): the frame rate of the last `windowMs`
// of progress. Time spent paused does not count.
export class EtaEstimator {
  private samples: { at: number; done: number }[] = [];
  private pausedAt: number | null = null;

  constructor(private readonly windowMs = 5000) {}

  /** `done` frames at time `now` (ms). */
  update(done: number, now: number): void {
    if (this.pausedAt !== null) return;
    this.samples.push({ at: now, done });
    // The window, keeping at least the two newest samples.
    while (this.samples.length > 2 && now - (this.samples[1] as { at: number }).at >= this.windowMs) this.samples.shift();
  }

  pause(now: number): void {
    if (this.pausedAt === null) this.pausedAt = now;
  }

  resume(now: number): void {
    if (this.pausedAt === null) return;
    const paused = now - this.pausedAt;
    this.pausedAt = null;
    for (const sample of this.samples) sample.at += paused;
  }

  /** Frames per second over the window, or null before two samples apart in time. */
  rate(): number | null {
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    if (!first || !last || last.at <= first.at || last.done <= first.done) return null;
    return ((last.done - first.done) * 1000) / (last.at - first.at);
  }

  /** Milliseconds left until `total` frames, or null while the rate is not known. */
  remainingMs(total: number): number | null {
    const rate = this.rate();
    const last = this.samples[this.samples.length - 1];
    if (rate === null || !last) return null;
    return (Math.max(0, total - last.done) * 1000) / rate;
  }
}

/** `m:ss` (or `h:mm:ss`) of a duration in ms, rounded up to the second. */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}
