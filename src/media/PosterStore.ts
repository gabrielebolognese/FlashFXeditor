// Posters of images (a derived cache, spec §3.3): the media card picture and the image clips'
// filmstrip on the timeline. Videos show their first thumbnail sheet frame instead (ThumbnailStore,
// spec §9.6). Follows the document: images that appear (import, project open, undo of a removal) get
// a poster, read from cache/thumbs/ when present and otherwise made by the decode worker and written
// back; images that go away have their bitmap closed (P13). Cards observe one media id through
// `PosterPainter`, which draws the bitmaps in the FrameScheduler loop (no React state). An animated
// image also gets its filmstrip (`strip`, Batch 34: up to STRIP_CELLS frames spread over it, made by
// the decode worker each session) for the timeline's clip bodies.
import type { MediaId, MediaItem } from "../core/document/types.js";
import type { DocumentStore } from "../core/store/DocumentStore.js";
import { errorMessage } from "../project/errorMessage.js";
import type { FsDir } from "../project/fs.js";
import { posterPath, resolveFile, writeFileAt } from "../project/mediaFiles.js";
import { isAnimatedImage } from "./mediaKinds.js";
import { isAbortError, type AnimationStrip } from "./workers/protocol.js";
import type { WorkerPool } from "./workers/WorkerPool.js";

/** Longest side of a poster in px (cards are ~110-200 css px wide; 2x for HiDPI). */
export const POSTER_SIZE = 320;
/** An animation strip's cell height in px (an L track's body, 2x for HiDPI) and its most cells. */
export const STRIP_HEIGHT = 144;
export const STRIP_CELLS = 48;
const CONCURRENCY = 2;

export type PosterListener = (bitmap: ImageBitmap | null) => void;

export interface PosterStoreDeps {
  dir: FsDir;
  pool: Pick<WorkerPool, "request">;
  isWritable: () => boolean;
  /** SVG cannot be rasterized in a worker; injected so tests need no DOM image decoding. */
  svgPoster: (file: Blob, maxSize: number) => Promise<ImageBitmap>;
  /** A poster appeared or went away (the timeline redraws its image clips). */
  onChange?: (id: MediaId) => void;
}

const isSvg = (item: MediaItem) => item.codec === "svg";

export class PosterStore {
  private readonly bitmaps = new Map<MediaId, ImageBitmap>();
  private readonly strips = new Map<MediaId, AnimationStrip>();
  private readonly listeners = new Map<MediaId, Set<PosterListener>>();
  /** Media that are queued, loading, done or failed: each is attempted once per session. */
  private readonly attempted = new Set<MediaId>();
  private readonly waiting: MediaItem[] = [];
  private active = 0;
  private present: Record<MediaId, MediaItem> = {};
  private readonly controller = new AbortController();
  private idleResolvers: (() => void)[] = [];

  constructor(private readonly deps: PosterStoreDeps) {}

  /** Follows the document's media. Returns a stop function. */
  attach(documentStore: DocumentStore): () => void {
    this.sync(documentStore.getState().media);
    return documentStore.subscribe((state) => this.sync(state.media), { affects: ["media"] });
  }

  get(id: MediaId): ImageBitmap | null {
    return this.bitmaps.get(id) ?? null;
  }

  /** The filmstrip of an animated image, or null (a still, or not made yet). */
  strip(id: MediaId): AnimationStrip | null {
    return this.strips.get(id) ?? null;
  }

