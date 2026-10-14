// The WebGPU backend of `Renderer` (spec §3.1, §9.3, §9.4). Draws a draw list in one render pass with
// premultiplied alpha: a textured-quad pipeline, a two-texture dissolve pipeline (Batch 36) and a
// solid-color pipeline. Per-layer uniforms live in one buffer bound with dynamic offsets; each texture
// gets its bind group once, at creation, so a frame creates no bind groups. Everything GPU-side is
// rebuilt when GpuDevice replaces a lost device; texture handles of the old device turn invalid and
// their owners re-upload on "ready".
import type { RGBA } from "../../core/document/types.js";
import type { DrawList, Layer, UvRect } from "../compositor/drawList.js";
import { invertInto, multiplyInto, mutableIdentity, setMat, type Mat3, type MutableMat3 } from "../mat3.js";
import type { GpuDevice } from "./GpuDevice.js";
import { layerFloats, LAYER_SIZE, LAYER_STRIDE, packLayer, packMat3, pixelsToClipInto, VIEW_SIZE } from "./layerUniforms.js";
import { generateMipmaps, mipLevelCount, textureBytes, type MipGenerator } from "./mipmaps.js";
import { paddedBytesPerRow, unpadAndUnpremultiply } from "./readback.js";
import type { CanvasTarget, DeviceEvent, OffscreenTarget, Renderer, RenderTarget, TextureHandle, TextureOptions, Viewport } from "./renderer.js";
import { DISSOLVE_WGSL, MIPMAP_WGSL, SOLID_WGSL, TEXTURED_WGSL } from "./shaders.js";

/** Textures, offscreen targets and mip levels are rgba8 (spec §9.3); canvases use the preferred format. */
const TEXTURE_FORMAT: GPUTextureFormat = "rgba8unorm";
const TRANSPARENT: RGBA = { r: 0, g: 0, b: 0, a: 0 };
const DEFAULT_MAX_TEXTURE = 8192;
const INITIAL_LAYERS = 64;

type PipelineKind = "textured" | "dissolve" | "solid";

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
  viewBuffer: GPUBuffer;
  layerBuffer: GPUBuffer;
  layerCapacity: number;
  group: GPUBindGroup;
}

class GpuTexture implements TextureHandle {
  private destroyed = false;

  constructor(
    readonly texture: GPUTexture,
    readonly bindGroup: GPUBindGroup,
    readonly bytes: number,
    private readonly generation: number,
    private readonly currentGeneration: () => number,
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
    this.texture.destroy();
  }
}

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

/** One quad of a draw. Records are pooled and rewritten every draw (no allocation once warm). */
interface DrawRecord {
  kind: PipelineKind;
  uniform: { transform: MutableMat3; uv: UvRect; color: RGBA; opacity: number; flipX: boolean; flipY: boolean; mix: number };
  /** Bound at groups 1 and 2 (none for solids, one for textured layers, two for dissolves). */
  texture0: GpuTexture | null;
  texture1: GpuTexture | null;
  /** Clipped to the frame rectangle (document layers), or not (the border outside it). */
  clipped: boolean;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const newRecord = (): DrawRecord => ({
  kind: "solid",
  uniform: { transform: mutableIdentity(), uv: { u0: 0, v0: 0, u1: 1, v1: 1 }, color: { r: 0, g: 0, b: 0, a: 0 }, opacity: 1, flipX: false, flipY: false, mix: 0 },
  texture0: null,
  texture1: null,
  clipped: true,
});

export class WebGpuRenderer implements Renderer {
  private resources: DeviceResources | null = null;
  private readonly canvases = new Set<GpuCanvasTarget>();
  private readonly listeners = new Set<(event: DeviceEvent) => void>();
  private layerData = new Float32Array(layerFloats(INITIAL_LAYERS));
  private readonly viewData = new Float32Array(VIEW_SIZE / 4);
  private readonly canvasFormat: GPUTextureFormat;
  // Scratch state of `draw`, reused so a frame allocates nothing on our side (the WebGPU calls do).
  private readonly recordPool: DrawRecord[] = [];
  private recordCount = 0;
  private readonly fillView: Viewport & { transform: MutableMat3 } = { transform: mutableIdentity(), outside: TRANSPARENT, border: null };
  private readonly toProject = mutableIdentity();
  private readonly toClip = mutableIdentity();
  private readonly frameBox: Rect = { x: 0, y: 0, width: 0, height: 0 };
  private readonly scissorBox: Rect = { x: 0, y: 0, width: 0, height: 0 };
  private readonly clearValue = { r: 0, g: 0, b: 0, a: 0 };
  private readonly dynamicOffset = new Uint32Array(1);
  /** The pass descriptor, created on the first draw; each draw only swaps the attachment's view. */
  private pass: { attachment: GPURenderPassColorAttachment; descriptor: GPURenderPassDescriptor } | null = null;

