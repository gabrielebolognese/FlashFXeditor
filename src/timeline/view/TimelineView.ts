// The timeline view (spec §6.17, P1, P3, P9, P10): a framework-free pair of stacked canvases in the
// timeline panel. The content canvas (ruler, headers, tracks, clips) redraws on document, selection,
// zoom/scroll, size and theme changes; the overlay canvas (playhead, hover) on every interaction
// frame. Both draw only from the FrameScheduler. Zoom and scroll live in the session store; the view
// subscribes to them directly and React never renders for them.
import type { Affect } from "../../core/commands/command.js";
import type { ClipId, Project, TrackKind } from "../../core/document/types.js";
import { watchDevicePixelRatio } from "../../core/scheduler/devicePixelRatio.js";
import type { FrameScheduler, RenderView } from "../../core/scheduler/FrameScheduler.js";
import type { Store } from "../../core/store/createStore.js";
import type { DocumentStore } from "../../core/store/DocumentStore.js";
import type { LayoutState, Size } from "../../core/store/layoutStore.js";
import { clickClipSelection, EMPTY_SELECTION } from "../../core/store/selection.js";
import { setPlayhead, setSelection, type SessionStore } from "../../core/store/sessionStore.js";
import type { Theme, ThemeBridge } from "../../core/theme/theme.js";
import { contentEnd, neighbors } from "../model/queries.js";
import { drawContent } from "./drawContent.js";
import { drawOverlay } from "./drawOverlay.js";
import { TimelineGeometry, type TimelineMetrics } from "./geometry.js";
import { HitTester, type HitResult } from "./HitTester.js";
import { TextCache } from "./textCache.js";
import {
  fitView,
  keyZoomAnchor,
  pageToFrame,
  scrollBy,
  wheelDeltaPx,
  wheelZoomFactor,
  zoomAt,
  zoomLimits,
  type TimelineViewport,
  type ZoomContext,
} from "./zoom.js";

/** Document changes that move or restyle what the content canvas shows. */
const CONTENT_AFFECTS: readonly Affect[] = ["timeline", "clips", "tracks", "markers", "captions", "settings"];

export interface TimelineViewDeps {
  scheduler: Pick<FrameScheduler, "register" | "invalidate">;
  document: Pick<DocumentStore, "getState" | "subscribe">;
  session: SessionStore;
  layout: Store<LayoutState>;
  theme: Pick<ThemeBridge, "theme" | "subscribe">;
  /** A "+ track" row was clicked. */
  onAddTrack(kind: TrackKind): void;
}

export interface TimelineStats {
  contentDraws: number;
  overlayDraws: number;
  /** Clips drawn by the last content pass, and clips in the document. */
  clipsDrawn: number;
  clipsTotal: number;
  /** Duration of the last content and overlay passes. */
  contentMs: number;
  overlayMs: number;
  resizes: number;
}

interface Layer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** Backing store in device px. */
  width: number;
  height: number;
}

type Gesture = { kind: "scrub"; pointerId: number };

function metricsOf(theme: Theme): TimelineMetrics {
  const tl = theme.timeline;
  return { headerWidth: tl.headerWidth, rulerHeight: tl.rulerHeight, dividerHeight: tl.dividerHeight, addRowHeight: tl.addRowHeight, trackHeight: tl.trackHeight };
}

const sameHover = (a: HitResult | null, b: HitResult | null) =>
  a === b || (a !== null && b !== null && a.type === b.type && a.clipId === b.clipId && a.addTrack === b.addTrack && a.trackId === b.trackId);

function cursorFor(hit: HitResult | null, gesture: Gesture | null): string {
  if (gesture?.kind === "scrub") return "ew-resize";
  if (!hit) return "default";
  if (hit.type === "ruler" || hit.type === "playheadHead") return "ew-resize";
  if (hit.type === "trackHeader" && hit.addTrack) return "pointer";
  return "default";
}

export class TimelineView {
  readonly stats: TimelineStats = { contentDraws: 0, overlayDraws: 0, clipsDrawn: 0, clipsTotal: 0, contentMs: 0, overlayMs: 0, resizes: 0 };
  readonly hitTester: HitTester;

