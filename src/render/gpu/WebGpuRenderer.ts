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
// A vector shape (spec §21.12, Batch 65) is drawn first as well: per shape one pass into a 4x
// multisampled scratch with a stencil (each path's fill fans counted by winding, or its stroke's
// triangles, then a cover rectangle painted where the stencil says inside and the stencil cleared),
// resolved into a pooled texture that the draw shows as a textured quad with the shape's opacity.
import type { RGBA } from "../../core/document/types.js";
import type { DrawList, MaskFrame } from "../compositor/drawList.js";
import { IDENTITY, mutableIdentity, setMat, type Mat3, type MutableMat3 } from "../mat3.js";
import type { BackendRenderer } from "./backend.js";
import { blurRegionInto, DrawRecords, newRecordUniform, pathRegionInto, premultipliedInto, ROLE, setRect, showBlurred, showPath, writePathUniform, type BlurRegion, type DrawRecord, type QuadKind, type Rect } from "./drawRecords.js";
import { fitWithin, hasAlphaFormat } from "./fitWithin.js";
import type { GpuDevice } from "./GpuDevice.js";
import { isHdrColorSpace, toneMapToCanvas } from "./hdr.js";
import { layerFloats, LAYER_SIZE, LAYER_STRIDE, packLayer, packMat3, pixelsToClipInto, VIEW_SIZE } from "./layerUniforms.js";
import { generateMipmaps, mipLevelCount, textureBytes, type MipGenerator } from "./mipmaps.js";
import { paddedBytesPerRow, unpadAndUnpremultiply } from "./readback.js";
import type { AlphaPlane, CanvasTarget, DeviceEvent, OffscreenTarget, Pane, RenderTarget, TextureHandle, TextureOptions, Viewport } from "./renderer.js";
import { coverageSize, evictCoverage, maskDataRows, pickCoverage, writeMaskData, type CoverageEntry } from "./maskTargets.js";
import { MASK_DATA_WIDTH } from "../../core/masks/maskCoverage.js";
import { BLUR_WGSL, COMPOSITE_WGSL, DISSOLVE_WGSL, MASK_WGSL, MIPMAP_WGSL, PATH_RESOLVE_WGSL, PATH_WGSL, SCALE_ALPHA_WGSL, SCALE_WGSL, SOLID_WGSL, TEXTURED_WGSL } from "./shaders.js";

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

type PipelineKind = QuadKind;
/** Samples of a shape's scratch (WebGPU offers 1 or 4). */
const PATH_SAMPLES = 4;
/** Shape scratch textures grow in steps of this many px. */
const PATH_STEP = 256;

/** The stencil-then-cover pipelines of shapes (built on the first shape) and their scratch. */
interface PathResources {
  /** Stencil writes: fill fans by winding, stroke triangles, and a fill's inside moved into the top bit. */
  nonzero: GPURenderPipeline;
  evenodd: GPURenderPipeline;
  union: GPURenderPipeline;
  clip: GPURenderPipeline;
  /** Paint where the low bits are set, or where the stencil equals the reference (cut strokes). */
  cover: GPURenderPipeline;
  coverEqual: GPURenderPipeline;
  resolve: GPURenderPipeline;
  resolveLayout: GPUBindGroupLayout;
  scratch: { color: GPUTexture; colorView: GPUTextureView; stencil: GPUTexture; stencilView: GPUTextureView; group: GPUBindGroup; width: number; height: number } | null;
  vertices: GPUBuffer;
  /** Bytes. */
  vertexCapacity: number;
}

interface Pipelines {
  textured: GPURenderPipeline;
  dissolve: GPURenderPipeline;
  solid: GPURenderPipeline;
}

/** A group's pictures (spec §21.17), the target's size: its layers and its matte (made on the first matte). */
interface GroupTarget {
  width: number;
  height: number;
  picture: GpuTexture;
  matte: GpuTexture | null;
  /** The bind group of the composite and the matte and backdrop views it was made with. */
  bindGroup: GPUBindGroup | null;
  boundMatte: GPUTextureView | null;
  boundBackdrop: GPUTextureView | null;
  /** Masks (Batch 73): this draw's coverage of its clip and of its matte clip, and the ones it was bound with. */
  mask: GPUTextureView | null;
  matteMask: GPUTextureView | null;
  boundMask: GPUTextureView | null;
  boundMatteMask: GPUTextureView | null;
  /** The draw that last used it. */
  used: number;
}

/** A masked clip's coverage (spec §21.18, maskTargets.ts): r8unorm over its content box, and its block's data texture. */
interface GpuCoverage extends CoverageEntry {
  texture: GPUTexture | null;
  view: GPUTextureView | null;
  data: GPUTexture | null;
  dataRows: number;
  dataGroup: GPUBindGroup | null;
}

/** The copy of a target the non-hardware blend modes read (its format and size). */
interface BackdropTarget {
  format: GPUTextureFormat;
  width: number;
  height: number;
  texture: GPUTexture;
  view: GPUTextureView;
  used: number;
}

