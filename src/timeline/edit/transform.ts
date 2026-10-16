// Layer transforms (spec §5.2 `Transform`, §7.2, §7.3): the content box a clip's transform applies to,
// points of it in project px, the transform commands of the canvas gizmo and the one-click transforms.
// - The content box is what the compositor draws a layer from: the media as shown (rotation metadata
//   applied, `width` x `height` px) or the solid's size, and the visible part of it after the crop
//   (crop fractions cut the shown media: `left` always cuts the visible left side).
// - `layerPoint` is the compositor's model (`writeModel`): the anchor (fractions of the content) goes
//   to the frame center plus (x, y), scaled (`scaleY` for the vertical axis) and rotated clockwise.
//   Flips mirror the picture inside its box and move no point of it.
// - Commands: `setTransforms` writes new transforms (one undo step for a whole gesture, spec P2);
//   `nudgeLayers` moves by whole px and coalesces consecutive nudges (§7.3 arrow keys).
// - Fit / Fill / Center / Flip / Reset (§7.2 menu, §11 quick row) are pure functions; `quickTransforms`
//   applies one to the selected layers as one command. `withAnchor` moves the anchor, not the picture.
import type { Draft } from "immer";
import type { Command } from "../../core/commands/command.js";
import type { Clip, ClipId, MediaClip, Project, SolidClip, TextClip, Transform } from "../../core/document/types.js";
import { isRgba } from "../../core/document/color.js";
import { displaySize } from "../../media/probe/rotation.js";
import { isClipLocked } from "../model/queries.js";
import { defaultTransform } from "./insertMedia.js";

/** Clips drawn on the canvas with a transform (spec §5.2): video, image, solid and text (`isLayerClip`; audio clips carry one but draw nothing). */
export type LayerClip = MediaClip | TextClip | SolidClip;

export function isLayerClip(clip: Clip): clip is LayerClip {
  return clip.kind === "video" || clip.kind === "image" || clip.kind === "solid" || clip.kind === "text";
}