  private content: Layer | null = null;
  private overlay: Layer | null = null;
  private size: Size = { width: 0, height: 0 };
  private metrics: TimelineMetrics;
  private readonly text = new TextCache();
  private cachedGeometry: { key: readonly unknown[]; geometry: TimelineGeometry } | null = null;
  /** Zoom shown while the toolbar slider is dragged; written to the session once on release. */
  private ephemeral: TimelineViewport | null = null;
  private gesture: Gesture | null = null;
  /** Follow playhead (spec §6.2): on until the user scrolls or wheel-zooms, back on at the next play. */
  private following = true;
  /** Last pointer position over the overlay in CSS px, or null once it left. */
  private pointer: { x: number; y: number } | null = null;
  private hover: HitResult | null = null;
  private cursor = "default";
  private statsElement: HTMLElement | null = null;
  private readonly stops: (() => void)[] = [];

  private readonly contentView: RenderView = { render: () => this.renderContent() };
  private readonly overlayView: RenderView = { render: () => this.renderOverlay() };

  constructor(private readonly deps: TimelineViewDeps) {
    this.metrics = metricsOf(deps.theme.theme);
    this.hitTester = new HitTester({
      geometry: () => this.geometry(),
      project: () => this.deps.document.getState(),
      playhead: () => this.deps.session.state.getState().playhead,
      get playheadHeadWidth() {
        return deps.theme.theme.timeline.playheadHeadWidth;
      },
    });
  }

  /** Creates both canvases inside `host` and starts following the stores. */
  mount(host: HTMLElement): () => void {
    this.unmount();
    const { scheduler, document, session, layout, theme } = this.deps;
    this.content = createLayer(host);
    this.overlay = createLayer(host);
    const overlay = this.overlay.canvas;

    const both = () => {
      scheduler.invalidate("timelineContent");
      scheduler.invalidate("timelineOverlay");
    };
    const onPointerDown = (event: PointerEvent) => this.onPointerDown(event);
    const onPointerMove = (event: PointerEvent) => this.onPointerMove(event);
    const onPointerUp = (event: PointerEvent) => this.endGesture(event.pointerId);
    const onPointerLeave = () => {
      this.pointer = null;
      this.setHover(null);
    };
    const onWheel = (event: WheelEvent) => this.onWheel(event);
    overlay.addEventListener("pointerdown", onPointerDown);
    overlay.addEventListener("pointermove", onPointerMove);
    overlay.addEventListener("pointerup", onPointerUp);
    overlay.addEventListener("pointercancel", onPointerUp);
    overlay.addEventListener("lostpointercapture", onPointerUp);
    overlay.addEventListener("pointerleave", onPointerLeave);
    overlay.addEventListener("wheel", onWheel, { passive: false });

    this.stops.push(
      scheduler.register("timelineContent", this.contentView),
      scheduler.register("timelineOverlay", this.overlayView),
      layout.select(
        (state) => state.panels.timeline,
        (size) => {
          this.size = size;
          this.stats.resizes += 1;
          both();
        },
        { fireImmediately: true },
      ),
      session.state.select((state) => state.timeline, both),
      session.state.select((state) => state.playhead, () => scheduler.invalidate("timelineOverlay")),
      session.selection.subscribe(() => scheduler.invalidate("timelineContent")),
      // The FrameScheduler flags of document changes (spec §3.4): every command carries `affects`.
      document.subscribe(both, { affects: CONTENT_AFFECTS }),
      theme.subscribe((next) => {
        this.metrics = metricsOf(next);
        this.text.clear();
        both();
      }),
      watchDevicePixelRatio(host.ownerDocument.defaultView, both),
      () => {
        overlay.removeEventListener("pointerdown", onPointerDown);
        overlay.removeEventListener("pointermove", onPointerMove);
        overlay.removeEventListener("pointerup", onPointerUp);
        overlay.removeEventListener("pointercancel", onPointerUp);
        overlay.removeEventListener("lostpointercapture", onPointerUp);
        overlay.removeEventListener("pointerleave", onPointerLeave);
        overlay.removeEventListener("wheel", onWheel);
      },
    );
    both();
    return () => this.unmount();
  }

  unmount(): void {
    for (const stop of this.stops.splice(0)) stop();
    this.content?.canvas.remove();
    this.overlay?.canvas.remove();
    this.content = null;
    this.overlay = null;
    this.gesture = null;
    this.pointer = null;
    this.hover = null;
    this.ephemeral = null;
    this.cachedGeometry = null;
  }

  get mounted(): boolean {
    return this.content !== null;
  }

