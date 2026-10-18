// The WebGL2 backend of `Renderer` (Batch 48, spec §3.1: machines without WebGPU). It draws what
// WebGpuRenderer draws: the same records (`DrawRecords`), the GLSL ports of its shaders (glShaders.ts)
// for textured quads with the footprint taps, the cross dissolve, solids with shapes and gradients, the
// two blur passes and the scaled upload of a video frame, premultiplied alpha throughout.
// - One context (GlContext) owns every texture. A canvas target on another canvas (the preview) gets a
//   `bitmaprenderer` context: the draw goes to the context's own canvas, handed over with
//   transferToImageBitmap (no copy). The context's own canvas as a target (the export's frame canvas,
//   which VideoFrames are made from) is drawn directly.
// - Textures are immutable RGBA8 (`texStorage2D`); uploads are premultiplied (images, text rasters)
//   and keep their top row at row 0. Offscreen targets are framebuffers drawn the same way up (the view
//   turns target px y so row 0 is the top), so textures are sampled and read back as WebGPU's are; only
//   the canvas is drawn the other way (GL's window origin is the bottom-left).
// - A frame shown smaller than it is (`TextureOptions.maxSize`) is uploaded whole into a scratch
//   texture and drawn at its size with the footprint taps; HDR frames go through the color-managed 2D
//   canvas (hdr.ts). Spare video-frame textures are reused as WebGPU's are.
// - Per-record uniforms (packLayer's 13 vec4) go through uniform4fv with an offset into one array: a
//   frame allocates nothing on our side. A lost context drops everything; owners re-upload on "ready".
import type { RGBA } from "../../core/document/types.js";
import type { DrawList } from "../compositor/drawList.js";
import { IDENTITY, mutableIdentity, setMat, type MutableMat3 } from "../mat3.js";
import type { BackendRenderer } from "./backend.js";
import { blurRegionInto, DrawRecords, premultipliedInto, showBlurred, type BlurRegion, type RecordKind } from "./drawRecords.js";
import { fitWithin } from "./fitWithin.js";
import type { GlContext } from "./GlContext.js";
import { BLUR_FRAGMENT, DISSOLVE_FRAGMENT, DISSOLVE_VERTEX, FULLSCREEN_VERTEX, LAYER_VERTEX, SCALE_FRAGMENT, SOLID_FRAGMENT, TEXTURED_FRAGMENT } from "./glShaders.js";
import { isHdrColorSpace, toneMapToCanvas } from "./hdr.js";
import { layerFloats, LAYER_SIZE, LAYER_STRIDE, packLayer, packMat3, pixelsToClipInto } from "./layerUniforms.js";
import { mipLevelCount, textureBytes } from "./mipmaps.js";
import { unpadAndUnpremultiply } from "./readback.js";
import type { CanvasTarget, DeviceEvent, OffscreenTarget, Pane, RenderTarget, TextureHandle, TextureOptions, Viewport } from "./renderer.js";
import { BLUR_KEEP_DRAWS, BLUR_STEP } from "./WebGpuRenderer.js";

const TRANSPARENT: RGBA = { r: 0, g: 0, b: 0, a: 0 };
/** WebGPU's default maxTextureDimension2D (what WebGpuRenderer gets): the same sizes on both backends. */
const MAX_TEXTURE = 8192;
const INITIAL_LAYERS = 64;
/** Floats `packLayer` writes per layer (13 vec4), at its stride of LAYER_STRIDE / 4. */
const LAYER_FLOATS = LAYER_SIZE / 4;
const LAYER_STRIDE_FLOATS = LAYER_STRIDE / 4;
/** As WebGpuRenderer: spare video-frame textures kept at most. */
const MAX_SPARE_FRAMES = 4;

/** A GL texture and its framebuffer (made when it is first rendered into). */
interface Surface {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer | null;
  width: number;
  height: number;
  levels: number;
  bytes: number;
  generation: number;
  /** Video frames: mutable storage, each frame uploaded with texImage2D (see `newTexture`). */
  mutable: boolean;
}