interface CompositePipelines {
  normal: GPURenderPipeline;
  screen: GPURenderPipeline;
  add: GPURenderPipeline;
  /** The non-hardware modes: the W3C composite with the backdrop, no blending. */
  backdrop: GPURenderPipeline;
}

/** Blend modes and track mattes (Batch 72), built on the first group: the composite pipelines and the pooled pictures. */
interface CompositeResources {
  layout: GPUBindGroupLayout;
  pipelineLayout: GPUPipelineLayout;
  module: GPUShaderModule;
  pipelines: Map<GPUTextureFormat, CompositePipelines>;
  /** Bound for a missing matte or backdrop. */
  dummy: GPUTexture;
  dummyView: GPUTextureView;
  groups: GroupTarget[];
  backdrops: BackdropTarget[];
  /** Masks (Batch 73): the coverage pass and the kept coverages. */
  maskPipeline: GPURenderPipeline;
  maskLayout: GPUBindGroupLayout;
  coverages: GpuCoverage[];
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
  /** The scaler with an alpha plane multiplied in (Batch 64); built on the first video with alpha. */
  scalerAlpha?: { pipeline: GPURenderPipeline; layout: GPUBindGroupLayout };
  /** Shapes (Batch 65); null until the first one is drawn. */
  path: PathResources | null;
  /** Blend modes and track mattes (Batch 72); null until the first group is drawn. */
  composite: CompositeResources | null;
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
  /** Shapes in this draw: their records' indices and regions; their draws' uniforms and triangles, packed. */
  private readonly pathIndices: number[] = [];
  private readonly pathRegions: Rect[] = [];
  private readonly pathUniform = newRecordUniform();
  private pathData = new Float32Array(LAYER_STRIDE / 4);
  private pathVertices = new Float32Array(1024);
  /** Draws so far (the blur pool's clock). */
  private draws = 0;
  /** The pass descriptor, created on the first draw; each draw only swaps the attachment's view. */
  private pass: { attachment: GPURenderPassColorAttachment; descriptor: GPURenderPassDescriptor } | null = null;
  /** The pass that goes on drawing into the target after a backdrop copy (loads what is there). */
  private loadPass: { attachment: GPURenderPassColorAttachment; descriptor: GPURenderPassDescriptor } | null = null;
  /** This draw's group pictures: group g is `groupTargets[g - 1]`. */
  private readonly groupTargets: GroupTarget[] = [];
  /**
   * Copies of the target made for a non-hardware blend mode (spec §21.17, Batch 72): a frame whose
   * groups all use normal, screen or add makes none (the acceptance counter, `__editor` dev stats).
   */
  backdropCopies = 0;
  /** Coverage passes drawn (spec §21.18, Batch 73): static masks draw none after their first frame (`__editor` dev stats). */
  maskCoveragePasses = 0;
  private maskStaging = new Float32Array(MASK_DATA_WIDTH * 4);

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
      // An RGBA frame (an image sequence's, Batch 64) keeps its alpha only through a plain copy: the scaler's external texture would drop it.
      const { width, height } = hasAlphaFormat(frame) ? { width: frame.displayWidth, height: frame.displayHeight } : fitWithin(frame.displayWidth, frame.displayHeight, options.maxSize);
      const into = this.spareFor(res, width, height);
      const texture = options.alpha
        ? this.scaleIn(res, frame, width, height, options, into, options.alpha)
        : isHdrColorSpace(frame.colorSpace)
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
    const composite = this.resources?.composite;
    if (composite) {
      for (const entry of composite.groups.splice(0)) {
        entry.picture.destroy();
        entry.matte?.destroy();
      }
      for (const entry of composite.backdrops.splice(0)) entry.texture.destroy();
      for (const entry of composite.coverages.splice(0)) destroyCoverage(entry);
    }
    this.groupTargets.length = 0;
    const path = this.resources?.path;
    if (path?.scratch) {
      path.scratch.color.destroy();
      path.scratch.stencil.destroy();
      path.scratch = null;
    }
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
    let targetTexture: GPUTexture;
    if (target instanceof GpuCanvasTarget) {
      if (target.configured !== res.generation) this.configure(target);
      targetTexture = target.context.getCurrentTexture();
      attachment = targetTexture.createView();
      format = target.format;
    } else if (target instanceof GpuOffscreenTarget) {
      if (!target.texture.valid) this.resize(target, target.width, target.height);
      targetTexture = target.texture.texture;
      attachment = targetTexture.createView({ baseMipLevel: 0, mipLevelCount: 1 });
      format = TEXTURE_FORMAT;
    } else {
      return false;
    }

    const count = this.records.build(panes, target.width, target.height);
    const encoder = res.device.createCommandEncoder({ label: "draw list" });
    this.draws += 1;
    this.pathRecords(res, encoder, count);
    this.blurRecords(res, encoder, count);
    this.writeUniforms(res, count, pixelsToClipInto(this.toClip, target.width, target.height, IDENTITY));

    // Blend modes and track mattes (spec §21.17): each group's layers and matte into their pictures first.
    const composite = this.records.groupCount > 0 ? this.groupPasses(res, encoder, count, target.width, target.height) : null;

