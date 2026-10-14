// Draws the media-card posters inside the single render loop (spec §3.4, P3). A poster arrival only
// marks its canvas dirty and invalidates `mediaThumbs`; the scheduler then calls `render` once per
// frame, which draws every dirty canvas, so a burst of arrivals costs at most one draw per card per
// frame. Framework-free: `PosterCanvas` only hands over its element.
// TODO(batch 17): sprite-sheet thumbnails, TODO(batch 20): hover-scrub frames, both through this view.
import type { MediaId } from "../../core/document/types.js";
import type { FrameScheduler, RenderView } from "../../core/scheduler/FrameScheduler.js";
import type { PosterListener } from "../../media/PosterStore.js";

export interface PosterSource {
  observe(id: MediaId, listener: PosterListener): () => void;
}

/** The parts of a canvas the painter touches (a real `HTMLCanvasElement` in the app). */
export type PosterTarget = Pick<HTMLCanvasElement, "width" | "height" | "dataset" | "getContext">;

export class PosterPainter implements RenderView {
  /** Canvases waiting for the next frame, with the latest bitmap (null: the poster went away). */
  private readonly dirty = new Map<PosterTarget, ImageBitmap | null>();
  private readonly unregister: () => void;

  constructor(private readonly scheduler: Pick<FrameScheduler, "register" | "invalidate">) {
    this.unregister = scheduler.register("mediaThumbs", this);
  }

  /** Paints the poster of `id` into `canvas` whenever it appears or changes. Returns a detach function. */
  attach(canvas: PosterTarget, posters: PosterSource, id: MediaId): () => void {
    const stop = posters.observe(id, (bitmap) => {
      this.dirty.set(canvas, bitmap);
      this.scheduler.invalidate("mediaThumbs");
    });
    return () => {
      stop();
      this.dirty.delete(canvas);
    };
  }

  render(): void {
    const dirty = [...this.dirty];
    this.dirty.clear();
    for (const [canvas, bitmap] of dirty) paint(canvas, bitmap);
  }

  dispose(): void {
    this.unregister();
    this.dirty.clear();
  }
}

function paint(canvas: PosterTarget, bitmap: ImageBitmap | null): void {
  // A closed bitmap (project closed before this frame) reports a 0 x 0 size.
  if (!bitmap || bitmap.width === 0 || bitmap.height === 0) {
    delete canvas.dataset.ready;
    return;
  }
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
  canvas.dataset.ready = "";
}
