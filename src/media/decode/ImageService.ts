// Image textures (spec §9.3, P5, P13), uploaded into the TexturePool. The project supplies the files;
// concurrent loads of one image share a request; every bitmap is closed right after its upload.
// - Stills: one mipmapped texture under `imageKey`, decoded at full size in decode.worker.
// - SVG: rasterized on the main thread (workers have no DOM to draw SVG, the Batch 04 deviation), first
//   at the frame's long side, then again at the size the preview draws it at (`refine`, spec §7.1: a
//   zoom, a scaled layer), at most SVG_MAX_SIZE px; the new raster replaces the old one in the pool.
// - Animated GIF and WebP (Batch 34): decode.worker decodes the frames the memory budget keeps
//   (animation.ts), at most ANIMATION_MAX_SIZE px; each kept frame is one texture keyed by its start
//   time (`frameKey`). Frames arrive one by one (`onChange`: the preview draws them as they come).
//   Frames the pool let go of are decoded again by the next `load`.
import type { MediaId, MediaItem } from "../../core/document/types.js";
import type { DocumentStore } from "../../core/store/DocumentStore.js";
import type { Renderer, TextureHandle } from "../../render/gpu/renderer.js";
import { imageKey, STILL_US, type TextureKey, type TexturePool } from "../cache/TexturePool.js";
import { isAnimatedImage, isSvgImage } from "../mediaKinds.js";
import { abortError } from "../workers/protocol.js";
import type { WorkerPool } from "../workers/WorkerPool.js";
import { ANIMATION_BUDGET_BYTES, frameAt, loopTimeUs } from "./animation.js";

/** Long-edge cap of SVG rasters (spec §7.1's detail cap). */
export const SVG_MAX_SIZE = 4096;
/** Long-edge cap of animation frames (they are drawn at most this big without losing detail). */
export const ANIMATION_MAX_SIZE = 2048;

export interface ImageSource {
  /** The image file of the open project, or null when it is missing. */
  file(mediaId: MediaId): Promise<File | null>;
}

export interface ImageServiceDeps {
  workers: Pick<WorkerPool, "request">;
  renderer: Pick<Renderer, "ready" | "maxTextureSize" | "uploadImageBitmap">;
  pool: Pick<TexturePool, "get" | "put" | "has" | "deleteMedia">;
  document: Pick<DocumentStore, "getState">;
  /** SVG cannot be decoded in a worker. */
  svgBitmap: (file: Blob, maxSize: number) => Promise<ImageBitmap>;
  /** Frames of an animation arrived, or a sharper SVG raster replaced the shown one (the preview redraws). */
  onChange?: () => void;
}

/** An animation's kept frames: where each starts (media us), and its length. */
interface Animation {
  startsUs: number[];
  durationUs: number;
}

interface Load {
  promise: Promise<TextureHandle | null>;
  controller: AbortController;
}

export class ImageService {
  private source: ImageSource | null = null;
  private readonly loads = new Map<MediaId, Load>();
  private readonly refines = new Map<MediaId, Load & { longEdge: number }>();
  private readonly animations = new Map<MediaId, Animation>();
  /** The key `frameKey` returns (valid until its next call). */
  private readonly scratch: TextureKey = { mediaId: "", lod: "full", timeUs: STILL_US };

  constructor(private readonly deps: ImageServiceDeps) {}

  /** Serves the images of a project until the returned function is called (which cancels the loads). */
  attach(source: ImageSource): () => void {
    this.detach();
    this.source = source;
    return () => {
      if (this.source === source) this.detach();
    };
  }

  /** The uploaded texture of an image (an animation's first frame), or null when it is not loaded (yet). */
  get(mediaId: MediaId): TextureHandle | null {
    const key = this.frameKey(mediaId, 0);
    return key ? this.deps.pool.get(key) : null;
  }

