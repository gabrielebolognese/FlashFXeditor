// Timeline scrollbars (spec §6.1, §6.2): pure geometry. The horizontal bar spans the frames a view can
// reach (the content end plus the 25% overscroll, or the view itself where it already reaches further);
// its thumb is the visible range and its two ends are zoom handles: dragging one zooms with the view's
// opposite edge fixed (Premiere). The vertical bar spans the track rows (`scrollYRange` plus the view).
// Thumbs are at least `minThumb` long so the handles stay grabbable. A thumb drag inverts the drawn
// geometry, so the thumb stays under the pointer; a handle drag inverts the proportional thumb (the
// visible share of the span, before the minimum length), so it moves its end by the pointer's travel
// even while the drawn thumb is held at its minimum (there they differ by a few px).
import type { Rect } from "./geometry.js";
import { clampScroll, OVERSCROLL, zoomLimits, type TimelineViewport, type ZoomContext } from "./zoom.js";

export type ScrollbarAxis = "x" | "y";
/** The thumb's body, its left (`start`) or right (`end`) zoom handle, or the trough beside it. */
export type ScrollbarPart = "thumb" | "start" | "end" | "trough";

export interface ScrollbarHit {
  axis: ScrollbarAxis;
  part: ScrollbarPart;
}

/** Where the scrollbars are (view CSS px): troughs, thumbs (null: nothing to scroll) and the zoom handle width. */
export interface ScrollbarLayout {
  /** `span`: the frames the trough spans (`scrollSpan`), which places the markers and the in/out range on it. */
  h: { trough: Rect; thumb: Rect; handle: number; span: number };
  v: { trough: Rect; thumb: Rect | null };
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Frames the horizontal bar spans for `view`: as far as the view can scroll, plus the view. */
export function scrollSpan(view: TimelineViewport, context: ZoomContext): number {
  const visible = context.width / view.pxPerFrame;
  return Math.max(context.contentEnd + OVERSCROLL * visible, view.scrollFrame + visible, visible);
}

/** The horizontal thumb in `trough`: the visible range of the span, at least `minWidth` wide. */
export function horizontalThumb(view: TimelineViewport, context: ZoomContext, trough: Rect, minWidth: number): { x: number; width: number } {
  if (context.width <= 0 || view.pxPerFrame <= 0) return { x: trough.x, width: trough.width };
  const visible = context.width / view.pxPerFrame;
  const span = scrollSpan(view, context);
  const width = clamp((visible / span) * trough.width, Math.min(minWidth, trough.width), trough.width);
  const range = span - visible;
  const x = trough.x + (range > 0 ? (clamp(view.scrollFrame, 0, range) / range) * (trough.width - width) : 0);
  return { x, width };
}

/** The scroll that puts the horizontal thumb's left end at `thumbX` (a thumb drag), within the scroll range. */
export function scrollForThumb(thumbX: number, view: TimelineViewport, context: ZoomContext, trough: Rect, minWidth: number): number {
  // The range as the clamp sees it: a view scrolled past it (the content got shorter) comes back in.
  const inRange = { pxPerFrame: view.pxPerFrame, scrollFrame: clampScroll(view.scrollFrame, view.pxPerFrame, context) };
  const thumb = horizontalThumb(inRange, context, trough, minWidth);
  const range = scrollSpan(inRange, context) - context.width / view.pxPerFrame;
  const travel = trough.width - thumb.width;
  if (travel <= 0 || range <= 0) return clampScroll(0, view.pxPerFrame, context);
  return clampScroll(((thumbX - trough.x) / travel) * range, view.pxPerFrame, context);
}

/** Where a zoom handle's end of the proportional thumb (no minimum length) is: what `zoomHandleView` moves. */
export function handleEdge(side: "start" | "end", view: TimelineViewport, context: ZoomContext, trough: Rect): number {
  const thumb = horizontalThumb(view, context, trough, 0);
  return side === "end" ? thumb.x + thumb.width : thumb.x;
}

/**
 * A zoom handle dragged (spec §6.1): the view whose proportional thumb has that end at `x`, with the
 * view's opposite edge where it was in `start` (the right handle keeps the left edge, the left handle
 * the right edge), within the zoom limits and the scroll range. Found by bisection on the zoom (log
 * scale): the end moves monotonically with it.
 */
export function zoomHandleView(side: "start" | "end", x: number, start: TimelineViewport, context: ZoomContext, trough: Rect): TimelineViewport {
  const limits = zoomLimits(context);
  const right = start.scrollFrame + context.width / start.pxPerFrame;
  const viewAt = (px: number): TimelineViewport => ({
    pxPerFrame: px,
    scrollFrame: clampScroll(side === "end" ? start.scrollFrame : right - context.width / px, px, context),
  });
  // Zooming in moves the right end left and the left end right: f grows with the zoom either way.
  const f = (px: number) => (side === "end" ? x - handleEdge(side, viewAt(px), context, trough) : handleEdge(side, viewAt(px), context, trough) - x);
  let lo = Math.log(Math.min(limits.min, start.pxPerFrame));
  let hi = Math.log(Math.max(limits.max, start.pxPerFrame));
  if (f(Math.exp(lo)) >= 0) return viewAt(Math.exp(lo));
  if (f(Math.exp(hi)) <= 0) return viewAt(Math.exp(hi));
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (f(Math.exp(mid)) < 0) lo = mid;
    else hi = mid;
  }
  return viewAt(Math.exp((lo + hi) / 2));
}

