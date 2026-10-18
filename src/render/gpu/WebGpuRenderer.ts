// The WebGPU backend of `Renderer` (spec §3.1, §9.3, §9.4). Draws a draw list (or several side by
// side, `drawPanes`) in one render pass with premultiplied alpha: a textured-quad pipeline, a
// two-texture dissolve pipeline (Batch 36) and a solid-color pipeline. The records (one per quad, with
// its scissor) come from `DrawRecords`, shared with the WebGL2 backend (Batch 48). Per-layer uniforms
// live in one buffer bound with dynamic offsets; each layer's matrix already maps to target px (its
// pane's viewport applied), and the view uniform maps target px to clip space. Each texture gets its
// bind group once, at creation, so a frame creates no bind groups. Everything GPU-side is rebuilt when
// GpuDevice replaces a lost device; texture handles of the old device turn invalid and their owners
// re-upload on "ready".
// A textured layer with a blur (a text's blurIn, spec §10.4) is blurred first, in the same command
// encoder: two passes of a separable Gaussian (horizontal into one pooled texture, vertical into
// another, the radius capped at MAX_BLUR_SIGMA), then drawn from the second with its quad grown by
// the blur's reach. The pooled textures are reused from draw to draw (text rasters are small).
import type { RGBA } from "../../core/document/types.js";
import type { DrawList } from "../compositor/drawList.js";
import { IDENTITY, mutableIdentity, setMat, type Mat3, type MutableMat3 } from "../mat3.js";
import type { BackendRenderer } from "./backend.js";
import { blurRegionInto, DrawRecords, premultipliedInto, setRect, showBlurred, type BlurRegion, type RecordKind } from "./drawRecords.js";
import { fitWithin } from "./fitWithin.js";
import type { GpuDevice } from "./GpuDevice.js";
import { isHdrColorSpace, toneMapToCanvas } from "./hdr.js";
import { layerFloats, LAYER_SIZE, LAYER_STRIDE, packLayer, packMat3, pixelsToClipInto, VIEW_SIZE } from "./layerUniforms.js";
import { generateMipmaps, mipLevelCount, textureBytes, type MipGenerator } from "./mipmaps.js";
import { paddedBytesPerRow, unpadAndUnpremultiply } from "./readback.js";
import type { CanvasTarget, DeviceEvent, OffscreenTarget, Pane, RenderTarget, TextureHandle, TextureOptions, Viewport } from "./renderer.js";
import { BLUR_WGSL, DISSOLVE_WGSL, MIPMAP_WGSL, SCALE_WGSL, SOLID_WGSL, TEXTURED_WGSL } from "./shaders.js";

/** Textures, offscreen targets and mip levels are rgba8 (spec §9.3); canvases use the preferred format. */
const TEXTURE_FORMAT: GPUTextureFormat = "rgba8unorm";
const TRANSPARENT: RGBA = { r: 0, g: 0, b: 0, a: 0 };
const DEFAULT_MAX_TEXTURE = 8192;
const INITIAL_LAYERS = 64;
/** Bytes the blur shader reads per pass (3 vec4), at the layers' 256-byte stride. */
const BLUR_SIZE = 48;
/** Blur textures are made in steps of this many px, so a blur of a slightly other size reuses one. */
export const BLUR_STEP = 64;
/** Draws a pooled blur texture stays unused before it is freed. */
export const BLUR_KEEP_DRAWS = 120;

type PipelineKind = RecordKind;

interface Pipelines {
  textured: GPURenderPipeline;
  dissolve: GPURenderPipeline;
  solid: GPURenderPipeline;
}

/** Everything that belongs to one GPUDevice. */
interface DeviceResources {
  device: GPUDevice;
  generation: number;
  sampler: GPUSampler;
  groupLayout: GPUBindGroupLayout;
  textureLayout: GPUBindGroupLayout;
  layouts: Record<PipelineKind, GPUPipelineLayout>;
  modules: Record<PipelineKind, GPUShaderModule>;
  pipelines: Map<GPUTextureFormat, Pipelines>;
  mips: MipGenerator;
  /** Draws a video frame into a smaller texture (`TextureOptions.maxSize`). */
  scaler: { pipeline: GPURenderPipeline; layout: GPUBindGroupLayout; sampler: GPUSampler };
  /** The blur passes: pipeline, uniforms (one 256-byte slot per pass), pooled textures. */
  blur: { pipeline: GPURenderPipeline; layout: GPUBindGroupLayout; buffer: GPUBuffer; capacity: number; group: GPUBindGroup; pool: { texture: GpuTexture; used: number }[] };
  viewBuffer: GPUBuffer;
  layerBuffer: GPUBuffer;
  layerCapacity: number;
  group: GPUBindGroup;
}

