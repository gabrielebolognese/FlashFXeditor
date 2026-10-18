// A backend's device and renderer (Batch 48): the preview's (previewController) and the export
// worker's (ExportRenderer, the same backend as the preview).
import type { BackendRenderer, RenderDevice, RendererBackend } from "./backend.js";
import { GlContext } from "./GlContext.js";
import { GpuDevice } from "./GpuDevice.js";
import { WebGl2Renderer } from "./WebGl2Renderer.js";
import { WebGpuRenderer } from "./WebGpuRenderer.js";

export interface BackendOptions {
  /** False: a lost device fails instead of being replaced (the export). */
  recover?: boolean;
  /** WebGL2: the canvas the context lives on, drawn directly as a canvas target (the export's frame canvas). */
  canvas?: OffscreenCanvas;
}

export function createBackend(backend: RendererBackend, options: BackendOptions = {}): { device: RenderDevice; renderer: BackendRenderer } {
  const recover = options.recover ?? true;
  if (backend === "webgl2") {
    const device = new GlContext({ recover, ...(options.canvas && { canvas: options.canvas }) });
    return { device, renderer: new WebGl2Renderer(device) };
  }
  const device = new GpuDevice({ recover });
  return { device, renderer: new WebGpuRenderer(device) };
}
