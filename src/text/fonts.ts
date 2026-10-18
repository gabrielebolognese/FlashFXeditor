// Font model of the text engine (spec §10.1 "Fonts"): the CSS font shorthand a style draws with, face
// names of system fonts (`queryLocalFonts` gives "Bold Italic", "Semibold"...) as weight and italic,
// CSS font matching among a family's faces, and the manifest of the font files a project carries in
// `<project>/fonts/`. Since Batch 51 (spec §20.1 Projects) every used font is copied there, whatever
// its source (library, My fonts, system), and the manifest records the source of each face (version
// 2; version 1 manifests held system faces only and read as such). Pure.
import type { Project, TextStyle } from "../core/document/types.js";

/** The project folder's font files and their manifest (spec §10.1). */
export const FONTS_DIR = "fonts";
export const FONT_MANIFEST = "fonts.json";

/** A family name quoted for CSS (`"Segoe UI"`): quotes and backslashes escaped. */
export function quoteFamily(family: string): string {
  return `"${family.replace(/["\\]/g, (c) => `\\${c}`)}"`;
}

/**
 * The canvas / CSS `font` shorthand of `style` at `sizePx`, with `fallback` (the DS body font stack)
 * after the family: a missing family draws with the fallback (spec §10.1).
 */
export function fontShorthand(style: Pick<TextStyle, "fontFamily" | "fontWeight" | "italic">, sizePx: number, fallback: string): string {
  const weight = Math.round(Math.min(1000, Math.max(1, style.fontWeight)));
  return `${style.italic ? "italic " : ""}${weight} ${sizePx}px ${quoteFamily(style.fontFamily)}${fallback ? `, ${fallback}` : ""}`;
}

export interface FaceStyle {
  weight: number;
  italic: boolean;
}

const WEIGHT_WORDS: readonly [RegExp, number][] = [
  [/\b(hairline|thin)\b/, 100],
  [/\b(extra|ultra)[\s-]?light\b/, 200],
  [/\b(semi|demi)[\s-]?light\b/, 350],
  [/\blight\b/, 300],
  [/\bbook\b/, 400],
  [/\b(regular|normal|roman|plain)\b/, 400],
  [/\bmedium\b/, 500],
  [/\b(semi|demi)[\s-]?bold\b/, 600],
  [/\b(extra|ultra)[\s-]?bold\b/, 800],
  [/\bbold\b/, 700],
  [/\b(extra|ultra)[\s-]?black\b/, 950],
  [/\b(black|heavy)\b/, 900],
];

/** Weight and italic of a face style name ("Bold Italic", "SemiBold", "Light Oblique"); unknown words read as Regular. */
export function parseFaceStyle(name: string): FaceStyle {
  const lower = name.toLowerCase();
  const italic = /\b(italic|oblique)\b/.test(lower);
  let weight = 400;
  for (const [pattern, value] of WEIGHT_WORDS) {
    if (pattern.test(lower)) {
      weight = value;
      break;
    }
  }
  return { weight, italic };
}

/**
 * The face CSS font matching picks for `weight` / `italic` among `faces` (CSS Fonts §5.2): the style
 * first (italic falls back to normal and the reverse), then the weight: 400..500 look up to 500, then
 * down, then up; below 400 down then up; above 500 up then down. Null for no faces.
 */
export function nearestFace<T extends FaceStyle>(faces: readonly T[], weight: number, italic: boolean): T | null {
  const sameStyle = faces.filter((face) => face.italic === italic);
  const pool = sameStyle.length > 0 ? sameStyle : faces;
  let best: T | null = null;
  let bestRank = Infinity;
  for (const face of pool) {
    const rank = weightRank(face.weight, weight);
    if (rank < bestRank) {
      best = face;
      bestRank = rank;
    }
  }
  return best;
}

/** Lower is better: the CSS weight matching order as a distance. */
function weightRank(face: number, wanted: number): number {
  const d = Math.abs(face - wanted);
  if (face === wanted) return 0;
  if (wanted >= 400 && wanted <= 500) {
    if (face > wanted && face <= 500) return d;
    if (face < wanted) return 1000 + d;
    return 2000 + d;
  }
  if (wanted < 400) return face < wanted ? d : 1000 + d;
  return face > wanted ? d : 1000 + d;
}

/** Where a project's font came from (spec §20.1): the app's library, My fonts, the system. */
export type FontOrigin = "library" | "user" | "system";
export const FONT_ORIGINS: readonly FontOrigin[] = ["library", "user", "system"];

/** The manifest's version: 2 since Batch 51 (each face's source); version 1 faces were system fonts. */
export const FONT_MANIFEST_VERSION = 2;

/** A font file of the project folder (`fonts/<file>`): one face of a family, with where it came from. */
export interface ProjectFontFace {
  family: string;
  /** The face's style name ("Bold Italic"). */
  style: string;
  weight: number;
  italic: boolean;
  postscriptName: string;
  /** The file name in `fonts/`. */
  file: string;
  source: FontOrigin;
  /** A variable file's weight axis: every weight in it draws from this file. */
  weightRange?: readonly [number, number];
  /** The characters a subset file covers (library files: latin, latin-ext). */
  unicodeRange?: string;
  /** What it is a copy of: the library file (`<slug>/<file>`) or the My fonts id. */
  origin?: string;
}

