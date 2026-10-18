import { describe, expect, it } from "vitest";
import { random, type Rng } from "../../timeline/edit/fuzzKit.js";
import { CATEGORY_IDS } from "./catalog.js";
import {
  cleanFamilyName,
  duplicateOf,
  formatTags,
  MAX_FAMILY_NAME,
  mergeUserFonts,
  parseTags,
  removeFamily,
  renameFamily,
  sanitizeUserFont,
  sanitizeUserFonts,
  setFamilyCategories,
  setFamilyTags,
  userFamilies,
  userFontFile,
  type UserFont,
} from "./userFonts.js";

const T0 = "2026-10-18T10:00:00.000Z";
const T1 = "2026-10-18T11:00:00.000Z";

const face = (id: string, family: string, weight = 400, italic = false, extra: Partial<UserFont> = {}): UserFont => ({
  id,
  family,
  style: italic ? "Italic" : "Regular",
  weight,
  italic,
  postscriptName: `${family}-${id}`,
  fileName: `${id}.ttf`,
  format: "ttf",
  bytes: 1000 + weight,
  from: "name",
  categories: [],
  tags: [],
  addedAt: T0,
  updatedAt: T0,
  ...extra,
});

describe("names and tags", () => {
  it("clean family names", () => {
    expect(cleanFamilyName("  Brand   Sans \n")).toBe("Brand Sans");
    expect(cleanFamilyName("   ")).toBeNull();
    expect(cleanFamilyName("x".repeat(100))?.length).toBe(MAX_FAMILY_NAME);
    expect(cleanFamilyName("A\u0000B")).toBe("AB");
  });

  it("parse comma-separated tags: lower case, unique, capped", () => {
    expect(parseTags(" Logo, brand ,LOGO,, wide ")).toEqual(["logo", "brand", "wide"]);
    expect(parseTags(Array.from({ length: 20 }, (_, i) => `t${i}`).join(","))).toHaveLength(12);
    expect(parseTags("a".repeat(40))).toEqual(["a".repeat(24)]);
    expect(formatTags(["logo", "brand"])).toBe("logo, brand");
  });
});

describe("records", () => {
  it("sanitize stored values, leaving out what is not a record", () => {
    expect(sanitizeUserFont(face("a", "Brand"))).toEqual(face("a", "Brand"));
    expect(sanitizeUserFont({ ...face("a", "Brand"), format: "exe" })).toBeNull();
    expect(sanitizeUserFont({ ...face("a", "Brand"), family: " " })).toBeNull();
    expect(sanitizeUserFont(null)).toBeNull();
    const loose = sanitizeUserFont({ id: "b", family: "Loose", fileName: "l.otf", format: "otf", weight: 5000, categories: ["luxury", "nope"], tags: ["X", "x", 3] });
    expect(loose).toMatchObject({ weight: 400, style: "Regular", italic: false, categories: ["luxury"], tags: ["x"], from: "name", updatedAt: loose?.addedAt });
    expect(sanitizeUserFonts([face("a", "A"), face("a", "B"), "x", face("c", "C")]).map((f) => f.id)).toEqual(["a", "c"]);
    expect(sanitizeUserFonts("nope")).toEqual([]);
  });

  it("group faces into families, by name without case", () => {
    const fonts = [face("1", "Brand", 700), face("2", "brand", 400, true, { categories: ["bold"] }), face("3", "Brand", 400, false, { tags: ["logo"] }), face("4", "Other")];
    const families = userFamilies(fonts);
    expect(families.map((f) => f.family)).toEqual(["Brand", "Other"]);
    const brand = families[0];
    expect(brand?.faces.map((f) => f.id)).toEqual(["3", "2", "1"]);
    expect(brand?.weights).toEqual([400, 700]);
    expect(brand?.italic).toBe(true);
    expect(brand?.categories).toEqual(["bold"]);
    expect(brand?.tags).toEqual(["logo"]);
  });

  it("rename, categorize, tag and remove a whole family", () => {
    const fonts = [face("1", "Brand", 700), face("2", "Brand", 400), face("3", "Other")];
    const renamed = renameFamily(fonts, "brand", "  Brand Pro ", T1);
    expect(renamed.map((f) => [f.family, f.updatedAt])).toEqual([
      ["Brand Pro", T1],
      ["Brand Pro", T1],
      ["Other", T0],
    ]);
    expect(renameFamily(fonts, "Brand", "  ", T1)).toEqual(fonts);
    expect(setFamilyCategories(fonts, "Brand", ["luxury", "luxury", "bold"], T1).map((f) => f.categories)).toEqual([["luxury", "bold"], ["luxury", "bold"], []]);
    expect(setFamilyTags(fonts, "Other", ["Logo", "logo", "wide"], T1).map((f) => f.tags)).toEqual([[], [], ["logo", "wide"]]);
    expect(removeFamily(fonts, "BRAND").map((f) => f.id)).toEqual(["3"]);
  });

  it("find the same file added twice", () => {
    const fonts = [face("1", "Brand", 700)];
    expect(duplicateOf(fonts, { family: "brand", weight: 700, italic: false, bytes: 1700 })?.id).toBe("1");
    expect(duplicateOf(fonts, { family: "brand", weight: 700, italic: false, bytes: 99 })).toBeNull();
    expect(userFontFile({ id: "abc", format: "woff2" })).toBe("abc.woff2");
  });

  it("merge two lists by id, the newer copy winning", () => {
    const ours = [face("1", "Brand"), face("2", "Old", 400, false, { updatedAt: T1 })];
    const theirs = [face("1", "Renamed", 400, false, { updatedAt: T1 }), face("2", "Older"), face("3", "New")];
    expect(mergeUserFonts(ours, theirs).map((f) => f.family)).toEqual(["Renamed", "Old", "New"]);
  });
});

