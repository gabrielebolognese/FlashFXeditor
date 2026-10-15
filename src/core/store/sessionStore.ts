// Session state (spec §5.3): per project, not undoable. The selection has its own channel so a
// selection change does not wake session subscribers and a playhead move does not wake selection
// subscribers. Splitter positions stay in layoutStore and track heights in the document (Track.height).
// A selected edit point and a selected gap (spec §6.7) and a selected timeline marker (§6.3) have
// channels of their own too: they are not clip selections (§3.3 fixes the selection kinds), they are
// never persisted, and selecting one of the four clears the other three.
import type { TimecodeMode } from "../document/time.js";
import type { ClipId, Frame, MediaId, TrackId, Us } from "../document/types.js";
import { createStore, type Store } from "./createStore.js";
import { EMPTY_SELECTION, selectionEquals, type Selection } from "./selection.js";

export type Tool = "select" | "razor" | "hand" | "slip" | "slide" | "rateStretch";
export type PreviewQuality = "auto" | "full" | "proxy" | "half" | "quarter";
export type SafeZone = "none" | "reels" | "tiktok" | "shorts";
/** Preview grid overlay (spec §7.6): rule of thirds, square cells a third of the width wide, or N x N cells. */
export type PreviewGrid = "none" | "thirds" | "squares" | "custom";

/** The preview monitor (spec §5.3, §7.1, §7.5, §7.6): view, quality and the overlays of the Overlays menu. */
export interface PreviewSession {
  zoom: number | "fit";
  /** The frame point at the canvas center, in project px from the frame center (see render/preview/viewport.ts). */
  panX: number;
  panY: number;
  quality: PreviewQuality;
  safeZone: SafeZone;
  grid: PreviewGrid;
  /** Cells per side of the custom grid. */
  gridDivisions: number;
  centerCross: boolean;
  /** Title-safe and action-safe rectangles (80% / 90%). */
  safeMargins: boolean;
  /** Pixel rulers along the canvas edges above 100% (§7.5). */
  rulers: boolean;
  /** Project pixel grid from 800% (§7.5). */
  pixelGrid: boolean;
  /** Smart guides on the canvas (§7.4): other layers and equal spacing as snap targets, the Alt measure mode. */
  guides: boolean;
}

/** Free preview zoom limits (the wheel): 5% to 3200% (the pixel grid shows from 800%, §7.5). */
export const PREVIEW_MIN_ZOOM = 0.05;
export const PREVIEW_MAX_ZOOM = 32;

export const GRID_DIVISIONS_MIN = 2;
export const GRID_DIVISIONS_MAX = 16;
export type MediaTab = "media" | "presets" | "captions";
/** Header sort choices (§12) plus the list-view columns. */
export type MediaSort = "name" | "date" | "duration" | "kind" | "resolution" | "fps" | "codec" | "audio" | "used";
export type MediaView = "grid" | "list";

/**
 * A source in/out range on a media item (spec §12: set with I / O while hovering its card): media
 * microseconds, `outUs` exclusive. A null end is the media's own; at least one end is set.
 */
export interface SourceRange {
  inUs: Us | null;
  outUs: Us | null;
}

export interface SessionState {
  playhead: Frame;
  inPoint: Frame | null;
  outPoint: Frame | null;
  timeline: { pxPerFrame: number; scrollFrame: number; scrollY: number };
  preview: PreviewSession;
  activeTool: Tool;
  snap: boolean;
  linkedSelection: boolean;
  ripple: boolean;
  loop: boolean;
  audioScrub: boolean;
  /** Timecodes as `mm:ss:ff` or `mm:ss.mmm` (spec §5.1: the preview panel's toggle; the timeline field and ruler follow). */
  timecodeFormat: TimecodeMode;
  mediaPanel: { tab: MediaTab; view: MediaView; sort: MediaSort; descending: boolean };
  /** Source ranges of media items (spec §12), by media id; inserts and drags take only that range. */
  sourceRanges: Readonly<Record<MediaId, SourceRange>>;
  /** Properties panel sections by id; true = collapsed. */
  collapsedSections: Record<string, boolean>;
}

export const DEFAULT_SESSION: SessionState = {
  playhead: 0,
  inPoint: null,
  outPoint: null,
  // 4 px/frame = 120 px/s at 30 fps. scrollY is relative to the resting divider position (may be < 0).
  timeline: { pxPerFrame: 4, scrollFrame: 0, scrollY: 0 },
  preview: {
    zoom: "fit",
    panX: 0,
    panY: 0,
    quality: "auto",
    safeZone: "none",
    grid: "none",
    gridDivisions: 4,
    centerCross: false,
    safeMargins: false,
    rulers: false,
    pixelGrid: true,
    guides: true,
  },
  activeTool: "select",
  snap: true,
  linkedSelection: true,
  ripple: false,
  loop: false,
  audioScrub: false,
  timecodeFormat: "frames",
  mediaPanel: { tab: "media", view: "grid", sort: "date", descending: false },
  sourceRanges: {},
  collapsedSections: {},
};

