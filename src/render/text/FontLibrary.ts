// The fonts text can use (spec §10.1 "Fonts", §20.1), and whether a text's fonts are ready to draw.
// - Library (§20.1): the core families (render/text/bundledFonts.ts) are `FontFace`s added to the font
//   set at start, loaded by the browser only when a text uses them. The other library families are
//   known once the catalog is read (`setCatalog`); their files are fetched on demand, each one once per
//   session, and added as loaded faces with their unicode ranges.
// - My fonts (§20.1): the user's own files (`setUserFonts`, their bytes read from the global store on
//   demand), added as loaded faces under the family name the user keeps.
// - Project fonts: faces read from `<project>/fonts/` (every used font is copied there since Batch 51),
//   added while the project is open. They take precedence over an installed font of the same name, so
//   the project draws the same on every machine.
// - System fonts: installed families, drawn by name. A family that is none of these is `missing`: it
//   draws with the DS body font (the layout's fallback) and the timeline shows a badge.
// - `ready(style, text)`: whether the faces the text needs are loaded; when not, it starts loading
//   them. Those loads, and font source changes, are reported to the listeners (the layouts, rasters
//   and views follow). The font browser's rows load their files through `preview` instead: at most 6
//   at once, cancellable, and reported to nobody (scrolling the list redraws nothing).
// - Workers (§20.1 "every worker that rasterizes text, the export worker included, registers the same
//   font files"): `addDescriptors` adds the faces the main thread hands over (library files by URL,
//   project copies and My fonts by bytes).
// The installed check measures a test string in the family against two generic fallbacks: a family
// the browser does not have measures like the fallback in both (cached per family).
import type { TextStyle } from "../../core/document/types.js";
import { catalogFamily, faceFiles, fileRange, fileWeight, previewFile, type CatalogFamily, type CatalogFile, type FontCatalog } from "../../text/fonts/catalog.js";
import type { UserFamily, UserFont } from "../../text/fonts/userFonts.js";
import { fontShorthand, nearestFace, quoteFamily } from "../../text/fonts.js";
import { appBaseUrl, CORE_FONTS, coreFaces, coreFont, libraryUrl } from "./bundledFonts.js";
import { FontLoadQueue, type LoadStats, type LoadTicket } from "./FontLoadQueue.js";

export type FontSource = "library" | "user" | "project" | "system" | "missing";

/** A face of a project font file. */
export interface ProjectFace {
  family: string;
  weight: number;
  /** A variable file's weight axis. */
  weightRange?: readonly [number, number];
  italic: boolean;
  /** The characters a subset file covers. */
  unicodeRange?: string;
  data: ArrayBuffer;
}

/** A face a worker adds before it draws: a library file by URL, or a file's bytes. */
export interface FontDescriptor {
  family: string;
  url?: string;
  data?: ArrayBuffer;
  /** CSS `font-weight`: "400" or an axis "100 900". */
  weight: string;
  style: "normal" | "italic";
  unicodeRange?: string;
}

/** What changed: the families concerned (lower case), and whether their drawing may differ now (faces came or went). */
export interface FontChange {
  families: ReadonlySet<string>;
  redraw: boolean;
}

/** Reads the bytes of a My fonts face (null when they are gone). */
export type UserFontReader = (font: UserFont) => Promise<ArrayBuffer | null>;

export interface FontLibraryOptions {
  /** The app's base URL (absolute): the library folder is under it. */
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Makes a face from bytes (tests: no FontFace in jsdom). */
  makeFace?: (family: string, data: ArrayBuffer, descriptors: FontFaceDescriptors) => FontFace;
}

const TEST_STRING = "mmmmmmmmmmlli1WQ@#&";

/** Browser row faces join the font set together, at most this often (ms). */
const BATCH_MS = 100;
/** Another row face is decoded in an idle period only with this much of it left (ms; decoding takes 1-4 ms). */
const BATCH_DECODE_MIN_MS = 4;

interface BatchItem {
  key: string;
  make: () => FontFace;
  signal: AbortSignal;
  resolve: () => void;
  reject: (error: unknown) => void;
}

