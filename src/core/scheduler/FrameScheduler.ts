// The single render loop (spec §3.4, P3). Views mark themselves dirty with `invalidate(flag)`; the
// scheduler renders each dirty view at most once per animation frame. Nothing else draws canvases.
// Tickers (the playback engine, spec §8) run at the start of every frame while registered, before the
// views: what they invalidate is drawn in the same frame.

/**
 * Render order within a frame, whatever order the flags were raised in: a layer's base before its
 * overlay, so an overlay registered on both flags (the preview stats) reports the render it follows.
 * The flag type is derived from it, so a new flag cannot be left out of the order.
 */
// `gizmo`: the 2D canvas over the preview (overlays, Batch 22's gizmo); `previewOverlay`: the preview's dev stats and status strip;
// `devStats`: the performance overlay (Batch 45), last so it reports the frame's other renders.
const FLAG_ORDER = ["timelineContent", "timelineOverlay", "preview", "gizmo", "previewOverlay", "meters", "mediaThumbs", "devStats"] as const;

// Document commands carry `affects` flags (timeline, clips, tracks, ...); each view maps the ones it
// draws onto its own flags when it subscribes (e.g. TimelineView: document changes -> timelineContent).
export type InvalidationFlag = (typeof FLAG_ORDER)[number];

export interface RenderView {
  render(time: number): void;
}

/** Runs once per animation frame, before the views render. */
export type Ticker = (time: number) => void;

/** Renders a view may fail in a row before `onViewFailure` hears of it (one bad frame is only logged). */
export const VIEW_FAILURE_LIMIT = 3;

type RequestFrame = (callback: (time: number) => void) => number;
type CancelFrame = (handle: number) => void;

export class FrameScheduler {
  private readonly views = new Map<InvalidationFlag, Set<RenderView>>();
  private dirty = new Set<InvalidationFlag>();
  private readonly tickers = new Set<Ticker>();
  /** Renders failed in a row, per view. */
  private readonly failures = new Map<RenderView, number>();
  private handle: number | null = null;
  /**
   * Called once when a view has failed VIEW_FAILURE_LIMIT renders in a row, with the flags it is
   * registered for (Batch 47: the app puts the view's panel in its error state).
   */
  onViewFailure: ((flags: InvalidationFlag[], error: unknown) => void) | null = null;
  /** True while tickers run: their invalidations are rendered in this frame. */
  private ticking = false;

  constructor(
    private readonly requestFrame: RequestFrame = (cb) => requestAnimationFrame(cb),
    private readonly cancelFrame: CancelFrame = (handle) => cancelAnimationFrame(handle),
  ) {}

  /** Registers a view for a flag. Returns an unregister function. */
  register(flag: InvalidationFlag, view: RenderView): () => void {
    let set = this.views.get(flag);
    if (!set) {
      set = new Set();
      this.views.set(flag, set);
    }
    set.add(view);
    return () => {
      set.delete(view);
      this.failures.delete(view);
    };
  }

  invalidate(flag: InvalidationFlag): void {
    this.dirty.add(flag);
    if (this.handle === null && !this.ticking) this.handle = this.requestFrame(this.frame);
  }

  /** Runs `ticker` at the start of every frame until the returned function is called. */
  addTicker(ticker: Ticker): () => void {
    this.tickers.add(ticker);
    if (this.handle === null && !this.ticking) this.handle = this.requestFrame(this.frame);
    return () => {
      this.tickers.delete(ticker);
    };
  }

  isScheduled(): boolean {
    return this.handle !== null;
  }

  /**
   * Renders the dirty views of `flags` now, outside the frame, in FLAG_ORDER (Batch 52): a resize
   * observed before paint (the preset bar toggled) draws the canvas at its new size in the same frame,
   * so it never shows a frame laid out for the old one. The flags are no longer dirty afterwards.
   */
  flush(flags: readonly InvalidationFlag[]): void {
    if (this.ticking) return;
    const toRender = new Set<RenderView>();
    for (const flag of FLAG_ORDER) {
      if (!flags.includes(flag) || !this.dirty.delete(flag)) continue;
      const views = this.views.get(flag);
      if (views) for (const view of views) toRender.add(view);
    }
    for (const view of toRender) this.renderView(view, performance.now());
  }

  dispose(): void {
    if (this.handle !== null) this.cancelFrame(this.handle);
    this.handle = null;
    this.dirty.clear();
    this.views.clear();
    this.tickers.clear();
  }

  private flagsOf(view: RenderView): InvalidationFlag[] {
    return FLAG_ORDER.filter((flag) => this.views.get(flag)?.has(view));
  }

  private readonly frame = (time: number): void => {
    this.handle = null;
    this.ticking = true;
    try {
      for (const ticker of [...this.tickers]) {
        try {
          ticker(time);
        } catch (error) {
          console.error("[scheduler] ticker failed", error);
        }
      }
    } finally {
      this.ticking = false;
    }
    const dirty = this.dirty;
    // Invalidations raised while rendering land in a fresh set and schedule the next frame.
    this.dirty = new Set();

    const toRender = new Set<RenderView>();
    for (const flag of FLAG_ORDER) {
      if (!dirty.has(flag)) continue;
      const views = this.views.get(flag);
      if (views) for (const view of views) toRender.add(view);
    }
    for (const view of toRender) this.renderView(view, time);
    if (this.handle === null && (this.tickers.size > 0 || this.dirty.size > 0)) this.handle = this.requestFrame(this.frame);
  };

  private renderView(view: RenderView, time: number): void {
    try {
      view.render(time);
      if (this.failures.size > 0) this.failures.delete(view);
    } catch (error) {
      console.error("[scheduler] view render failed", error);
      const failures = (this.failures.get(view) ?? 0) + 1;
      this.failures.set(view, failures);
      if (failures === VIEW_FAILURE_LIMIT) this.onViewFailure?.(this.flagsOf(view), error);
    }
  }
}
