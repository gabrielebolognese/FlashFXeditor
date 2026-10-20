// The timeline overlay canvas (spec §6.17, P3): hover highlights (a clip, a gap, a track header and
// its toggles), a dragged track header with the line where it lands (spec §6.12), the selected gap,
// the Razor's cut line, the trim preview (the rows an edit changes, redrawn as the drop would leave
// them), the selected edit point's brackets, the snap line, clip drag ghosts with the new track rows,
// overwrite hatching and the insert line, the edit's ghost edges, the marquee, the playhead and the
// drag tooltip with the snap target's name. It is redrawn for every interaction frame (scrubbing,
// dragging, hover changes) while the content canvas stays untouched.
import type { Clip, Frame, Track, TrackId } from "../../core/document/types.js";
import type { Selection } from "../../core/store/selection.js";
import type { Theme } from "../../core/theme/theme.js";
import { edgeFrame, type TrimEdge } from "../edit/trim.js";
import { clipsInRange, linkOffset, type Gap } from "../model/queries.js";
import { clipLod, clipSpan, devicePx, LOD_LABEL_PX } from "./clipLayout.js";
import { drawClip, drawDiagonalHatch, drawHeader, fillClip, fontOf } from "./drawContent.js";
import type { Rect, Row, TimelineGeometry } from "./geometry.js";
import type { Ghost, MoveProposal, NewLane } from "./gestures/moveClips.js";
import type { TrimProposal } from "./gestures/trimClip.js";
import { CLIP_GLYPHS, drawGlyph, TRACK_GLYPHS } from "./glyphs.js";
import type { TextCache } from "./textCache.js";

/** A clip drag as drawn: the proposal and the height of a new track row. */
export interface MoveScene {
  proposal: MoveProposal;
  newRowHeight: number;
}

/** A trim as drawn: the proposal and the session selection (redrawn clips look as on the content canvas). */
export interface TrimScene {
  proposal: TrimProposal;
  selection: Selection;
}

/**
 * A selected edit point on a track (spec §6.7): brackets on the cut at `frame`, on both sides for a
 * roll (`--danger`), on one side for a ripple trim (`--accent`).
 */
export interface EditPointMark {
  trackId: TrackId;
  frame: Frame;
  side: "both" | "left" | "right";
}

/**
 * A track header dragged to reorder (spec §6.12): its header follows the pointer (`y`: the ghost's top)
 * and an insert line marks where it lands (`insertY`, null when it would land where it is).
 */
export interface TrackDragScene {
  track: Track;
  height: number;
  y: number;
  insertY: number | null;
}

/** The Razor at the pointer (spec §6.11): a cut line at `frame` over each clip it would cut. */
export interface RazorScene {
  frame: Frame;
  clips: readonly Clip[];
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
  /** The track header under the pointer (outside its toggles). */
  hoverHeader?: Rect | null;
  trackDrag?: TrackDragScene | null;
  /** The gap under the pointer, and the selected gap (spec §6.7: a dashed outline). */
  hoverGap?: Gap | null;
  gap?: Gap | null;
  razor?: RazorScene | null;
  /** The frame a drag snapped to (spec §6.9: a line through the full height), or null. */
  snapFrame: Frame | null;
  move: MoveScene | null;
  trim: TrimScene | null;
  /** The selected edit point (and its linked partners' cuts). */
  editPoints: readonly EditPointMark[];
  /** The marquee rectangle (view coordinates). */
  marquee: Rect | null;
  /** The drag tooltip near the pointer: `Δ +00:00:12` and/or the snap target's name. */
  tooltip: Tooltip | null;
  text: TextCache;
}

export interface Tooltip {
  text: string | null;
  /** The name of what the drag snapped to, after the text in the accent color. */
  target: string | null;
  /** A bound the drag hit (`Media start`), last, in the danger color. */
  alert?: string | null;
  x: number;
  y: number;
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
  if (scene.hoverGap || scene.gap) drawGaps(scene);
  // The trim preview stands in for the content under it, so everything else draws over it.
  if (scene.trim) drawTrimLayout(scene, scene.trim);
  for (const mark of scene.editPoints) drawEditPoint(scene, mark);
  ctx.restore();
  // §6.17 order: hover, snap lines, ghosts and trim previews, insert/overwrite indicators, playhead, tooltip.
  if (scene.snapFrame !== null) drawSnapLine(scene, scene.snapFrame);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, geometry.area.y, geometry.width, geometry.area.height);
  ctx.clip();
  if (scene.move) drawMove(scene, scene.move);
  if (scene.trim) drawTrimEdges(scene, scene.trim);
  if (scene.marquee) drawMarquee(scene, scene.marquee);
  // Over the snap line it may stand on: the clips the Razor would cut stay visible.
  if (scene.razor) drawRazor(scene, scene.razor);
  ctx.restore();
  if (scene.trackDrag) drawTrackDrag(scene, scene.trackDrag);
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

