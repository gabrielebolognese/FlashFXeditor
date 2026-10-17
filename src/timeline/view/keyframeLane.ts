// The keyframe lane of a clip (spec §6.4 "keyframe row", §6.15; Batch 35): where it is, which keys it
// shows, and how it is drawn. Shared by the content pass (resting lanes), the overlay (a lane being
// dragged, redrawn over the content's) and the hit tester (diamonds, Alt+click on the lane).
// - A lane shows while Show clip keyframes is on, on layer clips (video, image, text, solid) of M/L
//   video tracks (S tracks have no body under the label bar), when the clip is selected or its track
//   is L. It shows the section chosen for the clip (Transform unless the clip menu chose another).
// - It is an opaque strip across the bottom of the clip body, so the overlay can redraw it whole; the
//   diamonds sit on their frame's left edge (where the playhead stands on that frame), kept inside the
//   clip (clear of its selection outline) so a key on its first or last frame stays visible and
//   grabbable (`diamondX`).
import { sectionFrames, type KeyframeSection } from "../../core/document/keyframes.js";
import type { Clip, ClipId, Frame, Track } from "../../core/document/types.js";
import type { KeyframeSelection } from "../../core/store/sessionStore.js";
import type { Theme } from "../../core/theme/theme.js";
import { keyable } from "../edit/keyframes.js";
import type { Row, TimelineGeometry } from "./geometry.js";

/** What the lanes depend on besides the document. */
export interface LaneScene {
  /** Show clip keyframes is on. */
  show: boolean;
  /** The section of a clip's lane. */
  section(clipId: ClipId): KeyframeSection;
  /** The selected keys (drawn in the accent). */
  selected: KeyframeSelection | null;
}

/** The section `clip`'s lane shows on `track`, or null when it has no lane now. */
export function shownLane(scene: LaneScene | null | undefined, clip: Clip, track: Track, selected: boolean): KeyframeSection | null {
  if (!scene?.show || track.kind !== "video" || track.height === "S" || (!selected && track.height !== "L")) return null;
  const section = scene.section(clip.id);
  return keyable(clip, section) ? section : null;
}

/** The lane's band in CSS px: the bottom of the clip body in `row`, above the selection outline (the diamonds stay whole). */
export function laneBand(row: Row, theme: Theme): { y: number; height: number } {
  const { clipInset, keyframeLaneHeight, selectionOutline } = theme.timeline;
  const bottom = row.y + row.height - clipInset - Math.ceil(selectionOutline) - 1;
  return { y: bottom - keyframeLaneHeight, height: keyframeLaneHeight };
}

/** The frames (relative to the clip) of the section's keys inside the clip. */
export function laneFrames(clip: Clip, section: KeyframeSection): Frame[] {
  return keyable(clip, section) ? sectionFrames(clip.keyframes, section, clip.duration) : [];
}

/** How a lane is drawn: its keys, which are selected, and which are being dragged. */
export interface LaneDraw {
  frames: readonly Frame[];
  selected: ReadonlySet<Frame>;
  /** Keys being dragged (drawn in the accent hover color). */
  dragged?: ReadonlySet<Frame>;
}

const snap = (value: number, dpr: number) => Math.round(value * dpr) / dpr;

/** How far a diamond's center stays inside the clip's edges (half a diamond, the selection outline, 1 px). */
export function diamondInset(theme: Theme): number {
  return theme.timeline.keyframeSize / 2 + theme.timeline.selectionOutline + 1;
}

/** Where the diamond of `frame` (relative to the clip) is, in CSS x: on its frame, kept `inset` px inside the clip. */
export function diamondX(geometry: TimelineGeometry, clip: Clip, frame: Frame, inset: number): number {
  const x0 = geometry.frameToX(clip.start) + inset;
  const x1 = geometry.frameToX(clip.start + clip.duration) - inset;
  const x = geometry.frameToX(clip.start + frame);
  return x1 > x0 ? Math.min(x1, Math.max(x0, x)) : (x0 + x1) / 2;
}

/**
 * Draws `clip`'s lane in `row` between `left` and `right` (the visible part of the clip, CSS px): the
 * opaque strip with its hairline top, then a diamond per key.
 */
export function drawLane(ctx: CanvasRenderingContext2D, dpr: number, geometry: TimelineGeometry, theme: Theme, clip: Clip, row: Row, left: number, right: number, draw: LaneDraw): void {
  if (right <= left) return;
  const { color } = theme;
  const band = laneBand(row, theme);
  const y = snap(band.y, dpr);
  const height = snap(band.y + band.height, dpr) - y;
  ctx.fillStyle = color.bgSunken;
  ctx.fillRect(left, y, right - left, height);
  ctx.fillStyle = color.hairline;
  ctx.fillRect(left, y, right - left, 1 / dpr);
  const half = theme.timeline.keyframeSize / 2;
  const inset = diamondInset(theme);
  const cy = y + height / 2;
  ctx.lineWidth = 1 / dpr;
  for (const frame of draw.frames) {
    const x = snap(diamondX(geometry, clip, frame, inset), dpr);
    if (x < left - half || x > right + half) continue;
    const dragged = draw.dragged?.has(frame) === true;
    ctx.fillStyle = dragged ? color.accentHover : draw.selected.has(frame) ? color.accent : color.textPrimary;
    ctx.strokeStyle = color.bgSunken;
    ctx.beginPath();
    ctx.moveTo(x, cy - half);
    ctx.lineTo(x + half, cy);
    ctx.lineTo(x, cy + half);
    ctx.lineTo(x - half, cy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

/** The key of `frames` whose diamond (`diamondX`) is under CSS x (within half the diamond and `slop` px), the nearest; null when none. */
export function diamondAt(geometry: TimelineGeometry, clip: Clip, frames: readonly Frame[], x: number, size: number, slop: number, inset: number): Frame | null {
  let best: Frame | null = null;
  let bestDistance = Infinity;
  for (const frame of frames) {
    const distance = Math.abs(diamondX(geometry, clip, frame, inset) - x);
    if (distance <= size / 2 + slop && distance < bestDistance) {
      best = frame;
      bestDistance = distance;
    }
  }
  return best;
}
