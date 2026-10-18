import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { random } from "../../timeline/edit/fuzzKit.js";
import { fontFormat, isFontFileName, namesFromFileName, readFontNames } from "./sfnt.js";
import { bufferOf, makeSfnt, makeTtc, makeWoff, makeWoff2Stub, type TestFont } from "./testFonts.js";

const FIXTURES = join(__dirname, "fixtures");
const fixture = (name: string) => bufferOf(new Uint8Array(readFileSync(join(FIXTURES, name))));

const BOLD_ITALIC: TestFont = {
  names: [
    { id: 1, text: "Acme Sans Bold" },
    { id: 2, text: "Italic" },
    { id: 4, text: "Acme Sans Bold Italic" },
    { id: 6, text: "AcmeSans-BoldItalic" },
    { id: 16, text: "Acme Sans" },
    { id: 17, text: "Bold Italic" },
  ],
  os2: { weightClass: 700, selection: 0x1 },
};

describe("fontFormat", () => {
  it("tells the format from the signature", () => {
    expect(fontFormat(makeSfnt(BOLD_ITALIC))).toBe("ttf");
    expect(fontFormat(makeSfnt({ ...BOLD_ITALIC, flavor: "otf" }))).toBe("otf");
    expect(fontFormat(makeTtc(BOLD_ITALIC))).toBe("ttc");
    expect(fontFormat(makeWoff2Stub())).toBe("woff2");
    expect(fontFormat(new TextEncoder().encode("true...."))).toBe("ttf");
    expect(fontFormat(new TextEncoder().encode("<html>"))).toBeNull();
    expect(fontFormat(new Uint8Array(2))).toBeNull();
  });

  it("accepts the four extensions My fonts takes", () => {
    expect(["a.ttf", "B.OTF", "c.woff", "d.woff2"].map(isFontFileName)).toEqual([true, true, true, true]);
    expect(["a.ttc", "b.txt", "woff2"].map(isFontFileName)).toEqual([false, false, false]);
  });
});

describe("readFontNames (spec §20.1 name table)", () => {
  it("reads a real TTF and its WOFF: Silkscreen Bold", async () => {
    for (const file of ["silkscreen-latin-700-normal.ttf", "silkscreen-latin-700-normal.woff"]) {
      expect(await readFontNames(fixture(file)), file).toEqual({ family: "Silkscreen", style: "Bold", fullName: "Silkscreen Bold", postscriptName: "Silkscreen-Bold", weight: 700, italic: false, from: "name" });
    }
  });

  it("prefers the typographic family and style, with OS/2's weight and italic", async () => {
    const names = await readFontNames(bufferOf(makeSfnt(BOLD_ITALIC)));
    expect(names).toEqual({ family: "Acme Sans", style: "Bold Italic", fullName: "Acme Sans Bold Italic", postscriptName: "AcmeSans-BoldItalic", weight: 700, italic: true, from: "name" });
  });

  it("reads the same names from OTF, a collection and WOFF (compressed or stored)", async () => {
    const expected = await readFontNames(bufferOf(makeSfnt(BOLD_ITALIC)));
    expect(await readFontNames(bufferOf(makeSfnt({ ...BOLD_ITALIC, flavor: "otf" })))).toEqual(expected);
    expect(await readFontNames(bufferOf(makeTtc(BOLD_ITALIC)))).toEqual(expected);
    expect(await readFontNames(bufferOf(await makeWoff(BOLD_ITALIC, true)))).toEqual(expected);
    expect(await readFontNames(bufferOf(await makeWoff(BOLD_ITALIC, false)))).toEqual(expected);
  });

  it("falls back to the style name without OS/2, and to Mac Roman names", async () => {
    const mac: TestFont = {
      names: [
        { id: 1, text: "Old Face", platform: 1 },
        { id: 2, text: "Semibold Oblique", platform: 1 },
      ],
    };
    expect(await readFontNames(bufferOf(makeSfnt(mac)))).toEqual({ family: "Old Face", style: "Semibold Oblique", fullName: "Old Face Semibold Oblique", postscriptName: "OldFace-SemiboldOblique", weight: 600, italic: true, from: "name" });
  });

  it("takes Windows US English over other languages and platforms", async () => {
    const font: TestFont = {
      names: [
        { id: 1, text: "Mac Name", platform: 1 },
        { id: 1, text: "Nom Français", language: 0x040c },
        { id: 1, text: "English Name" },
        { id: 1, text: "Unicode Name", platform: 0 },
      ],
      os2: { weightClass: 3, selection: 0 },
    };
    const names = await readFontNames(bufferOf(makeSfnt(font)));
    expect(names?.family).toBe("English Name");
    expect(names?.style).toBe("Regular");
    // Old fonts give usWeightClass on a 1-9 scale.
    expect(names?.weight).toBe(300);
  });

  it("gives null for WOFF2, files without names, and damaged files", async () => {
    expect(await readFontNames(bufferOf(makeWoff2Stub()))).toBeNull();
    expect(await readFontNames(bufferOf(makeSfnt({ names: [{ id: 4, text: "Only a full name" }] })))).toBeNull();
    expect(await readFontNames(bufferOf(new TextEncoder().encode("not a font at all")))).toBeNull();
    const cut = makeSfnt(BOLD_ITALIC).slice(0, 30);
    expect(await readFontNames(bufferOf(cut))).toBeNull();
  });

  it("never throws on random bytes behind a font signature (seeded)", async () => {
    const rng = random(5151);
    const valid = makeSfnt(BOLD_ITALIC);
    for (let i = 0; i < 200; i += 1) {
      const bytes = valid.slice();
      // Flip random bytes after the signature: counts, offsets and lengths go wrong.
      for (let k = 0; k < rng.int(1, 12); k += 1) bytes[rng.int(4, bytes.length - 1)] = rng.int(0, 255);
      const names = await readFontNames(bufferOf(bytes.slice(0, rng.int(4, bytes.length))));
      if (names) {
        expect(typeof names.family).toBe("string");
        expect(names.weight).toBeGreaterThanOrEqual(1);
        expect(names.weight).toBeLessThanOrEqual(1000);
      }
    }
  });
});

describe("namesFromFileName (WOFF2, unreadable names)", () => {
  it("splits the style part off the family", () => {
    expect(namesFromFileName("Montserrat-BoldItalic.woff2")).toMatchObject({ family: "Montserrat", style: "Bold Italic", weight: 700, italic: true, from: "file" });
    expect(namesFromFileName("Open_Sans_SemiBold.woff2")).toMatchObject({ family: "Open Sans", style: "Semi Bold", weight: 600, italic: false });
    expect(namesFromFileName("Lobster-Regular.woff2")).toMatchObject({ family: "Lobster", style: "Regular", weight: 400 });
    expect(namesFromFileName("my-brand-font.woff2")).toMatchObject({ family: "my-brand-font", style: "Regular", weight: 400 });
    expect(namesFromFileName("Brand.woff2")).toMatchObject({ family: "Brand", style: "Regular", fullName: "Brand Regular", postscriptName: "Brand-Regular" });
    expect(namesFromFileName("Inter-VariableFont_wght.woff2").family).toBe("Inter-VariableFont wght");
    expect(namesFromFileName("-Black.woff2")).toMatchObject({ family: "-Black", weight: 400 });
  });
});
