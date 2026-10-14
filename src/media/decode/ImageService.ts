// Still image textures (spec §9.3, P5, P13): one mipmapped texture per image, uploaded once into the
// TexturePool under `imageKey`. The bitmap is decoded at full size in decode.worker (SVG is rasterized
// on the main thread at the frame's long side, the Batch 04 deviation) and closed right after the
// upload. Concurrent loads of one image share a request. The project supplies the files.
// TODO(batch 34): SVG re-rasterized at the needed detail scale; animated GIF/WebP frame lists.
import type { MediaId, MediaItem } from "../../core/document/types.js";
import type { DocumentStore } from "../../core/store/DocumentStore.js";
import type { Renderer, TextureHandle } from "../../render/gpu/renderer.js";
import { imageKey, type TexturePool } from "../cache/TexturePool.js";
import { abortError } from "../workers/protocol.js";
import type { WorkerPool } from "../workers/WorkerPool.js";

export interface ImageSource {
  /** The image file of the open project, or null when it is missing. */
  file(mediaId: MediaId): Promise<File | null>;
}

export interface ImageServiceDeps {
  workers: Pick<WorkerPool, "request">;
  renderer: Pick<Renderer, "ready" | "maxTextureSize" | "uploadImageBitmap">;
  pool: Pick<TexturePool, "get" | "put">;
  document: Pick<DocumentStore, "getState">;
  /** SVG cannot be decoded in a worker. */
  svgBitmap: (file: Blob, maxSize: number) => Promise<ImageBitmap>;
}

const isSvg = (item: MediaItem) => item.codec === "svg";

export class ImageService {
  private source: ImageSource | null = null;
  private readonly loads = new Map<MediaId, { promise: Promise<TextureHandle | null>; controller: AbortController }>();

  constructor(private readonly deps: ImageServiceDeps) {}

  /** Serves the images of a project until the returned function is called (which cancels the loads). */
  attach(source: ImageSource): () => void {
    this.detach();
    this.source = source;
    return () => {
      if (this.source === source) this.detach();
    };
  }

  /** The uploaded texture of an image, or null when it is not loaded (yet). */
  get(mediaId: MediaId): TextureHandle | null {
    return this.deps.pool.get(imageKey(mediaId));
  }

  /** Loads an image into the pool (once; callers share a running load). Null when it cannot be shown now. */
  load(mediaId: MediaId): Promise<TextureHandle | null> {
    const cached = this.get(mediaId);
    if (cached) return Promise.resolve(cached);
    let load = this.loads.get(mediaId);
    if (!load) {
      const controller = new AbortController();
      const promise = this.upload(mediaId, controller.signal).finally(() => {
        if (this.loads.get(mediaId)?.controller === controller) this.loads.delete(mediaId);
      });
      load = { promise, controller };
      this.loads.set(mediaId, load);
    }
    return load.promise;
  }

  private detach(): void {
    for (const { controller } of this.loads.values()) controller.abort(abortError());
    this.loads.clear();
    this.source = null;
  }

  private async upload(mediaId: MediaId, signal: AbortSignal): Promise<TextureHandle | null> {
    const { renderer, pool, workers, svgBitmap, document } = this.deps;
    const item = document.getState().media[mediaId];
    if (!item || item.kind !== "image" || !this.source) return null;
    const file = await this.source.file(mediaId);
    signal.throwIfAborted();
    if (!file) throw new Error("The image file is missing");
    const { width, height } = document.getState().settings;
    const bitmap = isSvg(item)
      ? await svgBitmap(file, Math.max(width, height))
      : await workers.request("decodeImage", { blob: file, maxSize: renderer.maxTextureSize }, { priority: "user", signal });
    try {
      signal.throwIfAborted();
      if (!renderer.ready) return null;
      const texture = renderer.uploadImageBitmap(bitmap, { label: item.name });
      pool.put(imageKey(mediaId), texture);
      return texture;
    } finally {
      bitmap.close();
    }
  }
}
