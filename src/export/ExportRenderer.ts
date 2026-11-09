// The export's frames (spec §16, §9.4 "the same code path renders the preview and the export"), in
// export.worker: its own GPU device and renderer of the preview's backend (WebGPU, or WebGL2 since
// Batch 48: its context lives on the frame canvas, drawn directly), texture pool (a share of the
// budget), frame and image services with their own decode sessions (decodeHandlers reached
// in-thread), fonts, text rasters and compositor, drawing each frame into an OffscreenCanvas of the
// export size.
// - Frames come from `LayerTextures.resolveExact`, the Export frame path: every video at its exact
//   full-resolution frame (never a proxy), at its own size or twice its drawn size, text at its exact
//   scale, animations, captions, transitions, solids and images as the preview draws them.
// - Fonts (spec §20.1 Workers): the core faces (from the library folder under the app's base URL) and
//   the faces the main thread hands over (the project's copies, library files, My fonts files) are
//   added to the worker's font set, and the faces the range's text needs are loaded before the first
//   frame (layouts are never measured with a stand-in).
// - Offline media draw slates (spec §6.19); a video this worker cannot open or decode becomes one too,
//   also when its decoder refuses it partway (the frame is drawn again with the slate).
// - A lost GPU device (driver reset, GPU process crash) fails the job (Batch 47): the device is not
//   replaced mid-export, where textures of the old device would be skipped without a word.
// - SVG images arrive rasterized (workers cannot draw SVG) and are resized here to the size asked.
// Browser only (WebGPU, WebCodecs, OffscreenCanvas): checked in the browser, not by unit tests.
import type { Frame, MediaId, Project } from "../core/document/types.js";
import { TexturePool } from "../media/cache/TexturePool.js";
import { FrameService } from "../media/decode/FrameService.js";
import { ImageService } from "../media/decode/ImageService.js";
import { DECODE_CONCURRENCY, DECODE_IMMEDIATE, decodeHandlers } from "../media/workers/decodeHandlers.js";
import { loopbackWorker } from "../media/workers/loopback.js";
import type { WorkerKind } from "../media/workers/protocol.js";
import { WorkerPool, type WorkerLike } from "../media/workers/WorkerPool.js";
import { Compositor, type OfflineSlates } from "../render/compositor/Compositor.js";
import type { BackendRenderer, RenderDevice } from "../render/gpu/backend.js";
import { createBackend } from "../render/gpu/createBackend.js";
import type { CanvasTarget, OffscreenTarget } from "../render/gpu/renderer.js";
import { DETAIL_MAX_SIZE } from "../render/preview/detail.js";
import { CompoundTargets } from "../render/preview/CompoundTargets.js";
import { LayerTextures } from "../render/preview/LayerTextures.js";
import { FontLibrary } from "../render/text/FontLibrary.js";
import { TextRasterCache } from "../render/text/TextRasterCache.js";
import { exportNeeds } from "./inputs.js";
import { lutLibrary } from "../render/effects/lutLibrary.js";
import type { ExportJobParams } from "./job.js";

/** The slate line of a video the export cannot open or decode (the preview's "failed" label). */
const FAILED_LABEL = "Media can't be played";

const noWorker = (kind: WorkerKind) => (): WorkerLike => {
  throw new Error(`The export has no ${kind} worker`);
};

/** The error of an export whose GPU device was lost. */
export const DEVICE_LOST_MESSAGE = "The GPU was reset during the export (device lost). Export again.";

/** Whether the export reads pixels back (PNG sequence, GIF, transparent WebM) rather than wrapping the canvas in a VideoFrame. */
export function needsPixels(format: Pick<ExportJobParams["format"], "container" | "transparent">): boolean {
  return format.container === "png" || format.container === "gif" || format.transparent === true;
}

export class ExportRenderer {
  private readonly gpu: RenderDevice;
  private readonly renderer: BackendRenderer;
  /** The frame canvas (export size): each frame is drawn into it and made a VideoFrame from it. */
  private readonly canvas: OffscreenCanvas;
  private readonly pool: TexturePool;
  private readonly workers: WorkerPool;
  private readonly frames: FrameService;
  private readonly images: ImageService;
  private readonly fonts: FontLibrary;
  private readonly text: TextRasterCache;
  private readonly textures: LayerTextures;
  private readonly compositor: Compositor;
  private readonly offline: Map<MediaId, string>;
  /** The main thread's SVG rasters by the media's file (what ImageService rasterizes from). */
  private readonly svgByFile = new Map<File, ImageBitmap>();
  private readonly stops: (() => void)[] = [];
  private target: CanvasTarget | null = null;
  /** The pixel outputs' target (PNG, GIF, transparent WebM): drawn into a texture and read back with straight alpha. */
  private pixelTarget: OffscreenTarget | null = null;
  /** The project the image outputs draw: with a transparent background when the export is (the background is not drawn). */
  private readonly drawProject: Project;

