import { describe, expect, it } from "vitest";
import { fontExtension, fontShorthand, formatFontManifest, nearestFace, parseFaceStyle, parseFontManifest, quoteFamily, usedFamilies } from "./fonts.js";

describe("fontShorthand", () => {
  it("writes style, weight, size, the quoted family and the fallback", () => {
    expect(fontShorthand({ fontFamily: "Inter", fontWeight: 700, italic: false }, 96, "sans-serif")).toBe('700 96px "Inter", sans-serif');
    expect(fontShorthand({ fontFamily: 'My "Font"', fontWeight: 450.4, italic: true }, 12.5, "")).toBe('italic 450 12.5px "My \\"Font\\""');
    expect(quoteFamily("a\\b")).toBe('"a\\\\b"');
  });
});

describe("parseFaceStyle", () => {
  it("reads weight words and italics", () => {
    expect(parseFaceStyle("Regular")).toEqual({ weight: 400, italic: false });
    expect(parseFaceStyle("Bold Italic")).toEqual({ weight: 700, italic: true });
    expect(parseFaceStyle("SemiBold")).toEqual({ weight: 600, italic: false });
    expect(parseFaceStyle("Semibold Italic")).toEqual({ weight: 600, italic: true });
    expect(parseFaceStyle("ExtraBold")).toEqual({ weight: 800, italic: false });
    expect(parseFaceStyle("Extra Light")).toEqual({ weight: 200, italic: false });
    expect(parseFaceStyle("UltraLight")).toEqual({ weight: 200, italic: false });
    expect(parseFaceStyle("Light Oblique")).toEqual({ weight: 300, italic: true });
    expect(parseFaceStyle("Semilight")).toEqual({ weight: 350, italic: false });
    expect(parseFaceStyle("Medium")).toEqual({ weight: 500, italic: false });
    expect(parseFaceStyle("Black")).toEqual({ weight: 900, italic: false });
    expect(parseFaceStyle("Heavy Italic")).toEqual({ weight: 900, italic: true });
    expect(parseFaceStyle("Thin")).toEqual({ weight: 100, italic: false });
    expect(parseFaceStyle("Condensed")).toEqual({ weight: 400, italic: false });
  });
});

describe("nearestFace", () => {
  const faces = [
    { name: "Light", weight: 300, italic: false },
    { name: "Regular", weight: 400, italic: false },
    { name: "Bold", weight: 700, italic: false },
    { name: "Black", weight: 900, italic: false },
    { name: "Italic", weight: 400, italic: true },
  ];
  const pick = (weight: number, italic: boolean) => nearestFace(faces, weight, italic)?.name;

  it("matches the exact face", () => {
    expect(pick(700, false)).toBe("Bold");
    expect(pick(400, true)).toBe("Italic");
  });

  it("follows the CSS weight order", () => {
    // 400..500: up to 500, then down, then up.
    expect(pick(500, false)).toBe("Regular");
    // Above 500: up first.
    expect(pick(600, false)).toBe("Bold");
    expect(pick(800, false)).toBe("Black");
    // Below 400: down first, then up.
    expect(pick(350, false)).toBe("Light");
    expect(pick(200, false)).toBe("Light");
  });

  it("falls back to the other style when the family has no face of the asked one", () => {
    expect(pick(700, true)).toBe("Italic");
    expect(nearestFace(faces.slice(0, 2), 400, true)?.name).toBe("Regular");
    expect(nearestFace([], 400, false)).toBeNull();
  });
});

describe("font manifest", () => {
  it("round-trips faces and drops what is not one", () => {
    const faces = [{ family: "Segoe UI", style: "Bold", weight: 700, italic: false, postscriptName: "SegoeUI-Bold", file: "SegoeUI-Bold.ttf" }];
    expect(parseFontManifest(formatFontManifest(faces))).toEqual(faces);
    expect(parseFontManifest("not json")).toEqual([]);
    expect(parseFontManifest(JSON.stringify({ faces: [{ family: "A", file: "../x.ttf" }, { family: "B", file: ".hidden" }, { family: "", file: "c.ttf" }, null, { family: "D", file: "d.ttf" }] }))).toEqual([
      { family: "D", style: "Regular", weight: 400, italic: false, postscriptName: "d.ttf", file: "d.ttf" },
    ]);
  });

  it("names a file by its sfnt tag", () => {
    const bytes = (tag: string) => new Uint8Array([...tag].map((c) => c.charCodeAt(0)));
    expect(fontExtension(bytes("OTTO"))).toBe(".otf");
    expect(fontExtension(bytes("ttcf"))).toBe(".ttc");
    expect(fontExtension(new Uint8Array([0, 1, 0, 0]))).toBe(".ttf");
  });

  it("lists the families text clips use", () => {
    expect(usedFamilies([{ kind: "text", style: { fontFamily: "B" } }, { kind: "video" }, { kind: "text", style: { fontFamily: "A" } }, { kind: "text", style: { fontFamily: "B" } }])).toEqual(["A", "B"]);
  });
});
