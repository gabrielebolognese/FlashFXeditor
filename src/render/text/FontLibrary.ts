// The fonts text can use (spec §10.1 "Fonts"), and whether a text's fonts are ready to draw.
// - Bundled families: `FontFace`s added to the document's font set at start, loaded by the browser
//   only when a text (or a font picker row) uses them.
// - Project fonts: faces read from `<project>/fonts/` (system fonts copied there when used), added
//   while the project is open. They take precedence over an installed font of the same name, so the
//   project draws the same on every machine.
// - System fonts: installed families, drawn by name. A family that is none of these is `missing`: it
//   draws with the DS body font (the layout's fallback) and the timeline shows a badge.
// - `ready(style, text)`: whether the faces the text needs are loaded (`FontFaceSet.check`); when not,
//   it starts loading them. Loads and project font changes are reported to the listeners (the
//   layouts, rasters and views follow).
// The installed check measures a test string in the family against two generic fallbacks: a family
// the browser does not have measures like the fallback in both (cached per family).
import type { TextStyle } from "../../core/document/types.js";
import { fontShorthand, quoteFamily } from "../../text/fonts.js";
import { BUNDLED_FONTS, bundledFaces, bundledFont } from "./bundledFonts.js";

export type FontSource = "bundled" | "project" | "system" | "missing";

/** A face of a project font file. */
export interface ProjectFace {
  family: string;
  weight: number;
  italic: boolean;
  data: ArrayBuffer;
}

/** What changed: the families concerned (lower case), and whether their drawing may differ now (project faces came or went). */
export interface FontChange {
  families: ReadonlySet<string>;
  redraw: boolean;
}

const TEST_STRING = "mmmmmmmmmmlli1WQ@#&";

export class FontLibrary {
  private readonly listeners = new Set<(change: FontChange) => void>();
  private readonly loading = new Map<string, Promise<void>>();
  private readonly installed = new Map<string, boolean>();
  private projectFaces: FontFace[] = [];
  private readonly projectFamilies = new Set<string>();
  private probe: OffscreenCanvasRenderingContext2D | null | undefined;

  constructor(private readonly fonts: FontFaceSet | null) {}

  /** Adds the bundled faces (not loaded) and starts reporting loads. Returns a stop function. */
  install(): () => void {
    const fonts = this.fonts;
    if (!fonts) return () => undefined;
    const added: FontFace[] = [];
    for (const font of BUNDLED_FONTS) {
      for (const face of bundledFaces(font)) {
        const fontFace = new FontFace(face.family, `url("${face.url}") format("woff2")`, { style: face.style, weight: face.weight, unicodeRange: face.unicodeRange, display: "block" });
        fonts.add(fontFace);
        added.push(fontFace);
      }
    }
    const onLoaded = (event: Event) => {
      const faces = (event as FontFaceSetLoadEvent).fontfaces ?? [];
      const families = new Set(faces.map((face) => unquote(face.family).toLowerCase()));
      if (families.size > 0) this.emit({ families, redraw: false });
    };
    fonts.addEventListener("loadingdone", onLoaded);
    return () => {
      fonts.removeEventListener("loadingdone", onLoaded);
      for (const face of added) fonts.delete(face);
    };
  }

  /** Where a family comes from (bundled, the project's fonts, installed) or `missing`. */
  source(family: string): FontSource {
    if (bundledFont(family)) return "bundled";
    if (this.projectFamilies.has(family.toLowerCase())) return "project";
    return this.isInstalled(family) ? "system" : "missing";
  }

  /** Whether the faces `style` needs for `text` are loaded; when not, starts loading them (listeners hear when they are). */
  ready(style: Pick<TextStyle, "fontFamily" | "fontWeight" | "italic">, text: string): boolean {
    const fonts = this.fonts;
    if (!fonts) return true;
    const font = fontShorthand(style, 16, "");
    const sample = text === "" ? " " : text;
    try {
      if (fonts.check(font, sample)) return true;
    } catch {
      return true;
    }
    void this.load(style, text);
    return false;
  }

  /** Loads the faces `style` needs for `text` (resolves when they are loaded or failed). */
  load(style: Pick<TextStyle, "fontFamily" | "fontWeight" | "italic">, text: string): Promise<void> {
    const fonts = this.fonts;
    if (!fonts) return Promise.resolve();
    const font = fontShorthand(style, 16, "");
    const sample = text === "" ? " " : text;
    const id = `${font}|${sample}`;
    let pending = this.loading.get(id);
    if (!pending) {
      pending = fonts
        .load(font, sample)
        .then(
          () => undefined,
          (error: unknown) => console.warn(`[text] cannot load the font ${font}`, error),
        )
        .finally(() => {
          this.loading.delete(id);
          this.emit({ families: new Set([style.fontFamily.toLowerCase()]), redraw: false });
        });
      this.loading.set(id, pending);
    }
    return pending;
  }

  /** Replaces the project's font faces (a project opened, a font copied in). */
  async setProjectFaces(faces: readonly ProjectFace[]): Promise<void> {
    const fonts = this.fonts;
    const before = new Set(this.projectFamilies);
    this.removeProjectFaces();
    if (!fonts) return;
    for (const face of faces) {
      try {
        const fontFace = new FontFace(face.family, face.data, { weight: String(face.weight), style: face.italic ? "italic" : "normal" });
        await fontFace.load();
        fonts.add(fontFace);
        this.projectFaces.push(fontFace);
        this.projectFamilies.add(face.family.toLowerCase());
      } catch (error) {
        console.warn(`[text] cannot read the project font ${face.family}`, error);
      }
    }
    const families = new Set([...before, ...this.projectFamilies]);
    this.installed.clear();
    this.emit({ families, redraw: true });
  }

  /** Removes the project's faces (project closed). */
  clearProjectFaces(): void {
    if (this.projectFaces.length === 0) return;
    const families = new Set(this.projectFamilies);
    this.removeProjectFaces();
    this.installed.clear();
    this.emit({ families, redraw: true });
  }

  /** Whether the project carries faces of `family`. */
  hasProjectFamily(family: string): boolean {
    return this.projectFamilies.has(family.toLowerCase());
  }

  subscribe(listener: (change: FontChange) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private removeProjectFaces(): void {
    for (const face of this.projectFaces) this.fonts?.delete(face);
    this.projectFaces = [];
    this.projectFamilies.clear();
  }

  private emit(change: FontChange): void {
    for (const listener of [...this.listeners]) listener(change);
  }

  /** Whether the browser draws `family` with its own font (an installed one), cached. */
  private isInstalled(family: string): boolean {
    const key = family.toLowerCase();
    const known = this.installed.get(key);
    if (known !== undefined) return known;
    if (this.probe === undefined) this.probe = typeof OffscreenCanvas === "undefined" ? null : new OffscreenCanvas(1, 1).getContext("2d");
    const ctx = this.probe;
    // No way to tell: assume it is there (no false missing badges).
    if (!ctx) return true;
    const width = (font: string) => {
      ctx.font = font;
      return ctx.measureText(TEST_STRING).width;
    };
    let result = false;
    for (const generic of ["monospace", "serif", "sans-serif"]) {
      if (width(`72px ${quoteFamily(family)}, ${generic}`) !== width(`72px ${generic}`)) {
        result = true;
        break;
      }
    }
    this.installed.set(key, result);
    return result;
  }
}

function unquote(family: string): string {
  const trimmed = family.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) return trimmed.slice(1, -1).replace(/\\(.)/g, "$1");
  return trimmed;
}
