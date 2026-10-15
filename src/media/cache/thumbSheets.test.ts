import { describe, expect, it } from "vitest";
import { makeMedia } from "../../core/document/fixtures.js";
import {
  addSheet,
  cellOrigin,
  chooseLevel,
  emptyThumbIndex,
  firstMissingSheet,
  hasSheet,
  levelIntervalUs,
  readThumbIndex,
  sameLayout,
  sheetSize,
  sheetTimes,
  thumbIndex,
  thumbLayout,
  type ThumbLayout,
} from "./thumbSheets.js";

const stamp = { size: 1000, lastModified: 42 };
const video = (fields: Partial<ReturnType<typeof makeMedia>> = {}) => ({ ...makeMedia("v", "video", 10_000_000), width: 1920, height: 1080, fps: { num: 30, den: 1 }, ...fields });
const layoutOf = (fields: Partial<ReturnType<typeof makeMedia>> = {}) => thumbLayout(video(fields)) as ThumbLayout;

describe("thumbLayout", () => {
  it("makes 160 px tall thumbnails at the shown aspect, with the three levels of spec §9.6", () => {
    const layout = layoutOf();
    expect(layout.width).toBe(284);
    expect(layout.height).toBe(160);
    // 10 s: LOD0 at 0, 2, 4, 6, 8 s; LOD1 every 0.5 s; LOD2 every 5 frames at 30 fps.
    expect(layout.levels.map((l) => l.intervalUs)).toEqual([2_000_000, 500_000, 166_667]);
    expect(layout.levels.map((l) => l.count)).toEqual([5, 20, 60]);
    expect(layout.levels.map((l) => l.sheets)).toEqual([1, 2, 4]);
  });

  it("turns rotated video upright and bounds extreme aspects", () => {
    expect(layoutOf({ rotation: 90 }).width).toBe(90);
    expect(layoutOf({ width: 8000, height: 100 }).width).toBe(640);
    expect(layoutOf({ width: 10, height: 4000 }).width).toBe(16);
  });

  it("has no layout for stills, audio or a video without a size", () => {
    expect(thumbLayout(makeMedia("i", "image"))).toBeNull();
    expect(thumbLayout(makeMedia("a", "audio"))).toBeNull();
    expect(thumbLayout(makeMedia("v", "video"))).toBeNull();
  });

  it("spaces LOD2 by the media's frame rate", () => {
    expect(levelIntervalUs(2, { num: 60, den: 1 })).toBe(83_333);
    expect(levelIntervalUs(2, { num: 30000, den: 1001 })).toBe(166_833);
    expect(sameLayout(layoutOf(), layoutOf({ fps: { num: 60, den: 1 } }))).toBe(false);
    expect(sameLayout(layoutOf(), layoutOf())).toBe(true);
  });
});

describe("sheets", () => {
  it("lists the media times of a sheet's thumbnails, the last sheet partial", () => {
    const layout = layoutOf();
    expect(sheetTimes(layout, 1, 0)).toHaveLength(16);
    expect(sheetTimes(layout, 1, 1)).toEqual([8_000_000, 8_500_000, 9_000_000, 9_500_000]);
    expect(sheetTimes(layout, 0, 0)).toEqual([0, 2_000_000, 4_000_000, 6_000_000, 8_000_000]);
    expect(sheetSize(layout, 4)).toEqual({ width: 4 * 284, height: 160 });
    expect(sheetSize(layout, 5)).toEqual({ width: 4 * 284, height: 320 });
    expect(sheetSize(layout, 2)).toEqual({ width: 2 * 284, height: 160 });
  });

  it("finds the nearest thumbnail of a level and its cell", () => {
    const layout = layoutOf();
    expect(thumbIndex(layout, 1, 740_000)).toBe(1);
    expect(thumbIndex(layout, 1, 760_000)).toBe(2);
    expect(thumbIndex(layout, 0, -5)).toBe(0);
    expect(thumbIndex(layout, 0, 60_000_000)).toBe(4);
    expect(cellOrigin(layout, 17)).toEqual({ x: 284, y: 0 });
    expect(cellOrigin(layout, 6)).toEqual({ x: 2 * 284, y: 160 });
  });

  it("picks the coarsest level that gives each tile its own frame", () => {
    const layout = layoutOf();
    expect(chooseLevel(layout, 3_000_000)).toBe(0);
    expect(chooseLevel(layout, 2_000_000)).toBe(0);
    expect(chooseLevel(layout, 1_999_999)).toBe(1);
    expect(chooseLevel(layout, 500_000)).toBe(1);
    expect(chooseLevel(layout, 200_000)).toBe(2);
    expect(chooseLevel(layout, 1_000)).toBe(2);
  });
});

describe("index.json", () => {
  it("round-trips the sheets written and lists what is missing, eager levels first", () => {
    const layout = layoutOf();
    const index = emptyThumbIndex(layout, "full", stamp);
    expect(firstMissingSheet(index, [0, 1])).toEqual({ level: 0, sheet: 0 });
    addSheet(index, 0, 0);
    addSheet(index, 1, 1);
    addSheet(index, 1, 1);
    expect(firstMissingSheet(index, [0, 1])).toEqual({ level: 1, sheet: 0 });
    const read = readThumbIndex(JSON.stringify(index), layout, "full", stamp);
    expect(read).toEqual(index);
    expect(read && hasSheet(read, 1, 1)).toBe(true);
    expect(read && hasSheet(read, 2, 0)).toBe(false);
    addSheet(index, 1, 0);
    expect(firstMissingSheet(index, [0, 1])).toBeNull();
    expect(firstMissingSheet(index, [2])).toEqual({ level: 2, sheet: 0 });
    expect(firstMissingSheet(index, [2], (_level, sheet) => sheet < 2)).toEqual({ level: 2, sheet: 2 });
  });

  it("reads a stale, foreign or damaged index as null", () => {
    const layout = layoutOf();
    const text = JSON.stringify(emptyThumbIndex(layout, "full", stamp));
    expect(readThumbIndex(text, layout, "full", { size: 1001, lastModified: 42 })).toBeNull();
    expect(readThumbIndex(text, layout, "proxy", stamp)).toBeNull();
    expect(readThumbIndex(text, layoutOf({ rotation: 90 }), "full", stamp)).toBeNull();
    expect(readThumbIndex(text, layoutOf({ durationUs: 20_000_000 }), "full", stamp)).toBeNull();
    expect(readThumbIndex("{", layout, "full", stamp)).toBeNull();
    expect(readThumbIndex("null", layout, "full", stamp)).toBeNull();
  });

  it("drops sheet numbers that are out of range", () => {
    const layout = layoutOf();
    const index = emptyThumbIndex(layout, "full", stamp);
    (index.levels[0] as { sheets: unknown[] }).sheets = [0, 3, -1, 0.5, "1"];
    expect(readThumbIndex(JSON.stringify(index), layout, "full", stamp)?.levels[0]?.sheets).toEqual([0]);
  });
});
