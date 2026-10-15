// The timeline view (spec §6.17, P1, P2, P3, P9, P10): a framework-free pair of stacked canvases in
// the timeline panel. The content canvas (ruler, headers, tracks, clips) redraws on document,
// selection, zoom/scroll, size and theme changes; the overlay canvas (playhead, hover, drag ghosts,
// marquee) on every interaction frame. Both draw only from the FrameScheduler. Zoom and scroll live in
// the session store; the view subscribes to them directly and React never renders for them.
// Gestures (scrub, clip drag, marquee) keep their state here, never in a store: a clip drag reaches
// the document once, on drop, through `onMoveClips`; a marquee writes the selection once, on release.
import type { Affect } from "../../core/commands/command.js";
import { formatTimecode } from "../../core/document/time.js";
import type { ClipId, Project, TrackId, TrackKind } from "../../core/document/types.js";
import type { Platform } from "../../core/keyboard/keys.js";
import { watchDevicePixelRatio } from "../../core/scheduler/devicePixelRatio.js";
import type { FrameScheduler, RenderView } from "../../core/scheduler/FrameScheduler.js";
import type { IdleQueue } from "../../core/scheduler/IdleQueue.js";
import type { Store } from "../../core/store/createStore.js";
import type { DocumentStore } from "../../core/store/DocumentStore.js";
import type { LayoutState, Size } from "../../core/store/layoutStore.js";
import { clickSelection, EMPTY_SELECTION, type ClickModifier, type Selection } from "../../core/store/selection.js";
import { setPlayhead, setSelection, type SessionStore } from "../../core/store/sessionStore.js";
import type { Theme, ThemeBridge } from "../../core/theme/theme.js";
import type { MoveRequest } from "../edit/move.js";
import { contentEnd, isClipLocked, linkedPartners, neighbors } from "../model/queries.js";
import { drawContent } from "./drawContent.js";
import { drawOverlay } from "./drawOverlay.js";
import { TimelineGeometry, type HeaderToggle, type TimelineMetrics } from "./geometry.js";
import { edgeStep } from "./gestures/autoScroll.js";
import { MarqueeGesture } from "./gestures/marquee.js";
import { MoveGesture, NO_MODIFIERS, type DragModifiers } from "./gestures/moveClips.js";
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
  scheduler: Pick<FrameScheduler, "register" | "invalidate" | "addTicker">;
  document: Pick<DocumentStore, "getState" | "subscribe">;
  session: SessionStore;
  layout: Store<LayoutState>;
  theme: Pick<ThemeBridge, "theme" | "subscribe">;
  /** A "+ track" row was clicked. */
  onAddTrack(kind: TrackKind): void;
  /** A track header toggle (mute, solo) was clicked. */
  onToggleTrack(trackId: TrackId, toggle: HeaderToggle): void;
  /** A clip drag was dropped: the controller applies it as one command (spec §6.8, P2). */
  onMoveClips(request: MoveRequest): void;
  /** Background work pauses while a gesture runs (spec §3.4). */
  idle?: Pick<IdleQueue, "pause" | "resume">;
  /** Which key is Mod (Ctrl, or Cmd on macOS). */
  platform?: Platform;
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

/** Pointer gestures. `press` and `pendingMarquee` wait for the dead zone (spec §6.8) before dragging. */
type Gesture =
  | { kind: "scrub"; pointerId: number }
  /** A press on a clip. `click`: the selection a release without a drag sets (deferred on a selected clip, so a drag keeps the selection). */
  | { kind: "press"; pointerId: number; x: number; y: number; clipId: ClipId; frame: number; click: Selection | null; movable: boolean }
  | { kind: "move"; pointerId: number; move: MoveGesture }
  | { kind: "pendingMarquee"; pointerId: number; x: number; y: number; additive: boolean }
  | { kind: "marquee"; pointerId: number; marquee: MarqueeGesture };

/** Auto-scroll steps are given per 60 Hz frame. */
const FRAME_MS = 1000 / 60;

function metricsOf(theme: Theme): TimelineMetrics {
  const tl = theme.timeline;
  return {
    headerWidth: tl.headerWidth,
    rulerHeight: tl.rulerHeight,
    dividerHeight: tl.dividerHeight,
    addRowHeight: tl.addRowHeight,
    trackHeight: tl.trackHeight,
    headerPad: theme.space[3],
    headerLine: theme.control.comfortable,
    toggleSize: tl.toggleSize,
    toggleGap: tl.toggleGap,
  };
}