export class FontLibrary {
  private readonly listeners = new Set<(change: FontChange) => void>();
  private readonly loading = new Map<string, Promise<void>>();
  private readonly installed = new Map<string, boolean>();
  private projectFaces: FontFace[] = [];
  private readonly projectFamilies = new Map<string, Pick<ProjectFace, "weight" | "weightRange" | "italic">[]>();
  private probe: OffscreenCanvasRenderingContext2D | null | undefined;
  private catalog: FontCatalog | null = null;
  private users = new Map<string, UserFamily>();
  private readUser: UserFontReader = async () => null;
  /** Faces this library made from fetched or stored bytes, by load key (a library path, `user:<id>`). */
  private readonly faces = new Map<string, FontFace>();
  private descriptorFaces: FontFace[] = [];
  private readonly descriptorFamilies = new Set<string>();
  /** Families text asked to draw with (lower case): only their loads are reported. */
  private readonly watched = new Set<string>();
  private readonly queue = new FontLoadQueue();
  /** Row faces waiting to be decoded and added (`addLoaded`). */
  private readonly batch: BatchItem[] = [];
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private lastBatch = -Infinity;
  private readonly baseUrl: string;
  private readonly fetchFile: typeof fetch;
  private readonly makeFace: NonNullable<FontLibraryOptions["makeFace"]>;

  constructor(
    private readonly fonts: FontFaceSet | null,
    options: FontLibraryOptions = {},
  ) {
    this.baseUrl = options.baseUrl ?? appBaseUrl();
    this.fetchFile = options.fetch ?? ((input, init) => fetch(input, init));
    this.makeFace = options.makeFace ?? ((family, data, descriptors) => new FontFace(family, data, descriptors));
  }

  /** Adds the core faces (not loaded) and starts reporting loads. Returns a stop function. */
  install(): () => void {
    const fonts = this.fonts;
    if (!fonts) return () => undefined;
    const added: FontFace[] = [];
    for (const font of CORE_FONTS) {
      for (const face of coreFaces(font, this.baseUrl)) {
        const fontFace = new FontFace(face.family, `url("${face.url}") format("woff2")`, { style: face.style, weight: face.weight, unicodeRange: face.unicodeRange, display: "block" });
        fonts.add(fontFace);
        added.push(fontFace);
      }
    }
    const onLoaded = (event: Event) => {
      const faces = (event as FontFaceSetLoadEvent).fontfaces ?? [];
      // Loads for text only: a font browser row loading a core face redraws nothing.
      const families = new Set(faces.map((face) => unquote(face.family).toLowerCase()).filter((family) => this.watched.has(family)));
      if (families.size > 0) this.emit({ families, redraw: false });
    };
    fonts.addEventListener("loadingdone", onLoaded);
    return () => {
      fonts.removeEventListener("loadingdone", onLoaded);
      for (const face of added) fonts.delete(face);
    };
  }

  /** The library's catalog was read: its families are library fonts now (drawn again: they may have drawn with the fallback). */
  setCatalog(catalog: FontCatalog | null): void {
    this.catalog = catalog;
    if (catalog) this.emit({ families: new Set(catalog.byFamily.keys()), redraw: true });
  }

  /** The catalog family of a name (null before the catalog is read, or for other families). */
  libraryFamily(family: string): CatalogFamily | null {
    return catalogFamily(this.catalog, family);
  }

  /** My fonts changed: families that came, went or were renamed draw again. */
  setUserFonts(families: readonly UserFamily[], read: UserFontReader): void {
    this.readUser = read;
    const next = new Map(families.map((family) => [family.family.toLowerCase(), family]));
    const changed = new Set<string>();
    const ids = new Set(families.flatMap((family) => family.faces.map((face) => face.id)));
    for (const [name, family] of this.users) {
      const now = next.get(name);
      if (!now || now.family !== family.family || now.faces.length !== family.faces.length) changed.add(name);
      // Faces of removed or renamed families leave the font set.
      for (const face of family.faces) {
        const key = userKey(face);
        const fontFace = this.faces.get(key);
        if (fontFace && (!ids.has(face.id) || now?.family !== family.family)) {
          this.fonts?.delete(fontFace);
          this.faces.delete(key);
          this.queue.forget(key);
        }
      }
    }
    for (const name of next.keys()) if (!this.users.has(name)) changed.add(name);
    this.users = next;
    this.installed.clear();
    if (changed.size > 0) this.emit({ families: changed, redraw: true });
  }

  /** The My fonts family of a name, or null. */
  userFamily(family: string): UserFamily | null {
    return this.users.get(family.toLowerCase()) ?? null;
  }

