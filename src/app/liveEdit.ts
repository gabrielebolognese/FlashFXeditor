// Ephemeral values of a properties panel gesture (spec §11, P2): while a number field's label is
// scrubbed (clip transforms, opacities, crops, text styles) or the color picker is dragged (the project
// background, a text color), the new values live here, not in the document; the preview and the
// canvas gizmo draw them (previewController invalidates both on every change), and the release
// commits one command. A crop handle drag on the canvas (§7.3) writes its crops here too, so the Crop
// fields follow it live. An Animation field scrub (§10.4) gives the text clips' animations.
import type { ClipId, Crop, RGBA, Transform } from "../core/document/types.js";
import { createStore } from "../core/store/createStore.js";
import type { LiveAnims, LiveText } from "../render/compositor/Compositor.js";

export interface LiveEdit {
  transforms: ReadonlyMap<ClipId, Transform> | null;
  opacities: ReadonlyMap<ClipId, number> | null;
  crops: ReadonlyMap<ClipId, Crop> | null;
  /** Text clips' content and style (a Text field scrub, a text color dragged). */
  texts: ReadonlyMap<ClipId, LiveText> | null;
  /** Text clips' animations (an Animation field scrub). */
  anims: ReadonlyMap<ClipId, LiveAnims> | null;
  background: RGBA | null;
}

export const NO_LIVE_EDIT: LiveEdit = { transforms: null, opacities: null, crops: null, texts: null, anims: null, background: null };

export const liveEdit = createStore<LiveEdit>(NO_LIVE_EDIT);

/** `patch` over the live values; NO_LIVE_EDIT once nothing is live. */
export function patchLiveEdit(patch: Partial<LiveEdit>): void {
  const current = liveEdit.getState();
  const next = { ...current, ...patch };
  if (Object.keys(patch).every((key) => current[key as keyof LiveEdit] === next[key as keyof LiveEdit])) return;
  liveEdit.set(next.transforms === null && next.opacities === null && next.crops === null && next.texts === null && next.anims === null && next.background === null ? NO_LIVE_EDIT : next);
}

/** Sets or clears (null) the live crops, keeping the other live values; NO_LIVE_EDIT once nothing is live. */
export function setLiveCrops(crops: ReadonlyMap<ClipId, Crop> | null): void {
  patchLiveEdit({ crops });
}