  /** True while the playhead is dragged on the ruler (the preview then asks frames with scrub priority, P8). */
  get scrubbing(): boolean {
    return this.gesture?.kind === "scrub";
  }

  /** Dev stats text target (written after each draw), or null to stop. */
  attachStats(element: HTMLElement | null): void {
    this.statsElement = element;
    this.writeStats();
  }

  // --- Viewport -------------------------------------------------------------------------------

  /** Zoom and scroll as drawn: the slider's live value while it is dragged, else the session's. */
  viewport(): TimelineViewport {
    if (this.ephemeral) return this.ephemeral;
    const { pxPerFrame, scrollFrame } = this.deps.session.state.getState().timeline;
    return { pxPerFrame, scrollFrame };
  }

  zoomContext(): ZoomContext {
    const project = this.deps.document.getState();
    return { width: this.geometry().area.width, contentEnd: contentEnd(project), fps: project.settings.fps };
  }

  zoomLimits(): { min: number; max: number } {
    return zoomLimits(this.zoomContext());
  }

  geometry(): TimelineGeometry {
    const { tracks } = this.deps.document.getState();
    const { scrollY } = this.deps.session.state.getState().timeline;
    const view = this.viewport();
    const key = [this.size, tracks, view.pxPerFrame, view.scrollFrame, scrollY, this.metrics];
    const cached = this.cachedGeometry;
    if (cached && cached.key.every((value, i) => Object.is(value, key[i]))) return cached.geometry;
    const geometry = new TimelineGeometry({
      width: this.size.width,
      height: this.size.height,
      tracks,
      pxPerFrame: view.pxPerFrame,
      scrollFrame: view.scrollFrame,
      scrollY,
      metrics: this.metrics,
    });
    this.cachedGeometry = { key, geometry };
    return geometry;
  }

  /** Zoom keys and buttons: anchored at the playhead when visible, else at the view center. */
  zoomBy(factor: number): void {
    if (!this.mounted) return;
    const view = this.viewport();
    const context = this.zoomContext();
    const anchor = keyZoomAnchor(view, this.deps.session.state.getState().playhead, context.width);
    this.writeViewport(zoomAt(view, view.pxPerFrame * factor, anchor.frame, anchor.x, context));
  }

  /** `Fit`: the whole content in view; both scroll positions back to 0 (spec §6.2, §6.6). */
  fit(): void {
    if (!this.mounted) return;
    this.writeViewport(fitView(this.zoomContext()), 0);
  }

  /** Pages the view so `frame` is in it (spec §6.2 paging): keyboard jumps and the timecode field. */
  reveal(frame: number): void {
    if (!this.mounted || this.ephemeral) return;
    const next = pageToFrame(this.viewport(), frame, this.zoomContext());
    if (next) this.writeViewport(next);
  }

  /** During playback: pages the view when the playhead leaves it, unless the user scrolled since play. */
  follow(frame: number): void {
    if (this.following) this.reveal(frame);
  }

  /** Playback started: follow the playhead again. */
  resumeFollowing(): void {
    this.following = true;
  }

  get isFollowing(): boolean {
    return this.following;
  }

  /** Slider drag: draw at `pxPerFrame` without touching the session. */
  previewZoom(pxPerFrame: number): void {
    if (!this.mounted) return;
    const view = this.viewport();
    const context = this.zoomContext();
    const anchor = keyZoomAnchor(view, this.deps.session.state.getState().playhead, context.width);
    this.ephemeral = zoomAt(view, pxPerFrame, anchor.frame, anchor.x, context);
    this.deps.scheduler.invalidate("timelineContent");
    this.deps.scheduler.invalidate("timelineOverlay");
  }

  /** Slider release: one session write. */
  commitPreviewZoom(): void {
    const view = this.ephemeral;
    if (!view) return;
    this.ephemeral = null;
    this.writeViewport(view);
  }

  private writeViewport(view: TimelineViewport, scrollY?: number): void {
    this.deps.session.state.set((state) => {
      const timeline = state.timeline;
      const nextY = scrollY ?? timeline.scrollY;
      if (timeline.pxPerFrame === view.pxPerFrame && timeline.scrollFrame === view.scrollFrame && timeline.scrollY === nextY) return state;
      return { ...state, timeline: { pxPerFrame: view.pxPerFrame, scrollFrame: view.scrollFrame, scrollY: nextY } };
    });
  }

