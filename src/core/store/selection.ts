// Selection (spec §3.3). In memory the ids are a Set; undo snapshots and session.json use arrays.
import type { ClipId } from "../document/types.js";

export type SelectionKind = "clips" | "track" | "cue" | "none";

export interface Selection {
  clipIds: ReadonlySet<ClipId>;
  primary: ClipId | null;
  kind: SelectionKind;
}

export interface SelectionSnapshot {
  clipIds: readonly ClipId[];
  primary: ClipId | null;
  kind: SelectionKind;
}

export const EMPTY_SELECTION: Selection = { clipIds: new Set(), primary: null, kind: "none" };

export function toSnapshot(selection: Selection): SelectionSnapshot {
  return { clipIds: [...selection.clipIds], primary: selection.primary, kind: selection.kind };
}

export function fromSnapshot(snapshot: SelectionSnapshot): Selection {
  return { clipIds: new Set(snapshot.clipIds), primary: snapshot.primary, kind: snapshot.kind };
}

export function selectionEquals(a: Selection, b: Selection): boolean {
  if (a === b) return true;
  if (a.kind !== b.kind || a.primary !== b.primary || a.clipIds.size !== b.clipIds.size) return false;
  for (const id of a.clipIds) if (!b.clipIds.has(id)) return false;
  return true;
}

/** Drops ids for which `exists` is false; the primary falls back to the first remaining id. */
export function filterSelection(snapshot: SelectionSnapshot, exists: (id: ClipId) => boolean): SelectionSnapshot {
  const clipIds = snapshot.clipIds.filter(exists);
  if (clipIds.length === snapshot.clipIds.length) return snapshot;
  const primary = snapshot.primary !== null && exists(snapshot.primary) ? snapshot.primary : (clipIds[0] ?? null);
  const kind = clipIds.length === 0 && snapshot.kind !== "track" ? "none" : snapshot.kind;
  return { clipIds, primary, kind };
}

/**
 * Timeline click selection (spec §6.7, click and Shift+click): a click selects only `clipId`, a
 * toggle click adds or removes it. An added clip becomes the primary; removing the primary passes
 * it to the first remaining clip.
 * TODO(batch 11): Mod/Alt variants, marquee, linked selection.
 */
export function clickClipSelection(selection: Selection, clipId: ClipId, toggle: boolean): Selection {
  if (!toggle) return { clipIds: new Set([clipId]), primary: clipId, kind: "clips" };
  const clipIds = new Set(selection.kind === "clips" ? selection.clipIds : []);
  if (!clipIds.has(clipId)) {
    clipIds.add(clipId);
    return { clipIds, primary: clipId, kind: "clips" };
  }
  clipIds.delete(clipId);
  if (clipIds.size === 0) return EMPTY_SELECTION;
  const primary = selection.primary !== null && clipIds.has(selection.primary) ? selection.primary : ([...clipIds][0] ?? null);
  return { clipIds, primary, kind: "clips" };
}
