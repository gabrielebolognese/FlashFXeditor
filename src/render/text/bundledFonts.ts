// The bundled content fonts (spec §3.1 "a curated bundled set (variable fonts, open licenses)",
// §10.1): eight variable families under the SIL Open Font License (each folder in ./fonts holds its
// OFL.txt), taken from the Fontsource builds of Google Fonts. Each family ships its latin and
// latin-ext subsets, upright and (where the family has one) italic, as `wght` variable woff2 files:
// the browser loads only the subsets a text uses (unicode ranges) and only when a text uses them.
// The files are bundled as hashed assets by Vite.

export type FontCategory = "sans" | "serif" | "display" | "handwriting" | "mono";

export interface BundledFont {
  family: string;
  /** Folder and file prefix in ./fonts. */
  slug: string;
  /** The weight axis range. */
  weights: readonly [number, number];
  /** Whether the family has an italic (otherwise the browser slants it). */
  italic: boolean;
  category: FontCategory;
}

export const BUNDLED_FONTS: readonly BundledFont[] = [
  { family: "Inter", slug: "inter", weights: [100, 900], italic: true, category: "sans" },
  { family: "Montserrat", slug: "montserrat", weights: [100, 900], italic: true, category: "sans" },
  { family: "Nunito", slug: "nunito", weights: [200, 1000], italic: true, category: "sans" },
  { family: "Oswald", slug: "oswald", weights: [200, 700], italic: false, category: "display" },
  { family: "Unbounded", slug: "unbounded", weights: [200, 900], italic: false, category: "display" },
  { family: "Playfair Display", slug: "playfair-display", weights: [400, 900], italic: true, category: "serif" },
  { family: "Caveat", slug: "caveat", weights: [400, 700], italic: false, category: "handwriting" },
  { family: "JetBrains Mono", slug: "jetbrains-mono", weights: [100, 800], italic: true, category: "mono" },
];

/** Unicode ranges of the subsets (Fontsource's, the same for every family). */
const SUBSETS = {
  latin: "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
  "latin-ext":
    "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
} as const;

const FILES = import.meta.glob<string>("./fonts/*/*.woff2", { query: "?url", import: "default", eager: true });

export interface BundledFace {
  family: string;
  url: string;
  style: "normal" | "italic";
  /** CSS `font-weight` range, e.g. "100 900". */
  weight: string;
  unicodeRange: string;
}

/** The font files of a bundled family (one per subset and style). */
export function bundledFaces(font: BundledFont): BundledFace[] {
  const faces: BundledFace[] = [];
  for (const style of font.italic ? (["normal", "italic"] as const) : (["normal"] as const)) {
    for (const [subset, unicodeRange] of Object.entries(SUBSETS)) {
      const url = FILES[`./fonts/${font.slug}/${font.slug}-${subset}-wght-${style}.woff2`];
      if (url) faces.push({ family: font.family, url, style, weight: `${font.weights[0]} ${font.weights[1]}`, unicodeRange });
    }
  }
  return faces;
}

const BY_FAMILY = new Map(BUNDLED_FONTS.map((font) => [font.family.toLowerCase(), font]));

/** The bundled font of a family name (case-insensitive, as CSS matches families), or null. */
export function bundledFont(family: string): BundledFont | null {
  return BY_FAMILY.get(family.toLowerCase()) ?? null;
}
