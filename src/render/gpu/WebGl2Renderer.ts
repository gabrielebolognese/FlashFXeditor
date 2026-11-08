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
// - Vector shapes (Batch 65) as WebGpuRenderer draws them: stencil then cover into a 4x multisampled
//   framebuffer (renderbuffers), resolved with blitFramebuffer into a pooled texture.
import type { RGBA } from "../../core/document/types.js";
import type { DrawList } from "../compositor/drawList.js";
import { IDENTITY, mutableIdentity, setMat, type MutableMat3 } from "../mat3.js";
import type { BackendRenderer } from "./backend.js";
import { blurRegionInto, DrawRecords, newRecordUniform, pathRegionInto, premultipliedInto, ROLE, showBlurred, showPath, writePathUniform, type BlurRegion, type DrawRecord, type QuadKind, type Rect } from "./drawRecords.js";
import { fitWithin, hasAlphaFormat } from "./fitWithin.js";
import type { GlContext } from "./GlContext.js";
import { BLUR_FRAGMENT, COMPOSITE_BACKDROP_FRAGMENT, COMPOSITE_FRAGMENT, DISSOLVE_FRAGMENT, DISSOLVE_VERTEX, FULLSCREEN_VERTEX, LAYER_VERTEX, PATH_COVER_FRAGMENT, PATH_COVER_VERTEX, PATH_STENCIL_FRAGMENT, PATH_STENCIL_VERTEX, SCALE_ALPHA_FRAGMENT, SCALE_FRAGMENT, SOLID_FRAGMENT, TEXTURED_FRAGMENT } from "./glShaders.js";
import { isHdrColorSpace, toneMapToCanvas } from "./hdr.js";
import { layerFloats, LAYER_SIZE, LAYER_STRIDE, packLayer, packMat3, pixelsToClipInto } from "./layerUniforms.js";
import { mipLevelCount, textureBytes } from "./mipmaps.js";
import { unpadAndUnpremultiply } from "./readback.js";
import type { AlphaPlane, CanvasTarget, DeviceEvent, OffscreenTarget, Pane, RenderTarget, TextureHandle, TextureOptions, Viewport } from "./renderer.js";
import { BLUR_KEEP_DRAWS, BLUR_STEP } from "./WebGpuRenderer.js";

const TRANSPARENT: RGBA = { r: 0, g: 0, b: 0, a: 0 };
type DrawRecordPath = ReturnType<DrawRecords<GlTexture>["at"]>["path"];
/** WebGPU's default maxTextureDimension2D (what WebGpuRenderer gets): the same sizes on both backends. */
const MAX_TEXTURE = 8192;
const INITIAL_LAYERS = 64;
/** Floats `packLayer` writes per layer (13 vec4), at its stride of LAYER_STRIDE / 4. */
const LAYER_FLOATS = LAYER_SIZE / 4;
const LAYER_STRIDE_FLOATS = LAYER_STRIDE / 4;
/** As WebGpuRenderer: spare video-frame textures kept at most. */
const MAX_SPARE_FRAMES = 4;
/** As WebGpuRenderer: samples of a shape's scratch, and the steps it grows in. */
const PATH_SAMPLES = 4;
const PATH_STEP = 256;

/** Shapes (Batch 65): the stencil and cover programs, the multisampled scratch and the triangles' buffer. */
interface GlPath {
  stencil: Program;
  cover: Program;
  vao: WebGLVertexArrayObject;
  buffer: WebGLBuffer;
  /** Bytes. */
  capacity: number;
  scratch: { framebuffer: WebGLFramebuffer; color: WebGLRenderbuffer; stencil: WebGLRenderbuffer; width: number; height: number } | null;
}

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
  /** The view (`WebGl2Renderer.viewStamp`) whose matrix it holds. */
  viewDraw: number;
}

/** A group's pictures (spec §21.17), the target's size: its layers and its matte (made on the first matte). */
interface GlGroupTarget {
  width: number;
  height: number;
  picture: GlTexture;
  matte: GlTexture | null;
  /** The draw that last used it. */
  used: number;
}

/** Blend modes and track mattes (Batch 72), built on the first group. */
interface GlComposite {
  /** The hardware modes (normal, screen, add: blend states) and the others (the W3C composite with the backdrop). */
  hardware: Program;
  backdrop: Program;
  groups: GlGroupTarget[];
  /** The copy of the target the non-hardware modes read. */
  copy: GlTexture | null;
  copyUsed: number;
}