  /**
   * The pool key of the texture an image shows at media time `timeUs` (an animation's frame there,
   * looped; a still's one texture), in a scratch key valid until the next call. Null while an
   * animation's frame list is not known yet.
   */
  frameKey(mediaId: MediaId, timeUs: number): TextureKey | null {
    const item = this.deps.document.getState().media[mediaId];
    const key = this.scratch;
    key.mediaId = mediaId;
    key.lod = "full";
    if (!item || !isAnimatedImage(item)) {
      key.timeUs = STILL_US;
      return key;
    }
    const animation = this.animations.get(mediaId);
    if (!animation) return null;
    key.timeUs = animation.startsUs[frameAt(animation.startsUs, loopTimeUs(timeUs, animation.durationUs))] as number;
    return key;
  }

  /** The size of an SVG image (vector: `refine` draws it sharper), or null for other media. */
  vectorSize(mediaId: MediaId): { width: number; height: number } | null {
    const item = this.deps.document.getState().media[mediaId];
    return item?.width && item.height && isSvgImage(item) ? { width: item.width, height: item.height } : null;
  }

  /**
   * Loads an image into the pool (once; callers share a running load): a still, an SVG at the frame's
   * long side, or an animation's frames (the ones not in the pool). Resolves with its texture (an
   * animation's first frame) once done; null when it cannot be shown now.
   */
  load(mediaId: MediaId): Promise<TextureHandle | null> {
    const item = this.deps.document.getState().media[mediaId];
    const cached = this.get(mediaId);
    if (cached && !(item && isAnimatedImage(item) && this.missingFrames(mediaId).length > 0)) return Promise.resolve(cached);
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

  /**
   * An SVG rasterized again with a `longEdge` px long side (at most SVG_MAX_SIZE and the device limit),
   * replacing the raster in the pool (bigger for a zoom, smaller when it is drawn smaller: sharper than
   * a big raster sampled down, and less memory). A running refine to that size is shared; one to another
   * size gives way. Resolves with the texture shown afterwards (null for other media).
   */
  refine(mediaId: MediaId, longEdge: number): Promise<TextureHandle | null> {
    if (!this.vectorSize(mediaId) || !this.source) return Promise.resolve(null);
    const target = Math.max(1, Math.min(SVG_MAX_SIZE, this.deps.renderer.maxTextureSize, Math.ceil(longEdge)));
    const current = this.get(mediaId);
    if (current && Math.max(current.width, current.height) === target) return Promise.resolve(current);
    const running = this.refines.get(mediaId);
    if (running && running.longEdge === target) return running.promise;
    running?.controller.abort(abortError());
    const controller = new AbortController();
    const promise = this.rasterize(mediaId, target, controller.signal, undefined, true).finally(() => {
      if (this.refines.get(mediaId)?.controller === controller) this.refines.delete(mediaId);
    });
    this.refines.set(mediaId, { promise, controller, longEdge: target });
    return promise;
  }

  /** A media left the project: its loads stop and its textures and frame list go (P13). */
  release(mediaId: MediaId): void {
    for (const loads of [this.loads, this.refines]) {
      loads.get(mediaId)?.controller.abort(abortError());
      loads.delete(mediaId);
    }
    this.animations.delete(mediaId);
    this.deps.pool.deleteMedia(mediaId);
  }

  private detach(): void {
    for (const loads of [this.loads, this.refines]) {
      for (const { controller } of loads.values()) controller.abort(abortError());
      loads.clear();
    }
    this.animations.clear();
    this.source = null;
  }

  /** The positions of an animation's kept frames the pool does not hold. */
  private missingFrames(mediaId: MediaId): number[] {
    const animation = this.animations.get(mediaId);
    if (!animation) return [];
    const missing: number[] = [];
    animation.startsUs.forEach((timeUs, index) => {
      if (!this.deps.pool.has({ mediaId, lod: "full", timeUs })) missing.push(index);
    });
    return missing;
  }

  private async file(mediaId: MediaId, signal: AbortSignal): Promise<{ item: MediaItem; file: File } | null> {
    const item = this.deps.document.getState().media[mediaId];
    if (!item || item.kind !== "image" || !this.source) return null;
    const file = await this.source.file(mediaId);
    signal.throwIfAborted();
    if (!file) throw new Error("The image file is missing");
    return { item, file };
  }

  private async upload(mediaId: MediaId, signal: AbortSignal): Promise<TextureHandle | null> {
    const found = await this.file(mediaId, signal);
    if (!found) return null;
    const { item, file } = found;
    if (isAnimatedImage(item)) return this.uploadAnimation(item, file, signal);
    if (isSvgImage(item)) {
      const { width, height } = this.deps.document.getState().settings;
      return this.rasterize(mediaId, Math.max(width, height), signal, file);
    }
    const bitmap = await this.deps.workers.request("decodeImage", { blob: file, maxSize: this.deps.renderer.maxTextureSize }, { priority: "user", signal });
    return this.putStill(item, bitmap, signal);
  }

  /** An SVG at `longEdge` px into the pool; unless `replace`, not over a raster at least as big (a refine that ran first). */
  private async rasterize(mediaId: MediaId, longEdge: number, signal: AbortSignal, known?: File, replace = false): Promise<TextureHandle | null> {
    const found = known ? { item: this.deps.document.getState().media[mediaId] as MediaItem, file: known } : await this.file(mediaId, signal);
    if (!found) return null;
    const bitmap = await this.deps.svgBitmap(found.file, Math.min(SVG_MAX_SIZE, this.deps.renderer.maxTextureSize, longEdge));
    const texture = await this.putStill(found.item, bitmap, signal, replace);
    if (texture) this.deps.onChange?.();
    return texture;
  }

  /** Uploads `bitmap` as the image's texture (closing it); unless `replace`, not over a texture at least as big. */
  private async putStill(item: MediaItem, bitmap: ImageBitmap, signal: AbortSignal, replace = false): Promise<TextureHandle | null> {
    const { renderer, pool } = this.deps;
    try {
      signal.throwIfAborted();
      if (!renderer.ready) return null;
      const key = imageKey(item.id);
      const current = pool.get(key);
      if (!replace && current?.valid && Math.max(current.width, current.height) >= Math.max(bitmap.width, bitmap.height)) return current;
      const texture = renderer.uploadImageBitmap(bitmap, { label: item.name });
      pool.put(key, texture);
      return texture;
    } finally {
      bitmap.close();
    }
  }

  /** The animation's frames the pool does not hold, decoded in the worker and uploaded as they arrive. */
  private async uploadAnimation(item: MediaItem, file: File, signal: AbortSignal): Promise<TextureHandle | null> {
    const { renderer, pool, workers } = this.deps;
    const mediaId = item.id;
    const known = this.animations.get(mediaId);
    const only = known ? this.missingFrames(mediaId) : null;
    if (!only || only.length > 0) {
      await workers.request(
        "decodeAnimation",
        { blob: file, type: `image/${item.codec ?? "gif"}`, maxSize: Math.min(ANIMATION_MAX_SIZE, renderer.maxTextureSize), budgetBytes: ANIMATION_BUDGET_BYTES, only },
        {
          priority: "user",
          signal,
          onProgress: (value) => {
            if (value.kind === "frames") {
              this.animations.set(mediaId, { startsUs: value.startsUs, durationUs: value.durationUs });
              return;
            }
            try {
              const timeUs = this.animations.get(mediaId)?.startsUs[value.index];
              if (signal.aborted || !renderer.ready || timeUs === undefined) return;
              const key = { mediaId, lod: "full" as const, timeUs };
              if (pool.has(key)) return;
              pool.put(key, renderer.uploadImageBitmap(value.bitmap, { label: `${item.name} ${value.index + 1}` }));
              this.deps.onChange?.();
            } finally {
              value.bitmap.close();
            }
          },
        },
      );
    }
    signal.throwIfAborted();
    return this.get(mediaId);
  }
}
