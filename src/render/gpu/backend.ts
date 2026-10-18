// The rendering backends (spec §3.1, Batch 48): WebGPU, or WebGL2 on machines without WebGPU. The
// backend is chosen once at startup (`chooseBackend`): a WebGPU adapter first, else WebGL2 when it runs
// on the GPU (no major performance caveat: software rendering is no fallback, §1.4). The dev flag
// `?renderer=webgl2` puts WebGL2 first (WebGPU stays the fallback); `?renderer=webgpu` allows WebGPU
// only, as before this batch. The export worker uses the backend the preview chose.
import type { GpuState } from "./GpuDevice.js";
import type { Renderer } from "./renderer.js";

export type RendererBackend = "webgpu" | "webgl2";

/** The GPU device (WebGPU) or context (WebGL2) behind a renderer: its state for the dev stats and the export. */
export interface RenderDevice {
  readonly backend: RendererBackend;
  readonly state: GpuState;
  /** Devices (contexts) made so far: 1 after the start, one more per recovery. */
  readonly generation: number;
  readonly restores: number;
  readonly lastRecoveryMs: number;
  subscribe(listener: (state: GpuState) => void): () => void;
  /** Creates the device (WebGPU: from the startup check's adapter when given). False when it cannot. */
  start(adapter?: GPUAdapter | null): Promise<boolean>;
  /** Frees the device on purpose: no recovery. */
  dispose(): void;
  /** Dev checks: loses the device as a driver reset would (`__editor.gpu.loseForTest()`). */
  loseForTest(): void;
}

/** A backend's renderer: `Renderer` plus its texture counts (dev stats, P13 checks) and caches. */
export interface BackendRenderer extends Renderer {
  readonly backend: RendererBackend;
  /** Textures allocated and not freed (pool frames, images, text rasters, targets, spares). */
  readonly textureCounts: { live: number; bytes: number };
  /** Frees what the renderer keeps for reuse (spare frame textures, blur textures): a closed project leaves nothing on the GPU (P13). */
  releaseCaches(): void;
}

export type BackendChoice = { backend: "webgpu"; adapter: GPUAdapter } | { backend: "webgl2"; adapter: null };

export interface BackendProbe {
  /** The WebGPU adapter; null without WebGPU or a usable GPU. */
  requestAdapter(): Promise<GPUAdapter | null>;
  /** WebGL2 on the GPU (a context without a major performance caveat). */
  webgl2(): boolean;
}

/** The backend the dev flag asks for (`?renderer=webgl2` or `?renderer=webgpu`), else null. */
export function forcedBackend(search: string): RendererBackend | null {
  const value = new URLSearchParams(search).get("renderer");
  return value === "webgl2" || value === "webgpu" ? value : null;
}

/** The backend to render with, or null when the machine has neither (the unsupported screen). */
export async function chooseBackend(forced: RendererBackend | null, probe: BackendProbe): Promise<BackendChoice | null> {
  if (forced === "webgl2" && probe.webgl2()) return { backend: "webgl2", adapter: null };
  const adapter = await probe.requestAdapter();
  if (adapter) return { backend: "webgpu", adapter };
  if (forced === null && probe.webgl2()) return { backend: "webgl2", adapter: null };
  return null;
}