/**
 * The trim preview (spec §6.10): each row the trim changes is cleared over the changed frames (the
 * clip band only, so the row hairlines stay) and its clips there are drawn from the proposed document,
 * as the content canvas will after the drop. Only the visible part of each row is drawn (P10).
 */
function drawTrimLayout(scene: OverlayScene, trim: TrimScene): void {
  const { ctx, dpr, geometry, theme } = scene;
  const { proposal } = trim;
  if (proposal.repaint.size === 0) return;
  const { project } = proposal;
  const inset = theme.timeline.clipInset;
  const visible = geometry.visibleFrames;
  const clipScene = { ctx, dpr, geometry, theme, selection: trim.selection, text: scene.text };
  ctx.save();
  ctx.beginPath();
  ctx.rect(geometry.area.x, geometry.area.y, geometry.area.width, geometry.area.height);
  ctx.clip();
  for (const row of geometry.rows) {
    const span = proposal.repaint.get(row.trackId);
    if (!span || row.y + row.height <= geometry.area.y || row.y >= geometry.height) continue;
    const from = Math.max(span.from, Math.floor(visible.from));
    const to = Math.min(span.to, Math.ceil(visible.to) + 1);
    if (to <= from) continue;
    const y = snap(row.y + inset, dpr);
    const height = snap(row.y + row.height - inset, dpr) - y;
    const x0 = snap(geometry.frameToX(from), dpr);
    const x1 = snap(geometry.frameToX(to), dpr);
    ctx.fillStyle = theme.color.bg;
    ctx.fillRect(x0, y, x1 - x0, height);
    const track = project.tracks[row.index] as Track;
    const clips = clipsInRange(project, row.trackId, from, to);
    clips.forEach((clip, i) => {
      const next = clips[i + 1];
      drawClip(clipScene, clip, row, track, next !== undefined && next.start === clip.start + clip.duration, linkOffset(project, clip.id));
    });
  }
  ctx.restore();
}

/**
 * The ghost edges (spec §6.10): a bar inside each edited clip at each edge the edit moves (both edges
 * of a slipped clip; none on a slid clip, whose neighbors' edges mark it), in the accent color, or the
 * danger color while that side sits on its media bound.
 */
function drawTrimEdges(scene: OverlayScene, trim: TrimScene): void {
  const { ctx, dpr, geometry, theme } = scene;
  const { proposal } = trim;
  const { result } = proposal;
  const inset = theme.timeline.clipInset;
  const width = devicePx(theme.timeline.trimEdgeWidth, dpr) / dpr;
  for (const before of result.plan.trimmed) {
    const move = result.plan.moves.get(before.id);
    if (move === "move") continue;
    const clip = proposal.project.clips[before.id] ?? before;
    const row = geometry.rowOf(clip.trackId);
    if (!row || row.y + row.height <= geometry.area.y || row.y >= geometry.height) continue;
    const bound = result.bounds.get(clip.id) ?? null;
    const edges: [TrimEdge, boolean][] =
      move === "slip" ? [["in", bound === "start"], ["out", bound === "end"]] : [[move === "in" || move === "stretchIn" ? "in" : "out", bound !== null]];
    const y = snap(row.y + inset, dpr);
    const height = snap(row.y + row.height - inset, dpr) - y;
    for (const [edge, red] of edges) {
      const frame = edgeFrame(clip, edge);
      if (!geometry.isFrameVisible(frame)) continue;
      const x = snap(geometry.frameToX(frame), dpr);
      ctx.fillStyle = red ? theme.color.danger : theme.color.accent;
      ctx.fillRect(edge === "in" ? x : x - width, y, width, height);
    }
  }
}

/**
 * A selected edit point (spec §6.7): a `]` closing the left clip and a `[` opening the right one on
 * the cut (a roll, in the danger color), or the one of the rippled side (in the accent color). Ghost
 * edge width strokes, `--space-1` serifs, over the clip band.
 */
