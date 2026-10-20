import { describe, expect, it } from "vitest";
import {
  clampScroll,
  fitFrames,
  fitPxPerFrame,
  fitView,
  interpolateZoom,
  keyZoomAnchor,
  MAX_PX_PER_FRAME,
  MIN_PX_PER_FRAME,
  pageToFrame,
  pxToSlider,
  scrollBy,
  sliderToPx,
  wheelDeltaPx,
  wheelZoomFactor,
  zoomAt,
  zoomLimits,
  zoomToSpan,
  ZOOM_IN_STEP,
  ZOOM_OUT_STEP,
  type ZoomContext,
} from "./zoom.js";

const FPS = { num: 30, den: 1 };
const NTSC = { num: 30000, den: 1001 };
// 10 hours of content in an 800 px track area: the fit zoom is far below every level tested.
const LONG: ZoomContext = { width: 800, contentEnd: 30 * 36_000, fps: FPS };

describe("zoom limits and Fit", () => {
  it("fits the content plus 2 s, at least 1 s, within 0.01..400 px/frame", () => {
    expect(fitFrames(300, FPS)).toBe(360);
    expect(fitFrames(0, FPS)).toBe(60);
    expect(fitFrames(0, NTSC)).toBe(60);
    expect(fitPxPerFrame({ width: 720, contentEnd: 300, fps: FPS })).toBe(2);
    expect(fitPxPerFrame({ width: 800, contentEnd: 1e9, fps: FPS })).toBe(MIN_PX_PER_FRAME);
    expect(zoomLimits({ width: 720, contentEnd: 300, fps: FPS })).toEqual({ min: 2, max: MAX_PX_PER_FRAME });
    expect(fitView({ width: 720, contentEnd: 300, fps: FPS })).toEqual({ pxPerFrame: 2, scrollFrame: 0 });
  });

  it("shows the whole content after Fit", () => {
    // Up to 30 min: longer content in 913 px would need less than the 0.01 px/frame floor.
    for (const contentEnd of [1, 45, 300, 9_000, 54_000]) {
      const context = { width: 913, contentEnd, fps: NTSC };
      const view = fitView(context);
      expect(view.scrollFrame).toBe(0);
      expect(view.scrollFrame + context.width / view.pxPerFrame).toBeGreaterThanOrEqual(contentEnd);
    }
  });
});

describe("scroll clamping", () => {
  it("never scrolls before 0 or more than 25% of the view past the content end", () => {
    const context = { width: 800, contentEnd: 1000, fps: FPS };
    // 2 px/frame: 400 frames visible, so the view may start at most at 1000 - 300.
    expect(clampScroll(-5, 2, context)).toBe(0);
    expect(clampScroll(900, 2, context)).toBe(700);
    expect(clampScroll(650.5, 2, context)).toBe(650.5);
    // Content shorter than the view: no scrolling at all.
    expect(clampScroll(10, 0.5, context)).toBe(0);
    expect(scrollBy({ pxPerFrame: 2, scrollFrame: 0 }, 100, context)).toEqual({ pxPerFrame: 2, scrollFrame: 50 });
    const end = { pxPerFrame: 2, scrollFrame: 700 };
    expect(scrollBy(end, 100, context)).toBe(end);
  });
});

