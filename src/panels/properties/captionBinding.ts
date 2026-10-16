// Number field bindings of the Caption style section (spec §11, §10.5, P1, P2): like the Text section's
// (textBinding.ts) over the caption track's style. A typed value sets it (one command), arrow steps
// coalesce into one undo step, a label scrub shows live (`liveEdit.captionStyles`: the preview draws the
// cue in it, no React render), then one command on release.
import type { CaptionStyle, TrackId } from "../../core/document/types.js";
import type { Store } from "../../core/store/createStore.js";
import type { DocumentStore } from "../../core/store/DocumentStore.js";
import { CAPTION_LIMITS } from "../../text/captions.js";
import { captionStyleOf, setCaptionStyle } from "../../timeline/edit/captions.js";
import { roundTo, type NumberBinding } from "../../ui/NumberField.js";
import { patchLive, type LiveEdit } from "../../app/liveEdit.js";
import type { TextNumberProp } from "./textProps.js";

export interface CaptionNumberProp {
  /** Stable id (the coalesce key of arrow steps). */
  id: string;
  label: string;
  precision: number;
  min: number;
  max: number;
  read(style: CaptionStyle): number;
  write(style: CaptionStyle, value: number): CaptionStyle;
}

/** A Text section style property as a caption style property (its text style). */
export function captionTextProp(prop: TextNumberProp): CaptionNumberProp {
  const style = prop.style;
  if (!style) throw new Error(`captionTextProp: ${prop.id} is not a style property`);
  return { id: `text.${prop.id}`, label: prop.label, precision: prop.precision, min: prop.min, max: prop.max, read: (s) => style.read(s.text), write: (s, value) => ({ ...s, text: style.write(s.text, value) }) };
}

export const CAPTION_Y: CaptionNumberProp = { id: "y", label: "Move captions", precision: 0, ...CAPTION_LIMITS.y, read: (s) => s.y, write: (s, y) => ({ ...s, y }) };
export const CAPTION_MAX_WIDTH: CaptionNumberProp = { id: "maxWidth", label: "Change caption width", precision: 0, ...CAPTION_LIMITS.maxWidth, read: (s) => s.maxWidth, write: (s, maxWidth) => ({ ...s, maxWidth }) };
export const CAPTION_MAX_LINES: CaptionNumberProp = { id: "maxLines", label: "Change caption lines", precision: 0, ...CAPTION_LIMITS.maxLines, read: (s) => s.maxLines, write: (s, maxLines) => ({ ...s, maxLines }) };

export interface CaptionBindingDeps {
  document: Pick<DocumentStore, "getState" | "subscribe" | "dispatch">;
  live: Store<LiveEdit>;
}

export function captionBinding(deps: CaptionBindingDeps, prop: CaptionNumberProp, trackId: TrackId): NumberBinding {
  const clamp = (value: number) => roundTo(Math.min(prop.max, Math.max(prop.min, value)), prop.precision);
  const style = () => captionStyleOf(deps.document.getState(), trackId);
  const commit = (value: number, coalesceKey?: string) => {
    const command = setCaptionStyle(deps.document.getState(), trackId, prop.write(style(), clamp(value)), { label: prop.label, ...(coalesceKey !== undefined && { coalesceKey }) });
    if (command) deps.document.dispatch(command);
  };
  const clearLive = () => patchLive(deps.live, { captionStyles: null });
  return {
    read() {
      const shown = deps.live.getState().captionStyles?.get(trackId) ?? style();
      return roundTo(prop.read(shown), prop.precision);
    },
    subscribe(listener) {
      const stops = [deps.document.subscribe(() => listener(), { affects: ["captions"] }), deps.live.subscribe(() => listener())];
      return () => {
        for (const stop of stops) stop();
      };
    },
    set(value) {
      commit(value);
    },
    change(delta, phase) {
      const value = prop.read(style()) + delta;
      switch (phase) {
        case "scrub":
          patchLive(deps.live, { captionStyles: new Map([[trackId, prop.write(style(), clamp(value))]]) });
          return;
        case "step":
          commit(value, `properties.caption.${prop.id}`);
          return;
        case "commit":
          commit(value);
          clearLive();
          return;
        case "cancel":
          clearLive();
      }
    },
  };
}