// Property-based (the Batch 47 fuzz style, extended to font records): random edit sequences keep the
// list valid; families partition the faces; merging is idempotent and keeps every id.
describe("random edit sequences (seeded)", { timeout: 30_000 }, () => {
  const NAMES = ["Brand", "brand", "Logo Sans", "Ünïcødé Font", "  spaced  ", "A\"quote", "x".repeat(80)];

  function randomFace(rng: Rng, id: number): UserFont {
    const weight = rng.pick([100, 200, 300, 400, 500, 600, 700, 800, 900]);
    return face(`f${id}`, cleanFamilyName(rng.pick(NAMES)) as string, weight, rng.chance(0.3), {
      format: rng.pick(["ttf", "otf", "woff", "woff2"] as const),
      from: rng.chance(0.5) ? "name" : "file",
      addedAt: `2026-10-18T10:${String(rng.int(0, 59)).padStart(2, "0")}:00.000Z`,
    });
  }

  it("keep every record valid and the families a partition of the faces", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const rng = random(seed);
      let fonts: UserFont[] = [];
      let next = 0;
      for (let step = 0; step < 200; step += 1) {
        const families = userFamilies(fonts);
        const target = families.length > 0 ? rng.pick(families).family : "none";
        const now = `2026-10-18T12:${String(step % 60).padStart(2, "0")}:00.000Z`;
        const roll = rng.next();
        if (roll < 0.35 || fonts.length === 0) fonts = [...fonts, randomFace(rng, next++)];
        else if (roll < 0.5) fonts = renameFamily(fonts, target, rng.pick(NAMES), now);
        else if (roll < 0.65) fonts = setFamilyCategories(fonts, target, CATEGORY_IDS.filter(() => rng.chance(0.2)), now);
        else if (roll < 0.8) fonts = setFamilyTags(fonts, target, parseTags(rng.pick(["a, b", "Logo", "", "x, x, y"])), now);
        else fonts = removeFamily(fonts, target);

        expect(sanitizeUserFonts(fonts), `seed ${seed} step ${step}`).toEqual(fonts);
        const grouped = userFamilies(fonts);
        expect(grouped.reduce((n, family) => n + family.faces.length, 0)).toBe(fonts.length);
        expect(new Set(grouped.map((family) => family.family.toLowerCase())).size).toBe(grouped.length);
        for (const family of grouped) for (const member of family.faces) expect(member.family.toLowerCase()).toBe(family.family.toLowerCase());
      }
      expect(mergeUserFonts(fonts, fonts)).toEqual(mergeUserFonts(fonts, []));
      expect(new Set(mergeUserFonts(fonts, fonts.slice(0, 3)).map((f) => f.id))).toEqual(new Set(fonts.map((f) => f.id)));
    }
  });
});
