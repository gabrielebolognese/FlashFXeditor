// Font recording for `normalize` (spec §21.3, Batch 55): the library fonts the project's texts and captions
// use go into `fonts/fonts.json` (version 2) with their files copied from `public/fonts/library/`, the way the
// app copies them (the same record from `text/fonts/libraryFaces.ts`). Fonts that are not in the library
// (installed fonts, My fonts) cannot be copied from a folder: they are reported.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Project } from "../../src/core/document/types.js";
import { safeFileName, uniqueName } from "../../src/project/mediaFiles.js";
import { formatFontManifest, parseFontManifest, projectTextStyles, type ProjectFontFace } from "../../src/text/fonts.js";
import { parseCatalog, type FontCatalog } from "../../src/text/fonts/catalog.js";
import { libraryFaceRecord, libraryFiles } from "../../src/text/fonts/libraryFaces.js";

export interface FontPlan {
  /** The manifest as it will be written (existing faces first, then the new ones). */
  faces: ProjectFontFace[];
  /** Library files to copy: path under the library folder and the name in `fonts/`. */
  copies: { from: string; name: string }[];
  /** Families used that are not in the library. */
  missing: string[];
}

export function readCatalog(libraryDir: string): FontCatalog | null {
  const file = join(libraryDir, "catalog.json");
  if (!existsSync(file)) return null;
  try {
    return parseCatalog(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    return null;
  }
}

/** What recording the fonts of `project` adds to `existing` (the faces already in `fonts/fonts.json`) and the names taken in `fonts/`. */
export function planFonts(project: Project, existing: readonly ProjectFontFace[], taken: ReadonlySet<string>, catalog: FontCatalog | null): FontPlan {
  const faces = [...existing];
  const names = new Set([...taken].map((name) => name.toLowerCase()));
  for (const face of existing) names.add(face.file.toLowerCase());
  const copies: FontPlan["copies"] = [];
  const missing = new Set<string>();
  for (const style of projectTextStyles(project)) {
    const library = libraryFiles(style, catalog);
    if (!library) {
      if (!faces.some((face) => face.family.toLowerCase() === style.fontFamily.toLowerCase())) missing.add(style.fontFamily);
      continue;
    }
    for (const entry of library.files) {
      if (faces.some((face) => face.origin === entry.file.path)) continue;
      const name = uniqueName(names as Set<string>, safeFileName(entry.file.path.split("/").pop() ?? entry.file.path));
      faces.push({ ...libraryFaceRecord(library.family, entry), file: name });
      copies.push({ from: entry.file.path, name });
    }
  }
  return { faces, copies, missing: [...missing].sort() };
}

/** Writes `fonts/fonts.json` and copies the files of `plan` into `dir/fonts/`. Nothing happens when the plan adds nothing. */
export function writeFonts(dir: string, libraryDir: string, plan: FontPlan): void {
  if (plan.copies.length === 0) return;
  const fonts = join(dir, "fonts");
  mkdirSync(fonts, { recursive: true });
  for (const copy of plan.copies) copyFileSync(join(libraryDir, copy.from), join(fonts, copy.name));
  writeFileSync(join(fonts, "fonts.json"), formatFontManifest(plan.faces), "utf8");
}


export const existingFaces = (manifestPath: string): ProjectFontFace[] => (existsSync(manifestPath) ? parseFontManifest(readFileSync(manifestPath, "utf8")) : []);