  constructor(private readonly params: ExportJobParams) {
    const { project, media, svg } = params;
    this.drawProject = params.format.transparent ? { ...project, settings: { ...project.settings, background: { r: 0, g: 0, b: 0, a: 0 } } } : project;
    this.canvas = new OffscreenCanvas(params.format.width, params.format.height);
    // The device is not replaced mid-export (Batch 47); a WebGL2 context lives on the frame canvas.
    const backend = createBackend(params.renderer, { recover: false, canvas: this.canvas });
    this.gpu = backend.device;
    this.renderer = backend.renderer;
    this.pool = new TexturePool(params.textureBudget);
    this.offline = new Map(Object.entries(params.offline) as [MediaId, string][]);
    this.workers = new WorkerPool({
      decode: () => loopbackWorker(decodeHandlers(), DECODE_CONCURRENCY, DECODE_IMMEDIATE),
      analysis: noWorker("analysis"),
      proxy: noWorker("proxy"),
      transcribe: noWorker("transcribe"),
      export: noWorker("export"),
    });
    // Frames are uploaded at the size each request asks for (`uploadAtLeast`): never capped smaller.
    this.frames = new FrameService({ workers: this.workers, renderer: this.renderer, pool: this.pool, uploadSize: () => 1, proxyReady: () => false });
    this.images = new ImageService({
      workers: this.workers,
      renderer: this.renderer,
      pool: this.pool,
      document: { getState: () => project },
      svgBitmap: (file, maxSize) => this.svgRaster(file, maxSize),
    });
    const fileOf = (mediaId: MediaId) => Promise.resolve(media[mediaId]?.file ?? null);
    this.stops.push(
      this.frames.attach({
        file: fileOf,
        readIndex: (mediaId) => Promise.resolve(media[mediaId]?.index ?? null),
        writeIndex: () => Promise.resolve(),
        sequence: (mediaId) => {
          const item = project.media[mediaId];
          const frames = media[mediaId]?.frames;
          return Promise.resolve(item?.sequence && frames ? { frames, fps: item.sequence.fps, width: item.width ?? 0, height: item.height ?? 0 } : null);
        },
      }),
      this.images.attach({ file: fileOf }),
    );
    for (const [mediaId, bitmap] of Object.entries(svg) as [MediaId, ImageBitmap][]) {
      const source = media[mediaId];
      if (source) this.svgByFile.set(source.file, bitmap);
      else bitmap.close();
    }
    this.fonts = new FontLibrary(typeof self !== "undefined" && "fonts" in self ? (self as unknown as { fonts: FontFaceSet }).fonts : null, { baseUrl: params.fontBaseUrl });
    this.text = new TextRasterCache({
      upload: (canvas, options) => this.renderer.uploadImageBitmap(canvas, options),
      fontsReady: (style, value) => this.fonts.ready(style, value),
      loadFonts: (style, value) => this.fonts.load(style, value),
    });
    this.textures = new LayerTextures({
      frames: this.frames,
      images: this.images,
      pool: this.pool,
      compounds: new CompoundTargets(this.renderer),
      onChange: () => undefined,
      text: this.text,
      onFail: (mediaId) => this.offline.set(mediaId, FAILED_LABEL),
    });
    // The LUTs (Batch 75): this worker's library holds the job's (the compositor packs their handles).
    lutLibrary.clear();
    for (const [path, atlas] of Object.entries(params.luts ?? {})) lutLibrary.set(path, atlas);
    const slates: OfflineSlates = { label: (mediaId) => this.offline.get(mediaId) ?? null, look: () => params.slate };
    this.compositor = new Compositor(slates);
  }

  /** Creates the device, loads the fonts and opens the videos of the range. */
  async start(signal: AbortSignal): Promise<void> {
    const { project, range, fonts } = this.params;
    if (!(await this.gpu.start())) throw new Error(`No ${this.params.renderer === "webgl2" ? "WebGL2" : "WebGPU"} device for the export`);
    this.stops.push(this.fonts.install());
    await this.fonts.addDescriptors(fonts);
    const needs = exportNeeds(project, range);
    await Promise.all(needs.texts.map(({ style, text }) => this.fonts.load(style, text)));
    signal.throwIfAborted();
    // Videos that cannot be opened or decoded here draw a slate, as in the preview.
    await Promise.all(
      needs.media.map(async (mediaId) => {
        const item = project.media[mediaId];
        if (item?.kind !== "video" || this.offline.has(mediaId)) return;
        const info = await this.frames.video(mediaId).catch((error: unknown) => {
          console.warn(`[export] cannot open ${item.name}`, error);
          return null;
        });
        if (!info?.decodable || info.frameTimesUs.length === 0) this.offline.set(mediaId, FAILED_LABEL);
      }),
    );
    signal.throwIfAborted();
    this.target = this.renderer.createCanvasTarget(this.canvas);
    if (needsPixels(this.params.format)) this.pixelTarget = this.renderer.createOffscreenTarget(this.params.format.width, this.params.format.height);
  }

