import { describe, expect, it } from "vitest";
import type { TextSpan, TextStyle } from "../../core/document/types.js";
import { DEFAULT_TEXT_STYLE, textContent } from "../../text/style.js";
import { decorationBoxes, layoutText, measureStyled, type RunMetrics, type StyledContent, type TextMeasurer } from "./layout.js";
import { atlasUnits, lineStops } from "./atlas.js";
import { approximateMeasurer, textLayout, withSpans } from "./layoutCache.js";

// Every character 50 px wide at size 100, but 100 px in a weight 900 run: spans change the advance.
const wide: TextMeasurer = {
  measure(text, font, size, spacing): RunMetrics {
    const per = (/(^| )900 /.test(font) ? 1 : 0.5) * size + spacing;
    return { width: text.length * per, left: 0, right: text.length * per - spacing, ascent: 0.7 * size, descent: 0.2 * size };
  },
  fontMetrics: (_font, size) => ({ ascent: 0.9 * size, descent: 0.25 * size }),
};
const style = (patch: Partial<TextStyle> = {}): TextStyle => ({ ...structuredClone(DEFAULT_TEXT_STYLE), fontSize: 100, lineHeight: 1.2, fontWeight: 400, letterSpacing: 0, align: "left", ...patch });
const heavy = (start: number, end: number): TextSpan => ({ start, end, style: { fontWeight: 900 } });
const content = (value: string, spans: TextSpan[] | undefined, box: { mode: "auto" | "fixed"; width: number } = { mode: "auto", width: 900 }): StyledContent => ({ ...textContent(value, box), spans });

describe("layoutText with spans", () => {
  it("measures each run in its own font", () => {
    // "abcd" with "bc" heavy: 50 + 100 + 100 + 50.
    const l = layoutText(content("abcd", [heavy(1, 3)]), style(), wide, "sans-serif");
    expect(l.width).toBe(300);
    expect(l.lines[0]?.width).toBe(300);
    expect(l.spans).toEqual([heavy(1, 3)]);
  });

  it("is the plain layout without spans, and ignores empty spans", () => {
    const plain = layoutText(textContent("abcd", { mode: "auto", width: 900 }), style(), wide, "sans-serif");
    expect(layoutText(content("abcd", []), style(), wide, "sans-serif")).toEqual({ ...plain, spans: undefined });
    expect(plain.width).toBe(200);
    expect(plain.spans).toBeUndefined();
  });

  it("wraps with the runs' widths", () => {
    // "aa bb" in a 250 box: plain fits (250), with "bb" heavy it is 50+50+50+100+100 = 350 and wraps.
    const box = { mode: "fixed", width: 250 } as const;
    expect(layoutText(content("aa bb", undefined, box), style(), wide, "sans-serif").lines.map((line) => line.text)).toEqual(["aa bb"]);
    expect(layoutText(content("aa bb", [heavy(3, 5)], box), style(), wide, "sans-serif").lines.map((line) => line.text)).toEqual(["aa", "bb"]);
  });

  it("keeps span offsets across lines", () => {
    // "ab\ncd" with "cd" heavy: the second line (start 3) is two heavy chars.
    const l = layoutText(content("ab\ncd", [heavy(3, 5)]), style(), wide, "sans-serif");
    expect(l.lines.map((line) => line.width)).toEqual([100, 200]);
  });

  it("grows the raster over underline and highlight boxes", () => {
    const plain = layoutText(content("ab", undefined), style(), wide, "sans-serif");
    const marked = layoutText(content("ab", [{ start: 0, end: 2, style: { underline: true, highlight: { r: 1, g: 1, b: 0, a: 1 } } }]), style(), wide, "sans-serif");
    expect(marked.spanBoxes.length).toBe(2);
    const bottom = (rect: { y: number; height: number } | null) => (rect ? rect.y + rect.height : 0);
    expect(bottom(marked.raster)).toBeGreaterThan(bottom(plain.raster));
  });

  it("lays a style-only span (color) out like plain text", () => {
    const plain = layoutText(content("abcd", undefined), style(), wide, "sans-serif");
    const colored = layoutText(content("abcd", [{ start: 1, end: 3, style: { fill: { r: 1, g: 0, b: 0, a: 1 } } }]), style(), wide, "sans-serif");
    expect(colored.width).toBe(plain.width);
    expect(colored.lines[0]?.ink).toEqual(plain.lines[0]?.ink);
  });
});

describe("measureStyled, decorationBoxes and the atlas", () => {
  it("combines the runs' ink and advance", () => {
    const m = measureStyled(wide, [heavy(1, 3)], style(), "sans-serif", 100, 0, "abcd", 0);
    expect(m.width).toBe(300);
    expect(m.right).toBe(300);
  });

  it("puts the underline under the baseline and the strike through the x-height", () => {
    const boxes = decorationBoxes({ underline: true, strike: true, highlight: { r: 1, g: 1, b: 0, a: 1 } }, 10, 40, 100, 90, 25, 100);
    expect(boxes.highlight).toEqual({ x: 10, y: 10, width: 40, height: 115 });
    expect(boxes.underline?.y).toBeGreaterThan(100);
    expect(boxes.strike?.y).toBeLessThan(100);
  });

  it("places a word unit after its prefix measured run by run", () => {
    const l = layoutText(content("ab cd", [heavy(0, 2)]), style(), wide, "sans-serif");
    const words = atlasUnits(l, style(), wide, "word");
    // "ab" is heavy (200 wide), then a 50 px space: "cd" starts at 250.
    expect(words.map((unit) => [unit.text, unit.x])).toEqual([
      ["ab", 0],
      ["cd", 250],
    ]);
    expect(lineStops(l, style(), wide)[0]).toEqual([0, 100, 200, 250, 300, 350]);
  });
});

describe("withSpans", () => {
  it("returns one object per (content, spans) pair and the content itself without spans", () => {
    const base = textContent("abc", { mode: "auto", width: 900 });
    const spans = [heavy(0, 1)];
    expect(withSpans(base, undefined)).toBe(base);
    expect(withSpans(base, [])).toBe(base);
    expect(withSpans(base, spans)).toBe(withSpans(base, spans));
    expect(withSpans(base, spans)).not.toBe(base);
    expect("spans" in withSpans(base, [], true)).toBe(true);
  });

  it("lays out through the cache with the spans", () => {
    const base = textContent("abcd", { mode: "auto", width: 900 });
    const a = textLayout(withSpans(base, [heavy(0, 4)]), style());
    const b = textLayout(base, style());
    expect(a).not.toBe(b);
    expect(approximateMeasurer).toBeDefined();
  });
});
