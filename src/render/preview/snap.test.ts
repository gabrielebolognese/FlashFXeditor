import { describe, expect, it } from "vitest";
import type { Rect } from "./canvasLayers.js";
import {
  buildCanvasSnap,
  CanvasSnapIndex,
  formatDistance,
  handleGuides,
  isAxisAligned,
  measureGuides,
  moveGuides,
  nearestLine,
  snapHandle,
  snapMove,
  SNAP_FRAME,
  SNAP_LAYER,
  SNAP_SAFE,
  type SnapSources,
} from "./snap.js";

const FRAME = { width: 1080, height: 1920 };
const BOTH = { x: true, y: true };
const rect = (x0: number, y0: number, x1: number, y1: number): Rect => ({ x0, y0, x1, y1 });
const sources = (fields: Partial<SnapSources> = {}): SnapSources => ({ frame: FRAME, thirds: false, safe: [], layers: [], ...fields });
const values = (lines: readonly { value: number }[]) => lines.map((line) => line.value);

describe("canvas snap candidates (spec §7.4)", () => {
  it("collects the frame center and edges, thirds only while shown, safe edges, and layer edges and centers", () => {
    expect(values(buildCanvasSnap(sources()).x)).toEqual([0, 540, 1080]);
    expect(values(buildCanvasSnap(sources()).y)).toEqual([0, 960, 1920]);
    const c = buildCanvasSnap(sources({ thirds: true, safe: [{ x: 60, y: 100, width: 900, height: 1500 }], layers: [rect(100, 200, 300, 400)] }));
    expect(values(c.x)).toEqual([0, 60, 100, 200, 300, 360, 540, 720, 960, 1080]);
    expect(values(c.y)).toEqual([0, 100, 200, 300, 400, 640, 960, 1280, 1600, 1920]);
    expect(c.x.find((line) => line.value === 360)?.priority).toBe(SNAP_FRAME);
    expect(c.x.find((line) => line.value === 60)?.priority).toBe(SNAP_SAFE);
    expect(c.x.find((line) => line.value === 200)).toMatchObject({ priority: SNAP_LAYER, rect: rect(100, 200, 300, 400) });
  });

  it("orders lines on the same value by priority", () => {
    const c = buildCanvasSnap(sources({ layers: [rect(540, 0, 700, 100)] }));
    expect(c.x.filter((line) => line.value === 540).map((line) => line.priority)).toEqual([SNAP_FRAME, SNAP_LAYER]);
  });

  it("makes equal-spacing midpoints between every two layers one after the other", () => {
    const top = rect(400, 100, 680, 300);
    const bottom = rect(400, 900, 680, 1100);
    const c = buildCanvasSnap(sources({ layers: [top, bottom] }));
    expect(c.spacingY).toEqual([{ value: 600, a: top, b: bottom, room: 600 }]);
    // Side by side on y (they overlap across x): no x spacing.
    expect(c.spacingX).toEqual([]);
  });

  it("rebuilds only when the sources change by value", () => {
    const index = new CanvasSnapIndex();
    const a = index.get(sources({ layers: [rect(0, 0, 10, 10)] }));
    expect(index.get(sources({ layers: [rect(0, 0, 10, 10)] }))).toBe(a);
    for (let i = 0; i < 50; i++) index.get(sources({ layers: [rect(0, 0, 10, 10)] }));
    expect(index.rebuilds).toBe(1);
    expect(index.queries).toBe(52);
    index.get(sources({ layers: [rect(0, 0, 10, 12)] }));
    expect(index.rebuilds).toBe(2);
    index.get(sources({ layers: [rect(0, 0, 10, 12)], thirds: true }));
    index.get(sources({ layers: [rect(0, 0, 10, 12)], thirds: true, safe: [{ x: 1, y: 2, width: 3, height: 4 }] }));
    expect(index.rebuilds).toBe(4);
  });
});