  /** Project frame `frame` drawn at the export size, as a VideoFrame at `timestampUs` (the caller closes it). */
  async render(frame: Frame, timestampUs: number, durationUs: number, signal: AbortSignal): Promise<VideoFrame> {
    try {
      return await this.draw(frame, timestampUs, durationUs, signal);
    } catch (error) {
      // Whatever step met the lost device first (an upload, the draw), the job says what happened.
      if (this.gpu.state !== "ready" && !signal.aborted) throw new Error(DEVICE_LOST_MESSAGE);
      throw error;
    }
  }

  /**
   * Project frame `frame` as straight-alpha RGBA pixels at the export size (the PNG sequence, the GIF and a
   * transparent WebM): drawn into a texture (the project background only when the export is not transparent)
   * and read back; an opaque export's pixels are fully opaque.
   */
  async renderPixels(frame: Frame, signal: AbortSignal): Promise<ImageData> {
    try {
      const target = this.pixelTarget;
      if (!target) throw new Error("The export renderer is not started");
      const read = await this.drawInto(frame, signal, target, this.drawProject, () => this.renderer.readPixels(target));
      const pixels = await read;
      if (!this.params.format.transparent) for (let i = 3; i < pixels.data.length; i += 4) pixels.data[i] = 255;
      return pixels;
    } catch (error) {
      if (this.gpu.state !== "ready" && !signal.aborted) throw new Error(DEVICE_LOST_MESSAGE);
      throw error;
    }
  }

  private async draw(frame: Frame, timestampUs: number, durationUs: number, signal: AbortSignal): Promise<VideoFrame> {
    const { canvas, target } = this;
    if (!target) throw new Error("The export renderer is not started");
    // The VideoFrame is made in the same task as the draw (the canvas texture is only valid until it ends).
    return this.drawInto(frame, signal, target, this.params.project, () => new VideoFrame(canvas, { timestamp: timestampUs, duration: durationUs }));
  }

  /** Resolves the textures of `frame`, draws it into `target` and returns what `after` makes of it (called right after the draw). */
  private async drawInto<T>(frame: Frame, signal: AbortSignal, target: CanvasTarget | OffscreenTarget, project: Project, after: () => T): Promise<T> {
    const offline = this.offline.size;
    let resolved = await this.textures.resolveExact(this.compositor.evaluate(project, frame), Math.min(DETAIL_MAX_SIZE, this.renderer.maxTextureSize));
    // A media failed while this frame resolved: draw it again, with its slate.
    if (this.offline.size !== offline) {
      resolved.release();
      resolved = await this.textures.resolveExact(this.compositor.evaluate(project, frame), Math.min(DETAIL_MAX_SIZE, this.renderer.maxTextureSize));
    }
    const { list, release } = resolved;
    try {
      signal.throwIfAborted();
      if (this.gpu.state !== "ready" || !this.renderer.draw(list, target)) throw new Error(DEVICE_LOST_MESSAGE);
      return after();
    } finally {
      release();
    }
  }

  /** Loses the GPU device on purpose (dev: `__exportDev.loseDevice()` in the export worker, Batch 47 check). */
  loseDeviceForTest(): void {
    this.gpu.loseForTest();
  }

  /** Frees the device, the textures, the decoders and the font faces (P13). */
  dispose(): void {
    if (this.target) this.renderer.releaseTarget(this.target);
    this.target = null;
    if (this.pixelTarget) this.renderer.releaseTarget(this.pixelTarget);
    this.pixelTarget = null;
    this.textures.clear();
    this.text.clear();
    for (const stop of this.stops.splice(0).reverse()) stop();
    this.fonts.clearDescriptors();
    this.workers.terminate();
    this.pool.clear();
    for (const bitmap of this.svgByFile.values()) bitmap.close();
    this.svgByFile.clear();
    this.gpu.dispose();
  }

  /** The SVG's raster at `maxSize` px on its long side, from the main thread's (closed by the caller). */
  private async svgRaster(file: Blob, maxSize: number): Promise<ImageBitmap> {
    const source = this.svgByFile.get(file as File);
    if (!source) throw new Error("The SVG image was not rasterized for the export");
    const scale = Math.min(1, maxSize / Math.max(source.width, source.height));
    return createImageBitmap(source, {
      resizeWidth: Math.max(1, Math.round(source.width * scale)),
      resizeHeight: Math.max(1, Math.round(source.height * scale)),
      resizeQuality: "high",
    });
  }
}
