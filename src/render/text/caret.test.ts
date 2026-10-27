import { describe, expect, it } from "vitest";
import type { TextBox, TextStyle } from "../../core/document/types.js";
import { DEFAULT_TEXT_STYLE, textContent } from "../../text/style.js";
import { caretAt, caseMap, graphemeBoundaries, indexAtPoint, lineEdge, selectionRects, verticalMove, wordAt, type CaretContext } from "./caret.js";
import { layoutText } from "./layout.js";
import { approximateMeasurer } from "./layoutCache.js";

// The approximate measurer: every character 0.55 em wide (55 px at 100 px) plus the letter spacing;
// the em box 0.9 em up and 0.25 em down.
const style = (patch: Partial<TextStyle> = {}): TextStyle => ({ ...structuredClone(DEFAULT_TEXT_STYLE), fontSize: 100, lineHeight: 1.2, ...patch });

function context(value: string, patch: Partial<TextStyle> = {}, box: TextBox = { mode: "auto", width: 900 }, scale = 1): CaretContext {
  const s = style(patch);
  return { layout: layoutText(textContent(value, box), s, approximateMeasurer, "sans-serif"), style: s, value, measurer: approximateMeasurer, fallback: "sans-serif", scale };
}

describe("caret stops", () => {
  it("puts the caret at each character's advance, the em box high", () => {
    const c = context("Hello");
    expect([0, 1, 2, 5].map((i) => caretAt(c, i).x)).toEqual([0, 55, 110, 275]);
    const caret = caretAt(c, 2);
    expect(caret.line).toBe(0);
    const baseline = c.layout.lines[0]?.baseline as number;
    expect(caret.top).toBeCloseTo(baseline - 90);
    expect(caret.bottom).toBeCloseTo(baseline + 25);
  });

  it("measures at the raster scale and gives content px", () => {
    const at1 = context("Hello", { align: "right" });
    const at05 = context("Hello", { align: "right" }, undefined, 0.5);
    expect([0, 3, 5].map((i) => caretAt(at05, i).x)).toEqual([0, 3, 5].map((i) => caretAt(at1, i).x));
  });

  it("sits in the letter spacing gap between characters, at the advance box's ends", () => {
    // 65 px per character, the line 5 x 65 - 10 = 315 wide.
    const c = context("Hello", { letterSpacing: 10 });
    expect(caretAt(c, 0).x).toBe(0);
    expect(caretAt(c, 2).x).toBe(125);
    expect(caretAt(c, 5).x).toBe(315);
  });

  it("follows the lines' alignment", () => {
    const c = context("ab\nabcd", { align: "right" });
    expect(caretAt(c, 0).x).toBe(110);
    expect(caretAt(c, 2).x).toBe(220);
    expect(caretAt(c, 3)).toMatchObject({ line: 1, x: 0 });
  });
});

describe("caret lines", () => {
  it("puts the end of a paragraph on its line and the next index on the next line", () => {
    const c = context("ab\ncd", { align: "left" });
    expect(caretAt(c, 2)).toMatchObject({ line: 0, x: 110 });
    expect(caretAt(c, 3)).toMatchObject({ line: 1, x: 0 });
    expect(caretAt(c, 5)).toMatchObject({ line: 1, x: 110 });
  });

  it("keeps the spaces a wrap dropped at the end of their line", () => {
    const c = context("aa bb  cc", { align: "left" }, { mode: "fixed", width: 150 });
    expect(c.layout.lines.map((line) => [line.text, line.start, line.end])).toEqual([
      ["aa", 0, 2],
      ["bb", 3, 5],
      ["cc", 7, 9],
    ]);
    expect(caretAt(c, 3)).toMatchObject({ line: 1, x: 0 });
    expect(caretAt(c, 6)).toMatchObject({ line: 1, x: 110 });
    expect(caretAt(c, 7)).toMatchObject({ line: 2, x: 0 });
  });

  it("goes downstream at a break inside a word unless asked for the line before", () => {
    const c = context("abcdefgh", { align: "left" }, { mode: "fixed", width: 150 });
    expect(caretAt(c, 2)).toMatchObject({ line: 1, x: 0 });
    expect(caretAt(c, 2, true)).toMatchObject({ line: 0, x: 110 });
    expect(lineEdge(c, 0, "end")).toEqual({ index: 2, upstream: true });
  });

  it("maps a case that changes lengths grapheme by grapheme", () => {
    const map = caseMap("aß", "upper");
    expect(map.shown).toBe("ASS");
    expect(map.toShown(2)).toBe(3);
    expect(map.toSource(2)).toBe(1);
    const c = context("aß", { textCase: "upper", align: "left" });
    expect(caretAt(c, 2).x).toBe(165);
    expect(caretAt(c, 1).x).toBe(55);
  });

  it("stops on grapheme boundaries", () => {
    expect(graphemeBoundaries("éx")).toEqual([0, 2, 3]);
    expect(graphemeBoundaries("")).toEqual([0]);
  });
});

describe("selection", () => {
  it("covers each line's slot, with a sliver past a line break", () => {
    const c = context("ab\ncd", { align: "left" });
    const rects = selectionRects(c, 4, 1);
    expect(rects).toHaveLength(2);
    expect(rects[0]).toEqual({ x: 55, y: c.layout.lines[0]?.top, width: 55 + 25, height: 120 });
    expect(rects[1]).toEqual({ x: 0, y: c.layout.lines[1]?.top, width: 55, height: 120 });
    expect(selectionRects(c, 2, 2)).toEqual([]);
  });

  it("shows a selected empty line as a sliver", () => {
    const c = context("a\n\nb", { align: "left" });
    expect(selectionRects(c, 0, 4).map((rect) => rect.width)).toEqual([55 + 25, 25, 55]);
  });
});

describe("pointer and keys", () => {
  it("finds the nearest caret stop under a point", () => {
    const c = context("ab\ncd", { align: "left" });
    expect(indexAtPoint(c, 70, 10).index).toBe(1);
    expect(indexAtPoint(c, 100, 10).index).toBe(2);
    expect(indexAtPoint(c, -40, 130).index).toBe(3);
    expect(indexAtPoint(c, 999, 999).index).toBe(5);
  });

  it("moves up and down at the goal x, to the ends past the first and last lines", () => {
    const c = context("abc\nabcde", { align: "left" });
    expect(verticalMove(c, 1, 1, caretAt(c, 1).x).index).toBe(5);
    expect(verticalMove(c, 8, -1, caretAt(c, 8).x).index).toBe(3);
    expect(verticalMove(c, 2, -1, 0).index).toBe(0);
    expect(verticalMove(c, 6, 1, 0).index).toBe(9);
  });

  it("finds the line's edges", () => {
    const c = context("ab\ncd", { align: "left" });
    expect(lineEdge(c, 4, "start").index).toBe(3);
    expect(lineEdge(c, 4, "end").index).toBe(5);
    expect(lineEdge(c, 1, "end")).toEqual({ index: 2, upstream: false });
  });

  it("selects words, space runs and punctuation runs", () => {
    expect(wordAt("hello world", 2)).toEqual({ from: 0, to: 5 });
    expect(wordAt("hello  world", 5)).toEqual({ from: 5, to: 7 });
    expect(wordAt("don't stop!!", 10)).toEqual({ from: 10, to: 12 });
    expect(wordAt("don't stop", 1)).toEqual({ from: 0, to: 5 });
    expect(wordAt("a\nb", 1)).toEqual({ from: 1, to: 1 });
    expect(wordAt("", 0)).toEqual({ from: 0, to: 0 });
  });
});