/** Takes a destroyed handle's GPU texture back for reuse; false when it does not (the texture is destroyed). */
type Recycle = (texture: GpuTexture) => boolean;

/** GPU textures the renderer allocated and has not destroyed on the current device (dev stats, P13 leak checks). */
interface TextureCounts {
  generation: number;
  live: number;
  bytes: number;
}

class GpuTexture implements TextureHandle {
  private destroyed = false;

  constructor(
    readonly texture: GPUTexture,
    /** The view the bind group samples; also the render attachment of a scaled upload. */
    readonly view: GPUTextureView,
    readonly bindGroup: GPUBindGroup,
    readonly bytes: number,
    readonly generation: number,
    private readonly currentGeneration: () => number,
    private readonly recycle: Recycle | null = null,
    private readonly counts: TextureCounts | null = null,
  ) {}

  get width(): number {
    return this.texture.width;
  }

  get height(): number {
    return this.texture.height;
  }

  get mipLevels(): number {
    return this.texture.mipLevelCount;
  }

  get valid(): boolean {
    return !this.destroyed && this.generation === this.currentGeneration();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.recycle?.(this)) return;
    this.texture.destroy();
    if (this.counts && this.counts.generation === this.generation) {
      this.counts.live -= 1;
      this.counts.bytes -= this.bytes;
    }
  }
}

/** A video-frame texture left by a destroyed handle, kept for the next upload of the same size. */
interface SpareTexture {
  texture: GPUTexture;
  view: GPUTextureView;
  bindGroup: GPUBindGroup;
  bytes: number;
  generation: number;
}

/**
 * Spare video-frame textures kept at most. Uploads into a recycled texture instead of a new one per
 * frame: Batch 06 measured hardware decoding slower with a create + destroy per frame (1080p H.264
 * 8.5-11.5 ms/frame against 7.3 with one reused texture).
 */
const MAX_SPARE_FRAMES = 4;

class GpuCanvasTarget implements CanvasTarget {
  readonly kind = "canvas";
  /** Device generation the context is configured for (0: not configured). */
  configured = 0;

  constructor(
    readonly canvas: HTMLCanvasElement | OffscreenCanvas,
    readonly context: GPUCanvasContext,
    readonly format: GPUTextureFormat,
  ) {}

  get width(): number {
    return this.canvas.width;
  }

  get height(): number {
    return this.canvas.height;
  }
}

class GpuOffscreenTarget implements OffscreenTarget {
  readonly kind = "offscreen";

  constructor(public texture: GpuTexture) {}

  get width(): number {
    return this.texture.width;
  }

  get height(): number {
    return this.texture.height;
  }
}

export class WebGpuRenderer implements BackendRenderer {
  readonly backend = "webgpu";
  private resources: DeviceResources | null = null;
  private readonly canvases = new Set<GpuCanvasTarget>();
  private readonly listeners = new Set<(event: DeviceEvent) => void>();
  private readonly spares: SpareTexture[] = [];
  /** The color-managed 2D canvas HDR frames are drawn through (see hdr.ts), kept between uploads. */
  private hdrCanvas: OffscreenCanvas | null = null;
  private readonly counts: TextureCounts = { generation: -1, live: 0, bytes: 0 };
  private layerData = new Float32Array(layerFloats(INITIAL_LAYERS));
  private readonly viewData = new Float32Array(VIEW_SIZE / 4);
  private readonly canvasFormat: GPUTextureFormat;
  // Scratch state of `draw`, reused so a frame allocates nothing on our side (the WebGPU calls do).
  private readonly records = new DrawRecords<GpuTexture>((texture): texture is GpuTexture => texture instanceof GpuTexture && texture.valid);
  private readonly fillView: Viewport & { transform: MutableMat3 } = { transform: mutableIdentity(), outside: TRANSPARENT, border: null };
  /** The one pane of `draw`. */
  private readonly fillPane: Pane & { bounds: { x: number; y: number; width: number; height: number } } = { list: { width: 0, height: 0, background: TRANSPARENT, layers: [] }, viewport: this.fillView, bounds: { x: 0, y: 0, width: 0, height: 0 } };
  private readonly fillPanes: Pane[] = [this.fillPane];
  private readonly toClip = mutableIdentity();
  private readonly lastScissor = { x: 0, y: 0, width: 0, height: 0 };
  private readonly blurRegion: BlurRegion = { x: 0, y: 0, width: 0, height: 0, sigma: 0, reach: 0 };
  private readonly clearValue = { r: 0, g: 0, b: 0, a: 0 };
  private readonly dynamicOffset = new Uint32Array(1);
  private blurData = new Float32Array(LAYER_STRIDE / 4);
  /** Draws so far (the blur pool's clock). */
  private draws = 0;
  /** The pass descriptor, created on the first draw; each draw only swaps the attachment's view. */
  private pass: { attachment: GPURenderPassColorAttachment; descriptor: GPURenderPassDescriptor } | null = null;

