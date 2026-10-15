// Zoom and pan on the preview canvas (spec §7.1, §7.5): pointer and wheel input on the overlay canvas,
// written to the session's view (`preview.zoom`, `panX`, `panY`) only: no React render (P1), no
// document change. Framework-free.
// - Mod+wheel or Alt+wheel (a trackpad pinch is Ctrl+wheel in Chrome) zooms around the cursor; while
//   zoomed (not Fit) a plain wheel pans vertically, Shift+wheel horizontally.
// - Middle drag pans; so does a left drag with the Hand tool or while Space is held. Space arms like
//   the timeline's (spec §6.6): while stopped, with the pointer over the canvas and the view zoomed, a
//   plain Space press arms a pan (grab cursor) instead of reaching the shortcuts; released without a
//   pan it is the play/pause tap it would have been (`onSpaceTap`).
// - The canvas rect is read once when the pointer enters it (P9) and again after the panel resizes.
import { isEditableTarget } from "../../core/keyboard/KeyDispatcher.js";
import type { Store } from "../../core/store/createStore.js";
import type { LayoutState } from "../../core/store/layoutStore.js";
import type { SessionState } from "../../core/store/sessionStore.js";
import { panBy, viewScale, zoomAround, type Size, type ViewState } from "./viewport.js";

/** Zoom factor per wheel pixel: one 100 px mouse notch zooms by e^0.25 (about 1.28x). */
const WHEEL_ZOOM_RATE = 0.0025;

export interface ViewportInputDeps {
  session: Store<SessionState>;
  layout: Store<LayoutState>;
  /** The project frame size (project px). */
  frame(): Size;
  /** The canvas backing size (device px), the margin at Fit (device px) and the device pixel ratio. */
  target(): { width: number; height: number; margin: number; dpr: number };
  /** Playback runs: Space stays play/pause and does not arm the pan. */
  playing(): boolean;
  /** Space was pressed and released over the canvas without panning. */
  onSpaceTap(): void;
}

interface PanDrag {
  pointerId: number;
  x: number;
  y: number;
}

export class ViewportInput {
  private element: HTMLElement | null = null;
  private rect: { left: number; top: number } | null = null;
  private over = false;
  private space: { panned: boolean } | null = null;
  private drag: PanDrag | null = null;
  private readonly stops: (() => void)[] = [];

  constructor(private readonly deps: ViewportInputDeps) {}

  attach(element: HTMLElement): () => void {
    this.detach();
    this.element = element;
    const win = element.ownerDocument.defaultView;
    const listen = <K extends keyof HTMLElementEventMap>(type: K, handler: (event: HTMLElementEventMap[K]) => void, options?: AddEventListenerOptions) => {
      element.addEventListener(type, handler as EventListener, options);
      this.stops.push(() => element.removeEventListener(type, handler as EventListener, options));
    };
    listen("pointerenter", () => {
      this.over = true;
      this.rect = null;
    });
    listen("pointerleave", () => {
      this.over = false;
    });
    listen("wheel", (event) => this.onWheel(event), { passive: false });
    listen("pointerdown", (event) => this.onPointerDown(event));
    listen("pointermove", (event) => this.onPointerMove(event));
    listen("pointerup", (event) => this.endDrag(event));
    listen("pointercancel", (event) => this.endDrag(event));
    // A middle press would start the browser's autoscroll.
    listen("mousedown", (event) => {
      if (event.button === 1) event.preventDefault();
    });
    // Capture phase, ahead of the KeyDispatcher: an armed Space never reaches the shortcuts.
    const onKey = (event: KeyboardEvent) => this.onSpaceKey(event);
    const onBlur = () => this.disarm();
    win?.addEventListener("keydown", onKey, true);
    win?.addEventListener("keyup", onKey, true);
    win?.addEventListener("blur", onBlur);
    this.stops.push(
      () => {
        win?.removeEventListener("keydown", onKey, true);
        win?.removeEventListener("keyup", onKey, true);
        win?.removeEventListener("blur", onBlur);
      },
      this.deps.layout.select(
        (state) => state.panels.preview,
        () => {
          this.rect = null;
        },
      ),
      this.deps.session.select(
        (state) => state.activeTool,
        () => this.updateCursor(),
      ),
      this.deps.session.select(
        (state) => state.preview.zoom,
        () => this.updateCursor(),
      ),
    );
    this.updateCursor();
    return () => this.detach();
  }

