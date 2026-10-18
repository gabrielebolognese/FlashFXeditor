// The WebGL2 context of the WebGL2 backend (Batch 48), the counterpart of GpuDevice: one context on
// its own OffscreenCanvas (in export.worker, the canvas the export's frames are made from), so every
// texture lives in one context whatever canvas is drawn to. A lost context (driver reset, GPU process
// crash) is kept for the browser to restore (the loss event's default prevented); the same context
// object comes back empty and listeners rebuild their GL objects on "ready". The export does not
// recover (`recover: false`): lost goes to failed, as with GpuDevice.
import type { RenderDevice } from "./backend.js";
import type { GpuState } from "./GpuDevice.js";

/**
 * The context the backend draws with: no depth, stencil or multisampling (the layers are 2D quads
 * with their own anti-aliasing); an opaque canvas as the WebGPU canvas is; no software rendering.
 */
export const GL_ATTRIBUTES: WebGLContextAttributes = {
  alpha: false,
  antialias: false,
  depth: false,
  stencil: false,
  premultipliedAlpha: true,
  preserveDrawingBuffer: false,
  powerPreference: "high-performance",
  failIfMajorPerformanceCaveat: true,
};

/** WebGL2 on the GPU (the startup check): a probe context, freed at once. */
export function webgl2Available(): boolean {
  if (typeof OffscreenCanvas === "undefined") return false;
  try {
    const gl = new OffscreenCanvas(1, 1).getContext("webgl2", GL_ATTRIBUTES);
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export interface GlContextOptions {
  /** The canvas the context lives on; a new 1 x 1 OffscreenCanvas when absent. */
  canvas?: OffscreenCanvas;
  /** False: a lost context is not restored; the state goes from "lost" to "failed" (the export). */
  recover?: boolean;
}

export class GlContext implements RenderDevice {
  readonly backend = "webgl2";
  readonly canvas: OffscreenCanvas;
  private context: WebGL2RenderingContext | null = null;
  private stateValue: GpuState = "idle";
  private readonly listeners = new Set<(state: GpuState) => void>();
  private readonly recovers: boolean;
  /** Contexts made so far (each restoration counts): texture handles remember theirs. */
  generation = 0;
  restores = 0;
  /** When the last loss was noticed (performance.now). */
  lostAt = 0;
  lastRecoveryMs = 0;

  constructor(options: GlContextOptions = {}) {
    this.canvas = options.canvas ?? new OffscreenCanvas(1, 1);
    this.recovers = options.recover ?? true;
  }

  /** The context while it can draw, else null. */
  get gl(): WebGL2RenderingContext | null {
    return this.stateValue === "ready" ? this.context : null;
  }

  get state(): GpuState {
    return this.stateValue;
  }

  start(): Promise<boolean> {
    if (this.stateValue !== "idle") return Promise.resolve(this.stateValue === "ready");
    let gl: WebGL2RenderingContext | null = null;
    try {
      gl = this.canvas.getContext("webgl2", GL_ATTRIBUTES);
    } catch (error) {
      console.error("[gl] context creation failed", error);
    }
    if (!gl) {
      this.setState("failed");
      return Promise.resolve(false);
    }
    this.context = gl;
    this.canvas.addEventListener("webglcontextlost", this.onLost);
    this.canvas.addEventListener("webglcontextrestored", this.onRestored);
    this.generation += 1;
    this.setState("ready");
    return Promise.resolve(true);
  }

  subscribe(listener: (state: GpuState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Frees the context now (its textures go with it): no recovery. */
  dispose(): void {
    const gl = this.context;
    this.context = null;
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    this.canvas.removeEventListener("webglcontextrestored", this.onRestored);
    this.setState("disposed");
    this.listeners.clear();
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  }

  /** Loses the context as a driver reset would; it comes back `restoreAfterMs` later unless `recover` is false. */
  loseForTest(restoreAfterMs = 100): void {
    const extension = this.context?.getExtension("WEBGL_lose_context");
    if (!extension) return;
    extension.loseContext();
    if (this.recovers) setTimeout(() => extension.restoreContext(), restoreAfterMs);
  }

  private readonly onLost = (event: Event): void => {
    if (this.stateValue !== "ready") return;
    // Without this the browser never restores it.
    if (this.recovers) event.preventDefault();
    console.warn("[gl] context lost");
    this.lostAt = performance.now();
    this.setState("lost");
    if (!this.recovers) this.setState("failed");
  };

  private readonly onRestored = (): void => {
    if (this.stateValue !== "lost") return;
    this.generation += 1;
    this.restores += 1;
    this.lastRecoveryMs = performance.now() - this.lostAt;
    console.info(`[gl] context restored in ${Math.round(this.lastRecoveryMs)} ms`);
    this.setState("ready");
  };

  private setState(state: GpuState): void {
    this.stateValue = state;
    for (const listener of [...this.listeners]) {
      try {
        listener(state);
      } catch (error) {
        console.error("[gl] listener failed", error);
      }
    }
  }
}
