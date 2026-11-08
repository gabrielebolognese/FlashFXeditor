import { describe, expect, it } from "vitest";
import type { TextSpan } from "../core/document/types.js";
import { DEFAULT_TEXT_STYLE } from "./style.js";
import { applySpanStyle, clearSpanStyles, editSpans, isFormatOn, normalizeSpans, pieces, rangeHas, runStyle, toggleFormat } from "./spans.js";

const coral = { r: 1, g: 0.4, b: 0.3, a: 1 };
const span = (start: number, end: number, style: TextSpan["style"] = { fill: coral }): TextSpan => ({ start, end, style });

describe("normalizeSpans", () => {
  it("sorts, clamps, drops empty and plain runs and merges equal neighbors", () => {
    expect(normalizeSpans([span(6, 9), span(0, 3), span(3, 6), { start: 2, end: 2, style: { italic: true } }, { start: 9, end: 12, style: {} }], 8)).toEqual([span(0, 8)]);
  });
  it("returns undefined when nothing remains", () => {
    expect(normalizeSpans([span(2, 2)], 5)).toBeUndefined();
    expect(normalizeSpans(undefined, 5)).toBeUndefined();
  });
});

describe("editSpans", () => {
  // "SAVE 3 HOURS": the span covers "3 HOURS" (5..12).
  const before = "SAVE 3 HOURS";
  const spans = [span(5, 12)];
  it("keeps the span on the same words when text is typed before it", () => {
    expect(editSpans(spans, before, "SAVE NOW 3 HOURS")).toEqual([span(9, 16)]);
    expect(editSpans(spans, before, "X" + before)).toEqual([span(6, 13)]);
  });
  it("extends the span when typing inside it or right after its last character", () => {
    expect(editSpans(spans, before, "SAVE 3 HOUURS")).toEqual([span(5, 13)]);
    expect(editSpans(spans, before, before + "!")).toEqual([span(5, 13)]);
  });
  it("does not extend it when typing at its start", () => {
    expect(editSpans(spans, before, "SAVE X3 HOURS")).toEqual([span(6, 13)]);
  });
  it("places an edit at the caret when the typed character equals its neighbor", () => {
    // Caret before "3", type "3": the new character is plain, the span stays on the old words.
    expect(editSpans(spans, before, "SAVE 33 HOURS", 6)).toEqual([span(6, 13)]);
    // Underlined "SAVE" (0..4) in "SAVE EVERY", a space typed right after it extends the span.
    expect(editSpans([span(0, 4, { underline: true })], "SAVE EVERY", "SAVE  EVERY", 5)).toEqual([span(0, 5, { underline: true })]);
    // A deletion with a caret behaves as without one.
    expect(editSpans(spans, before, "SAVE 3 HOUS", 10)).toEqual([span(5, 11)]);
  });
  it("shrinks it on a deletion inside and drops it when emptied", () => {
    expect(editSpans(spans, before, "SAVE 3 HOUS")).toEqual([span(5, 11)]);
    expect(editSpans(spans, before, "SAVE ")).toBeUndefined();
  });
  it("cuts the part of a span a replacement overlaps", () => {
    // "E 3" replaced by "-": the span keeps " HOURS" after the new character.
    expect(editSpans(spans, before, "SAV- HOURS")).toEqual([span(4, 10)]);
    expect(editSpans(spans, before, "SAVE 3")).toEqual([span(5, 6)]);
  });
  it("keeps the style of a replacement inside a span", () => {
    expect(editSpans(spans, before, "SAVE 3 HAIRS")).toEqual([span(5, 12)]);
    expect(editSpans(spans, before, "SAVE 3 H")).toEqual([span(5, 8)]);
  });
  it("is the identity for an unchanged text and for no spans", () => {
    expect(editSpans(spans, before, before)).toBe(spans);
    expect(editSpans(undefined, before, "x")).toBeUndefined();
  });
  it("round-trips: typing then deleting the same characters restores the offsets", () => {
    const typed = editSpans(spans, before, "ab" + before) as TextSpan[];
    expect(editSpans(typed, "ab" + before, before)).toEqual(spans);
  });
});

describe("applySpanStyle and the toggles", () => {
  it("splits a span at the selection's edges", () => {
    const out = applySpanStyle([span(0, 10)], 3, 6, { italic: true }, 10) as TextSpan[];
    expect(out).toEqual([span(0, 3), span(3, 6, { fill: coral, italic: true }), span(6, 10)]);
  });
  it("styles a plain range and merges with equal neighbors", () => {
    expect(applySpanStyle([span(0, 3)], 3, 6, { fill: coral }, 10)).toEqual([span(0, 6)]);
  });
  it("clears every format over a range", () => {
    expect(clearSpanStyles([span(0, 10, { fill: coral, italic: true, underline: true })], 2, 5, 10)).toEqual([span(0, 2, { fill: coral, italic: true, underline: true }), span(5, 10, { fill: coral, italic: true, underline: true })]);
  });
  it("toggles bold on and off over the clip style", () => {
    const base = { fontWeight: 400, italic: false };
    const on = toggleFormat(undefined, 0, 4, "bold", base, 10);
    expect(on).toEqual([{ start: 0, end: 4, style: { fontWeight: 700 } }]);
    expect(isFormatOn(on, 0, 4, "bold", base)).toBe(true);
    expect(toggleFormat(on, 0, 4, "bold", base, 10)).toBeUndefined();
    // Half bold: toggling turns the rest on.
    expect(toggleFormat(on, 0, 8, "bold", base, 10)).toEqual([{ start: 0, end: 8, style: { fontWeight: 700 } }]);
  });
  it("turns a bold clip's words regular with weight 400", () => {
    const base = { fontWeight: 700, italic: false };
    expect(toggleFormat(undefined, 2, 5, "bold", base, 10)).toEqual([{ start: 2, end: 5, style: { fontWeight: 400 } }]);
  });
  it("toggles italic, underline and strike", () => {
    const base = { fontWeight: 400, italic: false };
    for (const kind of ["italic", "underline", "strike"] as const) {
      const on = toggleFormat(undefined, 1, 3, kind, base, 5);
      expect(isFormatOn(on, 1, 3, kind, base)).toBe(true);
      expect(toggleFormat(on, 1, 3, kind, base, 5)).toBeUndefined();
    }
  });
  it("rangeHas is false for an empty range", () => {
    expect(rangeHas([span(0, 3)], 2, 2, () => true)).toBe(false);
  });
});

describe("pieces and runStyle", () => {
  it("cuts a line at span boundaries as offsets into the line", () => {
    expect(pieces([span(5, 8)], 4, 10)).toEqual([
      { from: 0, to: 1, span: undefined },
      { from: 1, to: 4, span: { fill: coral } },
      { from: 4, to: 6, span: undefined },
    ]);
    expect(pieces(undefined, 0, 3)).toEqual([{ from: 0, to: 3, span: undefined }]);
    expect(pieces([span(0, 3)], 3, 3)).toEqual([]);
  });
  it("lets a span change the font choices only", () => {
    expect(runStyle(DEFAULT_TEXT_STYLE, { fill: coral })).toBe(DEFAULT_TEXT_STYLE);
    expect(runStyle(DEFAULT_TEXT_STYLE, { fontWeight: 900, italic: true })).toMatchObject({ fontWeight: 900, italic: true, fontFamily: DEFAULT_TEXT_STYLE.fontFamily });
  });
});
