// Draws the Presets tab's card thumbnails inside the single render loop (spec §3.4, P3), like the
// media cards' `PosterPainter`. A card's preset, its size (from a ResizeObserver) or a font change only
// marks the canvas dirty and invalidates `mediaThumbs`; the scheduler then calls `render` once per
// frame, which draws every dirty card once at its latest preset and size. So opening the tab, or a
// splitter drag resizing the grid, rasterizes each card at most once per frame. Framework-free:
// `PresetThumb` only hands over its canvas, preset and size.
import type { TextPreset } from "../../core/document/types.js";
import type { FrameScheduler, RenderView } from "../../core/scheduler/FrameScheduler.js";

/** Draws `preset`'s thumbnail on `canvas` at `cssWidth` x `cssHeight` CSS px (render/text/presetThumbnails.ts in the app). */
export type DrawPresetThumb = (canvas: HTMLCanvasElement, preset: TextPreset, cssWidth: number, cssHeight: number) => void;

interface ThumbCard {
  preset: TextPreset | null;
  width: number;
  height: number;
}

export class PresetThumbPainter implements RenderView {
  private readonly cards = new Map<HTMLCanvasElement, ThumbCard>();
  private readonly dirty = new Set<HTMLCanvasElement>();
  private readonly unregister: () => void;

  constructor(
    private readonly scheduler: Pick<FrameScheduler, "register" | "invalidate">,
    private readonly draw: DrawPresetThumb,
  ) {
    this.unregister = scheduler.register("mediaThumbs", this);
  }

  /** `canvas` shows `preset` (drawn at the next frame once its size is known). */
  show(canvas: HTMLCanvasElement, preset: TextPreset): void {
    const card = this.card(canvas);
    if (card.preset === preset) return;
    card.preset = preset;
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

  /** The fonts changed (one loaded, system fonts came): every card draws again. */
  redrawAll(): void {
    for (const canvas of this.cards.keys()) this.dirty.add(canvas);
    if (this.dirty.size > 0) this.scheduler.invalidate("mediaThumbs");
  }

  /** The card is gone: it is no longer drawn. */
  detach(canvas: HTMLCanvasElement): void {
    this.cards.delete(canvas);
    this.dirty.delete(canvas);
  }

  render(): void {
    const dirty = [...this.dirty];
    this.dirty.clear();
    for (const canvas of dirty) {
      const card = this.cards.get(canvas);
      // A hidden card (0 x 0) keeps its pixels; it draws when it gets a size again.
      if (card?.preset && card.width > 0 && card.height > 0) this.draw(canvas, card.preset, card.width, card.height);
    }
  }

  dispose(): void {
    this.unregister();
    this.cards.clear();
    this.dirty.clear();
  }

  private card(canvas: HTMLCanvasElement): ThumbCard {
    let card = this.cards.get(canvas);
    if (!card) {
      card = { preset: null, width: 0, height: 0 };
      this.cards.set(canvas, card);
    }
    return card;
  }

  private mark(canvas: HTMLCanvasElement): void {
    this.dirty.add(canvas);
    this.scheduler.invalidate("mediaThumbs");
  }
}
