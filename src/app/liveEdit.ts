// Ephemeral values of a properties panel gesture (spec §11, P2): while a number field's label is
// scrubbed (clip transforms, opacities, crops, text styles) or the color picker is dragged (the project
// background, a text color), the new values live here, not in the document; the preview and the
// canvas gizmo draw them (previewController invalidates both on every change), and the release
// commits one command. A crop handle drag on the canvas (§7.3) writes its crops here too, so the Crop
// fields follow it live. An Animation field scrub (§10.4) gives the text clips' animations. The cue list
// (§10.5) gives the text of the cue being typed, a Caption style field scrub the caption track's style
// (or, in the Selected scope, the selected cues' own styles: spec §20.3).
// A Solid field scrub or a fill color dragged (Batch 34) gives the solids' looks.
import type { CaptionStyle, ClipId, Crop, RGBA, TrackId, Transform } from "../core/document/types.js";
import { createStore, type Store } from "../core/store/createStore.js";
import type { LiveAnims, LiveText } from "../render/compositor/Compositor.js";
import type { SolidLook } from "../timeline/edit/solid.js";

export interface LiveEdit {
  transforms: ReadonlyMap<ClipId, Transform> | null;
  opacities: ReadonlyMap<ClipId, number> | null;
  crops: ReadonlyMap<ClipId, Crop> | null;
  /** Text clips' content and style (a Text field scrub, a text color dragged). */
  texts: ReadonlyMap<ClipId, LiveText> | null;
  /** Text clips' animations (an Animation field scrub). */
  anims: ReadonlyMap<ClipId, LiveAnims> | null;
  /** Cue texts being typed in the cue list. */
  cues: ReadonlyMap<ClipId, string> | null;
  /** Caption track styles (a Caption style field scrub, a color dragged, a preset hovered). */
  captionStyles: ReadonlyMap<TrackId, CaptionStyle> | null;
  /** Cues' effective styles (a Selected scope field scrub, a color dragged, a preset hovered over selected cues; spec §20.3). */
  cueStyles: ReadonlyMap<ClipId, CaptionStyle> | null;
  /** Solids' looks (a Solid field scrub, a fill color dragged). */
  solids: ReadonlyMap<ClipId, SolidLook> | null;
  background: RGBA | null;
}

export const NO_LIVE_EDIT: LiveEdit = { transforms: null, opacities: null, crops: null, texts: null, anims: null, cues: null, captionStyles: null, cueStyles: null, solids: null, background: null };

export const liveEdit = createStore<LiveEdit>(NO_LIVE_EDIT);

/** `patch` over the live values of `store`; NO_LIVE_EDIT once nothing is live. */
export function patchLive(store: Store<LiveEdit>, patch: Partial<LiveEdit>): void {
  const current = store.getState();
  const next = { ...current, ...patch };
  if (Object.keys(patch).every((key) => current[key as keyof LiveEdit] === next[key as keyof LiveEdit])) return;
  store.set(Object.values(next).every((value) => value === null) ? NO_LIVE_EDIT : next);
}

/** `patch` over the live values; NO_LIVE_EDIT once nothing is live. */
export function patchLiveEdit(patch: Partial<LiveEdit>): void {
  patchLive(liveEdit, patch);
}

/** Sets or clears (null) the live crops, keeping the other live values; NO_LIVE_EDIT once nothing is live. */
export function setLiveCrops(crops: ReadonlyMap<ClipId, Crop> | null): void {
  patchLiveEdit({ crops });
}
