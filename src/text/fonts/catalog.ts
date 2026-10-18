// The font library's catalog (spec §20.1): what `public/fonts/library/catalog.json` holds (written by
// scripts/fonts/fetch-library.mjs from scripts/fonts/families.json), read and checked once, and the
// font browser's queries over it and over the other sources' families: search over family names,
// categories and tags, the category and weight-band filters, sorting, and the files of the face a
// weight and style pick (CSS matching, `nearestFace`). Pure.
import { nearestFace } from "../fonts.js";

export const CATEGORY_IDS = ["luxury", "modern", "bold", "condensed", "futuristic", "handwritten", "retro", "playful", "serif", "rounded", "horror", "mono", "pixel", "captions"] as const;
export type CategoryId = (typeof CATEGORY_IDS)[number];

export interface FontCategory {
  id: CategoryId;
  label: string;
}

/** The labels the browser's chips show (the catalog repeats them from families.json). */
export const CATEGORY_LABELS: Readonly<Record<CategoryId, string>> = {
  luxury: "Luxury & Elegant",
  modern: "Modern & Clean",
  bold: "Bold & Impact",
  condensed: "Condensed",
  futuristic: "Futuristic & Tech",
  handwritten: "Handwritten & Script",
  retro: "Retro & Vintage",
  playful: "Playful & Fun",
  serif: "Classic Serif",
  rounded: "Rounded",
  horror: "Horror & Grunge",
  mono: "Typewriter & Mono",
  pixel: "Pixel & Gaming",
  captions: "Captions",
};

export const isCategoryId = (value: unknown): value is CategoryId => typeof value === "string" && (CATEGORY_IDS as readonly string[]).includes(value);

export type WeightBandId = "thin" | "light" | "regular" | "bold" | "black";

export interface WeightBand {
  id: WeightBandId;
  label: string;
  /** The band's weights (spec §20.1: Thin 100-200, Light 300, Regular 400-500, Bold 600-700, Black 800-900). */
  min: number;
  max: number;
  /** The weight a row draws and a pick sets, in order of preference. */
  preferred: readonly number[];
}

export const WEIGHT_BANDS: readonly WeightBand[] = [
  { id: "thin", label: "Thin", min: 100, max: 200, preferred: [100, 200] },
  { id: "light", label: "Light", min: 300, max: 300, preferred: [300] },
  { id: "regular", label: "Regular", min: 400, max: 500, preferred: [400, 500] },
  { id: "bold", label: "Bold", min: 600, max: 700, preferred: [700, 600] },
  { id: "black", label: "Black", min: 800, max: 900, preferred: [900, 800] },
];

export const weightBand = (id: WeightBandId): WeightBand => WEIGHT_BANDS.find((band) => band.id === id) as WeightBand;

/** The band of a weight: between the bands' ranges (a system font's 350 or 950) the nearer one. */
export function bandOf(weight: number): WeightBandId {
  if (weight < 250) return "thin";
  if (weight < 350) return "light";
  if (weight < 550) return "regular";
  if (weight < 750) return "bold";
  return "black";
}

/** Any family the browser filters: the library's, one's own (My fonts) and the installed ones. */
export interface FilterableFont {
  family: string;
  /** The weights it has (the named instances of a variable font). */
  weights: readonly number[];
  /** A variable font's weight axis: every weight in it draws. */
  variable?: { wght: readonly [number, number] } | null;
  categories: readonly string[];
  tags: readonly string[];
}

/** Whether `font` has a weight in `band` (a variable axis that reaches into it counts). */
export function hasBand(font: Pick<FilterableFont, "weights" | "variable">, band: WeightBand): boolean {
  const axis = font.variable?.wght;
  if (axis) return axis[0] <= band.max && axis[1] >= band.min;
  return font.weights.some((weight) => bandOf(weight) === band.id);
}

/**
 * The weight `font` draws for `band` (a row's preview, and what a pick sets): the band's preferred
 * weights first, then its weight nearest to the band. Null when it has none in the band.
 */
