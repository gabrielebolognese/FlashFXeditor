// The font browser's rows (spec §20.1): the sections Recent, Favorites, My fonts, Library and On this
// computer, each filtered by the search, the category and the weight band, every row with the weight
// it draws (the band's, else the family's nearest to Regular) and its number of weights. Installed
// fonts have no categories: their section leaves while a category is chosen. Pure.
import { bandWeight, catalogFamily, nearestWeight, queryFonts, weightBand, type CategoryId, type FilterableFont, type FontCatalog, type WeightBandId } from "../../text/fonts/catalog.js";
import type { UserFamily } from "../../text/fonts/userFonts.js";
import type { FontListItem, FontRowItem } from "./FontList.js";

export type CatalogStatus = "idle" | "loading" | "ready" | "error";
export type SystemStatus = "idle" | "loading" | "ready" | "denied" | "unsupported";

export interface BrowserSources {
  recent: readonly string[];
  favorites: readonly string[];
  user: readonly UserFamily[];
  catalog: FontCatalog | null;
  catalogStatus: CatalogStatus;
  /** The core families, known before the catalog (their rows show while it loads). */
  core: readonly FilterableFont[];
  systemStatus: SystemStatus;
  /** Installed families with their weights. */
  system: readonly FilterableFont[];
  /** The family of the edited text (null: mixed or none). */
  current: string | null;
}

export interface BrowserQuery {
  text: string;
  category: CategoryId | null;
  band: WeightBandId | null;
}

export const ACTION_SYSTEM = "system";
export const ACTION_ADD = "add";

const meta = (font: Pick<FilterableFont, "weights">) => (font.weights.length === 1 ? "1 weight" : `${font.weights.length} weights`);

/** The weight a row draws: the band's, else the family's nearest to it (to Regular without a band). */
export function rowWeight(font: Pick<FilterableFont, "weights" | "variable">, band: WeightBandId | null): number {
  const chosen = band ? weightBand(band) : null;
  const inBand = chosen ? bandWeight(font, chosen) : null;
  return inBand ?? nearestWeight(font, chosen?.preferred[0] ?? 400);
}

/** What a family name stands for: the library's, My fonts', an installed one, else a bare name. */
export function resolveFamily(sources: BrowserSources, family: string): FilterableFont {
  const lower = family.toLowerCase();
  return (
    catalogFamily(sources.catalog, family) ??
    sources.core.find((font) => font.family.toLowerCase() === lower) ??
    sources.user.find((font) => font.family.toLowerCase() === lower) ??
    sources.system.find((font) => font.family.toLowerCase() === lower) ?? { family, weights: [400], categories: [], tags: [] }
  );
}

export function browserItems(sources: BrowserSources, query: BrowserQuery): FontListItem[] {
  const items: FontListItem[] = [];
  const favorites = new Set(sources.favorites.map((family) => family.toLowerCase()));
  const users = new Set(sources.user.map((font) => font.family.toLowerCase()));
  const current = sources.current?.toLowerCase() ?? null;
  const filtering = query.text.trim() !== "" || query.category !== null || query.band !== null;
  const row = (section: string, font: FilterableFont): FontRowItem => ({
    kind: "font",
    key: `${section}:${font.family}`,
    family: font.family,
    weight: rowWeight(font, query.band),
    meta: meta(font),
    favorite: favorites.has(font.family.toLowerCase()),
    editable: users.has(font.family.toLowerCase()),
    current: font.family.toLowerCase() === current,
  });
  const section = (id: string, label: string, fonts: readonly FilterableFont[], keepOrder: boolean) => {
    const shown = queryFonts(fonts, query);
    if (shown.length === 0) return 0;
    // Recent and Favorites keep their own order unless searched.
    const ordered = keepOrder && query.text.trim() === "" ? fonts.filter((font) => shown.includes(font)) : shown;
    items.push({ kind: "heading", key: `h:${id}`, label });
    for (const font of ordered) items.push(row(id, font));
    return ordered.length;
  };

  section("recent", "Recent", sources.recent.map((family) => resolveFamily(sources, family)), true);
  section("favorites", "Favorites", sources.favorites.map((family) => resolveFamily(sources, family)), true);

  if (!section("mine", "My fonts", sources.user, false) && !filtering) {
    items.push({ kind: "heading", key: "h:mine", label: "My fonts" });
    items.push({ kind: "action", key: "a:add", label: "Add fonts…", action: ACTION_ADD });
    items.push({ kind: "note", key: "n:mine", label: "Or drop .ttf, .otf, .woff or .woff2 files here" });
  }

  const library: readonly FilterableFont[] = sources.catalog?.families ?? sources.core;
  const libraryCount = section("library", "Library", library, false);
  if (sources.catalogStatus === "loading" || sources.catalogStatus === "error" || sources.catalogStatus === "idle") {
    if (libraryCount === 0) items.push({ kind: "heading", key: "h:library", label: "Library" });
    items.push({ kind: "note", key: "n:library", label: sources.catalogStatus === "error" ? "The font library could not be read" : "Loading the font library…" });
  }

  // Installed fonts carry no categories.
  if (query.category === null) {
    if (sources.systemStatus === "ready") {
      const count = section("system", "On this computer", sources.system, false);
      if (count === 0 && !filtering) {
        items.push({ kind: "heading", key: "h:system", label: "On this computer" });
        items.push({ kind: "note", key: "n:system", label: "No system fonts" });
      }
    } else if (!filtering || sources.systemStatus !== "idle") {
      items.push({ kind: "heading", key: "h:system", label: "On this computer" });
      if (sources.systemStatus === "loading") items.push({ kind: "note", key: "n:system", label: "Listing the system fonts…" });
      else if (sources.systemStatus === "unsupported") items.push({ kind: "note", key: "n:system", label: "This browser cannot list system fonts" });
      else {
        if (sources.systemStatus === "denied") items.push({ kind: "note", key: "n:system", label: "Font access was not allowed" });
        items.push({ kind: "action", key: "a:system", label: "Show system fonts", action: ACTION_SYSTEM });
      }
    }
  }

  if (!items.some((item) => item.kind === "font")) items.unshift({ kind: "note", key: "n:none", label: filtering ? "No fonts match" : "No fonts" });
  return items;
}

/** Installed families with their weights (once listed), for the browser and the weight list. */
export function systemFamilies(families: readonly string[], weightsOf: (family: string) => readonly number[]): FilterableFont[] {
  return families.map((family) => ({ family, weights: [...new Set(weightsOf(family))].sort((a, b) => a - b), categories: [], tags: [] }));
}

/** The core families as filterable fonts (before the catalog is read). */
export function coreFilterable(fonts: readonly { family: string; weights: readonly [number, number] }[]): FilterableFont[] {
  return fonts.map((font) => ({ family: font.family, weights: [100, 200, 300, 400, 500, 600, 700, 800, 900].filter((w) => w >= font.weights[0] && w <= font.weights[1]), variable: { wght: font.weights }, categories: [], tags: [] }));
}

