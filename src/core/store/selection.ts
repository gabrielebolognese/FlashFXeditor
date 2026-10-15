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
 * Timeline click selection (spec §6.7). `partners` are the clicked clip's linked partners, given when
 * Linked selection is on (ignored for Mod and Alt).
 * - plain click: the clip and its partners;
 * - Shift: toggles the clip and its partners;
 * - Mod: toggles the clip alone (adds it without its partner);
 * - Alt: the clip alone, even with Linked selection on.
 * An added clip becomes the primary; removing the primary passes it to the first remaining clip.
 * TODO(batch 16): selecting a group member selects the group.
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
