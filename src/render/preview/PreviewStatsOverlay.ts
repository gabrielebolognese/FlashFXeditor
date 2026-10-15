// Dev stats over the preview (spec §13 "GPU memory of the texture pool (dev toggle)"): GPU state and
// recoveries, preview draws (and identical frames skipped) against resize events, the compositor's
// layers (exact, stand-in, held, missing) and requests, the texture pool's count, bytes and evictions,
// and the decode engine: latencies to the first and to the exact frame, seeks, live decoders, frames
// held on each side (the main thread's must stay 0, P13), sample index cache hits, and playback
// (speed, dropped frames against frames played, prefetch windows, media flagged for proxy), and the
// canvas snap candidates (rebuilds against queries, §7.4). Plain text
// written in the scheduler loop; the worker's counters are polled while the overlay is shown. React
// only mounts the element.
import type { FrameScheduler, RenderView } from "../../core/scheduler/FrameScheduler.js";
import type { TexturePool } from "../../media/cache/TexturePool.js";
import type { FrameService } from "../../media/decode/FrameService.js";
import type { WorkerDecodeStats } from "../../media/workers/protocol.js";
import type { PlaybackEngine } from "../../playback/PlaybackEngine.js";
import type { GpuDevice } from "../gpu/GpuDevice.js";
import type { PreviewStats } from "./PreviewView.js";

/** How often the worker's decode counters are fetched while the overlay is shown. */
const WORKER_POLL_MS = 500;

export interface PreviewStatsDeps {
  scheduler: Pick<FrameScheduler, "register" | "invalidate">;
  preview: { readonly stats: PreviewStats };
  pool: Pick<TexturePool, "stats" | "subscribe">;
  gpu: Pick<GpuDevice, "state" | "generation" | "restores" | "lastRecoveryMs" | "subscribe">;
  frames: Pick<FrameService, "stats" | "subscribe" | "workerStats">;
  playback?: Pick<PlaybackEngine, "stats" | "speed" | "autoProxy" | "subscribe">;
  /** Canvas snapping: candidate rebuilds (only when the layers or overlays change) and queries. */
  canvas?: { readonly snapStats: { readonly rebuilds: number; readonly queries: number } };
}

const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);
const ms = (value: number | null) => (value === null ? "-" : String(Math.round(value)));

function playbackLine(playback: NonNullable<PreviewStatsDeps["playback"]>): string {
  const { dropped, frames, windows, received } = playback.stats;
  const rate = frames > 0 ? ` (${((dropped / frames) * 100).toFixed(2)}%)` : "";
  const proxy = playback.autoProxy.size > 0 ? [...playback.autoProxy].join(", ") : "none";
  const speed = playback.speed === 0 ? "paused" : `${playback.speed}x`;
  return `playback ${speed} · dropped ${dropped} / ${frames}${rate} · windows ${windows} · received ${received} · behind (proxy) ${proxy}`;
}

export class PreviewStatsOverlay implements RenderView {
  private element: HTMLElement | null = null;
  private worker: WorkerDecodeStats | null = null;

  constructor(private readonly deps: PreviewStatsDeps) {}

  attach(element: HTMLElement): () => void {
    const { scheduler, pool, gpu, frames, playback } = this.deps;
    this.element = element;
    const invalidate = () => scheduler.invalidate("previewOverlay");
    const poll = () => {
      frames.workerStats().then(
        (stats) => {
          this.worker = stats;
          invalidate();
        },
        () => undefined,
      );
    };
    const timer = setInterval(poll, WORKER_POLL_MS);
    poll();
    // Registered after the preview view, so on "preview" frames it runs after the render it reports.
    const stops = [
      scheduler.register("preview", this),
      scheduler.register("previewOverlay", this),
      pool.subscribe(invalidate),
      gpu.subscribe(invalidate),
      frames.subscribe(invalidate),
      ...(playback ? [playback.subscribe(invalidate)] : []),
    ];
    invalidate();
    return () => {
      clearInterval(timer);
      for (const stop of stops) stop();
      this.element = null;
    };
  }

  render(): void {
    if (!this.element) return;
    const { preview, pool, gpu, frames, playback, canvas } = this.deps;
    const p = preview.stats;
    const s = pool.stats;
    const f = frames.stats;
    const w = this.worker;
    const recovery = gpu.restores > 0 ? ` (last ${Math.round(gpu.lastRecoveryMs)} ms)` : "";
    const decode = w
      ? `decoders ${w.liveDecoders}/${w.sessions} · seeks ${w.seeks} · decoded ${w.decoded} · dropped ${w.dropped} · ring hits ${w.ringHits} · stalls ${w.stalls} · index cached ${w.indexFromCache} parsed ${w.indexParsed}`
      : "decode worker not started";
    this.element.textContent = [
      `GPU ${gpu.state} · device ${gpu.generation} · restores ${gpu.restores}${recovery}`,
      `draws ${p.renders} · skipped ${p.skipped} · ${p.ms.toFixed(2)} ms · resizes ${p.resizes} · ${p.width}×${p.height} @${p.dpr}x`,
      `layers ${p.textures.layers}: exact ${p.textures.exact} · stand-in ${p.textures.standIns} · held ${p.textures.held} · missing ${p.textures.missing} · pending ${p.textures.pending} · warming ${p.textures.warming} · failed ${p.textures.failed}`,
      `pool ${s.count} tex · ${mb(s.bytes)} / ${mb(s.budget)} MB · pinned ${s.pinned} · evicted ${s.evictions}`,
      `frame ms: approx ${ms(f.approxLastMs)} (p95 ${ms(f.approxP95Ms)}) · exact ${ms(f.exactLastMs)} (p95 ${ms(f.exactP95Ms)}) · requests ${f.requests} · pool hits ${f.poolHits} · superseded ${f.superseded} · failed ${f.failed}`,
      decode,
      `open VideoFrames: main ${f.openFrames} · worker ${w ? w.openFrames : 0}`,
      ...(playback ? [playbackLine(playback)] : []),
      ...(canvas ? [`canvas snap: candidates rebuilt ${canvas.snapStats.rebuilds} · queries ${canvas.snapStats.queries}`] : []),
    ].join("\n");
  }
}
