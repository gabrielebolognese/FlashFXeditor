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
// bodies, Rate stretch drags edges, Razor cuts at the click (spec §6.11: hovering shows the cut line).
// A click on a gap selects it (spec §6.7); a right-click on a clip, a gap or a track header asks for
// its context menu (spec §6.16). Track headers (spec §6.1, §6.12): a click selects the track (Shift or
// Mod adds or removes it, Mod+Shift selects its clips), a toggle click flips its flag, a vertical drag
// reorders the track among those of its kind (one command on release), a double-click renames it.
// Snapping (spec §6.9): clip drags and edits snap while the toggle is on, ruler scrubs only with Shift
// too, and holding S during a drag inverts the toggle until it is released.
// Clip visuals (spec §6.17): each content pass draws the thumbnails and peaks loaded so far and hands
// what it wanted to `visuals`, which loads it through the IdleQueue; arrivals redraw the content at
// most ARRIVAL_INTERVAL_MS apart, and not while playing or dragging (P3: they wait for the resume).
// Navigation (spec §6.1, §6.2, §6.6): the scrollbars (a thumb drag scrolls, a zoom handle drag zooms
// with the opposite edge fixed), panning in both axes (Hand tool, Space+drag on empty space, middle
// drag), and keyboard zoom steps eased over `--duration-micro` (wheel zoom stays immediate).
// Markers and the in/out range (spec §6.3, §6.13): a click on a marker selects it, a drag moves it
// (snapping, one command on release through `onMoveMarker`), a double-click asks for its inline editor
// (`onEditMarker`), hovering shows its label and timecode; the in and out handles drag with snapping and
// write the session once on release; a right-click on the ruler asks for the ruler/marker menu.
// Media drops (spec §6.14): a drag from the Media panel is fed in from outside (`dragMedia`,
// `leaveMediaDrag`, `endMediaDrag`: the pointer is captured by the panel it started in) and shows its
// ghosts like a clip drag; files dragged from the OS (native drag and drop on the overlay) show where
// they will start and reach the controller through `onDropFiles`.
// Keyframe lanes (spec §6.4, §6.15, Batch 35; keyframeLane.ts): with Show clip keyframes on, a press on
// a diamond selects it (Shift adds or removes it; the clip joins the selection) and a click without a
// drag moves the playhead to it, so the properties panel shows its values; a drag retimes the selected
// keys of the lane (kept inside the clip; snapping to the lane's other keys, the playhead and the clip's
// edges, Shift to whole seconds), one command on release through `onMoveKeyframes`; Alt+click on a lane
// adds a key there (`onAddKeyframe`); a right-click opens the keyframe menu. A clip drag snaps the keys
// on its lane too.
// Fades and transitions (spec §6.4, §6.15, Batch 36; fadesAndTransitions.ts): the hovered clip shows
// its fade handles; a handle drag sets that fade in whole frames (snapping), one command on release
// through `onSetFade`. A click on a transition block selects it, a double-click opens its Transition
// section (`onOpenTransition`); a drag of a block end changes its frames (both sides, Alt: the dragged
// one; snapping), one command on release through `onTransitionEdge`. A transition chip dragged from the
// properties panel is fed in from outside (`dragTransition`, `endTransitionDrag`): the cut under the
// pointer is lit.
// Rubber bands (spec §6.4, Batch 37; rubberBand.ts): on M/L audio tracks a press on the gain line drags
// the clip gain (a clip without volume keys) or the keys around the pointer (in value), a press on a
// key selects it (Shift adds or removes it) and drags it in time and value (Shift: value only), a click
// on a key moves the playhead to it; Mod+click on the line adds a key there (`onAddKeyframe`). The
// line follows the pointer on the overlay with the gain in a tooltip, one command on release through
// `onBandEdit`. A ruler scrub reports each frame it shows (`onScrub`: audio scrub grains).
import type { Affect } from "../../core/commands/command.js";
import type { KeyframeSection } from "../../core/document/keyframes.js";
import { firstFrameOfSecond, formatSpeed, formatTimecode, secondOfFrame, usToFrame } from "../../core/document/time.js";
import { isMediaClip, type Clip, type ClipId, type Frame, type Project, type TrackId, type TrackKind } from "../../core/document/types.js";
import { isEditableTarget } from "../../core/keyboard/KeyDispatcher.js";
import { isSnapKey, type Platform } from "../../core/keyboard/keys.js";
import { watchDevicePixelRatio } from "../../core/scheduler/devicePixelRatio.js";
import type { FrameScheduler, RenderView } from "../../core/scheduler/FrameScheduler.js";
import type { IdleQueue } from "../../core/scheduler/IdleQueue.js";
import type { Store } from "../../core/store/createStore.js";
import type { DocumentStore } from "../../core/store/DocumentStore.js";
import type { LayoutState, Size } from "../../core/store/layoutStore.js";
import { clickSelection, EMPTY_SELECTION, selectClips, selectedTrackIds, selectTracks, trackClickSelection, type ClickModifier, type Selection } from "../../core/store/selection.js";
import { selectEditPoint, selectGap, selectKeyframes, selectMarker, selectTransition, setInOut, setPlayhead, setSelection, type EditPoint, type KeyframeSelection, type SessionState, type SessionStore, type Tool } from "../../core/store/sessionStore.js";
import { ease } from "../../core/theme/easing.js";
import type { Theme, ThemeBridge } from "../../core/theme/theme.js";
import type { DropItem, DropLanes, MediaDropRequest } from "../edit/dropMedia.js";
import type { MoveRequest } from "../edit/move.js";
import { clampKeyDelta } from "../edit/keyframes.js";
import { clampFade, fadesOf, type FadeEdge } from "../edit/fades.js";
import { bandEditedClip, clampKeyShift, segmentKeys, volumeKeys, type BandEdit } from "../edit/volume.js";
import { gainDbAt } from "../../core/document/keyframes.js";
import { cutNear, dragTransitionEdge, transitionAt, type Cut, type TransitionDrag, type TransitionEdge } from "../edit/transitions.js";
import { clipsToSplit } from "../edit/split.js";
import { hasSource, MAX_SPEED, MIN_SPEED, type TrimEdge } from "../edit/trim.js";
import { dragIn, dragOut, lastFrameOf, type InOut } from "../model/inOut.js";
import { contentEnd, gapAt, isClipLocked, laneOf, linkedPartners, neighbors, selectionPartners, type Gap } from "../model/queries.js";
import { resolveSnap, snapCandidatesOf, SnapIndex, snapLabel, type SnapCandidates, type SnapKind, type SnapTarget } from "../snap/snapIndex.js";
import { createWants, type ClipVisualsSource } from "./clipVisuals.js";
import { trimCursor, trimCursors, type TrimCursors } from "./cursors.js";
import { drawContent, type TimelineFonts } from "./drawContent.js";
import { drawOverlay, type BandScene, type BlockScene, type EditPointMark, type MarkerScene, type RangeScene, type RazorScene, type TrackDragScene } from "./drawOverlay.js";
import { blockBand } from "./fadesAndTransitions.js";
import { contains, TimelineGeometry, type HeaderToggle, type Rect, type TimelineMetrics } from "./geometry.js";
import { edgeStep } from "./gestures/autoScroll.js";
import { MediaDropGesture } from "./gestures/dropMedia.js";
import { MarqueeGesture } from "./gestures/marquee.js";
import { MoveGesture, NO_MODIFIERS, type DragModifiers, type MoveSnap } from "./gestures/moveClips.js";
import { TrimGesture, type EditTarget, type PreviewSplit, type TrimRequest } from "./gestures/trimClip.js";
import { HitTester, type HitResult } from "./HitTester.js";
import { diamondInset, laneBand, laneFrames, shownLane, type LaneScene } from "./keyframeLane.js";
import { bandAt, bandBox, gainY, yGain } from "./rubberBand.js";
import { handleEdge, layoutScrollbars, scrollForThumb, scrollYForThumb, zoomHandleView, type ScrollbarAxis, type ScrollbarHit, type ScrollbarLayout } from "./scrollbars.js";
import { TextCache } from "./textCache.js";
import {
  clampScroll,
  fitView,
  interpolateZoom,
  keyZoomAnchor,
  pageToFrame,
  scrollBy,
  wheelDeltaPx,
  wheelZoomFactor,
  zoomAt,
  zoomLimits,
  zoomToSpan,
  type TimelineViewport,
  type ZoomContext,
} from "./zoom.js";

/** Document changes that move or restyle what the content canvas shows. */
const CONTENT_AFFECTS: readonly Affect[] = ["timeline", "clips", "tracks", "markers", "captions", "settings"];
/** Thumbnail and peaks arrivals redraw the content at most this often (spec §6.17: 10 redraws/s). */
export const ARRIVAL_INTERVAL_MS = 100;

export interface TimelineViewDeps {
  scheduler: Pick<FrameScheduler, "register" | "invalidate" | "addTicker">;
  document: Pick<DocumentStore, "getState" | "subscribe">;
  session: SessionStore;
  layout: Store<LayoutState>;
  theme: Pick<ThemeBridge, "theme" | "subscribe">;
  /** A "+ track" row was clicked. */
  onAddTrack(kind: TrackKind): void;
  /** A track header toggle (target, lock, mute, solo, hide, height) was clicked. */
  onToggleTrack(trackId: TrackId, toggle: HeaderToggle): void;
  /** A track header was dragged to `lane` among the tracks of its kind (spec §6.12): one command. */
  onReorderTrack?(trackId: TrackId, lane: number): void;
  /** A track header was double-clicked (spec §6.1): the controller opens the inline rename. */
  onRenameTrack?(trackId: TrackId): void;
  /** A clip drag was dropped: the controller applies it as one command (spec §6.8, P2). */
  onMoveClips(request: MoveRequest): void;
  /** An edit drag (trim, roll, slip, slide, rate stretch) was released: the controller applies it as one command (spec §6.10, P2). */
  onTrimEdge(request: TrimRequest): void;
  /** `trimPreview` changed (an edit started, moved or ended): the preview redraws. */
  onTrimPreview?(): void;
  /** A Razor click (spec §6.11): the controller splits as one command. */
  onRazor?(request: RazorRequest): void;
  /** A right-click on a clip, a gap, a track header or the ruler (spec §6.16), already selected: the controller opens its menu. */
  onContextMenu?(request: ContextMenuRequest): void;
  /** A marker was dragged to `frame` (spec §6.3): the controller moves it (one command). */
  onMoveMarker?(markerId: string, frame: Frame): void;
  /** A marker was double-clicked (spec §6.13): the controller opens its inline editor. */
  onEditMarker?(markerId: string): void;
  /** Keys dragged on a keyframe lane were released (spec §6.15): the controller retimes them by `delta` frames (one command). */
  onMoveKeyframes?(clipId: ClipId, section: KeyframeSection, frames: readonly Frame[], delta: number): void;
  /** Alt+click on a keyframe lane (spec §6.4): the controller adds a key at `frame` (relative to the clip; one command). */
  onAddKeyframe?(clipId: ClipId, section: KeyframeSection, frame: Frame): void;
  /** A fade handle was dragged (spec §6.4, Batch 36): the controller sets the clip's `edge` fade to `frames` (one command). */
  onSetFade?(clipId: ClipId, edge: FadeEdge, frames: Frame): void;
  /** A transition block's end was dragged (spec §6.15, Batch 36): the controller sets its sides (one command). */
  onTransitionEdge?(cut: Cut, before: Frame, after: Frame): void;
  /** A transition block was double-clicked (spec §6.4): the controller opens its Transition section. */
  onOpenTransition?(cut: Cut): void;
  /** A rubber band drag was released (spec §6.4, Batch 37): the controller applies it (one command). */
  onBandEdit?(clipId: ClipId, edit: BandEdit): void;
  /** A ruler scrub showed `frame` (Batch 37: the audio scrub plays a grain there). */
  onScrub?(frame: Frame): void;
  /** Background work pauses while a gesture runs (spec §3.4); arrivals wait while it is paused. */
  idle?: Pick<IdleQueue, "pause" | "resume"> & Partial<Pick<IdleQueue, "isPaused" | "onPauseChange">>;
  /** Thumbnails, posters and peaks of the clip bodies (spec §6.4, §6.17). */
  visuals?: ClipVisualsSource;
  /** Missing font families (text clip badges, spec §10.1); the owner invalidates the content when they change. */
  fonts?: TimelineFonts;
  /** Which key is Mod (Ctrl, or Cmd on macOS). */
  platform?: Platform;
  /**
   * Space pressed and released with no drag while it was armed for Space+drag panning (spec §6.6): the
   * play/pause the key would have been.
   */
  onSpaceTap?(): void;
  /**
   * Files from the OS were dropped on the timeline (spec §6.14): the controller imports them, then
   * places them as `request` says (its items are empty). `transfer` must be read before this returns.
   */
  onDropFiles?(transfer: DataTransfer, request: MediaDropRequest): void;
}

/** A Razor click (spec §6.11): cut `clipId` (and its linked partners) at `frame`, or with `all` every unlocked track. */
export interface RazorRequest {
  /** The snapped frame under the pointer. */
  frame: Frame;
  clipId: ClipId | null;
  all: boolean;
}