interface SurfaceOwner {
  generation(): number;
  /** Takes a destroyed handle's surface back: kept as a spare (`recycle`) or deleted. */
  release(surface: Surface, recycle: boolean): void;
}

class GlTexture implements TextureHandle {
  private destroyed = false;

  constructor(
    readonly surface: Surface,
    private readonly owner: SurfaceOwner,
    /** Video frames: the surface goes back to the spares. */
    private readonly recycles: boolean,
  ) {}

  get width(): number {
    return this.surface.width;
  }

  get height(): number {
    return this.surface.height;
  }

  get mipLevels(): number {
    return this.surface.levels;
  }

  get bytes(): number {
    return this.surface.bytes;
  }

  get valid(): boolean {
    return !this.destroyed && this.surface.generation === this.owner.generation();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.owner.release(this.surface, this.recycles);
  }
}

class GlCanvasTarget implements CanvasTarget {
  readonly kind = "canvas";

  constructor(
    readonly canvas: HTMLCanvasElement | OffscreenCanvas,
    /** Where the drawn picture is handed over; null for the context's own canvas (drawn directly). */
    readonly presenter: ImageBitmapRenderingContext | null,
  ) {}

  get width(): number {
    return this.canvas.width;
  }

  get height(): number {
    return this.canvas.height;
  }
}

class GlOffscreenTarget implements OffscreenTarget {
  readonly kind = "offscreen";

  constructor(public texture: GlTexture) {}

  get width(): number {
    return this.texture.width;
  }

  get height(): number {
    return this.texture.height;
  }
}

interface Program {
  program: WebGLProgram;
  view: WebGLUniformLocation | null;
  layer: WebGLUniformLocation | null;
  mipmapped: WebGLUniformLocation | null;
  blur: WebGLUniformLocation | null;
  /** The draw whose view matrix it holds. */
  viewDraw: number;
}

/** Everything that belongs to one context generation. */
interface Resources {
  gl: WebGL2RenderingContext;
  generation: number;
  maxTextureSize: number;
  programs: Record<RecordKind, Program>;
  scale: Program;
  blurProgram: Program;
  /** The whole frame of a scaled upload (`scaleIn`), reallocated when the frame size changes. */
  scratch: { texture: WebGLTexture; width: number; height: number; bytes: number } | null;
  blurPool: { texture: GlTexture; used: number }[];
}

export class WebGl2Renderer implements BackendRenderer {
  readonly backend = "webgl2";
  private resources: Resources | null = null;
  private readonly listeners = new Set<(event: DeviceEvent) => void>();
  private readonly spares: Surface[] = [];
  private hdrCanvas: OffscreenCanvas | null = null;
  private readonly counts = { generation: -1, live: 0, bytes: 0 };
  // Scratch state of `draw`, reused so a frame allocates nothing on our side.
  private readonly records = new DrawRecords<GlTexture>((texture): texture is GlTexture => texture instanceof GlTexture && texture.valid);
  private layerData = new Float32Array(layerFloats(INITIAL_LAYERS));
  private readonly viewData = new Float32Array(12);
  private readonly blurData = new Float32Array(12);
  private readonly fillView: Viewport & { transform: MutableMat3 } = { transform: mutableIdentity(), outside: TRANSPARENT, border: null };
  private readonly fillPane: Pane & { bounds: { x: number; y: number; width: number; height: number } } = { list: { width: 0, height: 0, background: TRANSPARENT, layers: [] }, viewport: this.fillView, bounds: { x: 0, y: 0, width: 0, height: 0 } };
  private readonly fillPanes: Pane[] = [this.fillPane];
  private readonly toClip = mutableIdentity();
  private readonly clear = { r: 0, g: 0, b: 0, a: 0 };
  private readonly lastScissor = { x: 0, y: 0, width: 0, height: 0 };
  private readonly blurRegion: BlurRegion = { x: 0, y: 0, width: 0, height: 0, sigma: 0, reach: 0 };
  private readonly blurGrow = mutableIdentity();
  /** Draws so far (the blur pool's clock, and which draw a program's view belongs to). */
  private draws = 0;

