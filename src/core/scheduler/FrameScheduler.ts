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

type RequestFrame = (callback: (time: number) => void) => number;
type CancelFrame = (handle: number) => void;

export class FrameScheduler {
  private readonly views = new Map<InvalidationFlag, Set<RenderView>>();
  private dirty = new Set<InvalidationFlag>();
  private readonly tickers = new Set<Ticker>();
  private handle: number | null = null;
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

  dispose(): void {
    if (this.handle !== null) this.cancelFrame(this.handle);
    this.handle = null;
    this.dirty.clear();
    this.views.clear();
    this.tickers.clear();
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
    for (const view of toRender) {
      try {
        view.render(time);
      } catch (error) {
        console.error("[scheduler] view render failed", error);
      }
    }
    if (this.handle === null && (this.tickers.size > 0 || this.dirty.size > 0)) this.handle = this.requestFrame(this.frame);
  };
}