/** A layer's content in its own px (the transform's input) and the visible part of it. */
export interface ContentBox {
  width: number;
  height: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** The transform of a clip that has no media to fit (solids, text): centered, native size. */
export const IDENTITY_TRANSFORM: Transform = { x: 0, y: 0, scale: 1, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false };

const clamp01 = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

/**
 * The content box of a layer, or null when the compositor draws nothing for it (media without a
 * size, everything cropped away, solid shapes it cannot draw yet, text before Batch 28).
 */
export function layerContent(project: Project, clip: Clip): ContentBox | null {
  if (clip.kind === "video" || clip.kind === "image") {
    const item = project.media[clip.mediaId];
    if (!item?.width || !item.height) return null;
    const { width, height } = displaySize(item.width, item.height, item.rotation);
    const left = clamp01(clip.crop.left) * width;
    const right = (1 - clamp01(clip.crop.right)) * width;
    const top = clamp01(clip.crop.top) * height;
    const bottom = (1 - clamp01(clip.crop.bottom)) * height;
    return right > left && bottom > top ? { width, height, left, top, right, bottom } : null;
  }
  if (clip.kind === "solid") {
    // TODO(batch 34): rounded rects, ellipses, lines and gradients (the compositor draws rects only).
    const { w, h } = clip.size;
    if (clip.shape !== "rect" || !isRgba(clip.fill) || !(w > 0) || !(h > 0)) return null;
    return { width: w, height: h, left: 0, top: 0, right: w, bottom: h };
  }
  // TODO(batch 28): text layers hit on their glyph bounds padded by 4 px (§7.2).
  return null;
}

/** Sine and cosine of a clockwise rotation in degrees, exact on quarter turns (as the compositor). */
export function rotationTrig(degrees: number): { sin: number; cos: number } {
  const turns = ((degrees % 360) + 360) % 360;
  if (turns % 90 === 0) return { sin: turns === 90 ? 1 : turns === 270 ? -1 : 0, cos: turns === 0 ? 1 : turns === 180 ? -1 : 0 };
  const rad = (degrees * Math.PI) / 180;
  return { sin: Math.sin(rad), cos: Math.cos(rad) };
}

/** The vertical scale of a transform. */
export const scaleYOf = (transform: Transform): number => transform.scaleY ?? transform.scale;

/** Content point (`qx`, `qy`) of a `box`-sized layer under `transform`, in project px from the frame's top-left. */
export function layerPoint(transform: Transform, box: Size, frame: Size, qx: number, qy: number): Point {
  const { sin, cos } = rotationTrig(transform.rotation);
  const dx = (qx - transform.anchor.x * box.width) * transform.scale;
  const dy = (qy - transform.anchor.y * box.height) * scaleYOf(transform);
  return { x: frame.width / 2 + transform.x + cos * dx - sin * dy, y: frame.height / 2 + transform.y + sin * dx + cos * dy };
}

/** The visible box's corners in project px: top-left, top-right, bottom-right, bottom-left (of the content). */
export function layerCorners(transform: Transform, box: ContentBox, frame: Size): [Point, Point, Point, Point] {
  return [
    layerPoint(transform, box, frame, box.left, box.top),
    layerPoint(transform, box, frame, box.right, box.top),
    layerPoint(transform, box, frame, box.right, box.bottom),
    layerPoint(transform, box, frame, box.left, box.bottom),
  ];
}

/** `transform` as stored: `scaleY` only when it differs from `scale`. */
export function normalizeTransform(transform: Transform): Transform {
  const { scaleY, ...rest } = transform;
  const next: Transform = { ...rest, anchor: { x: transform.anchor.x, y: transform.anchor.y } };
  if (scaleY !== undefined && scaleY !== transform.scale) next.scaleY = scaleY;
  return next;
}

export function sameTransform(a: Transform, b: Transform): boolean {
  return (
    a.x === b.x &&
    a.y === b.y &&
    a.scale === b.scale &&
    scaleYOf(a) === scaleYOf(b) &&
    a.rotation === b.rotation &&
    a.anchor.x === b.anchor.x &&
    a.anchor.y === b.anchor.y &&
    a.flipH === b.flipH &&
    a.flipV === b.flipV
  );
}

const finite = (t: Transform) => [t.x, t.y, t.scale, scaleYOf(t), t.rotation, t.anchor.x, t.anchor.y].every(Number.isFinite);

/**
 * Writes `changes` (new transforms by clip id) as one command `clip.transform` (one undo step: a whole
 * gizmo gesture, spec P2). Clips that are gone, locked, not layers, unchanged or given a non-finite
 * transform are skipped; null when nothing changes. Affects only the composite (§3.4).
 */
export function setTransforms(project: Project, changes: ReadonlyMap<ClipId, Transform>, options: { label: string; coalesceKey?: string }): Command | null {
  const writes: [ClipId, Transform][] = [];
  for (const [id, transform] of changes) {
    const clip = project.clips[id];
    if (!clip || !isLayerClip(clip) || isClipLocked(project, id) || !finite(transform) || sameTransform(clip.transform, transform)) continue;
    writes.push([id, normalizeTransform(transform)]);
  }
  if (writes.length === 0) return null;
  return {
    id: "clip.transform",
    label: options.label,
    ...(options.coalesceKey !== undefined && { coalesceKey: options.coalesceKey }),
    affects: ["composite"],
    run(draft) {
      // TODO(batch 35): a property with keyframes gets its keyframe at the playhead updated or created instead (§7.3, §11).
      for (const [id, transform] of writes) (draft.clips[id] as Draft<LayerClip>).transform = structuredClone(transform);
    },
  };
}

/** Arrow keys on the canvas (spec §7.3): the layers move by (`dx`, `dy`) project px; consecutive nudges are one undo step. */
export function nudgeLayers(project: Project, ids: readonly ClipId[], dx: number, dy: number): Command | null {
  const changes = new Map<ClipId, Transform>();
  for (const id of ids) {
    const clip = project.clips[id];
    if (clip && isLayerClip(clip)) changes.set(id, { ...clip.transform, x: clip.transform.x + dx, y: clip.transform.y + dy });
  }
  return setTransforms(project, changes, { label: changes.size === 1 ? "Nudge layer" : "Nudge layers", coalesceKey: "canvas.nudge" });
}

/** The visible box's size at scale 1 when turned by `rotation` (its axis-aligned extent). */
function turnedExtent(box: ContentBox, rotation: number): Size {
  const { sin, cos } = rotationTrig(rotation);
  const w = box.right - box.left;
  const h = box.bottom - box.top;
  return { width: Math.abs(cos) * w + Math.abs(sin) * h, height: Math.abs(sin) * w + Math.abs(cos) * h };
}

/** `transform` moved so the visible box's center sits on the frame center (§7.2 Center). */
export function centerTransform(transform: Transform, box: ContentBox, frame: Size): Transform {
  const center = layerPoint(transform, box, frame, (box.left + box.right) / 2, (box.top + box.bottom) / 2);
  return { ...transform, x: transform.x + frame.width / 2 - center.x, y: transform.y + frame.height / 2 - center.y };
}

/** Uniform scale at which the visible box, as turned, is contained in the frame (§7.2 Fit), centered. */
export function fitTransform(transform: Transform, box: ContentBox, frame: Size): Transform {
  const extent = turnedExtent(box, transform.rotation);
  const scale = Math.min(frame.width / extent.width, frame.height / extent.height);
  return centerTransform(normalizeTransform({ ...transform, scale, scaleY: scale }), box, frame);
}

/** Uniform scale at which the visible box, as turned, covers the frame (§7.2 Fill), centered. */
export function fillTransform(transform: Transform, box: ContentBox, frame: Size): Transform {
  const extent = turnedExtent(box, transform.rotation);
  const scale = Math.max(frame.width / extent.width, frame.height / extent.height);
  return centerTransform(normalizeTransform({ ...transform, scale, scaleY: scale }), box, frame);
}

/** Mirrors the picture horizontally or vertically inside its box (§7.2 Flip H / Flip V). */
export function flipTransform(transform: Transform, axis: "h" | "v"): Transform {
  return axis === "h" ? { ...transform, flipH: !transform.flipH } : { ...transform, flipV: !transform.flipV };
}

/** The transform a newly placed clip gets (§7.2 Reset transform): media at Fit (spec §6.19), others centered at native size. */
export function resetTransform(project: Project, clip: LayerClip): Transform {
  if (clip.kind === "video" || clip.kind === "image") {
    const item = project.media[clip.mediaId];
    if (item) return defaultTransform(item, project.settings);
  }
  return structuredClone(IDENTITY_TRANSFORM);
}

/**
 * `transform` with its anchor (fractions of the `size` content) at `anchor`, the position moved so
 * the picture stays where it is (the gizmo's Alt anchor drag, §7.3; the properties Anchor fields, §11).
 */
export function withAnchor(transform: Transform, size: Size, anchor: Point): Transform {
  const { sin, cos } = rotationTrig(transform.rotation);
  const dx = (anchor.x - transform.anchor.x) * size.width * transform.scale;
  const dy = (anchor.y - transform.anchor.y) * size.height * scaleYOf(transform);
  return { ...transform, anchor: { x: anchor.x, y: anchor.y }, x: transform.x + cos * dx - sin * dy, y: transform.y + sin * dx + cos * dy };
}

/** The one-click transforms of the canvas menu and the properties quick row (spec §7.2, §11, §17). */
export type QuickTransform = "fit" | "fill" | "center" | "flipH" | "flipV" | "reset";

const QUICK_LABELS: Record<QuickTransform, readonly [one: string, many: string]> = {
  fit: ["Fit layer", "Fit layers"],
  fill: ["Fill frame", "Fill frame"],
  center: ["Center layer", "Center layers"],
  flipH: ["Flip horizontal", "Flip horizontal"],
  flipV: ["Flip vertical", "Flip vertical"],
  reset: ["Reset transform", "Reset transforms"],
};

/**
 * `action` on the layer clips among `ids` as one command `clip.transform` (one undo step), or null when
 * nothing changes. Fit, Fill and Center skip layers with no content box (nothing drawn to fit); locked
 * clips are skipped by `setTransforms`.
 */
export function quickTransforms(project: Project, ids: Iterable<ClipId>, action: QuickTransform): Command | null {
  const frame = project.settings;
  const changes = new Map<ClipId, Transform>();
  for (const id of ids) {
    const clip = project.clips[id];
    if (!clip || !isLayerClip(clip)) continue;
    const transform = clip.transform;
    if (action === "flipH" || action === "flipV") changes.set(id, flipTransform(transform, action === "flipH" ? "h" : "v"));
    else if (action === "reset") changes.set(id, resetTransform(project, clip));
    else {
      const box = layerContent(project, clip);
      if (!box) continue;
      changes.set(id, action === "fit" ? fitTransform(transform, box, frame) : action === "fill" ? fillTransform(transform, box, frame) : centerTransform(transform, box, frame));
    }
  }
  const [one, many] = QUICK_LABELS[action];
  return setTransforms(project, changes, { label: changes.size === 1 ? one : many });
}