export function bandWeight(font: Pick<FilterableFont, "weights" | "variable">, band: WeightBand): number | null {
  const axis = font.variable?.wght;
  if (axis) {
    for (const weight of band.preferred) if (weight >= axis[0] && weight <= axis[1]) return weight;
    if (!hasBand(font, band)) return null;
    return Math.min(Math.max(band.preferred[0] ?? band.min, axis[0]), axis[1]);
  }
  for (const weight of band.preferred) if (font.weights.includes(weight)) return weight;
  const inBand = font.weights.filter((weight) => bandOf(weight) === band.id);
  if (inBand.length === 0) return null;
  const target = band.preferred[0] ?? band.min;
  return inBand.reduce((best, weight) => (Math.abs(weight - target) < Math.abs(best - target) ? weight : best));
}

/** The weight of `font` nearest to `wanted` (CSS matching): what a family change keeps a text at. */
export function nearestWeight(font: Pick<FilterableFont, "weights" | "variable">, wanted: number): number {
  const axis = font.variable?.wght;
  if (axis) return Math.min(Math.max(wanted, axis[0]), axis[1]);
  return nearestFace(font.weights.map((weight) => ({ weight, italic: false })), wanted, false)?.weight ?? wanted;
}

/** The number of weights a row shows ("9 weights"; a variable font counts its named instances). */
export const weightCount = (font: Pick<FilterableFont, "weights">): number => font.weights.length;

export interface FontQuery {
  /** Free text: every word must match the name, a category or a tag. */
  text?: string;
  category?: CategoryId | null;
  band?: WeightBandId | null;
}

const words = (text: string) => text.toLowerCase().split(/\s+/).filter((word) => word !== "");

/**
 * How well `font` matches the words of a search (lower is better), or null when one word matches
 * nothing: the name itself, then the name's start, a word of the name, inside the name, a category,
 * a tag.
 */
export function searchRank(font: Pick<FilterableFont, "family" | "categories" | "tags">, text: string): number | null {
  const query = words(text);
  if (query.length === 0) return 0;
  const name = font.family.toLowerCase();
  const joined = query.join(" ");
  if (name === joined) return 0;
  if (name.startsWith(joined)) return 1;
  const nameWords = words(name);
  const labels = font.categories.flatMap((id) => [id, ...(isCategoryId(id) ? words(CATEGORY_LABELS[id]) : [])]);
  const tags = font.tags.map((tag) => tag.toLowerCase());
  let rank = 2;
  for (const word of query) {
    if (nameWords.some((part) => part.startsWith(word))) continue;
    if (name.includes(word)) rank = Math.max(rank, 3);
    else if (labels.some((label) => label.startsWith(word))) rank = Math.max(rank, 4);
    else if (tags.some((tag) => tag.includes(word))) rank = Math.max(rank, 5);
    else return null;
  }
  return rank;
}

/** The fonts that match `query`: the search's best first, then by name; without a search, by name. */
export function queryFonts<T extends FilterableFont>(fonts: readonly T[], query: FontQuery): T[] {
  const band = query.band ? weightBand(query.band) : null;
  const ranked: { font: T; rank: number }[] = [];
  for (const font of fonts) {
    if (query.category && !font.categories.includes(query.category)) continue;
    if (band && !hasBand(font, band)) continue;
    const rank = searchRank(font, query.text ?? "");
    if (rank !== null) ranked.push({ font, rank });
  }
  return ranked.sort((a, b) => a.rank - b.rank || compareNames(a.font.family, b.font.family)).map((entry) => entry.font);
}

export const compareNames = (a: string, b: string): number => a.localeCompare(b, "en", { sensitivity: "base" }) || a.localeCompare(b);

// --- The catalog file ---------------------------------------------------------------------------

export interface CatalogFile {
  subset: string;
  /** A static file's weight, or a variable file's weight axis. */
  weight?: number;
  range?: readonly [number, number];
  style: "normal" | "italic";
  /** Relative to the library folder: `<slug>/<file>.woff2`. */
  path: string;
  bytes: number;
}

