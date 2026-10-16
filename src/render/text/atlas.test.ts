import { describe, expect, it } from "vitest";
import type { TextStyle } from "../../core/document/types.js";
import { DEFAULT_TEXT_STYLE, textContent } from "../../text/style.js";
import { atlasUnits, lineStops, packShelves } from "./atlas.js";
import { layoutText } from "./layout.js";
import { approximateMeasurer } from "./layoutCache.js";

const style = (patch: Partial<TextStyle> = {}): TextStyle => ({ ...structuredClone(DEFAULT_TEXT_STYLE), fontSize: 100, lineHeight: 1.2, align: "left", ...patch });

describe("packShelves", () => {
  it("fills rows left to right and starts a new row at the cap", () => {
    const packed = packShelves(
      [
        { width: 40, height: 10 },
        { width: 40, height: 20 },
        { width: 40, height: 5 },
        { width: 100, height: 8 },
      ],
      100,
    );
    expect(packed.positions).toEqual([
      { x: 1, y: 1 },
      { x: 42, y: 1 },
      { x: 1, y: 22 },
      { x: 1, y: 28 },
    ]);
    expect(packed.width).toBe(102);
    expect(packed.height).toBe(37);
  });

  it("is a 1 px atlas for no units", () => {
    expect(packShelves([], 100)).toEqual({ positions: [], width: 1, height: 1 });
  });
});

describe("atlasUnits", () => {
  it("places each word at its advance in the line, in reading order", () => {
    const s = style();
    const layout = layoutText(textContent("ab  cd\nef"), s, approximateMeasurer, "sans-serif");
    const units = atlasUnits(layout, s, approximateMeasurer, "word");
    expect(units.map((unit) => [unit.text, unit.line, unit.index, unit.x])).toEqual([
      ["ab", 0, 0, 0],
      ["cd", 0, 1, 220],
      ["ef", 1, 2, 0],
    ]);
    // Ink 0..110 x baseline-72..baseline+20, whole px with one to spare.
    const baseline = layout.lines[0]?.baseline as number;
    expect(units[0]?.rect).toEqual({ x: -1, y: Math.floor(baseline - 72) - 1, width: 112, height: Math.ceil(baseline + 20) + 1 - (Math.floor(baseline - 72) - 1) });
  });

  it("gives characters as units (graphemes, spaces left out) at their advance, with their middles", () => {
    const s = style();
    const layout = layoutText(textContent("ab c\nd"), s, approximateMeasurer, "sans-serif");
    const units = atlasUnits(layout, s, approximateMeasurer, "char");
    expect(units.map((unit) => [unit.text, unit.line, unit.offset, unit.x])).toEqual([
      ["a", 0, 0, 0],
      ["b", 0, 1, 55],
      ["c", 0, 3, 165],
      ["d", 1, 0, 0],
    ]);
    const baseline = layout.lines[0]?.baseline as number;
    // Ink 55..110 wide, baseline-72..baseline+20 tall.
    expect([units[1]?.originX, units[1]?.originY]).toEqual([82.5, baseline - 26]);
    expect(atlasUnits(layout, s, approximateMeasurer, "word")[1]).toMatchObject({ text: "c", offset: 3 });
  });

  it("gives each line's grapheme stops for a typewriter", () => {
    const s = style();
    const layout = layoutText(textContent("ab\n\nc"), s, approximateMeasurer, "sans-serif");
    expect(lineStops(layout, s, approximateMeasurer)).toEqual([[0, 55, 110], [0], [0, 55]]);
  });

  it("covers the stroke and the shadow, and gives lines as units", () => {
    const s = style({ stroke: { enabled: true, width: 4, color: DEFAULT_TEXT_STYLE.stroke.color }, shadow: { enabled: true, x: 6, y: 0, blur: 2, color: DEFAULT_TEXT_STYLE.shadow.color } });
    const layout = layoutText(textContent("ab cd"), s, approximateMeasurer, "sans-serif");
    const [line] = atlasUnits(layout, s, approximateMeasurer, "line");
    // Ink 0..275, stroked -4..279, its shadow 2..285 grown by 3: -1..288.
    expect(line?.text).toBe("ab cd");
    expect(line?.rect.x).toBe(-5);
    expect((line?.rect.x as number) + (line?.rect.width as number)).toBe(289);
    expect(atlasUnits(layoutText(textContent(""), s, approximateMeasurer, ""), s, approximateMeasurer, "word")).toEqual([]);
  });
});
