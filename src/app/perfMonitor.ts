// The performance pass's measurements (spec §4, Batch 45), in dev builds: React commits (a Profiler
// around the app), canvas redraws per second (the timeline's content and overlay, the preview), decode
// latency percentiles, dropped frames, GPU memory (the texture pool and every texture the renderer
// holds), open VideoFrames on each side, worker queue depths, main-thread long tasks and the JS heap.
// `snapshot()` gathers them for the dev stats overlay and the benchmarks (`__editor.perf`).
import type { PerfSnapshot } from "../core/perf/formatPerf.js";
import { LongTaskLog, RateCounter } from "../core/perf/perfMath.js";
import type { WorkerDecodeStats } from "../media/workers/protocol.js";
import { decodedAudio } from "./audioController.js";
import { frameService, playbackEngine, previewView, renderer, textRasters, texturePool } from "./previewController.js";
import { idleQueue, workerPool } from "./services.js";
import { timelineView } from "./timelineController.js";

interface ChromeMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
}

/** The cumulative counters sampled into rates. */
interface Counts {
  content: number;
  overlay: number;
  preview: number;
  skipped: number;
}

class PerfMonitor {
  private readonly commits = new RateCounter();
  private readonly rates = { content: new RateCounter(), overlay: new RateCounter(), preview: new RateCounter(), skipped: new RateCounter() };
  private last: Counts | null = null;
  readonly longTasks = new LongTaskLog(500);
  private observer: PerformanceObserver | null = null;
  private worker: WorkerDecodeStats | null = null;
  private polling: Promise<void> | null = null;

  /** The Profiler's onRender: one call per commit of the app root. */
  readonly reactCommit = (): void => {
    this.commits.add(performance.now());
  };

  /** React commits so far. */
  get reactCommits(): number {
    return this.commits.count;
  }

  /** Starts recording main-thread long tasks (the Long Tasks API, Chrome). */
  start(): void {
    if (this.observer || typeof PerformanceObserver === "undefined" || !PerformanceObserver.supportedEntryTypes?.includes("longtask")) return;
    this.observer = new PerformanceObserver((list) => this.record(list.getEntries()));
    this.observer.observe({ type: "longtask", buffered: true });
  }

  /** Takes the long tasks the observer holds but has not delivered yet (they arrive in a later task). */
  flushLongTasks(): void {
    if (this.observer) this.record(this.observer.takeRecords());
  }

  private record(entries: readonly PerformanceEntry[]): void {
    for (const entry of entries) this.longTasks.add({ start: entry.startTime, duration: entry.duration });
  }

  /** Fetches the decode worker's counters when it runs (a request would start a stopped one). */
  pollWorker(): Promise<void> {
    if (!workerPool.running.includes("decode")) {
      this.worker = null;
      return Promise.resolve();
    }
    this.polling ??= frameService
      .workerStats()
      .then(
        (stats) => {
          this.worker = stats;
        },
        () => undefined,
      )
      .finally(() => {
        this.polling = null;
      });
    return this.polling;
  }

  snapshot(): PerfSnapshot {
    this.flushLongTasks();
    const now = performance.now();
    const t = timelineView.stats;
    const p = previewView.stats;
    this.sample(now, { content: t.contentDraws, overlay: t.overlayDraws, preview: p.renders, skipped: p.skipped });
    const f = frameService.stats;
    const pool = texturePool.stats;
    const gpu = renderer.textureCounts;
    const heap = (performance as Performance & { memory?: ChromeMemory }).memory ?? null;
    const w = this.worker;
    const lastTask = this.longTasks.since(-Infinity).at(-1) ?? null;
    return {
      at: now,
      react: { commits: this.commits.count, perSecond: this.commits.rate(now) },
      timeline: { content: this.rates.content.rate(now), contentMs: t.contentMs, overlay: this.rates.overlay.rate(now), overlayMs: t.overlayMs },
      preview: { draws: this.rates.preview.rate(now), skipped: this.rates.skipped.rate(now), ms: p.ms },
      decode: { approx: [f.approxP50Ms, f.approxP95Ms, f.approxP99Ms], exact: [f.exactP50Ms, f.exactP95Ms, f.exactP99Ms], requests: f.requests },
      playback: { dropped: playbackEngine.stats.dropped, frames: playbackEngine.stats.frames },
      memory: {
        poolTextures: pool.count,
        poolBytes: pool.bytes,
        poolBudget: pool.budget,
        gpuTextures: gpu.live,
        gpuBytes: gpu.bytes,
        textBytes: textRasters.stats.bytes,
        audioBytes: decodedAudio.cache.stats.bytes,
        heapUsed: heap?.usedJSHeapSize ?? null,
        heapTotal: heap?.totalJSHeapSize ?? null,
      },
      frames: { main: f.openFrames, worker: w ? w.openFrames : null },
      decoders: w ? { sessions: w.sessions, live: w.liveDecoders } : null,
      queues: { inFlight: workerPool.inFlightByKind(), decodeJobs: w ? w.queued : null, idle: idleQueue.size },
      longTasks: { count: this.longTasks.count, lastSecond: this.longTasks.inWindow(now, 1000), maxMs: this.longTasks.max, last: lastTask },
    };
  }

  /** Adds what the cumulative counters gained since the last sample to the rates. */
  private sample(now: number, counts: Counts): void {
    const last = this.last;
    this.last = counts;
    if (!last) return;
    for (const key of Object.keys(counts) as (keyof Counts)[]) {
      const gained = counts[key] - last[key];
      if (gained > 0) this.rates[key].add(now, gained);
    }
  }
}

export const perfMonitor = new PerfMonitor();
