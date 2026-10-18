import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { random } from "../../timeline/edit/fuzzKit.js";
import {
  bandOf,
  bandWeight,
  CATEGORY_IDS,
  CATEGORY_LABELS,
  catalogBytes,
  catalogFamily,
  faceFiles,
  fileRange,
  fileWeight,
  hasBand,
  nearestWeight,
  parseCatalog,
  previewFile,
  queryFonts,
  searchRank,
  weightBand,
  WEIGHT_BANDS,
  type CatalogFamily,
  type FilterableFont,
} from "./catalog.js";

const ROOT = join(__dirname, "..", "..", "..");
const LIBRARY = join(ROOT, "public", "fonts", "library");

const font = (family: string, weights: number[], extra: Partial<FilterableFont> = {}): FilterableFont => ({ family, weights, categories: [], tags: [], ...extra });

const staticFamily = {
  family: "Poppins",
  slug: "poppins",
  categories: ["modern", "bold"],
  tags: ["sans", "geometric"],
  weights: [100, 300, 400, 700, 900],
  files: [100, 300, 400, 700, 900].flatMap((weight) =>
    ["latin", "latin-ext"].flatMap((subset) => [
      { subset, weight, style: "normal", path: `poppins/poppins-${subset}-${weight}-normal.woff2`, bytes: 10 },
      ...(weight === 400 || weight === 700 ? [{ subset, weight, style: "italic", path: `poppins/poppins-${subset}-${weight}-italic.woff2`, bytes: 12 }] : []),
    ]),
  ),
  license: "OFL-1.1",
  designer: "Indian Type Foundry",
};
const variableFamily = {
  family: "Inter",
  slug: "inter",
  categories: ["modern"],
  tags: [],
  weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
  variable: { wght: [100, 900] },
  files: [
    { subset: "latin", range: [100, 900], style: "normal", path: "inter/inter-latin-wght-normal.woff2", bytes: 48256 },
    { subset: "latin-ext", range: [100, 900], style: "normal", path: "inter/inter-latin-ext-wght-normal.woff2", bytes: 80000 },
  ],
  license: "OFL-1.1",
  designer: "Rasmus Andersson",
  ranges: { "latin-ext": "U+0100-02FF" },
};

describe("weight bands (spec §20.1)", () => {
  it("cover 100-900 in five bands, weights in between going to the nearer one", () => {
    expect(WEIGHT_BANDS.map((band) => [band.id, band.min, band.max])).toEqual([
      ["thin", 100, 200],
      ["light", 300, 300],
      ["regular", 400, 500],
      ["bold", 600, 700],
      ["black", 800, 900],
    ]);
    expect([100, 200, 300, 350, 400, 500, 600, 700, 800, 900, 950, 1000].map(bandOf)).toEqual(["thin", "thin", "light", "regular", "regular", "regular", "bold", "bold", "black", "black", "black", "black"]);
  });

  it("tell whether a family has a band: static weights, or a variable axis reaching into it", () => {
    const bold = weightBand("bold");
    expect(hasBand(font("Anton", [400]), bold)).toBe(false);
    expect(hasBand(font("Cardo", [400, 700]), bold)).toBe(true);
    expect(hasBand(font("Caveat", [400, 500, 600, 700], { variable: { wght: [400, 700] } }), weightBand("thin"))).toBe(false);
    expect(hasBand(font("Oswald", [200, 700], { variable: { wght: [200, 700] } }), weightBand("thin"))).toBe(true);
    expect(hasBand(font("Oswald", [200, 700], { variable: { wght: [200, 700] } }), weightBand("black"))).toBe(false);
  });

  it("pick the weight a row draws: preferred first, else the nearest in the band", () => {
    expect(bandWeight(font("A", [400, 600, 800]), weightBand("bold"))).toBe(600);
    expect(bandWeight(font("A", [400, 600, 700]), weightBand("bold"))).toBe(700);
    expect(bandWeight(font("A", [400, 650]), weightBand("bold"))).toBe(650);
    expect(bandWeight(font("A", [400]), weightBand("bold"))).toBeNull();
    expect(bandWeight(font("V", [], { variable: { wght: [100, 900] } }), weightBand("black"))).toBe(900);
    expect(bandWeight(font("V", [], { variable: { wght: [200, 850] } }), weightBand("black"))).toBe(800);
    expect(bandWeight(font("V", [], { variable: { wght: [820, 860] } }), weightBand("black"))).toBe(860);
    expect(bandWeight(font("V", [], { variable: { wght: [250, 700] } }), weightBand("thin"))).toBeNull();
  });

  it("keep a text near its weight when the family changes (CSS matching)", () => {
    expect(nearestWeight(font("Anton", [400]), 700)).toBe(400);
    expect(nearestWeight(font("A", [300, 400, 700, 900]), 800)).toBe(900);
    expect(nearestWeight(font("A", [300, 400, 700, 900]), 450)).toBe(400);
    expect(nearestWeight(font("V", [], { variable: { wght: [200, 700] } }), 900)).toBe(700);
  });
});

