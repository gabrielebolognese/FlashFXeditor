// System fonts and the project's font files (spec §10.1 "Fonts", §20.1 Projects):
// - `systemFonts`: the installed families for the font browser, listed on request (the Local Font
//   Access API asks for permission the first time; the listing module is a dynamic import, P12).
// - Project fonts: every font a text uses (text clips and caption styles) is copied into
//   `<project>/fonts/` whatever its source, so the project never depends on the machine or on the app
//   version's library: a library family's files of the face the style draws with (every subset), a
//   My fonts face's file, an installed face (the one the weight and italic pick, CSS matching, once
//   the system fonts are listed). `fonts/fonts.json` (version 2) records each file's family, weight,
//   style and source. The faces are registered while the project is open, so it renders the same on
//   a machine without the font, and after the font left My fonts. Copies run after document changes,
//   one at a time, and only in a writable project.
// - Exports: the faces the export worker adds before it draws (`exportFontFaces`): the project's
//   copies, and what they do not cover yet (library files by URL, My fonts files).
import { createStore } from "../core/store/createStore.js";
import type { TextStyle } from "../core/document/types.js";
import { setSectionCollapsed } from "../core/store/sessionStore.js";
import { toggleFavoriteFont } from "../project/appSettings.js";
import { propertiesContext } from "../panels/properties/context.js";
import type { FsDir } from "../project/fs.js";
import { safeFileName, takenNames, uniqueName } from "../project/mediaFiles.js";
import { coreFont, libraryUrl, SUBSET_RANGES, appBaseUrl, type CoreFont } from "../render/text/bundledFonts.js";
import type { FontDescriptor, ProjectFace } from "../render/text/FontLibrary.js";
import type { LocalFace } from "../render/text/localFonts.js";
import { faceFiles, fileRange, type CatalogFile } from "../text/fonts/catalog.js";
import {
  faceCovers,
  faceWeightDescriptor,
  fontExtension,
  FONT_MANIFEST,
  FONTS_DIR,
  formatFontManifest,
  nearestFace,
  parseFontManifest,
  projectTextStyles,
  type ProjectFontFace,
} from "../text/fonts.js";
import { fontCatalog, installCatalogController, loadFontCatalog } from "./catalogController.js";
import { showExportTab } from "./exportState.js";
import { actions, appSettings, documentStore, fontLibrary, sessionStore } from "./services.js";
import { installUserFonts, pickFontFiles, readUserFontData, userFonts } from "./userFontsController.js";

export type SystemFontsStatus = "idle" | "loading" | "ready" | "denied" | "unsupported";

export interface SystemFonts {
  status: SystemFontsStatus;
  /** Installed family names, sorted. */
  families: readonly string[];
}

export const systemFonts = createStore<SystemFonts>({ status: "idle", families: [] });

/** Installed faces by family (once listed). */
let localFaces = new Map<string, LocalFace[]>();

/** The installed faces of a family (once the system fonts are listed). */
export const systemFaces = (family: string): readonly LocalFace[] => localFaces.get(family) ?? [];

/** Lists the installed fonts (asks for permission the first time; call it from a click). */
export async function requestSystemFonts(): Promise<void> {
  const state = systemFonts.getState().status;
  if (state === "loading" || state === "ready") return;
  const { localFontsSupported, queryLocalFaces, groupFamilies } = await import("../render/text/localFonts.js");
  if (!localFontsSupported()) {
    systemFonts.set({ status: "unsupported", families: [] });
    return;
  }
  systemFonts.set({ status: "loading", families: [] });
  try {
    localFaces = groupFamilies(await queryLocalFaces());
    systemFonts.set({ status: "ready", families: [...localFaces.keys()] });
    scheduleCopy();
  } catch (error) {
    console.info("[fonts] system fonts not listed", error);
    systemFonts.set({ status: "denied", families: [] });
  }
}

interface OpenFonts {
  dir: FsDir;
  isWritable: () => boolean;
  /** The manifest's faces and their bytes. */
  faces: ProjectFontFace[];
  data: Map<string, ArrayBuffer>;
  stop: () => void;
  closed: boolean;
}

let open: OpenFonts | null = null;
let queue: Promise<void> = Promise.resolve();

