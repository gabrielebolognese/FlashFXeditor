import { describe, expect, it } from "vitest";
import { CORE_FONTS } from "../../render/text/bundledFonts.js";
import { parseCatalog } from "../../text/fonts/catalog.js";
import type { UserFamily } from "../../text/fonts/userFonts.js";
import { ACTION_ADD, ACTION_SYSTEM, browserItems, coreFilterable, resolveFamily, rowWeight, systemFamilies, type BrowserSources } from "./fontBrowserItems.js";
import type { FontListItem } from "./FontList.js";

const file = (slug: string, weight: number) => ({ subset: "latin", weight, style: "normal", path: `${slug}/${slug}-latin-${weight}-normal.woff2`, bytes: 1 });
const family = (name: string, categories: string[], weights: number[]) => {
  const slug = name.toLowerCase().replace(/ /g, "-");
  return { family: name, slug, categories, tags: [], weights, files: weights.map((w) => file(slug, w)), license: "OFL-1.1", designer: "x" };
};
const catalog = parseCatalog({
  families: [family("Anton", ["bold", "condensed"], [400]), family("Cinzel", ["luxury"], [400, 700, 900]), family("Playfair Display", ["luxury", "serif"], [400, 600, 700, 900]), family("Great Vibes", ["luxury", "handwritten"], [400])],
});

const brand: UserFamily = {
  family: "Brand",
  faces: [],
  weights: [400, 700],
  italic: false,
  variable: null,
  categories: ["luxury"],
  tags: ["logo"],
};

const base: BrowserSources = {
  recent: [],
  favorites: [],
  user: [],
  catalog,
  catalogStatus: "ready",
  core: coreFilterable(CORE_FONTS),
  systemStatus: "idle",
  system: [],
  current: null,
};

const shape = (items: FontListItem[]) => items.map((item) => (item.kind === "font" ? `${item.key}@${item.weight}` : item.kind === "heading" ? `# ${item.label}` : `${item.kind}: ${item.label}`));

describe("browserItems (spec §20.1 sections)", () => {
  it("lists the sections in order, with the empty My fonts and system rows", () => {
    expect(shape(browserItems({ ...base, recent: ["Cinzel"], favorites: ["Anton", "Nope"] }, { text: "", category: null, band: null }))).toEqual([
      "# Recent",
      "recent:Cinzel@400",
      "# Favorites",
      "favorites:Anton@400",
      "favorites:Nope@400",
      "# My fonts",
      "action: Add fonts…",
      "note: Or drop .ttf, .otf, .woff or .woff2 files here",
      "# Library",
      "library:Anton@400",
      "library:Cinzel@400",
      "library:Great Vibes@400",
      "library:Playfair Display@400",
      "# On this computer",
      "action: Show system fonts",
    ]);
  });

  it("luxury + bold lists only families with a bold weight, each drawn at it", () => {
    const items = browserItems({ ...base, user: [brand], systemStatus: "ready", system: systemFamilies(["Arial"], () => [400, 700]) }, { text: "", category: "luxury", band: "bold" });
    expect(shape(items)).toEqual(["# My fonts", "mine:Brand@700", "# Library", "library:Cinzel@700", "library:Playfair Display@700"]);
    const playfair = items.find((item) => item.kind === "font" && item.family === "Playfair Display");
    expect(playfair).toMatchObject({ meta: "4 weights", editable: false });
    expect(items.find((item) => item.kind === "font" && item.family === "Brand")).toMatchObject({ editable: true, meta: "2 weights" });
  });

  it("marks favorites and the current family, and searches tags", () => {
    const items = browserItems({ ...base, user: [brand], favorites: ["Brand"], current: "brand" }, { text: "logo", category: null, band: null });
    expect(shape(items)).toEqual(["# Favorites", "favorites:Brand@400", "# My fonts", "mine:Brand@400"]);
    expect(items[1]).toMatchObject({ favorite: true, current: true });
  });

  it("keeps the library's core rows and a loading note while the catalog loads", () => {
    const items = browserItems({ ...base, catalog: null, catalogStatus: "loading" }, { text: "inter", category: null, band: null });
    expect(shape(items)).toEqual(["# Library", "library:Inter@400", "note: Loading the font library…"]);
  });

  it("lists installed fonts by weight, and drops them while a category is chosen", () => {
    const system = systemFamilies(["Segoe UI", "Arial"], (name) => (name === "Arial" ? [400, 700] : [300, 400, 600, 700, 900]));
    const sources = { ...base, systemStatus: "ready" as const, system };
    expect(shape(browserItems(sources, { text: "", category: null, band: "black" }))).toEqual(["# Library", "library:Cinzel@900", "library:Playfair Display@900", "# On this computer", "system:Segoe UI@900"]);
    expect(shape(browserItems(sources, { text: "segoe", category: "luxury", band: null }))).toEqual(["note: No fonts match"]);
    expect(browserItems({ ...sources, system: [] }, { text: "", category: null, band: null }).some((item) => item.kind === "note" && item.label === "No system fonts")).toBe(true);
    expect(browserItems({ ...base, systemStatus: "denied" }, { text: "", category: null, band: null }).filter((item) => item.kind !== "font").map((item) => item.key)).toContain(`a:${ACTION_SYSTEM}`);
    expect(browserItems(base, { text: "", category: null, band: null }).some((item) => item.kind === "action" && item.action === ACTION_ADD)).toBe(true);
  });

  it("resolves names to their source and picks row weights", () => {
    expect(resolveFamily({ ...base, user: [brand] }, "brand")).toBe(brand);
    expect(resolveFamily(base, "Inter").variable).toEqual({ wght: [100, 900] });
    expect(resolveFamily(base, "Nope")).toEqual({ family: "Nope", weights: [400], categories: [], tags: [] });
    expect(rowWeight({ weights: [300, 700] }, null)).toBe(300);
    expect(rowWeight({ weights: [500, 900] }, null)).toBe(500);
    expect(rowWeight({ weights: [300, 700] }, "bold")).toBe(700);
    expect(rowWeight({ weights: [300, 700] }, "black")).toBe(700);
  });
});