/** Everything that belongs to one context generation. */
interface Resources {
  gl: WebGL2RenderingContext;
  generation: number;
  maxTextureSize: number;
  programs: Record<QuadKind, Program>;
  /** The vertex array of quads (no attributes: they come from gl_VertexID). */
  quads: WebGLVertexArrayObject;
  /** Shapes; null until the first one is drawn. */
  path: GlPath | null;
  /** Blend modes and track mattes; null until the first group is drawn. */
  composite: GlComposite | null;
  scale: Program;
  /** `scale` with an alpha plane on unit 1 (Batch 64); linked on the first video with alpha. */
  scaleAlpha: Program | null;
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
  /** Shapes in this draw: their records' indices and regions, a draw's uniform and the packed triangles. */
  private readonly pathIndices: number[] = [];
  private readonly pathRegions: Rect[] = [];
  private readonly pathUniform = newRecordUniform();
  private readonly pathData = new Float32Array(LAYER_STRIDE_FLOATS);
  private pathVertices = new Float32Array(1024);
  /** Draws so far (the blur pool's clock, and which draw a program's view belongs to). */
  private draws = 0;
  /** Bumped whenever the view matrix in `viewData` changes (programs upload it once per stamp). */
  private viewStamp = 0;
  /** The program in use during a pass. */
  private current: Program | null = null;
  /** This draw's group pictures: group g is `groupTargets[g - 1]`. */
  private readonly groupTargets: GlGroupTarget[] = [];
  /** See WebGpuRenderer.backdropCopies. */
  backdropCopies = 0;

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
      // An RGBA frame (an image sequence's, Batch 64) is uploaded whole: scaling it would drop its alpha.
      const { width, height } = hasAlphaFormat(frame) ? { width: frame.displayWidth, height: frame.displayHeight } : fitWithin(frame.displayWidth, frame.displayHeight, options.maxSize);
      const into = this.spareFor(res, width, height);
      const visible = frame.visibleRect;
      // Uploaded as is only when its pixels are its display size (no scaling, square pixels).
      const direct = width === frame.displayWidth && height === frame.displayHeight && visible !== null && visible.width === width && visible.height === height;
      const texture = options.alpha
        ? this.scaleIn(res, frame, width, height, into, options.alpha)
        : isHdrColorSpace(frame.colorSpace)
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
      const composite = res.composite;
      if (composite) {
        for (const entry of composite.groups.splice(0)) {
          entry.picture.destroy();
          entry.matte?.destroy();
        }
        composite.copy?.destroy();
        composite.copy = null;
      }
      this.dropScratch(res);
      this.dropPathScratch(res);
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
    this.pathRecords(res, count);
    this.blurRecords(res, count);
    const { width, height } = target;
    if (this.layerData.length < layerFloats(count)) this.layerData = new Float32Array(layerFloats(Math.max(count, 2 * (this.layerData.length / LAYER_STRIDE_FLOATS))));
    // Blend modes and track mattes (spec §21.17): each group's layers and matte into their pictures first.
    const composite = this.records.groupCount > 0 ? this.groupPasses(res, count, width, height) : null;

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
    gl.viewport(0, 0, width, height);
    gl.disable(gl.SCISSOR_TEST);
    premultipliedInto(this.clear, first.viewport.outside);
    gl.clearColor(this.clear.r, this.clear.g, this.clear.b, this.clear.a);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.SCISSOR_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    this.setView(width, height, topDown);