describe("canvas snap resolution (spec §7.4)", () => {
  // A 200 x 100 box; reach 12 project px (6 CSS px at half size).
  const box = (x: number, y: number) => rect(x, y, x + 200, y + 100);
  const REACH = 12;

  it("snaps the box center to the frame center on both axes within reach, not beyond", () => {
    const c = buildCanvasSnap(sources());
    // Center at (548, 1050): 8 and 90 px off.
    expect(snapMove(c, box(448, 1000), REACH, BOTH)).toEqual({ x: -8, y: 0 });
    expect(snapMove(c, box(445, 905), REACH, BOTH)).toEqual({ x: -5, y: 5 });
    // The same screen distance at another zoom: 6 CSS px at 2 CSS px per project px is 3 project px.
    expect(snapMove(c, box(445, 905), 3, BOTH)).toEqual({ x: 0, y: 0 });
    expect(snapMove(c, box(442, 908), 3, BOTH)).toEqual({ x: -2, y: 2 });
  });

  it("tests the edges and the center, the nearest target winning", () => {
    const c = buildCanvasSnap(sources({ layers: [rect(700, 0, 800, 50)] }));
    // Left edge 705 is 5 from the layer's left edge, center 805 5 from its right edge: either way -5.
    expect(snapMove(c, box(705, 500), REACH, BOTH).x).toBe(-5);
    // Right edge 1077 is 3 from the frame edge; left edge 877 has nothing near.
    expect(snapMove(c, box(877, 500), REACH, BOTH).x).toBe(3);
  });

  it("breaks a tie in distance by priority", () => {
    const c = buildCanvasSnap(sources({ layers: [rect(534, 1500, 600, 1600)] }));
    // Center 537: 3 from the frame center (frame) and 3 from the layer's left edge 534 (layer).
    expect(nearestLine(c.x, [537], REACH)).toMatchObject({ offset: 3, priority: SNAP_FRAME });
  });

  it("sticks while the pointer stays within reach", () => {
    const c = buildCanvasSnap(sources());
    for (const x of [430, 435, 440, 445, 450]) {
      const snap = snapMove(c, box(x, 0), REACH, { x: true, y: false });
      expect(x + snap.x).toBe(440);
    }
    expect(snapMove(c, box(453, 0), REACH, { x: true, y: false }).x).toBe(0);
  });

  it("snaps the free axes only (Shift)", () => {
    const c = buildCanvasSnap(sources());
    expect(snapMove(c, box(445, 905), REACH, { x: false, y: true })).toEqual({ x: 0, y: 5 });
  });

  it("snaps the middle of three layers in a column to equal spacing", () => {
    const top = rect(400, 100, 680, 300);
    const bottom = rect(400, 900, 680, 1100);
    const c = buildCanvasSnap(sources({ layers: [top, bottom] }));
    // The middle box (280 x 200) centered at y 607: equal gaps at 600.
    const middle = rect(390, 507, 670, 707);
    expect(snapMove(c, middle, REACH, BOTH).y).toBe(-7);
    const guides = moveGuides(c, rect(390, 500, 670, 700));
    expect(guides.spans).toEqual([
      { vertical: true, at: 535, from: 300, to: 500, distance: 200 },
      { vertical: true, at: 535, from: 700, to: 900, distance: 200 },
    ]);
  });

  it("shows an equal gap once when the box is also aligned with the layers", () => {
    const c = buildCanvasSnap(sources({ layers: [rect(400, 100, 680, 300), rect(400, 900, 680, 1100)] }));
    const guides = moveGuides(c, rect(400, 500, 680, 700));
    expect(guides.lines.map((line) => line.at)).toEqual([400, 540, 540, 680]);
    expect(guides.spans).toEqual([
      { vertical: true, at: 540, from: 300, to: 500, distance: 200 },
      { vertical: true, at: 540, from: 700, to: 900, distance: 200 },
    ]);
  });

  it("ignores equal spacing when the box is not in line with both layers or another layer is between them", () => {
    const top = rect(400, 100, 680, 300);
    const bottom = rect(400, 900, 680, 1100);
    // Off to the side: no overlap across.
    expect(snapMove(buildCanvasSnap(sources({ layers: [top, bottom] })), rect(700, 507, 900, 707), REACH, { x: false, y: true }).y).toBe(0);
    // A third layer in the room.
    const blocker = rect(420, 400, 500, 450);
    expect(snapMove(buildCanvasSnap(sources({ layers: [top, bottom, blocker] })), rect(390, 507, 670, 707), REACH, { x: false, y: true }).y).toBe(0);
    // Too big for the room: no spacing guides at the midpoint.
    expect(moveGuides(buildCanvasSnap(sources({ layers: [top, bottom] })), rect(390, 290, 670, 910)).spans).toEqual([]);
  });
});