/** The vertical thumb for `scrollY` in `range` (`TimelineGeometry.scrollYRange`), or null when nothing scrolls. */
export function verticalThumb(scrollY: number, range: { min: number; max: number }, viewHeight: number, trough: Rect, minHeight: number): { y: number; height: number } | null {
  const extent = range.max - range.min;
  if (extent <= 0 || trough.height <= 0) return null;
  const height = clamp((viewHeight / (extent + viewHeight)) * trough.height, Math.min(minHeight, trough.height), trough.height);
  return { y: trough.y + clamp((scrollY - range.min) / extent, 0, 1) * (trough.height - height), height };
}

/** The scrollY that puts the vertical thumb's top at `thumbY` (a thumb drag), within the range. */
export function scrollYForThumb(thumbY: number, range: { min: number; max: number }, viewHeight: number, trough: Rect, minHeight: number): number {
  const thumb = verticalThumb(range.min, range, viewHeight, trough, minHeight);
  const travel = thumb ? trough.height - thumb.height : 0;
  if (!thumb || travel <= 0) return clamp(0, range.min, range.max);
  return range.min + clamp((thumbY - trough.y) / travel, 0, 1) * (range.max - range.min);
}

/** Both scrollbars of a view: the horizontal one from the zoom and the content end, the vertical one from the track rows. */
export function layoutScrollbars(
  view: TimelineViewport,
  context: ZoomContext,
  bars: { h: Rect; v: Rect; scrollY: number; scrollYRange: { min: number; max: number }; viewHeight: number },
  minThumb: number,
): ScrollbarLayout {
  const { h, v } = bars;
  const hThumb = horizontalThumb(view, context, h, minThumb);
  const vThumb = verticalThumb(bars.scrollY, bars.scrollYRange, bars.viewHeight, v, minThumb);
  return {
    h: { trough: h, thumb: { x: hThumb.x, y: h.y, width: hThumb.width, height: h.height }, handle: Math.min(h.height, hThumb.width / 3), span: scrollSpan(view, context) },
    v: { trough: v, thumb: vThumb ? { x: v.x, y: vThumb.y, width: v.width, height: vThumb.height } : null },
  };
}

/** Where `frame` lies along the horizontal trough (the markers and the in/out range on the bar, Batch 46). */
export function scrollbarX(layout: ScrollbarLayout, frame: number): number {
  const { trough, span } = layout.h;
  return trough.x + (span > 0 ? clamp(frame / span, 0, 1) : 0) * trough.width;
}

const inside = (rect: Rect, x: number, y: number) => x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;

/** What of the scrollbars lies at view (x, y), or null. */
export function scrollbarAt(layout: ScrollbarLayout, x: number, y: number): ScrollbarHit | null {
  const { h, v } = layout;
  if (inside(h.trough, x, y)) {
    if (!inside(h.thumb, x, y)) return { axis: "x", part: "trough" };
    if (x < h.thumb.x + h.handle) return { axis: "x", part: "start" };
    if (x >= h.thumb.x + h.thumb.width - h.handle) return { axis: "x", part: "end" };
    return { axis: "x", part: "thumb" };
  }
  if (inside(v.trough, x, y)) return { axis: "y", part: v.thumb && inside(v.thumb, x, y) ? "thumb" : "trough" };
  return null;
}