  private scrollVertically(deltaPx: number): void {
    const { min, max } = this.geometry().scrollYRange;
    const current = this.deps.session.state.getState().timeline.scrollY;
    // Never pull a view that is already outside the range (tracks were removed) further out.
    const next = Math.min(Math.max(current, max), Math.max(Math.min(current, min), current + deltaPx));
    if (next !== current) this.writeViewport(this.viewport(), next);
  }

  // --- Input ----------------------------------------------------------------------------------

  private onPointerDown(event: PointerEvent): void {
    this.pointer = { x: event.offsetX, y: event.offsetY };
    if (event.button !== 0 || this.gesture) return;
    const hit = this.hitTester.hit(event.offsetX, event.offsetY);
    switch (hit.type) {
      case "ruler":
      case "playheadHead": {
        // TODO(batch 12): Shift snaps the playhead to edit points while snapping is on.
        this.overlay?.canvas.setPointerCapture(event.pointerId);
        this.gesture = { kind: "scrub", pointerId: event.pointerId };
        this.scrubTo(hit.frame);
        this.deps.scheduler.invalidate("timelineOverlay");
        break;
      }
      case "clip": {
        const { selection } = this.deps.session;
        setSelection(this.deps.session, clickClipSelection(selection.getState(), hit.clipId as ClipId, event.shiftKey));
        break;
      }
      case "trackHeader":
        // TODO(batch 16): track selection and header toggles.
        if (hit.addTrack) this.deps.onAddTrack(hit.addTrack);
        break;
      case "empty":
        if (!event.shiftKey && event.offsetX >= this.geometry().headerWidth) setSelection(this.deps.session, EMPTY_SELECTION);
        break;
      default:
        break;
    }
    // "+ track" moves the rows under the pointer; a pen or touch down may come with no move before it.
    if (this.refreshHover()) this.deps.scheduler.invalidate("timelineOverlay");
  }

  private onPointerMove(event: PointerEvent): void {
    this.pointer = { x: event.offsetX, y: event.offsetY };
    if (this.gesture?.kind === "scrub") {
      if (event.pointerId === this.gesture.pointerId) this.scrubTo(this.geometry().xToFrame(event.offsetX));
      return;
    }
    this.setHover(this.hitTester.hit(event.offsetX, event.offsetY));
  }

  private scrubTo(frame: number): void {
    setPlayhead(this.deps.session, Math.round(frame));
  }

  private endGesture(pointerId: number): void {
    if (this.gesture?.pointerId !== pointerId) return;
    this.gesture = null;
    this.refreshHover();
    this.deps.scheduler.invalidate("timelineOverlay");
  }

  private setHover(hit: HitResult | null): void {
    const prev = this.hover;
    this.hover = hit;
    if (!sameHover(prev, hit)) this.deps.scheduler.invalidate("timelineOverlay");
    this.updateCursor();
  }

  /**
   * Hit-tests again at the last pointer position, without a gesture: wheel zoom and scroll, document
   * changes, playhead moves and the end of a scrub move the view under a pointer that stays still.
   * Returns whether the hovered target changed; the overlay frame that runs it draws the new one.
   */
  private refreshHover(): boolean {
    const prev = this.hover;
    if (this.pointer && !this.gesture) this.hover = this.hitTester.hit(this.pointer.x, this.pointer.y);
    this.updateCursor();
    return !sameHover(prev, this.hover);
  }

  /** The cursor follows the hover hit; the style is written only when it changes. */
  private updateCursor(): void {
    const cursor = cursorFor(this.hover, this.gesture);
    if (cursor === this.cursor || !this.overlay) return;
    this.cursor = cursor;
    this.overlay.canvas.style.cursor = cursor;
  }

  private onWheel(event: WheelEvent): void {
    event.preventDefault();
    // A pointer that entered without moving is known from its first wheel.
    this.pointer = { x: event.offsetX, y: event.offsetY };
    const geometry = this.geometry();
    const view = this.viewport();
    const context = this.zoomContext();
    if (event.ctrlKey || event.metaKey || event.altKey) {
      // Mod/Alt+wheel and trackpad pinches (Chrome sends them with ctrlKey): zoom at the cursor.
      const factor = wheelZoomFactor(wheelDeltaPx(event.deltaY, event.deltaMode, geometry.area.height));
      const anchorX = Math.min(Math.max(event.offsetX - geometry.headerWidth, 0), geometry.area.width);
      // A manual zoom or scroll stops follow playhead until the next play (spec §6.2).
      this.following = false;
      this.writeViewport(zoomAt(view, view.pxPerFrame * factor, view.scrollFrame + anchorX / view.pxPerFrame, anchorX, context));
      return;
    }
    let dx = wheelDeltaPx(event.deltaX, event.deltaMode, geometry.area.width);
    let dy = wheelDeltaPx(event.deltaY, event.deltaMode, geometry.area.height);
    if (event.shiftKey && dx === 0) {
      dx = dy;
      dy = 0;
    }
    if (dx !== 0) {
      this.following = false;
      this.writeViewport(scrollBy(view, dx, context));
    }
    if (dy !== 0) this.scrollVertically(dy);
  }

