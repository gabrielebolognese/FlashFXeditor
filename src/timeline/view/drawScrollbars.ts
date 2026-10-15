// The timeline scrollbars (spec §6.1; their look is a design gap, see PROGRESS.md). The content canvas
// draws the troughs, the thumbs and the zoom handle dots: they move only with the zoom and the scroll,
// which redraw it anyway. The overlay repaints the hovered or dragged thumb over it (hover feedback
// without a content redraw, P3).
import type { Theme } from "../../core/theme/theme.js";
import type { Rect, TimelineGeometry } from "./geometry.js";
import type { ScrollbarHit, ScrollbarLayout } from "./scrollbars.js";

/** Snaps a CSS coordinate to the device pixel grid. */
const snap = (value: number, dpr: number) => Math.round(value * dpr) / dpr;

/** The thumb as drawn: a pill inset from the trough's long edges. */
function pill(rect: Rect, axis: "x" | "y", inset: number): Rect {
  return axis === "x" ? { x: rect.x, y: rect.y + inset, width: rect.width, height: Math.max(0, rect.height - 2 * inset) } : { x: rect.x + inset, y: rect.y, width: Math.max(0, rect.width - 2 * inset), height: rect.height };
}

function fillPill(ctx: CanvasRenderingContext2D, rect: Rect, radius: number, color: string): void {
  if (rect.width <= 0 || rect.height <= 0) return;
  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.width, rect.height, radius);
  ctx.fillStyle = color;
  ctx.fill();
}

/** The zoom handles: a dot centered in each end of the horizontal thumb. */
function drawHandleDots(ctx: CanvasRenderingContext2D, theme: Theme, layout: ScrollbarLayout, colors: { start: string; end: string }): void {
  const { thumb, handle } = layout.h;
  const thumbPill = pill(thumb, "x", theme.space[0]);
  const radius = Math.max(0, thumbPill.height / 2 - theme.space[0]);
  if (radius <= 0) return;
  const cy = thumbPill.y + thumbPill.height / 2;
  for (const [cx, color] of [
    [thumb.x + handle / 2, colors.start],
    [thumb.x + thumb.width - handle / 2, colors.end],
  ] as const) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
  }
}

/** Troughs (on the header column's surface, hairline edges toward the tracks) and thumbs, on the content canvas. */
export function drawScrollbars(ctx: CanvasRenderingContext2D, dpr: number, geometry: TimelineGeometry, theme: Theme, layout: ScrollbarLayout): void {
  const { color, space, radius } = theme;
  const { h, v } = layout;
  const line = 1 / dpr;
  ctx.fillStyle = color.surface1;
  // The bottom strip runs under the header column and the corner too.
  ctx.fillRect(0, h.trough.y, geometry.width, geometry.height - h.trough.y);
  ctx.fillRect(v.trough.x, v.trough.y, geometry.width - v.trough.x, v.trough.height);
  ctx.fillStyle = color.hairline;
  ctx.fillRect(0, snap(h.trough.y, dpr), geometry.width, line);
  ctx.fillRect(snap(v.trough.x, dpr), v.trough.y, line, v.trough.height);
  fillPill(ctx, pill(h.thumb, "x", space[0]), radius.pill, color.surface4);
  drawHandleDots(ctx, theme, layout, { start: color.textTertiary, end: color.textTertiary });
  if (v.thumb) fillPill(ctx, pill(v.thumb, "y", space[0]), radius.pill, color.surface4);
}

/**
 * The scrollbar under the pointer or being dragged, on the overlay: its thumb one surface step up
 * (`--surface-5`); a zoom handle's dot in the secondary text color when hovered, primary while dragged.
 */
export function drawScrollbarState(ctx: CanvasRenderingContext2D, theme: Theme, layout: ScrollbarLayout, hit: ScrollbarHit, active: boolean): void {
  const { color, space, radius } = theme;
  if (hit.part === "trough") return;
  if (hit.axis === "y") {
    if (layout.v.thumb) fillPill(ctx, pill(layout.v.thumb, "y", space[0]), radius.pill, color.surface5);
    return;
  }
  fillPill(ctx, pill(layout.h.thumb, "x", space[0]), radius.pill, color.surface5);
  const lit = active ? color.textPrimary : color.textSecondary;
  drawHandleDots(ctx, theme, layout, { start: hit.part === "start" ? lit : color.textTertiary, end: hit.part === "end" ? lit : color.textTertiary });
}