export interface CatalogFamily extends FilterableFont {
  id: string;
  slug: string;
  categories: CategoryId[];
  tags: string[];
  weights: number[];
  italic: boolean;
  variable: { wght: readonly [number, number] } | null;
  files: CatalogFile[];
  /** SPDX id: OFL-1.1, Apache-2.0, UFL-1.0. */
  license: string;
  designer: string;
  /** The Fontsource release the files come from. */
  version?: string;
  /** Unicode ranges of subsets where this family differs from the catalog's. */
  ranges?: Readonly<Record<string, string>>;
}

export interface FontCatalog {
  categories: readonly FontCategory[];
  /** The unicode range of each subset. */
  subsets: Readonly<Record<string, string>>;
  /** License names by id. */
  licenses: Readonly<Record<string, string>>;
  families: readonly CatalogFamily[];
  /** By family name in lower case (CSS matches family names without case). */
  byFamily: ReadonlyMap<string, CatalogFamily>;
}

/** The library folder, relative to the app's base URL. */
export const LIBRARY_DIR = "fonts/library/";
export const CATALOG_FILE = "catalog.json";
export const LICENSES_DIR = "LICENSES/";

const isText = (value: unknown): value is string => typeof value === "string" && value !== "";
const isWeight = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 1000;
const SAFE_PATH = /^[a-z0-9-]+\/[a-z0-9-]+\.woff2$/;

function readFile(raw: unknown, slug: string): CatalogFile | null {
  const file = raw as Partial<CatalogFile> | null;
  if (!file || !isText(file.subset) || !isText(file.path) || !SAFE_PATH.test(file.path) || !file.path.startsWith(`${slug}/`)) return null;
  if (file.style !== "normal" && file.style !== "italic") return null;
  const bytes = typeof file.bytes === "number" && file.bytes >= 0 ? file.bytes : 0;
  if (Array.isArray(file.range) && file.range.length === 2 && isWeight(file.range[0]) && isWeight(file.range[1]) && file.range[0] <= file.range[1]) {
    return { subset: file.subset, range: [file.range[0], file.range[1]], style: file.style, path: file.path, bytes };
  }
  if (isWeight(file.weight)) return { subset: file.subset, weight: file.weight, style: file.style, path: file.path, bytes };
  return null;
}

function readFamily(raw: unknown): CatalogFamily | null {
  const entry = raw as Partial<CatalogFamily> | null;
  if (!entry || !isText(entry.family) || !isText(entry.slug) || !/^[a-z0-9-]+$/.test(entry.slug)) return null;
  const slug = entry.slug;
  const categories = Array.isArray(entry.categories) ? entry.categories.filter(isCategoryId) : [];
  const files = (Array.isArray(entry.files) ? entry.files : []).map((file) => readFile(file, slug)).filter((file): file is CatalogFile => file !== null);
  if (categories.length === 0 || !files.some((file) => file.style === "normal")) return null;
  const axis = entry.variable?.wght;
  const variable = Array.isArray(axis) && axis.length === 2 && isWeight(axis[0]) && isWeight(axis[1]) && axis[0] <= axis[1] ? { wght: [axis[0], axis[1]] as const } : null;
  const weights = [...new Set((Array.isArray(entry.weights) ? entry.weights : []).filter(isWeight))].sort((a, b) => a - b);
  if (weights.length === 0) weights.push(...new Set(files.flatMap((file) => (file.weight === undefined ? [] : [file.weight]))));
  if (weights.length === 0 && variable) weights.push(variable.wght[0]);
  const ranges = entry.ranges && typeof entry.ranges === "object" ? Object.fromEntries(Object.entries(entry.ranges).filter((pair): pair is [string, string] => isText(pair[1]))) : undefined;
  return {
    id: isText(entry.id) ? entry.id : slug,
    family: entry.family,
    slug,
    categories: [...new Set(categories)],
    tags: Array.isArray(entry.tags) ? entry.tags.filter(isText) : [],
    weights,
    italic: files.some((file) => file.style === "italic"),
    variable,
    files,
    license: isText(entry.license) ? entry.license : "OFL-1.1",
    designer: isText(entry.designer) ? entry.designer : "",
    ...(isText(entry.version) && { version: entry.version }),
    ...(ranges && Object.keys(ranges).length > 0 && { ranges }),
  };
}

