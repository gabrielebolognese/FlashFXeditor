// Adapt layout (spec §15): a new frame size that every layer follows by its role, the choice of the
// Change the frame size dialog that is not Keep (app/conversionController.ts). One undo step
// `project.setResolution`; locked tracks follow too (the frame changes under them).
// - Videos and images: one at Fit in the old frame (centered, contained) is at Fit in the new one, one
//   at Fill at Fill; Fit wins when both are the same (a vertical video in a vertical frame goes whole
//   into a horizontal one, with bands). Any other (a picture in picture, a zoomed shot) keeps its size
//   relative to its Fit and the middle of what it shows at the same place relative to the frame.
// - Text and shapes: sized by the frame's short side, as new ones are (TEXT_REFERENCE_SIDE), never
//   past the new frame when they fit the old one, their middle at the same place relative to the frame
//   and back inside it when they were inside the old one. A solid the size of the old frame (a
//   background) takes the new frame's size.
// - Keyed layers: position keys follow the frame each axis, scale keys the layer's ratio.
// - Captions: track styles and cue overrides (text/captions.ts `adaptCaptionStyle`): text sizes by the
//   short side, the wrap width by the width, a Custom place each axis.
import type { Draft } from "immer";
import type { Affect, Command } from "../../core/commands/command.js";
import { clampDimension } from "../../core/commands/projectCommands.js";
import { hasSectionKeys, mapKeyValues } from "../../core/document/keyframes.js";
import type { CaptionClip, CaptionStyle, CaptionStyleOverride, ClipId, Keyframes, Project, SolidClip, TrackId, Transform } from "../../core/document/types.js";
import { adaptCaptionOverride, adaptCaptionStyle } from "../../text/captions.js";
import { fillTransform, fitTransform, isLayerClip, layerContent, layerCorners, layerPoint, normalizeTransform, scaleYOf, turnedExtent, type ContentBox, type LayerClip, type Point, type Size } from "./transform.js";

/** How far a scale may be from the exact Fit or Fill and still count as it (a typed 56.3% for 56.25%). */
const SCALE_TOLERANCE = 1e-3;
/** Project px a layer's middle may be off the frame's to count as centered, or its edges past the frame to count as inside. */
const PX_TOLERANCE = 0.5;

/** A layer in the new frame: its transform, its keys when keyed, a background solid's size. */
interface LayerWrite {
  transform: Transform;
  keyframes?: Keyframes;
  size?: SolidClip["size"];
  cornerRadius?: number;
}

/** The old and the new frame and their ratios: each axis, and the short side (what text and shapes are sized by). */
interface FrameChange {
  from: Size;
  to: Size;
  kx: number;
  ky: number;
  side: number;
}

const near = (value: number, target: number) => Math.abs(value - target) <= SCALE_TOLERANCE * target;
const keyed = (clip: LayerClip): Keyframes | null => (clip.keyframes && hasSectionKeys(clip.keyframes, "transform") ? clip.keyframes : null);

/** The middle of what a layer shows, in project px from the frame's top-left. */
function visibleMiddle(transform: Transform, box: ContentBox, frame: Size): Point {
  return layerPoint(transform, box, frame, (box.left + box.right) / 2, (box.top + box.bottom) / 2);
}

/** The axis-aligned bounds of what a layer shows, in project px from the frame's top-left. */
function bounds(transform: Transform, box: ContentBox, frame: Size): { left: number; top: number; right: number; bottom: number } {
  const corners = layerCorners(transform, box, frame);
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
}

/** `transform` scaled by `k`, moved so the middle of what it shows sits where it sat, relative to the frame. */
function follow(transform: Transform, box: ContentBox, change: FrameChange, k: number): Transform {
  const { from, to } = change;
  const before = visibleMiddle(transform, box, from);
  const scaled = normalizeTransform({ ...transform, scale: transform.scale * k, scaleY: scaleYOf(transform) * k });
  const after = visibleMiddle(scaled, box, to);
  return { ...scaled, x: scaled.x + (before.x * to.width) / from.width - after.x, y: scaled.y + (before.y * to.height) / from.height - after.y };
}

/** A keyed layer: its transform and its keys, positions each axis, scales by `k`. */
function followKeys(clip: LayerClip, keyframes: Keyframes, change: FrameChange, k: number): LayerWrite {
  const { kx, ky } = change;
  const t = clip.transform;
  return {
    transform: normalizeTransform({ ...t, x: t.x * kx, y: t.y * ky, scale: t.scale * k, scaleY: scaleYOf(t) * k }),
    keyframes: mapKeyValues(keyframes, { "transform.x": (x) => x * kx, "transform.y": (y) => y * ky, "transform.scale": (s) => s * k, "transform.scaleY": (s) => s * k }),
  };
}

/** `transform` moved the least so what it shows is inside `frame`, on each axis where it fits. */
function keptInside(transform: Transform, box: ContentBox, frame: Size): Transform {
  const b = bounds(transform, box, frame);
  const shift = (low: number, high: number, size: number) => (high - low > size + PX_TOLERANCE ? 0 : low < 0 ? -low : high > size ? size - high : 0);
  const dx = shift(b.left, b.right, frame.width);
  const dy = shift(b.top, b.bottom, frame.height);
  return dx === 0 && dy === 0 ? transform : { ...transform, x: transform.x + dx, y: transform.y + dy };
}

