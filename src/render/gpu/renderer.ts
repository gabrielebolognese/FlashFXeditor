// The rendering backend interface (spec §3.1, §9.4). Callers (preview, export, compositor) talk to a
// `Renderer` only: `WebGpuRenderer`, or `WebGl2Renderer` on machines without WebGPU (Batch 48), chosen
// at startup (backend.ts) behind the app's `SwitchRenderer`.
import type { RGBA } from "../../core/document/types.js";
import type { DrawList } from "../compositor/drawList.js";
import type { Mat3 } from "../mat3.js";

/** A GPU texture owned by the caller (usually through the TexturePool). */
export interface TextureHandle {
  readonly width: number;
  readonly height: number;
  readonly mipLevels: number;
  /** GPU memory in bytes, mip chain included (the pool budget counts these). */
  readonly bytes: number;
  /** False once destroyed, or when the device that owns it was lost. */
  readonly valid: boolean;
  /** Frees the GPU memory now (P13). Safe to call twice. */
  destroy(): void;
}

export interface RenderTarget {
  readonly kind: "canvas" | "offscreen";
  /** Backing size in device pixels. */
  readonly width: number;
  readonly height: number;
}

/** A `<canvas>` (or OffscreenCanvas) presenting what is drawn into it. */
export interface CanvasTarget extends RenderTarget {
  readonly kind: "canvas";
}

/** A texture of any size; `readBitmap` brings its pixels back, and it can be drawn as a layer. */
export interface OffscreenTarget extends RenderTarget {
  readonly kind: "offscreen";
  readonly texture: TextureHandle;
}

export interface Viewport {
  /** Project px -> target px (zoom and pan). Axis-aligned: no rotation. */
  transform: Mat3;
  /** Clear color around the frame (straight alpha). */
  outside: RGBA;
  /** A line just outside the frame edge, `width` target px wide. */
  border: { color: RGBA; width: number } | null;
}

/**
 * One part of a split draw (spec §6.10: the trim preview shows two frames side by side): a list drawn
 * with its own viewport, everything (frame, layers, border) clipped to `bounds` (target px).
 */
export interface Pane {
  list: DrawList;
  viewport: Viewport;
  bounds: { x: number; y: number; width: number; height: number };
}

export type DeviceEvent = "lost" | "ready";

export interface TextureOptions {
  /** Full mip chain (static images): no aliasing when drawn small. */
  mipmaps?: boolean;
  label?: string;
  /**
   * Video frames: a frame whose long edge is larger is scaled down to it on the GPU while uploading
   * (the preview of a 1080x1920 project never draws more than 1920 px of a 4K frame).
   */
  maxSize?: number;
}

export interface Renderer {
  /** Largest texture side the device accepts. */
  readonly maxTextureSize: number;
  /** False while the device is lost or not created yet; `draw` then draws nothing. */
  readonly ready: boolean;
  /**
   * Renders `list` into `target` in one pass: clear to `viewport.outside`, the frame background, the
   * layers clipped to the frame, the border. Without a viewport the frame fills the target.
   * Returns false when nothing could be drawn (device not ready).
   */
  draw(list: DrawList, target: RenderTarget, viewport?: Viewport): boolean;
  /**
   * Renders several panes into `target` in one pass: clear to the first pane's `outside` color, then
   * each pane as `draw` would, clipped to its bounds. Returns false when nothing could be drawn.
   */
  drawPanes(panes: readonly Pane[], target: RenderTarget): boolean;
  /** An empty texture that can be rendered into and sampled. */
  createTexture(width: number, height: number, options?: TextureOptions): TextureHandle;
  /** Copies the frame into a new texture and closes the frame at once (P5, P13). */
  uploadVideoFrame(frame: VideoFrame, options?: TextureOptions): TextureHandle;
  /**
   * Copies the bitmap (or a 2D canvas: text rasters) into a new texture (mipmapped by default). The
   * caller still owns the source.
   */
  uploadImageBitmap(bitmap: ImageBitmap | OffscreenCanvas, options?: TextureOptions): TextureHandle;
  /** Sets the backing size of a target in device pixels (a no-op when unchanged). */
  resize(target: RenderTarget, width: number, height: number): void;
  createCanvasTarget(canvas: HTMLCanvasElement | OffscreenCanvas): CanvasTarget;
  createOffscreenTarget(width: number, height: number): OffscreenTarget;
  /** The target's pixels as a bitmap with straight alpha. */
  readBitmap(target: OffscreenTarget): Promise<ImageBitmap>;
  /** Frees a target (an offscreen texture, or a canvas configuration). */
  releaseTarget(target: RenderTarget): void;
  /** "lost": every texture handle became invalid. "ready": a device (the first or a replacement) can draw; re-upload and redraw. */
  subscribe(listener: (event: DeviceEvent) => void): () => void;
}
