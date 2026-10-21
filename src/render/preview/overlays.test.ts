import { describe, expect, it } from "vitest";
import { ACTION_SAFE, centeredRect, gridLines, rulerStep, safeZoneOn, ticksIn, TITLE_SAFE } from "./overlays.js";
import { SAFE_ZONE_SPECS } from "./safeZones.js";

const FRAME = { width: 1080, height: 1920 };
const inside = (outer: { x: number; y: number; width: number; height: number }, inner: { x: number; y: number; width: number; height: number }) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;
const overlaps = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe("safe zones", () => {
  it("has a top bar, an action column on the right and a caption area at the bottom, the safe rectangle clear of them", () => {
    for (const spec of Object.values(SAFE_ZONE_SPECS)) {
      expect(spec.regions.map((region) => region.label)).toEqual(["Top bar", "Actions", "Caption"]);
      const [top, actions, caption] = spec.regions;
      expect(top).toMatchObject({ x: 0, y: 0, width: 1080 });
      expect((actions?.x ?? 0) + (actions?.width ?? 0)).toBe(1080);
      expect((caption?.y ?? 0) + (caption?.height ?? 0)).toBe(1920);
      for (const region of spec.regions) {
        expect(inside({ x: 0, y: 0, ...FRAME }, region)).toBe(true);
        expect(overlaps(region, spec.safe)).toBe(false);
      }
    }
  });

  it("scales the 1080 x 1920 measurements to the frame; none has nothing", () => {
    const reels = safeZoneOn("reels", { width: 720, height: 1280 });
    const safe = reels?.safe;
    const expected = { x: (65 * 2) / 3, y: (270 * 2) / 3, width: (853 * 2) / 3, height: (980 * 2) / 3 };
    for (const key of ["x", "y", "width", "height"] as const) expect(safe?.[key]).toBeCloseTo(expected[key], 9);
    expect(reels?.regions[1]).toMatchObject({ label: "Actions", x: 612, width: 108 });
    expect(safeZoneOn("none", FRAME)).toBeNull();
  });
});

describe("grids and safe margins", () => {
  it("draws thirds, centered squares and N x N cells", () => {
    expect(gridLines("thirds", 4, FRAME)).toEqual({ xs: [360, 720], ys: [640, 1280] });
    expect(gridLines("squares", 4, FRAME)).toEqual({ xs: [360, 720], ys: [60, 420, 780, 1140, 1500, 1860] });
    expect(gridLines("custom", 4, FRAME)).toEqual({ xs: [270, 540, 810], ys: [480, 960, 1440] });
    expect(gridLines("none", 4, FRAME)).toEqual({ xs: [], ys: [] });
    // A landscape frame: the cells are a third of the height, the middle column centered.
    expect(gridLines("squares", 3, { width: 1920, height: 1080 }).xs).toEqual([60, 420, 780, 1140, 1500, 1860]);
  });

  it("puts title-safe inside action-safe, both centered", () => {
    expect(centeredRect(FRAME, ACTION_SAFE)).toEqual({ x: 54, y: 96, width: 972, height: 1728 });
    expect(centeredRect(FRAME, TITLE_SAFE)).toEqual({ x: 108, y: 192, width: 864, height: 1536 });
  });
});

describe("rulers", () => {
  it("picks 1-2-5 steps with labels at least the gap apart", () => {
    expect(rulerStep(2, 60)).toEqual({ major: 50, minor: 10 });
    expect(rulerStep(8, 60)).toEqual({ major: 10, minor: 2 });
    expect(rulerStep(1.5, 60)).toEqual({ major: 50, minor: 10 });
    expect(rulerStep(30, 60)).toEqual({ major: 2, minor: 1 });
    expect(rulerStep(100, 60)).toEqual({ major: 1, minor: 1 });
  });

  it("lists the ticks in a range", () => {
    expect(ticksIn(-7, 31, 10)).toEqual([0, 10, 20, 30]);
    expect(ticksIn(0, 1e6, 1, 5)).toHaveLength(5);
  });
});
