// The timeline overlay canvas (spec §6.17, P3): hover highlights, clip drag ghosts with the new
// track rows, overwrite hatching and the insert line, the marquee, the playhead and the drag
// tooltip. It is redrawn for every interaction frame (scrubbing, dragging, hover changes) while the
// content canvas stays untouched.
// TODO(batch 12): snap lines and the snap target label.
import type { Clip, Frame } from "../../core/document/types.js";
import type { Theme } from "../../core/theme/theme.js";
import { clipLod, clipSpan, devicePx, LOD_LABEL_PX } from "./clipLayout.js";
import { fontOf } from "./drawContent.js";
import type { Rect, Row, TimelineGeometry } from "./geometry.js";
import type { Ghost, MoveProposal, NewLane } from "./gestures/moveClips.js";
import { CLIP_GLYPHS, drawGlyph, TRACK_GLYPHS } from "./glyphs.js";
import type { TextCache } from "./textCache.js";

/** A clip drag as drawn: the proposal and the height of a new track row. */
export interface MoveScene {
  proposal: MoveProposal;
  newRowHeight: number;
}

export interface OverlayScene {
  ctx: CanvasRenderingContext2D;
  dpr: number;
  geometry: TimelineGeometry;
  theme: Theme;
  playhead: Frame;
  /** The playhead is being dragged (drawn wider). */
  scrubbing: boolean;
  hoverClip: { clip: Clip; row: Row; abutsNext: boolean } | null;
  hoverAddRow: Rect | null;
  /** A header toggle under the pointer. */
  hoverToggle: Rect | null;
  move: MoveScene | null;
  /** The marquee rectangle (view coordinates). */
  marquee: Rect | null;
  /** The drag tooltip near the pointer (`Δ +00:00:12`). */
  tooltip: { text: string; x: number; y: number } | null;
  text: TextCache;
}

export function drawOverlay(scene: OverlayScene): void {
  const { ctx, dpr, geometry } = scene;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, geometry.area.y, geometry.width, geometry.area.height);
  ctx.clip();
  drawHover(scene);
  if (scene.move) drawMove(scene, scene.move);
  if (scene.marquee) drawMarquee(scene, scene.marquee);
  ctx.restore();
  drawPlayhead(scene);
  if (scene.tooltip) drawTooltip(scene, scene.tooltip);
}

/** Snaps a CSS coordinate to the device pixel grid. */
const snap = (value: number, dpr: number) => Math.round(value * dpr) / dpr;

function drawMove(scene: OverlayScene, move: MoveScene): void {
  const { ctx, geometry } = scene;
  const { proposal } = move;
  for (const lane of proposal.newLanes) drawNewRow(scene, move, lane);
  ctx.save();
  ctx.beginPath();
  ctx.rect(geometry.area.x, geometry.area.y, geometry.area.width, geometry.area.height);
  ctx.clip();
  const { from, to } = geometry.visibleFrames;
  for (const ghost of proposal.ghosts) {
    if (ghost.start + ghost.clip.duration < from || ghost.start > to) continue;
    drawGhost(scene, move, ghost);
  }
  if (proposal.insertFrame !== null && !proposal.refused) drawInsertLine(scene, proposal.insertFrame);
  ctx.restore();
}

/** The row of a track the drop would create (spec §6.8: the ghost shows the new track row). */
function drawNewRow(scene: OverlayScene, move: MoveScene, lane: NewLane): void {
  const { ctx, dpr, geometry, theme, text } = scene;
  const band = geometry.laneBand(lane.kind, lane.lane, move.newRowHeight);
  if (!band || band.y + band.height <= geometry.area.y || band.y >= geometry.height) return;
  const { color } = theme;
  ctx.fillStyle = color.surface1;
  ctx.fillRect(0, band.y, geometry.headerWidth, band.height);
  ctx.fillStyle = color.bg;
  ctx.fillRect(geometry.area.x, band.y, geometry.area.width, band.height);
  ctx.fillStyle = color.hairline;
  ctx.fillRect(0, snap(band.y, dpr), geometry.width, 1 / dpr);
  ctx.fillRect(0, snap(band.y + band.height, dpr) - 1 / dpr, geometry.width, 1 / dpr);
  const pad = theme.space[3];
  const icon = theme.icon.size;
  const centerY = band.y + Math.min(band.height, theme.control.comfortable) / 2;
  drawGlyph(ctx, TRACK_GLYPHS[lane.kind], pad, centerY - icon / 2, icon, color.textMuted);
  ctx.font = fontOf(theme, "body");
  ctx.textBaseline = "middle";
  ctx.fillStyle = color.textTertiary;
  const textX = pad + icon + theme.space[2];
  ctx.fillText(text.fit(ctx, lane.name, geometry.headerWidth - pad - textX), textX, centerY);
}

