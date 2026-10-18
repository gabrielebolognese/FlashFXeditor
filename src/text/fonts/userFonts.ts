// My fonts (spec §20.1): the font files the user added, one record per file (a face), kept in the
// global store (IndexedDB, next to the global presets) and mirrored into the library folder. A family
// is the faces that share a family name: renaming, categories, tags and removal apply to all of them.
// Pure: records, checks and the family view the font browser filters.
import { compareNames, isCategoryId, type CategoryId, type FilterableFont } from "./catalog.js";
import type { FontFormat } from "./sfnt.js";

export interface UserFont {
  id: string;
  /** The family it draws with: from the `name` table or the file name, renamable. */
  family: string;
  /** "Bold Italic". */
  style: string;
  weight: number;
  italic: boolean;
  postscriptName: string;
  /** The file it was added from. */
  fileName: string;
  format: Exclude<FontFormat, "ttc">;
  bytes: number;
  /** Where the names came from: the font's `name` table, or the file name. */
  from: "name" | "file";
  categories: CategoryId[];
  tags: string[];
  addedAt: string;
  /** Changed last (a rename, categories, tags): the newer copy wins when the library folder is synced. */
  updatedAt: string;
}

/** One family of My fonts: its faces (weight order) and what the browser filters. */
export interface UserFamily extends FilterableFont {
  faces: UserFont[];
  weights: number[];
  italic: boolean;
  categories: CategoryId[];
  tags: string[];
}

export const MAX_FAMILY_NAME = 64;
export const MAX_TAGS = 12;
export const MAX_TAG_LENGTH = 24;
/** Larger files are refused (a font is rarely over a few MB; CJK fonts reach ~20). */
export const MAX_FONT_BYTES = 32 * 1024 * 1024;

const FORMATS = ["ttf", "otf", "woff", "woff2"] as const;
const isText = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";

/** A family name as stored: trimmed, single spaces, no control characters, at most 64 characters. Null when empty. */
export function cleanFamilyName(name: string): string | null {
  const cleaned = name.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_FAMILY_NAME).trim();
  return cleaned === "" ? null : cleaned;
}

/** Tags from a comma-separated field: trimmed, lower case, unique, at most 12 of 24 characters. */
export function parseTags(text: string): string[] {
  const tags: string[] = [];
  for (const part of text.split(",")) {
    const tag = part.replace(/\s+/g, " ").trim().toLowerCase().slice(0, MAX_TAG_LENGTH).trim();
    if (tag !== "" && !tags.includes(tag)) tags.push(tag);
    if (tags.length === MAX_TAGS) break;
  }
  return tags;
}

export const formatTags = (tags: readonly string[]): string => tags.join(", ");

/** The record of a stored value, or null when it is not one. */
export function sanitizeUserFont(raw: unknown): UserFont | null {
  const font = raw as Partial<UserFont> | null;
  if (!font || !isText(font.id) || !isText(font.family) || !isText(font.fileName)) return null;
  const family = cleanFamilyName(font.family);
  if (!family || !(FORMATS as readonly string[]).includes(font.format as string)) return null;
  const weight = typeof font.weight === "number" && font.weight >= 1 && font.weight <= 1000 ? Math.round(font.weight) : 400;
  const addedAt = isText(font.addedAt) ? font.addedAt : new Date(0).toISOString();
  return {
    id: font.id,
    family,
    style: isText(font.style) ? font.style : "Regular",
    weight,
    italic: font.italic === true,
    postscriptName: isText(font.postscriptName) ? font.postscriptName : `${family}-${isText(font.style) ? font.style : "Regular"}`.replace(/\s+/g, ""),
    fileName: font.fileName,
    format: font.format as UserFont["format"],
    bytes: typeof font.bytes === "number" && font.bytes >= 0 ? font.bytes : 0,
    from: font.from === "file" ? "file" : "name",
    categories: [...new Set(Array.isArray(font.categories) ? font.categories.filter(isCategoryId) : [])],
    tags: Array.isArray(font.tags) ? parseTags(font.tags.filter((tag): tag is string => typeof tag === "string").join(",")) : [],
    addedAt,
    updatedAt: isText(font.updatedAt) ? font.updatedAt : addedAt,
  };
}

