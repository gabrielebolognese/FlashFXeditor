// Draws the media-card pictures inside the single render loop (spec §3.4, P3): a region of a bitmap,
// the first cell of a video's LOD0 thumbnail sheet (spec §9.6) or an image's whole poster. An arrival
// only marks its canvas dirty and invalidates `mediaThumbs`; the scheduler then calls `render` once
// per frame, which draws every dirty canvas, so a burst of arrivals costs at most one draw per card
// per frame. Framework-free: `PosterCanvas` only hands over its element. A hover-scrub (spec §12,
// `hoverScrub.ts`) shows other cells of the sheets in a card's canvas until it ends; poster arrivals
// meanwhile wait for its end.
import type { MediaId } from "../../core/document/types.js";
import type { FrameScheduler, RenderView } from "../../core/scheduler/FrameScheduler.js";
import type { CardImage, CardListener } from "../../media/ThumbnailStore.js";

export interface PosterSource {
  observe(id: MediaId, listener: CardListener): () => void;
}

/** The parts of a canvas the painter touches (a real `HTMLCanvasElement` in the app). */
export type PosterTarget = Pick<HTMLCanvasElement, "width" | "height" | "dataset" | "getContext">;

export class PosterPainter implements RenderView {
  /** Canvases waiting for the next frame, with the latest picture (null: it went away). */
  private readonly dirty = new Map<PosterTarget, CardImage | null>();
  /** The latest poster of each attached canvas (what a scrub goes back to). */
  private readonly posters = new Map<PosterTarget, CardImage | null>();
  /** Canvases showing a hover-scrub frame. */
  private readonly scrubbing = new Set<PosterTarget>();
  private readonly unregister: () => void;

  constructor(private readonly scheduler: Pick<FrameScheduler, "register" | "invalidate">) {
    this.unregister = scheduler.register("mediaThumbs", this);
  }

  /** Paints the poster of `id` into `canvas` whenever it appears or changes. Returns a detach function. */
  attach(canvas: PosterTarget, posters: PosterSource, id: MediaId): () => void {
    const stop = posters.observe(id, (image) => {
      this.posters.set(canvas, image);
      if (this.scrubbing.has(canvas)) return;
      this.dirty.set(canvas, image);
      this.scheduler.invalidate("mediaThumbs");
    });
    return () => {
      stop();
      this.dirty.delete(canvas);
      this.posters.delete(canvas);
      this.scrubbing.delete(canvas);
    };
  }

  /** Shows a hover-scrub frame in `canvas` (spec §12) until `endScrub`. */
  scrub(canvas: PosterTarget, image: CardImage): void {
    this.scrubbing.add(canvas);
    this.dirty.set(canvas, image);
    this.scheduler.invalidate("mediaThumbs");
  }

  /** The scrub ended: the canvas shows its poster again. */
  endScrub(canvas: PosterTarget): void {
    if (!this.scrubbing.delete(canvas)) return;
    this.dirty.set(canvas, this.posters.get(canvas) ?? null);
    this.scheduler.invalidate("mediaThumbs");
  }

  render(): void {
    const dirty = [...this.dirty];
    this.dirty.clear();
    for (const [canvas, image] of dirty) paint(canvas, image);
  }

  dispose(): void {
    this.unregister();
    this.dirty.clear();
    this.posters.clear();
    this.scrubbing.clear();
  }
}

function paint(canvas: PosterTarget, image: CardImage | null): void {
  // A closed bitmap (project closed, sheet evicted before this frame) reports a 0 x 0 size.
  if (!image || image.bitmap.width === 0 || image.bitmap.height === 0) {
    delete canvas.dataset.ready;
    return;
  }
  const { bitmap, sx, sy, sw, sh } = image;
  // A same-size canvas is cleared instead of reallocated (a scrub draws many frames into it).
  if (canvas.width !== sw || canvas.height !== sh) {
    canvas.width = sw;
    canvas.height = sh;
  }
  const ctx = canvas.getContext("2d");
  ctx?.clearRect(0, 0, sw, sh);
  ctx?.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
  canvas.dataset.ready = "";
}

/** An image's whole poster as a card picture. */
export const wholeImage = (bitmap: ImageBitmap | null): CardImage | null => (bitmap ? { bitmap, sx: 0, sy: 0, sw: bitmap.width, sh: bitmap.height } : null);
