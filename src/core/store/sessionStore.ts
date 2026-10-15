// Session state (spec §5.3): per project, not undoable. The selection has its own channel so a
// selection change does not wake session subscribers and a playhead move does not wake selection
// subscribers. Splitter positions stay in layoutStore and track heights in the document (Track.height).
// A selected edit point (spec §6.7) has a channel of its own too: it is not a clip selection (§3.3
// fixes the selection kinds), it is never persisted, and selecting one clears the other.
import type { ClipId, Frame } from "../document/types.js";
import { createStore, type Store } from "./createStore.js";
import { EMPTY_SELECTION, selectionEquals, type Selection } from "./selection.js";

export type Tool = "select" | "razor" | "hand" | "slip" | "slide" | "rateStretch";
export type PreviewQuality = "auto" | "full" | "proxy" | "half" | "quarter";
export type SafeZone = "none" | "reels" | "tiktok" | "shorts";
export type MediaTab = "media" | "presets" | "captions";
/** Header sort choices (§12) plus the list-view columns. */
export type MediaSort = "name" | "date" | "duration" | "kind" | "resolution" | "fps" | "codec" | "audio" | "used";
export type MediaView = "grid" | "list";

export interface SessionState {
  playhead: Frame;
  inPoint: Frame | null;
  outPoint: Frame | null;
  timeline: { pxPerFrame: number; scrollFrame: number; scrollY: number };
  preview: { zoom: number | "fit"; panX: number; panY: number; quality: PreviewQuality; safeZone: SafeZone };
  activeTool: Tool;
  snap: boolean;
  linkedSelection: boolean;
  ripple: boolean;
  loop: boolean;
  audioScrub: boolean;
  mediaPanel: { tab: MediaTab; view: MediaView; sort: MediaSort; descending: boolean };
  /** Properties panel sections by id; true = collapsed. */
  collapsedSections: Record<string, boolean>;
}

export const DEFAULT_SESSION: SessionState = {
  playhead: 0,
  inPoint: null,
  outPoint: null,
  // 4 px/frame = 120 px/s at 30 fps. scrollY is relative to the resting divider position (may be < 0).
  timeline: { pxPerFrame: 4, scrollFrame: 0, scrollY: 0 },
  preview: { zoom: "fit", panX: 0, panY: 0, quality: "auto", safeZone: "none" },
  activeTool: "select",
  snap: true,
  linkedSelection: true,
  ripple: false,
  loop: false,
  audioScrub: false,
  mediaPanel: { tab: "media", view: "grid", sort: "date", descending: false },
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

export interface SessionStore {
  /** Everything in §5.3 except the selection. */
  state: Store<SessionState>;
  selection: Store<Selection>;
  /** The selected edit point, or null. */
  editPoint: Store<EditPoint | null>;
}

export function createSessionStore(initial: Partial<SessionState> = {}): SessionStore {
  return {
    state: createStore<SessionState>({ ...DEFAULT_SESSION, ...initial }),
    selection: createStore<Selection>(EMPTY_SELECTION),
    editPoint: createStore<EditPoint | null>(null),
  };
}

/** Moves the playhead to an integer frame >= 0. No notification when it does not move. */
export function setPlayhead(session: SessionStore, frame: Frame): void {
  const next = Math.max(0, Math.round(frame));
  session.state.set((state) => (state.playhead === next ? state : { ...state, playhead: next }));
}

/** Replaces the selection (selecting clips drops a selected edit point). No notification when it is equal to the current one. */
export function setSelection(session: SessionStore, next: Selection): void {
  if (next.kind !== "none") selectEditPoint(session, null);
  if (selectionEquals(session.selection.getState(), next)) return;
  session.selection.set(next);
}

/** Selects an edit point (the clip selection is cleared), or none. No notification when it does not change. */
export function selectEditPoint(session: SessionStore, point: EditPoint | null): void {
  const current = session.editPoint.getState();
  if (current === point || (current && point && current.left === point.left && current.right === point.right && current.side === point.side)) return;
  if (point) setSelection(session, EMPTY_SELECTION);
  session.editPoint.set(point);
}