  // --- Rendering ------------------------------------------------------------------------------

  private renderContent(): void {
    const layer = this.content;
    if (!layer || !this.prepare(layer)) return;
    const start = performance.now();
    const project = this.deps.document.getState();
    const result = drawContent({
      ctx: layer.ctx,
      dpr: this.dpr(),
      geometry: this.geometry(),
      project,
      selection: this.deps.session.selection.getState(),
      theme: this.deps.theme.theme,
      text: this.text,
    });
    this.stats.contentDraws += 1;
    this.stats.clipsDrawn = result.clipsDrawn;
    this.stats.clipsTotal = Object.keys(project.clips).length;
    this.stats.contentMs = performance.now() - start;
    this.writeStats();
  }

  private renderOverlay(): void {
    const layer = this.overlay;
    if (!layer || !this.prepare(layer)) return;
    const start = performance.now();
    // Every change that moves what lies under the pointer redraws the overlay (spec §6.18: the
    // cursor is set from the hover hit each overlay frame).
    this.refreshHover();
    const project = this.deps.document.getState();
    const geometry = this.geometry();
    drawOverlay({
      ctx: layer.ctx,
      dpr: this.dpr(),
      geometry,
      theme: this.deps.theme.theme,
      playhead: this.deps.session.state.getState().playhead,
      scrubbing: this.gesture?.kind === "scrub",
      hoverClip: this.hoverClip(project, geometry),
      hoverAddRow: this.hover?.addTrack ? (this.hover.addTrack === "video" ? geometry.addVideo : geometry.addAudio) : null,
    });
    this.stats.overlayDraws += 1;
    this.stats.overlayMs = performance.now() - start;
    this.writeStats();
  }

  private hoverClip(project: Project, geometry: TimelineGeometry) {
    const id = this.hover?.type === "clip" ? this.hover.clipId : null;
    const clip = id !== null ? project.clips[id] : undefined;
    const row = clip ? geometry.rowOf(clip.trackId) : null;
    if (!clip || !row) return null;
    const next = neighbors(project, clip.id).next;
    return { clip, row, abutsNext: next !== null && next.start === clip.start + clip.duration };
  }

  private dpr(): number {
    return this.content?.canvas.ownerDocument.defaultView?.devicePixelRatio ?? 1;
  }

  /** Sizes the backing store to the panel at the current DPR (inside the render, so never blank). */
  private prepare(layer: Layer): boolean {
    const dpr = this.dpr();
    const width = Math.round(this.size.width * dpr);
    const height = Math.round(this.size.height * dpr);
    if (width === 0 || height === 0) return false;
    if (width !== layer.width || height !== layer.height) {
      layer.canvas.width = width;
      layer.canvas.height = height;
      layer.canvas.style.width = `${this.size.width}px`;
      layer.canvas.style.height = `${this.size.height}px`;
      layer.width = width;
      layer.height = height;
    }
    return true;
  }

  private writeStats(): void {
    const element = this.statsElement;
    if (!element) return;
    const s = this.stats;
    const view = this.viewport();
    element.textContent =
      `content ${s.contentDraws} draws · ${s.clipsDrawn}/${s.clipsTotal} clips · ${s.contentMs.toFixed(1)} ms\n` +
      `overlay ${s.overlayDraws} draws · ${s.overlayMs.toFixed(1)} ms · ${view.pxPerFrame.toFixed(3)} px/f`;
  }
}

function createLayer(host: HTMLElement): Layer {
  const canvas = host.ownerDocument.createElement("canvas");
  canvas.style.position = "absolute";
  canvas.style.left = "0";
  canvas.style.top = "0";
  canvas.style.display = "block";
  host.append(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is not available");
  return { canvas, ctx, width: 0, height: 0 };
}

