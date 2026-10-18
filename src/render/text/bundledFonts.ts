// The core fonts (spec §3.1 "a curated bundled set", §10.1): the eight Batch 28 families every new text,
// starter preset and caption style can draw with before the library's catalog is read. Since Batch 51
// (spec §20.1 "the 6-8 core bundled fonts of Batch 28 become part of Library") their files live in the
// font library (public/fonts/library/<slug>/, written by scripts/fonts/fetch-library.mjs, the same
// Fontsource builds of Google Fonts as before) and the catalog lists them; they are still added to the
// font set at start. Each family ships its latin and latin-ext subsets, upright and (where the family
// has one) italic, as `wght` variable woff2 files: the browser loads only the subsets a text uses
// (unicode ranges) and only when a text uses them.
import { LIBRARY_DIR } from "../../text/fonts/catalog.js";

export interface CoreFont {
  family: string;
  /** The library folder and file prefix. */
  slug: string;
  /** The weight axis range. */
  weights: readonly [number, number];
  /** Whether the family has an italic (otherwise the browser slants it). */
  italic: boolean;
}

export const CORE_FONTS: readonly CoreFont[] = [
  { family: "Inter", slug: "inter", weights: [100, 900], italic: true },
  { family: "Montserrat", slug: "montserrat", weights: [100, 900], italic: true },
  { family: "Nunito", slug: "nunito", weights: [200, 1000], italic: true },
  { family: "Oswald", slug: "oswald", weights: [200, 700], italic: false },
  { family: "Unbounded", slug: "unbounded", weights: [200, 900], italic: false },
  { family: "Playfair Display", slug: "playfair-display", weights: [400, 900], italic: true },
  { family: "Caveat", slug: "caveat", weights: [400, 700], italic: false },
  { family: "JetBrains Mono", slug: "jetbrains-mono", weights: [100, 800], italic: true },
];

/** Unicode ranges of the subsets (Google's, as the catalog lists them). */
export const SUBSET_RANGES = {
  latin: "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
  "latin-ext":
    "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
} as const;

export interface CoreFace {
  family: string;
  url: string;
  style: "normal" | "italic";
  /** CSS `font-weight` range, e.g. "100 900". */
  weight: string;
  unicodeRange: string;
}

/** The app's base URL (absolute), which the library folder is under. */
export function appBaseUrl(): string {
  const origin = typeof document !== "undefined" ? document.baseURI : (globalThis as { location?: { href: string } }).location?.href ?? "http://localhost/";
  return new URL(import.meta.env.BASE_URL, origin).href;
}

/** The URL of a library file (`<slug>/<file>`). */
export const libraryUrl = (path: string, baseUrl: string): string => new URL(`${LIBRARY_DIR}${path}`, baseUrl).href;

/** The font files of a core family (one per subset and style). */
export function coreFaces(font: CoreFont, baseUrl: string): CoreFace[] {
  const faces: CoreFace[] = [];
  for (const style of font.italic ? (["normal", "italic"] as const) : (["normal"] as const)) {
    for (const [subset, unicodeRange] of Object.entries(SUBSET_RANGES)) {
      const url = libraryUrl(`${font.slug}/${font.slug}-${subset}-wght-${style}.woff2`, baseUrl);
      faces.push({ family: font.family, url, style, weight: `${font.weights[0]} ${font.weights[1]}`, unicodeRange });
    }
  }
  return faces;
}

const BY_FAMILY = new Map(CORE_FONTS.map((font) => [font.family.toLowerCase(), font]));

/** The core font of a family name (case-insensitive, as CSS matches families), or null. */
export function coreFont(family: string): CoreFont | null {
  return BY_FAMILY.get(family.toLowerCase()) ?? null;
}
