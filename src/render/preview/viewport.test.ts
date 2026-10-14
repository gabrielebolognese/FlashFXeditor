import { describe, expect, it } from "vitest";
import { applyToPoint, mutableIdentity } from "../mat3.js";
import { deviceSizeInto, frameTransformInto, zoomLabel, type PreviewZoom, type Size } from "./viewport.js";

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
  });
});
