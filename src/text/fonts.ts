// Font model of the text engine (spec §10.1 "Fonts"): the CSS font shorthand a style draws with, face
// names of system fonts (`queryLocalFonts` gives "Bold Italic", "Semibold"...) as weight and italic,
// CSS font matching among a family's faces, and the manifest of the font files a project carries in
// `<project>/fonts/` (system fonts copied when used, so the project renders the same elsewhere). Pure.
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

/** A font file of the project folder (`fonts/<file>`): one face of a family copied from the system. */
export interface ProjectFontFace {
  family: string;
  /** The face's style name as the system gave it ("Bold Italic"). */
  style: string;
  weight: number;
  italic: boolean;
  postscriptName: string;
  /** The file name in `fonts/`. */
  file: string;
}

const isText = (value: unknown): value is string => typeof value === "string" && value !== "";

/** The faces of a `fonts/fonts.json` text; entries that are not faces (and unsafe file names) are left out. */
export function parseFontManifest(text: string): ProjectFontFace[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return [];
  }
  const faces = (raw as { faces?: unknown } | null)?.faces;
  if (!Array.isArray(faces)) return [];
  const out: ProjectFontFace[] = [];
  for (const entry of faces as unknown[]) {
    const face = entry as Partial<ProjectFontFace> | null;
    if (!face || !isText(face.family) || !isText(face.file) || face.file.includes("/") || face.file.includes("\\") || face.file.startsWith(".")) continue;
    const weight = typeof face.weight === "number" && face.weight >= 1 && face.weight <= 1000 ? face.weight : 400;
    out.push({ family: face.family, style: isText(face.style) ? face.style : "Regular", weight, italic: face.italic === true, postscriptName: isText(face.postscriptName) ? face.postscriptName : face.file, file: face.file });
  }
  return out;
}

export function formatFontManifest(faces: readonly ProjectFontFace[]): string {
  return `${JSON.stringify({ version: 1, faces }, null, 2)}\n`;
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