describe("anchored zoom", () => {
  it("keeps the frame under the cursor fixed at every zoom level", () => {
    for (let px = MIN_PX_PER_FRAME; px <= MAX_PX_PER_FRAME; px *= 1.37) {
      for (const anchorX of [0, 1, 123.5, 400, 799]) {
        for (const factor of [wheelZoomFactor(-100), wheelZoomFactor(100), wheelZoomFactor(-3), wheelZoomFactor(7), ZOOM_IN_STEP, ZOOM_OUT_STEP]) {
          // A scroll position deep inside the content, so the clamps do not bind.
          const view = { pxPerFrame: px, scrollFrame: 500_000 };
          const frame = view.scrollFrame + anchorX / view.pxPerFrame;
          const next = zoomAt(view, px * factor, frame, anchorX, LONG);
          const target = Math.min(MAX_PX_PER_FRAME, Math.max(Math.min(zoomLimits(LONG).min, px), px * factor));
          expect(next.pxPerFrame).toBeCloseTo(target, 9);
          expect((frame - next.scrollFrame) * next.pxPerFrame).toBeCloseTo(anchorX, 6);
        }
      }
    }
  });

  it("stops at the limits and lets the clamps win at frame 0", () => {
    const context = { width: 800, contentEnd: 3000, fps: FPS };
    const limits = zoomLimits(context);
    expect(zoomAt({ pxPerFrame: 390, scrollFrame: 10 }, 1000, 12, 5, context).pxPerFrame).toBe(MAX_PX_PER_FRAME);
    expect(zoomAt({ pxPerFrame: limits.min * 1.1, scrollFrame: 0 }, limits.min / 2, 100, 400, context).pxPerFrame).toBe(limits.min);
    // Zooming out near frame 0 cannot keep the anchor where it was: the view starts at 0 instead.
    expect(zoomAt({ pxPerFrame: 10, scrollFrame: 5 }, 1, 25, 200, context).scrollFrame).toBe(0);
  });

  it("never pushes a view that is already below the limit further out, but lets it zoom in", () => {
    const context = { width: 800, contentEnd: 30, fps: FPS };
    const min = zoomLimits(context).min;
    const below = { pxPerFrame: min / 4, scrollFrame: 0 };
    expect(zoomAt(below, below.pxPerFrame * ZOOM_OUT_STEP, 0, 0, context).pxPerFrame).toBe(below.pxPerFrame);
    expect(zoomAt(below, below.pxPerFrame * ZOOM_IN_STEP, 0, 0, context).pxPerFrame).toBeCloseTo(below.pxPerFrame * ZOOM_IN_STEP);
  });

  it("anchors key zoom at the playhead when visible, else at the view center", () => {
    const view = { pxPerFrame: 2, scrollFrame: 100 };
    expect(keyZoomAnchor(view, 150, 800)).toEqual({ frame: 150, x: 100 });
    expect(keyZoomAnchor(view, 50, 800)).toEqual({ frame: 300, x: 400 });
    expect(keyZoomAnchor(view, 600, 800)).toEqual({ frame: 300, x: 400 });
  });
});

describe("slider and wheel", () => {
  it("maps the slider logarithmically over the limits and back", () => {
    const limits = { min: 0.05, max: 400 };
    expect(sliderToPx(0, limits)).toBeCloseTo(0.05);
    expect(sliderToPx(1, limits)).toBeCloseTo(400);
    expect(sliderToPx(0.5, limits)).toBeCloseTo(Math.sqrt(0.05 * 400));
    for (const px of [0.05, 0.3, 4, 77, 400]) expect(sliderToPx(pxToSlider(px, limits), limits)).toBeCloseTo(px, 9);
    expect(pxToSlider(0.001, limits)).toBe(0);
    expect(pxToSlider(1000, limits)).toBe(1);
    expect(pxToSlider(5, { min: 400, max: 400 })).toBe(1);
  });

  it("makes one wheel notch one key step and normalizes line and page deltas", () => {
    expect(wheelZoomFactor(-100)).toBeCloseTo(ZOOM_IN_STEP);
    expect(wheelZoomFactor(100)).toBeCloseTo(ZOOM_OUT_STEP);
    expect(wheelZoomFactor(0)).toBe(1);
    expect(wheelDeltaPx(3, 1, 500)).toBe(48);
    expect(wheelDeltaPx(1, 2, 500)).toBe(500);
    expect(wheelDeltaPx(-12.5, 0, 500)).toBe(-12.5);
  });
});

