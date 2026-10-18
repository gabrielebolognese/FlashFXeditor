// Draws preset thumbnails (the Presets tab's cards, the preset bar's buttons) inside the single render
// loop (spec §3.4, P3), like the media cards' `PosterPainter`. A canvas's preset, its size (from a
// ResizeObserver) or a font change only marks it dirty and invalidates `mediaThumbs`; the scheduler
// then calls `render` once per frame, which draws every dirty canvas once at its latest preset and size.
// Drawing is a copy of a bitmap the thumbnail service made in idle time (Batch 52, render/text/
// PresetThumbService.ts): one not made yet leaves the canvas as it is (old pixels, no flash) and is
// drawn when the service reports new bitmaps (`redrawWaiting`). Framework-free: components only hand
// over their canvas, preset, margin and size.
import type { TextPreset } from "../../core/document/types.js";
import type { FrameScheduler, RenderView } from "../../core/scheduler/FrameScheduler.js";

/**
 * Draws `preset`'s thumbnail on `canvas` at `cssWidth` x `cssHeight` CSS px with `cssMargin` around the
 * text; false when its bitmap is not made yet (nothing drawn).
 */
export type DrawPresetThumb = (canvas: HTMLCanvasElement, preset: TextPreset, cssWidth: number, cssHeight: number, cssMargin: number) => boolean;

interface ThumbCard {
  preset: TextPreset | null;
  width: number;
  height: number;
  margin: number;
}

export class PresetThumbPainter implements RenderView {
  private readonly cards = new Map<HTMLCanvasElement, ThumbCard>();
  private readonly dirty = new Set<HTMLCanvasElement>();
  /** Canvases whose bitmap was not made yet when they were drawn. */
  private readonly waiting = new Set<HTMLCanvasElement>();
  private readonly unregister: () => void;

  constructor(
    private readonly scheduler: Pick<FrameScheduler, "register" | "invalidate">,
    private readonly draw: DrawPresetThumb,
  ) {
    this.unregister = scheduler.register("mediaThumbs", this);
  }

  /** `canvas` shows `preset` with `margin` CSS px around its text (drawn at the next frame once its size is known). */
  show(canvas: HTMLCanvasElement, preset: TextPreset, margin = 0): void {
    const card = this.card(canvas);
    if (card.preset === preset && card.margin === margin) return;
    card.preset = preset;
    card.margin = margin;
    this.mark(canvas);
  }

  /** `canvas` is `width` x `height` CSS px now (a ResizeObserver report). */
  resize(canvas: HTMLCanvasElement, width: number, height: number): void {
    const card = this.card(canvas);
    if (card.width === width && card.height === height) return;
    card.width = width;
    card.height = height;
    this.mark(canvas);
  }

  /** Every canvas draws again (the device pixel ratio changed). */
  redrawAll(): void {
    for (const canvas of this.cards.keys()) this.dirty.add(canvas);
    if (this.dirty.size > 0) this.scheduler.invalidate("mediaThumbs");
  }

  /** New bitmaps were made: the canvases that waited for theirs draw again. */
  redrawWaiting(): void {
    for (const canvas of this.waiting) this.dirty.add(canvas);
    this.waiting.clear();
    if (this.dirty.size > 0) this.scheduler.invalidate("mediaThumbs");
  }

  /** The canvas is gone: it is no longer drawn. */
  detach(canvas: HTMLCanvasElement): void {
    this.cards.delete(canvas);
    this.dirty.delete(canvas);
    this.waiting.delete(canvas);
  }

  render(): void {
    const dirty = [...this.dirty];
    this.dirty.clear();
    for (const canvas of dirty) {
      const card = this.cards.get(canvas);
      // A hidden canvas (0 x 0) keeps its pixels; it draws when it gets a size again.
      if (!card?.preset || card.width <= 0 || card.height <= 0) continue;
      if (this.draw(canvas, card.preset, card.width, card.height, card.margin)) this.waiting.delete(canvas);
      else this.waiting.add(canvas);
    }
  }

  dispose(): void {
    this.unregister();
    this.cards.clear();
    this.dirty.clear();
    this.waiting.clear();
  }

  private card(canvas: HTMLCanvasElement): ThumbCard {
    let card = this.cards.get(canvas);
    if (!card) {
      card = { preset: null, width: 0, height: 0, margin: 0 };
      this.cards.set(canvas, card);
    }
    return card;
  }

  private mark(canvas: HTMLCanvasElement): void {
    this.dirty.add(canvas);
    this.scheduler.invalidate("mediaThumbs");
  }
}
