import { describe, expect, it } from "vitest";
import { FPS_30 } from "../../core/document/time.js";
import { handleEdge, horizontalThumb, layoutScrollbars, scrollbarAt, scrollForThumb, scrollSpan, scrollYForThumb, verticalThumb, zoomHandleView } from "./scrollbars.js";
import { clampScroll, fitView, zoomLimits, type ZoomContext } from "./zoom.js";

// 1000 px of track area over a 1000 px trough, 3000 frames of content at 30 fps.
const context: ZoomContext = { width: 1000, contentEnd: 3000, fps: FPS_30 };
const trough = { x: 200, y: 400, width: 1000, height: 12 };
const MIN = 36;
const right = (thumb: { x: number; width: number }) => thumb.x + thumb.width;

describe("horizontal scrollbar", () => {
  it("spans the content end plus 25% of the view, the thumb being the visible range", () => {
    const view = { pxPerFrame: 1, scrollFrame: 0 };
    // 1000 visible frames: the span is 3000 + 250.
    expect(scrollSpan(view, context)).toBe(3250);
    expect(horizontalThumb(view, context, trough, MIN)).toEqual({ x: 200, width: (1000 / 3250) * 1000 });
    // Scrolled as far as the clamp allows: the thumb ends at the trough's end.
    const max = clampScroll(1e9, 1, context);
    expect(max).toBe(2250);
    expect(right(horizontalThumb({ pxPerFrame: 1, scrollFrame: max }, context, trough, MIN))).toBeCloseTo(1200, 9);
  });

  it("keeps the thumb at least the minimum wide and inside the trough", () => {
    const deep = horizontalThumb({ pxPerFrame: 400, scrollFrame: 1500 }, context, trough, MIN);
    expect(deep.width).toBe(MIN);
    expect(deep.x).toBeGreaterThan(200);
    expect(right(deep)).toBeLessThan(1200);
    // Fit leaves room for the overscroll: the thumb is not the whole trough.
    const fit = horizontalThumb(fitView(context), context, trough, MIN);
    expect(fit.width).toBeLessThan(1000);
    expect(fit.width).toBeGreaterThan(700);
    // A view past the content end (the content got shorter) sits at the end.
    const past = horizontalThumb({ pxPerFrame: 1, scrollFrame: 5000 }, context, trough, MIN);
    expect(right(past)).toBeCloseTo(1200, 9);
  });

  it("maps a thumb drag back to the scroll: the thumb stays under the pointer", () => {
    const view = { pxPerFrame: 2, scrollFrame: 300 };
    const thumb = horizontalThumb(view, context, trough, MIN);
    const scroll = scrollForThumb(thumb.x + 100, view, context, trough, MIN);
    expect(horizontalThumb({ pxPerFrame: 2, scrollFrame: scroll }, context, trough, MIN).x).toBeCloseTo(thumb.x + 100, 9);
    // Never before 0 or past the range.
    expect(scrollForThumb(0, view, context, trough, MIN)).toBe(0);
    expect(scrollForThumb(5000, view, context, trough, MIN)).toBe(clampScroll(1e9, 2, context));
  });

  it("right zoom handle: zooms with the view's left edge fixed, the thumb's end under the pointer", () => {
    const start = { pxPerFrame: 1, scrollFrame: 500 };
    const thumb = horizontalThumb(start, context, trough, MIN);
    // Dragged 120 px left: zoom in.
    const zoomedIn = zoomHandleView("end", right(thumb) - 120, start, context, trough);
    expect(zoomedIn.scrollFrame).toBe(500);
    expect(zoomedIn.pxPerFrame).toBeGreaterThan(1);
    expect(right(horizontalThumb(zoomedIn, context, trough, MIN))).toBeCloseTo(right(thumb) - 120, 6);
    // Dragged right: zoom out, the left edge still fixed.
    const zoomedOut = zoomHandleView("end", right(thumb) + 60, start, context, trough);
    expect(zoomedOut.scrollFrame).toBe(500);
    expect(zoomedOut.pxPerFrame).toBeLessThan(1);
    // Not moved: the same view.
    expect(zoomHandleView("end", right(thumb), start, context, trough).pxPerFrame).toBeCloseTo(1, 9);
  });

  it("left zoom handle: zooms with the view's right edge fixed", () => {
    const start = { pxPerFrame: 1, scrollFrame: 500 };
    const thumb = horizontalThumb(start, context, trough, MIN);
    const view = zoomHandleView("start", thumb.x + 100, start, context, trough);
    expect(view.pxPerFrame).toBeGreaterThan(1);
    expect(view.scrollFrame + 1000 / view.pxPerFrame).toBeCloseTo(1500, 6);
    expect(horizontalThumb(view, context, trough, MIN).x).toBeCloseTo(thumb.x + 100, 6);
  });

  it("moves the handle's end by the pointer's travel while the drawn thumb is held at its minimum", () => {
    // 4 px/frame: 250 visible frames of a 3062.5 frame span, an 82 px proportional thumb in a 1000 px trough.
    const longer: ZoomContext = { ...context, contentEnd: 12_000 };
    const start = { pxPerFrame: 4, scrollFrame: 6000 };
    expect(horizontalThumb(start, longer, trough, MIN).width).toBe(MIN);
    const end = handleEdge("end", start, longer, trough);
    const view = zoomHandleView("end", end - 5, start, longer, trough);
    expect(view.scrollFrame).toBe(6000);
    expect(handleEdge("end", view, longer, trough)).toBeCloseTo(end - 5, 6);
    // A small travel is a small zoom, not a jump to the limit.
    expect(view.pxPerFrame).toBeGreaterThan(4);
    expect(view.pxPerFrame).toBeLessThan(8);
  });

  it("stops at the zoom limits: Fit when zooming out, 400 px/frame when zooming in", () => {
    const start = { pxPerFrame: 1, scrollFrame: 0 };
    const out = zoomHandleView("end", 5000, start, context, trough);
    expect(out.pxPerFrame).toBeCloseTo(zoomLimits(context).min, 9);
    const into = zoomHandleView("end", -5000, start, context, trough);
    expect(into.pxPerFrame).toBeCloseTo(400, 6);
    expect(into.scrollFrame).toBe(0);
  });
});