const isText = (value: unknown): value is string => typeof value === "string" && value !== "";
const isWeight = (value: unknown): value is number => typeof value === "number" && value >= 1 && value <= 1000;
const isSafeFile = (file: string) => !file.includes("/") && !file.includes("\\") && !file.startsWith(".");

/**
 * The faces of a `fonts/fonts.json` text; entries that are not faces (and unsafe file names) are left
 * out. A version 1 manifest (Batch 28) is migrated: its faces are system fonts.
 */
export function parseFontManifest(text: string): ProjectFontFace[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return [];
  }
  const data = raw as { version?: unknown; faces?: unknown } | null;
  const faces = data?.faces;
  if (!Array.isArray(faces)) return [];
  const legacy = data?.version === 1 || data?.version === undefined;
  const out: ProjectFontFace[] = [];
  for (const entry of faces as unknown[]) {
    const face = entry as Partial<ProjectFontFace> | null;
    if (!face || !isText(face.family) || !isText(face.file) || !isSafeFile(face.file)) continue;
    const weight = isWeight(face.weight) ? face.weight : 400;
    const source: FontOrigin = legacy ? "system" : FONT_ORIGINS.includes(face.source as FontOrigin) ? (face.source as FontOrigin) : "system";
    const range = face.weightRange;
    const weightRange = Array.isArray(range) && range.length === 2 && isWeight(range[0]) && isWeight(range[1]) && range[0] <= range[1] ? ([range[0], range[1]] as const) : undefined;
    out.push({
      family: face.family,
      style: isText(face.style) ? face.style : "Regular",
      weight,
      italic: face.italic === true,
      postscriptName: isText(face.postscriptName) ? face.postscriptName : face.file,
      file: face.file,
      source,
      ...(weightRange && { weightRange }),
      ...(isText(face.unicodeRange) && { unicodeRange: face.unicodeRange }),
      ...(isText(face.origin) && { origin: face.origin }),
    });
  }
  return out;
}

export function formatFontManifest(faces: readonly ProjectFontFace[]): string {
  return `${JSON.stringify({ version: FONT_MANIFEST_VERSION, faces }, null, 2)}\n`;
}

/** The CSS `font-weight` descriptor of a project face: its axis ("100 900") or its weight. */
export const faceWeightDescriptor = (face: Pick<ProjectFontFace, "weight" | "weightRange">): string => (face.weightRange ? `${face.weightRange[0]} ${face.weightRange[1]}` : String(face.weight));

/** Whether `face` draws `weight` / `italic` exactly (its weight, or inside its axis; the same style). */
export function faceCovers(face: Pick<ProjectFontFace, "weight" | "weightRange" | "italic">, weight: number, italic: boolean): boolean {
  if (face.italic !== italic) return false;
  return face.weightRange ? weight >= face.weightRange[0] && weight <= face.weightRange[1] : face.weight === weight;
}

/** A project's font records (spec §20.1 "every used font is recorded with its source"): one per family and source. */
export interface ProjectFontRecord {
  family: string;
  source: FontOrigin;
  faces: ProjectFontFace[];
}

export function fontRecords(faces: readonly ProjectFontFace[]): ProjectFontRecord[] {
  const records = new Map<string, ProjectFontRecord>();
  for (const face of faces) {
    const key = `${face.source}|${face.family.toLowerCase()}`;
    const record = records.get(key);
    if (record) record.faces.push(face);
    else records.set(key, { family: face.family, source: face.source, faces: [face] });
  }
  return [...records.values()].sort((a, b) => a.family.localeCompare(b.family) || a.source.localeCompare(b.source));
}

/** The extension of an sfnt font file from its first 4 bytes: `.otf` (CFF), `.ttc` (collection), else `.ttf`. */
export function fontExtension(header: Uint8Array): string {
  const tag = String.fromCharCode(...header.slice(0, 4));
  if (tag === "OTTO") return ".otf";
  if (tag === "ttcf") return ".ttc";
  if (tag === "wOF2") return ".woff2";
  if (tag === "wOFF") return ".woff";
  return ".ttf";
}

/** Every text style a document draws with: its text clips' and its caption tracks' (spec §10.1, §10.5). */
export function projectTextStyles(project: Pick<Project, "clips" | "captionTracks">): TextStyle[] {
  const styles: TextStyle[] = [];
  for (const clip of Object.values(project.clips)) if (clip.kind === "text") styles.push(clip.style);
  for (const data of Object.values(project.captionTracks)) if (data?.style?.text) styles.push(data.style.text);
  return styles;
}

/** The families used by the text clips of a document's clip list, sorted. */
export function usedFamilies(clips: Iterable<{ kind: string; style?: Pick<TextStyle, "fontFamily"> }>): string[] {
  const families = new Set<string>();
  for (const clip of clips) if (clip.kind === "text" && clip.style) families.add(clip.style.fontFamily);
  return [...families].sort((a, b) => a.localeCompare(b));
}
