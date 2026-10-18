// The app's one renderer (Batch 48): WebGPU or WebGL2, chosen at startup (`chooseBackend`) after the
// services that hold the renderer (frames, images, text rasters, the preview) were created at module
// load. It forwards every call to the chosen backend and relays its events; `device` stands for the
// chosen backend's device (dev stats, dev checks). Before `select` nothing can be drawn or uploaded.
import type { DrawList } from "../compositor/drawList.js";
import type { BackendRenderer, RenderDevice, RendererBackend } from "./backend.js";
import type { GpuState } from "./GpuDevice.js";
import type { CanvasTarget, DeviceEvent, OffscreenTarget, Pane, Renderer, RenderTarget, TextureHandle, TextureOptions, Viewport } from "./renderer.js";

/** WebGPU's default maxTextureDimension2D, until a backend is chosen. */
const DEFAULT_MAX_TEXTURE = 8192;

class SwitchDevice implements RenderDevice {
  chosen: RenderDevice | null = null;
  readonly listeners = new Set<(state: GpuState) => void>();

  get backend(): RendererBackend {
    return this.chosen?.backend ?? "webgpu";
  }

  get state(): GpuState {
    return this.chosen?.state ?? "idle";
  }

  get generation(): number {
    return this.chosen?.generation ?? 0;
  }

  get restores(): number {
    return this.chosen?.restores ?? 0;
  }

  get lastRecoveryMs(): number {
    return this.chosen?.lastRecoveryMs ?? 0;
  }

  subscribe(listener: (state: GpuState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(adapter?: GPUAdapter | null): Promise<boolean> {
    return this.chosen ? this.chosen.start(adapter) : Promise.resolve(false);
  }

  dispose(): void {
    this.chosen?.dispose();
  }

  loseForTest(): void {
    this.chosen?.loseForTest();
  }
}

export class SwitchRenderer implements Renderer {
  private chosen: BackendRenderer | null = null;
  private readonly listeners = new Set<(event: DeviceEvent) => void>();
  private readonly switchDevice = new SwitchDevice();
  /** The chosen backend's device. */
  readonly device: RenderDevice = this.switchDevice;

  /** The backend chosen at startup; null before. */
  get backend(): RendererBackend | null {
    return this.chosen?.backend ?? null;
  }

  /** The chosen backend's renderer (dev checks); null before. */
  get current(): BackendRenderer | null {
    return this.chosen;
  }

  /** Uses `renderer` and its `device` from now on (once). */
  select(renderer: BackendRenderer, device: RenderDevice): void {
    if (this.chosen) throw new Error("The renderer backend is chosen once");
    this.chosen = renderer;
    this.switchDevice.chosen = device;
    renderer.subscribe((event) => {
      for (const listener of [...this.listeners]) listener(event);
    });
    device.subscribe((state) => {
      for (const listener of [...this.switchDevice.listeners]) listener(state);
    });
  }

  get ready(): boolean {
    return this.chosen?.ready ?? false;
  }

  get maxTextureSize(): number {
    return this.chosen?.maxTextureSize ?? DEFAULT_MAX_TEXTURE;
  }

  get textureCounts(): { live: number; bytes: number } {
    return this.chosen?.textureCounts ?? { live: 0, bytes: 0 };
  }

  subscribe(listener: (event: DeviceEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  draw(list: DrawList, target: RenderTarget, viewport?: Viewport): boolean {
    return this.chosen?.draw(list, target, viewport) ?? false;
  }

  drawPanes(panes: readonly Pane[], target: RenderTarget): boolean {
    return this.chosen?.drawPanes(panes, target) ?? false;
  }

  createTexture(width: number, height: number, options?: TextureOptions): TextureHandle {
    return this.require().createTexture(width, height, options);
  }

  uploadVideoFrame(frame: VideoFrame, options?: TextureOptions): TextureHandle {
    if (!this.chosen) frame.close();
    return this.require().uploadVideoFrame(frame, options);
  }

  uploadImageBitmap(bitmap: ImageBitmap | OffscreenCanvas, options?: TextureOptions): TextureHandle {
    return this.require().uploadImageBitmap(bitmap, options);
  }

  resize(target: RenderTarget, width: number, height: number): void {
    this.chosen?.resize(target, width, height);
  }

  createCanvasTarget(canvas: HTMLCanvasElement | OffscreenCanvas): CanvasTarget {
    return this.require().createCanvasTarget(canvas);
  }

  createOffscreenTarget(width: number, height: number): OffscreenTarget {
    return this.require().createOffscreenTarget(width, height);
  }

  readBitmap(target: OffscreenTarget): Promise<ImageBitmap> {
    return this.chosen ? this.chosen.readBitmap(target) : Promise.reject(new Error("The GPU device is not ready"));
  }

  releaseTarget(target: RenderTarget): void {
    this.chosen?.releaseTarget(target);
  }

  releaseCaches(): void {
    this.chosen?.releaseCaches();
  }

  private require(): BackendRenderer {
    if (!this.chosen) throw new Error("The GPU device is not ready");
    return this.chosen;
  }
}
