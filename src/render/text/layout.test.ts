import { afterEach, describe, expect, it, vi } from "vitest";
import type { TextBox, TextStyle } from "../../core/document/types.js";
import { DEFAULT_TEXT_STYLE, textContent } from "../../text/style.js";
import { layoutText, wrapParagraph } from "./layout.js";
import { approximateMeasurer, invalidateTextLayouts, onTextLayoutsChanged, setTextMeasurer, textLayout, textLayoutVersion } from "./layoutCache.js";

// The approximate measurer: every character 0.55 em wide (55 px at 100 px), ink 0.72 em up and 0.2 em
// down, em box 0.9 / 0.25 em.
const style = (patch: Partial<TextStyle> = {}): TextStyle => ({ ...structuredClone(DEFAULT_TEXT_STYLE), fontSize: 100, lineHeight: 1.2, ...patch });
const layout = (value: string, patch: Partial<TextStyle> = {}, box: TextBox = { mode: "auto", width: 900 }) => layoutText(textContent(value, box), style(patch), approximateMeasurer, "sans-serif");

describe("layoutText", () => {
  it("sizes an auto box to its widest line, one slot per line, lines centered", () => {
    const l = layout("Hello\nWorld!");
    expect(l.width).toBe(330);
    expect(l.height).toBe(240);
    expect(l.lines.map((line) => line.text)).toEqual(["Hello", "World!"]);
    expect(l.lines[0]?.x).toBe(27.5);
    expect(l.lines[1]?.x).toBe(0);
    // The em box (115 px) centered in the 120 px slot: baseline 2.5 + 90.
    expect(l.lines[0]?.baseline).toBeCloseTo(92.5);
    expect(l.lines[1]?.baseline).toBeCloseTo(212.5);
    expect(l.font).toBe('700 100px "Inter", sans-serif');
  });

  it("aligns lines left and right", () => {
    expect(layout("ab\nabcd", { align: "left" }).lines.map((line) => line.x)).toEqual([0, 0]);
    expect(layout("ab\nabcd", { align: "right" }).lines.map((line) => line.x)).toEqual([110, 0]);
  });

  it("wraps words in a fixed box and drops the spaces at a wrap", () => {
    const l = layout("aa bb  cc", {}, { mode: "fixed", width: 150 });
    expect(l.lines.map((line) => line.text)).toEqual(["aa", "bb", "cc"]);
    expect(l.width).toBe(150);
    expect(layout("aa b c dd", {}, { mode: "fixed", width: 300 }).lines.map((line) => line.text)).toEqual(["aa b", "c dd"]);
  });

  it("breaks a word wider than the box between characters", () => {
    expect(wrapParagraph("abcdefgh", 150, (text) => text.length * 55)).toEqual(["ab", "cd", "ef", "gh"]);
    expect(wrapParagraph("x abcdefgh y", 150, (text) => text.length * 55)).toEqual(["x", "ab", "cd", "ef", "gh", "y"]);
    // Narrower than one character: one character per line.
    expect(wrapParagraph("abc", 10, (text) => text.length * 55)).toEqual(["a", "b", "c"]);
    expect(wrapParagraph("", 100, () => 0)).toEqual([""]);
  });

  it("keeps explicit line breaks and empty lines", () => {
    const l = layout("a\n\nb");
    expect(l.lines.map((line) => line.text)).toEqual(["a", "", "b"]);
    expect(l.height).toBe(360);
    expect(l.glyphs).toHaveLength(2);
  });

  it("applies the case and the letter spacing (not after the last character)", () => {
    const l = layout("ab", { textCase: "upper", letterSpacing: 10 });
    expect(l.lines[0]?.text).toBe("AB");
    // 2 x (55 + 10) - 10.
    expect(l.lines[0]?.width).toBe(120);
    expect(l.width).toBe(120);
  });

  it("grows the content box by the background padding, one box per line or one for the block", () => {
    const background = { ...DEFAULT_TEXT_STYLE.background, enabled: true, paddingX: 20, paddingY: 10 };
    const block = layout("ab\nabcd", { background: { ...background, mode: "block" } });
    expect([block.width, block.height]).toEqual([220 + 40, 240 + 20]);
    expect(block.block).toEqual({ x: 20, y: 10, width: 220, height: 240 });
    expect(block.lines[0]?.x).toBe(20 + 55);
    expect(block.backgrounds).toEqual([{ x: 0, y: 0, width: 260, height: 260 }]);
    const lines = layout("ab\n\nabcd", { background: { ...background, mode: "line" } });
    expect(lines.backgrounds).toEqual([
      { x: 20 + 55 - 20, y: 0, width: 110 + 40, height: 140 },
      { x: 0, y: 240, width: 260, height: 140 },
    ]);
  });

  it("gives each line's ink box as its glyph bounds", () => {
    const l = layout("ab");
    // Ink 0..110 wide, 72 up and 20 down from the baseline at 92.5.
    expect(l.glyphs).toEqual([{ x: 0, y: 92.5 - 72, width: 110, height: 92 }]);
  });

  it("covers the stroke and the shadow in the raster rect, in whole px with one to spare", () => {
    const plain = layout("ab");
    expect(plain.raster).toEqual({ x: -1, y: 19, width: 112, height: 95 });
    const styled = layout("ab", {
      stroke: { enabled: true, width: 6, color: DEFAULT_TEXT_STYLE.stroke.color },
      shadow: { enabled: true, x: 10, y: 20, blur: 5, color: { r: 0, g: 0, b: 0, a: 0.5 } },
    });
    // Ink 0..110 x 20.5..112.5, stroked -6..116 x 14.5..118.5, its shadow 4..126 x 34.5..138.5 grown by
    // 1.5 blurs (7.5): -3.5..133.5 x 27..146.
    expect(styled.raster).toEqual({ x: -7, y: 13, width: 142, height: 134 });
  });

  it("draws nothing for an empty text without a background, and keeps a box", () => {
    const l = layout("");
    expect(l.raster).toBeNull();
    expect(l.glyphs).toEqual([]);
    expect(l.width).toBe(1);
    expect(l.height).toBe(120);
  });
});

describe("textLayout cache", () => {
  afterEach(() => setTextMeasurer(null));

  it("returns the same layout for the same objects until layouts are invalidated", () => {
    setTextMeasurer(approximateMeasurer);
    const content = textContent("Hi");
    const s = style();
    const first = textLayout(content, s);
    expect(textLayout(content, s)).toBe(first);
    expect(textLayout(textContent("Hi"), s)).not.toBe(first);
    const listener = vi.fn();
    const stop = onTextLayoutsChanged(listener);
    const version = textLayoutVersion();
    invalidateTextLayouts();
    stop();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(textLayoutVersion()).toBe(version + 1);
    const next = textLayout(content, s);
    expect(next).not.toBe(first);
    expect(next).toEqual(first);
  });

  it("measures with the installed measurer", () => {
    setTextMeasurer({ measure: (text) => ({ width: text.length * 10, left: 0, right: text.length * 10, ascent: 5, descent: 1 }), fontMetrics: () => ({ ascent: 8, descent: 2 }) });
    expect(textLayout(textContent("abc"), style()).width).toBe(30);
  });
});
