// System fonts through the Local Font Access API (spec §10.1 `queryLocalFonts()`; Chromium). Loaded
// with a dynamic import when the font picker first asks for system fonts (spec P12: font listing is
// not part of startup). The list is read once per session (the API asks for permission the first
// time and needs a user gesture then) and cached here.
import { parseFaceStyle } from "../../text/fonts.js";

/** One face of an installed font (the API's `FontData`). */
export interface LocalFace {
  family: string;
  fullName: string;
  postscriptName: string;
  /** The face's style name ("Bold Italic"). */
  style: string;
  weight: number;
  italic: boolean;
  /** The font file's bytes. */
  blob(): Promise<Blob>;
}

interface FontData {
  family: string;
  fullName: string;
  postscriptName: string;
  style: string;
  blob(): Promise<Blob>;
}

type QueryLocalFonts = () => Promise<FontData[]>;

function api(): QueryLocalFonts | null {
  const query = (globalThis as { queryLocalFonts?: QueryLocalFonts }).queryLocalFonts;
  return typeof query === "function" ? query.bind(globalThis) : null;
}

/** Whether this browser can list system fonts. */
export const localFontsSupported = (): boolean => api() !== null;

let cached: Promise<LocalFace[]> | null = null;

/**
 * The installed faces (cached for the session). Rejects when the user (or a policy) refuses the
 * permission; a refusal is not cached, so a later click can ask again.
 */
export function queryLocalFaces(): Promise<LocalFace[]> {
  const query = api();
  if (!query) return Promise.resolve([]);
  cached ??= query()
    .then((fonts) =>
      fonts.map((font) => {
        const { weight, italic } = parseFaceStyle(font.style);
        return { family: font.family, fullName: font.fullName, postscriptName: font.postscriptName, style: font.style, weight, italic, blob: () => font.blob() };
      }),
    )
    .catch((error: unknown) => {
      cached = null;
      throw error;
    });
  return cached;
}

/** The faces grouped by family, families in name order. */
export function groupFamilies(faces: readonly LocalFace[]): Map<string, LocalFace[]> {
  const families = new Map<string, LocalFace[]>();
  for (const face of [...faces].sort((a, b) => a.family.localeCompare(b.family) || a.weight - b.weight)) {
    const list = families.get(face.family);
    if (list) list.push(face);
    else families.set(face.family, [face]);
  }
  return families;
}