/**
 * A selected edit point (spec §6.7): the cut between two abutting clips, for a roll (`both` sides) or
 * a ripple trim of one side (`left`: the left clip's out point, `right`: the right clip's in point).
 */
export interface EditPoint {
  left: ClipId;
  right: ClipId;
  side: "both" | "left" | "right";
}

/** A selected gap (spec §6.7): the empty span [start, end) before a clip of a track (after the previous clip, or frame 0). */
export interface GapSelection {
  trackId: TrackId;
  start: Frame;
  end: Frame;
}

export interface SessionStore {
  /** Everything in §5.3 except the selection. */
  state: Store<SessionState>;
  selection: Store<Selection>;
  /** The selected edit point, or null. */
  editPoint: Store<EditPoint | null>;
  /** The selected gap, or null. */
  gap: Store<GapSelection | null>;
  /** The id of the selected timeline marker (spec §6.3: the properties panel shows it), or null. */
  marker: Store<string | null>;
}

export function createSessionStore(initial: Partial<SessionState> = {}): SessionStore {
  return {
    state: createStore<SessionState>({ ...DEFAULT_SESSION, ...initial }),
    selection: createStore<Selection>(EMPTY_SELECTION),
    editPoint: createStore<EditPoint | null>(null),
    gap: createStore<GapSelection | null>(null),
    marker: createStore<string | null>(null),
  };
}

/** Moves the playhead to an integer frame >= 0. No notification when it does not move. */
export function setPlayhead(session: SessionStore, frame: Frame): void {
  const next = Math.max(0, Math.round(frame));
  session.state.set((state) => (state.playhead === next ? state : { ...state, playhead: next }));
}

/** Sets the in/out range (spec §6.13; `outPoint` is the exclusive end). No notification when it does not change. */
export function setInOut(session: SessionStore, inPoint: Frame | null, outPoint: Frame | null): void {
  session.state.set((state) => (state.inPoint === inPoint && state.outPoint === outPoint ? state : { ...state, inPoint, outPoint }));
}

/** Sets (or with null clears) a media item's source range (spec §12). No notification when it does not change. */
export function setSourceRange(session: SessionStore, mediaId: MediaId, range: SourceRange | null): void {
  session.state.set((state) => {
    const current = state.sourceRanges[mediaId];
    if (range === null ? current === undefined : current?.inUs === range.inUs && current.outUs === range.outUs) return state;
    const sourceRanges = { ...state.sourceRanges };
    if (range === null) delete sourceRanges[mediaId];
    else sourceRanges[mediaId] = { inUs: range.inUs, outUs: range.outUs };
    return { ...state, sourceRanges };
  });
}

/** Replaces the selection (selecting clips drops a selected edit point, gap or marker). No notification when it is equal to the current one. */
export function setSelection(session: SessionStore, next: Selection): void {
  if (next.kind !== "none") {
    selectEditPoint(session, null);
    selectGap(session, null);
    selectMarker(session, null);
  }
  if (selectionEquals(session.selection.getState(), next)) return;
  session.selection.set(next);
}

/** Selects an edit point (the clip selection is cleared), or none. No notification when it does not change. */
export function selectEditPoint(session: SessionStore, point: EditPoint | null): void {
  const current = session.editPoint.getState();
  if (current === point || (current && point && current.left === point.left && current.right === point.right && current.side === point.side)) return;
  if (point) {
    setSelection(session, EMPTY_SELECTION);
    selectGap(session, null);
    selectMarker(session, null);
  }
  session.editPoint.set(point);
}

/** Selects a gap (the clip selection and the edit point are cleared), or none. No notification when it does not change. */
export function selectGap(session: SessionStore, gap: GapSelection | null): void {
  const current = session.gap.getState();
  if (current === gap || (current && gap && current.trackId === gap.trackId && current.start === gap.start && current.end === gap.end)) return;
  if (gap) {
    setSelection(session, EMPTY_SELECTION);
    selectEditPoint(session, null);
    selectMarker(session, null);
  }
  session.gap.set(gap);
}

/** Selects a timeline marker by id (the clip selection, the edit point and the gap are cleared), or none. */
export function selectMarker(session: SessionStore, markerId: string | null): void {
  if (session.marker.getState() === markerId) return;
  if (markerId !== null) {
    setSelection(session, EMPTY_SELECTION);
    selectEditPoint(session, null);
    selectGap(session, null);
  }
  session.marker.set(markerId);
}
