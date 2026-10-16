// Crop (spec §5.2 `Crop`, §11 Crop section, §7.3 crop handles, §9.4 crop UV): the visible part of a
// video or image layer, as fractions of the media as shown (rotation metadata applied, flips too:
// `left` always cuts the visible left side, so flipping never moves a crop edge on screen).
// - Pure helpers in media px: the visible rectangle of a crop and back, clamps that always leave at
//   least MIN_CROP_PX on each axis (a crop never hides a layer), one edge set with or without the
//   aspect lock (the other axis follows around its center, shifted to stay inside the media).
// - Crop to frame: the crop that makes the visible area the project frame at the current transform
//   (the transform does not change). When the layer covers the frame that is the frame exactly;
//   otherwise the largest area with the frame's aspect inside the part of the frame the layer covers,
//   so Fill then fills the frame with it exactly (Batch 26 acceptance 1). Computed in the layer's
//   scaled axes (content px times scale / scaleY), where the frame is a rectangle turned by the
//   layer's rotation; the frame's aspect follows the nearest quarter turn.
// - Commands: `setCrops` writes new crops (one undo step for a whole gesture, spec P2); `quickCrops`
//   resets the selected layers' crops or crops them to the frame, one command.
import type { Draft } from "immer";
import type { Command } from "../../core/commands/command.js";
import type { Clip, ClipId, Crop, MediaClip, Project, Transform } from "../../core/document/types.js";
import { displaySize } from "../../media/probe/rotation.js";
import { isClipLocked } from "../model/queries.js";
import { rotationTrig, scaleYOf, type Size } from "./transform.js";

export const NO_CROP: Crop = { left: 0, top: 0, right: 0, bottom: 0 };

/** The smallest visible part a crop leaves on each axis, in media px. */
export const MIN_CROP_PX = 1;

export type CropEdge = "left" | "top" | "right" | "bottom";

/** Clips with a crop on the canvas: video and image (audio clips carry one but draw nothing). */
export type CropClip = MediaClip & { kind: "video" | "image" };

export function isCropClip(clip: Clip): clip is CropClip {
  return clip.kind === "video" || clip.kind === "image";
}

/** The size the crop fractions of `clip` refer to: its media as shown, or null with no size. */
export function cropSize(project: Project, clip: Clip): Size | null {
  if (!isCropClip(clip)) return null;
  const item = project.media[clip.mediaId];
  if (!item?.width || !item.height) return null;
  return displaySize(item.width, item.height, item.rotation);
}

/** The visible rectangle in media px. */
export interface CropRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function cropRect(crop: Crop, size: Size): CropRect {
  return { left: crop.left * size.width, top: crop.top * size.height, right: (1 - crop.right) * size.width, bottom: (1 - crop.bottom) * size.height };
}

/** Fractions within 1e-9 of 0 are 0 (a crop to the media edge stays exactly uncropped there). */
const tidy = (value: number) => (Math.abs(value) < 1e-9 ? 0 : value);

export function rectCrop(rect: CropRect, size: Size): Crop {
  return { left: tidy(rect.left / size.width), top: tidy(rect.top / size.height), right: tidy(1 - rect.right / size.width), bottom: tidy(1 - rect.bottom / size.height) };
}

