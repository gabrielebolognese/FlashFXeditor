// Dev stats over the preview (spec §13 "GPU memory of the texture pool (dev toggle)"): GPU state and
// recoveries, preview renders against resize events, and the texture pool's count, bytes and
// evictions. Plain text written in the scheduler loop, in the same frame as the preview it describes;
// React only mounts the element.
import type { FrameScheduler, RenderView } from "../../core/scheduler/FrameScheduler.js";
import type { TexturePool } from "../../media/cache/TexturePool.js";
import type { GpuDevice } from "../gpu/GpuDevice.js";
import type { PreviewStats } from "./PreviewView.js";

export interface PreviewStatsDeps {
  scheduler: Pick<FrameScheduler, "register" | "invalidate">;
  preview: { readonly stats: PreviewStats };
  pool: Pick<TexturePool, "stats" | "subscribe">;
  gpu: Pick<GpuDevice, "state" | "generation" | "restores" | "lastRecoveryMs" | "subscribe">;
}

const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);

export class PreviewStatsOverlay implements RenderView {
  private element: HTMLElement | null = null;

  constructor(private readonly deps: PreviewStatsDeps) {}

  attach(element: HTMLElement): () => void {
    const { scheduler, pool, gpu } = this.deps;
    this.element = element;
    const invalidate = () => scheduler.invalidate("previewOverlay");
    // Registered after the preview view, so on "preview" frames it runs after the render it reports.
    const stops = [scheduler.register("preview", this), scheduler.register("previewOverlay", this), pool.subscribe(invalidate), gpu.subscribe(invalidate)];
    invalidate();
    return () => {
      for (const stop of stops) stop();
      this.element = null;
    };
  }

  render(): void {
    if (!this.element) return;
    const { preview, pool, gpu } = this.deps;
    const p = preview.stats;
    const s = pool.stats;
    const recovery = gpu.restores > 0 ? ` (last ${Math.round(gpu.lastRecoveryMs)} ms)` : "";
    this.element.textContent = [
      `GPU ${gpu.state} · device ${gpu.generation} · restores ${gpu.restores}${recovery}`,
      `renders ${p.renders} · resizes ${p.resizes} · ${p.width}×${p.height} @${p.dpr}x`,
      `pool ${s.count} tex · ${mb(s.bytes)} / ${mb(s.budget)} MB · pinned ${s.pinned} · evicted ${s.evictions}`,
    ].join("\n");
  }
}