  detach(): void {
    for (const stop of this.stops.splice(0)) stop();
    this.element = null;
    this.rect = null;
    this.space = null;
    this.drag = null;
  }

  /** A pan drag or an armed Space is in progress. */
  get panning(): boolean {
    return this.drag !== null || this.space !== null;
  }

  private onWheel(event: WheelEvent): void {
    const view = this.view();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
    const { dpr } = this.deps.target();
    if (event.ctrlKey || event.metaKey || event.altKey) {
      event.preventDefault();
      const point = this.point(event);
      if (!point) return;
      const factor = Math.exp(-event.deltaY * unit * WHEEL_ZOOM_RATE);
      this.setView(zoomAround(view, this.currentScale(view) * factor, point.x, point.y, this.deps.frame(), this.targetSize(), this.deps.target().margin));
      return;
    }
    if (view.zoom === "fit") return;
    event.preventDefault();
    const horizontal = event.shiftKey ? event.deltaX || event.deltaY : event.deltaX;
    const vertical = event.shiftKey ? 0 : event.deltaY;
    this.setView(panBy(view, -horizontal * unit * dpr, -vertical * unit * dpr, this.deps.frame()));
  }

  private onPointerDown(event: PointerEvent): void {
    const left = event.button === 0 && (this.space !== null || this.deps.session.getState().activeTool === "hand");
    // At Fit the whole frame shows: nothing to pan.
    if ((event.button !== 1 && !left) || this.view().zoom === "fit") return;
    event.preventDefault();
    if (this.space) this.space.panned = true;
    this.drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    this.element?.setPointerCapture?.(event.pointerId);
    this.updateCursor();
  }

  private onPointerMove(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { dpr } = this.deps.target();
    const dx = (event.clientX - drag.x) * dpr;
    const dy = (event.clientY - drag.y) * dpr;
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (dx !== 0 || dy !== 0) this.setView(panBy(this.view(), dx, dy, this.deps.frame()));
  }

  private endDrag(event: PointerEvent): void {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    this.drag = null;
    if (this.element?.hasPointerCapture?.(event.pointerId)) this.element.releasePointerCapture(event.pointerId);
    this.updateCursor();
  }

  private onSpaceKey(event: KeyboardEvent): void {
    if (event.code !== "Space") return;
    if (event.type === "keyup") {
      const space = this.space;
      if (!space) return;
      this.disarm();
      if (!space.panned) this.deps.onSpaceTap();
      return;
    }
    if (this.space) {
      // Repeats of the held key.
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.repeat || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || isEditableTarget(event.target)) return;
    if (!this.over || this.deps.playing() || this.view().zoom === "fit") return;
    event.preventDefault();
    event.stopPropagation();
    this.space = { panned: false };
    this.updateCursor();
  }

  private disarm(): void {
    if (!this.space) return;
    this.space = null;
    this.updateCursor();
  }

  private updateCursor(): void {
    const element = this.element;
    if (!element) return;
    const hand = this.space !== null || this.deps.session.getState().activeTool === "hand";
    const cursor = this.drag ? "grabbing" : hand && this.view().zoom !== "fit" ? "grab" : "";
    if (element.style.cursor !== cursor) element.style.cursor = cursor;
  }

  private view(): ViewState {
    const { zoom, panX, panY } = this.deps.session.getState().preview;
    return { zoom, panX, panY };
  }

  private setView(next: ViewState): void {
    this.deps.session.set((state) => {
      const current = state.preview;
      if (current.zoom === next.zoom && current.panX === next.panX && current.panY === next.panY) return state;
      return { ...state, preview: { ...current, zoom: next.zoom, panX: next.panX, panY: next.panY } };
    });
  }

  /** Device px per project px of the view as drawn (Fit included). */
  private currentScale(view: ViewState): number {
    return viewScale(view.zoom, this.deps.frame(), this.targetSize(), this.deps.target().margin);
  }

  private targetSize(): Size {
    const { width, height } = this.deps.target();
    return { width, height };
  }

  /** The pointer in canvas device px (the rect read once per enter). */
  private point(event: MouseEvent): { x: number; y: number } | null {
    const element = this.element;
    if (!element) return null;
    if (!this.rect) {
      const rect = element.getBoundingClientRect();
      this.rect = { left: rect.left, top: rect.top };
    }
    const { dpr } = this.deps.target();
    return { x: (event.clientX - this.rect.left) * dpr, y: (event.clientY - this.rect.top) * dpr };
  }
}
