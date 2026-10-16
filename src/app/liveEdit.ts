// Ephemeral values of a properties panel gesture (spec §11, P2): while a number field's label is
// scrubbed (clip transforms, opacities) or the color picker is dragged (the project background), the
// new values live here, not in the document; the preview and the canvas gizmo draw them
// (previewController invalidates both on every change), and the release commits one command.
import type { ClipId, RGBA, Transform } from "../core/document/types.js";
import { createStore } from "../core/store/createStore.js";

export interface LiveEdit {
  transforms: ReadonlyMap<ClipId, Transform> | null;
  opacities: ReadonlyMap<ClipId, number> | null;
  background: RGBA | null;
}

export const NO_LIVE_EDIT: LiveEdit = { transforms: null, opacities: null, background: null };

export const liveEdit = createStore<LiveEdit>(NO_LIVE_EDIT);
