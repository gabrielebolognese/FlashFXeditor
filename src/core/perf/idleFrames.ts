// Dev assertion (Batch 47, P5, P13): once the app has been idle for a while (no frame requests, not
// playing), no VideoFrame is open: the main thread closes each one after its upload, and a decode
// session gives back the frames of its ring after a second without requests. A frame still open then
// is a leak, reported once per idle stretch.

export interface OpenFrames {
  main: number;
  /** The decode worker's (null when it does not run: it has none). */
  worker: number | null;
}

export interface IdleFrameCheckDeps {
  /** A number that changes whenever frames are asked for (requests, decodes): activity. */
  activity(): number;
  /** Playing, scrubbing, a gesture or an export: frames are expected. */
  busy(): boolean;
  openFrames(): Promise<OpenFrames>;
  report(message: string): void;
  /** How long the app must be idle before the check (ms). */
  idleMs?: number;
}

export const IDLE_FRAME_CHECK_MS = 3000;

export class IdleFrameCheck {
  private lastActivity = Number.NaN;
  private idleSince: number | null = null;
  private checked = false;
  private reading = false;
  /** Checks run and leaks reported (dev stats, tests). */
  readonly counts = { checks: 0, leaks: 0 };

  constructor(private readonly deps: IdleFrameCheckDeps) {}

  /** Call every second or so. */
  tick(now: number): void {
    const activity = this.deps.activity();
    if (this.deps.busy() || activity !== this.lastActivity) {
      this.lastActivity = activity;
      this.idleSince = null;
      this.checked = false;
      return;
    }
    this.idleSince ??= now;
    if (this.checked || this.reading || now - this.idleSince < (this.deps.idleMs ?? IDLE_FRAME_CHECK_MS)) return;
    this.reading = true;
    const since = this.idleSince;
    void this.deps.openFrames().then(
      (open) => {
        this.reading = false;
        // Activity while the counts were read: they may hold frames in use; the next idle stretch checks.
        if (this.idleSince !== since || this.deps.activity() !== activity) return;
        this.checked = true;
        this.counts.checks += 1;
        const total = open.main + (open.worker ?? 0);
        if (total === 0) return;
        this.counts.leaks += 1;
        this.deps.report(`[dev] ${total} VideoFrame${total === 1 ? "" : "s"} still open after ${Math.round((now - since) / 1000)} s idle (main ${open.main}, decode worker ${open.worker ?? 0}): a frame is not closed (P13)`);
      },
      () => {
        this.reading = false;
      },
    );
  }
}
