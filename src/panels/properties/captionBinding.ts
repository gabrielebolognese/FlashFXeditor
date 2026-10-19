// Number field bindings of the Caption style section (spec §11, §10.5, P1, P2): like the Text section's
// (textBinding.ts) over the caption track's style, or, in the Selected scope (spec §20.3), over the
// selected cues' own styles. A typed value sets it (one command), arrow steps coalesce into one undo
// step, a label scrub shows live (`liveEdit.captionStyles` for the track, `liveEdit.cueStyles` for cues:
// the preview draws the cue in it, no React render), then one command on release. On cues an edit
// writes only the fields it changes into their overrides (text/captions.ts `overrideWith`); each cue
// steps from its own value, as text clips do.
import type { CaptionClip, CaptionStyle, ClipId, Project, TrackId } from "../../core/document/types.js";
import type { Store } from "../../core/store/createStore.js";
import type { DocumentStore } from "../../core/store/DocumentStore.js";
import { CAPTION_LIMITS, overrideWith } from "../../text/captions.js";
import { captionStyleOf, cueStyleOf, setCaptionStyle, setCueStyles, type CueStyle } from "../../timeline/edit/captions.js";
import { isClipLocked } from "../../timeline/model/queries.js";
import { roundTo, type NumberBinding } from "../../ui/NumberField.js";
import { patchLive, type LiveEdit } from "../../app/liveEdit.js";
import { shared } from "./context.js";
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

export const CAPTION_X: CaptionNumberProp = { id: "x", label: "Move captions", precision: 0, ...CAPTION_LIMITS.x, read: (s) => s.x, write: (s, x) => ({ ...s, x }) };
export const CAPTION_Y: CaptionNumberProp = { id: "y", label: "Move captions", precision: 0, ...CAPTION_LIMITS.y, read: (s) => s.y, write: (s, y) => ({ ...s, y }) };
export const CAPTION_MAX_WIDTH: CaptionNumberProp = { id: "maxWidth", label: "Change caption width", precision: 0, ...CAPTION_LIMITS.maxWidth, read: (s) => s.maxWidth, write: (s, maxWidth) => ({ ...s, maxWidth }) };
export const CAPTION_MAX_LINES: CaptionNumberProp = { id: "maxLines", label: "Change caption lines", precision: 0, ...CAPTION_LIMITS.maxLines, read: (s) => s.maxLines, write: (s, maxLines) => ({ ...s, maxLines }) };

export interface CaptionBindingDeps {
  document: Pick<DocumentStore, "getState" | "subscribe" | "dispatch">;
  live: Store<LiveEdit>;
}

/** What the Caption style section edits (spec §20.3): the track's style (`All cues`), or the selected cues' own (`Selected`). */
export type CaptionTarget = { kind: "track"; trackId: TrackId } | { kind: "cues"; trackId: TrackId; cueIds: readonly ClipId[] };

/** The unlocked cues among `ids` (in order). */
export function editableCues(project: Project, ids: readonly ClipId[]): CaptionClip[] {
  const out: CaptionClip[] = [];
  for (const id of ids) {
    const clip = project.clips[id];
    if (clip?.kind === "caption" && !isClipLocked(project, id)) out.push(clip);
  }
  return out;
}

/**
 * The cues' own styles after `change` (each from its effective style), as `setCueStyles` takes them:
 * only what `change` changes becomes the cue's own; the preset link stays.
 */
export function cueStylesAfter(project: Project, cues: readonly CaptionClip[], change: (style: CaptionStyle, cue: CaptionClip) => CaptionStyle): Map<ClipId, CueStyle> {
  const styles = new Map<ClipId, CueStyle>();
  for (const cue of cues) {
    const before = cueStyleOf(project, cue);
    styles.set(cue.id, { styleOverride: overrideWith(cue.styleOverride, before, change(before, cue)), presetId: cue.presetId });
  }
  return styles;
}

/** The cues' effective styles after `change`: their live look (a scrub, a color dragged). */
export function liveCueStyles(project: Project, cues: readonly CaptionClip[], change: (style: CaptionStyle, cue: CaptionClip) => CaptionStyle): Map<ClipId, CaptionStyle> {
  return new Map(cues.map((cue) => [cue.id, change(cueStyleOf(project, cue), cue)]));
}

export function captionBinding(deps: CaptionBindingDeps, prop: CaptionNumberProp, target: CaptionTarget): NumberBinding {
  const clamp = (value: number) => roundTo(Math.min(prop.max, Math.max(prop.min, value)), prop.precision);
  const { trackId } = target;
  const trackStyle = () => captionStyleOf(deps.document.getState(), trackId);
  const cues = () => (target.kind === "cues" ? editableCues(deps.document.getState(), target.cueIds) : []);
  const commit = (delta: number | null, value: number, coalesceKey?: string) => {
    const project = deps.document.getState();
    const options = { label: prop.label, ...(coalesceKey !== undefined && { coalesceKey }) };
    const next = (style: CaptionStyle) => prop.write(style, clamp(delta === null ? value : prop.read(style) + delta));
    const command = target.kind === "track" ? setCaptionStyle(project, trackId, next(trackStyle()), options) : setCueStyles(project, cueStylesAfter(project, cues(), next), options);
    if (command) deps.document.dispatch(command);
  };
  const clearLive = () => patchLive(deps.live, target.kind === "track" ? { captionStyles: null } : { cueStyles: null });
  return {
    read() {
      const live = deps.live.getState();
      if (target.kind === "track") return roundTo(prop.read(live.captionStyles?.get(trackId) ?? trackStyle()), prop.precision);
      const project = deps.document.getState();
      const values = editableCues(project, target.cueIds).map((cue) => roundTo(prop.read(live.cueStyles?.get(cue.id) ?? cueStyleOf(project, cue)), prop.precision));
      const value = shared(values, (v) => v);
      return value && !value.mixed ? value.value : null;
    },
    subscribe(listener) {
      const stops = [deps.document.subscribe(() => listener(), { affects: ["captions", "clips"] }), deps.live.subscribe(() => listener())];
      return () => {
        for (const stop of stops) stop();
      };
    },
    set(value) {
      commit(null, value);
    },
    change(delta, phase) {
      switch (phase) {
        case "scrub":
          if (target.kind === "track") patchLive(deps.live, { captionStyles: new Map([[trackId, prop.write(trackStyle(), clamp(prop.read(trackStyle()) + delta))]]) });
          else patchLive(deps.live, { cueStyles: liveCueStyles(deps.document.getState(), cues(), (style) => prop.write(style, clamp(prop.read(style) + delta))) });
          return;
        case "step":
          commit(delta, 0, `properties.caption.${prop.id}`);
          return;
        case "commit":
          commit(delta, 0);
          clearLive();
          return;
        case "cancel":
          clearLive();
      }
    },
  };
}