  /** Calls `listener` now if the poster exists, and whenever it appears or goes away. */
  observe(id: MediaId, listener: PosterListener): () => void {
    let set = this.listeners.get(id);
    if (!set) this.listeners.set(id, (set = new Set()));
    set.add(listener);
    const bitmap = this.bitmaps.get(id);
    if (bitmap) listener(bitmap);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(id);
    };
  }

  /** Resolves when nothing is queued or loading (tests, diagnostics). */
  whenIdle(): Promise<void> {
    if (this.active === 0 && this.waiting.length === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleResolvers.push(resolve));
  }

  sync(media: Record<MediaId, MediaItem>): void {
    this.present = media;
    for (const id of [...this.bitmaps.keys()]) {
      if (media[id]) continue;
      this.bitmaps.get(id)?.close();
      this.bitmaps.delete(id);
      this.emit(id, null);
    }
    for (const id of [...this.strips.keys()]) {
      if (media[id]) continue;
      this.strips.get(id)?.bitmap.close();
      this.strips.delete(id);
    }
    for (const id of [...this.attempted]) if (!media[id] && !this.waiting.some((m) => m.id === id)) this.attempted.delete(id);
    for (const item of Object.values(media)) {
      if (item.kind !== "image" || this.attempted.has(item.id)) continue;
      this.attempted.add(item.id);
      this.waiting.push(item);
    }
    this.pump();
  }

  dispose(): void {
    this.controller.abort();
    this.waiting.length = 0;
    for (const bitmap of this.bitmaps.values()) bitmap.close();
    this.bitmaps.clear();
    for (const strip of this.strips.values()) strip.bitmap.close();
    this.strips.clear();
    this.listeners.clear();
  }

  private pump(): void {
    while (this.active < CONCURRENCY && this.waiting.length > 0) {
      const item = this.waiting.shift() as MediaItem;
      if (!this.present[item.id]) {
        this.attempted.delete(item.id);
        continue;
      }
      this.active += 1;
      void this.load(item).finally(() => {
        this.active -= 1;
        this.pump();
        if (this.active === 0 && this.waiting.length === 0) for (const resolve of this.idleResolvers.splice(0)) resolve();
      });
    }
    if (this.active === 0 && this.waiting.length === 0) for (const resolve of this.idleResolvers.splice(0)) resolve();
  }

  private async load(item: MediaItem): Promise<void> {
    const signal = this.controller.signal;
    try {
      const bitmap = (await this.fromCache(item, signal)) ?? (await this.generate(item, signal));
      if (bitmap) this.set(item.id, bitmap);
      if (isAnimatedImage(item)) {
        await this.loadStrip(item, signal).catch((error: unknown) => {
          if (!isAbortError(error)) console.warn(`[media] no filmstrip for "${item.name}": ${errorMessage(error)}`);
        });
      }
    } catch (error) {
      if (isAbortError(error) || signal.aborted) return;
      console.warn(`[media] no poster for "${item.name}": ${errorMessage(error)}`);
    }
  }

  private async loadStrip(item: MediaItem, signal: AbortSignal): Promise<void> {
    if (!("relPath" in item.file)) return;
    const source = await resolveFile(this.deps.dir, item.file.relPath);
    if (!source) return;
    const strip = await this.deps.pool.request("animationStrip", { blob: source, type: `image/${item.codec ?? "gif"}`, cellHeight: STRIP_HEIGHT, maxCells: STRIP_CELLS }, { signal });
    if (signal.aborted || !this.present[item.id]) {
      strip.bitmap.close();
      return;
    }
    this.strips.get(item.id)?.bitmap.close();
    this.strips.set(item.id, strip);
    this.deps.onChange?.(item.id);
  }

  private async fromCache(item: MediaItem, signal: AbortSignal): Promise<ImageBitmap | null> {
    if (isSvg(item)) return null;
    const cached = await resolveFile(this.deps.dir, posterPath(item.id)).catch(() => null);
    if (!cached || cached.size === 0) return null;
    try {
      return await this.deps.pool.request("decodeImage", { blob: cached, maxSize: POSTER_SIZE }, { signal });
    } catch (error) {
      if (isAbortError(error)) throw error;
      return null; // damaged cache file: regenerate
    }
  }

  private async generate(item: MediaItem, signal: AbortSignal): Promise<ImageBitmap | null> {
    // TODO(batch 41): reference-mode media resolve their file through the stored handle.
    if (!("relPath" in item.file)) return null;
    const source = await resolveFile(this.deps.dir, item.file.relPath);
    if (!source) throw new Error(`${item.file.relPath} is missing`);
    signal.throwIfAborted();
    if (isSvg(item)) return this.deps.svgPoster(source, POSTER_SIZE);
    const { bitmap, blob } = await this.deps.pool.request("poster", { file: source, kind: "image", maxSize: POSTER_SIZE }, { signal });
    if (this.deps.isWritable()) {
      writeFileAt(this.deps.dir, posterPath(item.id), blob).catch((error: unknown) => console.warn(`[media] could not cache the poster of "${item.name}"`, error));
    }
    return bitmap;
  }

  private set(id: MediaId, bitmap: ImageBitmap): void {
    if (this.controller.signal.aborted || !this.present[id]) {
      bitmap.close();
      return;
    }
    this.bitmaps.get(id)?.close();
    this.bitmaps.set(id, bitmap);
    this.emit(id, bitmap);
  }

  private emit(id: MediaId, bitmap: ImageBitmap | null): void {
    for (const listener of this.listeners.get(id) ?? []) listener(bitmap);
    this.deps.onChange?.(id);
  }
}