/** Reads `fonts/` of a project that opened, registers its faces and starts copying the fonts it uses. */
export function attachFonts(dir: FsDir, isWritable: () => boolean): void {
  detachFonts();
  const state: OpenFonts = { dir, isWritable, faces: [], data: new Map(), stop: () => undefined, closed: false };
  open = state;
  const stops = [
    documentStore.subscribe(() => scheduleCopy(), { affects: ["text", "clips", "captions"] }),
    // Library families are known once the catalog is read; My fonts can change at any time.
    fontCatalog.subscribe(() => scheduleCopy()),
    userFonts.subscribe(() => scheduleCopy()),
  ];
  state.stop = () => {
    for (const stop of stops) stop();
  };
  queue = queue.then(async () => {
    if (state.closed) return;
    try {
      const fontsDir = await dir.dir(FONTS_DIR);
      const manifest = fontsDir ? await fontsDir.readFile(FONT_MANIFEST) : null;
      if (!fontsDir || !manifest) return;
      for (const face of parseFontManifest(manifest.text)) {
        const file = await fontsDir.getFile(face.file);
        if (!file) continue;
        state.faces.push(face);
        state.data.set(face.file, await file.arrayBuffer());
      }
      if (!state.closed) await register(state);
    } catch (error) {
      console.warn("[fonts] cannot read the project fonts", error);
    }
  });
  scheduleCopy();
}

/** The project closed: its faces leave the font set. */
export function detachFonts(): void {
  if (!open) return;
  open.closed = true;
  open.stop();
  open = null;
  fontLibrary.clearProjectFaces();
}

const projectFace = (face: ProjectFontFace, data: ArrayBuffer): ProjectFace => ({
  family: face.family,
  weight: face.weight,
  ...(face.weightRange && { weightRange: face.weightRange }),
  italic: face.italic,
  ...(face.unicodeRange && { unicodeRange: face.unicodeRange }),
  data,
});

async function register(state: OpenFonts): Promise<void> {
  const faces: ProjectFace[] = [];
  for (const face of state.faces) {
    const data = state.data.get(face.file);
    if (data) faces.push(projectFace(face, data.slice(0)));
  }
  await fontLibrary.setProjectFaces(faces);
}

/** The project's font records (spec §20.1: each used font with its source), for checks. */
export function projectFontFaces(): readonly ProjectFontFace[] {
  return open?.faces ?? [];
}

let scheduled = false;

/** Copies used fonts soon (after the current burst of commands). */
function scheduleCopy(): void {
  if (scheduled || !open) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    const state = open;
    if (state) queue = queue.then(() => copyUsedFaces(state)).catch((error: unknown) => console.warn("[fonts] cannot copy a font into the project", error));
  });
}

/** One file to copy into `fonts/`: its record (without the file name), a name to start from and its bytes. */
interface WantedFile {
  face: Omit<ProjectFontFace, "file">;
  name: string;
  read: () => Promise<Blob | null>;
}

const stem = (path: string) => (path.split("/").pop() ?? path).replace(/\.[^.]*$/, "");

/** A core family's files of the face a style picks (its variable files, every subset), without the catalog. */
function coreFiles(font: CoreFont, italic: boolean): CatalogFile[] {
  const style = italic && font.italic ? "italic" : "normal";
  return (Object.keys(SUBSET_RANGES) as (keyof typeof SUBSET_RANGES)[]).map((subset) => ({ subset, range: font.weights, style, path: `${font.slug}/${font.slug}-${subset}-wght-${style}.woff2`, bytes: 0 }));
}

/** A library style's files (core or catalog), with their unicode ranges; null when the family is not in the library (or the catalog is not read). */
function libraryFiles(style: Pick<TextStyle, "fontFamily" | "fontWeight" | "italic">): { family: string; files: { file: CatalogFile; range?: string }[] } | null {
  const core = coreFont(style.fontFamily);
  if (core) return { family: core.family, files: coreFiles(core, style.italic).map((file) => ({ file, range: SUBSET_RANGES[file.subset as keyof typeof SUBSET_RANGES] })) };
  const entry = fontLibrary.libraryFamily(style.fontFamily);
  const catalog = fontCatalog.getState().catalog;
  if (!entry || !catalog) return null;
  return {
    family: entry.family,
    files: faceFiles(entry, style.fontWeight, style.italic).map((file) => {
      const range = fileRange(catalog, entry, file);
      return { file, ...(range && { range }) };
    }),
  };
}

