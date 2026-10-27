import { describe, expect, it } from "vitest";
import { applyTextCase, contentKey, DEFAULT_SUBTITLE_STYLE, DEFAULT_TEXT_STYLE, DEFAULT_TITLE_STYLE, fillColor, firstLine, isGradient, scaleTextStyle, styleKey, textContent, TEXT_LIMITS } from "./style.js";

describe("applyTextCase", () => {
  it("keeps, uppers and lowers the text", () => {
    expect(applyTextCase("Hello World", "none")).toBe("Hello World");
    expect(applyTextCase("Hello World", "upper")).toBe("HELLO WORLD");
    expect(applyTextCase("Hello World", "lower")).toBe("hello world");
  });

  it("capitalizes each word in title case, line breaks and punctuation included", () => {
    expect(applyTextCase("the QUICK brown-fox\nl'été (new)", "title")).toBe("The Quick Brown-Fox\nL'été (New)");
    expect(applyTextCase("ünïcode äpfel", "title")).toBe("Ünïcode Äpfel");
  });
});

describe("firstLine", () => {
  it("is the first line with the case applied", () => {
    expect(firstLine(textContent("first\nsecond"), { textCase: "upper" })).toBe("FIRST");
    expect(firstLine(textContent("only"), { textCase: "none" })).toBe("only");
    expect(firstLine(textContent(""), { textCase: "none" })).toBe("");
  });
});

describe("fills", () => {
  it("tells a gradient from a solid color", () => {
    const gradient = { from: { r: 1, g: 0, b: 0, a: 1 }, to: { r: 0, g: 0, b: 1, a: 1 } };
    expect(isGradient(gradient)).toBe(true);
    expect(isGradient({ r: 1, g: 1, b: 1, a: 1 })).toBe(false);
    expect(fillColor(gradient)).toEqual({ r: 1, g: 0, b: 0, a: 1 });
  });
});

describe("cache keys", () => {
  it("gives equal styles and contents equal keys, and differ on any value", () => {
    const copy = structuredClone(DEFAULT_TEXT_STYLE);
    expect(styleKey(copy)).toBe(styleKey(DEFAULT_TEXT_STYLE));
    expect(styleKey({ ...copy, fontSize: 97 })).not.toBe(styleKey(copy));
    expect(styleKey({ ...copy, stroke: { ...copy.stroke, enabled: true } })).not.toBe(styleKey(copy));
    expect(styleKey({ ...copy, fill: { from: copy.stroke.color, to: copy.shadow.color } })).not.toBe(styleKey(copy));
    expect(contentKey(textContent("a"))).toBe(contentKey(textContent("a")));
    expect(contentKey(textContent("a"))).not.toBe(contentKey(textContent("a", { mode: "fixed", width: 900 })));
    expect(contentKey(textContent("a"))).not.toBe(contentKey(textContent("b")));
  });

  it("memoizes per object", () => {
    const style = structuredClone(DEFAULT_TEXT_STYLE);
    expect(styleKey(style)).toBe(styleKey(style));
  });
});

describe("scaleTextStyle", () => {
  it("scales the font size and every px value with it", () => {
    const style = { ...structuredClone(DEFAULT_SUBTITLE_STYLE), letterSpacing: 2, stroke: { enabled: true, width: 3, color: { r: 0, g: 0, b: 0, a: 1 } } };
    const next = scaleTextStyle(style, 2);
    expect(next.fontSize).toBe(112);
    expect(next.letterSpacing).toBe(4);
    expect(next.stroke.width).toBe(6);
    expect(next.shadow).toMatchObject({ x: 0, y: 12, blur: 32 });
    expect(next.background).toMatchObject({ paddingX: 48, paddingY: 20, radius: 28, mode: "line", enabled: true });
    expect(next.lineHeight).toBe(style.lineHeight);
    expect(style.fontSize).toBe(56);
  });

  it("keeps the font size within its limits, the other values in step", () => {
    const next = scaleTextStyle({ ...structuredClone(DEFAULT_TEXT_STYLE), fontSize: 1000 }, 10);
    expect(next.fontSize).toBe(TEXT_LIMITS.fontSize.max);
    expect(next.shadow.y).toBe(12);
  });

  it("gives the Title and Subtitle defaults their looks", () => {
    expect(DEFAULT_TITLE_STYLE.fontSize).toBeGreaterThan(DEFAULT_SUBTITLE_STYLE.fontSize);
    expect(DEFAULT_TITLE_STYLE.shadow.enabled).toBe(true);
    expect(DEFAULT_SUBTITLE_STYLE.background.enabled).toBe(true);
  });
});
