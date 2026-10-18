import { describe, expect, it } from "vitest";
import { random } from "../timeline/edit/fuzzKit.js";
import { faceCovers, faceWeightDescriptor, fontExtension, FONT_MANIFEST_VERSION, FONT_ORIGINS, fontRecords, fontShorthand, formatFontManifest, nearestFace, parseFaceStyle, parseFontManifest, quoteFamily, usedFamilies, type ProjectFontFace } from "./fonts.js";

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
  const segoe: ProjectFontFace = { family: "Segoe UI", style: "Bold", weight: 700, italic: false, postscriptName: "SegoeUI-Bold", file: "SegoeUI-Bold.ttf", source: "system" };
  const anton: ProjectFontFace = { family: "Anton", style: "Regular", weight: 400, italic: false, postscriptName: "anton-latin-400-normal", file: "anton-latin-400-normal.woff2", source: "library", unicodeRange: "U+0000-00FF", origin: "anton/anton-latin-400-normal.woff2" };
  const inter: ProjectFontFace = { family: "Inter", style: "Variable", weight: 400, italic: true, postscriptName: "inter-latin-wght-italic", file: "inter-latin-wght-italic.woff2", source: "library", weightRange: [100, 900], origin: "inter/inter-latin-wght-italic.woff2" };
  const brand: ProjectFontFace = { family: "Brand", style: "Bold", weight: 700, italic: false, postscriptName: "Brand-Bold", file: "u1.ttf", source: "user", origin: "u1" };

  it("round-trips faces of every source (version 2) and drops what is not one", () => {
    const faces = [segoe, anton, inter, brand];
    const text = formatFontManifest(faces);
    expect(JSON.parse(text).version).toBe(FONT_MANIFEST_VERSION);
    expect(parseFontManifest(text)).toEqual(faces);
    expect(parseFontManifest("not json")).toEqual([]);
    expect(parseFontManifest(JSON.stringify({ version: 2, faces: [{ family: "A", file: "../x.ttf" }, { family: "B", file: ".hidden" }, { family: "", file: "c.ttf" }, null, { family: "D", file: "d.ttf", source: "nope", weightRange: [900, 100] }] }))).toEqual([
      { family: "D", style: "Regular", weight: 400, italic: false, postscriptName: "d.ttf", file: "d.ttf", source: "system" },
    ]);
  });

  it("migrates a version 1 manifest (Batch 28): its faces are system fonts", () => {
    const v1 = JSON.stringify({ version: 1, faces: [{ family: "Segoe UI", style: "Bold", weight: 700, italic: false, postscriptName: "SegoeUI-Bold", file: "SegoeUI-Bold.ttf", source: "library" }] });
    expect(parseFontManifest(v1)).toEqual([segoe]);
    expect(parseFontManifest(JSON.stringify({ faces: [{ family: "Segoe UI", file: "SegoeUI-Bold.ttf", style: "Bold", weight: 700, postscriptName: "SegoeUI-Bold" }] }))).toEqual([segoe]);
  });

  it("describes what a face draws: its weight descriptor and the weights it covers", () => {
    expect(faceWeightDescriptor(inter)).toBe("100 900");
    expect(faceWeightDescriptor(anton)).toBe("400");
    expect(faceCovers(inter, 650, true)).toBe(true);
    expect(faceCovers(inter, 650, false)).toBe(false);
    expect(faceCovers(anton, 400, false)).toBe(true);
    expect(faceCovers(anton, 700, false)).toBe(false);
  });

  it("groups faces into one record per family and source", () => {
    expect(fontRecords([inter, brand, anton, { ...anton, file: "anton-latin-ext-400-normal.woff2" }]).map((r) => [r.family, r.source, r.faces.length])).toEqual([
      ["Anton", "library", 2],
      ["Brand", "user", 1],
      ["Inter", "library", 1],
    ]);
  });

  // Property-based (Batch 47 style, extended to font records): random manifests survive a write and a
  // read unchanged, damaged ones never throw and only keep valid faces.
  it("round-trips random manifests and survives damaged ones (seeded)", () => {
    const rng = random(2851);
    const families = ["Inter", "Brand", 'Q"uote', "Ünïcødé", "Segoe UI"];
    for (let i = 0; i < 200; i += 1) {
      const faces: ProjectFontFace[] = Array.from({ length: rng.int(0, 6) }, (_, k) => {
        const source = rng.pick(["library", "user", "system"] as const);
        const ranged = source === "library" && rng.chance(0.5);
        return {
          family: rng.pick(families),
          style: rng.pick(["Regular", "Bold Italic", "Variable"]),
          weight: rng.int(1, 1000),
          italic: rng.chance(0.3),
          postscriptName: `ps-${i}-${k}`,
          file: `f${i}-${k}.${rng.pick(["ttf", "otf", "woff2"])}`,
          source,
          ...(ranged && { weightRange: [rng.int(1, 400), rng.int(500, 1000)] as const }),
          ...(source === "library" && rng.chance(0.7) && { unicodeRange: "U+0000-00FF" }),
          ...(source !== "system" && { origin: `o${k}` }),
        };
      });
      const text = formatFontManifest(faces);
      expect(parseFontManifest(text)).toEqual(faces);
      const damaged = text.slice(0, rng.int(0, text.length));
      const read = parseFontManifest(damaged);
      for (const face of read) expect(FONT_ORIGINS).toContain(face.source);
    }
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