describe("pageToFrame (follow playhead)", () => {
  // 800 px at 4 px/frame: 200 frames visible.
  const view = { pxPerFrame: 4, scrollFrame: 100 };

  it("pages exactly when the playhead leaves the right edge, by one view width minus 10%", () => {
    expect(pageToFrame(view, 100, LONG)).toBeNull();
    // x = 796 px: the playhead line is still inside the 800 px area.
    expect(pageToFrame(view, 299, LONG)).toBeNull();
    expect(pageToFrame({ pxPerFrame: 4, scrollFrame: 100.1 }, 299.9, LONG)).toBeNull();
    // x = 800 px: it left.
    expect(pageToFrame(view, 300, LONG)).toEqual({ pxPerFrame: 4, scrollFrame: 280 });
    // After the page it sits 10% inside the left edge.
    expect((300 - 280) * 4).toBe(80);
  });

  it("brings a frame far beyond the view in 10% inside the edge it comes in from", () => {
    expect(pageToFrame(view, 5000, LONG)).toEqual({ pxPerFrame: 4, scrollFrame: 4980 });
    expect(pageToFrame(view, 99, LONG)).toEqual({ pxPerFrame: 4, scrollFrame: 0 });
    expect(pageToFrame({ pxPerFrame: 4, scrollFrame: 5000 }, 4999, LONG)).toEqual({ pxPerFrame: 4, scrollFrame: 4820 });
    expect(pageToFrame({ pxPerFrame: 4, scrollFrame: 5000 }, 1000, LONG)).toEqual({ pxPerFrame: 4, scrollFrame: 820 });
  });

  it("stays within the scroll limits and does nothing when the view cannot move", () => {
    const short: ZoomContext = { width: 800, contentEnd: 400, fps: FPS };
    // The view may end at most 25% of its width past the content end: scroll <= 400 - 150.
    expect(pageToFrame({ pxPerFrame: 4, scrollFrame: 100 }, 300, short)).toEqual({ pxPerFrame: 4, scrollFrame: 250 });
    expect(pageToFrame({ pxPerFrame: 4, scrollFrame: 250 }, 450, short)).toBeNull();
    expect(pageToFrame(view, 300, { ...LONG, width: 0 })).toBeNull();
  });
});

describe("zoom to selection", () => {
  it("frames the span with 10% of the view free on each side, centered", () => {
    // 100 frames in 800 px: 640 px for them, 6.4 px/frame, 80 px (12.5 frames) of margin on each side.
    const view = zoomToSpan(1000, 1100, LONG);
    expect(view.pxPerFrame).toBeCloseTo(6.4, 9);
    expect(view.scrollFrame).toBeCloseTo(1000 - 12.5, 9);
  });

  it("stays within the zoom limits and the scroll range", () => {
    // One frame would need 640 px/frame: 400 at most, still centered.
    const one = zoomToSpan(500, 501, LONG);
    expect(one.pxPerFrame).toBe(MAX_PX_PER_FRAME);
    expect(one.scrollFrame).toBeCloseTo(500.5 - 1, 9);
    // At the start the margin cannot go before frame 0.
    expect(zoomToSpan(0, 100, LONG).scrollFrame).toBe(0);
    // Wider than the content plus 2 s: Fit at most.
    const short: ZoomContext = { width: 800, contentEnd: 300, fps: FPS };
    expect(zoomToSpan(0, 300, short).pxPerFrame).toBe(fitPxPerFrame(short));
  });
});

describe("animated zoom steps", () => {
  it("moves the zoom geometrically from the start to the target with the anchor held", () => {
    const from = { pxPerFrame: 4, scrollFrame: 1000 };
    const anchor = { frame: 1050, x: 200 };
    const to = zoomAt(from, 5, anchor.frame, anchor.x, LONG);
    expect(interpolateZoom(from, to, anchor, 0, LONG)).toBe(from);
    expect(interpolateZoom(from, to, anchor, 1, LONG)).toBe(to);
    const half = interpolateZoom(from, to, anchor, 0.5, LONG);
    expect(half.pxPerFrame).toBeCloseTo(Math.sqrt(20), 9);
    // The anchor frame stays under its x all along.
    expect((anchor.frame - half.scrollFrame) * half.pxPerFrame).toBeCloseTo(200, 9);
  });

  it("eases into a target the scroll clamp moved, never before frame 0", () => {
    const from = { pxPerFrame: 4, scrollFrame: 0 };
    const anchor = { frame: 10, x: 40 };
    const to = zoomAt(from, 3.2, anchor.frame, anchor.x, LONG);
    expect(to.scrollFrame).toBe(0);
    for (const t of [0.25, 0.5, 0.75]) expect(interpolateZoom(from, to, anchor, t, LONG).scrollFrame).toBeGreaterThanOrEqual(0);
  });
});