function drawEditPoint(scene: OverlayScene, mark: EditPointMark): void {
  const { ctx, dpr, geometry, theme } = scene;
  const row = geometry.rowOf(mark.trackId);
  if (!row || row.y + row.height <= geometry.area.y || row.y >= geometry.height || !geometry.isFrameVisible(mark.frame)) return;
  const inset = theme.timeline.clipInset;
  const width = devicePx(theme.timeline.trimEdgeWidth, dpr) / dpr;
  const serif = theme.space[1];
  const x = snap(geometry.frameToX(mark.frame), dpr);
  const y = snap(row.y + inset, dpr);
  const height = snap(row.y + row.height - inset, dpr) - y;
  ctx.fillStyle = mark.side === "both" ? theme.color.danger : theme.color.accent;
  if (mark.side !== "right") {
    ctx.fillRect(x - width, y, width, height);
    ctx.fillRect(x - width - serif, y, serif, width);
    ctx.fillRect(x - width - serif, y + height - width, serif, width);
  }
  if (mark.side !== "left") {
    ctx.fillRect(x, y, width, height);
    ctx.fillRect(x + width, y, serif, width);
    ctx.fillRect(x + width, y + height - width, serif, width);
  }
}

/** The clip band of a track row over [from, to) (unclipped: the caller clips to the track area), or null when the row is off screen. */
function band(scene: OverlayScene, trackId: string, from: Frame, to: Frame): Rect | null {
  const { dpr, geometry, theme } = scene;
  const row = geometry.rowOf(trackId);
  if (!row || row.y + row.height <= geometry.area.y || row.y >= geometry.height) return null;
  const inset = theme.timeline.clipInset;
  const x = snap(geometry.frameToX(from), dpr);
  const y = snap(row.y + inset, dpr);
  return { x, y, width: snap(geometry.frameToX(to), dpr) - x, height: snap(row.y + row.height - inset, dpr) - y };
}

/**
 * Gaps (spec §6.7): the hovered one gets the hover wash; the selected one the accent wash and a
 * dashed accent outline (selection is gold), dashes of `--timeline-gap-dash`.
 */
function drawGaps(scene: OverlayScene): void {
  const { ctx, dpr, geometry, theme } = scene;
  ctx.save();
  ctx.beginPath();
  ctx.rect(geometry.area.x, geometry.area.y, geometry.area.width, geometry.area.height);
  ctx.clip();
  const hover = scene.hoverGap;
  const selected = scene.gap;
  const same = hover && selected && hover.trackId === selected.trackId && hover.start === selected.start;
  const hovered = hover && !same ? band(scene, hover.trackId, hover.start, hover.end) : null;
  if (hovered) {
    ctx.fillStyle = theme.color.hoverWash;
    ctx.fillRect(hovered.x, hovered.y, hovered.width, hovered.height);
  }
  const rect = selected ? band(scene, selected.trackId, selected.start, selected.end) : null;
  if (rect && rect.width > 0) {
    ctx.fillStyle = theme.color.accentWash;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    const line = devicePx(theme.timeline.selectionOutline, dpr) / dpr;
    const dash = Math.max(theme.timeline.gapDash, 1);
    ctx.strokeStyle = theme.color.accent;
    ctx.lineWidth = line;
    ctx.setLineDash([dash, dash]);
    ctx.strokeRect(rect.x + line / 2, rect.y + line / 2, Math.max(0, rect.width - line), Math.max(0, rect.height - line));
    ctx.setLineDash([]);
  }
  ctx.restore();
}

