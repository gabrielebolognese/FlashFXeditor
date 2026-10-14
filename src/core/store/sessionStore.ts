// Session state (spec §5.3): per project, not undoable. The selection has its own channel so a
// selection change does not wake session subscribers and a playhead move does not wake selection
// subscribers. Splitter positions stay in layoutStore and track heights in the document (Track.height).
import type { Frame } from "../document/types.js";
import { createStore, type Store } from "./createStore.js";
import { EMPTY_SELECTION, selectionEquals, type Selection } from "./selection.js";

export type Tool = "select" | "razor" | "hand" | "slip" | "slide" | "rateStretch";
export type PreviewQuality = "auto" | "full" | "proxy" | "half" | "quarter";
export type SafeZone = "none" | "reels" | "tiktok" | "shorts";
export type MediaTab = "media" | "presets" | "captions";
export type MediaSort = "name" | "date" | "duration" | "kind";

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
  mediaPanel: { tab: MediaTab; sort: MediaSort };
  /** Properties panel sections by id; true = collapsed. */
  collapsedSections: Record<string, boolean>;
}

export const DEFAULT_SESSION: SessionState = {
  playhead: 0,
  inPoint: null,
  outPoint: null,
  // TODO(batch 07): default zoom from the timeline view.
  timeline: { pxPerFrame: 4, scrollFrame: 0, scrollY: 0 },
  preview: { zoom: "fit", panX: 0, panY: 0, quality: "auto", safeZone: "none" },
  activeTool: "select",
  snap: true,
  linkedSelection: true,
  ripple: false,
  loop: false,
  audioScrub: false,
  mediaPanel: { tab: "media", sort: "date" },
  collapsedSections: {},
};

export interface SessionStore {
  /** Everything in §5.3 except the selection. */
  state: Store<SessionState>;
  selection: Store<Selection>;
}

export function createSessionStore(initial: Partial<SessionState> = {}): SessionStore {
  return {
    state: createStore<SessionState>({ ...DEFAULT_SESSION, ...initial }),
    selection: createStore<Selection>(EMPTY_SELECTION),
  };
}

/** Moves the playhead to an integer frame >= 0. No notification when it does not move. */
export function setPlayhead(session: SessionStore, frame: Frame): void {
  const next = Math.max(0, Math.round(frame));
  session.state.set((state) => (state.playhead === next ? state : { ...state, playhead: next }));
}

/** Replaces the selection. No notification when it is equal to the current one. */
export function setSelection(session: SessionStore, next: Selection): void {
  if (selectionEquals(session.selection.getState(), next)) return;
  session.selection.set(next);
}