  constructor(private readonly gpu: GpuDevice) {
    this.canvasFormat = typeof navigator !== "undefined" && navigator.gpu ? navigator.gpu.getPreferredCanvasFormat() : "bgra8unorm";
    gpu.subscribe((state, device) => {
      const had = this.resources !== null;
      this.resources = null;
      for (const spare of this.spares.splice(0)) spare.texture.destroy();
      // Textures of the old device are gone with it.
      Object.assign(this.counts, { generation: gpu.generation, live: 0, bytes: 0 });
      if (state === "ready" && device) {
        this.resources = this.build(device, gpu.generation);
        for (const target of this.canvases) this.configure(target);
        this.emit("ready");
      } else if (had) {
        this.emit("lost");
      }
    });
  }

  get ready(): boolean {
    return this.resources !== null;
  }

  /** GPU textures allocated and not destroyed (pool frames, images, text rasters, targets, spares). */
  get textureCounts(): { live: number; bytes: number } {
    return { live: this.counts.live, bytes: this.counts.bytes };
  }

  get maxTextureSize(): number {
    return this.resources?.device.limits.maxTextureDimension2D ?? DEFAULT_MAX_TEXTURE;
  }

  subscribe(listener: (event: DeviceEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  createTexture(width: number, height: number, options: TextureOptions = {}): TextureHandle {
    return this.newTexture(this.require(), width, height, options);
  }

  uploadImageBitmap(bitmap: ImageBitmap | OffscreenCanvas, options: TextureOptions = {}): TextureHandle {
    const res = this.require();
    return this.copyIn(res, bitmap, bitmap.width, bitmap.height, { mipmaps: true, ...options });
  }

  uploadVideoFrame(frame: VideoFrame, options: TextureOptions = {}): TextureHandle {
    try {
      const res = this.require();
      const { width, height } = fitWithin(frame.displayWidth, frame.displayHeight, options.maxSize);
      const into = this.spareFor(res, width, height);
      const texture = isHdrColorSpace(frame.colorSpace)
        ? this.toneMapIn(res, frame, width, height, options, into)
        : width === frame.displayWidth && height === frame.displayHeight
          ? this.copyIn(res, frame, width, height, { mipmaps: false, ...options }, into, this.recycleFrame)
          : this.scaleIn(res, frame, width, height, options, into);
      // Sends the copy now rather than with the next draw: until it runs, the decoder cannot reuse
      // the frame's picture buffer (measured: hardware decoding 25-35% faster with uploads in flight).
      res.device.queue.submit([]);
      return texture;
    } finally {
      frame.close();
    }
  }

  /**
   * A texture holding `source`: `into` (a recycled one) or a new one. A failed copy (a closed source)
   * destroys the texture before rethrowing (P13).
   */
  private copyIn(res: DeviceResources, source: ImageBitmap | OffscreenCanvas | VideoFrame, width: number, height: number, options: TextureOptions, into: GpuTexture | null = null, recycle: Recycle | null = null): GpuTexture {
    const texture = into ?? this.newTexture(res, width, height, options, recycle);
    try {
      res.device.queue.copyExternalImageToTexture({ source }, { texture: texture.texture, premultipliedAlpha: true }, [width, height]);
      if (texture.mipLevels > 1) generateMipmaps(res.device, res.mips, texture.texture);
    } catch (error) {
      texture.destroy();
      throw error;
    }
    return texture;
  }

  createCanvasTarget(canvas: HTMLCanvasElement | OffscreenCanvas): CanvasTarget {
    const context = canvas.getContext("webgpu");
    if (!context) throw new Error("This canvas has no WebGPU context");
    const target = new GpuCanvasTarget(canvas, context, this.canvasFormat);
    this.canvases.add(target);
    this.configure(target);
    return target;
  }

  createOffscreenTarget(width: number, height: number): OffscreenTarget {
    return new GpuOffscreenTarget(this.newTexture(this.require(), width, height, { label: "offscreen target" }));
  }

  resize(target: RenderTarget, width: number, height: number): void {
    const w = this.clampSize(width);
    const h = this.clampSize(height);
    if (target instanceof GpuCanvasTarget) {
      if (target.canvas.width !== w) target.canvas.width = w;
      if (target.canvas.height !== h) target.canvas.height = h;
    } else if (target instanceof GpuOffscreenTarget) {
      if (target.width === w && target.height === h && target.texture.valid) return;
      target.texture.destroy();
      target.texture = this.newTexture(this.require(), w, h, { label: "offscreen target" });
    }
  }

  /**
   * Destroys the textures kept for reuse: spare video-frame textures and pooled blur passes. A closed
   * project leaves nothing on the GPU (P13); the next draws allocate again.
   */
  releaseCaches(): void {
    for (const spare of this.spares.splice(0)) {
      spare.texture.destroy();
      if (spare.generation === this.counts.generation) {
        this.counts.live -= 1;
        this.counts.bytes -= spare.bytes;
      }
    }
    const pool = this.resources?.blur.pool;
    if (pool) for (const entry of pool.splice(0)) entry.texture.destroy();
    this.hdrCanvas = null;
  }

  releaseTarget(target: RenderTarget): void {
    if (target instanceof GpuCanvasTarget) {
      this.canvases.delete(target);
      if (target.configured !== 0) target.context.unconfigure();
      target.configured = 0;
    } else if (target instanceof GpuOffscreenTarget) {
      target.texture.destroy();
    }
  }

  draw(list: DrawList, target: RenderTarget, viewport?: Viewport): boolean {
    if (list.width < 1 || list.height < 1) return false;
    const pane = this.fillPane;
    pane.list = list;
    if (viewport) pane.viewport = viewport;
    else {
      setMat(this.fillView.transform, target.width / list.width, 0, 0, target.height / list.height, 0, 0);
      pane.viewport = this.fillView;
    }
    pane.bounds.width = target.width;
    pane.bounds.height = target.height;
    return this.drawPanes(this.fillPanes, target);
  }

  drawPanes(panes: readonly Pane[], target: RenderTarget): boolean {
    const res = this.resources;
    const first = panes[0];
    if (!res || !first || target.width < 1 || target.height < 1) return false;
    let drawable = false;
    for (const pane of panes) if (pane.list.width >= 1 && pane.list.height >= 1) drawable = true;
    if (!drawable) return false;

    let attachment: GPUTextureView;
    let format: GPUTextureFormat;
    if (target instanceof GpuCanvasTarget) {
      if (target.configured !== res.generation) this.configure(target);
      attachment = target.context.getCurrentTexture().createView();
      format = target.format;
    } else if (target instanceof GpuOffscreenTarget) {
      if (!target.texture.valid) this.resize(target, target.width, target.height);
      attachment = target.texture.texture.createView({ baseMipLevel: 0, mipLevelCount: 1 });
      format = TEXTURE_FORMAT;
    } else {
      return false;
    }

    const count = this.records.build(panes, target.width, target.height);
    const encoder = res.device.createCommandEncoder({ label: "draw list" });
    this.draws += 1;
    this.blurRecords(res, encoder, count);
    this.writeUniforms(res, count, pixelsToClipInto(this.toClip, target.width, target.height, IDENTITY));

    const pipelines = this.pipelines(res, format);
    premultipliedInto(this.clearValue, first.viewport.outside);
    if (this.pass) {
      this.pass.attachment.view = attachment;
    } else {
      const created: GPURenderPassColorAttachment = { view: attachment, loadOp: "clear", storeOp: "store", clearValue: this.clearValue };
      this.pass = { attachment: created, descriptor: { colorAttachments: [created] } };
    }
    const pass = encoder.beginRenderPass(this.pass.descriptor);
    const offset = this.dynamicOffset;
    // The pass starts with the whole target as its scissor.
    const last = setRect(this.lastScissor, 0, 0, target.width, target.height);
    for (let index = 0; index < count; index++) {
      const record = this.records.at(index);
      const { scissor } = record;
      if (scissor.x !== last.x || scissor.y !== last.y || scissor.width !== last.width || scissor.height !== last.height) {
        pass.setScissorRect(scissor.x, scissor.y, scissor.width, scissor.height);
        setRect(last, scissor.x, scissor.y, scissor.width, scissor.height);
      }
      pass.setPipeline(pipelines[record.kind]);
      offset[0] = index * LAYER_STRIDE;
      pass.setBindGroup(0, res.group, offset, 0, 1);
      if (record.texture0) pass.setBindGroup(1, record.texture0.bindGroup);
      if (record.texture1) pass.setBindGroup(2, record.texture1.bindGroup);
      pass.draw(4);
    }
    pass.end();
    res.device.queue.submit([encoder.finish()]);
    return true;
  }

  /**
   * Blurs the source of every blurred record into a pooled texture (two passes encoded before the
   * draw's own) and points the record at it: the quad grown by the blur's reach on each side.
   */
  private blurRecords(res: DeviceResources, encoder: GPUCommandEncoder, count: number): void {
    const blur = res.blur;
    let passes = 0;
    for (let index = 0; index < count; index++) {
      const record = this.records.at(index);
      const region = blurRegionInto(this.blurRegion, record);
      const source = record.texture0;
      if (!region || !source) continue;
      const { x, y, width, height, sigma, reach } = region;
      const w = width + 2 * reach;
      const h = height + 2 * reach;
      const across = this.blurTexture(res, w, h);
      const down = this.blurTexture(res, w, h);
      if (passes + 2 > blur.capacity) this.growBlur(res, passes + 2);
      this.writeBlurPass(passes, x, y, width, height, 1, 0, sigma, reach, reach);
      this.blurPass(res, encoder, passes, source, across, w, h);
      this.writeBlurPass(passes + 1, 0, 0, w, h, 0, 1, sigma, reach, 0);
      this.blurPass(res, encoder, passes + 1, across, down, w, h);
      passes += 2;
      showBlurred(record, region, down, this.blurGrow);
    }
    if (passes > 0) res.device.queue.writeBuffer(blur.buffer, 0, this.blurData.buffer, 0, passes * LAYER_STRIDE);
    // Textures no draw used for a while go.
    for (let i = blur.pool.length - 1; i >= 0; i--) {
      const entry = blur.pool[i] as { texture: GpuTexture; used: number };
      if (this.draws - entry.used > BLUR_KEEP_DRAWS) {
        entry.texture.destroy();
        blur.pool.splice(i, 1);
      }
    }
  }

  private readonly blurGrow = mutableIdentity();

  /** A pooled texture at least `width` x `height` not used yet in this draw. */
  private blurTexture(res: DeviceResources, width: number, height: number): GpuTexture {
    const pool = res.blur.pool;
    for (const entry of pool) {
      const { texture } = entry;
      if (entry.used === this.draws || texture.width < width || texture.height < height || texture.width > 2 * width + BLUR_STEP || texture.height > 2 * height + BLUR_STEP) continue;
      entry.used = this.draws;
      return texture;
    }
    const step = (size: number) => Math.min(this.maxTextureSize, Math.ceil(size / BLUR_STEP) * BLUR_STEP);
    const texture = this.newTexture(res, step(width), step(height), { label: "blur" });
    pool.push({ texture, used: this.draws });
    return texture;
  }

  private writeBlurPass(index: number, x: number, y: number, width: number, height: number, dirX: number, dirY: number, sigma: number, reach: number, pad: number): void {
    const o = (index * LAYER_STRIDE) / 4;
    if (this.blurData.length < o + 12) {
      const grown = new Float32Array(Math.max(this.blurData.length * 2, o + LAYER_STRIDE / 4));
      grown.set(this.blurData);
      this.blurData = grown;
    }
    const d = this.blurData;
    d[o] = x;
    d[o + 1] = y;
    d[o + 2] = width;
    d[o + 3] = height;
    d[o + 4] = dirX;
    d[o + 5] = dirY;
    d[o + 6] = sigma;
    d[o + 7] = reach;
    d[o + 8] = pad;
    d[o + 9] = pad;
  }

  private blurPass(res: DeviceResources, encoder: GPUCommandEncoder, index: number, source: GpuTexture, target: GpuTexture, width: number, height: number): void {
    const pass = encoder.beginRenderPass({ label: "blur", colorAttachments: [{ view: target.view, loadOp: "clear", storeOp: "store", clearValue: [0, 0, 0, 0] }] });
    pass.setPipeline(res.blur.pipeline);
    pass.setScissorRect(0, 0, Math.min(width, target.width), Math.min(height, target.height));
    this.dynamicOffset[0] = index * LAYER_STRIDE;
    pass.setBindGroup(0, res.blur.group, this.dynamicOffset, 0, 1);
    pass.setBindGroup(1, source.bindGroup);
    pass.draw(3);
    pass.end();
  }

  private growBlur(res: DeviceResources, count: number): void {
    const blur = res.blur;
    let capacity = blur.capacity;
    while (capacity < count) capacity *= 2;
    blur.buffer.destroy();
    blur.buffer = res.device.createBuffer({ label: "blur", size: capacity * LAYER_STRIDE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    blur.capacity = capacity;
    blur.group = res.device.createBindGroup({ label: "blur", layout: blur.layout, entries: [{ binding: 0, resource: { buffer: blur.buffer, size: BLUR_SIZE } }] });
  }

  async readBitmap(target: OffscreenTarget): Promise<ImageBitmap> {
    const res = this.require();
    if (!(target instanceof GpuOffscreenTarget) || !target.texture.valid) throw new Error("The render target is not valid on this device");
    const { width, height } = target;
    const bytesPerRow = paddedBytesPerRow(width);
    const buffer = res.device.createBuffer({ label: "readback", size: bytesPerRow * height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    try {
      const encoder = res.device.createCommandEncoder({ label: "readback" });
      encoder.copyTextureToBuffer({ texture: target.texture.texture }, { buffer, bytesPerRow }, [width, height]);
      res.device.queue.submit([encoder.finish()]);
      await buffer.mapAsync(GPUMapMode.READ);
      const pixels = unpadAndUnpremultiply(new Uint8Array(buffer.getMappedRange()), width, height, bytesPerRow);
      buffer.unmap();
      return await createImageBitmap(new ImageData(pixels, width, height), { premultiplyAlpha: "none" });
    } finally {
      buffer.destroy();
    }
  }

  private emit(event: DeviceEvent): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch (error) {
        console.error(`[gpu] ${event} listener failed`, error);
      }
    }
  }

  private require(): DeviceResources {
    if (!this.resources) throw new Error("The GPU device is not ready");
    return this.resources;
  }

  private clampSize(size: number): number {
    return Math.min(this.maxTextureSize, Math.max(1, Math.round(size)));
  }

  private configure(target: GpuCanvasTarget): void {
    const res = this.resources;
    if (!res) return;
    target.context.configure({ device: res.device, format: target.format, alphaMode: "opaque" });
    target.configured = res.generation;
  }

  /**
   * A `width` x `height` texture showing the whole frame: the frame is sampled as decoded (an external
   * texture) and drawn once, which costs far less than copying it at full size (4K HEVC on an RDNA2
   * GPU: 70 decoded frames/s scaled to 1080p, 56 copied at 4K, 103 decoded and dropped).
   */
  private scaleIn(res: DeviceResources, frame: VideoFrame, width: number, height: number, options: TextureOptions, into: GpuTexture | null): GpuTexture {
    const texture = into ?? this.newTexture(res, width, height, { ...options, mipmaps: false }, this.recycleFrame);
    try {
      const { scaler, device } = res;
      const source = device.importExternalTexture({ source: frame });
      const bindGroup = device.createBindGroup({
        layout: scaler.layout,
        entries: [
          { binding: 0, resource: scaler.sampler },
          { binding: 1, resource: source },
        ],
      });
      const encoder = device.createCommandEncoder({ label: "scale frame" });
      const pass = encoder.beginRenderPass({ colorAttachments: [{ view: texture.view, loadOp: "clear", storeOp: "store", clearValue: [0, 0, 0, 1] }] });
      pass.setPipeline(scaler.pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3);
      pass.end();
      // Submitted before the frame is closed: the queued work keeps the picture alive.
      device.queue.submit([encoder.finish()]);
    } catch (error) {
      texture.destroy();
      throw error;
    }
    return texture;
  }

  /**
   * An HDR frame (HLG, PQ, BT.2020) at `width` x `height`: drawn into a color-managed 2D canvas, which
   * tone maps it to SDR as a <video> element shows it, and the canvas uploaded. The GPU paths would
   * show it washed out (hdr.ts, Batch 47).
   */
  private toneMapIn(res: DeviceResources, frame: VideoFrame, width: number, height: number, options: TextureOptions, into: GpuTexture | null): GpuTexture {
    let canvas: OffscreenCanvas;
    try {
      canvas = this.hdrCanvas = toneMapToCanvas(this.hdrCanvas, frame, this.clampSize(width), this.clampSize(height));
    } catch (error) {
      into?.destroy();
      throw error;
    }
    return this.copyIn(res, canvas, canvas.width, canvas.height, { mipmaps: false, ...options }, into, this.recycleFrame);
  }

  /** A spare video-frame texture of this size, wrapped in a new handle; null when there is none. */
  private spareFor(res: DeviceResources, width: number, height: number): GpuTexture | null {
    const w = this.clampSize(width);
    const h = this.clampSize(height);
    const at = this.spares.findIndex((spare) => spare.generation === res.generation && spare.texture.width === w && spare.texture.height === h);
    if (at === -1) return null;
    const spare = this.spares.splice(at, 1)[0] as SpareTexture;
    return new GpuTexture(spare.texture, spare.view, spare.bindGroup, spare.bytes, res.generation, () => this.resources?.generation ?? -1, this.recycleFrame, this.counts);
  }

  /** A destroyed video-frame handle gives its texture back, up to MAX_SPARE_FRAMES of the current device. */
  private readonly recycleFrame = (texture: GpuTexture): boolean => {
    if (texture.generation !== this.resources?.generation || this.spares.length >= MAX_SPARE_FRAMES) return false;
    this.spares.push({ texture: texture.texture, view: texture.view, bindGroup: texture.bindGroup, bytes: texture.bytes, generation: texture.generation });
    return true;
  };

  private newTexture(res: DeviceResources, width: number, height: number, options: TextureOptions, recycle: Recycle | null = null): GpuTexture {
    const w = this.clampSize(width);
    const h = this.clampSize(height);
    const levels = options.mipmaps ? mipLevelCount(w, h) : 1;
    const texture = res.device.createTexture({
      label: options.label ?? "texture",
      size: [w, h],
      format: TEXTURE_FORMAT,
      mipLevelCount: levels,
      // copyExternalImageToTexture and mip generation need RENDER_ATTACHMENT; readback needs COPY_SRC.
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    const view = texture.createView();
    const bindGroup = res.device.createBindGroup({
      label: options.label ?? "texture",
      layout: res.textureLayout,
      entries: [
        { binding: 0, resource: res.sampler },
        { binding: 1, resource: view },
      ],
    });
    const bytes = textureBytes(w, h, levels);
    if (this.counts.generation === res.generation) {
      this.counts.live += 1;
      this.counts.bytes += bytes;
    }
    return new GpuTexture(texture, view, bindGroup, bytes, res.generation, () => this.resources?.generation ?? -1, recycle, this.counts);
  }

  private writeUniforms(res: DeviceResources, count: number, projectToClip: Mat3): void {
    if (count > res.layerCapacity) this.growLayers(res, count);
    if (this.layerData.length < layerFloats(count)) this.layerData = new Float32Array(layerFloats(res.layerCapacity));
    for (let index = 0; index < count; index++) packLayer(this.layerData, index, this.records.at(index).uniform);
    res.device.queue.writeBuffer(res.layerBuffer, 0, this.layerData.buffer, 0, count * LAYER_STRIDE);
    packMat3(this.viewData, 0, projectToClip);
    res.device.queue.writeBuffer(res.viewBuffer, 0, this.viewData);
  }

  private growLayers(res: DeviceResources, count: number): void {
    let capacity = res.layerCapacity;
    while (capacity < count) capacity *= 2;
    res.layerBuffer.destroy();
    res.layerBuffer = layerBuffer(res.device, capacity);
    res.layerCapacity = capacity;
    res.group = groupBindGroup(res);
  }

  private pipelines(res: DeviceResources, format: GPUTextureFormat): Pipelines {
    let pipelines = res.pipelines.get(format);
    if (!pipelines) {
      const make = (kind: PipelineKind) =>
        res.device.createRenderPipeline({
          label: `${kind} ${format}`,
          layout: res.layouts[kind],
          vertex: { module: res.modules[kind], entryPoint: "vs" },
          fragment: {
            module: res.modules[kind],
            entryPoint: "fs",
            targets: [{ format, blend: PREMULTIPLIED_BLEND }],
          },
          primitive: { topology: "triangle-strip" },
        });
      pipelines = { textured: make("textured"), dissolve: make("dissolve"), solid: make("solid") };
      res.pipelines.set(format, pipelines);
    }
    return pipelines;
  }

  private build(device: GPUDevice, generation: number): DeviceResources {
    const module = (label: string, code: string) => {
      const shader = device.createShaderModule({ label, code });
      void shader.getCompilationInfo().then((info) => {
        for (const message of info.messages) if (message.type === "error") console.error(`[gpu] ${label} shader: ${message.message} (line ${message.lineNum})`);
      });
      return shader;
    };
    const groupLayout = device.createBindGroupLayout({
      label: "view + layer",
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform", minBindingSize: VIEW_SIZE } },
        { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform", hasDynamicOffset: true, minBindingSize: LAYER_SIZE } },
      ],
    });
    const textureLayout = device.createBindGroupLayout({
      label: "texture",
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
      ],
    });
    const layout = (label: string, groups: GPUBindGroupLayout[]) => device.createPipelineLayout({ label, bindGroupLayouts: groups });
    const mipLayout = device.createBindGroupLayout({
      label: "mip source",
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
      ],
    });
    const mipModule = module("mipmap", MIPMAP_WGSL);
    const mips: MipGenerator = {
      layout: mipLayout,
      sampler: device.createSampler({ label: "mip", minFilter: "linear", magFilter: "linear" }),
      pipeline: device.createRenderPipeline({
        label: "mipmap",
        layout: layout("mipmap", [mipLayout]),
        vertex: { module: mipModule, entryPoint: "vs" },
        fragment: { module: mipModule, entryPoint: "fs", targets: [{ format: TEXTURE_FORMAT }] },
        primitive: { topology: "triangle-list" },
      }),
    };
    const scaleLayout = device.createBindGroupLayout({
      label: "scale source",
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, externalTexture: {} },
      ],
    });
    const scaleModule = module("scale", SCALE_WGSL);
    const scaler = {
      layout: scaleLayout,
      sampler: device.createSampler({ label: "scale", minFilter: "linear", magFilter: "linear" }),
      pipeline: device.createRenderPipeline({
        label: "scale frame",
        layout: layout("scale", [scaleLayout]),
        vertex: { module: scaleModule, entryPoint: "vs" },
        fragment: { module: scaleModule, entryPoint: "fs", targets: [{ format: TEXTURE_FORMAT }] },
        primitive: { topology: "triangle-list" },
      }),
    };
    const blurLayout = device.createBindGroupLayout({
      label: "blur",
      entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform", hasDynamicOffset: true, minBindingSize: BLUR_SIZE } }],
    });
    const blurModule = module("blur", BLUR_WGSL);
    const blurBuffer = device.createBuffer({ label: "blur", size: 8 * LAYER_STRIDE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const blur = {
      layout: blurLayout,
      buffer: blurBuffer,
      capacity: 8,
      group: device.createBindGroup({ label: "blur", layout: blurLayout, entries: [{ binding: 0, resource: { buffer: blurBuffer, size: BLUR_SIZE } }] }),
      pool: [],
      pipeline: device.createRenderPipeline({
        label: "blur",
        layout: layout("blur", [blurLayout, textureLayout]),
        vertex: { module: blurModule, entryPoint: "vs" },
        fragment: { module: blurModule, entryPoint: "fs", targets: [{ format: TEXTURE_FORMAT }] },
        primitive: { topology: "triangle-list" },
      }),
    };
    const partial = {
      device,
      generation,
      sampler: device.createSampler({ label: "layer", minFilter: "linear", magFilter: "linear", mipmapFilter: "linear", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" }),
      groupLayout,
      textureLayout,
      layouts: {
        textured: layout("textured", [groupLayout, textureLayout]),
        dissolve: layout("dissolve", [groupLayout, textureLayout, textureLayout]),
        solid: layout("solid", [groupLayout]),
      },
      modules: { textured: module("textured", TEXTURED_WGSL), dissolve: module("dissolve", DISSOLVE_WGSL), solid: module("solid", SOLID_WGSL) },
      pipelines: new Map<GPUTextureFormat, Pipelines>(),
      mips,
      scaler,
      blur,
      viewBuffer: device.createBuffer({ label: "view", size: VIEW_SIZE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }),
      layerBuffer: layerBuffer(device, INITIAL_LAYERS),
      layerCapacity: INITIAL_LAYERS,
    };
    const resources = { ...partial, group: groupBindGroup(partial) };
    // Compile the canvas and offscreen pipelines now rather than on the first frame.
    this.pipelines(resources, this.canvasFormat);
    this.pipelines(resources, TEXTURE_FORMAT);
    return resources;
  }
}

const PREMULTIPLIED_BLEND: GPUBlendState = {
  color: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
  alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
};

function layerBuffer(device: GPUDevice, capacity: number): GPUBuffer {
  return device.createBuffer({ label: "layers", size: capacity * LAYER_STRIDE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
}

function groupBindGroup(res: Pick<DeviceResources, "device" | "groupLayout" | "viewBuffer" | "layerBuffer">): GPUBindGroup {
  return res.device.createBindGroup({
    label: "view + layer",
    layout: res.groupLayout,
    entries: [
      { binding: 0, resource: { buffer: res.viewBuffer } },
      { binding: 1, resource: { buffer: res.layerBuffer, size: LAYER_SIZE } },
    ],
  });
}
