import { describe, expect, it } from "vitest";
import { applyToPoint } from "../mat3.js";
import { containTransform, deviceSize, frameTransform, rotatedContainTransform, zoomLabel } from "./viewport.js";

const FRAME = { width: 1080, height: 1920 };

describe("frameTransform", () => {
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

describe("containTransform", () => {
  it("fits a 4:3 image into a 9:16 frame across its width, vertically centered", () => {
    const m = containTransform({ width: 4000, height: 3000 }, FRAME);
    const a = applyToPoint(m, 0, 0);
    const b = applyToPoint(m, 1, 1);
    expect(a.x).toBeCloseTo(0, 9);
    expect(a.y).toBeCloseTo(555, 9);
    expect(b.x).toBeCloseTo(1080, 9);
    expect(b.y).toBeCloseTo(1365, 9);
  });
});

describe("deviceSize", () => {
  it("rounds css px times the device pixel ratio, at least 1", () => {
    expect(deviceSize({ width: 333, height: 0 }, 1.25)).toEqual({ width: 416, height: 1 });
  });
});

describe("zoomLabel", () => {
  it("names the zoom choices", () => {
    expect(zoomLabel("fit")).toBe("Fit");
    expect(zoomLabel(0.25)).toBe("25%");
    expect(zoomLabel(4)).toBe("400%");
  });
});

describe("rotatedContainTransform", () => {
  const coded = { width: 1920, height: 1080 };
  const box = { width: 1080, height: 1920 };
  const corners = (rotation: 0 | 90 | 180 | 270) => {
    const m = rotatedContainTransform(coded, rotation, box);
    return [applyToPoint(m, 0, 0), applyToPoint(m, 1, 0), applyToPoint(m, 0, 1)];
  };

  it("turns a landscape-coded portrait clip (rotation 90) clockwise to fill a portrait frame", () => {
    // Coded top-left goes to the top-right, top-right to the bottom-right, bottom-left to the top-left.
    expect(corners(90)).toEqual([
      { x: 1080, y: 0 },
      { x: 1080, y: 1920 },
      { x: 0, y: 0 },
    ]);
  });

  it("handles 180 and 270, and leaves 0 as a plain contain", () => {
    expect(corners(270)).toEqual([
      { x: 0, y: 1920 },
      { x: 0, y: 0 },
      { x: 1080, y: 1920 },
    ]);
    const half = rotatedContainTransform({ width: 1080, height: 1920 }, 180, box);
    expect(applyToPoint(half, 0, 0)).toEqual({ x: 1080, y: 1920 });
    expect(applyToPoint(half, 1, 1)).toEqual({ x: 0, y: 0 });
    expect(rotatedContainTransform(coded, 0, box)).toEqual(containTransform(coded, box));
  });
});