/** The catalog of a parsed catalog.json; entries that are not families (or lack files) are left out. */
export function parseCatalog(raw: unknown): FontCatalog {
  const data = (raw ?? {}) as { categories?: unknown; subsets?: unknown; licenses?: unknown; families?: unknown };
  const labels = new Map<CategoryId, string>();
  for (const item of Array.isArray(data.categories) ? (data.categories as { id?: unknown; label?: unknown }[]) : []) if (isCategoryId(item?.id) && isText(item.label)) labels.set(item.id, item.label);
  const categories = CATEGORY_IDS.map((id) => ({ id, label: labels.get(id) ?? CATEGORY_LABELS[id] }));
  const textRecord = (value: unknown): Record<string, string> => (value && typeof value === "object" ? Object.fromEntries(Object.entries(value).filter((pair): pair is [string, string] => isText(pair[1]))) : {});
  const families: CatalogFamily[] = [];
  const byFamily = new Map<string, CatalogFamily>();
  for (const item of Array.isArray(data.families) ? data.families : []) {
    const family = readFamily(item);
    if (!family || byFamily.has(family.family.toLowerCase())) continue;
    families.push(family);
    byFamily.set(family.family.toLowerCase(), family);
  }
  families.sort((a, b) => compareNames(a.family, b.family));
  return { categories, subsets: textRecord(data.subsets), licenses: textRecord(data.licenses), families, byFamily };
}

/** The catalog family of a name (case-insensitive), or null. */
export const catalogFamily = (catalog: FontCatalog | null, family: string): CatalogFamily | null => catalog?.byFamily.get(family.toLowerCase()) ?? null;

/** The unicode range of one of a family's files (its subset's). */
export const fileRange = (catalog: Pick<FontCatalog, "subsets">, family: Pick<CatalogFamily, "ranges">, file: Pick<CatalogFile, "subset">): string | undefined => family.ranges?.[file.subset] ?? catalog.subsets[file.subset];

/** The CSS `font-weight` descriptor of a file: "100 900" for a weight axis. */
export const fileWeight = (file: Pick<CatalogFile, "weight" | "range">): string => (file.range ? `${file.range[0]} ${file.range[1]}` : String(file.weight ?? 400));

/**
 * The files of the face `weight` / `italic` draws with (CSS matching: the italic falls back to the
 * upright, the nearest weight), every subset: what a project copies into `fonts/`.
 */
export function faceFiles(family: Pick<CatalogFamily, "files">, weight: number, italic: boolean): CatalogFile[] {
  const style = italic && family.files.some((file) => file.style === "italic") ? "italic" : "normal";
  const files = family.files.filter((file) => file.style === style);
  const variable = files.filter((file) => file.range && weight >= file.range[0] && weight <= file.range[1]);
  if (variable.length > 0) return variable;
  const weights = [...new Set(files.map((file) => file.weight ?? file.range?.[0] ?? 400))].map((value) => ({ weight: value, italic: false }));
  const chosen = nearestFace(weights, weight, false)?.weight;
  return files.filter((file) => (file.weight ?? file.range?.[0]) === chosen);
}

/** The latin file a row of the browser loads to draw the family at `weight` (upright). */
export function previewFile(family: Pick<CatalogFamily, "files">, weight: number): CatalogFile | null {
  const files = faceFiles(family, weight, false);
  return files.find((file) => file.subset === "latin") ?? files[0] ?? null;
}

/** The total bytes of the library's font files. */
export const catalogBytes = (catalog: Pick<FontCatalog, "families">): number => catalog.families.reduce((sum, family) => sum + family.files.reduce((n, file) => n + file.bytes, 0), 0);
