// The timeline view (spec §6.17, P1, P2, P3, P9, P10): a framework-free pair of stacked canvases in
// the timeline panel. The content canvas (ruler, headers, tracks, clips) redraws on document,
// selection, zoom/scroll, size and theme changes; the overlay canvas (playhead, hover, drag ghosts,
// marquee) on every interaction frame. Both draw only from the FrameScheduler. Zoom and scroll live in
// the session store; the view subscribes to them directly and React never renders for them.
// Gestures (scrub, clip drag, trim, marquee) keep their state here, never in a store: a clip drag
// reaches the document once, on drop, through `onMoveClips`, a trim through `onTrimEdge`; a marquee
// writes the selection once, on release. While a trim runs, `trimPreview` is the document it proposes
// and the frame its edge shows (the preview panel draws it, spec §6.10).
// Snapping (spec §6.9): clip drags and trims snap while the toggle is on, ruler scrubs only with Shift
// too, and holding S during a drag inverts the toggle until it is released.
import type { Affect } from "../../core/commands/command.js";
import { formatTimecode } from "../../core/document/time.js";
import type { ClipId, Frame, Project, TrackId, TrackKind } from "../../core/document/types.js";
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
import type { TrimEdge } from "../edit/trim.js";
import { contentEnd, isClipLocked, linkedPartners, neighbors } from "../model/queries.js";
import { resolveSnap, SnapIndex, snapLabel, type SnapCandidates, type SnapTarget } from "../snap/snapIndex.js";
import { trimCursor, trimCursors, type TrimCursors } from "./cursors.js";
import { drawContent } from "./drawContent.js";
import { drawOverlay } from "./drawOverlay.js";
import { TimelineGeometry, type HeaderToggle, type TimelineMetrics } from "./geometry.js";
import { edgeStep } from "./gestures/autoScroll.js";
import { MarqueeGesture } from "./gestures/marquee.js";
import { MoveGesture, NO_MODIFIERS, type DragModifiers, type MoveSnap } from "./gestures/moveClips.js";
import { TrimGesture, type TrimRequest } from "./gestures/trimClip.js";
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
  /** A trim drag was released: the controller applies it as one command (spec §6.10, P2). */
  onTrimEdge(request: TrimRequest): void;
  /** `trimPreview` changed (a trim started, moved its edge or ended): the preview redraws. */
  onTrimPreview?(): void;
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
  /** `snap`: what a Shift scrub snapped the playhead to (spec §6.3). */
  | { kind: "scrub"; pointerId: number; snap: SnapTarget | null }
  /** A press on a clip. `click`: the selection a release without a drag sets (deferred on a selected clip, so a drag keeps the selection). */
  | { kind: "press"; pointerId: number; x: number; y: number; clipId: ClipId; frame: number; click: Selection | null; movable: boolean }
  | { kind: "move"; pointerId: number; move: MoveGesture }
  /** A press on a trim zone: a trim once it moves past the dead zone, else a click on the clip. */
  | { kind: "pressEdge"; pointerId: number; x: number; y: number; clipId: ClipId; edge: TrimEdge; frame: number; click: Selection }
  | { kind: "trim"; pointerId: number; trim: TrimGesture }
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

