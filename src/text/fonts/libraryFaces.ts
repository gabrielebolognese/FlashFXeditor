// The library fonts a text style needs and the manifest record of each file (spec §20.1, §21.3). Pure:
// the app's font controller copies the files in the browser, the project CLI (`normalize`, Batch 55)
// in Node, both through these functions so the records are the same.
import type { TextStyle } from "../../core/document/types.js";
import { coreFont, SUBSET_RANGES, type CoreFont } from "../../render/text/bundledFonts.js";
import type { ProjectFontFace } from "../fonts.js";
import { catalogFamily, faceFiles, fileRange, type CatalogFile, type FontCatalog } from "./catalog.js";

/** A library file of a style, with the unicode range of its subset. */
export interface LibraryFile {
  file: CatalogFile;
  range?: string;
}

export type FontStyleKey = Pick<TextStyle, "fontFamily" | "fontWeight" | "italic">;

/** The file name without folder and extension. */
export const stem = (path: string): string => (path.split("/").pop() ?? path).replace(/\.[^.]*$/, "");

/** A core family's files of the face a style picks (its variable files, every subset), without the catalog. */
export function coreFiles(font: CoreFont, italic: boolean): CatalogFile[] {
  const style = italic && font.italic ? "italic" : "normal";
  return (Object.keys(SUBSET_RANGES) as (keyof typeof SUBSET_RANGES)[]).map((subset) => ({ subset, range: font.weights, style, path: `${font.slug}/${font.slug}-${subset}-wght-${style}.woff2`, bytes: 0 }));
}

/** A library style's files (core or catalog), with their unicode ranges; null when the family is not in the library (or the catalog is not read). */
export function libraryFiles(style: FontStyleKey, catalog: FontCatalog | null): { family: string; files: LibraryFile[] } | null {
  const core = coreFont(style.fontFamily);
  if (core) return { family: core.family, files: coreFiles(core, style.italic).map((file) => ({ file, range: SUBSET_RANGES[file.subset as keyof typeof SUBSET_RANGES] })) };
  const entry = catalogFamily(catalog, style.fontFamily);
  if (!entry || !catalog) return null;
  return {
    family: entry.family,
    files: faceFiles(entry, style.fontWeight, style.italic).map((file) => {
      const range = fileRange(catalog, entry, file);
      return { file, ...(range && { range }) };
    }),
  };
}

/** The manifest record of a library file (without the name it gets in `fonts/`). */
export function libraryFaceRecord(family: string, { file, range }: LibraryFile): Omit<ProjectFontFace, "file"> {
  return {
    family,
    style: file.range ? "Variable" : String(file.weight ?? 400),
    weight: file.weight ?? file.range?.[0] ?? 400,
    ...(file.range && { weightRange: file.range }),
    italic: file.style === "italic",
    postscriptName: stem(file.path),
    source: "library",
    ...(range && { unicodeRange: range }),
    origin: file.path,
  };
}