const fetchBlob = async (url: string): Promise<Blob | null> => {
  const response = await fetch(url);
  return response.ok ? await response.blob() : null;
};

/** The files each used style needs that the project does not carry yet (by what they are copies of). */
function wantedFiles(state: OpenFonts): WantedFile[] {
  const wanted = new Map<string, WantedFile>();
  const have = (origin: string) => state.faces.some((face) => face.origin === origin || (face.source === "system" && face.postscriptName === origin));
  const baseUrl = appBaseUrl();
  for (const style of projectTextStyles(documentStore.getState())) {
    const { fontFamily, fontWeight, italic } = style;
    const library = libraryFiles(style);
    if (library) {
      for (const { file, range } of library.files) {
        if (have(file.path) || wanted.has(file.path)) continue;
        const face: Omit<ProjectFontFace, "file"> = {
          family: library.family,
          style: file.range ? "Variable" : String(file.weight ?? 400),
          weight: file.weight ?? file.range?.[0] ?? 400,
          ...(file.range && { weightRange: file.range }),
          italic: file.style === "italic",
          postscriptName: stem(file.path),
          source: "library",
          ...(range && { unicodeRange: range }),
          origin: file.path,
        };
        wanted.set(file.path, { face, name: file.path.split("/").pop() ?? `${stem(file.path)}.woff2`, read: () => fetchBlob(libraryUrl(file.path, baseUrl)) });
      }
      continue;
    }
    const user = fontLibrary.userFace(fontFamily, fontWeight, italic);
    if (user) {
      if (have(user.id) || wanted.has(user.id)) continue;
      const face: Omit<ProjectFontFace, "file"> = { family: user.family, style: user.style, weight: user.weight, italic: user.italic, postscriptName: user.postscriptName, source: "user", origin: user.id };
      wanted.set(user.id, {
        face,
        name: safeFileName(`${user.postscriptName || user.family}.${user.format}`),
        read: async () => {
          const data = await readUserFontData(user);
          return data ? new Blob([data]) : null;
        },
      });
      continue;
    }
    if (fontLibrary.source(fontFamily) === "library") continue;
    const faces = localFaces.get(fontFamily);
    const local = faces ? nearestFace(faces, fontWeight, italic) : null;
    if (!local || have(local.postscriptName) || wanted.has(local.postscriptName)) continue;
    const face: Omit<ProjectFontFace, "file"> = { family: local.family, style: local.style, weight: local.weight, italic: local.italic, postscriptName: local.postscriptName, source: "system" };
    wanted.set(local.postscriptName, { face, name: "", read: () => local.blob() });
  }
  return [...wanted.values()];
}

async function copyUsedFaces(state: OpenFonts): Promise<void> {
  if (state.closed || !state.isWritable()) return;
  const files = wantedFiles(state);
  if (files.length === 0) return;
  const fontsDir = await state.dir.dir(FONTS_DIR, { create: true });
  if (!fontsDir) return;
  const taken = await takenNames(fontsDir);
  let copied = 0;
  for (const wanted of files) {
    if (state.closed) return;
    const blob = await wanted.read();
    if (!blob) continue;
    const data = await blob.arrayBuffer();
    const base = wanted.name || `${wanted.face.postscriptName || wanted.face.family}${fontExtension(new Uint8Array(data, 0, Math.min(4, data.byteLength)))}`;
    const name = uniqueName(taken, safeFileName(base));
    await fontsDir.writeFile(name, blob);
    state.faces.push({ ...wanted.face, file: name });
    state.data.set(name, data);
    copied += 1;
    console.info(`[fonts] copied ${wanted.face.family} (${wanted.face.source}) into ${FONTS_DIR}/${name}`);
  }
  if (copied === 0) return;
  await fontsDir.writeText(FONT_MANIFEST, formatFontManifest(state.faces));
  if (!state.closed) await register(state);
}

/**
 * The faces an export worker adds before its first frame (spec §20.1 Workers): the project's copies,
 * then what they do not cover (a read-only project, a copy still on its way): library files by URL,
 * My fonts files. The worker adds the core fonts itself; installed fonts draw by name there too.
 */