/** A context menu to open (spec §6.16) at a client (page) point. */
export type ContextMenuRequest =
  | { kind: "clip"; clipId: ClipId; x: number; y: number }
  | { kind: "gap"; gap: Gap; x: number; y: number }
  | { kind: "track"; trackId: TrackId; x: number; y: number }
  /** The ruler (spec §6.16 Ruler/marker): the frame under the pointer, and the marker there (selected) or null. */
  | { kind: "ruler"; frame: Frame; markerId: string | null; x: number; y: number }
  /** A keyframe diamond (spec §6.15 keyframe menu), selected: its clip, lane section and frame (relative to the clip). */
  | { kind: "keyframe"; clipId: ClipId; section: KeyframeSection; frame: Frame; x: number; y: number };

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
  | { kind: "scrub"; pointerId: number; snap: SnapTarget | null; heard: boolean }
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
  /** A press on empty track space or a gap: a marquee once it moves, else a click (on a gap: selects it). */
  | { kind: "pendingMarquee"; pointerId: number; x: number; y: number; additive: boolean; gap: Gap | null }
  | { kind: "marquee"; pointerId: number; marquee: MarqueeGesture }
  /** A press on a track header: a reorder drag once it moves past the dead zone, else a click setting `click`. */
  | { kind: "pressHeader"; pointerId: number; x: number; y: number; trackId: TrackId; click: Selection }
  /** A track header dragged to reorder (spec §6.12): `grab` is the pointer's offset in the row, `lane` where it would land. */
  | { kind: "trackDrag"; pointerId: number; trackId: TrackId; grab: number; lane: number }
  /** Panning (spec §6.6): the view follows the pointer in both axes from where it went down (`view`, `scrollY`). */
  | { kind: "pan"; pointerId: number; x: number; y: number; view: TimelineViewport; scrollY: number }
  /**
   * A scrollbar dragged (spec §6.1): the thumb scrolls, a zoom handle (`start`, `end`) zooms from `view`
   * (the view at the press). `grab`: the pointer's offset from the dragged end (from the thumb's start for a thumb).
   */
  | { kind: "scrollbar"; pointerId: number; axis: ScrollbarAxis; part: "thumb" | "start" | "end"; grab: number; view: TimelineViewport }
  /** A press on a marker: a drag once it moves past the dead zone (`grab`: the pointer's frame offset from the marker), else a click selecting it. */
  | { kind: "pressMarker"; pointerId: number; x: number; y: number; markerId: string; grab: number }
  /** A marker dragged (spec §6.3): `frame` where it would land, snapped (spec §6.9). */
  | { kind: "markerDrag"; pointerId: number; markerId: string; from: Frame; frame: Frame; grab: number; snap: SnapTarget | null }
  /** An in or out handle dragged (spec §6.3): the range it would leave, snapped. */
  | { kind: "rangeDrag"; pointerId: number; point: "in" | "out"; from: InOut; range: InOut; snap: SnapTarget | null }
  /** Media dragged in from the Media panel or files from the OS (spec §6.14); no pointer of its own (-1). */
  | { kind: "mediaDrop"; pointerId: number; drop: MediaDropGesture }
  /** A press on a keyframe diamond (spec §6.15): a retime drag of `frames` once it moves past the dead zone, else a click (the playhead goes to `grab`). */
  | { kind: "pressKey"; pointerId: number; x: number; y: number; clipId: ClipId; section: KeyframeSection; frames: readonly Frame[]; grab: Frame }
  /** Keys dragged on their lane: `delta` frames (kept inside the clip), snapped. */
  | { kind: "keyDrag"; pointerId: number; clipId: ClipId; section: KeyframeSection; frames: readonly Frame[]; grab: Frame; delta: number; snap: SnapTarget | null }
  /** A fade handle dragged (Batch 36): the `edge` fade of the clip as it would be, from `from`, snapped. */
  | { kind: "fadeDrag"; pointerId: number; clipId: ClipId; edge: FadeEdge; from: Frame; frames: Frame; snap: SnapTarget | null }
  /** A press on a transition block (Batch 36): a drag of its `edge` once it moves past the dead zone, else a click selecting it. */
  | { kind: "pressTransition"; pointerId: number; x: number; y: number; cut: Cut; edge: TransitionEdge | null; grab: number }
  /** A transition block's end dragged (Batch 36): the sides it would have (`drag`), snapped. */
  | { kind: "transitionDrag"; pointerId: number; cut: Cut; edge: TransitionEdge; grab: number; drag: TransitionDrag | null; snap: SnapTarget | null }
  /**
   * A press on an audio clip's rubber band (Batch 37): a band drag once it moves past the dead zone, else
   * a click (`click`: the clip selection a click on the line sets; on a key, the playhead goes to it).
   */
  | { kind: "pressBand"; pointerId: number; x: number; y: number; clipId: ClipId; key: Frame | null; click: Selection | null }
  /**
   * The rubber band dragged (Batch 37): the clip gain (`gain`), or volume keys (`keys`: their values by
   * `deltaDb`, a lone key also by `deltaFrames`). `startDb`: the gain under the press.
   */
  | { kind: "bandDrag"; pointerId: number; clipId: ClipId; mode: "gain" | "keys"; frames: readonly Frame[]; grabX: number; grabY: number; startDb: number; deltaDb: number; deltaFrames: number };

/** A keyboard zoom step on its way (spec §6.2): from `from` to `to` with `anchor` held; `start` is set by the first frame. */
interface ZoomAnimation {
  from: TimelineViewport;
  to: TimelineViewport;
  anchor: { frame: number; x: number };
  start: number | null;
  stop: () => void;
}

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
    scrollbarSize: tl.scrollbarSize,
  };
}

const sameHover = (a: HitResult | null, b: HitResult | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.type === b.type &&
    a.clipId === b.clipId &&
    a.addTrack === b.addTrack &&
    a.trackId === b.trackId &&
    a.toggle === b.toggle &&
    a.junction?.frame === b.junction?.frame &&
    a.gap?.start === b.gap?.start &&
    a.scrollbar?.axis === b.scrollbar?.axis &&
    a.scrollbar?.part === b.scrollbar?.part &&
    a.markerId === b.markerId &&
    a.keyframe?.frame === b.keyframe?.frame &&
    a.lane === b.lane &&
    a.fade === b.fade &&
    a.transition?.left === b.transition?.left &&
    a.transition?.edge === b.transition?.edge &&
    a.band?.key === b.band?.key);

/** A hit on a track row's clip area: what the Razor can cut (and shows its cursor over). */
function inTrackRow(hit: HitResult): boolean {
  switch (hit.type) {
    case "clip":
    case "clipEdgeIn":
    case "clipEdgeOut":
    case "junction":
    case "gap":
    case "keyframe":
    case "fadeHandle":
    case "transition":
    case "transitionEdge":
    case "rubberBand":
      return true;
    case "empty":
      return hit.trackId !== null;
    default:
      return false;
  }
}

