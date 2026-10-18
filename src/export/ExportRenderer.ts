// The export's frames (spec §16, §9.4 "the same code path renders the preview and the export"), in
// export.worker: its own WebGPU device and renderer, texture pool (a share of the budget), frame and
// image services with their own decode sessions (decodeHandlers reached in-thread), fonts, text
// rasters and compositor, drawing each frame into an OffscreenCanvas of the export size.
// - Frames come from `LayerTextures.resolveExact`, the Export frame path: every video at its exact
//   full-resolution frame (never a proxy), at its own size or twice its drawn size, text at its exact
//   scale, animations, captions, transitions, solids and images as the preview draws them.
// - Fonts: the bundled faces and the project's are added to the worker's font set, and the faces the
//   range's text needs are loaded before the first frame (layouts are never measured with a stand-in).
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
import { GpuDevice } from "../render/gpu/GpuDevice.js";
import type { CanvasTarget } from "../render/gpu/renderer.js";
import { WebGpuRenderer } from "../render/gpu/WebGpuRenderer.js";
import { DETAIL_MAX_SIZE } from "../render/preview/detail.js";
import { LayerTextures } from "../render/preview/LayerTextures.js";
import { FontLibrary } from "../render/text/FontLibrary.js";
import { TextRasterCache } from "../render/text/TextRasterCache.js";
import { exportNeeds } from "./inputs.js";
import type { ExportJobParams } from "./job.js";

/** The slate line of a video the export cannot open or decode (the preview's "failed" label). */
const FAILED_LABEL = "Media can't be played";

const noWorker = (kind: WorkerKind) => (): WorkerLike => {
  throw new Error(`The export has no ${kind} worker`);
};

/** The error of an export whose GPU device was lost. */
export const DEVICE_LOST_MESSAGE = "The GPU was reset during the export (device lost). Export again.";

export class ExportRenderer {
  private readonly gpu = new GpuDevice({ recover: false });
  private readonly renderer = new WebGpuRenderer(this.gpu);
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
  private canvas: OffscreenCanvas | null = null;
  private target: CanvasTarget | null = null;

  constructor(private readonly params: ExportJobParams) {
    const { project, media, svg } = params;
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
      this.frames.attach({ file: fileOf, readIndex: (mediaId) => Promise.resolve(media[mediaId]?.index ?? null), writeIndex: () => Promise.resolve() }),
      this.images.attach({ file: fileOf }),
    );
    for (const [mediaId, bitmap] of Object.entries(svg) as [MediaId, ImageBitmap][]) {
      const source = media[mediaId];
      if (source) this.svgByFile.set(source.file, bitmap);
      else bitmap.close();
    }
    this.fonts = new FontLibrary(typeof self !== "undefined" && "fonts" in self ? (self as unknown as { fonts: FontFaceSet }).fonts : null);
    this.text = new TextRasterCache({
      upload: (canvas, options) => this.renderer.uploadImageBitmap(canvas, options),
      fontsReady: (style, value) => this.fonts.ready(style, value),
      loadFonts: (style, value) => this.fonts.load(style, value),
    });
    this.textures = new LayerTextures({
      frames: this.frames,
      images: this.images,
      pool: this.pool,
      onChange: () => undefined,
      text: this.text,
      onFail: (mediaId) => this.offline.set(mediaId, FAILED_LABEL),
    });
    const slates: OfflineSlates = { label: (mediaId) => this.offline.get(mediaId) ?? null, look: () => params.slate };
    this.compositor = new Compositor(slates);
  }

  /** Creates the device, loads the fonts and opens the videos of the range. */
  async start(signal: AbortSignal): Promise<void> {
    const { project, range, format, fonts } = this.params;
    if (!(await this.gpu.start())) throw new Error("No WebGPU device for the export");
    this.stops.push(this.fonts.install());
    await this.fonts.setProjectFaces(fonts);
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
    this.canvas = new OffscreenCanvas(format.width, format.height);
    this.target = this.renderer.createCanvasTarget(this.canvas);
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

  private async draw(frame: Frame, timestampUs: number, durationUs: number, signal: AbortSignal): Promise<VideoFrame> {
    const { canvas, target } = this;
    if (!canvas || !target) throw new Error("The export renderer is not started");
    const project: Project = this.params.project;
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
      return new VideoFrame(canvas, { timestamp: timestampUs, duration: durationUs });
    } finally {
      release();
    }
  }

  /** Loses the GPU device on purpose (dev: `__exportDev.loseDevice()` in the export worker, Batch 47 check). */
  loseDeviceForTest(): void {
    this.gpu.device?.destroy();
  }

  /** Frees the device, the textures, the decoders and the font faces (P13). */
  dispose(): void {
    if (this.target) this.renderer.releaseTarget(this.target);
    this.target = null;
    this.canvas = null;
    this.textures.clear();
    this.text.clear();
    for (const stop of this.stops.splice(0).reverse()) stop();
    this.fonts.clearProjectFaces();
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
