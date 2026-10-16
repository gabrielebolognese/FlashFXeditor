import { describe, expect, it } from "vitest";
import { applyTextCase, contentKey, DEFAULT_TEXT_STYLE, fillColor, firstLine, isGradient, styleKey, textContent } from "./style.js";

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