function drawGhost(scene: OverlayScene, move: MoveScene, ghost: Ghost): void {
  const { ctx, dpr, geometry, theme, text } = scene;
  const tl = theme.timeline;
  const { clip, target } = ghost;
  const band = target.kind ? geometry.laneBand(target.kind, target.number, move.newRowHeight) : geometry.rowOf(clip.trackId);
  if (!band || band.y + band.height <= geometry.area.y || band.y >= geometry.height) return;
  const span = clipSpan(geometry.frameToX(ghost.start), geometry.frameToX(ghost.start + clip.duration), false, dpr);
  const x = span.x0 / dpr;
  const width = (span.x1 - span.x0) / dpr;
  const y = snap(band.y + tl.clipInset, dpr);
  const height = snap(band.y + band.height - tl.clipInset, dpr) - y;
  const refused = move.proposal.refused !== null;
  const colors = tl.clip[clip.kind];
  const lod = clipLod(width);
  const radius = lod === "line" ? 0 : Math.min(theme.radius.sm, width / 2, height / 2);
  const small = target.track ? target.track.kind === "caption" || target.track.height === "S" : false;
  const labelHeight = small ? height : Math.min(height, tl.labelHeight);

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.clip();
  ctx.globalAlpha = tl.ghostOpacity;
  ctx.fillStyle = refused ? theme.color.dangerWash : colors.body;
  ctx.fillRect(x, y, width, height);
  if (!refused) {
    ctx.fillStyle = colors.label;
    ctx.fillRect(x, y, width, labelHeight);
  }
  ctx.globalAlpha = 1;
  for (const [from, to] of ghost.hatch) drawHatch(scene, geometry.frameToX(from), geometry.frameToX(to), y, height);
  if (width >= LOD_LABEL_PX) {
    const pad = theme.space[1];
    const icon = theme.icon.small;
    const left = Math.max(x, geometry.area.x);
    const lineY = y + Math.min(labelHeight, tl.labelHeight) / 2;
    if (x + width - left >= pad + icon + pad) {
      drawGlyph(ctx, CLIP_GLYPHS[clip.kind], left + pad, lineY - icon / 2, icon, theme.color.textPrimary);
      ctx.font = fontOf(theme, "caption");
      ctx.textBaseline = "middle";
      ctx.fillStyle = theme.color.textPrimary;
      const textX = left + pad + icon + pad;
      ctx.fillText(text.fit(ctx, clip.name, x + width - pad - textX), textX, lineY);
    }
  }
  ctx.restore();

  const line = devicePx(tl.selectionOutline, dpr) / dpr;
  ctx.strokeStyle = refused ? theme.color.danger : theme.color.accent;
  ctx.lineWidth = line;
  ctx.beginPath();
  ctx.roundRect(x + line / 2, y + line / 2, Math.max(0, width - line), Math.max(0, height - line), Math.max(0, radius - line / 2));
  ctx.stroke();
}

/** Diagonal hatching over [x0, x1) of a ghost: the region it would overwrite (spec §6.8). */
function drawHatch(scene: OverlayScene, x0: number, x1: number, y: number, height: number): void {
  const { ctx, dpr, geometry, theme } = scene;
  // Only the part inside the track area: the line count follows the view width, not the zoom or
  // the length of the overwritten span (spec §6.17: off-screen parts cost nothing).
  const left = Math.max(x0, geometry.area.x);
  const right = Math.min(x1, geometry.area.x + geometry.area.width);
  if (right <= left) return;
  const gap = Math.max(theme.timeline.hatchGap, 1);
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, y, right - left, height);
  ctx.clip();
  ctx.strokeStyle = theme.timeline.hatch;
  ctx.lineWidth = 1 / dpr;
  ctx.beginPath();
  // Lines on a fixed grid (by x), so the pattern does not crawl while the ghost moves.
  for (let x = Math.floor((left - height) / gap) * gap; x < right; x += gap) {
    ctx.moveTo(x, y + height);
    ctx.lineTo(x + height, y);
  }
  ctx.stroke();
  ctx.restore();
}

/** Insert drops (Mod): a vertical line at the insert frame through every track and an arrow showing the shift. */
function drawInsertLine(scene: OverlayScene, frame: Frame): void {
  const { ctx, dpr, geometry, theme } = scene;
  const tl = theme.timeline;
  const x = geometry.frameToX(frame);
  const width = devicePx(tl.insertWidth, dpr) / dpr;
  const left = Math.round(x * dpr - (width * dpr) / 2) / dpr;
  ctx.fillStyle = theme.color.accent;
  ctx.fillRect(left, geometry.area.y, width, geometry.area.height);
  const size = tl.insertArrow;
  const top = geometry.area.y + theme.space[1];
  ctx.beginPath();
  ctx.moveTo(left + width, top);
  ctx.lineTo(left + width + size, top + size / 2);
  ctx.lineTo(left + width, top + size);
  ctx.closePath();
  ctx.fill();
}

