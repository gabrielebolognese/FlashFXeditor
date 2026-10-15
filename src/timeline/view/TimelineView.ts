// The timeline view (spec §6.17, P1, P2, P3, P9, P10): a framework-free pair of stacked canvases in
// the timeline panel. The content canvas (ruler, headers, tracks, clips) redraws on document,
// selection, zoom/scroll, size and theme changes; the overlay canvas (playhead, hover, drag ghosts,
// marquee) on every interaction frame. Both draw only from the FrameScheduler. Zoom and scroll live in
// the session store; the view subscribes to them directly and React never renders for them.
// Gestures (scrub, clip drag, trim, roll, slip, slide, rate stretch, marquee) keep their state here,
// never in a store: a clip drag reaches the document once, on drop, through `onMoveClips`, an edit
// through `onTrimEdge`; a marquee writes the selection once, on release. While an edit runs,
// `trimPreview` is the document it proposes and the frame (or the two frames) the preview shows
// (spec §6.10). The active tool decides what a hit does (spec §6.18): Select drags clips and trims
// edges (Mod+Alt on a cut rolls, a click on a cut selects the edit point), Slip and Slide drag clip
// bodies, Rate stretch drags edges.
// Snapping (spec §6.9): clip drags and edits snap while the toggle is on, ruler scrubs only with Shift
// too, and holding S during a drag inverts the toggle until it is released.
import type { Affect } from "../../core/commands/command.js";
import { formatSpeed, formatTimecode, usToFrame } from "../../core/document/time.js";
import { isMediaClip, type ClipId, type Frame, type Project, type TrackId, type TrackKind } from "../../core/document/types.js";
import type { Platform } from "../../core/keyboard/keys.js";
import { watchDevicePixelRatio } from "../../core/scheduler/devicePixelRatio.js";
import type { FrameScheduler, RenderView } from "../../core/scheduler/FrameScheduler.js";
import type { IdleQueue } from "../../core/scheduler/IdleQueue.js";
import type { Store } from "../../core/store/createStore.js";
import type { DocumentStore } from "../../core/store/DocumentStore.js";
import type { LayoutState, Size } from "../../core/store/layoutStore.js";
import { clickSelection, EMPTY_SELECTION, type ClickModifier, type Selection } from "../../core/store/selection.js";
import { selectEditPoint, setPlayhead, setSelection, type EditPoint, type SessionStore, type Tool } from "../../core/store/sessionStore.js";
import type { Theme, ThemeBridge } from "../../core/theme/theme.js";
import type { MoveRequest } from "../edit/move.js";
import { MAX_SPEED, MIN_SPEED, type TrimEdge } from "../edit/trim.js";
import { contentEnd, isClipLocked, linkedPartners, neighbors } from "../model/queries.js";
import { resolveSnap, SnapIndex, snapLabel, type SnapCandidates, type SnapTarget } from "../snap/snapIndex.js";
import { trimCursor, trimCursors, type TrimCursors } from "./cursors.js";
import { drawContent } from "./drawContent.js";
import { drawOverlay, type EditPointMark } from "./drawOverlay.js";
import { TimelineGeometry, type HeaderToggle, type TimelineMetrics } from "./geometry.js";
import { edgeStep } from "./gestures/autoScroll.js";
import { MarqueeGesture } from "./gestures/marquee.js";
import { MoveGesture, NO_MODIFIERS, type DragModifiers, type MoveSnap } from "./gestures/moveClips.js";
import { TrimGesture, type EditTarget, type PreviewSplit, type TrimRequest } from "./gestures/trimClip.js";
import { HitTester, type HitResult } from "./HitTester.js";
import { TextCache } from "./textCache.js";
import {
  clampScroll,
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
  /** An edit drag (trim, roll, slip, slide, rate stretch) was released: the controller applies it as one command (spec §6.10, P2). */
  onTrimEdge(request: TrimRequest): void;
  /** `trimPreview` changed (an edit started, moved or ended): the preview redraws. */
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

/** What a drag of a pressed clip body does with the active tool (null: nothing, a click selects). */
type BodyDrag = "move" | "slip" | "slide" | null;

/** Pointer gestures. `press` and `pendingMarquee` wait for the dead zone (spec §6.8) before dragging. */
type Gesture =
  /** `snap`: what a Shift scrub snapped the playhead to (spec §6.3). */
  | { kind: "scrub"; pointerId: number; snap: SnapTarget | null }
  /** A press on a clip. `click`: the selection a release without a drag sets (deferred on a selected clip, so a drag keeps the selection). */
  | { kind: "press"; pointerId: number; x: number; y: number; clipId: ClipId; frame: number; click: Selection | null; drag: BodyDrag }
  | { kind: "move"; pointerId: number; move: MoveGesture }
  /**
   * A press on a trim zone or a cut: an edit once it moves past the dead zone, else a click: on a cut
   * it selects the edit point (`editPoint`), elsewhere the clip (`click`).
   */
  | { kind: "pressEdge"; pointerId: number; x: number; y: number; target: EditTarget; frame: number; click: Selection; editPoint: EditPoint | null }
  /** Any edit drag: trim, roll, slip, slide, rate stretch. */
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
  a === b ||
  (a !== null && b !== null && a.type === b.type && a.clipId === b.clipId && a.addTrack === b.addTrack && a.trackId === b.trackId && a.toggle === b.toggle && a.junction?.frame === b.junction?.frame);

/** The edge a hit on a trim zone or a cut is on (a cut: the side under the pointer), or null. */
function hitEdge(hit: HitResult): TrimEdge | null {
  if (hit.type === "clipEdgeIn") return "in";
  if (hit.type === "clipEdgeOut") return "out";
  if (hit.type === "junction" && hit.junction) return hit.clipId === hit.junction.left ? "out" : "in";
  return null;
}

/** What the cursor depends on besides the hit and the gesture. */
interface CursorContext {
  tool: Tool;
  /** Ripple mode on, or Mod held: trim edges show the ripple variant (spec §6.4). */
  ripple: boolean;
  /** Mod+Alt held: a cut shows the roll cursor (spec §6.10). */
  roll: boolean;
}

/** The cursor of an edit (a drag, or a press that may become one). */
function editCursor(cursors: TrimCursors, target: EditTarget, ripple: boolean): string {
  switch (target.kind) {
    case "trim":
      return trimCursor(cursors, target.edge, ripple);
    case "roll":
      return cursors.roll;
    case "slip":
      return cursors.slip;
    case "slide":
      return cursors.slide;
    case "stretch":
      return target.edge === "in" ? cursors.stretchIn : cursors.stretchOut;
  }
}

/** The cursor for the hover hit and the gesture (spec §6.18: set from the hover hit, by tool). */
function cursorFor(hit: HitResult | null, gesture: Gesture | null, cursors: TrimCursors, context: CursorContext): string {
  if (gesture?.kind === "scrub") return "ew-resize";
  if (gesture?.kind === "move") {
    const proposal = gesture.move.proposal;
    return proposal?.refused ? "not-allowed" : proposal?.duplicate ? "copy" : "grabbing";
  }
  if (gesture?.kind === "trim") {
    const { trim } = gesture;
    return editCursor(cursors, { kind: trim.kind, clipId: trim.clip.id, edge: trim.edge }, trim.proposal?.ripple ?? context.ripple);
  }
  if (gesture?.kind === "pressEdge") return editCursor(cursors, gesture.target, context.ripple);
  if (gesture?.kind === "press" && (gesture.drag === "slip" || gesture.drag === "slide")) return cursors[gesture.drag];
  if (gesture) return "default";
  if (!hit) return "default";
  if (hit.type === "ruler" || hit.type === "playheadHead") return "ew-resize";
  if ((hit.type === "trackHeader" && hit.addTrack) || hit.type === "headerToggle") return "pointer";
  const edge = hitEdge(hit);
  const { tool } = context;
  // Edges and cuts belong to unlocked clips only; a body may be locked (the caller passes no hit then).
  if ((tool === "slip" || tool === "slide") && (edge || hit.type === "clip")) return cursors[tool];
  if (!edge) return "default";
  if (tool === "rateStretch") return edge === "in" ? cursors.stretchIn : cursors.stretchOut;
  if (tool !== "select") return "default";
  if (hit.type === "junction" && context.roll) return cursors.roll;
  return trimCursor(cursors, edge, context.ripple);
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
      get junctionZone() {
        return deps.theme.theme.timeline.junctionZone;
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
    // Mod pressed or released over a trim edge switches it to the ripple cursor (spec §6.4), Mod+Alt
    // over a cut to the roll cursor (§6.10). The modifier state is only read here: keys still go to
    // the KeyDispatcher.
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
      // The tool changes what lies under the pointer (spec §6.18).
      session.state.select(
        (state) => state.activeTool,
        () => this.updateCursor(),
      ),
      session.selection.subscribe(() => scheduler.invalidate("timelineContent")),
      session.editPoint.subscribe(() => scheduler.invalidate("timelineOverlay")),
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

  /** True while an edit drags (the preview then asks frames with scrub priority, P8, and playback pauses). */
  get trimming(): boolean {
    return this.gesture?.kind === "trim";
  }

  /** The edit in progress (trim, roll, slip, slide, rate stretch), or null. */
  get trim(): TrimGesture | null {
    return this.gesture?.kind === "trim" ? this.gesture.trim : null;
  }

  /**
   * While an edit runs (spec §6.10 live feedback): the document it proposes and the new edge frame,
   * the first included frame of an in trim or the last of an out trim; rolls, slips and slides show
   * two frames side by side (`previewSplit`). Null otherwise.
   */
  get trimPreview(): { project: Project; frame: Frame; previewSplit: PreviewSplit | null } | null {
    const proposal = this.gesture?.kind === "trim" ? this.gesture.trim.proposal : null;
    return proposal ? { project: proposal.project, frame: proposal.previewFrame, previewSplit: proposal.previewSplit } : null;
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

  /** Center playhead (spec §6.6, `Mod+Shift+.`): the view scrolls so the playhead is in its middle (within the scroll range). */
  centerPlayhead(): void {
    if (!this.mounted || this.ephemeral) return;
    const view = this.viewport();
    const context = this.zoomContext();
    const playhead = this.deps.session.state.getState().playhead;
    this.writeViewport({ pxPerFrame: view.pxPerFrame, scrollFrame: clampScroll(playhead - context.width / 2 / view.pxPerFrame, view.pxPerFrame, context) });
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
    const tool = this.deps.session.state.getState().activeTool;
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
        else this.pressClip(event, hit.clipId as ClipId, hit.frame, bodyDrag(tool));
        break;
      case "clipEdgeIn":
      case "clipEdgeOut":
      case "junction":
        this.pressEdgeHit(event, hit, tool);
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
  private pressClip(event: PointerEvent, clipId: ClipId, frame: number, drag: BodyDrag): void {
    const { session } = this.deps;
    const selection = session.selection.getState();
    const modifier: ClickModifier = event.altKey ? "alt" : this.modifiers.mod ? "mod" : event.shiftKey ? "shift" : "none";
    const partners = modifier === "none" || modifier === "shift" ? this.partners(clipId) : [];
    const next = clickSelection(selection, clipId, modifier, partners);
    const selected = selection.kind === "clips" && selection.clipIds.has(clipId);
    if (!selected) setSelection(session, next);
    this.capture(event.pointerId);
    this.gesture = { kind: "press", pointerId: event.pointerId, x: event.offsetX, y: event.offsetY, clipId, frame, click: selected ? next : null, drag };
    this.updateCursor();
  }

  /**
   * A press on a trim zone or a cut (spec §6.10, §6.18), by tool: Select trims the edge (Mod+Alt on a
   * cut rolls it; a click on a cut selects the edit point: a roll's, or with Mod or Ripple mode the
   * ripple side under the pointer), Rate stretch stretches it, Slip and Slide take the clip.
   */
  private pressEdgeHit(event: PointerEvent, hit: HitResult, tool: Tool): void {
    const clipId = hit.clipId as ClipId;
    const edge = hitEdge(hit) as TrimEdge;
    if (tool === "slip" || tool === "slide") {
      this.pressClip(event, clipId, hit.frame, tool);
      return;
    }
    if (tool === "rateStretch") {
      this.pressEdge(event, { kind: "stretch", clipId, edge }, hit.frame, null);
      return;
    }
    // TODO(batch 15): the Razor tool cuts; TODO(batch 18): the Hand tool pans.
    if (tool !== "select") {
      this.pressClip(event, clipId, hit.frame, null);
      return;
    }
    const junction = hit.junction;
    if (!junction) {
      this.pressEdge(event, { kind: "trim", clipId, edge }, hit.frame, null);
      return;
    }
    const roll = this.modifiers.mod && this.modifiers.alt;
    const ripple = !roll && (this.modifiers.mod || this.deps.session.state.getState().ripple);
    const target: EditTarget = roll ? { kind: "roll", clipId: junction.left, edge: "out", rightId: junction.right } : { kind: "trim", clipId, edge };
    const side = ripple ? (edge === "out" ? "left" : "right") : "both";
    this.pressEdge(event, target, hit.frame, { left: junction.left, right: junction.right, side });
  }

  /**
   * A press that may become an edit (spec §6.10): the edit once the pointer moves past the dead zone
   * (the selection stays as it is), else, on release, a click on the clip, or on the edit point.
   */
  private pressEdge(event: PointerEvent, target: EditTarget, frame: number, editPoint: EditPoint | null): void {
    const { session } = this.deps;
    const modifier: ClickModifier = event.altKey ? "alt" : this.modifiers.mod ? "mod" : event.shiftKey ? "shift" : "none";
    const partners = modifier === "none" || modifier === "shift" ? this.partners(target.clipId) : [];
    const click = clickSelection(session.selection.getState(), target.clipId, modifier, partners);
    this.capture(event.pointerId);
    this.gesture = { kind: "pressEdge", pointerId: event.pointerId, x: event.offsetX, y: event.offsetY, target, frame, click, editPoint };
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
        if (gesture.drag && Math.hypot(event.offsetX - gesture.x, event.offsetY - gesture.y) > threshold) {
          if (gesture.drag === "move") this.startMove(gesture);
          else this.startEdit(gesture.pointerId, { kind: gesture.drag, clipId: gesture.clipId, edge: "in" }, gesture.frame);
        }
        break;
      case "pendingMarquee":
        if (Math.hypot(event.offsetX - gesture.x, event.offsetY - gesture.y) > threshold) this.startMarquee(gesture);
        break;
      case "pressEdge":
        if (Math.hypot(event.offsetX - gesture.x, event.offsetY - gesture.y) > threshold) this.startEdit(gesture.pointerId, gesture.target, gesture.frame);
        break;
      case "move":
      case "trim":
      case "marquee":
        this.followPointer();
        break;
    }
  }

  /** A press became an edit drag: the edge (or the clip, or its source) follows the pointer from where it went down. */
  private startEdit(pointerId: number, target: EditTarget, frame: number): void {
    const project = this.deps.document.getState();
    this.gesture = { kind: "trim", pointerId, trim: new TrimGesture(project, target, frame) };
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
        if (commit && !gesture.additive) {
          setSelection(session, EMPTY_SELECTION);
          selectEditPoint(session, null);
        }
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
        if (commit && gesture.editPoint) selectEditPoint(session, gesture.editPoint);
        else if (commit) setSelection(session, gesture.click);
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

  /** The cursor follows the hover hit, the tool and the drag; the style is written only when it changes. */
  private updateCursor(): void {
    const { ripple, activeTool } = this.deps.session.state.getState();
    const { mod, alt } = this.modifiers;
    // A locked clip takes no edits: no edit cursor over it.
    const hover = this.hover?.type === "clip" && isClipLocked(this.deps.document.getState(), this.hover.clipId as ClipId) ? null : this.hover;
    const cursor = cursorFor(hover, this.gesture, this.cursors, { tool: activeTool, ripple: ripple || mod, roll: mod && alt });
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
    // The brackets stand on the document's cut: not while a drag moves clips.
    const editPoints = proposal || gesture?.kind === "trim" ? [] : this.editPointMarks(project);
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
      editPoints,
      marquee: gesture?.kind === "marquee" ? (gesture.marquee.current?.rect ?? null) : null,
      tooltip: this.pointer && (proposal || trim || snap) ? this.tooltip(project, proposal?.deltaFrames ?? null, trim, snap, this.pointer) : null,
      text: this.text,
    });
    this.stats.overlayDraws += 1;
    this.stats.overlayMs = performance.now() - start;
    this.writeStats();
  }

  /**
   * The drag tooltip: a move's delta; a trim's delta and the clip's new duration (spec §6.10:
   * `Δ -00:00:08 · 00:02:15`), a rate stretch's with the new speed, a slip's with the new source in
   * point, a roll's or a slide's delta alone; the snap target's name; and `Media start` / `Media end`
   * while an edited clip sits on its media bound (or the speed limit a stretch reached).
   */
  private tooltip(project: Project, moveDelta: number | null, trim: TrimGesture["proposal"], snap: SnapTarget | null, pointer: { x: number; y: number }) {
    const fps = project.settings.fps;
    const target = snap ? snapLabel(project, snap) : null;
    if (!trim) return { text: moveDelta !== null ? deltaLabel(moveDelta, project) : null, target, alert: null, x: pointer.x, y: pointer.y };
    const { result, clip } = trim;
    const delta = deltaLabel(result.delta, project);
    const duration = formatTimecode(clip.duration, fps);
    let text = delta;
    if (result.plan.kind === "trim") text = `${delta} · ${duration}`;
    else if (result.plan.kind === "stretch") text = `${delta} · ${duration} · ${formatSpeed(isMediaClip(clip) ? clip.speed : 1)}`;
    else if (result.plan.kind === "slip" && isMediaClip(clip)) text = `${delta} · In ${formatTimecode(usToFrame(clip.in, fps), fps)}`;
    const bound = result.mediaBound;
    const reason = result.limit?.reason;
    const alert =
      bound === "start" ? "Media start" : bound === "end" ? "Media end" : reason === "maxSpeed" ? `Max speed ${formatSpeed(MAX_SPEED)}` : reason === "minSpeed" ? `Min speed ${formatSpeed(MIN_SPEED)}` : null;
    return { text, target, alert, x: pointer.x, y: pointer.y };
  }

  /**
   * The selected edit point's brackets (spec §6.7) while its clips still meet on a cut, and with
   * Linked selection on, the cuts of their linked partners at the same frame.
   */
  private editPointMarks(project: Project): EditPointMark[] {
    const point = this.deps.session.editPoint.getState();
    const left = point ? project.clips[point.left] : undefined;
    const right = point ? project.clips[point.right] : undefined;
    if (!point || !left || !right || left.trackId !== right.trackId || left.start + left.duration !== right.start) return [];
    const marks: EditPointMark[] = [{ trackId: left.trackId, frame: right.start, side: point.side }];
    if (!this.deps.session.state.getState().linkedSelection) return marks;
    for (const id of linkedPartners(project, left.id)) {
      const partner = project.clips[id];
      const next = partner && partner.start + partner.duration === right.start ? neighbors(project, id).next : null;
      if (partner && next?.start === right.start && partner.trackId !== left.trackId) marks.push({ trackId: partner.trackId, frame: right.start, side: point.side });
    }
    return marks;
  }

  private hoverToggle(geometry: TimelineGeometry) {
    const hover = this.hover;
    if (hover?.type !== "headerToggle" || !hover.trackId || !hover.toggle) return null;
    const row = geometry.rowOf(hover.trackId);
    return row ? (geometry.headerToggles(row)?.[hover.toggle] ?? null) : null;
  }

  private hoverClip(project: Project, geometry: TimelineGeometry) {
    const type = this.hover?.type;
    // The trim zones and its side of a cut are part of the clip: it stays lit while the cursor shows the bracket.
    const id = type === "clip" || type === "clipEdgeIn" || type === "clipEdgeOut" || type === "junction" ? (this.hover?.clipId ?? null) : null;
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

/** What a drag of a clip body does with each tool (spec §6.18); Razor and Hand bodies do nothing yet. */
function bodyDrag(tool: Tool): BodyDrag {
  // TODO(batch 15): the Razor tool cuts at the click; TODO(batch 18): the Hand tool pans.
  return tool === "select" ? "move" : tool === "slip" || tool === "slide" ? tool : null;
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

