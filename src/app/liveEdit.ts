// Ephemeral values of a properties panel gesture (spec §11, P2): while a number field's label is
// scrubbed (clip transforms, opacities, crops) or the color picker is dragged (the project background),
// the new values live here, not in the document; the preview and the canvas gizmo draw them
// (previewController invalidates both on every change), and the release commits one command. A crop
// handle drag on the canvas (§7.3) writes its crops here too, so the Crop fields follow it live.
import type { ClipId, Crop, RGBA, Transform } from "../core/document/types.js";
import { createStore } from "../core/store/createStore.js";

export interface LiveEdit {
  transforms: ReadonlyMap<ClipId, Transform> | null;
  opacities: ReadonlyMap<ClipId, number> | null;
  crops: ReadonlyMap<ClipId, Crop> | null;
  background: RGBA | null;
}

export const NO_LIVE_EDIT: LiveEdit = { transforms: null, opacities: null, crops: null, background: null };

export const liveEdit = createStore<LiveEdit>(NO_LIVE_EDIT);

/** Sets or clears (null) the live crops, keeping the other live values; NO_LIVE_EDIT once nothing is live. */
export function setLiveCrops(crops: ReadonlyMap<ClipId, Crop> | null): void {
  const current = liveEdit.getState();
  if (current.crops === crops) return;
  const next = { ...current, crops };
  liveEdit.set(next.transforms === null && next.opacities === null && next.crops === null && next.background === null ? NO_LIVE_EDIT : next);
}
