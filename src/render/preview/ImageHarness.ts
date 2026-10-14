// Batch 05 test harness (temporary): the image selected in the Media panel is drawn into the project
// frame, contained and centered. The full-size bitmap is decoded in the decode worker (P5), uploaded
// once as a mipmapped texture into the TexturePool, and closed (P13). The shown texture is pinned;
// earlier ones stay in the pool until the budget evicts them, so reselecting an image is instant.
// After a device loss the pool is emptied and the shown image is uploaded again on "ready".
// TODO(batch 08): removed; the compositor draws the timeline at the playhead instead.
import type { MediaId, MediaItem, Project } from "../../core/document/types.js";
import type { Store } from "../../core/store/createStore.js";
import type { DocumentStore } from "../../core/store/DocumentStore.js";
import { imageKey, type TexturePool } from "../../media/cache/TexturePool.js";
import { isAbortError } from "../../media/workers/protocol.js";
import type { WorkerPool } from "../../media/workers/WorkerPool.js";
import { FULL_UV, type Layer } from "../compositor/drawList.js";
import type { Renderer, TextureHandle } from "../gpu/renderer.js";
import { containTransform } from "./viewport.js";

export interface ImageHarnessDeps {
  renderer: Renderer;
  pool: TexturePool;
  preview: { setLayers(layers: readonly Layer[]): void; clearLayers(owned: readonly Layer[]): void };
  document: Pick<DocumentStore, "getState" | "subscribe">;
  /** The Media panel state: its selection (ids and the clicked one). */
  panel: Pick<Store<{ selection: MediaSelectionLike }>, "getState" | "select">;
  workers: Pick<WorkerPool, "request">;
  /** The media file in the project folder. */
  resolve: (relPath: string) => Promise<File | null>;
  /** SVG cannot be decoded in a worker. */
  svgBitmap: (file: Blob, maxSize: number) => Promise<ImageBitmap>;
}

export class ImageHarness {
  /** The image shown (or being loaded). */
  private current: MediaId | null = null;
  private unpin: (() => void) | null = null;
  private loading: AbortController | null = null;
  /** Media with a texture in the pool, to drop them when the media leaves the project. */
  private readonly uploaded = new Set<MediaId>();
  /** What this harness gave the preview (cleared only if still shown). */
  private layers: readonly Layer[] = [];

  constructor(private readonly deps: ImageHarnessDeps) {}

  attach(): () => void {
    const { panel, document, renderer } = this.deps;
    const stops = [
      panel.select((state) => pickImage(state.selection, document.getState().media), (id) => this.show(id), { fireImmediately: true }),
      document.subscribe((state) => this.syncMedia(state), { affects: ["media", "settings"] }),
      renderer.subscribe((event) => {
        // The pool is cleared on "lost" by its owner; upload the shown image again on the new device.
        if (event === "ready" && this.current) this.show(this.current, true);
      }),
    ];
    return () => {
      for (const stop of stops) stop();
      this.show(null);
    };
  }

  private syncMedia(state: Project): void {
    for (const id of [...this.uploaded]) {
      if (state.media[id]) continue;
      this.uploaded.delete(id);
      this.deps.pool.deleteMedia(id);
    }
    const id = pickImage(this.deps.panel.getState().selection, state.media);
    // Same image: a settings change (frame size) only re-fits it.
    this.show(id, id !== null && id === this.current);
  }

  private show(id: MediaId | null, force = false): void {
    if (id === this.current && !force) return;
    this.loading?.abort();
    this.loading = null;
    this.unpin?.();
    this.unpin = null;
    this.current = id;
    if (!id) {
      this.deps.preview.clearLayers(this.layers);
      this.layers = [];
      return;
    }
    this.unpin = this.deps.pool.pin(imageKey(id));
    const cached = this.deps.pool.get(imageKey(id));
    if (cached) {
      this.draw(cached);
      return;
    }
    const controller = new AbortController();
    this.loading = controller;
    void this.load(id, controller.signal).then(
      (texture) => {
        if (this.loading === controller) this.loading = null;
        if (texture && this.current === id) this.draw(texture);
      },
      (error: unknown) => {
        if (!isAbortError(error)) console.error(`[preview] could not show image ${id}`, error);
      },
    );
  }

  private async load(id: MediaId, signal: AbortSignal): Promise<TextureHandle | null> {
    const { renderer, pool, workers, resolve, svgBitmap } = this.deps;
    const item = this.deps.document.getState().media[id];
    if (!item || !("relPath" in item.file)) return null;
    const file = await resolve(item.file.relPath);
    if (!file || signal.aborted) return null;
    const maxSize = renderer.maxTextureSize;
    const bitmap = isSvg(item)
      ? await svgBitmap(file, Math.max(this.frame().width, this.frame().height))
      : await workers.request("decodeImage", { blob: file, maxSize }, { priority: "user", signal });
    try {
      if (signal.aborted || !renderer.ready) return null;
      const texture = renderer.uploadImageBitmap(bitmap, { label: item.name });
      pool.put(imageKey(id), texture);
      this.uploaded.add(id);
      return texture;
    } finally {
      bitmap.close();
    }
  }

  private draw(texture: TextureHandle): void {
    this.layers = [
      {
        kind: "texture",
        texture,
        transform: containTransform(texture, this.frame()),
        opacity: 1,
        crop: FULL_UV,
        flipX: false,
        flipY: false,
      },
    ];
    this.deps.preview.setLayers(this.layers);
  }

  private frame() {
    return this.deps.document.getState().settings;
  }
}

export interface MediaSelectionLike {
  ids: ReadonlySet<MediaId>;
  anchor: MediaId | null;
}

const isSvg = (item: MediaItem) => item.codec === "svg";
const isVisual = (item: MediaItem | undefined) => item?.kind === "image" || item?.kind === "video";

/** The media the preview harnesses show: the clicked one when it is an image or a video, else the first selected one. */
export function pickPreviewMedia(selection: MediaSelectionLike, media: Record<MediaId, MediaItem>): MediaId | null {
  if (selection.anchor && selection.ids.has(selection.anchor) && isVisual(media[selection.anchor])) return selection.anchor;
  for (const id of selection.ids) if (isVisual(media[id])) return id;
  return null;
}

function pickImage(selection: MediaSelectionLike, media: Record<MediaId, MediaItem>): MediaId | null {
  const id = pickPreviewMedia(selection, media);
  return id !== null && media[id]?.kind === "image" ? id : null;
}