    const last = this.lastScissor;
    last.width = -1;
    this.current = null;
    for (let index = 0; index < count; index++) {
      const record = this.records.at(index);
      if (record.role !== ROLE.target) continue;
      if (record.kind !== "composite") {
        this.quad(res, index, record, topDown, height);
        continue;
      }
      const group = this.groupTargets[record.group - 1];
      if (!composite || !group) continue;
      const backdrop = this.records.groups[record.group - 1]?.backdrop === true;
      if (backdrop) {
        // A non-hardware mode reads what is below: copy the target (rows top first) into the backdrop.
        const copy = this.backdropCopy(res, composite, width, height);
        const read = topDown && target instanceof GlOffscreenTarget ? this.framebufferOf(res, target.texture.surface) : null;
        const draw = this.framebufferOf(res, copy.surface);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, read);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, draw);
        gl.disable(gl.SCISSOR_TEST);
        if (topDown) gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
        else gl.blitFramebuffer(0, 0, width, height, 0, height, width, 0, gl.COLOR_BUFFER_BIT, gl.NEAREST);
        gl.enable(gl.SCISSOR_TEST);
        gl.bindFramebuffer(gl.FRAMEBUFFER, read);
        last.width = -1;
        this.backdropCopies += 1;
      }
      this.scissor(record, topDown, height);
      const program = backdrop ? composite.backdrop : composite.hardware;
      this.useProgram(program);
      packLayer(this.layerData, index, record.uniform);
      // L_SHAPE: 1 when the target's rows run bottom up (the canvas), and its height.
      const o = index * LAYER_STRIDE_FLOATS + 28;
      this.layerData[o] = topDown ? 0 : 1;
      this.layerData[o + 1] = height;
      gl.uniform4fv(program.layer, this.layerData, index * LAYER_STRIDE_FLOATS, LAYER_FLOATS);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, group.picture.surface.texture);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, group.matte ? group.matte.surface.texture : null);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, backdrop && composite.copy ? composite.copy.surface.texture : null);
      const code = record.uniform.fx?.code ?? 0;
      if (backdrop) gl.disable(gl.BLEND);
      else if (code === SCREEN_CODE) gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_COLOR, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      else if (code === ADD_CODE) gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      // The pictures are drawn into on the next draw: leave none bound.
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, null);
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

  /** Puts the view of a `width` x `height` target (rows top first when `topDown`) into `viewData`. */
  private setView(width: number, height: number, topDown: boolean): void {
    const toClip = pixelsToClipInto(this.toClip, width, height, IDENTITY);
    if (topDown) {
      toClip[1] = -toClip[1];
      toClip[3] = -toClip[3];
      toClip[5] = -toClip[5];
    }
    packMat3(this.viewData, 0, toClip);
    this.viewStamp += 1;
  }

  private useProgram(program: Program): void {
    const { gl } = this.require();
    if (program !== this.current) {
      gl.useProgram(program.program);
      this.current = program;
    }
    if (program.viewDraw !== this.viewStamp) {
      gl.uniform4fv(program.view, this.viewData, 0, 12);
      program.viewDraw = this.viewStamp;
    }
  }

  /** Sets the record's scissor when it differs from the last one set. */
  private scissor(record: DrawRecord<GlTexture>, topDown: boolean, height: number): void {
    const { scissor } = record;
    const last = this.lastScissor;
    if (scissor.x !== last.x || scissor.y !== last.y || scissor.width !== last.width || scissor.height !== last.height) {
      this.require().gl.scissor(scissor.x, topDown ? scissor.y : height - scissor.y - scissor.height, scissor.width, scissor.height);
      last.x = scissor.x;
      last.y = scissor.y;
      last.width = scissor.width;
      last.height = scissor.height;
    }
  }

  /** Draws a quad record (textured, dissolve or solid; a shape is a textured record by now). */
  private quad(res: Resources, index: number, record: DrawRecord<GlTexture>, topDown: boolean, height: number): void {
    const { gl } = res;
    this.scissor(record, topDown, height);
    if (record.kind === "path" || record.kind === "composite" || (record.kind === "textured" && !record.texture0)) return;
    const program = res.programs[record.kind];
    this.useProgram(program);
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

  /**
   * See WebGpuRenderer.groupPasses: each group's layer records into its picture and its matte records
   * into its matte picture (framebuffers, rows top first, cleared transparent).
   */
  private groupPasses(res: Resources, count: number, width: number, height: number): GlComposite {
    const { gl } = res;
    const composite = (res.composite ??= this.buildComposite(res));
    const pool = composite.groups;
    this.groupTargets.length = 0;
    this.setView(width, height, true);
    gl.viewport(0, 0, width, height);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    for (let g = 1; g <= this.records.groupCount; g++) {
      let group: GlGroupTarget | null = null;
      for (const entry of pool) {
        if (entry.width === width && entry.height === height && entry.used !== this.draws && entry.picture.valid) {
          group = entry;
          break;
        }
      }
      if (!group) {
        group = { width, height, picture: this.newTexture(res, width, height, { label: "group picture" }), matte: null, used: this.draws };
        pool.push(group);
      }
      group.used = this.draws;
      this.groupTargets.push(group);
      this.groupPass(res, count, g, ROLE.layers, group.picture, height);
      if (this.records.groups[g - 1]?.matte) {
        group.matte ??= this.newTexture(res, width, height, { label: "group matte" });
        this.groupPass(res, count, g, ROLE.matte, group.matte, height);
      }
    }
    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);
    for (let i = pool.length - 1; i >= 0; i--) {
      const entry = pool[i] as GlGroupTarget;
      if (this.draws - entry.used <= BLUR_KEEP_DRAWS) continue;
      entry.picture.destroy();
      entry.matte?.destroy();
      pool.splice(i, 1);
    }
    if (composite.copy && this.draws - composite.copyUsed > BLUR_KEEP_DRAWS) {
      composite.copy.destroy();
      composite.copy = null;
    }
    return composite;
  }

  private groupPass(res: Resources, count: number, group: number, role: number, into: GlTexture, height: number): void {
    const { gl } = res;
    this.framebufferOf(res, into.surface);
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.SCISSOR_TEST);
    this.lastScissor.width = -1;
    this.current = null;
    for (let index = 0; index < count; index++) {
      const record = this.records.at(index);
      if (record.group === group && record.role === role) this.quad(res, index, record, true, height);
    }
  }

  /** The copy of the target the non-hardware modes read (one, the target's size). */
  private backdropCopy(res: Resources, composite: GlComposite, width: number, height: number): GlTexture {
    if (!composite.copy || !composite.copy.valid || composite.copy.width !== width || composite.copy.height !== height) {
      composite.copy?.destroy();
      composite.copy = this.newTexture(res, width, height, { label: "backdrop" });
    }
    composite.copyUsed = this.draws;
    return composite.copy;
  }

  private buildComposite(res: Resources): GlComposite {
    const { gl } = res;
    const program = (label: string, fragment: string): Program => {
      const made = linkProgram(gl, label, LAYER_VERTEX, fragment);
      gl.useProgram(made);
      gl.uniform1i(gl.getUniformLocation(made, "u_picture"), 0);
      gl.uniform1i(gl.getUniformLocation(made, "u_matte"), 1);
      gl.uniform1i(gl.getUniformLocation(made, "u_backdrop"), 2);
      return { program: made, view: gl.getUniformLocation(made, "u_view"), layer: gl.getUniformLocation(made, "u_layer"), mipmapped: null, blur: null, viewDraw: -1 };
    };
    const composite = { hardware: program("composite", COMPOSITE_FRAGMENT), backdrop: program("composite backdrop", COMPOSITE_BACKDROP_FRAGMENT), groups: [], copy: null, copyUsed: 0 };
    gl.useProgram(null);
    this.current = null;
    return composite;
  }

  /** See WebGpuRenderer.pathRecords: every shape record drawn into a pooled texture, the record pointed at it. */
  private pathRecords(res: Resources, count: number): void {
    const indices = this.pathIndices;
    indices.length = 0;
    let floats = 0;
    let width = 0;
    let height = 0;
    for (let index = 0; index < count; index++) {
      const record = this.records.at(index);
      if (record.kind !== "path" || !record.path) continue;
      const region = pathRegionInto((this.pathRegions[indices.length] ??= { x: 0, y: 0, width: 0, height: 0 }), record);
      if (!region) {
        record.kind = "textured";
        record.path = null;
        record.uniform.opacity = 0;
        record.texture0 = null;
        continue;
      }
      indices.push(index);
      width = Math.max(width, region.width);
      height = Math.max(height, region.height);
      for (const draw of record.path.draws) floats += draw.triangles.length + (draw.clip?.length ?? 0);
    }
    if (indices.length === 0) return;
    const { gl } = res;
    const path = (res.path ??= this.buildPath(res));
    const scratch = this.pathScratch(res, path, width, height);
    if (this.pathVertices.length < floats) this.pathVertices = new Float32Array(Math.max(floats, 2 * this.pathVertices.length));
    let at = 0;
    for (const index of indices) {
      for (const draw of (this.records.at(index).path as NonNullable<DrawRecordPath>).draws) {
        if (draw.clip) {
          this.pathVertices.set(draw.clip, at);
          at += draw.clip.length;
        }
        this.pathVertices.set(draw.triangles, at);
        at += draw.triangles.length;
      }
    }
    gl.bindVertexArray(path.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, path.buffer);
    if (floats * 4 > path.capacity) {
      while (path.capacity < floats * 4) path.capacity *= 2;
      gl.bufferData(gl.ARRAY_BUFFER, path.capacity, gl.DYNAMIC_DRAW);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.pathVertices, 0, floats);

    gl.enable(gl.SCISSOR_TEST);
    gl.enable(gl.STENCIL_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    at = 0;
    let current: Program | null = null;
    const bindProgram = (program: Program) => {
      if (program !== current) {
        gl.useProgram(program.program);
        current = program;
      }
      gl.uniform4fv(program.layer, this.pathData, 0, LAYER_FLOATS);
    };
    const stencilPass = (rule: "nonzero" | "evenodd" | "union", first: number, length: number) => {
      gl.colorMask(false, false, false, false);
      gl.stencilMask(0x7f);
      gl.stencilFunc(gl.ALWAYS, 1, 0xff);
      if (rule === "nonzero") {
        // Front faces count up and back faces down (the winding number, modulo 128); evenodd flips.
        gl.stencilOpSeparate(gl.FRONT, gl.KEEP, gl.KEEP, gl.INCR_WRAP);
        gl.stencilOpSeparate(gl.BACK, gl.KEEP, gl.KEEP, gl.DECR_WRAP);
      } else {
        gl.stencilOp(gl.KEEP, gl.KEEP, rule === "evenodd" ? gl.INVERT : gl.REPLACE);
      }
      gl.drawArrays(gl.TRIANGLES, first / 2, length / 2);
    };
    for (let i = 0; i < indices.length; i++) {
      const record = this.records.at(indices[i] as number);
      const region = this.pathRegions[i] as Rect;
      gl.bindFramebuffer(gl.FRAMEBUFFER, scratch.framebuffer);
      gl.viewport(0, 0, scratch.width, scratch.height);
      // Framebuffers keep row 0 at the top (the matrices turn y): the region is rows 0..height.
      gl.scissor(0, 0, region.width, region.height);
      gl.colorMask(true, true, true, true);
      gl.stencilMask(0xff);
      gl.clearColor(0, 0, 0, 0);
      gl.clearStencil(0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
      for (const draw of (record.path as NonNullable<DrawRecordPath>).draws) {
        writePathUniform(this.pathUniform, record, draw, region, scratch.width, scratch.height, true);
        packLayer(this.pathData, 0, this.pathUniform);
        if (draw.rule === "inside" || draw.rule === "outside") {
          const clip = draw.clip as Float32Array;
          bindProgram(path.stencil);
          stencilPass(draw.clipRule, at, clip.length);
          at += clip.length;
          // The fill's inside into the top bit (0x80), zero elsewhere.
          bindProgram(path.cover);
          gl.stencilMask(0xff);
          gl.stencilFunc(gl.NOTEQUAL, 0x80, 0x7f);
          gl.stencilOp(gl.ZERO, gl.ZERO, gl.REPLACE);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          bindProgram(path.stencil);
          stencilPass("union", at, draw.triangles.length);
          at += draw.triangles.length;
          bindProgram(path.cover);
          gl.colorMask(true, true, true, true);
          gl.stencilMask(0xff);
          gl.stencilFunc(gl.EQUAL, draw.rule === "inside" ? 0x81 : 0x01, 0xff);
        } else {
          bindProgram(path.stencil);
          stencilPass(draw.rule, at, draw.triangles.length);
          at += draw.triangles.length;
          bindProgram(path.cover);
          gl.colorMask(true, true, true, true);
          gl.stencilMask(0xff);
          gl.stencilFunc(gl.NOTEQUAL, 0, 0x7f);
        }
        // Paint where the stencil says inside; clear it everywhere under the cover.
        gl.stencilOp(gl.ZERO, gl.ZERO, gl.ZERO);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      const texture = this.blurTexture(res, region.width, region.height);
      // Bound as both, then the scratch as the one read from.
      this.framebufferOf(res, texture.surface);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, scratch.framebuffer);
      gl.blitFramebuffer(0, 0, region.width, region.height, 0, 0, region.width, region.height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      showPath(record, region, texture);
    }
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);
    gl.colorMask(true, true, true, true);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindVertexArray(res.quads);
  }

  /** The shapes' scratch, at least `width` x `height` (grown in steps, never shrunk until `releaseCaches`). */
  private pathScratch(res: Resources, path: GlPath, width: number, height: number): NonNullable<GlPath["scratch"]> {
    const current = path.scratch;
    if (current && current.width >= width && current.height >= height) return current;
    const { gl } = res;
    const step = (size: number) => Math.min(res.maxTextureSize, Math.ceil(size / PATH_STEP) * PATH_STEP);
    const w = Math.max(step(width), current?.width ?? 0);
    const h = Math.max(step(height), current?.height ?? 0);
    this.dropPathScratch(res);
    const samples = Math.min(PATH_SAMPLES, gl.getParameter(gl.MAX_SAMPLES) as number);
    const color = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, color);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, w, h);
    const stencil = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, stencil);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.STENCIL_INDEX8, w, h);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, color);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.STENCIL_ATTACHMENT, gl.RENDERBUFFER, stencil);
    path.scratch = { framebuffer, color, stencil, width: w, height: h };
    return path.scratch;
  }

  private dropPathScratch(res: Resources): void {
    const scratch = res.path?.scratch;
    if (!scratch || !res.path) return;
    const { gl } = res;
    gl.deleteFramebuffer(scratch.framebuffer);
    gl.deleteRenderbuffer(scratch.color);
    gl.deleteRenderbuffer(scratch.stencil);
    res.path.scratch = null;
  }

  private buildPath(res: Resources): GlPath {
    const { gl } = res;
    const program = (label: string, vertex: string, fragment: string): Program => {
      const made = linkProgram(gl, label, vertex, fragment);
      return { program: made, view: null, layer: gl.getUniformLocation(made, "u_layer"), mipmapped: null, blur: null, viewDraw: -1 };
    };
    const vao = gl.createVertexArray();
    const buffer = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    const capacity = 64 * 1024;
    gl.bufferData(gl.ARRAY_BUFFER, capacity, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.bindVertexArray(res.quads);
    return {
      stencil: program("shape stencil", PATH_STENCIL_VERTEX, PATH_STENCIL_FRAGMENT),
      cover: program("shape cover", PATH_COVER_VERTEX, PATH_COVER_FRAGMENT),
      vao,
      buffer,
      capacity,
      scratch: null,
    };
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
  private scaleIn(res: Resources, frame: VideoFrame, width: number, height: number, into: GlTexture | null, alpha?: AlphaPlane): GlTexture {
    const texture = into ?? this.newTexture(res, width, height, { mipmaps: false }, true);
    let alphaTexture: WebGLTexture | null = null;
    try {
      const { gl } = res;
      bindTexture(gl, this.scratchFor(res, frame));
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, frame);
      if (alpha) {
        // The alpha bytes as an R8 texture on unit 1 (rows are tightly packed: UNPACK_ALIGNMENT is 1).
        alphaTexture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, alphaTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, alpha.width, alpha.height, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array(alpha.data));
        setSampling(gl, 1);
        gl.activeTexture(gl.TEXTURE0);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebufferOf(res, texture.surface));
      gl.viewport(0, 0, texture.width, texture.height);
      gl.disable(gl.SCISSOR_TEST);
      gl.disable(gl.BLEND);
      gl.useProgram(alpha ? this.alphaProgram(res).program : res.scale.program);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      if (alphaTexture) gl.deleteTexture(alphaTexture);
    } catch (error) {
      if (alphaTexture) res.gl.deleteTexture(alphaTexture);
      texture.destroy();
      throw error;
    }
    return texture;
  }

  /** The scale program with the alpha plane (u_alpha on unit 1), linked on first use. */
  private alphaProgram(res: Resources): Program {
    if (res.scaleAlpha) return res.scaleAlpha;
    const { gl } = res;
    const made = linkProgram(gl, "scale alpha", FULLSCREEN_VERTEX, SCALE_ALPHA_FRAGMENT);
    gl.useProgram(made);
    gl.uniform1i(gl.getUniformLocation(made, "u_source"), 0);
    gl.uniform1i(gl.getUniformLocation(made, "u_alpha"), 1);
    res.scaleAlpha = { program: made, view: null, layer: null, mipmapped: null, blur: null, viewDraw: -1 };
    return res.scaleAlpha;
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
    const quads = gl.createVertexArray();
    gl.bindVertexArray(quads);
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
      scaleAlpha: null,
      blurProgram: program("blur", FULLSCREEN_VERTEX, BLUR_FRAGMENT, ["u_source"]),
      scratch: null,
      blurPool: [],
      quads,
      path: null,
      composite: null,
    };
    gl.useProgram(null);
    return resources;
  }
}

/** Blend codes (`BLEND_MODES` indices) of the hardware modes besides normal. */
const SCREEN_CODE = 5;
const ADD_CODE = 7;

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
