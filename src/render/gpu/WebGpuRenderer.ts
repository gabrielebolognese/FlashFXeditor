// The WebGPU backend of `Renderer` (spec §3.1, §9.3, §9.4). Draws a draw list in one render pass with
// premultiplied alpha: a textured-quad pipeline, a two-texture dissolve pipeline (Batch 36) and a
// solid-color pipeline. Per-layer uniforms live in one buffer bound with dynamic offsets; each texture
// gets its bind group once, at creation, so a frame creates no bind groups. Everything GPU-side is
// rebuilt when GpuDevice replaces a lost device; texture handles of the old device turn invalid and
// their owners re-upload on "ready".
import type { RGBA } from "../../core/document/types.js";
import type { DrawList, Layer } from "../compositor/drawList.js";
import { FULL_UV } from "../compositor/drawList.js";
import { applyToPoint, invert, multiply, rectTransform, scaling, type Mat3 } from "../mat3.js";
import type { GpuDevice } from "./GpuDevice.js";
import { layerFloats, LAYER_SIZE, LAYER_STRIDE, packLayer, packMat3, pixelsToClip, VIEW_SIZE, type LayerUniform } from "./layerUniforms.js";
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

interface DrawRecord {
  kind: PipelineKind;
  uniform: LayerUniform;
  textures: GpuTexture[];
  /** Clipped to the frame rectangle (document layers), or not (the border outside it). */
  clipped: boolean;
}

export class WebGpuRenderer implements Renderer {
  private resources: DeviceResources | null = null;
  private readonly canvases = new Set<GpuCanvasTarget>();
  private readonly listeners = new Set<(event: DeviceEvent) => void>();
  private layerData = new Float32Array(layerFloats(INITIAL_LAYERS));
  private readonly viewData = new Float32Array(VIEW_SIZE / 4);
  private readonly canvasFormat: GPUTextureFormat;

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
    const view: Viewport = viewport ?? { transform: scaling(target.width / list.width, target.height / list.height), outside: TRANSPARENT, border: null };
    const toTarget = invert(view.transform);
    if (!toTarget) return false;

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

    const frame = frameRect(view.transform, list.width, list.height);
    const records = this.records(list, view, toTarget, frame);
    this.writeUniforms(res, records, multiply(pixelsToClip(target.width, target.height), view.transform));

    const pipelines = this.pipelines(res, format);
    const scissor = clipRect(frame, target.width, target.height);
    const encoder = res.device.createCommandEncoder({ label: "draw list" });
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: attachment, loadOp: "clear", storeOp: "store", clearValue: premultiplied(view.outside) }],
    });
    let clipped = false;
    records.forEach((record, index) => {
      if (record.clipped && !scissor) return;
      if (record.clipped !== clipped) {
        if (record.clipped && scissor) pass.setScissorRect(scissor.x, scissor.y, scissor.width, scissor.height);
        else pass.setScissorRect(0, 0, target.width, target.height);
        clipped = record.clipped;
      }
      pass.setPipeline(pipelines[record.kind]);
      pass.setBindGroup(0, res.group, [index * LAYER_STRIDE]);
      record.textures.forEach((texture, slot) => pass.setBindGroup(slot + 1, texture.bindGroup));
      pass.draw(4);
    });
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

  private records(list: DrawList, view: Viewport, toProject: Mat3, frame: Rect): DrawRecord[] {
    const solid = (transform: Mat3, color: RGBA, clipped: boolean): DrawRecord => ({
      kind: "solid",
      uniform: { transform, uv: FULL_UV, color, opacity: 1, flipX: false, flipY: false, mix: 0 },
      textures: [],
      clipped,
    });
    const records: DrawRecord[] = [solid(rectTransform(0, 0, list.width, list.height), list.background, true)];
    for (const layer of list.layers) {
      const record = layerRecord(layer);
      if (record) records.push(record);
    }
    const border = view.border;
    if (border && border.width > 0 && border.color.a > 0) {
      const w = border.width;
      // Target-px rectangles around the frame, mapped back into project px for the shader.
      const rects: Rect[] = [
        { x: frame.x - w, y: frame.y - w, width: frame.width + 2 * w, height: w },
        { x: frame.x - w, y: frame.y + frame.height, width: frame.width + 2 * w, height: w },
        { x: frame.x - w, y: frame.y, width: w, height: frame.height },
        { x: frame.x + frame.width, y: frame.y, width: w, height: frame.height },
      ];
      for (const r of rects) records.push(solid(multiply(toProject, rectTransform(r.x, r.y, r.width, r.height)), border.color, false));
    }
    return records;
  }

  private writeUniforms(res: DeviceResources, records: readonly DrawRecord[], projectToClip: Mat3): void {
    if (records.length > res.layerCapacity) this.growLayers(res, records.length);
    const floats = layerFloats(records.length);
    if (this.layerData.length < floats) this.layerData = new Float32Array(layerFloats(res.layerCapacity));
    records.forEach((record, index) => packLayer(this.layerData, index, record.uniform));
    res.device.queue.writeBuffer(res.layerBuffer, 0, this.layerData.buffer, 0, records.length * LAYER_STRIDE);
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

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

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

function layerRecord(layer: Layer): DrawRecord | null {
  const base = { transform: layer.transform, opacity: layer.opacity, color: TRANSPARENT, flipX: false, flipY: false, mix: 0 };
  switch (layer.kind) {
    case "texture":
      if (!(layer.texture instanceof GpuTexture) || !layer.texture.valid) return null;
      return { kind: "textured", uniform: { ...base, uv: layer.crop, flipX: layer.flipX, flipY: layer.flipY }, textures: [layer.texture], clipped: true };
    case "dissolve":
      if (!(layer.from instanceof GpuTexture) || !(layer.to instanceof GpuTexture) || !layer.from.valid || !layer.to.valid) return null;
      return { kind: "dissolve", uniform: { ...base, uv: layer.crop, mix: layer.mix }, textures: [layer.from, layer.to], clipped: true };
    case "solid":
      return { kind: "solid", uniform: { ...base, uv: FULL_UV, color: layer.color }, textures: [], clipped: true };
  }
}

/** The frame (0, 0, width, height in project px) in target px. */
function frameRect(transform: Mat3, width: number, height: number): Rect {
  const a = applyToPoint(transform, 0, 0);
  const b = applyToPoint(transform, width, height);
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}

/** The integer scissor of `rect` inside the target, or null when nothing of it is visible. */
function clipRect(rect: Rect, width: number, height: number): Rect | null {
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(width, Math.ceil(rect.x + rect.width));
  const y1 = Math.min(height, Math.ceil(rect.y + rect.height));
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null;
}

function premultiplied(color: RGBA): GPUColor {
  return { r: color.r * color.a, g: color.g * color.a, b: color.b * color.a, a: color.a };
}