const sameHover = (a: HitResult | null, b: HitResult | null) =>
  a === b || (a !== null && b !== null && a.type === b.type && a.clipId === b.clipId && a.addTrack === b.addTrack && a.trackId === b.trackId && a.toggle === b.toggle);

function cursorFor(hit: HitResult | null, gesture: Gesture | null): string {
  if (gesture?.kind === "scrub") return "ew-resize";
  if (gesture?.kind === "move") {
    const proposal = gesture.move.proposal;
    return proposal?.refused ? "not-allowed" : proposal?.duplicate ? "copy" : "grabbing";
  }
  if (gesture) return "default";
  if (!hit) return "default";
  if (hit.type === "ruler" || hit.type === "playheadHead") return "ew-resize";
  if ((hit.type === "trackHeader" && hit.addTrack) || hit.type === "headerToggle") return "pointer";
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
  /** Modifier keys as last seen on a pointer or key event. */
  private modifiers: DragModifiers = NO_MODIFIERS;
  /** While a gesture drags: stops its auto-scroll ticker and key listeners. */
  private stopDrag: (() => void) | null = null;
  private lastTick: number | null = null;
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
    const onPointerUp = (event: PointerEvent) => this.endGesture(event.pointerId, true);
    const onPointerCancel = (event: PointerEvent) => this.endGesture(event.pointerId, false);
    const onPointerLeave = () => {
      this.pointer = null;
      this.setHover(null);
    };
    const onWheel = (event: WheelEvent) => this.onWheel(event);
    overlay.addEventListener("pointerdown", onPointerDown);
    overlay.addEventListener("pointermove", onPointerMove);
    overlay.addEventListener("pointerup", onPointerUp);
    overlay.addEventListener("pointercancel", onPointerCancel);
    overlay.addEventListener("lostpointercapture", onPointerCancel);
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
      // A drag or marquee holds clips of the document it started from: an edit under it (an undo
      // key) cancels it.
      document.subscribe(() => this.cancelGesture(), { affects: ["clips", "tracks"] }),
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
        overlay.removeEventListener("pointercancel", onPointerCancel);
        overlay.removeEventListener("lostpointercapture", onPointerCancel);
        overlay.removeEventListener("pointerleave", onPointerLeave);
        overlay.removeEventListener("wheel", onWheel);
      },
    );
    both();
    return () => this.unmount();
  }

  unmount(): void {
    this.cancelGesture();
    // A scrub is not cancelled, but its ticker and idle pause end here too.
    this.finishDrag();
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

  /** The clip drag in progress (its proposal is what the overlay draws), or null. */
  get dragging(): MoveGesture | null {
    return this.gesture?.kind === "move" ? this.gesture.move : null;
  }

  /**
   * Esc (spec §6.8): cancels a clip drag or a marquee with no document or selection change. Returns
   * false when there was nothing to cancel (a ruler scrub is not cancelled).
   */
  cancelGesture(): boolean {
    const gesture = this.gesture;
    if (!gesture || gesture.kind === "scrub") return false;
    this.gesture = null;
    this.finishDrag();
    if (gesture.kind === "marquee") this.deps.scheduler.invalidate("timelineContent");
    if (gesture.kind === "move") this.settleScrollY();
    if (this.overlay?.canvas.hasPointerCapture?.(gesture.pointerId)) this.overlay.canvas.releasePointerCapture(gesture.pointerId);
    this.refreshHover();
    this.deps.scheduler.invalidate("timelineOverlay");
    return true;
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

  /**
   * Extra vertical scroll room while a clip drag proposes new tracks, so auto-scroll can bring their
   * rows into view (spec §6.8: the ghost shows the new track row during the drag).
   */
  private dragRoom(): { above: number; below: number } {
    const lanes = this.gesture?.kind === "move" ? (this.gesture.move.proposal?.newLanes ?? []) : [];
    const height = this.deps.theme.theme.timeline.trackHeight.M;
    const video = lanes.filter((lane) => lane.kind === "video").length;
    return { above: video * height, below: (lanes.length - video) * height };
  }

  private scrollVertically(deltaPx: number): void {
    const range = this.geometry().scrollYRange;
    const room = this.dragRoom();
    const min = range.min - room.above;
    const max = range.max + room.below;
    const current = this.deps.session.state.getState().timeline.scrollY;
    // Never pull a view that is already outside the range (tracks were removed) further out.
    const next = Math.min(Math.max(current, max), Math.max(Math.min(current, min), current + deltaPx));
    if (next !== current) this.writeViewport(this.viewport(), next);
  }

  // --- Input ----------------------------------------------------------------------------------

  private modifiersOf(event: { shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }): DragModifiers {
    return { shift: event.shiftKey, alt: event.altKey, mod: this.deps.platform === "mac" ? event.metaKey : event.ctrlKey };
  }

  /** The linked partners a click selects with a clip, when Linked selection is on (spec §6.7). */
  private partners(clipId: ClipId): ClipId[] {
    return this.deps.session.state.getState().linkedSelection ? linkedPartners(this.deps.document.getState(), clipId) : [];
  }

  private onPointerDown(event: PointerEvent): void {
    this.pointer = { x: event.offsetX, y: event.offsetY };
    this.modifiers = this.modifiersOf(event);
    if (event.button !== 0 || this.gesture) return;
    const hit = this.hitTester.hit(event.offsetX, event.offsetY);
    switch (hit.type) {
      case "ruler":
      case "playheadHead": {
        // TODO(batch 12): Shift snaps the playhead to edit points while snapping is on.
        this.capture(event.pointerId);
        this.gesture = { kind: "scrub", pointerId: event.pointerId };
        this.startDrag();
        this.scrubTo(hit.frame);
        this.deps.scheduler.invalidate("timelineOverlay");
        break;
      }
      case "clip":
        // Clips on locked tracks take no selection (spec §6.12): the press acts as on empty space.
        if (isClipLocked(this.deps.document.getState(), hit.clipId as ClipId)) this.pressEmpty(event);
        else this.pressClip(event, hit.clipId as ClipId, hit.frame);
        break;
      case "trackHeader":
        // TODO(batch 16): track selection, Mod+Shift+click selects the track's clips.
        if (hit.addTrack) this.deps.onAddTrack(hit.addTrack);
        break;
      case "headerToggle":
        if (hit.trackId && hit.toggle) this.deps.onToggleTrack(hit.trackId, hit.toggle);
        break;
      case "empty":
        this.pressEmpty(event);
        break;
      default:
        break;
    }
    // "+ track" moves the rows under the pointer; a pen or touch down may come with no move before it.
    if (this.refreshHover()) this.deps.scheduler.invalidate("timelineOverlay");
  }

  /**
   * A press on a clip (spec §6.7). On an unselected clip the click selection applies at once, so a
   * drag moves the new selection. On a selected clip it waits for the release: a drag moves the whole
   * selection, a click without a drag then applies (plain: only this clip and its partners; Shift and
   * Mod: remove it; Alt: only this clip).
   */
  private pressClip(event: PointerEvent, clipId: ClipId, frame: number): void {
    const { session } = this.deps;
    const selection = session.selection.getState();
    const modifier: ClickModifier = event.altKey ? "alt" : this.modifiers.mod ? "mod" : event.shiftKey ? "shift" : "none";
    const partners = modifier === "none" || modifier === "shift" ? this.partners(clipId) : [];
    const next = clickSelection(selection, clipId, modifier, partners);
    const selected = selection.kind === "clips" && selection.clipIds.has(clipId);
    if (!selected) setSelection(session, next);
    const movable = session.state.getState().activeTool === "select";
    this.capture(event.pointerId);
    this.gesture = { kind: "press", pointerId: event.pointerId, x: event.offsetX, y: event.offsetY, clipId, frame, click: selected ? next : null, movable };
  }

  /** A press on empty track space: a marquee once it moves past the dead zone, else a click that clears the selection. */
  private pressEmpty(event: PointerEvent): void {
    const geometry = this.geometry();
    if (event.offsetX < geometry.headerWidth || event.offsetY < geometry.rulerHeight) return;
    this.capture(event.pointerId);
    this.gesture = { kind: "pendingMarquee", pointerId: event.pointerId, x: event.offsetX, y: event.offsetY, additive: event.shiftKey };
  }

  private capture(pointerId: number): void {
    this.overlay?.canvas.setPointerCapture(pointerId);
  }

  private onPointerMove(event: PointerEvent): void {
    this.pointer = { x: event.offsetX, y: event.offsetY };
    this.modifiers = this.modifiersOf(event);
    const gesture = this.gesture;
    if (!gesture) {
      this.setHover(this.hitTester.hit(event.offsetX, event.offsetY));
      return;
    }
    if (event.pointerId !== gesture.pointerId) return;
    const threshold = this.deps.theme.theme.timeline.dragThreshold;
    switch (gesture.kind) {
      case "scrub":
        this.scrubTo(this.geometry().xToFrame(event.offsetX));
        break;
      case "press":
        if (gesture.movable && Math.hypot(event.offsetX - gesture.x, event.offsetY - gesture.y) > threshold) this.startMove(gesture);
        break;
      case "pendingMarquee":
        if (Math.hypot(event.offsetX - gesture.x, event.offsetY - gesture.y) > threshold) this.startMarquee(gesture);
        break;
      case "move":
      case "marquee":
        this.followPointer();
        break;
    }
  }

  /** The press became a drag: the selection (with the pressed clip) starts moving. */
  private startMove(press: Extract<Gesture, { kind: "press" }>): void {
    const project = this.deps.document.getState();
    const selection = this.deps.session.selection.getState();
    const ids = selection.kind === "clips" && selection.clipIds.has(press.clipId) ? [...selection.clipIds] : [press.clipId];
    this.gesture = { kind: "move", pointerId: press.pointerId, move: new MoveGesture(project, ids, press.clipId, press.frame) };
    this.startDrag();
    this.followPointer();
  }

  private startMarquee(pending: Extract<Gesture, { kind: "pendingMarquee" }>): void {
    const geometry = this.geometry();
    const base = pending.additive ? this.deps.session.selection.getState() : EMPTY_SELECTION;
    const marquee = new MarqueeGesture(pending.additive, base, geometry.xToFrame(pending.x), pending.y + geometry.scrollY);
    this.gesture = { kind: "marquee", pointerId: pending.pointerId, marquee };
    this.startDrag();
    this.followPointer();
  }

  /**
   * Brings the drag in step with the pointer, the modifiers and the view (pointer moves, modifier
   * keys, wheel and auto-scroll): a clip drag recomputes its proposal, a marquee its rectangle and
   * selection (the content canvas redraws only when the selection changes).
   */
  private followPointer(): void {
    const gesture = this.gesture;
    const pointer = this.pointer;
    if (!gesture || !pointer) return;
    const geometry = this.geometry();
    if (gesture.kind === "move") {
      const { move } = gesture;
      const lane = move.anchorLane ? geometry.laneAt(move.anchorLane.kind, pointer.y) : null;
      move.update(geometry.xToFrame(pointer.x), lane, this.modifiers);
      this.updateCursor();
      this.deps.scheduler.invalidate("timelineOverlay");
    } else if (gesture.kind === "marquee") {
      const project = this.deps.document.getState();
      if (gesture.marquee.update(geometry, project, pointer.x, pointer.y, (id) => this.partners(id))) this.deps.scheduler.invalidate("timelineContent");
      this.deps.scheduler.invalidate("timelineOverlay");
    }
  }

  /** A drag began: background work pauses, the edges auto-scroll, modifier keys update the drag. */
  private startDrag(): void {
    if (this.stopDrag) return;
    const { idle, scheduler } = this.deps;
    idle?.pause("gesture");
    this.lastTick = null;
    const stopTicker = scheduler.addTicker((time) => this.autoScroll(time));
    const win = this.overlay?.canvas.ownerDocument.defaultView ?? null;
    const onKey = (event: KeyboardEvent) => {
      // A lone Alt press-and-release would move the focus to the browser menu (Windows).
      if (event.key === "Alt") event.preventDefault();
      this.modifiers = this.modifiersOf(event);
      if (this.gesture?.kind === "move") this.followPointer();
    };
    win?.addEventListener("keydown", onKey);
    win?.addEventListener("keyup", onKey);
    this.stopDrag = () => {
      stopTicker();
      win?.removeEventListener("keydown", onKey);
      win?.removeEventListener("keyup", onKey);
      idle?.resume("gesture");
    };
  }

  private finishDrag(): void {
    this.stopDrag?.();
    this.stopDrag = null;
  }

  /** Auto-scroll (spec §6.6): a pointer near or past an edge of the track area scrolls the view under the drag. */
  private autoScroll(time: number): void {
    const gesture = this.gesture;
    const pointer = this.pointer;
    const elapsed = this.lastTick === null ? FRAME_MS : Math.min(Math.max(time - this.lastTick, 0), 3 * FRAME_MS);
    this.lastTick = time;
    if (!gesture || !pointer || (gesture.kind !== "scrub" && gesture.kind !== "move" && gesture.kind !== "marquee")) return;
    const geometry = this.geometry();
    const { area } = geometry;
    const zone = this.deps.theme.theme.timeline.autoScrollZone;
    const scale = elapsed / FRAME_MS;
    const dx = edgeStep(pointer.x, area.x, area.x + area.width, zone) * scale;
    const dy = gesture.kind === "scrub" ? 0 : edgeStep(pointer.y, area.y, area.y + area.height, zone) * scale;
    if (dx === 0 && dy === 0) return;
    if (dx !== 0) {
      const context = this.zoomContext();
      // A drag may take clips past the content end: the view can follow them there.
      const end = gesture.kind === "move" ? Math.max(context.contentEnd, gesture.move.proposal?.end ?? 0) : context.contentEnd;
      this.following = false;
      this.writeViewport(scrollBy(this.viewport(), dx, { ...context, contentEnd: end }));
    }
    if (dy !== 0) this.scrollVertically(dy);
    if (gesture.kind === "scrub") this.scrubTo(this.geometry().xToFrame(pointer.x));
    else this.followPointer();
  }

  private scrubTo(frame: number): void {
    setPlayhead(this.deps.session, Math.round(frame));
  }

  /** Pointer up (`commit`) or a lost pointer (cancel): ends the gesture. */
  private endGesture(pointerId: number, commit: boolean): void {
    const gesture = this.gesture;
    if (gesture?.pointerId !== pointerId) return;
    this.gesture = null;
    this.finishDrag();
    const { session } = this.deps;
    switch (gesture.kind) {
      case "press":
        if (commit && gesture.click) setSelection(session, gesture.click);
        break;
      case "pendingMarquee":
        if (commit && !gesture.additive) setSelection(session, EMPTY_SELECTION);
        break;
      case "marquee": {
        const selection = gesture.marquee.current?.selection;
        if (commit && selection) setSelection(session, selection);
        // The content showed the marquee's selection: back to the session's.
        this.deps.scheduler.invalidate("timelineContent");
        break;
      }
      case "move": {
        const request = gesture.move.request();
        if (commit && request) this.deps.onMoveClips(request);
        this.settleScrollY();
        break;
      }
      case "scrub":
        break;
    }
    this.refreshHover();
    this.deps.scheduler.invalidate("timelineOverlay");
  }

  /** After a drag that scrolled into the room of proposed tracks: back inside the tracks that exist now. */
  private settleScrollY(): void {
    const { min, max } = this.geometry().scrollYRange;
    const current = this.deps.session.state.getState().timeline.scrollY;
    const next = Math.min(Math.max(current, min), max);
    if (next !== current) this.writeViewport(this.viewport(), next);
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

  /** The cursor follows the hover hit and the drag; the style is written only when it changes. */
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
      this.followPointer();
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
    this.followPointer();
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
      selection: this.gesture?.kind === "marquee" ? (this.gesture.marquee.current?.selection ?? this.deps.session.selection.getState()) : this.deps.session.selection.getState(),
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
    const theme = this.deps.theme.theme;
    const gesture = this.gesture;
    const proposal = gesture?.kind === "move" ? gesture.move.proposal : null;
    // Hover highlights are for a pointer at rest: none while dragging.
    const idle = gesture === null || gesture.kind === "scrub" || gesture.kind === "press";
    drawOverlay({
      ctx: layer.ctx,
      dpr: this.dpr(),
      geometry,
      theme,
      playhead: this.deps.session.state.getState().playhead,
      scrubbing: gesture?.kind === "scrub",
      hoverClip: idle ? this.hoverClip(project, geometry) : null,
      hoverAddRow: idle && this.hover?.addTrack ? (this.hover.addTrack === "video" ? geometry.addVideo : geometry.addAudio) : null,
      hoverToggle: idle ? this.hoverToggle(geometry) : null,
      move: proposal ? { proposal, newRowHeight: theme.timeline.trackHeight.M } : null,
      marquee: gesture?.kind === "marquee" ? (gesture.marquee.current?.rect ?? null) : null,
      tooltip: proposal && this.pointer ? { text: deltaLabel(proposal.deltaFrames, project), x: this.pointer.x, y: this.pointer.y } : null,
      text: this.text,
    });
    this.stats.overlayDraws += 1;
    this.stats.overlayMs = performance.now() - start;
    this.writeStats();
  }

  private hoverToggle(geometry: TimelineGeometry) {
    const hover = this.hover;
    if (hover?.type !== "headerToggle" || !hover.trackId || !hover.toggle) return null;
    const row = geometry.rowOf(hover.trackId);
    return row ? (geometry.headerToggles(row)?.[hover.toggle] ?? null) : null;
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

/** The drag tooltip text (spec §6.8): `Δ +00:00:12`, frames moved as mm:ss:ff. */
function deltaLabel(frames: number, project: Project): string {
  return `Δ ${frames < 0 ? "-" : "+"}${formatTimecode(Math.abs(frames), project.settings.fps)}`;
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

