// The number properties of the Transform and Opacity sections (spec §11), in field units: position in
// project px from the frame center (the document's own numbers), scale and anchor in %, rotation in
// degrees, opacity in %. Each reads one property path of a layer clip and writes it back as a new
// transform or opacity; the scale pair keeps its aspect while locked; the anchor moves without moving
// the picture (the gizmo's Alt anchor drag, §7.3). Pure: the bindings (bindings.ts) apply them.
import type { Project, Transform } from "../../core/document/types.js";
import { layerContent, scaleYOf, withAnchor, type LayerClip } from "../../timeline/edit/transform.js";

export type LayerChange = { kind: "transform"; transform: Transform } | { kind: "opacity"; opacity: number };

export interface LayerNumberProp {
  /** Stable id (the coalesce key of arrow steps). */
  id: "x" | "y" | "scaleX" | "scaleY" | "rotation" | "anchorX" | "anchorY" | "opacity";
  /** Undo history label. */
  label: string;
  precision: number;
  min?: number;
  max?: number;
  read(clip: LayerClip): number;
  /** The clip's change for `value` (field units). */
  write(clip: LayerClip, value: number, project: Project): LayerChange;
}

/** Scale limits in % (the gizmo stops at 1%, §7.3). */
export const MIN_SCALE_PERCENT = 1;
export const MAX_SCALE_PERCENT = 10_000;

const transform = (next: Transform): LayerChange => ({ kind: "transform", transform: next });

/** The content size the anchor fractions refer to (the whole content, crop included, as the gizmo). */
function contentSize(project: Project, clip: LayerClip): { width: number; height: number } {
  const box = layerContent(project, clip);
  return box ? { width: box.width, height: box.height } : { width: 0, height: 0 };
}

export const POSITION_X: LayerNumberProp = {
  id: "x",
  label: "Change position",
  precision: 1,
  read: (clip) => clip.transform.x,
  write: (clip, value) => transform({ ...clip.transform, x: value }),
};

export const POSITION_Y: LayerNumberProp = {
  id: "y",
  label: "Change position",
  precision: 1,
  read: (clip) => clip.transform.y,
  write: (clip, value) => transform({ ...clip.transform, y: value }),
};

/** Width or height scale; with `locked` the other axis follows by the same factor (the aspect stays). */
export function scaleProp(axis: "x" | "y", locked: boolean): LayerNumberProp {
  return {
    id: axis === "x" ? "scaleX" : "scaleY",
    label: "Change scale",
    precision: 1,
    min: MIN_SCALE_PERCENT,
    max: MAX_SCALE_PERCENT,
    read: (clip) => (axis === "x" ? clip.transform.scale : scaleYOf(clip.transform)) * 100,
    write(clip, value) {
      const t = clip.transform;
      const sx = t.scale;
      const sy = scaleYOf(t);
      const next = value / 100;
      if (axis === "x") {
        const k = sx > 0 ? next / sx : 1;
        return transform({ ...t, scale: next, scaleY: locked ? (sx > 0 ? sy * k : next) : sy });
      }
      const k = sy > 0 ? next / sy : 1;
      return transform({ ...t, scale: locked ? (sy > 0 ? sx * k : next) : sx, scaleY: next });
    },
  };
}

export const ROTATION: LayerNumberProp = {
  id: "rotation",
  label: "Change rotation",
  precision: 1,
  read: (clip) => clip.transform.rotation,
  write: (clip, value) => transform({ ...clip.transform, rotation: value }),
};

export const ANCHOR_X: LayerNumberProp = {
  id: "anchorX",
  label: "Change anchor",
  precision: 1,
  read: (clip) => clip.transform.anchor.x * 100,
  write: (clip, value, project) => transform(withAnchor(clip.transform, contentSize(project, clip), { x: value / 100, y: clip.transform.anchor.y })),
};

export const ANCHOR_Y: LayerNumberProp = {
  id: "anchorY",
  label: "Change anchor",
  precision: 1,
  read: (clip) => clip.transform.anchor.y * 100,
  write: (clip, value, project) => transform(withAnchor(clip.transform, contentSize(project, clip), { x: clip.transform.anchor.x, y: value / 100 })),
};

export const OPACITY: LayerNumberProp = {
  id: "opacity",
  label: "Change opacity",
  precision: 1,
  min: 0,
  max: 100,
  read: (clip) => clip.opacity * 100,
  write: (_clip, value) => ({ kind: "opacity", opacity: value / 100 }),
};