function drawMarquee(scene: OverlayScene, rect: Rect): void {
  const { ctx, dpr, theme } = scene;
  const x0 = snap(rect.x, dpr);
  const y0 = snap(rect.y, dpr);
  const x1 = snap(rect.x + rect.width, dpr);
  const y1 = snap(rect.y + rect.height, dpr);
  ctx.fillStyle = theme.color.accentWash;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  const line = 1 / dpr;
  ctx.strokeStyle = theme.color.accentDim;
  ctx.lineWidth = line;
  ctx.strokeRect(x0 + line / 2, y0 + line / 2, Math.max(0, x1 - x0 - line), Math.max(0, y1 - y0 - line));
}

/** The drag tooltip: up and right of the pointer, kept inside the view (spec §6.8). */
function drawTooltip(scene: OverlayScene, tooltip: { text: string; x: number; y: number }): void {
  const { ctx, dpr, geometry, theme, text } = scene;
  const { space, color } = theme;
  ctx.font = fontOf(theme, "caption", true);
  const width = Math.ceil(text.width(ctx, tooltip.text)) + 2 * space[2];
  const height = theme.type.caption.line + 2 * space[1];
  const x = snap(Math.max(0, Math.min(tooltip.x + space[3], geometry.width - width)), dpr);
  let y = tooltip.y - space[3] - height;
  if (y < geometry.rulerHeight) y = tooltip.y + space[5];
  y = snap(Math.max(0, Math.min(y, geometry.height - height)), dpr);
  const line = 1 / dpr;
  ctx.beginPath();
  ctx.roundRect(x + line / 2, y + line / 2, width - line, height - line, theme.radius.sm);
  ctx.fillStyle = color.surface4;
  ctx.fill();
  ctx.strokeStyle = color.hairline;
  ctx.lineWidth = line;
  ctx.stroke();
  ctx.fillStyle = color.textPrimary;
  ctx.textBaseline = "middle";
  ctx.fillText(tooltip.text, x + space[2], y + height / 2);
}

function drawHover(scene: OverlayScene): void {
  const { ctx, dpr, geometry, theme } = scene;
  if (scene.hoverAddRow) {
    const row = scene.hoverAddRow;
    ctx.fillStyle = theme.color.hoverWash;
    ctx.fillRect(0, row.y, geometry.headerWidth, row.height);
  }
  if (scene.hoverToggle) {
    const rect = scene.hoverToggle;
    ctx.fillStyle = theme.color.hoverWash;
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.width, rect.height, theme.radius.sm);
    ctx.fill();
  }
  const hover = scene.hoverClip;
  if (!hover) return;
  ctx.fillStyle = theme.timeline.clipHover;
  const { clip, row } = hover;
  const span = clipSpan(geometry.frameToX(clip.start), geometry.frameToX(clip.start + clip.duration), hover.abutsNext, dpr);
  const x = span.x0 / dpr;
  const width = (span.x1 - span.x0) / dpr;
  const inset = theme.timeline.clipInset;
  const y = Math.round((row.y + inset) * dpr) / dpr;
  const height = Math.round((row.y + row.height - inset) * dpr) / dpr - y;
  ctx.beginPath();
  ctx.rect(geometry.area.x, geometry.area.y, geometry.area.width, geometry.area.height);
  ctx.clip();
  ctx.beginPath();
  if (clipLod(width) === "line") ctx.rect(x, y, width, height);
  else ctx.roundRect(x, y, width, height, Math.min(theme.radius.sm, width / 2, height / 2));
  ctx.fill();
}

function drawPlayhead(scene: OverlayScene): void {
  const { ctx, dpr, geometry, theme } = scene;
  const tl = theme.timeline;
  const x = geometry.frameToX(scene.playhead);
  const half = tl.playheadHeadWidth / 2;
  if (x + half < geometry.headerWidth || x - half > geometry.width) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(geometry.headerWidth, 0, geometry.width - geometry.headerWidth, geometry.height);
  ctx.clip();
  ctx.fillStyle = tl.playhead;
  const lineDevice = devicePx(scene.scrubbing ? tl.playheadWidthActive : tl.playheadWidth, dpr);
  const left = Math.round(x * dpr - lineDevice / 2) / dpr;
  const center = left + lineDevice / dpr / 2;
  const headTop = geometry.rulerHeight - tl.playheadHeadHeight;
  ctx.fillRect(left, headTop, lineDevice / dpr, geometry.height - headTop);
  // Pentagon head pointing down onto the tracks (spec §6.1).
  const shoulder = headTop + tl.playheadHeadHeight / 2;
  ctx.beginPath();
  ctx.moveTo(center - half, headTop);
  ctx.lineTo(center + half, headTop);
  ctx.lineTo(center + half, shoulder);
  ctx.lineTo(center, geometry.rulerHeight);
  ctx.lineTo(center - half, shoulder);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