export function sameCrop(a: Crop, b: Crop): boolean {
  return a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * `crop` made valid for media of `size`: every fraction in 0..1 and at least MIN_CROP_PX left visible
 * on each axis (the far edge gives way); null when a fraction is not finite.
 */
export function clampCrop(crop: Crop, size: Size): Crop | null {
  if (![crop.left, crop.top, crop.right, crop.bottom].every(Number.isFinite)) return null;
  const mx = Math.min(1, MIN_CROP_PX / size.width);
  const my = Math.min(1, MIN_CROP_PX / size.height);
  const left = clamp(crop.left, 0, 1 - mx);
  const top = clamp(crop.top, 0, 1 - my);
  return { left, top, right: clamp(crop.right, 0, 1 - mx - left), bottom: clamp(crop.bottom, 0, 1 - my - top) };
}

/**
 * Writes `changes` (new crops by clip id) as one command `clip.crop` (one undo step: a whole crop
 * handle drag, spec P2). Clips that are gone, locked, not video or image, unchanged or given a
 * non-finite crop are skipped; crops are clamped (`clampCrop`). Null when nothing changes. Affects
 * only the composite (§3.4).
 */
export function setCrops(project: Project, changes: ReadonlyMap<ClipId, Crop>, options: { label: string; coalesceKey?: string }): Command | null {
  const writes: [ClipId, Crop][] = [];
  for (const [id, value] of changes) {
    const clip = project.clips[id];
    const size = clip ? cropSize(project, clip) : null;
    if (!clip || !isCropClip(clip) || !size || isClipLocked(project, id)) continue;
    const crop = clampCrop(value, size);
    if (crop && !sameCrop(crop, clip.crop)) writes.push([id, crop]);
  }
  if (writes.length === 0) return null;
  return {
    id: "clip.crop",
    label: options.label,
    ...(options.coalesceKey !== undefined && { coalesceKey: options.coalesceKey }),
    affects: ["composite"],
    run(draft) {
      for (const [id, crop] of writes) (draft.clips[id] as Draft<MediaClip>).crop = { ...crop };
    },
  };
}

const HORIZONTAL: ReadonlySet<CropEdge> = new Set(["left", "right"]);

/**
 * `crop` with `edge` set to `value` (a fraction of the media's side), clamped so at least MIN_CROP_PX
 * stays visible. With `lock` the visible aspect (in media px) is kept: the other axis grows or shrinks
 * around its center and shifts to stay inside the media; where it cannot grow further, the edge stops.
 */
export function withCropEdge(crop: Crop, size: Size, edge: CropEdge, value: number, lock: boolean): Crop {
  const rect = cropRect(crop, size);
  const horizontal = HORIZONTAL.has(edge);
  const length = horizontal ? size.width : size.height;
  const other = horizontal ? size.height : size.width;
  const lo = horizontal ? rect.left : rect.top;
  const hi = horizontal ? rect.right : rect.bottom;
  const across0 = horizontal ? rect.top : rect.left;
  const across1 = horizontal ? rect.bottom : rect.right;
  const aspect = (hi - lo) / (across1 - across0);
  const start = edge === "left" || edge === "top";
  const v = Number.isFinite(value) ? value : 0;
  let a = start ? clamp(v * length, 0, hi - MIN_CROP_PX) : lo;
  let b = start ? hi : clamp(length - v * length, lo + MIN_CROP_PX, length);
  let c0 = across0;
  let c1 = across1;
  if (lock && aspect > 0 && Number.isFinite(aspect)) {
    // The other axis follows; it cannot pass the media or drop below the minimum.
    let span = (b - a) / aspect;
    const limited = clamp(span, MIN_CROP_PX, other);
    if (limited !== span) {
      span = limited;
      const along = Math.max(MIN_CROP_PX, span * aspect);
      if (start) a = Math.max(0, b - along);
      else b = Math.min(length, a + along);
    }
    const center = (across0 + across1) / 2;
    c0 = clamp(center - span / 2, 0, other - span);
    c1 = c0 + span;
  }
  const next: CropRect = horizontal ? { left: a, right: b, top: c0, bottom: c1 } : { top: a, bottom: b, left: c0, right: c1 };
  return rectCrop(next, size);
}

/**
 * Crop to frame (spec §11): the crop of media of `size` under `transform` whose visible area is the
 * `frame` (project px), or the largest area with the frame's aspect inside the part of the frame the
 * layer covers. Null when the layer does not reach into the frame (or has no scale).
 */
export function cropToFrame(transform: Transform, size: Size, frame: Size): Crop | null {
  const sx = transform.scale;
  const sy = scaleYOf(transform);
  if (!(sx > 0) || !(sy > 0) || !(size.width > 0) || !(size.height > 0)) return null;
  const { sin, cos } = rotationTrig(transform.rotation);
  // The frame center in the layer's scaled axes (origin at the content's top-left).
  const dx = -transform.x;
  const dy = -transform.y;
  const fx = cos * dx + sin * dy + transform.anchor.x * size.width * sx;
  const fy = -sin * dx + cos * dy + transform.anchor.y * size.height * sy;
  // The frame's aspect along the layer's axes (a quarter turn swaps them).
  const quarter = (((Math.round(transform.rotation / 90) % 4) + 4) % 4) % 2 === 1;
  const aspect = quarter ? frame.height / frame.width : frame.width / frame.height;
  // The largest rectangle of that aspect centered in the (turned) frame.
  const c = Math.abs(cos);
  const s = Math.abs(sin);
  const w0 = Math.min(frame.width / (c + s / aspect), frame.height / (s + c / aspect));
  const h0 = w0 / aspect;
  // Inside the content too.
  const x0 = Math.max(0, fx - w0 / 2);
  const x1 = Math.min(size.width * sx, fx + w0 / 2);
  const y0 = Math.max(0, fy - h0 / 2);
  const y1 = Math.min(size.height * sy, fy + h0 / 2);
  if (x1 - x0 <= 1e-9 || y1 - y0 <= 1e-9) return null;
  const w = Math.min(x1 - x0, (y1 - y0) * aspect);
  const h = w / aspect;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const rect: CropRect = { left: (cx - w / 2) / sx, right: (cx + w / 2) / sx, top: (cy - h / 2) / sy, bottom: (cy + h / 2) / sy };
  return clampCrop(rectCrop(rect, size), size);
}

/** The one-click crop actions of the Crop section (spec §11): Reset and Crop to frame. */
export type QuickCrop = "reset" | "frame";

const QUICK_LABELS: Record<QuickCrop, readonly [one: string, many: string]> = {
  reset: ["Reset crop", "Reset crops"],
  frame: ["Crop to frame", "Crop to frame"],
};

/**
 * `action` on the video and image clips among `ids` as one command `clip.crop`, or null when nothing
 * changes. Crop to frame skips layers that do not reach into the frame; locked clips are skipped.
 */
export function quickCrops(project: Project, ids: Iterable<ClipId>, action: QuickCrop): Command | null {
  const changes = new Map<ClipId, Crop>();
  for (const id of ids) {
    const clip = project.clips[id];
    const size = clip ? cropSize(project, clip) : null;
    if (!clip || !isCropClip(clip) || !size) continue;
    const crop = action === "reset" ? NO_CROP : cropToFrame(clip.transform, size, project.settings);
    if (crop && !sameCrop(crop, clip.crop)) changes.set(id, crop);
  }
  const [one, many] = QUICK_LABELS[action];
  return setCrops(project, changes, { label: changes.size === 1 ? one : many });
}
