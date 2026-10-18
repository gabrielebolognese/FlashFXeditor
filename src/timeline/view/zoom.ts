// Timeline zoom and horizontal scroll (spec §6.2). Pure functions over `{ pxPerFrame, scrollFrame }`;
// the view and the toolbar write their results to the session store. Limits are applied only when
// the user zooms or scrolls, so a document change (an undo that shortens the content) never moves
// the view by itself.
import { secondsToFrames } from "../../core/document/time.js";
import type { Frame, Rational } from "../../core/document/types.js";

export const MIN_PX_PER_FRAME = 0.01;
export const MAX_PX_PER_FRAME = 400;
export const ZOOM_IN_STEP = 1.25;
export const ZOOM_OUT_STEP = 0.8;
/** The view may scroll this fraction of its width past the content end (room to drop clips). */
export const OVERSCROLL = 0.25;
const FIT_MARGIN_SECONDS = 2;
const FIT_MIN_SECONDS = 1;
/** One wheel notch (100 px of delta) zooms by one key step. */
const WHEEL_NOTCH_PX = 100;
const LINE_PX = 16;

export interface TimelineViewport {
  pxPerFrame: number;
  scrollFrame: number;
}

/** What the limits depend on: the track area width (CSS px), the content end and the frame rate. */
export interface ZoomContext {
  width: number;
  contentEnd: Frame;
  fps: Rational;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Frames that `Fit` shows: the content plus a 2 s margin, at least 1 s. */
export function fitFrames(contentEnd: Frame, fps: Rational): number {
  return Math.max(contentEnd + secondsToFrames(FIT_MARGIN_SECONDS, fps), secondsToFrames(FIT_MIN_SECONDS, fps));
}

export function fitPxPerFrame(context: ZoomContext): number {
  if (context.width <= 0) return MIN_PX_PER_FRAME;
  return clamp(context.width / fitFrames(context.contentEnd, context.fps), MIN_PX_PER_FRAME, MAX_PX_PER_FRAME);
}

/**
 * A short or empty timeline can still be zoomed out to show this much (Batch 46): Fit alone would stop
 * an empty project at 2 s, with no room to see where a clip would land at 10 s.
 */
const MIN_ZOOM_OUT_SECONDS = 60;

/**
 * Zoomed out as far as Fit-to-content or a minute, whichever shows more (never below 0.01 px/frame), in
 * to 400 px/frame.
 */
export function zoomLimits(context: ZoomContext): { min: number; max: number } {
  const minute = context.width > 0 ? context.width / secondsToFrames(MIN_ZOOM_OUT_SECONDS, context.fps) : MIN_PX_PER_FRAME;
  return { min: Math.max(MIN_PX_PER_FRAME, Math.min(fitPxPerFrame(context), minute)), max: MAX_PX_PER_FRAME };
}

/** Never before frame 0, never more than OVERSCROLL of the view past the content end. */
export function clampScroll(scrollFrame: number, pxPerFrame: number, context: ZoomContext): number {
  const visible = context.width / pxPerFrame;
  const max = Math.max(0, context.contentEnd - (1 - OVERSCROLL) * visible);
  return clamp(scrollFrame, 0, max);
}

/**
 * Zooms to `pxPerFrame` keeping `anchorFrame` at `anchorX` (CSS px from the left of the track area).
 * A view already outside the limits (the content got shorter) is never pushed further out.
 */
export function zoomAt(view: TimelineViewport, pxPerFrame: number, anchorFrame: number, anchorX: number, context: ZoomContext): TimelineViewport {
  const limits = zoomLimits(context);
  const px = clamp(pxPerFrame, Math.min(limits.min, view.pxPerFrame), Math.max(limits.max, view.pxPerFrame));
  return { pxPerFrame: px, scrollFrame: clampScroll(anchorFrame - anchorX / px, px, context) };
}

/** The key/button zoom anchor: the playhead when it is visible, else the view center. */
export function keyZoomAnchor(view: TimelineViewport, playhead: Frame, width: number): { frame: number; x: number } {
  const x = (playhead - view.scrollFrame) * view.pxPerFrame;
  if (x >= 0 && x <= width) return { frame: playhead, x };
  return { frame: view.scrollFrame + width / 2 / view.pxPerFrame, x: width / 2 };
}

export function fitView(context: ZoomContext): TimelineViewport {
  return { pxPerFrame: fitPxPerFrame(context), scrollFrame: 0 };
}

/** Zoom to selection leaves this fraction of the view free on each side of the selection (spec §6.2). */
export const SELECTION_MARGIN = 0.1;

/**
 * Zoom to selection (spec §6.2, `Shift+\`): frames [start, end) with a 10% margin of the view on each
 * side, centered, within the zoom limits and the scroll range.
 */
export function zoomToSpan(start: number, end: number, context: ZoomContext): TimelineViewport {
  // Never wider than Fit: the minute a short timeline may zoom out to is not a selection's.
  const px = clamp((context.width * (1 - 2 * SELECTION_MARGIN)) / Math.max(1, end - start), fitPxPerFrame(context), MAX_PX_PER_FRAME);
  return { pxPerFrame: px, scrollFrame: clampScroll((start + end) / 2 - context.width / px / 2, px, context) };
}

/**
 * One step of an animated zoom from `from` to `to` (the keyboard steps, spec §6.2) at eased progress
 * `t` (0..1): the zoom moves geometrically with `anchor` (a frame and its x in the track area) held in
 * place, and the scroll eases into the target's, which the scroll clamp may have moved off the anchor.
 */
export function interpolateZoom(from: TimelineViewport, to: TimelineViewport, anchor: { frame: number; x: number }, t: number, context: ZoomContext): TimelineViewport {
  if (t <= 0) return from;
  if (t >= 1) return to;
  const px = from.pxPerFrame * (to.pxPerFrame / from.pxPerFrame) ** t;
  const anchored = (pxPerFrame: number) => anchor.frame - anchor.x / pxPerFrame;
  const startOff = from.scrollFrame - anchored(from.pxPerFrame);
  const endOff = to.scrollFrame - anchored(to.pxPerFrame);
  return { pxPerFrame: px, scrollFrame: clampScroll(anchored(px) + startOff + (endOff - startOff) * t, px, context) };
}

export function scrollBy(view: TimelineViewport, deltaPx: number, context: ZoomContext): TimelineViewport {
  const scrollFrame = clampScroll(view.scrollFrame + deltaPx / view.pxPerFrame, view.pxPerFrame, context);
  return scrollFrame === view.scrollFrame ? view : { pxPerFrame: view.pxPerFrame, scrollFrame };
}

/** Follow playhead pages by the view width minus this fraction of it (spec §6.2). */
export const PAGE_OVERLAP = 0.1;

/**
 * Follow playhead (spec §6.2): when `frame` is out of view (x before 0, or at or past the right edge of
 * the track area) the view pages toward it by its width minus 10%, and a frame further away lands 10%
 * inside the edge it comes in from. Null when the frame is in view or the view cannot move.
 */
export function pageToFrame(view: TimelineViewport, frame: number, context: ZoomContext): TimelineViewport | null {
  if (context.width <= 0) return null;
  const visible = context.width / view.pxPerFrame;
  const x = (frame - view.scrollFrame) * view.pxPerFrame;
  let scroll: number;
  if (x >= context.width) {
    scroll = view.scrollFrame + visible * (1 - PAGE_OVERLAP);
    if (frame >= scroll + visible) scroll = frame - visible * PAGE_OVERLAP;
  } else if (x < 0) {
    scroll = view.scrollFrame - visible * (1 - PAGE_OVERLAP);
    if (frame < scroll) scroll = frame - visible * (1 - PAGE_OVERLAP);
  } else {
    return null;
  }
  const scrollFrame = clampScroll(scroll, view.pxPerFrame, context);
  return scrollFrame === view.scrollFrame ? null : { pxPerFrame: view.pxPerFrame, scrollFrame };
}

/** Zoom slider position 0..1, logarithmic over the limits (spec §6.2). */
export function pxToSlider(pxPerFrame: number, limits: { min: number; max: number }): number {
  if (limits.max <= limits.min) return 1;
  return clamp(Math.log(pxPerFrame / limits.min) / Math.log(limits.max / limits.min), 0, 1);
}

export function sliderToPx(position: number, limits: { min: number; max: number }): number {
  if (limits.max <= limits.min) return limits.max;
  return limits.min * (limits.max / limits.min) ** clamp(position, 0, 1);
}

/** A wheel delta in CSS px (`deltaMode` 0 px, 1 lines, 2 pages). */
export function wheelDeltaPx(delta: number, deltaMode: number, pageSize: number): number {
  return deltaMode === 1 ? delta * LINE_PX : deltaMode === 2 ? delta * pageSize : delta;
}

/** Zoom factor for a vertical wheel delta in px: one notch = one key step, pinch deltas scale smoothly. */
export function wheelZoomFactor(deltaPx: number): number {
  return ZOOM_IN_STEP ** (-deltaPx / WHEEL_NOTCH_PX);
}