  /** Where a family comes from (the library, My fonts, the project's fonts, installed) or `missing`. */
  source(family: string): FontSource {
    if (coreFont(family) || this.libraryFamily(family) || this.descriptorFamilies.has(family.toLowerCase())) return "library";
    if (this.users.has(family.toLowerCase())) return "user";
    if (this.projectFamilies.has(family.toLowerCase())) return "project";
    return this.isInstalled(family) ? "system" : "missing";
  }

  /** Whether the faces `style` needs for `text` are loaded; when not, starts loading them (listeners hear when they are). */
  ready(style: Pick<TextStyle, "fontFamily" | "fontWeight" | "italic">, text: string): boolean {
    const fonts = this.fonts;
    if (!fonts) return true;
    this.watched.add(style.fontFamily.toLowerCase());
    if (this.missingFiles(style).length > 0) {
      void this.load(style, text);
      return false;
    }
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
    this.watched.add(style.fontFamily.toLowerCase());
    const font = fontShorthand(style, 16, "");
    const sample = text === "" ? " " : text;
    const id = `${font}|${sample}`;
    let pending = this.loading.get(id);
    if (!pending) {
      const files = this.missingFiles(style).map((file) => this.queue.request(file.key, file.load, { pinned: true }).done);
      pending = Promise.all(files)
        .then(() => fonts.load(font, sample))
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

  /**
   * Loads what a font browser row needs to draw `family` at `weight` (upright, latin): queued with at
   * most 6 loads at once, cancellable, never reported. Null when there is nothing to load (an
   * installed or project font, a missing one) or it is loaded already.
   */
  preview(family: string, weight: number): LoadTicket | null {
    const core = coreFont(family);
    if (core) {
      const fonts = this.fonts;
      if (!fonts) return null;
      const font = fontShorthand({ fontFamily: core.family, fontWeight: weight, italic: false }, 16, "");
      try {
        if (fonts.check(font, core.family)) return null;
      } catch {
        return null;
      }
      return this.queue.request(`core:${font}`, async () => void (await fonts.load(font, core.family)));
    }
    const entry = this.libraryFamily(family);
    if (entry) {
      const file = previewFile(entry, weight);
      if (!file || this.faces.has(file.path)) return null;
      return this.queue.request(file.path, this.libraryLoader(entry, file, true));
    }
    const user = this.userFace(family, weight, false);
    if (user && !this.faces.has(userKey(user))) return this.queue.request(userKey(user), this.userLoader(user, true));
    return null;
  }

  /** Whether a row can draw `family` at `weight` now (its file is loaded, or there is nothing to load). */
  previewReady(family: string, weight: number): boolean {
    const core = coreFont(family);
    if (core) {
      try {
        return this.fonts?.check(fontShorthand({ fontFamily: core.family, fontWeight: weight, italic: false }, 16, ""), core.family) ?? true;
      } catch {
        return true;
      }
    }
    const entry = this.libraryFamily(family);
    if (entry) {
      const file = previewFile(entry, weight);
      return !file || this.faces.has(file.path);
    }
    const user = this.userFace(family, weight, false);
    return !user || this.faces.has(userKey(user));
  }

  /** The load counter (spec §20.1 acceptance: only visible rows load their font files). */
  loadStats(): LoadStats {
    return this.queue.stats();
  }

  /** Replaces the project's font faces (a project opened, a font copied in). */
  async setProjectFaces(faces: readonly ProjectFace[]): Promise<void> {
    const fonts = this.fonts;
    const before = new Set(this.projectFamilies.keys());
    this.removeProjectFaces();
    if (!fonts) return;
    for (const face of faces) {
      try {
        const descriptors: FontFaceDescriptors = { weight: face.weightRange ? `${face.weightRange[0]} ${face.weightRange[1]}` : String(face.weight), style: face.italic ? "italic" : "normal" };
        if (face.unicodeRange) descriptors.unicodeRange = face.unicodeRange;
        const fontFace = this.makeFace(face.family, face.data, descriptors);
        await fontFace.load();
        fonts.add(fontFace);
        this.projectFaces.push(fontFace);
        const key = face.family.toLowerCase();
        const list = this.projectFamilies.get(key);
        const style = { weight: face.weight, ...(face.weightRange && { weightRange: face.weightRange }), italic: face.italic };
        if (list) list.push(style);
        else this.projectFamilies.set(key, [style]);
      } catch (error) {
        console.warn(`[text] cannot read the project font ${face.family}`, error);
      }
    }
    const families = new Set([...before, ...this.projectFamilies.keys()]);
    this.installed.clear();
    this.emit({ families, redraw: true });
  }

  /** Removes the project's faces (project closed). */
  clearProjectFaces(): void {
    if (this.projectFaces.length === 0) return;
    const families = new Set(this.projectFamilies.keys());
    this.removeProjectFaces();
    this.installed.clear();
    this.emit({ families, redraw: true });
  }

  /** Whether the project carries faces of `family`. */
  hasProjectFamily(family: string): boolean {
    return this.projectFamilies.has(family.toLowerCase());
  }

  /** Adds faces handed over by the main thread (a worker before it draws). They stay until `clearDescriptors`. */
  async addDescriptors(descriptors: readonly FontDescriptor[]): Promise<void> {
    const fonts = this.fonts;
    if (!fonts) return;
    for (const descriptor of descriptors) {
      const options: FontFaceDescriptors = { weight: descriptor.weight, style: descriptor.style, display: "block" };
      if (descriptor.unicodeRange) options.unicodeRange = descriptor.unicodeRange;
      try {
        let face: FontFace;
        if (descriptor.data) {
          face = this.makeFace(descriptor.family, descriptor.data, options);
          await face.load();
        } else if (descriptor.url) {
          // By URL: loaded only when a text needs it (its unicode range), like the core faces.
          face = new FontFace(descriptor.family, `url("${descriptor.url}") format("woff2")`, options);
        } else continue;
        fonts.add(face);
        this.descriptorFaces.push(face);
        if (descriptor.url) this.descriptorFamilies.add(descriptor.family.toLowerCase());
      } catch (error) {
        console.warn(`[text] cannot add the font ${descriptor.family}`, error);
      }
    }
  }

  clearDescriptors(): void {
    for (const face of this.descriptorFaces) this.fonts?.delete(face);
    this.descriptorFaces = [];
    this.descriptorFamilies.clear();
  }

  /**
   * The library files a style draws with, by URL, for a worker (spec §20.1 Workers): every subset of
   * the face CSS matching picks. Empty for the core fonts (the worker adds those itself) and for
   * families that are not in the library.
   */
  libraryDescriptors(style: Pick<TextStyle, "fontFamily" | "fontWeight" | "italic">): FontDescriptor[] {
    const entry = coreFont(style.fontFamily) ? null : this.libraryFamily(style.fontFamily);
    if (!entry || !this.catalog) return [];
    const catalog = this.catalog;
    return faceFiles(entry, style.fontWeight, style.italic).map((file) => {
      const range = fileRange(catalog, entry, file);
      return { family: entry.family, url: libraryUrl(file.path, this.baseUrl), weight: fileWeight(file), style: file.style, ...(range && { unicodeRange: range }) };
    });
  }

  /** The face of a My fonts family CSS matching picks for weight / italic, or null. */
  userFace(family: string, weight: number, italic: boolean): UserFont | null {
    const user = this.users.get(family.toLowerCase());
    return user ? nearestFace(user.faces, weight, italic) : null;
  }

  subscribe(listener: (change: FontChange) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** The files a style still needs before it can draw: a library family's face (every subset), a My fonts face. */
  private missingFiles(style: Pick<TextStyle, "fontFamily" | "fontWeight" | "italic">): { key: string; load: (signal: AbortSignal) => Promise<void> }[] {
    const family = style.fontFamily;
    if (coreFont(family) || this.projectCovers(family, style.fontWeight, style.italic)) return [];
    const entry = this.libraryFamily(family);
    if (entry) return faceFiles(entry, style.fontWeight, style.italic).flatMap((file) => (this.faces.has(file.path) ? [] : [{ key: file.path, load: this.libraryLoader(entry, file, false) }]));
    const user = this.userFace(family, style.fontWeight, style.italic);
    if (user && !this.faces.has(userKey(user))) return [{ key: userKey(user), load: this.userLoader(user, false) }];
    return [];
  }

  /** Whether the project's copies draw `family` at weight / italic exactly. */
  private projectCovers(family: string, weight: number, italic: boolean): boolean {
    const faces = this.projectFamilies.get(family.toLowerCase());
    if (!faces) return false;
    return faces.some((face) => face.italic === italic && (face.weightRange ? weight >= face.weightRange[0] && weight <= face.weightRange[1] : face.weight === weight));
  }

  /** Loads a library file: fetched, then made a face (`batched`: in the next batch, for browser rows). */
  private libraryLoader(entry: CatalogFamily, file: CatalogFile, batched: boolean): (signal: AbortSignal) => Promise<void> {
    return async (signal) => {
      const response = await this.fetchFile(libraryUrl(file.path, this.baseUrl), { signal });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const data = await response.arrayBuffer();
      const descriptors: FontFaceDescriptors = { weight: fileWeight(file), style: file.style, display: "block" };
      const range = this.catalog ? fileRange(this.catalog, entry, file) : undefined;
      if (range) descriptors.unicodeRange = range;
      await this.addLoaded(file.path, () => this.makeFace(entry.family, data, descriptors), batched ? signal : null);
    };
  }

  private userLoader(font: UserFont, batched: boolean): (signal: AbortSignal) => Promise<void> {
    return async (signal) => {
      const data = await this.readUser(font);
      if (!data) throw new Error("the font file is gone");
      // Still the same family (not renamed or removed while it was read).
      if (this.userFace(font.family, font.weight, font.italic)?.id !== font.id) throw new Error("the font changed");
      await this.addLoaded(userKey(font), () => this.makeFace(font.family, data, { weight: String(font.weight), style: font.italic ? "italic" : "normal", display: "block" }), batched ? signal : null);
    };
  }

  /**
   * A face made from bytes joins the font set once it is parsed (a damaged file fails the load). Text
   * that waits for it (`batch` null) gets it at once. A browser row's face waits for the next batch
   * (`batch`: its request's signal): each face added to the document's font set restyles the whole
   * page (6-14 ms measured with the editor open), so row faces are decoded in idle time and join the
   * set together, at most every BATCH_MS; one cancelled meanwhile is never decoded.
   */
  private async addLoaded(key: string, make: () => FontFace, batch: AbortSignal | null): Promise<void> {
    if (batch) {
      await new Promise<void>((resolve, reject) => {
        this.batch.push({ key, make, signal: batch, resolve, reject });
        this.scheduleBatch();
      });
      return;
    }
    const face = make();
    await face.load();
    this.fonts?.add(face);
    this.faces.set(key, face);
  }

  private scheduleBatch(): void {
    if (this.batchTimer !== null) return;
    const wait = Math.max(0, this.lastBatch + BATCH_MS - performance.now());
    this.batchTimer = setTimeout(() => {
      const run = (deadline: { timeRemaining(): number } | null) => {
        this.batchTimer = null;
        void this.flushBatch(deadline);
      };
      if (typeof requestIdleCallback === "function") requestIdleCallback(run, { timeout: BATCH_MS });
      else run(null);
    }, wait);
  }

  /** Decodes the waiting row faces while the idle period lasts, then adds them to the font set in one go. */
  private async flushBatch(deadline: { timeRemaining(): number } | null): Promise<void> {
    const made: { item: BatchItem; face: FontFace }[] = [];
    while (this.batch.length > 0) {
      if (made.length > 0 && deadline && deadline.timeRemaining() < BATCH_DECODE_MIN_MS) break;
      const item = this.batch.shift() as BatchItem;
      if (item.signal.aborted) {
        item.reject(new DOMException("No row wants this font any more", "AbortError"));
        continue;
      }
      try {
        made.push({ item, face: item.make() });
      } catch (error) {
        item.reject(error);
      }
    }
    const loads = await Promise.allSettled(made.map(({ face }) => face.load()));
    made.forEach(({ item, face }, i) => {
      const load = loads[i];
      if (load?.status === "fulfilled") {
        this.fonts?.add(face);
        this.faces.set(item.key, face);
        item.resolve();
      } else item.reject(load?.reason);
    });
    this.lastBatch = performance.now();
    if (this.batch.length > 0) this.scheduleBatch();
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

const userKey = (font: Pick<UserFont, "id">) => `user:${font.id}`;

function unquote(family: string): string {
  const trimmed = family.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) return trimmed.slice(1, -1).replace(/\\(.)/g, "$1");
  return trimmed;
}