describe("canvas snap guides (spec §7.4)", () => {
  it("draws frame lines across the frame, crossing at the center", () => {
    const c = buildCanvasSnap(sources());
    const guides = moveGuides(c, rect(440, 910, 640, 1010));
    expect(guides.lines).toEqual([
      { vertical: true, at: 540, from: 0, to: 1920 },
      { vertical: false, at: 960, from: 0, to: 1080 },
    ]);
    expect(guides.spans).toEqual([]);
  });

  it("spans a layer line from the dragged box to the layer and shows the distance between them", () => {
    const layer = rect(100, 1200, 300, 1300);
    const c = buildCanvasSnap(sources({ layers: [layer] }));
    // Left edges aligned at 100, the dragged box above the layer.
    const guides = moveGuides(c, rect(100, 800, 250, 900));
    expect(guides.lines).toEqual([{ vertical: true, at: 100, from: 800, to: 1300 }]);
    expect(guides.spans).toEqual([{ vertical: true, at: 100, from: 900, to: 1200, distance: 300 }]);
  });

  it("measures the distance once per layer even when several edges align", () => {
    const layer = rect(100, 1200, 300, 1300);
    const c = buildCanvasSnap(sources({ layers: [layer] }));
    const guides = moveGuides(c, rect(100, 800, 300, 900));
    expect(guides.lines.map((line) => line.at)).toEqual([100, 200, 300]);
    expect(guides.spans).toHaveLength(1);
  });

  it("guides a scale handle on its free axes", () => {
    const c = buildCanvasSnap(sources({ layers: [rect(700, 1200, 800, 1300)] }));
    const guides = handleGuides(c, rect(500, 800, 700, 900), { x: 700, y: 900 }, { x: true, y: false });
    expect(guides.lines).toEqual([{ vertical: true, at: 700, from: 800, to: 1300 }]);
    expect(guides.spans).toEqual([{ vertical: true, at: 700, from: 900, to: 1200, distance: 300 }]);
  });

  it("measures from each side to the nearest layer in line, else to the frame edge (Alt)", () => {
    const right = rect(800, 850, 900, 1000);
    const far = rect(950, 900, 1000, 950);
    const c = buildCanvasSnap(sources({ layers: [right, far, rect(0, 0, 50, 50)] }));
    const guides = measureGuides(c, rect(400, 900, 600, 1100));
    expect(guides.lines).toEqual([]);
    expect(guides.spans).toEqual([
      { vertical: false, at: 1000, from: 0, to: 400, distance: 400 },
      { vertical: false, at: 950, from: 600, to: 800, distance: 200 },
      { vertical: true, at: 500, from: 0, to: 900, distance: 900 },
      { vertical: true, at: 500, from: 1100, to: 1920, distance: 820 },
    ]);
  });

  it("measures an overhang as a negative distance and skips a side on the edge", () => {
    const guides = measureGuides(buildCanvasSnap(sources()), rect(-20, 0, 500, 100));
    expect(guides.spans.map((span) => span.distance)).toEqual([-20, 580, 1820]);
  });

  it("labels distances in whole px, else one decimal", () => {
    expect(formatDistance(300)).toBe("300");
    expect(formatDistance(12.25)).toBe("12.3");
    expect(formatDistance(-0.01)).toBe("0");
  });
});

describe("scale handle snapping (spec §7.4)", () => {
  const c = buildCanvasSnap(sources({ layers: [rect(700, 1200, 800, 1300)] }));

  it("snaps the dragged edge on its free axis", () => {
    // An e handle at x 695, fixed point at x 500: 5 from the layer's left edge.
    expect(snapHandle(c, { x: 695, y: 850 }, { x: 500, y: 850 }, { x: true, y: false }, false, 12)).toEqual({ x: 700, y: 850 });
    expect(snapHandle(c, { x: 680, y: 850 }, { x: 500, y: 850 }, { x: true, y: false }, false, 12)).toBeNull();
  });

  it("keeps the aspect of a uniform corner: the nearer axis wins, the other follows the diagonal", () => {
    // Fixed at (500, 800), the corner at (696, 898): 4 from the layer's left edge (x 700), no y target in reach.
    const aim = snapHandle(c, { x: 696, y: 898 }, { x: 500, y: 800 }, BOTH, true, 12);
    expect(aim?.x).toBeCloseTo(700, 9);
    expect(aim?.y).toBeCloseTo(800 + 98 * (200 / 196), 9);
    // Shift (non-uniform): each axis on its own.
    expect(snapHandle(c, { x: 696, y: 1195 }, { x: 500, y: 800 }, BOTH, false, 12)).toEqual({ x: 700, y: 1200 });
  });

  it("knows an axis-aligned box from a turned one", () => {
    expect(isAxisAligned([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: 0, y: 5 }])).toBe(true);
    expect(isAxisAligned([{ x: 10, y: 0 }, { x: 10, y: 10 }, { x: 5, y: 10 }, { x: 5, y: 0 }])).toBe(true);
    expect(isAxisAligned([{ x: 0, y: 0 }, { x: 10, y: 1 }, { x: 9, y: 6 }, { x: -1, y: 5 }])).toBe(false);
  });
});
