// Selection (spec §3.3). In memory the ids are a Set; undo snapshots and session.json use arrays.
// A track selection (kind `track`, spec §6.7: clicking a track header selects the track for the
// properties panel) lists its tracks in `trackIds`, in the order they were selected; the first one is
// the track the properties panel shows. Clip selections have no `trackIds`.
import type { ClipId, TrackId } from "../document/types.js";

export type SelectionKind = "clips" | "track" | "cue" | "none";

export interface Selection {
  clipIds: ReadonlySet<ClipId>;
  primary: ClipId | null;
  kind: SelectionKind;
  /** Kind `track`: the selected tracks (spec §3.3 names the kind; Batch 16 adds the ids). */
  trackIds?: ReadonlySet<TrackId>;
}

export interface SelectionSnapshot {
  clipIds: readonly ClipId[];
  primary: ClipId | null;
  kind: SelectionKind;
  trackIds?: readonly TrackId[];
}

export const EMPTY_SELECTION: Selection = { clipIds: new Set(), primary: null, kind: "none" };

export function toSnapshot(selection: Selection): SelectionSnapshot {
  const snapshot: SelectionSnapshot = { clipIds: [...selection.clipIds], primary: selection.primary, kind: selection.kind };
  return selection.trackIds ? { ...snapshot, trackIds: [...selection.trackIds] } : snapshot;
}

export function fromSnapshot(snapshot: SelectionSnapshot): Selection {
  const selection: Selection = { clipIds: new Set(snapshot.clipIds), primary: snapshot.primary, kind: snapshot.kind };
  return snapshot.trackIds ? { ...selection, trackIds: new Set(snapshot.trackIds) } : selection;
}

function sameSet<T>(a: ReadonlySet<T> | undefined, b: ReadonlySet<T> | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

export function selectionEquals(a: Selection, b: Selection): boolean {
  if (a === b) return true;
  if (a.kind !== b.kind || a.primary !== b.primary) return false;
  return sameSet(a.clipIds, b.clipIds) && sameSet(a.trackIds ?? EMPTY_IDS, b.trackIds ?? EMPTY_IDS);
}

const EMPTY_IDS: ReadonlySet<string> = new Set();

/**
 * Drops clip ids for which `exists` is false (and track ids for which `trackExists` is false); the
 * primary falls back to the first remaining id. A selection left empty becomes no selection.
 */
export function filterSelection(snapshot: SelectionSnapshot, exists: (id: ClipId) => boolean, trackExists?: (id: TrackId) => boolean): SelectionSnapshot {
  const clipIds = snapshot.clipIds.filter(exists);
  const trackIds = snapshot.trackIds && trackExists ? snapshot.trackIds.filter(trackExists) : snapshot.trackIds;
  if (clipIds.length === snapshot.clipIds.length && trackIds?.length === snapshot.trackIds?.length) return snapshot;
  if (snapshot.kind === "track") return trackIds && trackIds.length > 0 ? { clipIds: [], primary: null, kind: "track", trackIds } : { clipIds: [], primary: null, kind: "none" };
  const primary = snapshot.primary !== null && exists(snapshot.primary) ? snapshot.primary : (clipIds[0] ?? null);
  return { clipIds, primary, kind: clipIds.length === 0 ? "none" : snapshot.kind };
}

/** A track selection of `ids` in that order (empty: no selection). */
export function selectTracks(ids: Iterable<TrackId>): Selection {
  const trackIds = new Set(ids);
  return trackIds.size === 0 ? EMPTY_SELECTION : { clipIds: new Set(), primary: null, kind: "track", trackIds };
}

/** The selected tracks (none unless the selection is a track selection), in selection order. */
export function selectedTrackIds(selection: Selection): TrackId[] {
  return selection.kind === "track" && selection.trackIds ? [...selection.trackIds] : [];
}

/**
 * Track header click selection (spec §6.7): a plain click selects only the track; Shift or Mod
 * toggles it in a track selection (a clip selection is replaced).
 */
export function trackClickSelection(selection: Selection, trackId: TrackId, modifier: "none" | "toggle"): Selection {
  if (modifier === "none") return selectTracks([trackId]);
  const ids = selectedTrackIds(selection);
  return selectTracks(ids.includes(trackId) ? ids.filter((id) => id !== trackId) : [...ids, trackId]);
}

/** The modifier of a clip click (spec §6.7); when several are held, Alt wins over Mod, Mod over Shift. */
export type ClickModifier = "none" | "shift" | "mod" | "alt";

/** A clip selection of `ids` (empty: no selection). `primary` defaults to the first id. */
export function selectClips(ids: Iterable<ClipId>, primary?: ClipId | null): Selection {
  const clipIds = new Set(ids);
  if (clipIds.size === 0) return EMPTY_SELECTION;
  const first = clipIds.values().next().value as ClipId;
  return { clipIds, primary: primary !== undefined && primary !== null && clipIds.has(primary) ? primary : first, kind: "clips" };
}

/** `base` (a clip selection, else nothing) plus `ids`; the primary stays, or goes to the first added id. */
export function addToSelection(base: Selection, ids: Iterable<ClipId>): Selection {
  const kept = base.kind === "clips" ? base.clipIds : [];
  const added = [...ids];
  const primary = base.kind === "clips" && base.primary !== null ? base.primary : (added[0] ?? null);
  return selectClips([...kept, ...added], primary);
}

/**
 * Timeline click selection (spec §6.7). `partners` are the clips selected with the clicked one: its
 * group and, while Linked selection is on, its linked partners (ignored for Mod and Alt).
 * - plain click: the clip and its partners;
 * - Shift: toggles the clip and its partners;
 * - Mod: toggles the clip alone (adds it without its partner);
 * - Alt: the clip alone, even with Linked selection on.
 * An added clip becomes the primary; removing the primary passes it to the first remaining clip.
 * Group members (spec §6.12: selecting any member selects the group) come in `partners` too.
 */
export function clickSelection(selection: Selection, clipId: ClipId, modifier: ClickModifier, partners: readonly ClipId[] = []): Selection {
  if (modifier === "none") return selectClips([clipId, ...partners], clipId);
  if (modifier === "alt") return selectClips([clipId], clipId);
  const toggled = modifier === "shift" ? [clipId, ...partners] : [clipId];
  const clipIds = new Set(selection.kind === "clips" ? selection.clipIds : []);
  if (!clipIds.has(clipId)) {
    for (const id of toggled) clipIds.add(id);
    return { clipIds, primary: clipId, kind: "clips" };
  }
  for (const id of toggled) clipIds.delete(id);
  if (clipIds.size === 0) return EMPTY_SELECTION;
  const primary = selection.primary !== null && clipIds.has(selection.primary) ? selection.primary : ([...clipIds][0] ?? null);
  return { clipIds, primary, kind: "clips" };
}