describe("search and filters", () => {
  const fonts = [
    font("Playfair Display", [400, 700, 900], { categories: ["luxury", "serif"], tags: ["didone"] }),
    font("Anton", [400], { categories: ["bold", "condensed"], tags: ["impact", "tall"] }),
    font("Cinzel", [400, 700, 900], { categories: ["luxury"], tags: ["roman"] }),
    font("Great Vibes", [400], { categories: ["luxury", "handwritten"], tags: ["script", "wedding"] }),
    font("Display Pro", [400], { categories: ["modern"], tags: [] }),
    font("Inter", [], { categories: ["modern"], tags: ["ui"], variable: { wght: [100, 900] } }),
  ];

  it("rank the name before categories and tags", () => {
    expect(searchRank(fonts[1] as FilterableFont, "anton")).toBe(0);
    expect(searchRank(fonts[0] as FilterableFont, "play")).toBe(1);
    expect(searchRank(fonts[0] as FilterableFont, "display")).toBe(2);
    expect(searchRank(fonts[0] as FilterableFont, "fair")).toBe(3);
    expect(searchRank(fonts[0] as FilterableFont, "luxury")).toBe(4);
    expect(searchRank(fonts[0] as FilterableFont, "elegant")).toBe(4);
    expect(searchRank(fonts[0] as FilterableFont, "didone")).toBe(5);
    expect(searchRank(fonts[0] as FilterableFont, "luxury didone")).toBe(5);
    expect(searchRank(fonts[0] as FilterableFont, "luxury impact")).toBeNull();
    expect(searchRank(fonts[0] as FilterableFont, "   ")).toBe(0);
  });

  it("combine a category with a weight band: luxury bold lists only families with a bold weight", () => {
    expect(queryFonts(fonts, { category: "luxury", band: "bold" }).map((f) => f.family)).toEqual(["Cinzel", "Playfair Display"]);
    expect(queryFonts(fonts, { category: "luxury" }).map((f) => f.family)).toEqual(["Cinzel", "Great Vibes", "Playfair Display"]);
    expect(queryFonts(fonts, { band: "thin" }).map((f) => f.family)).toEqual(["Inter"]);
    expect(queryFonts(fonts, { text: "display" }).map((f) => f.family)).toEqual(["Display Pro", "Playfair Display"]);
    expect(queryFonts(fonts, { text: "script", category: "luxury" }).map((f) => f.family)).toEqual(["Great Vibes"]);
    expect(queryFonts(fonts, {}).map((f) => f.family)).toEqual(["Anton", "Cinzel", "Display Pro", "Great Vibes", "Inter", "Playfair Display"]);
  });

  it("hold for random queries: every result matches all its filters, nothing that matches is left out (seeded)", () => {
    const rng = random(51);
    const names = ["Alpha", "Beta Sans", "Gamma Serif", "Delta Mono", "Epsilon Display", "Zeta", "Eta Script", "Theta Round"];
    const pool: FilterableFont[] = names.map((name) => {
      const variable = rng.chance(0.3);
      const axis: [number, number] = [rng.pick([100, 200, 300, 400]), rng.pick([500, 700, 900])];
      return font(
        name,
        variable ? [axis[0], axis[1]] : [100, 200, 300, 400, 500, 600, 700, 800, 900].filter(() => rng.chance(0.4)),
        { categories: CATEGORY_IDS.filter(() => rng.chance(0.2)), tags: ["sans", "serif", "wide", "tall"].filter(() => rng.chance(0.3)), variable: variable ? { wght: axis } : null },
      );
    });
    for (let i = 0; i < 300; i += 1) {
      const category = rng.chance(0.5) ? rng.pick(CATEGORY_IDS) : null;
      const band = rng.chance(0.5) ? rng.pick(WEIGHT_BANDS).id : null;
      const text = rng.chance(0.4) ? rng.pick(["a", "sans", "serif", "luxury", "wide", "zz", "ta"]) : "";
      const result = queryFonts(pool, { category, band, text });
      for (const item of result) {
        if (category) expect(item.categories).toContain(category);
        if (band) expect(hasBand(item, weightBand(band))).toBe(true);
        if (band) expect(bandWeight(item, weightBand(band))).not.toBeNull();
        expect(searchRank(item, text)).not.toBeNull();
      }
      const expected = pool.filter((item) => (!category || item.categories.includes(category)) && (!band || hasBand(item, weightBand(band))) && searchRank(item, text) !== null);
      expect(result.length).toBe(expected.length);
    }
  });
});

