import { describe, expect, it } from "vitest";
import { applyToPoint, mutableIdentity } from "../mat3.js";
import { clampPan, deviceSizeInto, frameTransformInto, MAX_ZOOM, panBy, viewScale, zoomAround, zoomLabel, type PreviewZoom, type Size, type ViewState } from "./viewport.js";

const frameTransform = (zoom: PreviewZoom, frame: Size, target: Size, margin: number) => frameTransformInto(mutableIdentity(), zoom, frame, target, margin);

const FRAME = { width: 1080, height: 1920 };

describe("frameTransformInto", () => {
  it("letterboxes a 9:16 frame at Fit inside the margin, centered on whole pixels", () => {
    const m = frameTransform("fit", FRAME, { width: 1000, height: 1000 }, 20);
    const topLeft = applyToPoint(m, 0, 0);
    const bottomRight = applyToPoint(m, FRAME.width, FRAME.height);
    expect(bottomRight.y - topLeft.y).toBe(960);
    expect(topLeft.y).toBe(20);
    expect(bottomRight.x - topLeft.x).toBe(540);
    expect(topLeft.x).toBe(230);
    expect(Number.isInteger(topLeft.x) && Number.isInteger(bottomRight.x)).toBe(true);
  });

  it("pillarboxes when the panel is taller than the frame", () => {
    const m = frameTransform("fit", { width: 1920, height: 1080 }, { width: 400, height: 900 }, 0);
    const a = applyToPoint(m, 0, 0);
    const b = applyToPoint(m, 1920, 1080);
    expect(b.x - a.x).toBe(400);
    expect(a.y).toBe(338);
  });

  it("drops the margin when the panel is too small for it", () => {
    const m = frameTransform("fit", FRAME, { width: 30, height: 30 }, 20);
    expect(applyToPoint(m, FRAME.width, FRAME.height).y - applyToPoint(m, 0, 0).y).toBe(30);
  });

  it("maps project px 1:1 to device px at 100%, centered", () => {
    const m = frameTransform(1, FRAME, { width: 800, height: 600 }, 16);
    expect(m[0]).toBe(1);
    expect(m[3]).toBe(1);
    expect(applyToPoint(m, 540, 960)).toEqual({ x: 400, y: 300 });
  });

  it("scales by the zoom", () => {
    const m = frameTransform(0.25, FRAME, { width: 1000, height: 1000 }, 16);
    expect(applyToPoint(m, 0, 0)).toEqual({ x: 365, y: 260 });
    expect(applyToPoint(m, FRAME.width, FRAME.height)).toEqual({ x: 635, y: 740 });
  });
});

describe("pan and zoom around a point", () => {
  const target = { width: 800, height: 1000 };
  const at = (view: ViewState) => frameTransformInto(mutableIdentity(), view.zoom, FRAME, target, 16, view.panX, view.panY);
  const project = (view: ViewState, x: number, y: number) => {
    const m = at(view);
    return { x: (x - m[4]) / m[0], y: (y - m[5]) / m[3] };
  };

  it("puts the panned frame point at the canvas center", () => {
    const m = at({ zoom: 2, panX: 100, panY: -50 });
    expect(applyToPoint(m, 640, 910)).toEqual({ x: 400, y: 500 });
  });

  it("keeps the project point under the anchor fixed, from Fit and between zooms", () => {
    let view: ViewState = { zoom: "fit", panX: 0, panY: 0 };
    const anchor = { x: 523, y: 311 };
    const before = project(view, anchor.x, anchor.y);
    for (const zoom of [0.8, 1.37, 2.9, 6]) {
      view = zoomAround(view, zoom, anchor.x, anchor.y, FRAME, target, 16);
      const now = project(view, anchor.x, anchor.y);
      // Within the whole-pixel rounding of the origin.
      expect(Math.abs(now.x - before.x) * (view.zoom as number)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(now.y - before.y) * (view.zoom as number)).toBeLessThanOrEqual(0.5);
    }
  });

  it("returns to the exact letterbox at Fit", () => {
    const zoomed = zoomAround({ zoom: "fit", panX: 0, panY: 0 }, 3, 100, 100, FRAME, target, 16);
    expect(zoomAround(zoomed, "fit", 0, 0, FRAME, target, 16)).toEqual({ zoom: "fit", panX: 0, panY: 0 });
    expect(at({ zoom: "fit", panX: 0, panY: 0 })).toEqual(frameTransformInto(mutableIdentity(), "fit", FRAME, target, 16));
  });

  it("clamps the zoom and the pan", () => {
    expect(zoomAround({ zoom: 1, panX: 0, panY: 0 }, 1000, 400, 500, FRAME, target, 16).zoom).toBe(MAX_ZOOM);
    expect(clampPan(2000, -5000, FRAME)).toEqual({ panX: 540, panY: -960 });
  });

  it("pans with the pointer in target px, not at Fit", () => {
    expect(panBy({ zoom: 2, panX: 0, panY: 0 }, 40, -20, FRAME)).toEqual({ zoom: 2, panX: -20, panY: 10 });
    const fit: ViewState = { zoom: "fit", panX: 0, panY: 0 };
    expect(panBy(fit, 40, 40, FRAME)).toBe(fit);
  });

  it("reads the Fit scale as drawn", () => {
    expect(viewScale("fit", FRAME, { width: 1000, height: 1000 }, 20)).toBe(540 / 1080);
    expect(viewScale(2, FRAME, target, 16)).toBe(2);
  });
});

describe("deviceSizeInto", () => {
  it("rounds css px times the device pixel ratio, at least 1, into the given struct", () => {
    const out = { width: 0, height: 0 };
    expect(deviceSizeInto(out, { width: 333, height: 0 }, 1.25)).toBe(out);
    expect(out).toEqual({ width: 416, height: 1 });
  });

  it("writes the transform into the given matrix", () => {
    const out = mutableIdentity();
    expect(frameTransformInto(out, 1, FRAME, { width: 800, height: 600 }, 16)).toBe(out);
  });
});

describe("zoomLabel", () => {
  it("names the zoom choices", () => {
    expect(zoomLabel("fit")).toBe("Fit");
    expect(zoomLabel(0.25)).toBe("25%");
    expect(zoomLabel(4)).toBe("400%");
    expect(zoomLabel(1.3749)).toBe("137%");
    expect(zoomLabel(0.0512)).toBe("5.1%");
  });
});
