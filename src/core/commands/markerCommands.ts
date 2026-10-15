// Timeline marker commands (spec §5.2, §6.13): add, edit (label, color, frame) and delete. The
// document keeps `markers` sorted by frame (equal frames in the order they were added), so the ruler
// and the queries walk them in order. Markers carry only the `markers` flag: no clip, track or audio
// subscriber wakes for them.
import type { Draft } from "immer";
import type { Frame, Marker, Project } from "../document/types.js";
import type { Command } from "./command.js";

/** Longest marker label kept (as for clip names). */
export const MAX_MARKER_LABEL = 255;

/** Marker fields an edit may set. */
export type MarkerPatch = Partial<Pick<Marker, "label" | "color" | "frame">>;

/** Index at which a marker at `frame` goes: after every marker at or before it. */
function sortedIndex(markers: readonly Marker[], frame: Frame): number {
  let lo = 0;
  let hi = markers.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((markers[mid] as Marker).frame <= frame) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function findIndex(draft: Draft<Project>, markerId: string, commandId: string): number {
  const at = draft.markers.findIndex((marker) => marker.id === markerId);
  if (at === -1) throw new Error(`${commandId}: marker ${markerId} does not exist`);
  return at;
}

export function addMarker(marker: Marker): Command {
  return {
    id: "marker.add",
    label: "Add marker",
    affects: ["markers"],
    run(draft) {
      if (draft.markers.some((m) => m.id === marker.id)) throw new Error(`marker.add: marker ${marker.id} already exists`);
      draft.markers.splice(sortedIndex(draft.markers, marker.frame), 0, { ...marker });
    },
  };
}

/** The undo label of an edit: what it changes. */
function patchLabel(patch: MarkerPatch): string {
  const keys = Object.keys(patch);
  if (keys.length !== 1) return "Edit marker";
  if ("frame" in patch) return "Move marker";
  if ("label" in patch) return "Rename marker";
  return "Color marker";
}

/** Sets marker fields; a new frame moves the marker to its sorted place. */
export function updateMarker(markerId: string, patch: MarkerPatch, options: { label?: string } = {}): Command {
  return {
    id: "marker.update",
    label: options.label ?? patchLabel(patch),
    affects: ["markers"],
    run(draft) {
      const at = findIndex(draft, markerId, "marker.update");
      const marker = draft.markers[at] as Draft<Marker>;
      const from = marker.frame;
      Object.assign(marker, patch);
      if (marker.frame === from) return;
      const [moved] = draft.markers.splice(at, 1);
      draft.markers.splice(sortedIndex(draft.markers, (moved as Marker).frame), 0, moved as Draft<Marker>);
    },
  };
}

/** Removes a marker (an unknown id changes nothing). */
export function removeMarker(markerId: string): Command {
  return {
    id: "marker.remove",
    label: "Delete marker",
    affects: ["markers"],
    run(draft) {
      const at = draft.markers.findIndex((marker) => marker.id === markerId);
      if (at !== -1) draft.markers.splice(at, 1);
    },
  };
}