describe("parseCatalog", () => {
  it("reads families, sorted, and indexes them by name without case", () => {
    const catalog = parseCatalog({ categories: [{ id: "modern", label: "Modern" }], subsets: { latin: "U+0000-00FF", "latin-ext": "U+0100-024F" }, licenses: { "OFL-1.1": "SIL" }, families: [staticFamily, variableFamily] });
    expect(catalog.families.map((f) => f.family)).toEqual(["Inter", "Poppins"]);
    expect(catalog.categories.find((c) => c.id === "modern")?.label).toBe("Modern");
    expect(catalog.categories.find((c) => c.id === "luxury")?.label).toBe(CATEGORY_LABELS.luxury);
    expect(catalogFamily(catalog, "POPPINS")?.slug).toBe("poppins");
    expect(catalogFamily(catalog, "Nope")).toBeNull();
    const inter = catalogFamily(catalog, "inter") as CatalogFamily;
    expect(inter.variable).toEqual({ wght: [100, 900] });
    expect(fileRange(catalog, inter, { subset: "latin" })).toBe("U+0000-00FF");
    expect(fileRange(catalog, inter, { subset: "latin-ext" })).toBe("U+0100-02FF");
    expect(fileWeight(inter.files[0] as CatalogFamily["files"][number])).toBe("100 900");
    expect(catalogBytes(catalog)).toBe(48256 + 80000 + 10 * 10 + 4 * 12);
  });

  it("leaves out what is not a family: no name, unsafe paths, no upright file, no category, duplicates", () => {
    const catalog = parseCatalog({
      families: [
        { ...staticFamily, family: "" },
        { ...staticFamily, family: "Bad Path", files: [{ subset: "latin", weight: 400, style: "normal", path: "../etc/passwd.woff2", bytes: 1 }] },
        { ...staticFamily, family: "Other Folder", files: [{ subset: "latin", weight: 400, style: "normal", path: "inter/x.woff2", bytes: 1 }] },
        { ...staticFamily, family: "Italic Only", files: staticFamily.files.filter((f) => f.style === "italic") },
        { ...staticFamily, family: "No Category", categories: ["nope"] },
        staticFamily,
        { ...staticFamily, family: "poppins" },
      ],
    });
    expect(catalog.families.map((f) => f.family)).toEqual(["Poppins"]);
    expect(parseCatalog(null).families).toEqual([]);
    expect(parseCatalog({ families: "x" }).families).toEqual([]);
  });

  it("finds the files of the face a weight and style draw with (every subset)", () => {
    const catalog = parseCatalog({ families: [staticFamily, variableFamily] });
    const poppins = catalogFamily(catalog, "Poppins") as CatalogFamily;
    expect(faceFiles(poppins, 700, false).map((f) => f.path)).toEqual(["poppins/poppins-latin-700-normal.woff2", "poppins/poppins-latin-ext-700-normal.woff2"]);
    expect(faceFiles(poppins, 800, false).map((f) => f.weight)).toEqual([900, 900]);
    expect(faceFiles(poppins, 450, true).map((f) => [f.weight, f.style])).toEqual([
      [400, "italic"],
      [400, "italic"],
    ]);
    // No italic at 900: the italic faces are 400 and 700 (CSS keeps the style first).
    expect(faceFiles(poppins, 900, true).map((f) => f.weight)).toEqual([700, 700]);
    const inter = catalogFamily(catalog, "Inter") as CatalogFamily;
    expect(faceFiles(inter, 650, true).map((f) => f.path)).toEqual(["inter/inter-latin-wght-normal.woff2", "inter/inter-latin-ext-wght-normal.woff2"]);
    expect(previewFile(poppins, 300)?.path).toBe("poppins/poppins-latin-300-normal.woff2");
    expect(previewFile(inter, 900)?.path).toBe("inter/inter-latin-wght-normal.woff2");
  });
});

