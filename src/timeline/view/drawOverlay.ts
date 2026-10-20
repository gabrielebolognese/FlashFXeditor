// The timeline overlay canvas (spec §6.17, P3): hover highlights and the playhead. It is redrawn
// for every interaction frame (scrubbing, hover changes) while the content canvas stays untouched.
// TODO(batch 11): ghosts, marquee and insert/overwrite indicators; TODO(batch 12): snap lines.
import type { Clip, Frame } from "../../core/document/types.js";
import type { Theme } from "../../core/theme/theme.js";
import { clipLod, clipSpan, devicePx } from "./clipLayout.js";
import type { Rect, Row, TimelineGeometry } from "./geometry.js";

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
  ctx.restore();
  drawPlayhead(scene);
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