/** The clip a hit on a body, trim zone or cut is on, else null. */
function hitClip(hit: HitResult): ClipId | null {
  return hit.type === "clip" ||
    hit.type === "clipEdgeIn" ||
    hit.type === "clipEdgeOut" ||
    hit.type === "junction" ||
    hit.type === "keyframe" ||
    hit.type === "fadeHandle" ||
    hit.type === "transition" ||
    hit.type === "transitionEdge" ||
    hit.type === "rubberBand"
    ? hit.clipId
    : null;
}

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
  /** A press here would pan: Space armed, or the Hand tool over the track area (spec §6.6). */
  pan: boolean;
  /** Mod held: a click on the rubber band's line adds a key (Batch 37). */
  mod: boolean;
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
  if (gesture?.kind === "pan") return "grabbing";
  if (gesture?.kind === "scrollbar") return gesture.part === "thumb" ? "default" : "ew-resize";
  if (gesture?.kind === "scrub" || gesture?.kind === "markerDrag" || gesture?.kind === "rangeDrag") return "ew-resize";
  if (gesture?.kind === "trackDrag") return "grabbing";
  if (gesture?.kind === "keyDrag" || gesture?.kind === "fadeDrag" || gesture?.kind === "transitionDrag") return "ew-resize";
  if (gesture?.kind === "pressKey") return "pointer";
  if (gesture?.kind === "pressTransition") return gesture.edge ? "ew-resize" : "pointer";
  if (gesture?.kind === "bandDrag") return gesture.mode === "keys" && gesture.frames.length === 1 && gesture.deltaFrames !== 0 ? "move" : "ns-resize";
  if (gesture?.kind === "pressBand") return gesture.key !== null ? "pointer" : "ns-resize";
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
  if (hit.type === "scrollbar") return hit.scrollbar?.part === "start" || hit.scrollbar?.part === "end" ? "ew-resize" : "default";
  if (context.pan) return "grab";
  if (hit.type === "ruler" || hit.type === "playheadHead" || hit.type === "inHandle" || hit.type === "outHandle") return "ew-resize";
  if (hit.type === "marker" || (hit.type === "keyframe" && context.tool === "select")) return "pointer";
  if (context.tool === "select" && (hit.type === "fadeHandle" || hit.type === "transitionEdge")) return "ew-resize";
  if (context.tool === "select" && hit.type === "transition") return "pointer";
  if (context.tool === "select" && hit.type === "rubberBand") return hit.band?.key !== null ? "pointer" : context.mod ? "copy" : "ns-resize";
  if ((hit.type === "trackHeader" && hit.addTrack) || hit.type === "headerToggle") return "pointer";
  const edge = hitEdge(hit);
  const { tool } = context;
  if (tool === "razor") return inTrackRow(hit) ? cursors.razor : "default";
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
  /** Playback runs (the playback controller keeps it): Space stays play/pause (a pause is never delayed) and does not arm the pan. */
  playing = false;

  private content: Layer | null = null;
  private overlay: Layer | null = null;
  private size: Size = { width: 0, height: 0 };
  private metrics: TimelineMetrics;
  private cursors: TrimCursors;
  private readonly text = new TextCache();
  private cachedGeometry: { key: readonly unknown[]; geometry: TimelineGeometry } | null = null;
  private cachedScrollbars: { geometry: TimelineGeometry; project: Project; minThumb: number; layout: ScrollbarLayout } | null = null;
  private cachedLanes: { show: boolean; lanes: SessionState["keyframeLanes"]; keys: KeyframeSelection | null; scene: LaneScene } | null = null;
  /** A keyboard zoom step being eased in (spec §6.2), or null. */
  private zoomAnimation: ZoomAnimation | null = null;
  /** Space held for Space+drag (spec §6.6); `panned` once a pan started (the release then plays nothing). */
  private space: { panned: boolean } | null = null;
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
  /** Candidates of an in/out handle drag: built without the dragged point. */
  private readonly rangeSnapIndex = new SnapIndex();
  /** While a gesture drags: stops its auto-scroll ticker and key listeners. */
  private stopDrag: (() => void) | null = null;
  private lastTick: number | null = null;
  private statsElement: HTMLElement | null = null;
  private readonly stops: (() => void)[] = [];
  /** Visuals arrived: the pending coalesced redraw, when the last one ran, and arrivals held while paused. */
  private arrivalTimer: ReturnType<typeof setTimeout> | null = null;
  private lastArrivalDraw = -Infinity;
  private arrivalHeld = false;

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
      scrollbars: () => this.scrollbars(),
      get marker() {
        const { markerWidth, markerHeight } = deps.theme.theme.timeline;
        return { width: markerWidth, height: markerHeight };
      },
      inOut: () => this.deps.session.state.getState(),
      get handleZone() {
        return deps.theme.theme.timeline.rangeHandleZone;
      },
      keyframes: {
        scene: () => this.laneScene(),
        selected: (clipId) => {
          const selection = this.deps.session.selection.getState();
          return selection.kind === "clips" && selection.clipIds.has(clipId);
        },
        band: (row) => laneBand(row, deps.theme.theme),
        get size() {
          return deps.theme.theme.timeline.keyframeSize;
        },
        get inset() {
          return diamondInset(deps.theme.theme);
        },
      },
      fades: {
        get size() {
          return deps.theme.theme.timeline.fadeHandleSize;
        },
        get inset() {
          return deps.theme.theme.timeline.clipInset;
        },
      },
      transitions: {
        band: (row, track) => blockBand(row, track, deps.theme.theme),
        get edgeZone() {
          return deps.theme.theme.timeline.transitionEdgeZone;
        },
      },
      rubberBand: (clip, row, track, x, y) => {
        const theme = deps.theme.theme;
        const box = bandBox(row, track, theme);
        return box && clip.kind === "audio" ? bandAt(this.geometry(), theme, clip, box, x, y) : null;
      },
    });
  }

  /** The keyframe lanes as the session sets them (one object while nothing they depend on changes). */
  private laneScene(): LaneScene {
    const state = this.deps.session.state.getState();
    const keys = this.deps.session.keyframes.getState();
    const cached = this.cachedLanes;
    if (cached && cached.show === state.clipKeyframes && cached.lanes === state.keyframeLanes && cached.keys === keys) return cached.scene;
    const lanes = state.keyframeLanes;
    const scene: LaneScene = { show: state.clipKeyframes, section: (clipId) => lanes[clipId] ?? "transform", selected: keys };
    this.cachedLanes = { show: state.clipKeyframes, lanes, keys, scene };
    return scene;
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
    // A middle press pans (spec §6.6): never the browser's autoscroll or a Linux primary paste.
    const onMiddle = (event: MouseEvent) => {
      if (event.button === 1) event.preventDefault();
    };
    const onContextMenu = (event: MouseEvent) => this.onContextMenu(event);
    const onDoubleClick = (event: MouseEvent) => this.onDoubleClick(event);
    // Files from the OS (spec §6.14): the drop frame follows the pointer; the drop goes to the controller.
    const onFileDragOver = (event: DragEvent) => this.onFileDrag(event);
    const onFileDragLeave = () => this.leaveMediaDrag();
    const onFileDrop = (event: DragEvent) => this.onFileDrop(event);
    // Mod pressed or released over a trim edge switches it to the ripple cursor (spec §6.4), Mod+Alt
    // over a cut to the roll cursor (§6.10). The modifier state is only read here: keys still go to
    // the KeyDispatcher.
    const win = host.ownerDocument.defaultView;
    const onHoverKey = (event: KeyboardEvent) => {
      if (this.gesture || !this.pointer) return;
      this.modifiers = this.modifiersOf(event);
      this.updateCursor();
      // Shift switches the Razor's cut line between the clip and every track.
      if (this.deps.session.state.getState().activeTool === "razor") this.deps.scheduler.invalidate("timelineOverlay");
    };
    win?.addEventListener("keydown", onHoverKey);
    win?.addEventListener("keyup", onHoverKey);
    // Capture phase, ahead of the KeyDispatcher: an armed Space never reaches the shortcuts.
    const onSpaceKey = (event: KeyboardEvent) => this.onSpaceKey(event);
    const onBlur = () => this.disarmSpace();
    win?.addEventListener("keydown", onSpaceKey, true);
    win?.addEventListener("keyup", onSpaceKey, true);
    win?.addEventListener("blur", onBlur);
    overlay.addEventListener("pointerdown", onPointerDown);
    overlay.addEventListener("pointermove", onPointerMove);
    overlay.addEventListener("pointerup", onPointerUp);
    overlay.addEventListener("pointercancel", onPointerCancel);
    overlay.addEventListener("lostpointercapture", onPointerCancel);
    overlay.addEventListener("pointerleave", onPointerLeave);
    overlay.addEventListener("wheel", onWheel, { passive: false });
    overlay.addEventListener("contextmenu", onContextMenu);
    overlay.addEventListener("dblclick", onDoubleClick);
    overlay.addEventListener("mousedown", onMiddle);
    overlay.addEventListener("auxclick", onMiddle);
    overlay.addEventListener("dragenter", onFileDragOver);
    overlay.addEventListener("dragover", onFileDragOver);
    overlay.addEventListener("dragleave", onFileDragLeave);
    overlay.addEventListener("drop", onFileDrop);

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
      // The ruler labels follow the timecode format (spec §6.3).
      session.state.select((state) => state.timecodeFormat, () => scheduler.invalidate("timelineContent")),
      session.state.select(
        (state) => state.playhead,
        () => {
          scheduler.invalidate("timelineOverlay");
          // The playhead is a snap candidate: a drag while playing follows it.
          if (this.gesture?.kind === "move" || this.gesture?.kind === "trim" || this.gesture?.kind === "mediaDrop") this.followPointer();
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
      // The tool changes what lies under the pointer (spec §6.18) and the Razor's cut line.
      session.state.select(
        (state) => state.activeTool,
        () => {
          this.updateCursor();
          scheduler.invalidate("timelineOverlay");
        },
      ),
      session.selection.subscribe(() => scheduler.invalidate("timelineContent")),
      // Keyframe lanes (Batch 35): the toggle, the lanes' sections and the selected keys.
      session.state.select((state) => state.clipKeyframes, both),
      session.state.select((state) => state.keyframeLanes, both),
      session.keyframes.subscribe(() => scheduler.invalidate("timelineContent")),
      session.editPoint.subscribe(() => scheduler.invalidate("timelineOverlay")),
      // The selected transition's block (Batch 36).
      session.transition.subscribe(() => scheduler.invalidate("timelineContent")),
      session.gap.subscribe(() => scheduler.invalidate("timelineOverlay")),
      session.marker.subscribe(() => scheduler.invalidate("timelineOverlay")),
      // The in/out range is drawn on the overlay (spec §6.13).
      session.state.select((state) => state.inPoint, () => scheduler.invalidate("timelineOverlay")),
      session.state.select((state) => state.outPoint, () => scheduler.invalidate("timelineOverlay")),
      // The FrameScheduler flags of document changes (spec §3.4): every command carries `affects`.
      document.subscribe(both, { affects: CONTENT_AFFECTS }),
      // A drag or marquee holds clips of the document it started from: an edit under it (an undo
      // key) cancels it; a marker drag ends when its marker changes under it.
      document.subscribe(() => this.cancelGesture(), { affects: ["clips", "tracks"] }),
      document.subscribe(
        (state) => {
          const gesture = this.gesture;
          if ((gesture?.kind === "markerDrag" || gesture?.kind === "pressMarker") && !state.markers.some((marker) => marker.id === gesture.markerId)) this.cancelGesture();
        },
        { affects: ["markers"] },
      ),
      theme.subscribe((next) => {
        this.metrics = metricsOf(next);
        this.cursors = trimCursors(next);
        this.text.clear();
        this.updateCursor();
        both();
      }),
      watchDevicePixelRatio(host.ownerDocument.defaultView, both),
      this.deps.visuals?.subscribe(() => this.onArrival()) ?? (() => {}),
      this.deps.idle?.onPauseChange?.((paused) => {
        if (paused || !this.arrivalHeld) return;
        this.arrivalHeld = false;
        this.onArrival();
      }) ?? (() => {}),
      () => {
        if (this.arrivalTimer !== null) clearTimeout(this.arrivalTimer);
        this.arrivalTimer = null;
        this.arrivalHeld = false;
      },
      () => {
        overlay.removeEventListener("pointerdown", onPointerDown);
        overlay.removeEventListener("pointermove", onPointerMove);
        overlay.removeEventListener("pointerup", onPointerUp);
        overlay.removeEventListener("pointercancel", onPointerCancel);
        overlay.removeEventListener("lostpointercapture", onPointerCancel);
        overlay.removeEventListener("pointerleave", onPointerLeave);
        overlay.removeEventListener("wheel", onWheel);
        overlay.removeEventListener("contextmenu", onContextMenu);
        overlay.removeEventListener("dblclick", onDoubleClick);
        overlay.removeEventListener("mousedown", onMiddle);
        overlay.removeEventListener("auxclick", onMiddle);
        overlay.removeEventListener("dragenter", onFileDragOver);
        overlay.removeEventListener("dragover", onFileDragOver);
        overlay.removeEventListener("dragleave", onFileDragLeave);
        overlay.removeEventListener("drop", onFileDrop);
        win?.removeEventListener("keydown", onHoverKey);
        win?.removeEventListener("keyup", onHoverKey);
        win?.removeEventListener("keydown", onSpaceKey, true);
        win?.removeEventListener("keyup", onSpaceKey, true);
        win?.removeEventListener("blur", onBlur);
      },
    );
    both();
    return () => this.unmount();
  }

  unmount(): void {
    this.cancelGesture();
    this.cancelZoomAnimation();
    this.space = null;
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
    this.cachedScrollbars = null;
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

  /** The media drag over the timeline (spec §6.14), or null. */
  get mediaDrop(): MediaDropGesture | null {
    return this.gesture?.kind === "mediaDrop" ? this.gesture.drop : null;
  }

  /** The overlay canvas (the Media panel's drag reads its page rect once per drag), or null when unmounted. */
  get element(): HTMLCanvasElement | null {
    return this.overlay?.canvas ?? null;
  }

  /**
   * A drag from the Media panel at overlay point (`x`, `y`) in CSS px (spec §6.14): the first call
   * starts the drop gesture (background work pauses, the edges auto-scroll, S inverts snapping), each
   * call moves its ghosts. Ignored while another gesture runs.
   */
  dragMedia(items: readonly DropItem[], x: number, y: number, modifiers: DragModifiers): void {
    if (!this.overlay || (this.gesture && this.gesture.kind !== "mediaDrop")) return;
    this.pointer = { x, y };
    this.modifiers = modifiers;
    if (!this.gesture) {
      this.gesture = { kind: "mediaDrop", pointerId: -1, drop: new MediaDropGesture(this.deps.document.getState(), items) };
      this.startDrag();
    }
    this.followPointer();
  }

  /** The media drag left the timeline (or ended elsewhere): its ghosts go. */
  leaveMediaDrag(): void {
    if (this.gesture?.kind === "mediaDrop") this.cancelGesture();
  }

  /** The media drag was released over the timeline: the drop as a request (null without one); the gesture ends. */
  endMediaDrag(): MediaDropRequest | null {
    const gesture = this.gesture;
    if (gesture?.kind !== "mediaDrop") return null;
    this.gesture = null;
    this.finishDrag();
    this.settleScrollY();
    this.refreshHover();
    this.deps.scheduler.invalidate("timelineOverlay");
    return gesture.drop.request();
  }

  /** True while an edit drags (the preview then asks frames with scrub priority, P8, and playback pauses). */
  /** The cut a transition chip dragged over the timeline would land on (Batch 36), or null. */
  private transitionDrop: Cut | null = null;

  /**
   * A transition chip dragged from the properties panel (spec §6.15) is over view point (x, y): the cut
   * nearest the pointer on the row under it (within the snap distance) is lit. Returns it, or null.
   */
  dragTransition(x: number, y: number): Cut | null {
    const geometry = this.geometry();
    const row = x >= geometry.headerWidth ? geometry.rowAt(y) : null;
    const reach = this.deps.theme.theme.timeline.snapThreshold / Math.max(geometry.pxPerFrame, 1e-9);
    const cut = row ? cutNear(this.deps.document.getState(), row.trackId, geometry.xToFrame(x), Math.max(reach, 0.5)) : null;
    if (cut?.left !== this.transitionDrop?.left || cut?.right !== this.transitionDrop?.right) {
      this.transitionDrop = cut;
      this.deps.scheduler.invalidate("timelineOverlay");
    }
    return cut;
  }

  /** The chip drag left the timeline or ended: the lit cut goes; returns it (where a release lands). */
  endTransitionDrag(): Cut | null {
    const cut = this.transitionDrop;
    this.transitionDrop = null;
    if (cut) this.deps.scheduler.invalidate("timelineOverlay");
    return cut;
  }

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
    if (gesture.kind === "marquee" || gesture.kind === "markerDrag") this.deps.scheduler.invalidate("timelineContent");
    if (gesture.kind === "move" || gesture.kind === "mediaDrop") this.settleScrollY();
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

  /**
   * Zoom keys and buttons (spec §6.2): anchored at the playhead when visible, else at the view center,
   * eased over `--duration-micro` with `--ease-out`. A step during a step builds on its target, so fast
   * presses add up. The session takes each frame's view (the geometry and hit tests follow).
   */
  zoomBy(factor: number): void {
    if (!this.mounted || this.ephemeral) return;
    const view = this.viewport();
    const context = this.zoomContext();
    const anchor = keyZoomAnchor(view, this.deps.session.state.getState().playhead, context.width);
    const base = this.zoomAnimation?.to.pxPerFrame ?? view.pxPerFrame;
    const to = zoomAt(view, base * factor, anchor.frame, anchor.x, context);
    this.cancelZoomAnimation();
    if (this.deps.theme.theme.motion.micro <= 0) {
      this.writeViewport(to);
      return;
    }
    const stop = this.deps.scheduler.addTicker((time) => this.stepZoom(time));
    this.zoomAnimation = { from: view, to, anchor, start: null, stop };
  }

  /** One frame of the keyboard zoom: the eased view, the target at the end. */
  private stepZoom(time: number): void {
    const animation = this.zoomAnimation;
    if (!animation) return;
    // The first frame already moves by one frame's worth.
    animation.start ??= time - FRAME_MS;
    const { theme } = this.deps.theme;
    const t = Math.min(1, (time - animation.start) / theme.motion.micro);
    const view = interpolateZoom(animation.from, animation.to, animation.anchor, ease(theme.ease.out, t), this.zoomContext());
    if (t >= 1) this.cancelZoomAnimation();
    this.writeViewport(view, undefined, true);
    this.followPointer();
  }

  private cancelZoomAnimation(): void {
    this.zoomAnimation?.stop();
    this.zoomAnimation = null;
  }

  /** Zoom to selection (spec §6.2, `Shift+\`): frames [start, end) with 10% of the view free on each side. */
  zoomToFrames(start: number, end: number): void {
    if (!this.mounted || this.ephemeral) return;
    this.writeViewport(zoomToSpan(start, end, this.zoomContext()));
  }

  /** Where the scrollbars are (spec §6.1), for drawing and hit tests; null when the theme gives them no size. */
  scrollbars(): ScrollbarLayout | null {
    if (this.metrics.scrollbarSize <= 0 || !this.mounted) return null;
    const geometry = this.geometry();
    const project = this.deps.document.getState();
    const minThumb = this.deps.theme.theme.timeline.scrollbarMinThumb;
    const cached = this.cachedScrollbars;
    if (cached && cached.geometry === geometry && cached.project === project && cached.minThumb === minThumb) return cached.layout;
    const layout = layoutScrollbars(
      this.viewport(),
      { width: geometry.area.width, contentEnd: contentEnd(project), fps: project.settings.fps },
      { h: geometry.hScrollbar, v: geometry.vScrollbar, scrollY: geometry.scrollY, scrollYRange: geometry.scrollYRange, viewHeight: geometry.area.height },
      minThumb,
    );
    this.cachedScrollbars = { geometry, project, minThumb, layout };
    return layout;
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

  /**
   * Where a clip's label bar is, in view CSS px (the canvases' coordinates), for the inline rename
   * field: the visible part of the clip, at least `minWidth` wide, kept inside the track area. The
   * view first pages to the clip's start when none of it is visible. Null when its row is off screen.
   */
  clipLabelRect(clipId: ClipId, minWidth: number): Rect | null {
    const clip = this.deps.document.getState().clips[clipId];
    if (!clip || !this.mounted) return null;
    let geometry = this.geometry();
    const { from, to } = geometry.visibleFrames;
    if (clip.start + clip.duration <= from || clip.start >= to) {
      this.reveal(clip.start);
      geometry = this.geometry();
    }
    const row = geometry.rowOf(clip.trackId);
    const { area } = geometry;
    if (!row || row.y + row.height <= area.y || row.y >= area.y + area.height) return null;
    const tl = this.deps.theme.theme.timeline;
    const track = this.deps.document.getState().tracks[row.index];
    const height = track?.kind === "caption" || track?.height === "S" ? row.height - 2 * tl.clipInset : tl.labelHeight;
    const width = Math.min(area.width, Math.max(minWidth, Math.min(geometry.frameToX(clip.start + clip.duration), area.x + area.width) - Math.max(geometry.frameToX(clip.start), area.x)));
    const x = Math.min(Math.max(geometry.frameToX(clip.start), area.x), area.x + area.width - width);
    return { x, y: Math.max(area.y, row.y + tl.clipInset), width, height };
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
    this.cancelZoomAnimation();
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

  /** Writes the view to the session; any other write than the zoom animation's own ends the animation. */
  private writeViewport(view: TimelineViewport, scrollY?: number, animating = false): void {
    if (!animating) this.cancelZoomAnimation();
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

  /** The clips a click selects with a clip (spec §6.7, §6.12): its group, and its linked partners while Linked selection is on. */
  private partners(clipId: ClipId): ClipId[] {
    return selectionPartners(this.deps.document.getState(), clipId, this.deps.session.state.getState().linkedSelection);
  }

  private onPointerDown(event: PointerEvent): void {
    this.pointer = { x: event.offsetX, y: event.offsetY };
    this.modifiers = this.modifiersOf(event);
    if (this.gesture) return;
    // Middle drag pans anywhere, whatever the tool (spec §6.6).
    if (event.button === 1) {
      event.preventDefault();
      this.startPan(event);
      return;
    }
    if (event.button !== 0) return;
    if (this.space) {
      this.space.panned = true;
      this.startPan(event);
      return;
    }
    const hit = this.hitTester.hit(event.offsetX, event.offsetY);
    if (hit.type === "scrollbar" && hit.scrollbar) {
      this.pressScrollbar(event, hit.scrollbar);
      return;
    }
    // Selected keys stay only while their diamonds (or the rubber band's keys) are pressed (Delete then acts on clips again).
    if (hit.type !== "keyframe" && !(hit.type === "rubberBand" && hit.band?.key !== null)) selectKeyframes(this.deps.session, null);
    const tool = this.deps.session.state.getState().activeTool;
    // The Hand tool pans from anywhere in the track area, clips included; the ruler still scrubs.
    if (tool === "hand" && contains(this.geometry().area, event.offsetX, event.offsetY)) {
      this.startPan(event);
      return;
    }
    if (tool === "razor" && inTrackRow(hit)) {
      this.pressRazor(event, hit);
      return;
    }
    switch (hit.type) {
      case "marker":
        if (hit.markerId !== null) this.pressMarker(event, hit.markerId);
        break;
      case "inHandle":
      case "outHandle":
        this.startRangeDrag(event, hit.type === "inHandle" ? "in" : "out");
        break;
      case "ruler":
      case "playheadHead": {
        this.capture(event.pointerId);
        this.gesture = { kind: "scrub", pointerId: event.pointerId, snap: null, heard: false };
        this.startDrag();
        this.scrubAt(event.offsetX);
        this.deps.scheduler.invalidate("timelineOverlay");
        break;
      }
      case "clip":
        // Clips on locked tracks take no selection (spec §6.12): the press acts as on empty space.
        if (isClipLocked(this.deps.document.getState(), hit.clipId as ClipId)) this.pressEmpty(event);
        else if (hit.lane && event.altKey && tool === "select") this.addKeyHere(hit.clipId as ClipId, hit.lane, hit.frame);
        else this.pressClip(event, hit.clipId as ClipId, hit.frame, bodyDrag(tool));
        break;
      case "keyframe":
        if (hit.keyframe && tool === "select") this.pressKey(event, hit.clipId as ClipId, hit.keyframe.section, hit.keyframe.frame);
        else this.pressClip(event, hit.clipId as ClipId, hit.frame, bodyDrag(tool));
        break;
      case "fadeHandle":
        if (hit.fade && tool === "select") this.pressFade(event, hit.clipId as ClipId, hit.fade);
        else this.pressClip(event, hit.clipId as ClipId, hit.frame, bodyDrag(tool));
        break;
      case "rubberBand":
        if (hit.band && tool === "select") this.pressBand(event, hit.clipId as ClipId, hit.band.key, hit.frame);
        else this.pressClip(event, hit.clipId as ClipId, hit.frame, bodyDrag(tool));
        break;
      case "transition":
      case "transitionEdge":
        if (hit.transition && tool === "select") {
          this.capture(event.pointerId);
          const { left, right, edge } = hit.transition;
          this.gesture = { kind: "pressTransition", pointerId: event.pointerId, x: event.offsetX, y: event.offsetY, cut: { left, right }, edge, grab: hit.frame };
          this.updateCursor();
        } else this.pressClip(event, hit.clipId as ClipId, hit.frame, bodyDrag(tool));
        break;
      case "clipEdgeIn":
      case "clipEdgeOut":
      case "junction":
        this.pressEdgeHit(event, hit, tool);
        break;
      case "trackHeader":
        if (hit.addTrack) this.deps.onAddTrack(hit.addTrack);
        else if (hit.trackId) this.pressHeader(event, hit.trackId);
        break;
      case "headerToggle":
        if (hit.trackId && hit.toggle) this.deps.onToggleTrack(hit.trackId, hit.toggle);
        break;
      case "gap":
        this.pressEmpty(event, hit.gap);
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
   * A press on a keyframe diamond (spec §6.4, §6.15): the clip joins the selection (alone when it was
   * not in it); the key is selected (Shift adds or removes it; a press on a key of the selection keeps
   * it, so several keys drag together). A drag retimes them, a click moves the playhead to the key.
   */
  private pressKey(event: PointerEvent, clipId: ClipId, section: KeyframeSection, frame: Frame): void {
    const { session } = this.deps;
    const selection = session.selection.getState();
    if (!(selection.kind === "clips" && selection.clipIds.has(clipId))) setSelection(session, selectClips([clipId], clipId));
    const current = session.keyframes.getState();
    const same = current !== null && current.clipId === clipId && current.section === section;
    let frames: Frame[];
    if (event.shiftKey && same) frames = current.frames.includes(frame) ? current.frames.filter((other) => other !== frame) : [...current.frames, frame];
    else if (same && current.frames.includes(frame)) frames = [...current.frames];
    else frames = [frame];
    selectKeyframes(session, frames.length > 0 ? { clipId, section, frames } : null);
    this.capture(event.pointerId);
    this.gesture = { kind: "pressKey", pointerId: event.pointerId, x: event.offsetX, y: event.offsetY, clipId, section, frames: frames.includes(frame) ? frames : [], grab: frame };
    this.updateCursor();
  }

  /** Alt+click on a keyframe lane (spec §6.4): a key at the frame under the pointer, selected; the playhead goes there. */
  private addKeyHere(clipId: ClipId, section: KeyframeSection, frame: number): void {
    const clip = this.deps.document.getState().clips[clipId];
    if (!clip) return;
    const rel = Math.min(clip.duration - 1, Math.max(0, Math.floor(frame) - clip.start));
    const { session } = this.deps;
    const selection = session.selection.getState();
    if (!(selection.kind === "clips" && selection.clipIds.has(clipId))) setSelection(session, selectClips([clipId], clipId));
    this.deps.onAddKeyframe?.(clipId, section, rel);
    selectKeyframes(session, { clipId, section, frames: [rel] });
    setPlayhead(session, clip.start + rel);
  }

  /** The dragged keys of `gesture` follow the pointer: whole frames, snapped (Shift: whole seconds), kept inside the clip. */
  private dragKeys(gesture: Extract<Gesture, { kind: "keyDrag" }>, x: number): void {
    const project = this.deps.document.getState();
    const clip = project.clips[gesture.clipId];
    if (!clip) return;
    const grabbed = clip.start + gesture.grab;
    const raw = this.geometry().xToFrame(x) - grabbed;
    let delta = Math.round(raw);
    let snap: SnapTarget | null = null;
    if (this.modifiers.shift) {
      // Whole seconds (spec §6.15): the nearer second boundary of the timeline.
      const fps = project.settings.fps;
      const second = secondOfFrame(Math.round(grabbed + raw), fps);
      const before = firstFrameOfSecond(second, fps);
      const after = firstFrameOfSecond(second + 1, fps);
      delta = (Math.abs(after - grabbed - raw) < Math.abs(before - grabbed - raw) ? after : before) - grabbed;
    } else if (this.snapping) {
      const moving = new Set(gesture.frames);
      const entries: { frame: Frame; kind: SnapKind; ref: string | null }[] = laneFrames(clip, gesture.section)
        .filter((frame) => !moving.has(frame))
        .map((frame) => ({ frame: clip.start + frame, kind: "keyframe", ref: null }));
      entries.push({ frame: clip.start, kind: "clipStart", ref: clip.id }, { frame: clip.start + clip.duration - 1, kind: "clipEnd", ref: clip.id });
      const hit = resolveSnap(
        snapCandidatesOf(entries),
        gesture.frames.map((frame) => clip.start + frame + raw),
        { thresholdPx: this.deps.theme.theme.timeline.snapThreshold, pxPerFrame: this.viewport().pxPerFrame, playhead: this.deps.session.state.getState().playhead },
      );
      if (hit) {
        delta = Math.round(raw + hit.offset);
        snap = hit.target;
      }
    }
    const clamped = clampKeyDelta(clip, gesture.frames, delta);
    gesture.delta = clamped;
    gesture.snap = clamped === delta ? snap : null;
  }

  /** A press on a fade handle (Batch 36): the fade follows the pointer from the press; the selection stays. */
  private pressFade(event: PointerEvent, clipId: ClipId, edge: FadeEdge): void {
    const clip = this.deps.document.getState().clips[clipId];
    if (!clip) return;
    const from = fadesOf(clip)[edge];
    this.capture(event.pointerId);
    this.gesture = { kind: "fadeDrag", pointerId: event.pointerId, clipId, edge, from, frames: from, snap: null };
    this.startDrag();
    this.followPointer();
  }

  /**
   * A press on the rubber band (Batch 37). Mod on the line adds a key under the pointer. On a key: the
   * clip joins the selection and the key is selected (Shift adds or removes it). On the line: the click
   * selection of a clip body applies (at once on an unselected clip, on release on a selected one).
   */
  private pressBand(event: PointerEvent, clipId: ClipId, key: Frame | null, frame: number): void {
    const { session } = this.deps;
    if (key === null && this.modifiers.mod) {
      this.addKeyHere(clipId, "volume", frame);
      return;
    }
    const selection = session.selection.getState();
    const selected = selection.kind === "clips" && selection.clipIds.has(clipId);
    let click: Selection | null = null;
    if (key !== null) {
      if (!selected) setSelection(session, selectClips([clipId], clipId));
      const current = session.keyframes.getState();
      const same = current !== null && current.clipId === clipId && current.section === "volume";
      let frames: Frame[];
      if (event.shiftKey && same) frames = current.frames.includes(key) ? current.frames.filter((other) => other !== key) : [...current.frames, key];
      else if (same && current.frames.includes(key)) frames = [...current.frames];
      else frames = [key];
      selectKeyframes(session, frames.length > 0 ? { clipId, section: "volume", frames } : null);
    } else {
      const modifier: ClickModifier = event.altKey ? "alt" : event.shiftKey ? "shift" : "none";
      const next = clickSelection(selection, clipId, modifier, modifier === "alt" ? [] : this.partners(clipId));
      if (!selected) setSelection(session, next);
      else click = next;
    }
    this.capture(event.pointerId);
    this.gesture = { kind: "pressBand", pointerId: event.pointerId, x: event.offsetX, y: event.offsetY, clipId, key, click };
    this.updateCursor();
  }

  /** The press on the rubber band became a drag: of the gain, of the keys around the pointer, or of the pressed key (and the other selected ones). */
  private startBandDrag(press: Extract<Gesture, { kind: "pressBand" }>): void {
    const clip = this.deps.document.getState().clips[press.clipId];
    if (!clip || clip.kind !== "audio") return;
    const keys = volumeKeys(clip);
    let mode: "gain" | "keys" = "keys";
    let frames: Frame[];
    let startDb: number;
    if (press.key !== null) {
      const chosen = this.deps.session.keyframes.getState();
      frames = chosen && chosen.clipId === clip.id && chosen.section === "volume" && chosen.frames.includes(press.key) ? [...chosen.frames] : [press.key];
      startDb = keys.find((key) => key.frame === press.key)?.value ?? clip.volume.gainDb;
    } else if (keys.length === 0) {
      mode = "gain";
      frames = [];
      startDb = clip.volume.gainDb;
    } else {
      const rel = this.geometry().xToFrame(press.x) - clip.start;
      frames = segmentKeys(keys, rel);
      startDb = gainDbAt(clip, rel);
    }
    this.gesture = { kind: "bandDrag", pointerId: press.pointerId, clipId: clip.id, mode, frames, grabX: press.x, grabY: press.y, startDb, deltaDb: 0, deltaFrames: 0 };
    this.startDrag();
    this.followPointer();
  }

  /** The dragged rubber band follows the pointer: the gain under it in 0.1 dB steps; a lone key also in whole frames (Shift: value only). */
  private dragBand(gesture: Extract<Gesture, { kind: "bandDrag" }>, x: number, y: number): void {
    const project = this.deps.document.getState();
    const clip = project.clips[gesture.clipId];
    const geometry = this.geometry();
    const row = clip ? geometry.rowOf(clip.trackId) : null;
    const track = row ? project.tracks[row.index] : undefined;
    const box = row && track ? bandBox(row, track, this.deps.theme.theme) : null;
    if (!clip || clip.kind !== "audio" || !box) return;
    const db = yGain(box, gainY(box, gesture.startDb) + (y - gesture.grabY));
    // The gain lands on 0.1 dB steps; keys move by 0.1 dB steps (`|| 0`: no -0).
    gesture.deltaDb = (gesture.mode === "gain" ? Math.round(db * 10) / 10 - gesture.startDb : Math.round((db - gesture.startDb) * 10) / 10) || 0;
    const lone = gesture.mode === "keys" && gesture.frames.length === 1 && !this.modifiers.shift;
    gesture.deltaFrames = lone ? clampKeyShift(clip, volumeKeys(clip), gesture.frames[0] as Frame, geometry.xToFrame(x) - geometry.xToFrame(gesture.grabX)) : 0;
    this.updateCursor();
  }

  /** The edit a band drag makes. */
  private bandEditOf(gesture: Extract<Gesture, { kind: "bandDrag" }>): BandEdit {
    return gesture.mode === "gain" ? { kind: "gain", gainDb: gesture.startDb + gesture.deltaDb } : { kind: "keys", frames: gesture.frames, deltaDb: gesture.deltaDb, deltaFrames: gesture.deltaFrames };
  }

  /** The dragged fade follows the pointer: whole frames from the clip's edge to the pointer, snapped, within the clip. */
  private dragFade(gesture: Extract<Gesture, { kind: "fadeDrag" }>, x: number): void {
    const project = this.deps.document.getState();
    const clip = project.clips[gesture.clipId];
    if (!clip) return;
    const end = clip.start + clip.duration;
    let at = this.geometry().xToFrame(x);
    let snap: SnapTarget | null = null;
    if (this.snapping) {
      const hit = resolveSnap(this.snapCandidates(), [at], {
        thresholdPx: this.deps.theme.theme.timeline.snapThreshold,
        pxPerFrame: this.viewport().pxPerFrame,
        playhead: this.deps.session.state.getState().playhead,
        exclude: new Set([clip.id]),
      });
      if (hit && hit.target.frame > clip.start && hit.target.frame < end) {
        at = hit.target.frame;
        snap = hit.target;
      }
    }
    const frames = clampFade(clip, gesture.edge, gesture.edge === "in" ? at - clip.start : end - at);
    gesture.frames = frames;
    gesture.snap = snap && (gesture.edge === "in" ? clip.start + frames : end - frames) === snap.frame ? snap : null;
  }

  /** The press on a block end became a drag: its sides follow the pointer. */
  private dragTransitionEdge(gesture: Extract<Gesture, { kind: "transitionDrag" }>, x: number): void {
    const project = this.deps.document.getState();
    const current = transitionAt(project, gesture.cut);
    const right = project.clips[gesture.cut.right];
    if (!current || !right) return;
    const edgeFrame = gesture.edge === "start" ? right.start - current.before : right.start + current.after;
    const raw = this.geometry().xToFrame(x) - gesture.grab;
    let delta = Math.round(raw);
    let snap: SnapTarget | null = null;
    if (this.snapping) {
      const hit = resolveSnap(this.snapCandidates(), [edgeFrame + raw], {
        thresholdPx: this.deps.theme.theme.timeline.snapThreshold,
        pxPerFrame: this.viewport().pxPerFrame,
        playhead: this.deps.session.state.getState().playhead,
        exclude: new Set([gesture.cut.left, gesture.cut.right]),
      });
      if (hit) {
        delta = Math.round(raw + hit.offset);
        snap = hit.target;
      }
    }
    const drag = dragTransitionEdge(project, gesture.cut, gesture.edge, delta, this.modifiers.alt);
    gesture.drag = drag;
    const landed = drag ? (gesture.edge === "start" ? right.start - drag.before : right.start + drag.after) : null;
    gesture.snap = snap && landed === snap.frame ? snap : null;
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
    // Any other tool (none today: the Hand pans before this) only selects.
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

  /**
   * A press on a track header (spec §6.7, §6.12): a click selects the track for the properties panel
   * (Shift or Mod adds or removes it; Mod+Shift selects the clips on it instead, none on a locked
   * track); a vertical drag past the dead zone reorders it. The selection waits for the release.
   */
  private pressHeader(event: PointerEvent, trackId: TrackId): void {
    const track = this.deps.document.getState().tracks.find((candidate) => candidate.id === trackId);
    const { mod, shift } = this.modifiers;
    const click =
      mod && shift ? selectClips(track && !track.locked ? track.clipIds : []) : trackClickSelection(this.deps.session.selection.getState(), trackId, mod || shift ? "toggle" : "none");
    this.capture(event.pointerId);
    this.gesture = { kind: "pressHeader", pointerId: event.pointerId, x: event.offsetX, y: event.offsetY, trackId, click };
  }

  /** The header press became a drag: the track follows the pointer (video and audio tracks; the caption track has a fixed place). */
  private startTrackDrag(press: Extract<Gesture, { kind: "pressHeader" }>): void {
    const tracks = this.deps.document.getState().tracks;
    const lane = laneOf(tracks, press.trackId);
    const row = this.geometry().rowOf(press.trackId);
    if (!lane || !row) return;
    this.gesture = { kind: "trackDrag", pointerId: press.pointerId, trackId: press.trackId, grab: press.y - row.y, lane: lane.number };
    this.startDrag();
    this.followPointer();
  }

  /** A pan starts (spec §6.6): the view will follow the pointer from here. */
  private startPan(event: PointerEvent): void {
    this.capture(event.pointerId);
    const { scrollY } = this.deps.session.state.getState().timeline;
    this.gesture = { kind: "pan", pointerId: event.pointerId, x: event.offsetX, y: event.offsetY, view: this.viewport(), scrollY };
    this.updateCursor();
    this.deps.scheduler.invalidate("timelineOverlay");
  }

  /** The content under the pointer stays under it: the view moves by the pointer's travel, within the scroll ranges. */
  private panTo(pan: Extract<Gesture, { kind: "pan" }>, x: number, y: number): void {
    const { view } = pan;
    const scrollFrame = clampScroll(view.scrollFrame - (x - pan.x) / view.pxPerFrame, view.pxPerFrame, this.zoomContext());
    const range = this.geometry().scrollYRange;
    // A view already outside the vertical range (tracks were removed) is never pulled further out.
    const scrollY = Math.min(Math.max(pan.scrollY - (y - pan.y), Math.min(range.min, pan.scrollY)), Math.max(range.max, pan.scrollY));
    // A manual scroll stops follow playhead until the next play (spec §6.2).
    if (scrollFrame !== this.viewport().scrollFrame) this.following = false;
    this.writeViewport({ pxPerFrame: view.pxPerFrame, scrollFrame }, scrollY);
  }

  /**
   * A press on a scrollbar (spec §6.1): its thumb or a zoom handle starts a drag from where it was
   * grabbed; a press on the trough brings the thumb's middle under the pointer and drags it from there.
   */
  private pressScrollbar(event: PointerEvent, hit: ScrollbarHit): void {
    const layout = this.scrollbars();
    if (!layout) return;
    const { offsetX: x, offsetY: y } = event;
    let part: "thumb" | "start" | "end";
    let grab: number;
    if (hit.axis === "x") {
      const { thumb } = layout.h;
      part = hit.part === "trough" ? "thumb" : hit.part;
      // A handle moves the proportional thumb's end (it may sit a few px inside a thumb held at its minimum).
      grab = hit.part === "trough" ? thumb.width / 2 : part === "thumb" ? x - thumb.x : x - handleEdge(part, this.viewport(), this.zoomContext(), this.geometry().hScrollbar);
    } else {
      const { thumb } = layout.v;
      // Every row fits: nothing to scroll.
      if (!thumb) return;
      part = "thumb";
      grab = hit.part === "trough" ? thumb.height / 2 : y - thumb.y;
    }
    this.capture(event.pointerId);
    this.gesture = { kind: "scrollbar", pointerId: event.pointerId, axis: hit.axis, part, grab, view: this.viewport() };
    if (hit.part === "trough") this.dragScrollbar(x, y);
    this.updateCursor();
    this.deps.scheduler.invalidate("timelineOverlay");
  }

  /** A scrollbar drag at the pointer: the thumb's grabbed point (or the dragged handle) follows it. */
  private dragScrollbar(x: number, y: number): void {
    const gesture = this.gesture;
    if (gesture?.kind !== "scrollbar") return;
    const geometry = this.geometry();
    const minThumb = this.deps.theme.theme.timeline.scrollbarMinThumb;
    if (gesture.axis === "y") {
      this.writeViewport(this.viewport(), scrollYForThumb(y - gesture.grab, geometry.scrollYRange, geometry.area.height, geometry.vScrollbar, minThumb));
      return;
    }
    const context = this.zoomContext();
    const view = this.viewport();
    const next =
      gesture.part === "thumb"
        ? { pxPerFrame: view.pxPerFrame, scrollFrame: scrollForThumb(x - gesture.grab, view, context, geometry.hScrollbar, minThumb) }
        : zoomHandleView(gesture.part, x - gesture.grab, gesture.view, context, geometry.hScrollbar);
    if (next.scrollFrame !== view.scrollFrame || next.pxPerFrame !== view.pxPerFrame) this.following = false;
    this.writeViewport(next);
  }

  /** The pointer rests on empty track space (no clip, edge or header under it): where Space arms a pan. */
  private onEmptySpace(): boolean {
    const { pointer, hover } = this;
    return pointer !== null && (hover?.type === "empty" || hover?.type === "gap") && contains(this.geometry().area, pointer.x, pointer.y);
  }

  /**
   * Space+drag (spec §6.6). While playback is stopped and the pointer rests on empty track space, a
   * plain Space press arms a pan instead of reaching the shortcuts (the cursor turns into a hand); a
   * press then pans. Released with no pan in between, it is the play/pause tap it would have been
   * (`onSpaceTap`). Elsewhere, and while playing, Space goes on to the shortcuts at once.
   */
  private onSpaceKey(event: KeyboardEvent): void {
    if (event.code !== "Space") return;
    if (event.type === "keyup") {
      const space = this.space;
      if (!space) return;
      this.disarmSpace();
      if (!space.panned) this.deps.onSpaceTap?.();
      return;
    }
    if (this.space) {
      // Repeats of the held key.
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.repeat || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || this.gesture || isEditableTarget(event.target)) return;
    if (!this.onEmptySpace() || this.playing) return;
    event.preventDefault();
    event.stopPropagation();
    this.space = { panned: false };
    this.updateCursor();
  }

  /** Space let go (or the window lost the keyboard): back to the tool's cursor. */
  private disarmSpace(): void {
    if (!this.space) return;
    this.space = null;
    this.updateCursor();
  }

  /**
   * A press on a marker (spec §6.3) selects it at once (as a press on a clip does, so the properties
   * panel changes before any drag, P1); a drag past the dead zone moves it.
   */
  private pressMarker(event: PointerEvent, markerId: string): void {
    const marker = this.deps.document.getState().markers.find((candidate) => candidate.id === markerId);
    if (!marker) return;
    selectMarker(this.deps.session, markerId);
    this.capture(event.pointerId);
    const grab = this.geometry().xToFrame(event.offsetX) - marker.frame;
    this.gesture = { kind: "pressMarker", pointerId: event.pointerId, x: event.offsetX, y: event.offsetY, markerId, grab };
  }

  private startMarkerDrag(press: Extract<Gesture, { kind: "pressMarker" }>): void {
    const marker = this.deps.document.getState().markers.find((candidate) => candidate.id === press.markerId);
    if (!marker) return;
    this.gesture = { kind: "markerDrag", pointerId: press.pointerId, markerId: marker.id, from: marker.frame, frame: marker.frame, grab: press.grab, snap: null };
    this.startDrag();
    // The ruler leaves the dragged marker out; the overlay draws it where it goes.
    this.deps.scheduler.invalidate("timelineContent");
    this.followPointer();
  }

  /** A press on an in or out handle (spec §6.3): the point follows the pointer at once (a click leaves it). */
  private startRangeDrag(event: PointerEvent, point: "in" | "out"): void {
    const { inPoint, outPoint } = this.deps.session.state.getState();
    const from = { inPoint, outPoint };
    this.capture(event.pointerId);
    this.gesture = { kind: "rangeDrag", pointerId: event.pointerId, point, from, range: from, snap: null };
    this.startDrag();
    this.updateCursor();
    this.deps.scheduler.invalidate("timelineOverlay");
  }

  /** The dragged marker's frame for the pointer: its grab offset kept, snapped while snapping is on (itself excluded). */
  private dragMarker(drag: Extract<Gesture, { kind: "markerDrag" }>, x: number): void {
    const frame = this.geometry().xToFrame(x) - drag.grab;
    const { playhead } = this.deps.session.state.getState();
    const hit = this.snapping
      ? resolveSnap(this.snapCandidates(), [frame], {
          thresholdPx: this.deps.theme.theme.timeline.snapThreshold,
          pxPerFrame: this.viewport().pxPerFrame,
          playhead,
          exclude: new Set([drag.markerId]),
        })
      : null;
    drag.snap = hit?.target ?? null;
    drag.frame = Math.max(0, hit ? hit.target.frame : Math.round(frame));
  }

  /** The dragged in or out point for the pointer, snapped to every candidate but itself (spec §6.9), at least a frame from the other. */
  private dragRange(drag: Extract<Gesture, { kind: "rangeDrag" }>, x: number): void {
    const frame = this.geometry().xToFrame(x);
    const { from, point } = drag;
    const project = this.deps.document.getState();
    const candidates = this.rangeSnapIndex.get(project, point === "in" ? null : from.inPoint, point === "out" ? null : from.outPoint);
    const hit = this.snapping
      ? resolveSnap(candidates, [frame], {
          thresholdPx: this.deps.theme.theme.timeline.snapThreshold,
          pxPerFrame: this.viewport().pxPerFrame,
          playhead: this.deps.session.state.getState().playhead,
        })
      : null;
    drag.snap = hit?.target ?? null;
    const target = hit ? hit.target.frame : frame;
    drag.range = point === "in" ? dragIn(from, target) : dragOut(from, target);
  }

  /** Double-click on a track header (spec §6.1): rename it inline; on a marker (spec §6.13): edit it inline. */
  private onDoubleClick(event: MouseEvent): void {
    if (this.gesture) return;
    const hit = this.hitTester.hit(event.offsetX, event.offsetY);
    if (hit.type === "trackHeader" && hit.trackId) this.deps.onRenameTrack?.(hit.trackId);
    else if (hit.type === "marker" && hit.markerId !== null) this.deps.onEditMarker?.(hit.markerId);
    else if ((hit.type === "transition" || hit.type === "transitionEdge") && hit.transition) {
      const cut = { left: hit.transition.left, right: hit.transition.right };
      selectTransition(this.deps.session, cut);
      this.deps.onOpenTransition?.(cut);
    }
  }

  /**
   * Where a marker's inline editor goes (view CSS px): under the marker's apex at the ruler's bottom.
   * The view first pages to the marker when it is off screen. Null when there is no such marker.
   */
  markerAnchor(markerId: string): { x: number; y: number } | null {
    if (!this.mounted) return null;
    const marker = this.deps.document.getState().markers.find((candidate) => candidate.id === markerId);
    if (!marker) return null;
    this.reveal(marker.frame);
    const geometry = this.geometry();
    return { x: geometry.frameToX(marker.frame), y: geometry.rulerHeight };
  }

  /**
   * Where a track header's name is (view CSS px), widened to the header's right edge, for the inline
   * rename field. The view first scrolls the row into view. Null when the track has no row.
   */
  trackNameRect(trackId: TrackId): Rect | null {
    if (!this.mounted) return null;
    let geometry = this.geometry();
    let row = geometry.rowOf(trackId);
    if (!row) return null;
    const { area } = geometry;
    if (row.y < area.y || row.y + Math.min(row.height, area.height) > area.y + area.height) {
      const delta = row.y < area.y ? row.y - area.y : row.y + Math.min(row.height, area.height) - (area.y + area.height);
      this.writeViewport(this.viewport(), this.deps.session.state.getState().timeline.scrollY + delta);
      geometry = this.geometry();
      row = geometry.rowOf(trackId);
      if (!row) return null;
    }
    const { theme } = this.deps.theme;
    const name = geometry.headerName(row, theme.icon.size, theme.space[2]);
    return { ...name, width: geometry.headerWidth - name.x - theme.space[1] };
  }

  /**
   * A press on empty track space or a gap: a marquee once it moves past the dead zone, else a click
   * that selects the gap (spec §6.7) or clears the selection.
   */
  private pressEmpty(event: PointerEvent, gap: Gap | null = null): void {
    const geometry = this.geometry();
    if (event.offsetX < geometry.headerWidth || event.offsetY < geometry.rulerHeight) return;
    this.capture(event.pointerId);
    this.gesture = { kind: "pendingMarquee", pointerId: event.pointerId, x: event.offsetX, y: event.offsetY, additive: event.shiftKey, gap };
  }

  /**
   * A Razor press (spec §6.11): cuts the clip under the pointer (and its linked partners) at the
   * snapped frame, or with Shift every unlocked track there. Clips on locked tracks are never cut.
   */
  private pressRazor(event: PointerEvent, hit: HitResult): void {
    const clipId = hitClip(hit);
    const unlocked = clipId !== null && !isClipLocked(this.deps.document.getState(), clipId) ? clipId : null;
    const all = event.shiftKey;
    if (!all && unlocked === null) return;
    this.deps.onRazor?.({ frame: this.razorFrame(event.offsetX).frame, clipId: unlocked, all });
    // The cut line now stands on a clip edge: redraw it.
    this.deps.scheduler.invalidate("timelineOverlay");
  }

  /** The frame the Razor cuts at for view x: the nearest frame boundary, snapped while snapping is on (spec §6.9). */
  private razorFrame(x: number): { frame: Frame; snap: SnapTarget | null } {
    const frame = this.geometry().xToFrame(x);
    const hit = this.snapping
      ? resolveSnap(this.snapCandidates(), [frame], {
          thresholdPx: this.deps.theme.theme.timeline.snapThreshold,
          pxPerFrame: this.viewport().pxPerFrame,
          playhead: this.deps.session.state.getState().playhead,
        })
      : null;
    return hit ? { frame: hit.target.frame, snap: hit.target } : { frame: Math.max(0, Math.round(frame)), snap: null };
  }

  /** The Razor at the pointer while no gesture runs (spec §6.11: hovering shows the cut line), or null. */
  private razorPreview(project: Project): (RazorScene & { snap: SnapTarget | null }) | null {
    const hover = this.hover;
    if (this.gesture || !this.pointer || !hover || !inTrackRow(hover) || this.deps.session.state.getState().activeTool !== "razor") return null;
    const { frame, snap } = this.razorFrame(this.pointer.x);
    const clipId = hitClip(hover);
    const ids = this.modifiers.shift
      ? clipsToSplit(project, frame, { kind: "all" })
      : clipId !== null
        ? clipsToSplit(project, frame, { kind: "clips", clipIds: [clipId] }, { linked: this.deps.session.state.getState().linkedSelection })
        : [];
    return { frame, snap, clips: ids.map((id) => project.clips[id] as Clip) };
  }

  /** Right-click (spec §6.16): a clip or a gap is selected (a selected clip keeps the selection), then its menu opens. */
  private onContextMenu(event: MouseEvent): void {
    event.preventDefault();
    if (this.gesture) return;
    const hit = this.hitTester.hit(event.offsetX, event.offsetY);
    const { session } = this.deps;
    const clipId = hitClip(hit);
    const key = hit.type === "keyframe" && hit.keyframe ? hit.keyframe : hit.type === "rubberBand" && hit.band?.key != null ? { section: "volume" as const, frame: hit.band.key } : null;
    if (key && clipId !== null) {
      // The keyframe menu (spec §6.15) acts on the selected keys (a lane's or a rubber band's): the clicked one joins them, or replaces a selection without it.
      const { section, frame } = key;
      const selection = session.selection.getState();
      if (!(selection.kind === "clips" && selection.clipIds.has(clipId))) setSelection(session, selectClips([clipId], clipId));
      const keys = session.keyframes.getState();
      if (!(keys && keys.clipId === clipId && keys.section === section && keys.frames.includes(frame))) selectKeyframes(session, { clipId, section, frames: [frame] });
      this.deps.onContextMenu?.({ kind: "keyframe", clipId, section, frame, x: event.clientX, y: event.clientY });
    } else if (clipId !== null && !isClipLocked(this.deps.document.getState(), clipId)) {
      const selection = session.selection.getState();
      if (!(selection.kind === "clips" && selection.clipIds.has(clipId))) setSelection(session, clickSelection(selection, clipId, "none", this.partners(clipId)));
      this.deps.onContextMenu?.({ kind: "clip", clipId, x: event.clientX, y: event.clientY });
    } else if (hit.type === "gap" && hit.gap) {
      selectGap(session, hit.gap);
      this.deps.onContextMenu?.({ kind: "gap", gap: hit.gap, x: event.clientX, y: event.clientY });
    } else if ((hit.type === "trackHeader" || hit.type === "headerToggle") && hit.trackId) {
      // The track menu acts on the selected tracks: the clicked one joins them, or replaces a selection without it.
      if (!selectedTrackIds(session.selection.getState()).includes(hit.trackId)) setSelection(session, selectTracks([hit.trackId]));
      this.deps.onContextMenu?.({ kind: "track", trackId: hit.trackId, x: event.clientX, y: event.clientY });
    } else if (hit.type === "marker" || hit.type === "ruler" || hit.type === "playheadHead" || hit.type === "inHandle" || hit.type === "outHandle") {
      // The ruler/marker menu (spec §6.16): a marker under the pointer is selected first.
      if (hit.markerId !== null) selectMarker(session, hit.markerId);
      this.deps.onContextMenu?.({ kind: "ruler", frame: Math.max(0, Math.round(hit.frame)), markerId: hit.markerId, x: event.clientX, y: event.clientY });
    }
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
      // The Razor's cut line follows the pointer within a clip too.
      if (this.deps.session.state.getState().activeTool === "razor") this.deps.scheduler.invalidate("timelineOverlay");
      return;
    }
    if (event.pointerId !== gesture.pointerId) return;
    const threshold = this.deps.theme.theme.timeline.dragThreshold;
    switch (gesture.kind) {
      case "scrub":
        this.scrubAt(event.offsetX);
        break;
      case "pan":
        this.panTo(gesture, event.offsetX, event.offsetY);
        break;
      case "scrollbar":
        this.dragScrollbar(event.offsetX, event.offsetY);
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
      case "pressHeader":
        if (Math.abs(event.offsetY - gesture.y) > threshold) this.startTrackDrag(gesture);
        break;
      case "pressEdge":
        if (Math.hypot(event.offsetX - gesture.x, event.offsetY - gesture.y) > threshold) this.startEdit(gesture.pointerId, gesture.target, gesture.frame);
        break;
      case "pressMarker":
        if (Math.abs(event.offsetX - gesture.x) > threshold) this.startMarkerDrag(gesture);
        break;
      case "pressTransition":
        if (gesture.edge && Math.abs(event.offsetX - gesture.x) > threshold) {
          this.gesture = { kind: "transitionDrag", pointerId: gesture.pointerId, cut: gesture.cut, edge: gesture.edge, grab: gesture.grab, drag: null, snap: null };
          selectTransition(this.deps.session, gesture.cut);
          this.startDrag();
          this.followPointer();
        }
        break;
      case "pressBand":
        if (Math.hypot(event.offsetX - gesture.x, event.offsetY - gesture.y) > threshold) this.startBandDrag(gesture);
        break;
      case "bandDrag":
        this.followPointer();
        break;
      case "pressKey":
        if (gesture.frames.length > 0 && Math.abs(event.offsetX - gesture.x) > threshold) {
          this.gesture = { kind: "keyDrag", pointerId: gesture.pointerId, clipId: gesture.clipId, section: gesture.section, frames: gesture.frames, grab: gesture.grab, delta: 0, snap: null };
          this.startDrag();
          this.followPointer();
        }
        break;
      case "keyDrag":
      case "move":
      case "trim":
      case "marquee":
      case "trackDrag":
      case "markerDrag":
      case "rangeDrag":
      case "fadeDrag":
      case "transitionDrag":
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
    } else if (gesture.kind === "mediaDrop") {
      gesture.drop.update(geometry.xToFrame(pointer.x), dropLanes(geometry, pointer.y), this.modifiers, this.moveSnap());
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
    } else if (gesture.kind === "trackDrag") {
      const row = geometry.rowOf(gesture.trackId);
      if (row && row.kind !== "caption") gesture.lane = geometry.reorderLane(row.kind, pointer.y);
      this.updateCursor();
      this.deps.scheduler.invalidate("timelineOverlay");
    } else if (gesture.kind === "markerDrag") {
      this.dragMarker(gesture, pointer.x);
      this.deps.scheduler.invalidate("timelineOverlay");
    } else if (gesture.kind === "rangeDrag") {
      this.dragRange(gesture, pointer.x);
      this.deps.scheduler.invalidate("timelineOverlay");
    } else if (gesture.kind === "keyDrag") {
      this.dragKeys(gesture, pointer.x);
      this.deps.scheduler.invalidate("timelineOverlay");
    } else if (gesture.kind === "fadeDrag") {
      this.dragFade(gesture, pointer.x);
      this.deps.scheduler.invalidate("timelineOverlay");
    } else if (gesture.kind === "bandDrag") {
      this.dragBand(gesture, pointer.x, pointer.y);
      this.deps.scheduler.invalidate("timelineOverlay");
    } else if (gesture.kind === "transitionDrag") {
      this.dragTransitionEdge(gesture, pointer.x);
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
      if (
        kind === "move" ||
        kind === "trim" ||
        kind === "scrub" ||
        kind === "markerDrag" ||
        kind === "rangeDrag" ||
        kind === "mediaDrop" ||
        kind === "keyDrag" ||
        kind === "fadeDrag" ||
        kind === "transitionDrag" ||
        kind === "bandDrag"
      )
        this.followPointer();
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
    const kind = gesture?.kind;
    if (
      !gesture ||
      !pointer ||
      (kind !== "scrub" && kind !== "move" && kind !== "trim" && kind !== "marquee" && kind !== "trackDrag" && kind !== "markerDrag" && kind !== "rangeDrag" && kind !== "mediaDrop" && kind !== "fadeDrag" && kind !== "transitionDrag")
    )
      return;
    const geometry = this.geometry();
    const { area } = geometry;
    const zone = this.deps.theme.theme.timeline.autoScrollZone;
    const scale = elapsed / FRAME_MS;
    // A track drag is vertical.
    const dx = gesture.kind === "trackDrag" ? 0 : edgeStep(pointer.x, area.x, area.x + area.width, zone) * scale;
    // Scrubs, trims, marker and handle drags are horizontal.
    const dy = kind === "scrub" || kind === "trim" || kind === "markerDrag" || kind === "rangeDrag" || kind === "fadeDrag" || kind === "transitionDrag" ? 0 : edgeStep(pointer.y, area.y, area.y + area.height, zone) * scale;
    if (dx === 0 && dy === 0) return;
    if (dx !== 0) {
      const context = this.zoomContext();
      // A drag may take clips past the content end: the view can follow them there.
      const trimmed = gesture.kind === "trim" ? gesture.trim.proposal : null;
      const dropped = gesture.kind === "move" ? gesture.move.proposal : gesture.kind === "mediaDrop" ? gesture.drop.proposal : null;
      const end = dropped
        ? Math.max(context.contentEnd, dropped.end)
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
      keyFrames: this.movedKeyFrames(),
    };
  }

  /** A clip drag's keys that snap (Batch 35): those on the dragged clip's keyframe lane, as timeline frames. */
  private movedKeyFrames(): Frame[] {
    const gesture = this.gesture;
    if (gesture?.kind !== "move") return [];
    const clip = gesture.move.anchor;
    const track = gesture.move.project.tracks.find((candidate) => candidate.id === clip.trackId);
    const section = track ? shownLane(this.laneScene(), clip, track, true) : null;
    return section ? laneFrames(clip, section).map((frame) => clip.start + frame) : [];
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
    const shown = snap ? snap.frame : Math.round(frame);
    const before = this.deps.session.state.getState().playhead;
    setPlayhead(this.deps.session, shown);
    const after = this.deps.session.state.getState().playhead;
    // The press itself is heard too (a click on the ruler), then each frame the scrub moves to.
    if (after !== before || !gesture.heard) {
      gesture.heard = true;
      this.deps.onScrub?.(after);
    }
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
        if (commit && gesture.gap) {
          selectGap(session, gesture.gap);
        } else if (commit && !gesture.additive) {
          setSelection(session, EMPTY_SELECTION);
          selectEditPoint(session, null);
          selectGap(session, null);
          selectTransition(session, null);
        }
        break;
      case "fadeDrag":
        if (commit && gesture.frames !== gesture.from) this.deps.onSetFade?.(gesture.clipId, gesture.edge, gesture.frames);
        break;
      case "pressBand": {
        // A click on the line: the clip's selection; on a key: the playhead goes to it.
        const clip = this.deps.document.getState().clips[gesture.clipId];
        if (commit && gesture.click) setSelection(session, gesture.click);
        if (commit && clip && gesture.key !== null) setPlayhead(session, clip.start + gesture.key);
        break;
      }
      case "bandDrag":
        if (commit && (gesture.deltaDb !== 0 || gesture.deltaFrames !== 0)) {
          this.deps.onBandEdit?.(gesture.clipId, this.bandEditOf(gesture));
          if (gesture.mode === "keys" && gesture.deltaFrames !== 0) selectKeyframes(session, { clipId: gesture.clipId, section: "volume", frames: gesture.frames.map((frame) => frame + gesture.deltaFrames) });
        }
        break;
      case "pressTransition":
        // A click on a block selects its transition (spec §6.4: its Transition section).
        if (commit) selectTransition(session, gesture.cut);
        break;
      case "transitionDrag": {
        const current = transitionAt(this.deps.document.getState(), gesture.cut);
        const { drag } = gesture;
        if (commit && current && drag && (drag.before !== current.before || drag.after !== current.after)) this.deps.onTransitionEdge?.(gesture.cut, drag.before, drag.after);
        break;
      }
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
      case "pressHeader":
        if (commit) setSelection(session, gesture.click);
        break;
      case "pressMarker":
        // Selected on the press.
        break;
      case "pressKey": {
        // A click on a key: the playhead goes to it (the properties panel shows its values).
        const clip = this.deps.document.getState().clips[gesture.clipId];
        if (commit && clip && gesture.frames.includes(gesture.grab)) setPlayhead(session, clip.start + gesture.grab);
        break;
      }
      case "keyDrag":
        if (commit && gesture.delta !== 0) {
          this.deps.onMoveKeyframes?.(gesture.clipId, gesture.section, gesture.frames, gesture.delta);
          selectKeyframes(session, { clipId: gesture.clipId, section: gesture.section, frames: gesture.frames.map((frame) => frame + gesture.delta) });
        }
        break;
      case "markerDrag":
        if (commit && gesture.frame !== gesture.from) this.deps.onMoveMarker?.(gesture.markerId, gesture.frame);
        this.deps.scheduler.invalidate("timelineContent");
        break;
      case "rangeDrag": {
        const { range, from } = gesture;
        if (commit && (range.inPoint !== from.inPoint || range.outPoint !== from.outPoint)) setInOut(session, range.inPoint, range.outPoint);
        break;
      }
      case "trackDrag":
        if (commit && gesture.lane !== laneOf(this.deps.document.getState().tracks, gesture.trackId)?.number) this.deps.onReorderTrack?.(gesture.trackId, gesture.lane);
        break;
      case "scrub":
      case "pan":
      case "scrollbar":
        // The session already holds the view.
        break;
      case "mediaDrop":
        // Fed from outside (no pointer of its own): ended by `endMediaDrag` or `leaveMediaDrag`.
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
    const pointer = this.pointer;
    const pan = this.space !== null || (activeTool === "hand" && pointer !== null && contains(this.geometry().area, pointer.x, pointer.y));
    const cursor = cursorFor(hover, this.gesture, this.cursors, { tool: activeTool, ripple: ripple || mod, roll: mod && alt, pan, mod });
    if (cursor === this.cursor || !this.overlay) return;
    this.cursor = cursor;
    this.overlay.canvas.style.cursor = cursor;
  }

  /** Files dragged from the OS over the overlay (spec §6.14): the drop frame and lanes follow the pointer. */
  private onFileDrag(event: DragEvent): void {
    if (!this.deps.onDropFiles || !event.dataTransfer?.types.includes("Files")) return;
    if (this.gesture && this.gesture.kind !== "mediaDrop") return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    this.dragMedia([], event.offsetX, event.offsetY, this.modifiersOf(event));
  }

  /** Files dropped from the OS: the controller imports and places them (one undo step). */
  private onFileDrop(event: DragEvent): void {
    const transfer = event.dataTransfer;
    if (!this.deps.onDropFiles || !transfer?.types.includes("Files") || this.gesture?.kind !== "mediaDrop") return;
    event.preventDefault();
    this.dragMedia([], event.offsetX, event.offsetY, this.modifiersOf(event));
    const request = this.endMediaDrag();
    if (request) this.deps.onDropFiles(transfer, request);
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
    const { visuals } = this.deps;
    const wants = visuals ? createWants() : null;
    const result = drawContent({
      ctx: layer.ctx,
      dpr: this.dpr(),
      geometry: this.geometry(),
      project,
      selection: this.gesture?.kind === "marquee" ? (this.gesture.marquee.current?.selection ?? this.deps.session.selection.getState()) : this.deps.session.selection.getState(),
      theme: this.deps.theme.theme,
      text: this.text,
      visuals: visuals ?? null,
      fonts: this.deps.fonts ?? null,
      wants,
      scrollbars: this.scrollbars(),
      timecodeFormat: this.deps.session.state.getState().timecodeFormat,
      hiddenMarker: this.gesture?.kind === "markerDrag" ? this.gesture.markerId : null,
      lanes: this.laneScene(),
      transition: this.deps.session.transition.getState(),
    });
    if (wants) visuals?.want(wants);
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
    const proposal = gesture?.kind === "move" ? gesture.move.proposal : gesture?.kind === "mediaDrop" ? gesture.drop.proposal : null;
    const trim = gesture?.kind === "trim" ? gesture.trim.proposal : null;
    const razor = this.razorPreview(project);
    const snap = proposal
      ? proposal.snap
      : trim
        ? trim.snap
        : gesture?.kind === "scrub" || gesture?.kind === "markerDrag" || gesture?.kind === "rangeDrag" || gesture?.kind === "keyDrag" || gesture?.kind === "fadeDrag" || gesture?.kind === "transitionDrag"
          ? gesture.snap
          : (razor?.snap ?? null);
    // The brackets stand on the document's cut: not while a drag moves clips.
    const editPoints = proposal || gesture?.kind === "trim" ? [] : this.editPointMarks(project);
    // Hover highlights are for a pointer at rest: none while dragging.
    const idle =
      gesture === null ||
      gesture.kind === "scrub" ||
      gesture.kind === "press" ||
      gesture.kind === "pressEdge" ||
      gesture.kind === "pressHeader" ||
      gesture.kind === "pressMarker" ||
      gesture.kind === "pressKey" ||
      gesture.kind === "pressTransition" ||
      gesture.kind === "pressBand";
    const markers = this.markerScene(project, idle);
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
      hoverHeader: idle ? this.hoverHeader(geometry) : null,
      trackDrag: gesture?.kind === "trackDrag" ? this.trackDragScene(project, geometry, gesture) : null,
      hoverGap: idle && !razor && this.hover?.type === "gap" ? this.hover.gap : null,
      gap: this.selectedGap(project),
      razor,
      snapFrame: snap?.frame ?? null,
      move: proposal ? { proposal, newRowHeight: theme.timeline.trackHeight.M } : null,
      trim: trim ? { proposal: trim, selection: this.deps.session.selection.getState() } : null,
      editPoints,
      marquee: gesture?.kind === "marquee" ? (gesture.marquee.current?.rect ?? null) : null,
      tooltip: this.pointer
        ? (this.rulerTooltip(project, markers, snap, this.pointer) ??
          this.bandTooltip(project, this.pointer) ??
          this.blockTooltip(project, snap, this.pointer) ??
          (gesture?.kind === "mediaDrop"
            ? this.dropTooltip(project, gesture.drop, snap, this.pointer)
            : proposal || trim || snap || gesture?.kind === "keyDrag"
              ? this.tooltip(project, proposal?.deltaFrames ?? (gesture?.kind === "keyDrag" ? gesture.delta : null), trim, snap, this.pointer)
              : null))
        : null,
      text: this.text,
      visuals: this.deps.visuals ?? null,
      fonts: this.deps.fonts ?? null,
      scrollbar: this.scrollbarState(idle),
      range: this.rangeScene(project, idle),
      markers,
      keyDrag: gesture?.kind === "keyDrag" ? this.keyDragScene(project, geometry, gesture) : null,
      blocks: this.blockScene(project, geometry, idle),
      band: this.bandScene(project, geometry, idle),
      project,
      selection: this.deps.session.selection.getState(),
      transition: this.deps.session.transition.getState(),
    });
    this.stats.overlayDraws += 1;
    this.stats.overlayMs = performance.now() - start;
    this.writeStats();
  }

  /**
   * Fades and transitions on the overlay (Batch 36): the hovered clip's fade handles (or the dragged
   * fade with the clip redrawn as it would be), the hovered or dragged block, and the cut a dragged
   * transition chip would land on.
   */
  private blockScene(project: Project, geometry: TimelineGeometry, idle: boolean): BlockScene | null {
    const gesture = this.gesture;
    const hover = idle ? this.hover : null;
    let fades: BlockScene["fades"] = null;
    if (gesture?.kind === "fadeDrag") {
      const clip = project.clips[gesture.clipId];
      const row = clip ? geometry.rowOf(clip.trackId) : null;
      if (clip && row) fades = { clip, row, fades: { ...fadesOf(clip), [gesture.edge]: gesture.frames }, active: gesture.edge, dragged: true };
    } else if (hover && (hover.type === "clip" || hover.type === "clipEdgeIn" || hover.type === "clipEdgeOut" || hover.type === "fadeHandle" || hover.type === "keyframe" || hover.type === "transition" || hover.type === "transitionEdge" || hover.type === "rubberBand")) {
      const clip = hover.clipId !== null ? project.clips[hover.clipId] : undefined;
      const row = clip ? geometry.rowOf(clip.trackId) : null;
      const track = clip ? project.tracks[row?.index ?? -1] : undefined;
      if (clip && row && track && !track.locked) fades = { clip, row, fades: fadesOf(clip), active: hover.type === "fadeHandle" ? hover.fade : null, dragged: false };
    }
    let block: BlockScene["block"] = null;
    const pair = gesture?.kind === "transitionDrag" ? gesture.cut : hover?.transition ? { left: hover.transition.left, right: hover.transition.right } : null;
    if (pair) {
      const left = project.clips[pair.left];
      const right = project.clips[pair.right];
      const current = transitionAt(project, pair);
      const row = right ? geometry.rowOf(right.trackId) : null;
      const track = row ? project.tracks[row.index] : undefined;
      if (left && right && current && row && track && isMediaClip(left) && isMediaClip(right)) {
        const dragging = gesture?.kind === "transitionDrag";
        const sides = dragging && gesture.drag ? { before: gesture.drag.before, after: gesture.drag.after } : current;
        const selected = this.deps.session.transition.getState();
        block = {
          left,
          right,
          row,
          track,
          transition: { ...current, ...sides },
          state: { selected: selected?.left === pair.left && selected.right === pair.right, hot: dragging ? gesture.edge : (hover?.transition?.edge ?? "body"), dragged: dragging },
          redraw: dragging,
          bound: dragging ? (gesture.drag?.bound ?? null) : null,
        };
      }
    }
    const drop = this.transitionDrop;
    let target: BlockScene["drop"] = null;
    if (drop) {
      const right = project.clips[drop.right];
      const row = right ? geometry.rowOf(right.trackId) : null;
      const track = row ? project.tracks[row.index] : undefined;
      if (right && row && track) target = { frame: right.start, row, track };
    }
    return fades || block || target ? { fades, block, drop: target } : null;
  }

  /** The tooltip of a fade drag (`Fade in · 00:00:15`) or a block end drag (`Δ +00:00:04 · 00:00:19`, `Media start` at a handle). */
  /**
   * The rubber band on the overlay (Batch 37): the hovered band lit, or the dragged one with its clip
   * redrawn as the drag would leave it.
   */
  private bandScene(project: Project, geometry: TimelineGeometry, idle: boolean): BandScene | null {
    const gesture = this.gesture;
    const hover = idle ? this.hover : null;
    const clipId = gesture?.kind === "bandDrag" || gesture?.kind === "pressBand" ? gesture.clipId : hover?.type === "rubberBand" ? hover.clipId : null;
    const clip = clipId !== null ? project.clips[clipId] : undefined;
    const row = clip ? geometry.rowOf(clip.trackId) : null;
    const track = row ? project.tracks[row.index] : undefined;
    const box = row && track ? bandBox(row, track, this.deps.theme.theme) : null;
    if (!clip || clip.kind !== "audio" || !row || !track || !box) return null;
    const keys = this.deps.session.keyframes.getState();
    const selected = keys && keys.clipId === clip.id && keys.section === "volume" ? new Set(keys.frames) : new Set<Frame>();
    if (gesture?.kind !== "bandDrag") return { clip, row, track, box, draw: { hot: true, selected }, redraw: false };
    const edited = bandEditedClip(clip, this.bandEditOf(gesture));
    const dragged = new Set(gesture.mode === "keys" ? gesture.frames.map((frame) => frame + gesture.deltaFrames) : []);
    return { clip: edited, row, track, box, draw: { hot: true, selected: dragged, dragged }, redraw: true };
  }

  /** A rubber band drag's tooltip: the gain under the pointer (a moved key: and its timecode). */
  private bandTooltip(project: Project, pointer: { x: number; y: number }) {
    const gesture = this.gesture;
    if (gesture?.kind !== "bandDrag") return null;
    const db = gesture.startDb + gesture.deltaDb;
    const text = `${db > 0 ? "+" : db < 0 ? "-" : ""}${Math.abs(db).toFixed(1)} dB`;
    const clip = project.clips[gesture.clipId];
    const lone = gesture.mode === "keys" && gesture.frames.length === 1 && clip;
    const at = lone ? ` · ${formatTimecode(clip.start + (gesture.frames[0] as Frame) + gesture.deltaFrames, project.settings.fps)}` : "";
    return { text: `${text}${at}`, target: null, alert: null, x: pointer.x, y: pointer.y };
  }

  private blockTooltip(project: Project, snap: SnapTarget | null, pointer: { x: number; y: number }) {
    const gesture = this.gesture;
    const fps = project.settings.fps;
    const target = snap ? snapLabel(project, snap) : null;
    if (gesture?.kind === "fadeDrag") return { text: `${gesture.edge === "in" ? "Fade in" : "Fade out"} · ${formatTimecode(gesture.frames, fps)}`, target, alert: null, x: pointer.x, y: pointer.y };
    if (gesture?.kind !== "transitionDrag" || !gesture.drag) return null;
    const current = transitionAt(project, gesture.cut);
    if (!current) return null;
    const length = gesture.drag.before + gesture.drag.after;
    const text = `${deltaLabel(length - current.before - current.after, project)} · ${formatTimecode(length, fps)}`;
    const alert = gesture.drag.bound === "mediaStart" ? "Media start" : gesture.drag.bound === "mediaEnd" ? "Media end" : null;
    return { text, target, alert, x: pointer.x, y: pointer.y };
  }

  /** A keyframe drag as drawn: the lane's keys with the dragged ones moved (a key they land on gives way). */
  private keyDragScene(project: Project, geometry: TimelineGeometry, gesture: Extract<Gesture, { kind: "keyDrag" }>) {
    const clip = project.clips[gesture.clipId];
    const row = clip ? geometry.rowOf(clip.trackId) : undefined;
    if (!clip || !row) return null;
    const moving = new Set(gesture.frames);
    const moved = gesture.frames.map((frame) => frame + gesture.delta);
    const landed = new Set(moved);
    const frames = [...laneFrames(clip, gesture.section).filter((frame) => !moving.has(frame) && !landed.has(frame)), ...moved];
    return { clip, row, draw: { frames, selected: landed, dragged: landed } };
  }

  /** The in/out range as drawn: a handle drag's proposal, else the session's; null when no point is set. */
  private rangeScene(project: Project, idle: boolean): RangeScene | null {
    const gesture = this.gesture;
    const { inPoint, outPoint } = gesture?.kind === "rangeDrag" ? gesture.range : this.deps.session.state.getState();
    if (inPoint === null && outPoint === null) return null;
    const hovered = idle && this.hover?.type === "inHandle" ? "in" : idle && this.hover?.type === "outHandle" ? "out" : null;
    return { inPoint, outPoint, end: contentEnd(project), active: gesture?.kind === "rangeDrag" ? gesture.point : hovered };
  }

  /** The selected marker, the one under a pointer at rest, and a dragged one (spec §6.3); null when there is none of them. */
  private markerScene(project: Project, idle: boolean): MarkerScene | null {
    const gesture = this.gesture;
    const find = (id: string | null) => (id === null ? null : (project.markers.find((marker) => marker.id === id) ?? null));
    const selected = find(this.deps.session.marker.getState());
    const hover = idle && this.hover?.type === "marker" ? find(this.hover.markerId) : null;
    const draggedMarker = gesture?.kind === "markerDrag" ? find(gesture.markerId) : null;
    const dragged = draggedMarker && gesture?.kind === "markerDrag" ? { marker: draggedMarker, frame: gesture.frame } : null;
    return selected || hover || dragged ? { selected, hover, dragged } : null;
  }

  /**
   * The ruler's tooltips: a marker's label and timecode while it is hovered or dragged (spec §6.3: "hover
   * shows label and timecode"), the dragged in or out point with the range's duration; null otherwise.
   */
  private rulerTooltip(project: Project, markers: MarkerScene | null, snap: SnapTarget | null, pointer: { x: number; y: number }) {
    const gesture = this.gesture;
    const { timecodeFormat } = this.deps.session.state.getState();
    const fps = project.settings.fps;
    const time = (frame: Frame) => formatTimecode(frame, fps, timecodeFormat);
    const target = snap ? snapLabel(project, snap) : null;
    const shown = markers?.dragged ? { marker: markers.dragged.marker, frame: markers.dragged.frame } : markers?.hover ? { marker: markers.hover, frame: markers.hover.frame } : null;
    if (shown) return { name: shown.marker.label || "Marker", text: time(shown.frame), target, alert: null, x: pointer.x, y: pointer.y };
    if (gesture?.kind !== "rangeDrag") return null;
    const { inPoint, outPoint } = gesture.range;
    const point = gesture.point === "in" ? `In ${time(inPoint ?? 0)}` : `Out ${time(lastFrameOf(outPoint ?? 1))}`;
    const span = inPoint !== null && outPoint !== null ? ` · ${time(outPoint - inPoint)}` : "";
    return { text: `${point}${span}`, target, alert: null, x: pointer.x, y: pointer.y };
  }

  /** A media drop's tooltip (spec §6.14): where the block starts (`mm:ss:ff`, frame-exact) and its length, with the snap target's name. */
  private dropTooltip(project: Project, drop: MediaDropGesture, snap: SnapTarget | null, pointer: { x: number; y: number }) {
    const fps = project.settings.fps;
    const start = drop.startFrame;
    if (start === null) return null;
    const text = drop.length > 0 ? `${formatTimecode(start, fps)} · ${formatTimecode(drop.length, fps)}` : formatTimecode(start, fps);
    return { text, target: snap ? snapLabel(project, snap) : null, alert: null, x: pointer.x, y: pointer.y };
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
    else if (result.plan.kind === "stretch") text = `${delta} · ${duration} · ${formatSpeed(hasSource(clip) ? clip.speed : 1)}`;
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

  /** The scrollbar part being dragged, or the one under a pointer at rest. */
  private scrollbarState(idle: boolean): { layout: ScrollbarLayout; hit: ScrollbarHit; active: boolean } | null {
    const layout = this.scrollbars();
    const gesture = this.gesture;
    if (!layout) return null;
    if (gesture?.kind === "scrollbar") return { layout, hit: { axis: gesture.axis, part: gesture.part }, active: true };
    const hit = idle && this.hover?.type === "scrollbar" ? this.hover.scrollbar : null;
    return hit ? { layout, hit, active: false } : null;
  }

  /** The selected gap while it still is one in the document (an edit may have moved or closed it). */
  private selectedGap(project: Project): Gap | null {
    const gap = this.deps.session.gap.getState();
    if (!gap) return null;
    const current = gapAt(project, gap.trackId, gap.start);
    return current && current.start === gap.start && current.end === gap.end ? gap : null;
  }

  private hoverToggle(geometry: TimelineGeometry) {
    const hover = this.hover;
    if (hover?.type !== "headerToggle" || !hover.trackId || !hover.toggle) return null;
    const row = geometry.rowOf(hover.trackId);
    return row ? geometry.headerToggle(row, hover.toggle) : null;
  }

  /** The header cell of the track under the pointer (its toggles have their own wash). */
  private hoverHeader(geometry: TimelineGeometry): Rect | null {
    const hover = this.hover;
    const row = hover?.type === "trackHeader" && hover.trackId ? geometry.rowOf(hover.trackId) : null;
    return row ? { x: 0, y: row.y, width: geometry.headerWidth, height: row.height } : null;
  }

  /** The dragged header at the pointer and the edge of the row it lands on (toward where it comes from), or no line when it stays. */
  private trackDragScene(project: Project, geometry: TimelineGeometry, drag: Extract<Gesture, { kind: "trackDrag" }>): TrackDragScene | null {
    const track = project.tracks.find((candidate) => candidate.id === drag.trackId);
    const row = geometry.rowOf(drag.trackId);
    if (!track || !row || row.kind === "caption" || !this.pointer) return null;
    const target = geometry.laneRows[row.kind][drag.lane];
    const insertY = !target || target.trackId === track.id ? null : target.y < row.y ? target.y : target.y + target.height;
    return { track, height: row.height, y: this.pointer.y - drag.grab, insertY };
  }

  private hoverClip(project: Project, geometry: TimelineGeometry) {
    const type = this.hover?.type;
    // The trim zones and its side of a cut are part of the clip: it stays lit while the cursor shows the bracket.
    const id = type === "clip" || type === "clipEdgeIn" || type === "clipEdgeOut" || type === "junction" || type === "fadeHandle" || type === "transition" || type === "transitionEdge" ? (this.hover?.clipId ?? null) : null;
    const clip = id !== null ? project.clips[id] : undefined;
    const row = clip ? geometry.rowOf(clip.trackId) : null;
    if (!clip || !row) return null;
    const next = neighbors(project, clip.id).next;
    return { clip, row, abutsNext: next !== null && next.start === clip.start + clip.duration };
  }

  /** Thumbnails or peaks arrived: one content redraw at most every ARRIVAL_INTERVAL_MS, held while the IdleQueue is paused. */
  private onArrival(): void {
    if (this.deps.idle?.isPaused) {
      this.arrivalHeld = true;
      return;
    }
    if (this.arrivalTimer !== null) return;
    const wait = this.lastArrivalDraw + ARRIVAL_INTERVAL_MS - performance.now();
    if (wait <= 0) {
      this.drawArrivals();
      return;
    }
    this.arrivalTimer = setTimeout(() => {
      this.arrivalTimer = null;
      this.drawArrivals();
    }, wait);
  }

  private drawArrivals(): void {
    if (this.deps.idle?.isPaused) {
      this.arrivalHeld = true;
      return;
    }
    this.lastArrivalDraw = performance.now();
    this.deps.scheduler.invalidate("timelineContent");
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
    const visuals = this.deps.visuals?.stats?.();
    element.textContent =
      `content ${s.contentDraws} draws · ${s.clipsDrawn}/${s.clipsTotal} clips · ${s.contentMs.toFixed(1)} ms\n` +
      `overlay ${s.overlayDraws} draws · ${s.overlayMs.toFixed(1)} ms · ${view.pxPerFrame.toFixed(3)} px/f` +
      (visuals ? `\n${visuals}` : "");
  }
}

/**
 * The lanes a media drop lands on (spec §6.14): the lane under the pointer on its side of the divider
 * (one past the last beyond the outermost row: a new track), for both kinds, so a video dropped on V2
 * puts its audio on A2 and one dropped on A2 its picture on V2.
 */
function dropLanes(geometry: TimelineGeometry, y: number): DropLanes {
  const side = y < geometry.divider.y + geometry.divider.height / 2 ? "video" : "audio";
  const lane = geometry.laneAt(side, y);
  return { video: lane, audio: lane };
}

/** What a drag of a clip body does with each tool (spec §6.18); the Razor cuts and the Hand pans on the press. */
function bodyDrag(tool: Tool): BodyDrag {
  return tool === "select" ? "move" : tool === "slip" || tool === "slide" ? tool : null;
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