export async function exportFontFaces(styles: readonly Pick<TextStyle, "fontFamily" | "fontWeight" | "italic">[]): Promise<FontDescriptor[]> {
  const out: FontDescriptor[] = [];
  const copies = open?.faces ?? [];
  for (const face of copies) {
    const data = open?.data.get(face.file);
    if (data) out.push({ family: face.family, data: data.slice(0), weight: faceWeightDescriptor(face), style: face.italic ? "italic" : "normal", ...(face.unicodeRange && { unicodeRange: face.unicodeRange }) });
  }
  const seen = new Set<string>();
  for (const style of styles) {
    const key = `${style.fontFamily.toLowerCase()}|${style.fontWeight}|${style.italic}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const covered = copies.some((face) => face.family.toLowerCase() === style.fontFamily.toLowerCase() && faceCovers(face, style.fontWeight, style.italic));
    if (covered || coreFont(style.fontFamily)) continue;
    const library = fontLibrary.libraryDescriptors(style);
    if (library.length > 0) {
      for (const descriptor of library) if (!out.some((known) => known.url === descriptor.url)) out.push(descriptor);
      continue;
    }
    const user = fontLibrary.userFace(style.fontFamily, style.fontWeight, style.italic);
    if (user && !copies.some((face) => face.origin === user.id)) {
      const data = await readUserFontData(user);
      if (data && !out.some((known) => known.family === user.family && known.weight === String(user.weight) && known.style === (user.italic ? "italic" : "normal") && known.data)) {
        out.push({ family: user.family, data, weight: String(user.weight), style: user.italic ? "italic" : "normal" });
      }
    }
  }
  return out;
}

// The font browser's commands (spec §20.1; Batch 40: every action is a command with a palette entry).

/** `text.fontBrowser` asks the font field the properties panel shows to open its browser (a count of requests). */
export const fontBrowserRequest = createStore(0);

/** The family the open font browser points at (its hovered or highlighted row): what `fonts.toggleFavorite` stars. */
let browserFamily: string | null = null;
export const setBrowserFamily = (family: string | null): void => {
  browserFamily = family;
};

/** The properties section that has a font field for the selection: the Text section, else the caption track's Caption style. */
function fontSection(): { section: "text" | "captionStyle"; family: string | null } | null {
  const project = documentStore.getState();
  const point = sessionStore.editPoint.getState();
  const context = propertiesContext(sessionStore.selection.getState(), sessionStore.marker.getState(), project, {
    transition: sessionStore.transition.getState(),
    editPoint: point ? { left: point.left, right: point.right } : null,
  });
  if (context.kind === "clips" && context.textIds.length > 0) {
    const clip = project.clips[context.textIds[0] as string];
    return { section: "text", family: clip?.kind === "text" ? clip.style.fontFamily : null };
  }
  if ((context.kind === "clips" || context.kind === "track") && context.captionTrackId) {
    return { section: "captionStyle", family: project.captionTracks[context.captionTrackId]?.style?.text?.fontFamily ?? null };
  }
  return null;
}

/** Registers the font commands, reads My fonts and starts the catalog's idle check. Returns a stop function. */
export function installFontController(): () => void {
  const stops = [
    installCatalogController(),
    installUserFonts(),
    actions.register(
      "text.fontBrowser",
      () => {
        const found = fontSection();
        if (!found) return false;
        showExportTab(false);
        setSectionCollapsed(sessionStore, found.section, false);
        fontBrowserRequest.set((count) => count + 1);
      },
      { enabled: () => fontSection() !== null },
    ),
    actions.register("fonts.add", () => void pickFontFiles()),
    actions.register(
      "fonts.toggleFavorite",
      () => {
        const family = browserFamily ?? fontSection()?.family ?? null;
        if (!family) return false;
        void appSettings.update({ favoriteFonts: toggleFavoriteFont(appSettings.getState().favoriteFonts, family) });
      },
      { enabled: () => (browserFamily ?? fontSection()?.family ?? null) !== null },
    ),
  ];
  if (import.meta.env.DEV) {
    // Console access for the acceptance checks (load counter, catalog, My fonts, the project's records).
    const editor = ((globalThis as { __editor?: Record<string, unknown> }).__editor ??= {});
    editor.fonts = { library: fontLibrary, catalog: fontCatalog, loadCatalog: loadFontCatalog, user: userFonts, loads: () => fontLibrary.loadStats(), projectFaces: projectFontFaces, exportFaces: exportFontFaces };
  }
  return () => {
    for (const stop of stops) stop();
  };
}
