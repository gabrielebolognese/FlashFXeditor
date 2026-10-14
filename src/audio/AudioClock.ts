// The master clock of playback (spec §8): `AudioContext` time, even for silent projects. The context is
// created on the user's first pointer or key press (browsers start an AudioContext only after a user
// gesture), so it is already running when playback starts.
// - `now()` is the time of what the speakers output now: `getOutputTimestamp()` carried forward with
//   `performance.now()` between audio callbacks (the context time moves in callback steps of several
//   ms). Browsers without output timestamps use `currentTime`.
// - `performance.now()` stands in while the context is not running (not created yet, suspended by the
//   system) and while a running context has not output anything yet (a device that has not started:
//   its `currentTime` can stay still for a long time).
// - The result is monotonic and continuous: a switch between sources keeps the reading, a small step
//   back (callback jitter) holds it, and a large one (output resumed after a device stall) re-bases it
//   instead of freezing the clock until the audio catches up.
// TODO(batch 10): the audio graph and scheduler run on this context (`context`).

/** A monotonic time source in seconds. */
export interface PlaybackClock {
  now(): number;
}

/** The parts of an AudioContext the clock uses (tests use fakes). */
export interface AudioContextLike {
  readonly state: AudioContextState | "interrupted";
  readonly currentTime: number;
  getOutputTimestamp?(): AudioTimestamp;
  resume(): Promise<void>;
  close(): Promise<void>;
}

export interface AudioClockDeps {
  createContext?: () => AudioContextLike;
  /** ms clock (tests). */
  performanceNow?: () => number;
}

/** The output timestamp, the context time (no output timestamps), or the stand-in. */
type Source = "output" | "context" | "performance";

/** A step back larger than this (s) re-bases the clock instead of holding it. */
const REBASE_SECONDS = 0.05;

export class AudioClock implements PlaybackClock {
  private ctx: AudioContextLike | null = null;
  private source: Source | null = null;
  /** Added to the current source's reading so the output never jumps when the source changes. */
  private offset = 0;
  private last = 0;

  constructor(private readonly deps: AudioClockDeps = {}) {}

  /** The context, once created. */
  get context(): AudioContextLike | null {
    return this.ctx;
  }

  get running(): boolean {
    return this.ctx?.state === "running";
  }

  /** The source of the last reading (dev stats). */
  get sourceName(): Source | null {
    return this.source;
  }

  /** Creates (or resumes) the context on the first pointer or key press. Returns a stop function. */
  attach(target: Pick<Window, "addEventListener" | "removeEventListener">): () => void {
    const options = { capture: true } as const;
    const onInteraction = () => this.start();
    target.addEventListener("pointerdown", onInteraction, options);
    target.addEventListener("keydown", onInteraction, options);
    return () => {
      target.removeEventListener("pointerdown", onInteraction, options);
      target.removeEventListener("keydown", onInteraction, options);
    };
  }

  /** Creates the context if needed and resumes it. Call from a user gesture. */
  start(): void {
    if (!this.ctx) {
      try {
        this.ctx = (this.deps.createContext ?? (() => new AudioContext({ latencyHint: "interactive", sampleRate: 48_000 })))();
      } catch (error) {
        console.warn("[audio] no AudioContext; playback uses the performance clock", error);
        return;
      }
    }
    if (this.ctx.state !== "running" && this.ctx.state !== "closed") this.ctx.resume().catch(() => undefined);
  }

  now(): number {
    const [source, time] = this.read();
    if (source !== this.source || this.offset + time < this.last - REBASE_SECONDS) {
      this.offset = this.last - time;
      this.source = source;
    }
    this.last = Math.max(this.last, this.offset + time);
    return this.last;
  }

  async dispose(): Promise<void> {
    const ctx = this.ctx;
    this.ctx = null;
    await ctx?.close().catch(() => undefined);
  }

  private read(): [Source, number] {
    const perf = this.deps.performanceNow?.() ?? performance.now();
    const ctx = this.ctx;
    if (ctx?.state === "running") {
      if (!ctx.getOutputTimestamp) return ["context", ctx.currentTime];
      const stamp = ctx.getOutputTimestamp();
      if (stamp.contextTime !== undefined && stamp.performanceTime !== undefined && stamp.performanceTime > 0) {
        return ["output", stamp.contextTime + Math.max(0, perf - stamp.performanceTime) / 1000];
      }
    }
    return ["performance", perf / 1000];
  }
}