  constructor(private readonly gpu: GpuDevice) {
    this.canvasFormat = typeof navigator !== "undefined" && navigator.gpu ? navigator.gpu.getPreferredCanvasFormat() : "bgra8unorm";
    gpu.subscribe((state, device) => {
      const had = this.resources !== null;
      this.resources = null;
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

  uploadImageBitmap(bitmap: ImageBitmap, options: TextureOptions = {}): TextureHandle {
    const res = this.require();
    return this.copyIn(res, bitmap, bitmap.width, bitmap.height, { mipmaps: true, ...options });
  }

  uploadVideoFrame(frame: VideoFrame, options: TextureOptions = {}): TextureHandle {
    try {
      const res = this.require();
      const texture = this.copyIn(res, frame, frame.displayWidth, frame.displayHeight, { mipmaps: false, ...options });
      // Sends the copy now rather than with the next draw: until it runs, the decoder cannot reuse
      // the frame's picture buffer (measured: hardware decoding 25-35% faster with uploads in flight).
      res.device.queue.submit([]);
      return texture;
    } finally {
      frame.close();
    }
  }

  /** A new texture holding `source`. A failed copy (a closed source) destroys the texture before rethrowing (P13). */
  private copyIn(res: DeviceResources, source: ImageBitmap | VideoFrame, width: number, height: number, options: TextureOptions): GpuTexture {
    const texture = this.newTexture(res, width, height, options);
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
    const res = this.resources;
    if (!res || target.width < 1 || target.height < 1 || list.width < 1 || list.height < 1) return false;
    let view: Viewport = this.fillView;
    if (viewport) view = viewport;
    else setMat(this.fillView.transform, target.width / list.width, 0, 0, target.height / list.height, 0, 0);
    if (!invertInto(this.toProject, view.transform)) return false;

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

    const frame = frameRect(this.frameBox, view.transform, list.width, list.height);
    this.buildRecords(list, view, frame);
    this.writeUniforms(res, pixelsToClipInto(this.toClip, target.width, target.height, view.transform));

    const pipelines = this.pipelines(res, format);
    const scissor = clipRect(this.scissorBox, frame, target.width, target.height);
    const encoder = res.device.createCommandEncoder({ label: "draw list" });
    premultipliedInto(this.clearValue, view.outside);
    if (this.pass) {
      this.pass.attachment.view = attachment;
    } else {
      const created: GPURenderPassColorAttachment = { view: attachment, loadOp: "clear", storeOp: "store", clearValue: this.clearValue };
      this.pass = { attachment: created, descriptor: { colorAttachments: [created] } };
    }
    const pass = encoder.beginRenderPass(this.pass.descriptor);
    const offset = this.dynamicOffset;
    let clipped = false;
    for (let index = 0; index < this.recordCount; index++) {
      const record = this.recordPool[index] as DrawRecord;
      if (record.clipped && !scissor) continue;
      if (record.clipped !== clipped) {
        if (record.clipped && scissor) pass.setScissorRect(scissor.x, scissor.y, scissor.width, scissor.height);
        else pass.setScissorRect(0, 0, target.width, target.height);
        clipped = record.clipped;
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

  private newTexture(res: DeviceResources, width: number, height: number, options: TextureOptions): GpuTexture {
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
    const bindGroup = res.device.createBindGroup({
      label: options.label ?? "texture",
      layout: res.textureLayout,
      entries: [
        { binding: 0, resource: res.sampler },
        { binding: 1, resource: texture.createView() },
      ],
    });
    return new GpuTexture(texture, bindGroup, textureBytes(w, h, levels), res.generation, () => this.resources?.generation ?? -1);
  }

  /** Fills the record pool: the frame background, the layers, then the border around the frame. */
  private buildRecords(list: DrawList, view: Viewport, frame: Rect): void {
    this.recordCount = 0;
    setMat(this.solidRecord(list.background, true).uniform.transform, list.width, 0, 0, list.height, 0, 0);
    for (const layer of list.layers) this.layerRecord(layer);
    const border = view.border;
    if (border && border.width > 0 && border.color.a > 0) {
      const w = border.width;
      // Target-px rectangles around the frame, mapped back into project px for the shader.
      this.edgeRecord(border.color, frame.x - w, frame.y - w, frame.width + 2 * w, w);
      this.edgeRecord(border.color, frame.x - w, frame.y + frame.height, frame.width + 2 * w, w);
      this.edgeRecord(border.color, frame.x - w, frame.y, w, frame.height);
      this.edgeRecord(border.color, frame.x + frame.width, frame.y, w, frame.height);
    }
  }

  private nextRecord(kind: PipelineKind, clipped: boolean): DrawRecord {
    const record = (this.recordPool[this.recordCount] ??= newRecord());
    this.recordCount += 1;
    record.kind = kind;
    record.clipped = clipped;
    record.texture0 = null;
    record.texture1 = null;
    const u = record.uniform;
    u.opacity = 1;
    u.flipX = false;
    u.flipY = false;
    u.mix = 0;
    setUv(u.uv, 0, 0, 1, 1);
    setColor(u.color, TRANSPARENT);
    return record;
  }

  private solidRecord(color: RGBA, clipped: boolean): DrawRecord {
    const record = this.nextRecord("solid", clipped);
    setColor(record.uniform.color, color);
    return record;
  }

  /** A solid outside the frame clip: a target-px rectangle mapped back into project px. */
  private edgeRecord(color: RGBA, x: number, y: number, width: number, height: number): void {
    const transform = this.solidRecord(color, false).uniform.transform;
    multiplyInto(transform, this.toProject, setMat(transform, width, 0, 0, height, x, y));
  }

  /** Adds the record of a document layer; layers with a missing or dead texture are skipped. */
  private layerRecord(layer: Layer): void {
    switch (layer.kind) {
      case "texture": {
        if (!(layer.texture instanceof GpuTexture) || !layer.texture.valid) return;
        const record = this.nextRecord("textured", true);
        record.texture0 = layer.texture;
        copyLayer(record, layer.transform, layer.opacity);
        setUv(record.uniform.uv, layer.crop.u0, layer.crop.v0, layer.crop.u1, layer.crop.v1);
        record.uniform.flipX = layer.flipX;
        record.uniform.flipY = layer.flipY;
        return;
      }
      case "dissolve": {
        if (!(layer.from instanceof GpuTexture) || !(layer.to instanceof GpuTexture) || !layer.from.valid || !layer.to.valid) return;
        const record = this.nextRecord("dissolve", true);
        record.texture0 = layer.from;
        record.texture1 = layer.to;
        copyLayer(record, layer.transform, layer.opacity);
        setUv(record.uniform.uv, layer.crop.u0, layer.crop.v0, layer.crop.u1, layer.crop.v1);
        record.uniform.mix = layer.mix;
        return;
      }
      case "solid":
        copyLayer(this.solidRecord(layer.color, true), layer.transform, layer.opacity);
        return;
    }
  }

  private writeUniforms(res: DeviceResources, projectToClip: Mat3): void {
    const count = this.recordCount;
    if (count > res.layerCapacity) this.growLayers(res, count);
    if (this.layerData.length < layerFloats(count)) this.layerData = new Float32Array(layerFloats(res.layerCapacity));
    for (let index = 0; index < count; index++) packLayer(this.layerData, index, (this.recordPool[index] as DrawRecord).uniform);
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

function copyLayer(record: DrawRecord, transform: Mat3, opacity: number): void {
  const t = record.uniform.transform;
  for (let i = 0; i < 6; i++) t[i] = transform[i] as number;
  record.uniform.opacity = opacity;
}

function setUv(uv: UvRect, u0: number, v0: number, u1: number, v1: number): void {
  uv.u0 = u0;
  uv.v0 = v0;
  uv.u1 = u1;
  uv.v1 = v1;
}

function setColor(out: RGBA, color: RGBA): void {
  out.r = color.r;
  out.g = color.g;
  out.b = color.b;
  out.a = color.a;
}

/** The frame (0, 0, width, height in project px) in target px (the viewport is axis-aligned), into `out`. */
function frameRect(out: Rect, transform: Mat3, width: number, height: number): Rect {
  const ax = transform[4];
  const ay = transform[5];
  const bx = transform[0] * width + transform[2] * height + ax;
  const by = transform[1] * width + transform[3] * height + ay;
  out.x = Math.min(ax, bx);
  out.y = Math.min(ay, by);
  out.width = Math.abs(bx - ax);
  out.height = Math.abs(by - ay);
  return out;
}

/** The integer scissor of `rect` inside the target, into `out`; null when nothing of it is visible. */
function clipRect(out: Rect, rect: Rect, width: number, height: number): Rect | null {
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(width, Math.ceil(rect.x + rect.width));
  const y1 = Math.min(height, Math.ceil(rect.y + rect.height));
  if (x1 <= x0 || y1 <= y0) return null;
  out.x = x0;
  out.y = y0;
  out.width = x1 - x0;
  out.height = y1 - y0;
  return out;
}

function premultipliedInto(out: { r: number; g: number; b: number; a: number }, color: RGBA): void {
  out.r = color.r * color.a;
  out.g = color.g * color.a;
  out.b = color.b * color.a;
  out.a = color.a;
}