    const pipelines = this.pipelines(res, format);
    premultipliedInto(this.clearValue, first.viewport.outside);
    if (this.pass) {
      this.pass.attachment.view = attachment;
    } else {
      const created: GPURenderPassColorAttachment = { view: attachment, loadOp: "clear", storeOp: "store", clearValue: this.clearValue };
      this.pass = { attachment: created, descriptor: { colorAttachments: [created] } };
    }
    let pass = encoder.beginRenderPass(this.pass.descriptor);
    // The pass starts with the whole target as its scissor.
    const last = setRect(this.lastScissor, 0, 0, target.width, target.height);
    for (let index = 0; index < count; index++) {
      const record = this.records.at(index);
      if (record.role !== ROLE.target) continue;
      if (record.kind !== "composite") {
        this.quad(pass, pipelines, res, index, record, last);
        continue;
      }
      const group = this.groupTargets[record.group - 1];
      if (!composite || !group) continue;
      let backdrop: BackdropTarget | null = null;
      if (this.records.groups[record.group - 1]?.backdrop) {
        // A non-hardware mode reads what is below: end the pass, copy the target, go on loading it.
        pass.end();
        backdrop = this.backdropTarget(res, composite, format, target.width, target.height);
        encoder.copyTextureToTexture({ texture: targetTexture }, { texture: backdrop.texture }, [target.width, target.height]);
        this.backdropCopies += 1;
        pass = encoder.beginRenderPass(this.loadDescriptor(attachment));
        setRect(last, 0, 0, target.width, target.height);
      }
      this.scissor(pass, record, last);
      const modes = this.compositePipelines(res, composite, format);
      const code = record.uniform.fx?.code ?? 0;
      pass.setPipeline(backdrop ? modes.backdrop : code === SCREEN_CODE ? modes.screen : code === ADD_CODE ? modes.add : modes.normal);
      this.dynamicOffset[0] = index * LAYER_STRIDE;
      pass.setBindGroup(0, res.group, this.dynamicOffset, 0, 1);
      pass.setBindGroup(1, this.compositeBindGroup(res, composite, group, backdrop));
      pass.draw(4);
    }
    pass.end();
    res.device.queue.submit([encoder.finish()]);
    return true;
  }

  /** Sets the record's scissor when it differs from the last one set (`last`). */
  private scissor(pass: GPURenderPassEncoder, record: DrawRecord<GpuTexture>, last: Rect): void {
    const { scissor } = record;
    if (scissor.x !== last.x || scissor.y !== last.y || scissor.width !== last.width || scissor.height !== last.height) {
      pass.setScissorRect(scissor.x, scissor.y, scissor.width, scissor.height);
      setRect(last, scissor.x, scissor.y, scissor.width, scissor.height);
    }
  }

  /** Draws a quad record (textured, dissolve or solid; a shape is a textured record by now). */
  private quad(pass: GPURenderPassEncoder, pipelines: Pipelines, res: DeviceResources, index: number, record: DrawRecord<GpuTexture>, last: Rect): void {
    this.scissor(pass, record, last);
    if (record.kind === "path" || record.kind === "composite" || (record.kind === "textured" && !record.texture0)) return;
    pass.setPipeline(pipelines[record.kind]);
    this.dynamicOffset[0] = index * LAYER_STRIDE;
    pass.setBindGroup(0, res.group, this.dynamicOffset, 0, 1);
    if (record.texture0) pass.setBindGroup(1, record.texture0.bindGroup);
    if (record.texture1) pass.setBindGroup(2, record.texture1.bindGroup);
    pass.draw(4);
  }

  /** The descriptor of a pass that keeps the target's contents (after a backdrop copy). */
  private loadDescriptor(attachment: GPUTextureView): GPURenderPassDescriptor {
    if (this.loadPass) this.loadPass.attachment.view = attachment;
    else {
      const created: GPURenderPassColorAttachment = { view: attachment, loadOp: "load", storeOp: "store" };
      this.loadPass = { attachment: created, descriptor: { colorAttachments: [created] } };
    }
    return this.loadPass.descriptor;
  }

  /**
   * Blend modes and track mattes (spec §21.17, Batch 72): draws each group's layer records into its
   * picture and its matte records into its matte picture (pooled target-size textures, cleared
   * transparent; the records' matrices already map to target px). Frees pictures unused for a while.
   */
  private groupPasses(res: DeviceResources, encoder: GPUCommandEncoder, count: number, width: number, height: number): CompositeResources {
    const composite = (res.composite ??= this.buildComposite(res));
    const pipelines = this.pipelines(res, TEXTURE_FORMAT);
    const pool = composite.groups;
    this.groupTargets.length = 0;
    for (let g = 1; g <= this.records.groupCount; g++) {
      let group: GroupTarget | null = null;
      for (const entry of pool) {
        if (entry.width === width && entry.height === height && entry.used !== this.draws) {
          group = entry;
          break;
        }
      }
      if (!group) {
        group = { width, height, picture: this.newTexture(res, width, height, { label: "group picture" }), matte: null, bindGroup: null, boundMatte: null, boundBackdrop: null, mask: null, matteMask: null, boundMask: null, boundMatteMask: null, used: this.draws };
        pool.push(group);
      }
      group.used = this.draws;
      this.groupTargets.push(group);
      // Masks (spec §21.18): the coverage of the clip and of its matte clip (drawn only when their blocks changed).
      const info = this.records.groups[g - 1];
      group.mask = info?.mask ? this.coverage(res, encoder, composite, info.mask) : null;
      group.matteMask = info?.matteMask ? this.coverage(res, encoder, composite, info.matteMask) : null;
      this.groupPass(res, encoder, pipelines, count, g, ROLE.layers, group.picture, width, height);
      if (this.records.groups[g - 1]?.matte) {
        group.matte ??= this.newTexture(res, width, height, { label: "group matte" });
        this.groupPass(res, encoder, pipelines, count, g, ROLE.matte, group.matte, width, height);
      }
    }
    for (let i = pool.length - 1; i >= 0; i--) {
      const entry = pool[i] as GroupTarget;
      if (this.draws - entry.used <= BLUR_KEEP_DRAWS) continue;
      entry.picture.destroy();
      entry.matte?.destroy();
      pool.splice(i, 1);
    }
    for (let i = composite.backdrops.length - 1; i >= 0; i--) {
      const entry = composite.backdrops[i] as BackdropTarget;
      if (this.draws - entry.used <= BLUR_KEEP_DRAWS) continue;
      entry.texture.destroy();
      composite.backdrops.splice(i, 1);
    }
    evictCoverage(composite.coverages, this.draws, BLUR_KEEP_DRAWS, destroyCoverage);
    return composite;
  }

  /**
   * The coverage of `mask` (spec §21.18, maskTargets.ts): the kept texture when it holds the block's
   * version, else drawn (encoded before the group's passes) into the clip's texture or a new one.
   */
  private coverage(res: DeviceResources, encoder: GPUCommandEncoder, composite: CompositeResources, mask: MaskFrame): GPUTextureView | null {
    const picked = pickCoverage(composite.coverages, mask, this.draws);
    if (picked && !picked.draw && picked.entry.view) return picked.entry.view;
    let entry = picked?.entry ?? null;
    if (!entry) {
      entry = { clipId: mask.clipId, version: 0, width: 0, height: 0, used: this.draws, texture: null, view: null, data: null, dataRows: 0, dataGroup: null };
      composite.coverages.push(entry);
    }
    const { device } = res;
    const size = coverageSize(mask.width, mask.height);
    if (!entry.texture || entry.width !== size.width || entry.height !== size.height) {
      entry.texture?.destroy();
      entry.texture = device.createTexture({ label: "mask coverage", size: [size.width, size.height], format: "r8unorm", usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
      entry.view = entry.texture.createView();
      entry.width = size.width;
      entry.height = size.height;
    }
    const rows = maskDataRows(mask);
    if (!entry.data || entry.dataRows < rows) {
      entry.data?.destroy();
      entry.data = device.createTexture({ label: "mask data", size: [MASK_DATA_WIDTH, rows], format: "rgba32float", usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
      entry.dataRows = rows;
      entry.dataGroup = device.createBindGroup({ label: "mask data", layout: composite.maskLayout, entries: [{ binding: 0, resource: entry.data.createView() }] });
    }
    const floats = rows * MASK_DATA_WIDTH * 4;
    if (this.maskStaging.length < floats) this.maskStaging = new Float32Array(floats);
    writeMaskData(this.maskStaging, mask, size.width, size.height);
    device.queue.writeTexture({ texture: entry.data }, this.maskStaging, { bytesPerRow: MASK_DATA_WIDTH * 16, rowsPerImage: rows }, [MASK_DATA_WIDTH, rows]);
    const pass = encoder.beginRenderPass({ label: "mask coverage", colorAttachments: [{ view: entry.view as GPUTextureView, loadOp: "clear", storeOp: "store", clearValue: [0, 0, 0, 0] }] });
    pass.setPipeline(composite.maskPipeline);
    pass.setBindGroup(0, entry.dataGroup);
    pass.draw(4);
    pass.end();
    entry.clipId = mask.clipId;
    entry.version = mask.version;
    entry.used = this.draws;
    this.maskCoveragePasses += 1;
    return entry.view;
  }

  private groupPass(res: DeviceResources, encoder: GPUCommandEncoder, pipelines: Pipelines, count: number, group: number, role: number, into: GpuTexture, width: number, height: number): void {
    const pass = encoder.beginRenderPass({ label: role === ROLE.matte ? "group matte" : "group", colorAttachments: [{ view: into.view, loadOp: "clear", storeOp: "store", clearValue: [0, 0, 0, 0] }] });
    const last = setRect(this.lastScissor, 0, 0, width, height);
    for (let index = 0; index < count; index++) {
      const record = this.records.at(index);
      if (record.group === group && record.role === role) this.quad(pass, pipelines, res, index, record, last);
    }
    pass.end();
  }

  /** The pooled copy of a `format` target of this size (one is enough: copies are drawn from one after another). */
  private backdropTarget(res: DeviceResources, composite: CompositeResources, format: GPUTextureFormat, width: number, height: number): BackdropTarget {
    let found: BackdropTarget | null = null;
    for (const entry of composite.backdrops) {
      if (entry.format === format && entry.width === width && entry.height === height) {
        found = entry;
        break;
      }
    }
    if (!found) {
      const texture = res.device.createTexture({ label: "backdrop", size: [width, height], format, usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
      found = { format, width, height, texture, view: texture.createView(), used: this.draws };
      composite.backdrops.push(found);
    }
    found.used = this.draws;
    return found;
  }

  /** The composite's bind group of a group (kept while its matte and backdrop stay the same). */
  private compositeBindGroup(res: DeviceResources, composite: CompositeResources, group: GroupTarget, backdrop: BackdropTarget | null): GPUBindGroup {
    const matte = group.matte?.view ?? null;
    const behind = backdrop?.view ?? null;
    if (!group.bindGroup || group.boundMatte !== matte || group.boundBackdrop !== behind || group.boundMask !== group.mask || group.boundMatteMask !== group.matteMask) {
      group.bindGroup = res.device.createBindGroup({
        label: "composite",
        layout: composite.layout,
        entries: [
          { binding: 0, resource: group.picture.view },
          { binding: 1, resource: matte ?? composite.dummyView },
          { binding: 2, resource: behind ?? composite.dummyView },
          { binding: 3, resource: group.mask ?? composite.dummyView },
          { binding: 4, resource: group.matteMask ?? composite.dummyView },
        ],
      });
      group.boundMatte = matte;
      group.boundBackdrop = behind;
      group.boundMask = group.mask;
      group.boundMatteMask = group.matteMask;
    }
    return group.bindGroup;
  }

  private compositePipelines(res: DeviceResources, composite: CompositeResources, format: GPUTextureFormat): CompositePipelines {
    let modes = composite.pipelines.get(format);
    if (!modes) {
      const make = (label: string, entryPoint: string, blend: GPUBlendState | null) =>
        res.device.createRenderPipeline({
          label: `composite ${label} ${format}`,
          layout: composite.pipelineLayout,
          vertex: { module: composite.module, entryPoint: "vs" },
          fragment: { module: composite.module, entryPoint, targets: [blend ? { format, blend } : { format }] },
          primitive: { topology: "triangle-strip" },
        });
      modes = { normal: make("normal", "fs", PREMULTIPLIED_BLEND), screen: make("screen", "fs", SCREEN_BLEND), add: make("add", "fs", ADD_BLEND), backdrop: make("backdrop", "fsBackdrop", null) };
      composite.pipelines.set(format, modes);
    }
    return modes;
  }

  private buildComposite(res: DeviceResources): CompositeResources {
    const { device } = res;
    const texture: GPUTextureBindingLayout = { sampleType: "unfilterable-float" };
    const layout = device.createBindGroupLayout({
      label: "composite",
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture },
      ],
    });
    const maskLayout = device.createBindGroupLayout({ label: "mask data", entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, texture }] });
    const maskModule = device.createShaderModule({ label: "mask coverage", code: MASK_WGSL });
    void maskModule.getCompilationInfo().then((info) => {
      for (const message of info.messages) if (message.type === "error") console.error(`[gpu] mask shader: ${message.message} (line ${message.lineNum})`);
    });
    const maskPipeline = device.createRenderPipeline({
      label: "mask coverage",
      layout: device.createPipelineLayout({ label: "mask coverage", bindGroupLayouts: [maskLayout] }),
      vertex: { module: maskModule, entryPoint: "vs" },
      fragment: { module: maskModule, entryPoint: "fs", targets: [{ format: "r8unorm" }] },
      primitive: { topology: "triangle-strip" },
    });
    const module = device.createShaderModule({ label: "composite", code: COMPOSITE_WGSL });
    void module.getCompilationInfo().then((info) => {
      for (const message of info.messages) if (message.type === "error") console.error(`[gpu] composite shader: ${message.message} (line ${message.lineNum})`);
    });
    const dummy = device.createTexture({ label: "composite dummy", size: [1, 1], format: TEXTURE_FORMAT, usage: GPUTextureUsage.TEXTURE_BINDING });
    return {
      layout,
      pipelineLayout: device.createPipelineLayout({ label: "composite", bindGroupLayouts: [res.groupLayout, layout] }),
      module,
      pipelines: new Map(),
      dummy,
      dummyView: dummy.createView(),
      groups: [],
      backdrops: [],
      maskPipeline,
      maskLayout,
      coverages: [],
    };
  }

  /**
   * Draws every shape record into a pooled texture (a multisampled pass and its resolve, encoded before
   * the draw's own) and points the record at it. Their draws' uniforms take the slots after the records'.
   */
  private pathRecords(res: DeviceResources, encoder: GPUCommandEncoder, count: number): void {
    const indices = this.pathIndices;
    indices.length = 0;
    let draws = 0;
    let floats = 0;
    let width = 0;
    let height = 0;
    for (let index = 0; index < count; index++) {
      const record = this.records.at(index);
      if (record.kind !== "path" || !record.path) continue;
      const region = pathRegionInto((this.pathRegions[indices.length] ??= { x: 0, y: 0, width: 0, height: 0 }), record);
      if (!region) {
        // Out of view: an empty textured record draws nothing.
        record.kind = "textured";
        record.path = null;
        record.uniform.opacity = 0;
        record.texture0 = null;
        continue;
      }
      indices.push(index);
      width = Math.max(width, region.width);
      height = Math.max(height, region.height);
      for (const draw of record.path.draws) {
        draws += 1;
        floats += draw.triangles.length + (draw.clip?.length ?? 0);
      }
    }
    if (indices.length === 0) return;
    const path = (res.path ??= this.buildPath(res));
    const scratch = this.pathScratch(res, path, width, height);
    if (count + draws > res.layerCapacity) this.growLayers(res, count + draws);
    if (floats * 4 > path.vertexCapacity) {
      let capacity = path.vertexCapacity;
      while (capacity < floats * 4) capacity *= 2;
      path.vertices.destroy();
      path.vertices = res.device.createBuffer({ label: "shape triangles", size: capacity, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
      path.vertexCapacity = capacity;
    }
    if (this.pathVertices.length < floats) this.pathVertices = new Float32Array(Math.max(floats, 2 * this.pathVertices.length));
    if (this.pathData.length < layerFloats(draws)) this.pathData = new Float32Array(layerFloats(Math.max(draws, 2 * (this.pathData.length / (LAYER_STRIDE / 4)))));
    // Pack every draw's uniform and triangles first: the passes below only record commands.
    let slot = 0;
    let at = 0;
    for (let i = 0; i < indices.length; i++) {
      const record = this.records.at(indices[i] as number);
      const region = this.pathRegions[i] as Rect;
      for (const draw of (record.path as NonNullable<typeof record.path>).draws) {
        writePathUniform(this.pathUniform, record, draw, region, scratch.width, scratch.height, false);
        packLayer(this.pathData, slot, this.pathUniform);
        slot += 1;
        if (draw.clip) {
          this.pathVertices.set(draw.clip, at);
          at += draw.clip.length;
        }
        this.pathVertices.set(draw.triangles, at);
        at += draw.triangles.length;
      }
    }
    res.device.queue.writeBuffer(res.layerBuffer, count * LAYER_STRIDE, this.pathData.buffer, 0, draws * LAYER_STRIDE);
    res.device.queue.writeBuffer(path.vertices, 0, this.pathVertices.buffer, 0, floats * 4);

    const offset = this.dynamicOffset;
    slot = 0;
    at = 0;
    for (let i = 0; i < indices.length; i++) {
      const record = this.records.at(indices[i] as number);
      const region = this.pathRegions[i] as Rect;
      const pass = encoder.beginRenderPass({
        label: "shape",
        colorAttachments: [{ view: scratch.colorView, loadOp: "clear", storeOp: "store", clearValue: [0, 0, 0, 0] }],
        depthStencilAttachment: { view: scratch.stencilView, stencilLoadOp: "clear", stencilStoreOp: "discard", stencilClearValue: 0 },
      });
      pass.setScissorRect(0, 0, region.width, region.height);
      pass.setVertexBuffer(0, path.vertices);
      for (const draw of (record.path as NonNullable<typeof record.path>).draws) {
        offset[0] = (count + slot) * LAYER_STRIDE;
        slot += 1;
        pass.setBindGroup(0, res.group, offset, 0, 1);
        if (draw.rule === "inside" || draw.rule === "outside") {
          const clip = draw.clip as Float32Array;
          // The fill's inside into the top bit, then the stroke (twice as wide) into the low bits: kept where both are (inside) or only the stroke is (outside).
          pass.setPipeline(draw.clipRule === "evenodd" ? path.evenodd : path.nonzero);
          pass.draw(clip.length / 2, 1, at / 2);
          at += clip.length;
          pass.setPipeline(path.clip);
          pass.setStencilReference(0x80);
          pass.draw(4);
          pass.setPipeline(path.union);
          pass.setStencilReference(1);
          pass.draw(draw.triangles.length / 2, 1, at / 2);
          at += draw.triangles.length;
          pass.setPipeline(path.coverEqual);
          pass.setStencilReference(draw.rule === "inside" ? 0x81 : 0x01);
          pass.draw(4);
        } else {
          pass.setPipeline(draw.rule === "union" ? path.union : draw.rule === "evenodd" ? path.evenodd : path.nonzero);
          pass.setStencilReference(1);
          pass.draw(draw.triangles.length / 2, 1, at / 2);
          at += draw.triangles.length;
          pass.setPipeline(path.cover);
          pass.setStencilReference(0);
          pass.draw(4);
        }
      }
      pass.end();
      const texture = this.blurTexture(res, region.width, region.height);
      const resolve = encoder.beginRenderPass({ label: "shape resolve", colorAttachments: [{ view: texture.view, loadOp: "clear", storeOp: "store", clearValue: [0, 0, 0, 0] }] });
      resolve.setPipeline(path.resolve);
      resolve.setScissorRect(0, 0, region.width, region.height);
      resolve.setBindGroup(0, scratch.group);
      resolve.draw(3);
      resolve.end();
      showPath(record, region, texture);
    }
  }

  /** The shapes' scratch, at least `width` x `height` (grown in steps, never shrunk until `releaseCaches`). */
  private pathScratch(res: DeviceResources, path: PathResources, width: number, height: number): NonNullable<PathResources["scratch"]> {
    const current = path.scratch;
    if (current && current.width >= width && current.height >= height) return current;
    const step = (size: number) => Math.min(this.maxTextureSize, Math.ceil(size / PATH_STEP) * PATH_STEP);
    const w = Math.max(step(width), current?.width ?? 0);
    const h = Math.max(step(height), current?.height ?? 0);
    current?.color.destroy();
    current?.stencil.destroy();
    const color = res.device.createTexture({ label: "shape scratch", size: [w, h], format: TEXTURE_FORMAT, sampleCount: PATH_SAMPLES, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    const stencil = res.device.createTexture({ label: "shape stencil", size: [w, h], format: "stencil8", sampleCount: PATH_SAMPLES, usage: GPUTextureUsage.RENDER_ATTACHMENT });
    const colorView = color.createView();
    const group = res.device.createBindGroup({ label: "shape scratch", layout: path.resolveLayout, entries: [{ binding: 0, resource: colorView }] });
    path.scratch = { color, colorView, stencil, stencilView: stencil.createView(), group, width: w, height: h };
    return path.scratch;
  }

  private buildPath(res: DeviceResources): PathResources {
    const { device } = res;
    const module = device.createShaderModule({ label: "shape", code: PATH_WGSL });
    const layout = device.createPipelineLayout({ label: "shape", bindGroupLayouts: [res.groupLayout] });
    const make = (label: string, stencilPass: boolean, front: GPUStencilFaceState, back: GPUStencilFaceState, readMask: number, writeMask: number, paint: boolean) =>
      device.createRenderPipeline({
        label: `shape ${label}`,
        layout,
        vertex: stencilPass
          ? { module, entryPoint: "vsStencil", buffers: [{ arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }] }] }
          : { module, entryPoint: "vsCover" },
        fragment: { module, entryPoint: paint ? "fsCover" : "fsStencil", targets: [paint ? { format: TEXTURE_FORMAT, blend: PREMULTIPLIED_BLEND } : { format: TEXTURE_FORMAT, writeMask: 0 }] },
        primitive: { topology: stencilPass ? "triangle-list" : "triangle-strip", cullMode: "none" },
        depthStencil: { format: "stencil8", depthWriteEnabled: false, depthCompare: "always", stencilFront: front, stencilBack: back, stencilReadMask: readMask, stencilWriteMask: writeMask },
        multisample: { count: PATH_SAMPLES },
      });
    const both = (face: GPUStencilFaceState) => [face, face] as const;
    const zeroing = (compare: GPUCompareFunction): GPUStencilFaceState => ({ compare, passOp: "zero", failOp: "zero" });
    const resolveLayout = device.createBindGroupLayout({
      label: "shape scratch",
      entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "unfilterable-float", multisampled: true } }],
    });
    const resolveModule = device.createShaderModule({ label: "shape resolve", code: PATH_RESOLVE_WGSL });
    return {
      // Front faces count up and back faces down (the winding number, modulo 128); evenodd flips.
      nonzero: make("nonzero", true, { compare: "always", passOp: "increment-wrap" }, { compare: "always", passOp: "decrement-wrap" }, 0xff, 0x7f, false),
      evenodd: make("evenodd", true, ...both({ compare: "always", passOp: "invert" }), 0xff, 0x7f, false),
      union: make("union", true, ...both({ compare: "always", passOp: "replace" }), 0xff, 0x7f, false),
      // Where the low bits are set: the reference (0x80) replaces the whole value; elsewhere zero.
      clip: make("clip", false, ...both({ compare: "not-equal", passOp: "replace", failOp: "zero" }), 0x7f, 0xff, false),
      cover: make("cover", false, ...both(zeroing("not-equal")), 0x7f, 0xff, true),
      coverEqual: make("cover equal", false, ...both(zeroing("equal")), 0xff, 0xff, true),
      resolve: device.createRenderPipeline({
        label: "shape resolve",
        layout: device.createPipelineLayout({ label: "shape resolve", bindGroupLayouts: [resolveLayout] }),
        vertex: { module: resolveModule, entryPoint: "vs" },
        fragment: { module: resolveModule, entryPoint: "fs", targets: [{ format: TEXTURE_FORMAT }] },
        primitive: { topology: "triangle-list" },
      }),
      resolveLayout,
      scratch: null,
      vertices: device.createBuffer({ label: "shape triangles", size: 64 * 1024, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST }),
      vertexCapacity: 64 * 1024,
    };
  }

  /**
   * Blurs the source of every blurred record into a pooled texture (two passes encoded before the
   * draw's own) and points the record at it: the quad grown by the blur's reach on each side.
   */
  private blurRecords(res: DeviceResources, encoder: GPUCommandEncoder, count: number): void {
    const blur = res.blur;
    let passes = 0;
    // The uniform buffer grows before any pass is encoded: a pass already encoded keeps the buffer and
    // group it was made with, and a buffer destroyed after that would make the whole submit invalid.
    let blurred = 0;
    for (let index = 0; index < count; index++) {
      const record = this.records.at(index);
      if (record.texture0 && blurRegionInto(this.blurRegion, record)) blurred++;
    }
    if (blurred * 2 > blur.capacity) this.growBlur(res, blurred * 2);
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
    // COPY_SRC: a non-hardware blend mode copies the canvas into its backdrop (spec §21.17).
    target.context.configure({ device: res.device, format: target.format, alphaMode: "opaque", usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    target.configured = res.generation;
  }

  /**
   * A `width` x `height` texture showing the whole frame: the frame is sampled as decoded (an external
   * texture) and drawn once, which costs far less than copying it at full size (4K HEVC on an RDNA2
   * GPU: 70 decoded frames/s scaled to 1080p, 56 copied at 4K, 103 decoded and dropped).
   */
  private scaleIn(res: DeviceResources, frame: VideoFrame, width: number, height: number, options: TextureOptions, into: GpuTexture | null, alpha?: AlphaPlane): GpuTexture {
    const texture = into ?? this.newTexture(res, width, height, { ...options, mipmaps: false }, this.recycleFrame);
    let alphaTexture: GPUTexture | null = null;
    try {
      const { device } = res;
      const scaler = alpha ? this.alphaScaler(res) : res.scaler;
      const source = device.importExternalTexture({ source: frame });
      const entries: GPUBindGroupEntry[] = [
        { binding: 0, resource: res.scaler.sampler },
        { binding: 1, resource: source },
      ];
      if (alpha) {
        alphaTexture = device.createTexture({ label: "alpha plane", size: [alpha.width, alpha.height], format: "r8unorm", usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
        device.queue.writeTexture({ texture: alphaTexture }, alpha.data, { bytesPerRow: alpha.width }, [alpha.width, alpha.height]);
        entries.push({ binding: 2, resource: alphaTexture.createView() });
      }
      const bindGroup = device.createBindGroup({ layout: scaler.layout, entries });
      const encoder = device.createCommandEncoder({ label: "scale frame" });
      const pass = encoder.beginRenderPass({ colorAttachments: [{ view: texture.view, loadOp: "clear", storeOp: "store", clearValue: [0, 0, 0, 1] }] });
      pass.setPipeline(scaler.pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3);
      pass.end();
      // Submitted before the frame is closed: the queued work keeps the picture alive.
      device.queue.submit([encoder.finish()]);
      // destroy() waits for the submitted work that uses the texture.
      alphaTexture?.destroy();
    } catch (error) {
      alphaTexture?.destroy();
      texture.destroy();
      throw error;
    }
    return texture;
  }

  /** The scaler pipeline with the alpha plane (binding 2), built on first use. */
  private alphaScaler(res: DeviceResources): { pipeline: GPURenderPipeline; layout: GPUBindGroupLayout } {
    if (res.scalerAlpha) return res.scalerAlpha;
    const { device } = res;
    const layout = device.createBindGroupLayout({
      label: "scale source with alpha",
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, externalTexture: {} },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
      ],
    });
    const module = device.createShaderModule({ label: "scale alpha", code: SCALE_ALPHA_WGSL });
    const pipeline = device.createRenderPipeline({
      label: "scale frame with alpha",
      layout: device.createPipelineLayout({ label: "scale alpha", bindGroupLayouts: [layout] }),
      vertex: { module, entryPoint: "vs" },
      fragment: { module, entryPoint: "fs", targets: [{ format: TEXTURE_FORMAT }] },
      primitive: { topology: "triangle-list" },
    });
    res.scalerAlpha = { pipeline, layout };
    return res.scalerAlpha;
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
      path: null,
      composite: null,
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

/** Blend codes (`BLEND_MODES` indices) of the hardware modes besides normal. */
const SCREEN_CODE = 5;
const ADD_CODE = 7;

/** Screen (spec §21.17): color Cs + Cb(1 - Cs) on premultiplied values; alpha source-over. */
const SCREEN_BLEND: GPUBlendState = {
  color: { srcFactor: "one", dstFactor: "one-minus-src", operation: "add" },
  alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
};

/** Add (linear dodge): color Cs + Cb, clamped by the unorm target; alpha source-over. */
const ADD_BLEND: GPUBlendState = {
  color: { srcFactor: "one", dstFactor: "one", operation: "add" },
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

function destroyCoverage(entry: GpuCoverage): void {
  entry.texture?.destroy();
  entry.data?.destroy();
  entry.texture = null;
  entry.view = null;
  entry.data = null;
}