/** The cursor for the hover hit and the gesture; `ripple`: a trim edge shows the ripple variant (spec §6.4). */
function cursorFor(hit: HitResult | null, gesture: Gesture | null, cursors: TrimCursors, ripple: boolean): string {
  if (gesture?.kind === "scrub") return "ew-resize";
  if (gesture?.kind === "move") {
    const proposal = gesture.move.proposal;
    return proposal?.refused ? "not-allowed" : proposal?.duplicate ? "copy" : "grabbing";
  }
  if (gesture?.kind === "trim") return trimCursor(cursors, gesture.trim.edge, gesture.trim.proposal?.ripple ?? ripple);
  if (gesture?.kind === "pressEdge") return trimCursor(cursors, gesture.edge, ripple);
  if (gesture) return "default";
  if (!hit) return "default";
  if (hit.type === "ruler" || hit.type === "playheadHead") return "ew-resize";
  if (hit.type === "clipEdgeIn" || hit.type === "clipEdgeOut") return trimCursor(cursors, hit.type === "clipEdgeIn" ? "in" : "out", ripple);
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
  private cursors: TrimCursors;
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
  /** S held during the current drag: snapping inverted (spec §6.9). */
  private snapHeld = false;
  private readonly snapIndex = new SnapIndex();
  /** While a gesture drags: stops its auto-scroll ticker and key listeners. */
  private stopDrag: (() => void) | null = null;
  private lastTick: number | null = null;
  private statsElement: HTMLElement | null = null;
  private readonly stops: (() => void)[] = [];

  private readonly contentView: RenderView = { render: () => this.renderContent() };
  private readonly overlayView: RenderView = { render: () => this.renderOverlay() };

  constructor(private readonly deps: TimelineViewDeps) {
    this.metrics = metricsOf(deps.theme.theme);
    this.cursors = trimCursors(deps.theme.theme);
    this.hitTester = new HitTester({
      geometry: () => this.geometry(),
      project: () => this.deps.document.getState(),
      playhead: () => this.deps.session.state.getState().playhead,
      get playheadHeadWidth() {
        return deps.theme.theme.timeline.playheadHeadWidth;
      },
      get trimZone() {
        return deps.theme.theme.timeline.trimZone;
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
    // Mod pressed or released over a trim edge switches it to the ripple cursor (spec §6.4). The
    // modifier state is only read here: keys still go to the KeyDispatcher.
    const win = host.ownerDocument.defaultView;
    const onHoverKey = (event: KeyboardEvent) => {
      if (this.gesture || !this.pointer) return;
      this.modifiers = this.modifiersOf(event);
      this.updateCursor();
    };
    win?.addEventListener("keydown", onHoverKey);
    win?.addEventListener("keyup", onHoverKey);
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
      session.state.select(
        (state) => state.playhead,
        () => {
          scheduler.invalidate("timelineOverlay");
          // The playhead is a snap candidate: a drag while playing follows it.
          if (this.gesture?.kind === "move" || this.gesture?.kind === "trim") this.followPointer();
        },
      ),
      // Ripple mode switches the trim cursors (and a trim in progress, spec §6.10).
      session.state.select(
        (state) => state.ripple,
        () => {
          if (this.gesture?.kind === "trim") this.followPointer();
          else this.updateCursor();
        },
      ),
      session.selection.subscribe(() => scheduler.invalidate("timelineContent")),
      // The FrameScheduler flags of document changes (spec §3.4): every command carries `affects`.
      document.subscribe(both, { affects: CONTENT_AFFECTS }),
      // A drag or marquee holds clips of the document it started from: an edit under it (an undo
      // key) cancels it.
      document.subscribe(() => this.cancelGesture(), { affects: ["clips", "tracks"] }),
      theme.subscribe((next) => {
        this.metrics = metricsOf(next);
        this.cursors = trimCursors(next);
        this.text.clear();
        this.updateCursor();
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
        win?.removeEventListener("keydown", onHoverKey);
        win?.removeEventListener("keyup", onHoverKey);
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

  /** True while a clip edge is trimmed (the preview then asks frames with scrub priority, P8, and playback pauses). */
  get trimming(): boolean {
    return this.gesture?.kind === "trim";
  }

  /** The trim in progress, or null. */
  get trim(): TrimGesture | null {
    return this.gesture?.kind === "trim" ? this.gesture.trim : null;
  }

  /**
   * While a trim runs (spec §6.10 live feedback): the document it proposes and the new edge frame,
   * the first included frame of an in trim or the last of an out trim. Null otherwise.
   */
  get trimPreview(): { project: Project; frame: Frame } | null {
    const proposal = this.gesture?.kind === "trim" ? this.gesture.trim.proposal : null;
    return proposal ? { project: proposal.project, frame: proposal.previewFrame } : null;
  }

  /**
   * Esc (spec §6.8): cancels a clip drag, a trim or a marquee with no document or selection change.
   * Returns false when there was nothing to cancel (a ruler scrub is not cancelled).
   */
  cancelGesture(): boolean {
    const gesture = this.gesture;
    if (!gesture || gesture.kind === "scrub") return false;
    this.gesture = null;
    this.finishDrag();
    if (gesture.kind === "marquee") this.deps.scheduler.invalidate("timelineContent");
    if (gesture.kind === "move") this.settleScrollY();
    if (gesture.kind === "trim") this.deps.onTrimPreview?.();
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
        this.capture(event.pointerId);
        this.gesture = { kind: "scrub", pointerId: event.pointerId, snap: null };
        this.startDrag();
        this.scrubAt(event.offsetX);
        this.deps.scheduler.invalidate("timelineOverlay");
        break;
      }
      case "clip":
        // Clips on locked tracks take no selection (spec §6.12): the press acts as on empty space.
        if (isClipLocked(this.deps.document.getState(), hit.clipId as ClipId)) this.pressEmpty(event);
        else this.pressClip(event, hit.clipId as ClipId, hit.frame);
        break;
      case "clipEdgeIn":
      case "clipEdgeOut":
        // Trim zones trim with the Select tool. TODO(batch 14): rate stretch on edges.
        if (this.deps.session.state.getState().activeTool === "select") this.pressEdge(event, hit.clipId as ClipId, hit.type === "clipEdgeIn" ? "in" : "out", hit.frame);
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

  /**
   * A press on a trim zone (spec §6.10): a trim once the pointer moves past the dead zone (the
   * selection stays as it is), else, on release, a click on the clip.
   */
  private pressEdge(event: PointerEvent, clipId: ClipId, edge: TrimEdge, frame: number): void {
    const { session } = this.deps;
    const modifier: ClickModifier = event.altKey ? "alt" : this.modifiers.mod ? "mod" : event.shiftKey ? "shift" : "none";
    const partners = modifier === "none" || modifier === "shift" ? this.partners(clipId) : [];
    const click = clickSelection(session.selection.getState(), clipId, modifier, partners);
    this.capture(event.pointerId);
    this.gesture = { kind: "pressEdge", pointerId: event.pointerId, x: event.offsetX, y: event.offsetY, clipId, edge, frame, click };
    this.updateCursor();
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
        this.scrubAt(event.offsetX);
        break;
      case "press":
        if (gesture.movable && Math.hypot(event.offsetX - gesture.x, event.offsetY - gesture.y) > threshold) this.startMove(gesture);
        break;
      case "pendingMarquee":
        if (Math.hypot(event.offsetX - gesture.x, event.offsetY - gesture.y) > threshold) this.startMarquee(gesture);
        break;
      case "pressEdge":
        if (Math.hypot(event.offsetX - gesture.x, event.offsetY - gesture.y) > threshold) this.startTrim(gesture);
        break;
      case "move":
      case "trim":
      case "marquee":
        this.followPointer();
        break;
    }
  }

  /** The press on a trim zone became a drag: the edge follows the pointer from where it went down. */
  private startTrim(press: Extract<Gesture, { kind: "pressEdge" }>): void {
    const project = this.deps.document.getState();
    this.gesture = { kind: "trim", pointerId: press.pointerId, trim: new TrimGesture(project, press.clipId, press.edge, press.frame) };
    this.startDrag();
    this.followPointer();
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
   * keys, wheel and auto-scroll): a scrub moves the playhead, a clip drag recomputes its proposal, a
   * marquee its rectangle and selection (the content canvas redraws only when the selection changes).
   */
  private followPointer(): void {
    const gesture = this.gesture;
    const pointer = this.pointer;
    if (!gesture || !pointer) return;
    const geometry = this.geometry();
    if (gesture.kind === "scrub") {
      this.scrubAt(pointer.x);
    } else if (gesture.kind === "move") {
      const { move } = gesture;
      const lane = move.anchorLane ? geometry.laneAt(move.anchorLane.kind, pointer.y) : null;
      move.update(geometry.xToFrame(pointer.x), lane, this.modifiers, this.moveSnap());
      this.updateCursor();
      this.deps.scheduler.invalidate("timelineOverlay");
    } else if (gesture.kind === "trim") {
      const { trim } = gesture;
      const before = trim.proposal;
      const { ripple, linkedSelection } = this.deps.session.state.getState();
      trim.update(geometry.xToFrame(pointer.x), this.modifiers, { ripple, linkedSelection }, this.moveSnap());
      if (trim.proposal !== before) this.deps.onTrimPreview?.();
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
    // Capture phase, ahead of the KeyDispatcher: during a drag S is a modifier (hold to invert
    // snapping, spec §6.9) whatever else is held, so it never reaches the shortcuts (Shift+S, Mod+S).
    const onKey = (event: KeyboardEvent) => {
      // A lone Alt press-and-release would move the focus to the browser menu (Windows).
      if (event.key === "Alt") event.preventDefault();
      if (isSnapKey(event)) {
        if (event.type === "keydown") {
          event.preventDefault();
          event.stopPropagation();
          // A repeat comes from a press before the drag (that one toggled the setting): no hold.
          if (!event.repeat) this.snapHeld = true;
        } else {
          // The key-up goes on: the dispatcher releases an S pressed before the drag.
          this.snapHeld = false;
        }
      }
      this.modifiers = this.modifiersOf(event);
      const kind = this.gesture?.kind;
      if (kind === "move" || kind === "trim" || kind === "scrub") this.followPointer();
    };
    win?.addEventListener("keydown", onKey, true);
    win?.addEventListener("keyup", onKey, true);
    this.stopDrag = () => {
      stopTicker();
      win?.removeEventListener("keydown", onKey, true);
      win?.removeEventListener("keyup", onKey, true);
      this.snapHeld = false;
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
    if (!gesture || !pointer || (gesture.kind !== "scrub" && gesture.kind !== "move" && gesture.kind !== "trim" && gesture.kind !== "marquee")) return;
    const geometry = this.geometry();
    const { area } = geometry;
    const zone = this.deps.theme.theme.timeline.autoScrollZone;
    const scale = elapsed / FRAME_MS;
    const dx = edgeStep(pointer.x, area.x, area.x + area.width, zone) * scale;
    // Scrubs and trims are horizontal.
    const dy = gesture.kind === "scrub" || gesture.kind === "trim" ? 0 : edgeStep(pointer.y, area.y, area.y + area.height, zone) * scale;
    if (dx === 0 && dy === 0) return;
    if (dx !== 0) {
      const context = this.zoomContext();
      // A drag may take clips past the content end: the view can follow them there.
      const trimmed = gesture.kind === "trim" ? gesture.trim.proposal : null;
      const end =
        gesture.kind === "move"
          ? Math.max(context.contentEnd, gesture.move.proposal?.end ?? 0)
          : trimmed
            ? Math.max(context.contentEnd, contentEnd(trimmed.project))
            : context.contentEnd;
      this.following = false;
      this.writeViewport(scrollBy(this.viewport(), dx, { ...context, contentEnd: end }));
    }
    if (dy !== 0) this.scrollVertically(dy);
    this.followPointer();
  }

  // --- Snapping (spec §6.9) -------------------------------------------------------------------

  /** The snap toggle, inverted while S is held during a drag. */
  get snapping(): boolean {
    return this.deps.session.state.getState().snap !== this.snapHeld;
  }

  /** The candidates of the current document and in/out range (rebuilt on the first query after a change). */
  snapCandidates(): SnapCandidates {
    const { inPoint, outPoint } = this.deps.session.state.getState();
    return this.snapIndex.get(this.deps.document.getState(), inPoint, outPoint);
  }

  private moveSnap(): MoveSnap | null {
    if (!this.snapping) return null;
    return {
      candidates: this.snapCandidates(),
      playhead: this.deps.session.state.getState().playhead,
      thresholdPx: this.deps.theme.theme.timeline.snapThreshold,
      pxPerFrame: this.viewport().pxPerFrame,
    };
  }

  /**
   * The ruler scrub (spec §6.3): the playhead under the pointer, snapped to the candidates (every one
   * but the playhead itself) only while Shift is held and snapping is on.
   */
  private scrubAt(x: number): void {
    const gesture = this.gesture;
    if (gesture?.kind !== "scrub") return;
    const frame = this.geometry().xToFrame(x);
    const hit =
      this.modifiers.shift && this.snapping
        ? resolveSnap(this.snapCandidates(), [frame], { thresholdPx: this.deps.theme.theme.timeline.snapThreshold, pxPerFrame: this.viewport().pxPerFrame })
        : null;
    const snap = hit?.target ?? null;
    if (snap?.frame !== gesture.snap?.frame || snap?.kind !== gesture.snap?.kind || snap?.ref !== gesture.snap?.ref) {
      gesture.snap = snap;
      this.deps.scheduler.invalidate("timelineOverlay");
    }
    setPlayhead(this.deps.session, snap ? snap.frame : Math.round(frame));
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
      case "pressEdge":
        if (commit) setSelection(session, gesture.click);
        break;
      case "trim": {
        const request = gesture.trim.request();
        if (commit && request) this.deps.onTrimEdge(request);
        // The preview goes back to the playhead (with the trimmed document after a commit).
        this.deps.onTrimPreview?.();
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
    const ripple = this.deps.session.state.getState().ripple || this.modifiers.mod;
    const cursor = cursorFor(this.hover, this.gesture, this.cursors, ripple);
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
    const trim = gesture?.kind === "trim" ? gesture.trim.proposal : null;
    const snap = proposal ? proposal.snap : trim ? trim.snap : gesture?.kind === "scrub" ? gesture.snap : null;
    // Hover highlights are for a pointer at rest: none while dragging.
    const idle = gesture === null || gesture.kind === "scrub" || gesture.kind === "press" || gesture.kind === "pressEdge";
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
      snapFrame: snap?.frame ?? null,
      move: proposal ? { proposal, newRowHeight: theme.timeline.trackHeight.M } : null,
      trim: trim ? { proposal: trim, selection: this.deps.session.selection.getState() } : null,
      marquee: gesture?.kind === "marquee" ? (gesture.marquee.current?.rect ?? null) : null,
      tooltip: this.pointer && (proposal || trim || snap) ? this.tooltip(project, proposal?.deltaFrames ?? null, trim, snap, this.pointer) : null,
      text: this.text,
    });
    this.stats.overlayDraws += 1;
    this.stats.overlayMs = performance.now() - start;
    this.writeStats();
  }

  /**
   * The drag tooltip: a move's delta, or a trim's delta and the clip's new duration (spec §6.10:
   * `Δ -00:00:08 · 00:02:15`), the snap target's name, and `Media start` / `Media end` while a trimmed
   * edge sits on its media bound.
   */
  private tooltip(project: Project, moveDelta: number | null, trim: TrimGesture["proposal"], snap: SnapTarget | null, pointer: { x: number; y: number }) {
    const fps = project.settings.fps;
    const text = trim ? `${deltaLabel(trim.result.delta, project)} · ${formatTimecode(trim.clip.duration, fps)}` : moveDelta !== null ? deltaLabel(moveDelta, project) : null;
    const bound = trim?.result.mediaBound;
    return { text, target: snap ? snapLabel(project, snap) : null, alert: bound === "start" ? "Media start" : bound === "end" ? "Media end" : null, x: pointer.x, y: pointer.y };
  }

  private hoverToggle(geometry: TimelineGeometry) {
    const hover = this.hover;
    if (hover?.type !== "headerToggle" || !hover.trackId || !hover.toggle) return null;
    const row = geometry.rowOf(hover.trackId);
    return row ? (geometry.headerToggles(row)?.[hover.toggle] ?? null) : null;
  }

  private hoverClip(project: Project, geometry: TimelineGeometry) {
    const type = this.hover?.type;
    // The trim zones are part of the clip: it stays lit while the cursor shows the bracket.
    const id = type === "clip" || type === "clipEdgeIn" || type === "clipEdgeOut" ? (this.hover?.clipId ?? null) : null;
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

/**
 * The S key as the KeyDispatcher reads it: by the letter typed, or by the key position when no plain
 * letter comes (Option+S on macOS types "ß").
 */
function isSnapKey(event: KeyboardEvent): boolean {
  const key = event.key.toLowerCase();
  return /^[a-z]$/.test(key) ? key === "s" : event.code === "KeyS";
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