describe("vertical scrollbar", () => {
  const vTrough = { x: 1200, y: 28, width: 12, height: 400 };

  it("has no thumb when every row fits, else the visible share of the rows", () => {
    expect(verticalThumb(0, { min: 0, max: 0 }, 400, vTrough, MIN)).toBeNull();
    const range = { min: -200, max: 200 };
    // 400 px of view over 800 px of rows: half the trough, in the middle at the resting position.
    expect(verticalThumb(0, range, 400, vTrough, MIN)).toEqual({ y: 128, height: 200 });
    expect(verticalThumb(-200, range, 400, vTrough, MIN)?.y).toBe(28);
    expect(verticalThumb(999, range, 400, vTrough, MIN)?.y).toBe(228);
  });

  it("maps a thumb drag back to scrollY", () => {
    const range = { min: -200, max: 200 };
    expect(scrollYForThumb(128, range, 400, vTrough, MIN)).toBe(0);
    expect(scrollYForThumb(28 + 50, range, 400, vTrough, MIN)).toBe(-100);
    expect(scrollYForThumb(10_000, range, 400, vTrough, MIN)).toBe(200);
    expect(scrollYForThumb(50, { min: 0, max: 0 }, 400, vTrough, MIN)).toBe(0);
  });
});

describe("scrollbar hits", () => {
  it("finds the zoom handles at the thumb's ends, its body, the troughs", () => {
    const layout = layoutScrollbars(
      { pxPerFrame: 1, scrollFrame: 500 },
      context,
      { h: trough, v: { x: 1200, y: 28, width: 12, height: 372 }, scrollY: 0, scrollYRange: { min: -100, max: 100 }, viewHeight: 372 },
      MIN,
    );
    const { thumb, handle } = layout.h;
    expect(handle).toBe(12);
    expect(scrollbarAt(layout, thumb.x + 2, 405)).toEqual({ axis: "x", part: "start" });
    expect(scrollbarAt(layout, thumb.x + thumb.width - 2, 405)).toEqual({ axis: "x", part: "end" });
    expect(scrollbarAt(layout, thumb.x + thumb.width / 2, 405)).toEqual({ axis: "x", part: "thumb" });
    expect(scrollbarAt(layout, thumb.x - 5, 405)).toEqual({ axis: "x", part: "trough" });
    const vThumb = layout.v.thumb;
    expect(vThumb).not.toBeNull();
    expect(scrollbarAt(layout, 1205, (vThumb?.y ?? 0) + 5)).toEqual({ axis: "y", part: "thumb" });
    expect(scrollbarAt(layout, 1205, 29)).toEqual({ axis: "y", part: "trough" });
    expect(scrollbarAt(layout, 600, 200)).toBeNull();
  });
});
