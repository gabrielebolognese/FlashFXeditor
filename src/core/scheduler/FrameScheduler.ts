// The single render loop (spec §3.4, P3). Views mark themselves dirty with `invalidate(flag)`; the
// scheduler renders each dirty view at most once per animation frame. Nothing else draws canvases.

// Document commands carry `affects` flags (timeline, clips, tracks, ...); each view maps the ones it
// draws onto its own flags when it subscribes (e.g. TimelineView: document changes -> timelineContent).
export type InvalidationFlag = "timelineContent" | "timelineOverlay" | "preview" | "previewOverlay" | "meters" | "mediaThumbs";

export interface RenderView {
  render(time: number): void;
}

type RequestFrame = (callback: (time: number) => void) => number;
type CancelFrame = (handle: number) => void;

export class FrameScheduler {
  private readonly views = new Map<InvalidationFlag, Set<RenderView>>();
  private dirty = new Set<InvalidationFlag>();
  private handle: number | null = null;

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
    if (this.handle === null) this.handle = this.requestFrame(this.frame);
  }

  isScheduled(): boolean {
    return this.handle !== null;
  }

  dispose(): void {
    if (this.handle !== null) this.cancelFrame(this.handle);
    this.handle = null;
    this.dirty.clear();
    this.views.clear();
  }

  private readonly frame = (time: number): void => {
    this.handle = null;
    const dirty = this.dirty;
    // Invalidations raised while rendering land in a fresh set and schedule the next frame.
    this.dirty = new Set();

    const toRender = new Set<RenderView>();
    for (const flag of dirty) {
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
  };
}