  private readonly owner: SurfaceOwner = {
    generation: () => this.resources?.generation ?? -1,
    release: (surface, recycle) => {
      const res = this.resources;
      if (!res || surface.generation !== res.generation) return;
      if (recycle && this.spares.length < MAX_SPARE_FRAMES) {
        this.spares.push(surface);
        return;
      }
      this.deleteSurface(res, surface);
    },
  };

  constructor(private readonly context: GlContext) {
    context.subscribe((state) => {
      const had = this.resources !== null;
      // Objects of a lost context are gone with it.
      this.resources = null;
      this.spares.length = 0;
      Object.assign(this.counts, { generation: context.generation, live: 0, bytes: 0 });
      const gl = context.gl;
      if (state === "ready" && gl) {
        this.resources = this.build(gl, context.generation);
        this.emit("ready");
      } else if (had) {
        this.emit("lost");
      }
    });
  }

  get ready(): boolean {
    return this.resources !== null;
  }

  get textureCounts(): { live: number; bytes: number } {
    return { live: this.counts.live, bytes: this.counts.bytes };
  }

  get maxTextureSize(): number {
    return this.resources?.maxTextureSize ?? MAX_TEXTURE;
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
      const visible = frame.visibleRect;
      // Uploaded as is only when its pixels are its display size (no scaling, square pixels).
      const direct = width === frame.displayWidth && height === frame.displayHeight && visible !== null && visible.width === width && visible.height === height;
      const texture = isHdrColorSpace(frame.colorSpace)
        ? this.toneMapIn(res, frame, width, height, into)
        : direct
          ? this.copyIn(res, frame, width, height, { mipmaps: false, ...options }, into, true)
          : this.scaleIn(res, frame, width, height, into);
      // Sends the copy now, as WebGpuRenderer submits it: the decoder gets the frame's buffer back sooner.
      res.gl.flush();
      return texture;
    } finally {
      frame.close();
    }
  }

  createCanvasTarget(canvas: HTMLCanvasElement | OffscreenCanvas): CanvasTarget {
    let presenter: ImageBitmapRenderingContext | null = null;
    if (canvas !== this.context.canvas) {
      presenter = canvas.getContext("bitmaprenderer") as ImageBitmapRenderingContext | null;
      if (!presenter) throw new Error("This canvas has no bitmaprenderer context");
    }
    return new GlCanvasTarget(canvas, presenter);
  }

  createOffscreenTarget(width: number, height: number): OffscreenTarget {
    return new GlOffscreenTarget(this.newTexture(this.require(), width, height, { label: "offscreen target" }));
  }

  resize(target: RenderTarget, width: number, height: number): void {
    const w = this.clampSize(width);
    const h = this.clampSize(height);
    if (target instanceof GlCanvasTarget) {
      if (target.canvas.width !== w) target.canvas.width = w;
      if (target.canvas.height !== h) target.canvas.height = h;
    } else if (target instanceof GlOffscreenTarget) {
      if (target.width === w && target.height === h && target.texture.valid) return;
      target.texture.destroy();
      target.texture = this.newTexture(this.require(), w, h, { label: "offscreen target" });
    }
  }

  releaseCaches(): void {
    const res = this.resources;
    for (const surface of this.spares.splice(0)) if (res) this.deleteSurface(res, surface);
    if (res) {
      for (const entry of res.blurPool.splice(0)) entry.texture.destroy();
      this.dropScratch(res);
    }
    this.hdrCanvas = null;
  }

  releaseTarget(target: RenderTarget): void {
    if (target instanceof GlCanvasTarget) {
      target.presenter?.transferFromImageBitmap(null);
    } else if (target instanceof GlOffscreenTarget) {
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
    if (!(target instanceof GlCanvasTarget) && !(target instanceof GlOffscreenTarget)) return false;

    const { gl } = res;
    // Lost before its event arrived: nothing can be drawn or handed over until "ready".
    if (gl.isContextLost()) return false;
    const count = this.records.build(panes, target.width, target.height);
    this.draws += 1;
    this.blurRecords(res, count);

    // Framebuffers keep row 0 at the top: the view turns y for them.
    let topDown: boolean;
    if (target instanceof GlCanvasTarget) {
      const own = this.context.canvas;
      if (own.width !== target.width) own.width = target.width;
      if (own.height !== target.height) own.height = target.height;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      topDown = false;
    } else {
      if (!target.texture.valid) this.resize(target, target.width, target.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebufferOf(res, target.texture.surface));
      topDown = true;
    }
    const { width, height } = target;
    gl.viewport(0, 0, width, height);
    gl.disable(gl.SCISSOR_TEST);
    premultipliedInto(this.clear, first.viewport.outside);
    gl.clearColor(this.clear.r, this.clear.g, this.clear.b, this.clear.a);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.SCISSOR_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const toClip = pixelsToClipInto(this.toClip, width, height, IDENTITY);
    if (topDown) {
      toClip[1] = -toClip[1];
      toClip[3] = -toClip[3];
      toClip[5] = -toClip[5];
    }
    packMat3(this.viewData, 0, toClip);
    if (this.layerData.length < layerFloats(count)) this.layerData = new Float32Array(layerFloats(Math.max(count, 2 * (this.layerData.length / LAYER_STRIDE_FLOATS))));

    const last = this.lastScissor;
    last.width = -1;
    let current: Program | null = null;
    for (let index = 0; index < count; index++) {
      const record = this.records.at(index);
      const { scissor } = record;
      if (scissor.x !== last.x || scissor.y !== last.y || scissor.width !== last.width || scissor.height !== last.height) {
        gl.scissor(scissor.x, topDown ? scissor.y : height - scissor.y - scissor.height, scissor.width, scissor.height);
        last.x = scissor.x;
        last.y = scissor.y;
        last.width = scissor.width;
        last.height = scissor.height;
      }
      const program = res.programs[record.kind];
      if (program !== current) {
        gl.useProgram(program.program);
        current = program;
      }
      if (program.viewDraw !== this.draws) {
        gl.uniform4fv(program.view, this.viewData, 0, 12);
        program.viewDraw = this.draws;
      }
      packLayer(this.layerData, index, record.uniform);
      gl.uniform4fv(program.layer, this.layerData, index * LAYER_STRIDE_FLOATS, LAYER_FLOATS);
      const texture0 = record.texture0;
      if (texture0) {
        bindTexture(gl, texture0.surface.texture);
        if (program.mipmapped) gl.uniform1f(program.mipmapped, texture0.mipLevels > 1 ? 1 : 0);
      }
      if (record.texture1) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, record.texture1.surface.texture);
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);
    if (target instanceof GlCanvasTarget && target.presenter) target.presenter.transferFromImageBitmap(this.context.canvas.transferToImageBitmap());
    return true;
  }

  async readBitmap(target: OffscreenTarget): Promise<ImageBitmap> {
    const res = this.require();
    if (!(target instanceof GlOffscreenTarget) || !target.texture.valid || res.gl.isContextLost()) throw new Error("The render target is not valid on this context");
    const { width, height } = target;
    const { gl } = res;
    const pixels = new Uint8Array(width * height * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebufferOf(res, target.texture.surface));
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // Rows come top first (framebuffers are drawn that way up), premultiplied.
    return createImageBitmap(new ImageData(unpadAndUnpremultiply(pixels, width, height, width * 4), width, height), { premultiplyAlpha: "none" });
  }

  /**
   * Blurs the source of every blurred record into a pooled texture (two passes before the draw's own)
   * and points the record at it: the quad grown by the blur's reach on each side.
   */
  private blurRecords(res: Resources, count: number): void {
    const { gl } = res;
    let blurred = false;
    for (let index = 0; index < count; index++) {
      const record = this.records.at(index);
      const region = blurRegionInto(this.blurRegion, record);
      const source = record.texture0;
      if (!region || !source) continue;
      if (!blurred) {
        gl.useProgram(res.blurProgram.program);
        gl.disable(gl.BLEND);
        blurred = true;
      }
      const { x, y, width, height, sigma, reach } = region;
      const w = width + 2 * reach;
      const h = height + 2 * reach;
      const across = this.blurTexture(res, w, h);
      const down = this.blurTexture(res, w, h);
      this.blurPass(res, source, across, w, h, x, y, width, height, 1, 0, sigma, reach, reach);
      this.blurPass(res, across, down, w, h, 0, 0, w, h, 0, 1, sigma, reach, 0);
      showBlurred(record, region, down, this.blurGrow);
    }
    // Textures no draw used for a while go.
    const pool = res.blurPool;
    for (let i = pool.length - 1; i >= 0; i--) {
      const entry = pool[i] as { texture: GlTexture; used: number };
      if (this.draws - entry.used > BLUR_KEEP_DRAWS) {
        entry.texture.destroy();
        pool.splice(i, 1);
      }
    }
  }

  /** A pooled texture at least `width` x `height` not used yet in this draw. */
  private blurTexture(res: Resources, width: number, height: number): GlTexture {
    for (const entry of res.blurPool) {
      const { texture } = entry;
      if (entry.used === this.draws || texture.width < width || texture.height < height || texture.width > 2 * width + BLUR_STEP || texture.height > 2 * height + BLUR_STEP) continue;
      entry.used = this.draws;
      return texture;
    }
    const step = (size: number) => Math.min(this.maxTextureSize, Math.ceil(size / BLUR_STEP) * BLUR_STEP);
    const texture = this.newTexture(res, step(width), step(height), { label: "blur" });
    res.blurPool.push({ texture, used: this.draws });
    return texture;
  }

  private blurPass(res: Resources, source: GlTexture, target: GlTexture, width: number, height: number, x: number, y: number, regionWidth: number, regionHeight: number, dirX: number, dirY: number, sigma: number, reach: number, pad: number): void {
    const { gl } = res;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebufferOf(res, target.surface));
    gl.viewport(0, 0, target.width, target.height);
    // Cleared whole, as the WebGPU pass is: the draw samples its edge bilinearly.
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(0, 0, Math.min(width, target.width), Math.min(height, target.height));
    const d = this.blurData;
    d[0] = x;
    d[1] = y;
    d[2] = regionWidth;
    d[3] = regionHeight;
    d[4] = dirX;
    d[5] = dirY;
    d[6] = sigma;
    d[7] = reach;
    d[8] = pad;
    d[9] = pad;
    gl.uniform4fv(res.blurProgram.blur, d, 0, 12);
    bindTexture(gl, source.surface.texture);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private emit(event: DeviceEvent): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch (error) {
        console.error(`[gl] ${event} listener failed`, error);
      }
    }
  }

  private require(): Resources {
    if (!this.resources) throw new Error("The GPU device is not ready");
    return this.resources;
  }

  private clampSize(size: number): number {
    return Math.min(this.maxTextureSize, Math.max(1, Math.round(size)));
  }

  /** A texture holding `source`: `into` (a recycled one) or a new one. A failed copy destroys the texture before rethrowing (P13). */
  private copyIn(res: Resources, source: ImageBitmap | OffscreenCanvas | VideoFrame, width: number, height: number, options: TextureOptions, into: GlTexture | null = null, recycles = false): GlTexture {
    const texture = into ?? this.newTexture(res, width, height, options, recycles);
    try {
      const { gl } = res;
      bindTexture(gl, texture.surface.texture);
      if (texture.surface.mutable) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
      else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
      if (texture.mipLevels > 1) gl.generateMipmap(gl.TEXTURE_2D);
    } catch (error) {
      texture.destroy();
      throw error;
    }
    return texture;
  }

  /**
   * A `width` x `height` texture showing the whole frame: the frame is uploaded whole into the scratch
   * texture and drawn once at the smaller size with the footprint taps (SCALE_FRAGMENT).
   */
  private scaleIn(res: Resources, frame: VideoFrame, width: number, height: number, into: GlTexture | null): GlTexture {
    const texture = into ?? this.newTexture(res, width, height, { mipmaps: false }, true);
    try {
      const { gl } = res;
      bindTexture(gl, this.scratchFor(res, frame));
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, frame);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebufferOf(res, texture.surface));
      gl.viewport(0, 0, texture.width, texture.height);
      gl.disable(gl.SCISSOR_TEST);
      gl.disable(gl.BLEND);
      gl.useProgram(res.scale.program);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    } catch (error) {
      texture.destroy();
      throw error;
    }
    return texture;
  }

  /**
   * The scratch texture for a whole frame (of its visible size: what a VideoFrame upload writes,
   * measured), counted as one live texture. Mutable: frames are uploaded with texImage2D, as video
   * textures are (see `newTexture`).
   */
  private scratchFor(res: Resources, frame: VideoFrame): WebGLTexture {
    const width = frame.visibleRect?.width ?? frame.displayWidth;
    const height = frame.visibleRect?.height ?? frame.displayHeight;
    const scratch = res.scratch;
    if (scratch?.width === width && scratch.height === height) return scratch.texture;
    this.dropScratch(res);
    const { gl } = res;
    const texture = gl.createTexture();
    bindTexture(gl, texture);
    setSampling(gl, 1);
    const bytes = textureBytes(width, height, 1);
    res.scratch = { texture, width, height, bytes };
    this.counts.live += 1;
    this.counts.bytes += bytes;
    return texture;
  }

  private dropScratch(res: Resources): void {
    const scratch = res.scratch;
    if (!scratch) return;
    res.gl.deleteTexture(scratch.texture);
    res.scratch = null;
    this.counts.live -= 1;
    this.counts.bytes -= scratch.bytes;
  }

  /** An HDR frame drawn through the color-managed 2D canvas (hdr.ts, Batch 47), then uploaded. */
  private toneMapIn(res: Resources, frame: VideoFrame, width: number, height: number, into: GlTexture | null): GlTexture {
    let canvas: OffscreenCanvas;
    try {
      canvas = this.hdrCanvas = toneMapToCanvas(this.hdrCanvas, frame, this.clampSize(width), this.clampSize(height));
    } catch (error) {
      into?.destroy();
      throw error;
    }
    return this.copyIn(res, canvas, canvas.width, canvas.height, { mipmaps: false }, into, true);
  }

  /** A spare video-frame texture of this size, wrapped in a new handle; null when there is none. */
  private spareFor(res: Resources, width: number, height: number): GlTexture | null {
    const w = this.clampSize(width);
    const h = this.clampSize(height);
    const at = this.spares.findIndex((spare) => spare.generation === res.generation && spare.width === w && spare.height === h);
    if (at === -1) return null;
    const surface = this.spares.splice(at, 1)[0] as Surface;
    return new GlTexture(surface, this.owner, true);
  }

  /**
   * A `width` x `height` RGBA8 texture. Video-frame textures (`recycles`) have mutable storage and take
   * each frame with texImage2D: in Chrome 155 a VideoFrame written with texSubImage2D into immutable
   * storage held the decoder's buffers longer (4K playback at Full: 88-131 dropped of 155 frames
   * against 21-28). Other textures are immutable (`texStorage2D`, with their mips).
   */
  private newTexture(res: Resources, width: number, height: number, options: TextureOptions, recycles = false): GlTexture {
    const w = this.clampSize(width);
    const h = this.clampSize(height);
    const levels = options.mipmaps ? mipLevelCount(w, h) : 1;
    const { gl } = res;
    const texture = gl.createTexture();
    bindTexture(gl, texture);
    if (recycles) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    else gl.texStorage2D(gl.TEXTURE_2D, levels, gl.RGBA8, w, h);
    setSampling(gl, levels);
    const bytes = textureBytes(w, h, levels);
    if (this.counts.generation === res.generation) {
      this.counts.live += 1;
      this.counts.bytes += bytes;
    }
    return new GlTexture({ texture, framebuffer: null, width: w, height: h, levels, bytes, generation: res.generation, mutable: recycles }, this.owner, recycles);
  }

  private deleteSurface(res: Resources, surface: Surface): void {
    res.gl.deleteTexture(surface.texture);
    if (surface.framebuffer) res.gl.deleteFramebuffer(surface.framebuffer);
    if (this.counts.generation === surface.generation) {
      this.counts.live -= 1;
      this.counts.bytes -= surface.bytes;
    }
  }

  /** The surface's framebuffer, bound. */
  private framebufferOf(res: Resources, surface: Surface): WebGLFramebuffer {
    const { gl } = res;
    if (surface.framebuffer) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, surface.framebuffer);
      return surface.framebuffer;
    }
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, surface.texture, 0);
    surface.framebuffer = framebuffer;
    return framebuffer;
  }

  private build(gl: WebGL2RenderingContext, generation: number): Resources {
    // Uploads keep their top row first and are premultiplied (images and text rasters with alpha).
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    // Quads come from gl_VertexID: an empty vertex array.
    gl.bindVertexArray(gl.createVertexArray());
    const limits = [gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), ...(gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array)] as number[];
    const program = (label: string, vertex: string, fragment: string, samplers: readonly string[]): Program => {
      const made = linkProgram(gl, label, vertex, fragment);
      gl.useProgram(made);
      samplers.forEach((name, unit) => gl.uniform1i(gl.getUniformLocation(made, name), unit));
      return {
        program: made,
        view: gl.getUniformLocation(made, "u_view"),
        layer: gl.getUniformLocation(made, "u_layer"),
        mipmapped: gl.getUniformLocation(made, "u_mipmapped"),
        blur: gl.getUniformLocation(made, "u_blur"),
        viewDraw: -1,
      };
    };
    const resources: Resources = {
      gl,
      generation,
      maxTextureSize: Math.min(MAX_TEXTURE, ...limits),
      programs: {
        textured: program("textured", LAYER_VERTEX, TEXTURED_FRAGMENT, ["u_source"]),
        dissolve: program("dissolve", DISSOLVE_VERTEX, DISSOLVE_FRAGMENT, ["u_from", "u_to"]),
        solid: program("solid", LAYER_VERTEX, SOLID_FRAGMENT, []),
      },
      scale: program("scale", FULLSCREEN_VERTEX, SCALE_FRAGMENT, ["u_source"]),
      blurProgram: program("blur", FULLSCREEN_VERTEX, BLUR_FRAGMENT, ["u_source"]),
      scratch: null,
      blurPool: [],
    };
    gl.useProgram(null);
    return resources;
  }
}

/** Binds `texture` on unit 0 (uploads, passes and textured layers sample unit 0). */
function bindTexture(gl: WebGL2RenderingContext, texture: WebGLTexture): void {
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
}

/** Linear filtering (trilinear with mips), clamped at the edges: WebGpuRenderer's layer sampler. */
function setSampling(gl: WebGL2RenderingContext, levels: number): void {
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, levels > 1 ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

/** Compiles and links a program; errors are logged (a context being lost reports none). */
function linkProgram(gl: WebGL2RenderingContext, label: string, vertex: string, fragment: string): WebGLProgram {
  const shader = (type: number, source: string) => {
    const made = gl.createShader(type);
    if (!made) throw new Error(`[gl] ${label}: no shader`);
    gl.shaderSource(made, source);
    gl.compileShader(made);
    return made;
  };
  const vs = shader(gl.VERTEX_SHADER, vertex);
  const fs = shader(gl.FRAGMENT_SHADER, fragment);
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
    const logs = [gl.getShaderInfoLog(vs), gl.getShaderInfoLog(fs), gl.getProgramInfoLog(program)].filter(Boolean).join(" ");
    console.error(`[gl] ${label} program: ${logs}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return program;
}