/** The records of a stored list; values that are not records and repeated ids are left out. */
export function sanitizeUserFonts(raw: unknown): UserFont[] {
  const out: UserFont[] = [];
  const ids = new Set<string>();
  for (const item of Array.isArray(raw) ? raw : []) {
    const font = sanitizeUserFont(item);
    if (!font || ids.has(font.id)) continue;
    ids.add(font.id);
    out.push(font);
  }
  return out;
}

/** The families of My fonts, by name; faces by weight, upright first. Categories and tags: the union of the faces'. */
export function userFamilies(fonts: readonly UserFont[]): UserFamily[] {
  const byName = new Map<string, UserFont[]>();
  for (const font of fonts) {
    const key = font.family.toLowerCase();
    const list = byName.get(key);
    if (list) list.push(font);
    else byName.set(key, [font]);
  }
  const families: UserFamily[] = [];
  for (const faces of byName.values()) {
    faces.sort((a, b) => a.weight - b.weight || Number(a.italic) - Number(b.italic) || a.addedAt.localeCompare(b.addedAt));
    const first = faces[0] as UserFont;
    families.push({
      family: first.family,
      faces,
      weights: [...new Set(faces.map((face) => face.weight))],
      italic: faces.some((face) => face.italic),
      variable: null,
      categories: [...new Set(faces.flatMap((face) => face.categories))],
      tags: [...new Set(faces.flatMap((face) => face.tags))],
    });
  }
  return families.sort((a, b) => compareNames(a.family, b.family));
}

const sameFamily = (font: UserFont, family: string) => font.family.toLowerCase() === family.toLowerCase();

/** Every face of `family` renamed to `name` (a clean name; unchanged when empty). */
export function renameFamily(fonts: readonly UserFont[], family: string, name: string, now: string): UserFont[] {
  const cleaned = cleanFamilyName(name);
  if (!cleaned) return [...fonts];
  return fonts.map((font) => (sameFamily(font, family) ? { ...font, family: cleaned, updatedAt: now } : font));
}

export function setFamilyCategories(fonts: readonly UserFont[], family: string, categories: readonly CategoryId[], now: string): UserFont[] {
  const clean = [...new Set(categories.filter(isCategoryId))];
  return fonts.map((font) => (sameFamily(font, family) ? { ...font, categories: clean, updatedAt: now } : font));
}

export function setFamilyTags(fonts: readonly UserFont[], family: string, tags: readonly string[], now: string): UserFont[] {
  const clean = parseTags(tags.join(","));
  return fonts.map((font) => (sameFamily(font, family) ? { ...font, tags: clean, updatedAt: now } : font));
}

/** Without the faces of `family`. */
export const removeFamily = (fonts: readonly UserFont[], family: string): UserFont[] => fonts.filter((font) => !sameFamily(font, family));

/** The face of the same family, style and size as `candidate` (the same file added twice), or null. */
export function duplicateOf(fonts: readonly UserFont[], candidate: Pick<UserFont, "family" | "weight" | "italic" | "bytes">): UserFont | null {
  return fonts.find((font) => sameFamily(font, candidate.family) && font.weight === candidate.weight && font.italic === candidate.italic && font.bytes === candidate.bytes) ?? null;
}

/** The file name a face is kept under (IndexedDB key suffix, library folder, project `fonts/` copy). */
export const userFontFile = (font: Pick<UserFont, "id" | "format">): string => `${font.id}.${font.format}`;

/**
 * The union of two lists by id (the library folder sync): the newer copy of a record wins
 * (`updatedAt`), ties keep `ours`.
 */
export function mergeUserFonts(ours: readonly UserFont[], theirs: readonly UserFont[]): UserFont[] {
  const byId = new Map(ours.map((font) => [font.id, font]));
  for (const font of theirs) {
    const known = byId.get(font.id);
    if (!known || font.updatedAt > known.updatedAt) byId.set(font.id, font);
  }
  return [...byId.values()].sort((a, b) => a.addedAt.localeCompare(b.addedAt) || a.id.localeCompare(b.id));
}