/** The Razor (spec §6.11): a `--timeline-cut-line-width` line in the primary text color across each clip it would cut. */
function drawRazor(scene: OverlayScene, razor: RazorScene): void {
  const { ctx, dpr, geometry, theme } = scene;
  if (!geometry.isFrameVisible(razor.frame)) return;
  const width = devicePx(theme.timeline.cutLineWidth, dpr) / dpr;
  const left = Math.round(geometry.frameToX(razor.frame) * dpr - (width * dpr) / 2) / dpr;
  ctx.fillStyle = theme.color.textPrimary;
  for (const clip of razor.clips) {
    const rect = band(scene, clip.trackId, razor.frame, razor.frame);
    if (rect) ctx.fillRect(left, rect.y, width, rect.height);
  }
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
  const lod = clipLod(width);
  const radius = lod === "line" ? 0 : Math.min(theme.radius.sm, width / 2, height / 2);
  const small = target.track ? target.track.kind === "caption" || target.track.height === "S" : false;
  const labelHeight = small ? height : Math.min(height, tl.labelHeight);

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.clip();
  ctx.globalAlpha = tl.ghostOpacity;
  if (refused) {
    ctx.fillStyle = theme.color.dangerWash;
    ctx.fillRect(x, y, width, height);
  } else {
    fillClip(ctx, theme, clip, "body", x, y, width, height);
    fillClip(ctx, theme, clip, "label", x, y, width, labelHeight);
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
  drawDiagonalHatch(ctx, dpr, left, right, y, height, theme.timeline.hatch, theme.timeline.hatchGap);
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

/**
 * The snap line (spec §6.9): the accent color through the full timeline height (ruler and tracks) at
 * the snapped frame, over the track area only.
 */
function drawSnapLine(scene: OverlayScene, frame: Frame): void {
  const { ctx, dpr, geometry, theme } = scene;
  const x = geometry.frameToX(frame);
  const width = devicePx(theme.timeline.snapLineWidth, dpr) / dpr;
  const left = Math.round(x * dpr - (width * dpr) / 2) / dpr;
  if (left + width <= geometry.headerWidth || left >= geometry.width) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(geometry.headerWidth, 0, geometry.width - geometry.headerWidth, geometry.height);
  ctx.clip();
  ctx.fillStyle = theme.color.accent;
  ctx.fillRect(left, 0, width, geometry.height);
  ctx.restore();
}

/**
 * The drag tooltip: up and right of the pointer, kept inside the view (spec §6.8). The drag's delta
 * in mono type, then the snap target's name (spec §6.9) in the accent color of the snap line, then a
 * bound the drag hit (spec §6.10 `Media start`) in the danger color.
 */
function drawTooltip(scene: OverlayScene, tooltip: Tooltip): void {
  const { ctx, dpr, geometry, theme, text } = scene;
  const { space, color } = theme;
  const mono = fontOf(theme, "caption", true);
  const ui = fontOf(theme, "caption");
  ctx.font = mono;
  const textWidth = tooltip.text ? Math.ceil(text.width(ctx, tooltip.text)) : 0;
  ctx.font = ui;
  const alert = tooltip.alert ?? "";
  const alertWidth = alert ? Math.ceil(text.width(ctx, alert)) : 0;
  const gap = tooltip.text && tooltip.target ? space[2] : 0;
  const alertGap = alert && (tooltip.text || tooltip.target) ? space[2] : 0;
  // A long clip name is ellipsized so the tooltip fits the view.
  const target = tooltip.target ? text.fit(ctx, tooltip.target, geometry.width - textWidth - gap - alertGap - alertWidth - 2 * space[2]) : "";
  const targetWidth = target ? Math.ceil(text.width(ctx, target)) : 0;
  if (textWidth + targetWidth + alertWidth === 0) return;
  const width = textWidth + gap + targetWidth + alertGap + alertWidth + 2 * space[2];
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
  ctx.textBaseline = "middle";
  if (tooltip.text) {
    ctx.font = mono;
    ctx.fillStyle = color.textPrimary;
    ctx.fillText(tooltip.text, x + space[2], y + height / 2);
  }
  if (target) {
    ctx.font = ui;
    ctx.fillStyle = color.accent;
    ctx.fillText(target, x + space[2] + textWidth + gap, y + height / 2);
  }
  if (alert) {
    ctx.font = ui;
    ctx.fillStyle = color.danger;
    ctx.fillText(alert, x + space[2] + textWidth + gap + targetWidth + alertGap, y + height / 2);
  }
}

/** The dragged header at the pointer, at the ghost opacity, and the accent line where the track lands. */
function drawTrackDrag(scene: OverlayScene, drag: TrackDragScene): void {
  const { ctx, dpr, geometry, theme } = scene;
  const tl = theme.timeline;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, geometry.area.y, geometry.width, geometry.area.height);
  ctx.clip();
  if (drag.insertY !== null) {
    const width = devicePx(tl.insertWidth, dpr) / dpr;
    ctx.fillStyle = theme.color.accent;
    ctx.fillRect(0, Math.round(drag.insertY * dpr - (width * dpr) / 2) / dpr, geometry.width, width);
  }
  const row: Row = { trackId: drag.track.id, kind: drag.track.kind, index: -1, lane: 0, y: drag.y, height: drag.height };
  ctx.globalAlpha = tl.ghostOpacity;
  ctx.fillStyle = theme.color.surface1;
  ctx.fillRect(0, drag.y, geometry.headerWidth, drag.height);
  drawHeader(scene, row, drag.track, true);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = theme.color.accent;
  ctx.lineWidth = 1 / dpr;
  ctx.strokeRect(snap(0, dpr) + 0.5 / dpr, snap(drag.y, dpr) + 0.5 / dpr, snap(geometry.headerWidth, dpr) - 1 / dpr, snap(drag.height, dpr) - 1 / dpr);
  ctx.restore();
}

function drawHover(scene: OverlayScene): void {
  const { ctx, dpr, geometry, theme } = scene;
  if (scene.hoverHeader) {
    const rect = scene.hoverHeader;
    ctx.fillStyle = theme.color.hoverWash;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  }
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