// The committed library (scripts/fonts/fetch-library.mjs output) against the §20.1 rules.
describe("the bundled library (public/fonts/library)", () => {
  const raw = JSON.parse(readFileSync(join(LIBRARY, "catalog.json"), "utf8")) as { families: unknown[]; categories: { id: string; label: string }[] };
  const catalog = parseCatalog(raw);
  const curated = JSON.parse(readFileSync(join(ROOT, "scripts", "fonts", "families.json"), "utf8")) as { categories: { id: string; label: string }[]; families: { family: string; categories: string[] }[] };

  it("has at least 200 families, every one valid, under redistributable licenses", () => {
    expect(catalog.families.length).toBeGreaterThanOrEqual(200);
    expect(catalog.families.length).toBe(raw.families.length);
    for (const family of catalog.families) expect(["OFL-1.1", "Apache-2.0", "UFL-1.0"]).toContain(family.license);
  });

  it("fills every category: at least 10, and at least 25 for luxury, modern, bold, futuristic and handwritten", () => {
    for (const id of CATEGORY_IDS) {
      const count = catalog.families.filter((family) => family.categories.includes(id)).length;
      expect(count, id).toBeGreaterThanOrEqual(["luxury", "modern", "bold", "futuristic", "handwritten"].includes(id) ? 25 : 10);
    }
    for (const family of catalog.families) expect(family.categories.length).toBeGreaterThan(0);
  });

  it("has luxury families with a bold weight, so the luxury bold filter has results", () => {
    expect(queryFonts(catalog.families, { category: "luxury", band: "bold" }).length).toBeGreaterThanOrEqual(10);
  });

  it("names the same categories as families.json and lists every curated family it kept", () => {
    expect(curated.categories.map((c) => c.id)).toEqual([...CATEGORY_IDS]);
    expect(raw.categories).toEqual(curated.categories);
    for (const category of curated.categories) expect(CATEGORY_LABELS[category.id as keyof typeof CATEGORY_LABELS]).toBe(category.label);
    const curatedNames = new Set(curated.families.map((family) => family.family));
    for (const family of catalog.families) expect(curatedNames.has(family.family), family.family).toBe(true);
  });

  it("ships every file it lists, at the listed size, with a license text, in at most 40 MB", () => {
    let total = 0;
    for (const family of catalog.families) {
      for (const file of family.files) {
        expect(statSync(join(LIBRARY, file.path)).size, file.path).toBe(file.bytes);
        total += file.bytes;
      }
      const license = statSync(join(LIBRARY, "LICENSES", `${family.slug}.txt`));
      expect(license.size).toBeGreaterThan(100);
      total += license.size;
    }
    total += statSync(join(LIBRARY, "catalog.json")).size;
    expect(total).toBeLessThanOrEqual(40 * 1024 * 1024);
  });

  it("carries the eight Batch 28 families the app starts with", () => {
    for (const family of ["Inter", "Montserrat", "Nunito", "Oswald", "Unbounded", "Playfair Display", "Caveat", "JetBrains Mono"]) expect(catalogFamily(catalog, family), family).not.toBeNull();
  });
});