/** A video or image: Fit stays Fit, Fill stays Fill, any other keeps its size relative to its Fit. */
function adaptPicture(clip: LayerClip, box: ContentBox, change: FrameChange): LayerWrite {
  const { from, to } = change;
  const t = clip.transform;
  const extent = turnedExtent(box, t.rotation);
  const fit = (frame: Size) => Math.min(frame.width / extent.width, frame.height / extent.height);
  const fill = (frame: Size) => Math.max(frame.width / extent.width, frame.height / extent.height);
  const k = fit(to) / fit(from);
  const keys = keyed(clip);
  if (keys) return followKeys(clip, keys, change, k);
  const middle = visibleMiddle(t, box, from);
  const centered = scaleYOf(t) === t.scale && Math.abs(middle.x - from.width / 2) <= PX_TOLERANCE && Math.abs(middle.y - from.height / 2) <= PX_TOLERANCE;
  if (centered && near(t.scale, fit(from))) return { transform: fitTransform(t, box, to) };
  if (centered && near(t.scale, fill(from))) return { transform: fillTransform(t, box, to) };
  return { transform: follow(t, box, change, k) };
}

/** A solid as large as the old frame, centered and upright: a background. */
function isBackground(clip: SolidClip, from: Size): boolean {
  const t = clip.transform;
  const upright = t.rotation % 360 === 0 && t.scale === 1 && scaleYOf(t) === 1 && t.anchor.x === 0.5 && t.anchor.y === 0.5;
  return upright && Math.abs(t.x) <= PX_TOLERANCE && Math.abs(t.y) <= PX_TOLERANCE && Math.abs(clip.size.w - from.width) <= 1 && Math.abs(clip.size.h - from.height) <= 1;
}

/** Text or a shape: sized by the short side, never past the new frame when it fit the old one. */
function adaptOverlay(clip: LayerClip, box: ContentBox, change: FrameChange): LayerWrite {
  const { from, to } = change;
  const keys = keyed(clip);
  if (clip.kind === "solid" && !keys && isBackground(clip, from)) {
    return { transform: { ...clip.transform, anchor: { ...clip.transform.anchor }, x: 0, y: 0 }, size: { w: to.width, h: to.height }, cornerRadius: Math.round(clip.cornerRadius * change.side) };
  }
  const t = clip.transform;
  const before = bounds(t, box, from);
  const width = before.right - before.left;
  const height = before.bottom - before.top;
  let k = change.side;
  if (width > 0 && height > 0 && width <= from.width + PX_TOLERANCE && height <= from.height + PX_TOLERANCE) k = Math.min(k, to.width / width, to.height / height);
  if (keys) return followKeys(clip, keys, change, k);
  const next = follow(t, box, change, k);
  const inside = before.left >= -PX_TOLERANCE && before.top >= -PX_TOLERANCE && before.right <= from.width + PX_TOLERANCE && before.bottom <= from.height + PX_TOLERANCE;
  return { transform: inside ? keptInside(next, box, to) : next };
}

/**
 * The project at a new frame size (even, in range) with its layers, keys and captions adapted to it
 * (see the header). Layers with nothing to draw (media without a size) keep their transform.
 */
export function adaptResolution(project: Project, width: number, height: number): Command {
  const from: Size = { width: project.settings.width, height: project.settings.height };
  const to: Size = { width: clampDimension(width), height: clampDimension(height) };
  const change: FrameChange = { from, to, kx: to.width / from.width, ky: to.height / from.height, side: Math.min(to.width, to.height) / Math.min(from.width, from.height) };
  const layers = new Map<ClipId, LayerWrite>();
  const cues = new Map<ClipId, CaptionStyleOverride>();
  const styles = new Map<TrackId, CaptionStyle>();
  if (to.width !== from.width || to.height !== from.height) {
    for (const clip of Object.values(project.clips)) {
      if (clip.kind === "caption") {
        if (clip.styleOverride) cues.set(clip.id, adaptCaptionOverride(clip.styleOverride, change.kx, change.ky, change.side));
        continue;
      }
      if (!isLayerClip(clip)) continue;
      const box = layerContent(project, clip);
      if (box) layers.set(clip.id, clip.kind === "video" || clip.kind === "image" ? adaptPicture(clip, box, change) : adaptOverlay(clip, box, change));
    }
    for (const [id, data] of Object.entries(project.captionTracks)) styles.set(id, adaptCaptionStyle(data.style, change.kx, change.ky, change.side));
  }
  const affects: Affect[] = ["settings", "composite"];
  if (cues.size > 0 || [...layers.values()].some((write) => write.keyframes)) affects.push("clips");
  if (styles.size > 0) affects.push("tracks");
  if (styles.size > 0 || cues.size > 0) affects.push("captions");
  return {
    id: "project.setResolution",
    label: "Change resolution",
    affects,
    run(draft) {
      draft.settings.width = to.width;
      draft.settings.height = to.height;
      for (const [id, write] of layers) {
        const clip = draft.clips[id] as Draft<LayerClip> | undefined;
        if (!clip) continue;
        clip.transform = structuredClone(write.transform);
        if (write.keyframes) clip.keyframes = structuredClone(write.keyframes);
        if (clip.kind === "solid" && write.size) {
          clip.size = { ...write.size };
          clip.cornerRadius = write.cornerRadius ?? clip.cornerRadius;
        }
      }
      for (const [id, override] of cues) {
        const cue = draft.clips[id] as Draft<CaptionClip> | undefined;
        if (cue) cue.styleOverride = structuredClone(override);
      }
      for (const [id, style] of styles) {
        const track = draft.captionTracks[id];
        if (track) track.style = structuredClone(style);
      }
    },
  };
}
