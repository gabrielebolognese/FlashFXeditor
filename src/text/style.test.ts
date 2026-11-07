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

describe("styles of Batch 58: gradient fills and the background box's border and shadow", () => {
  const red = { r: 1, g: 0, b: 0, a: 1 };
  const blue = { r: 0, g: 0, b: 1, a: 1 };
  const gradient = { type: "linear" as const, angle: 0, center: { x: 0.5, y: 0.5 }, radius: 1, stops: [{ at: 0, color: red }, { at: 1, color: blue }] };

  it("shows a gradient's first color as the text color", () => {
    expect(fillColor(gradient)).toEqual(red);
  });

  it("changes the key with the gradient, the box border and the box shadow, and not without them", () => {
    const base = { ...DEFAULT_TEXT_STYLE };
    const key = styleKey(base);
    expect(styleKey({ ...base })).toBe(key);
    expect(styleKey({ ...base, fill: gradient })).not.toBe(key);
    expect(styleKey({ ...base, fill: { ...gradient, stops: [{ at: 0, color: red }, { at: 0.5, color: blue }, { at: 1, color: red }] } })).not.toBe(styleKey({ ...base, fill: gradient }));
    const border = { ...base, background: { ...base.background, stroke: { enabled: true, width: 3, color: red } } };
    expect(styleKey(border)).not.toBe(key);
    expect(styleKey({ ...border, background: { ...border.background, stroke: { enabled: true, width: 4, color: red } } })).not.toBe(styleKey(border));
    const shadow = { ...base, background: { ...base.background, shadow: { enabled: true, x: 7, y: 7, blur: 0, color: red } } };
    expect(styleKey(shadow)).not.toBe(key);
  });

  it("scales the box border and shadow with the style", () => {
    const style = { ...DEFAULT_TEXT_STYLE, background: { ...DEFAULT_TEXT_STYLE.background, stroke: { enabled: true, width: 4, color: red }, shadow: { enabled: true, x: 8, y: 8, blur: 10, color: red } } };
    const doubled = scaleTextStyle(style, 2);
    expect(doubled.background.stroke?.width).toBe(8);
    expect(doubled.background.shadow).toMatchObject({ x: 16, y: 16, blur: 20 });
    expect(style.background.stroke?.width).toBe(4);
  });
});
