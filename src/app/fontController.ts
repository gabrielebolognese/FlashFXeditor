// System fonts and the project's font files (spec §10.1 "Fonts"):
// - `systemFonts`: the installed families for the font picker, listed on request (the Local Font
//   Access API asks for permission the first time; the listing module is a dynamic import, P12).
// - Project fonts: a system font used by a text clip is copied into `<project>/fonts/` (the face the
//   clip's weight and italic pick, CSS matching) with `fonts/fonts.json` naming each file's family,
//   weight and style; the faces are registered while the project is open, so it renders the same on
//   a machine without the font. Copies run after document changes, one at a time, and only in a
//   writable project.
import { createStore } from "../core/store/createStore.js";
import type { TextClip } from "../core/document/types.js";
import type { FsDir } from "../project/fs.js";
import { safeFileName, takenNames, uniqueName } from "../project/mediaFiles.js";
import type { ProjectFace } from "../render/text/FontLibrary.js";
import type { LocalFace } from "../render/text/localFonts.js";
import { fontExtension, FONT_MANIFEST, FONTS_DIR, formatFontManifest, nearestFace, parseFontManifest, type ProjectFontFace } from "../text/fonts.js";
import { documentStore, fontLibrary } from "./services.js";

export type SystemFontsStatus = "idle" | "loading" | "ready" | "denied" | "unsupported";

export interface SystemFonts {
  status: SystemFontsStatus;
  /** Installed family names, sorted. */
  families: readonly string[];
}

export const systemFonts = createStore<SystemFonts>({ status: "idle", families: [] });

/** Installed faces by family (once listed). */
let localFaces = new Map<string, LocalFace[]>();

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

/** Reads `fonts/` of a project that opened, registers its faces and starts copying used system fonts. */
export function attachFonts(dir: FsDir, isWritable: () => boolean): void {
  detachFonts();
  const state: OpenFonts = { dir, isWritable, faces: [], data: new Map(), stop: () => undefined, closed: false };
  open = state;
  state.stop = documentStore.subscribe(() => scheduleCopy(), { affects: ["text", "clips"] });
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

async function register(state: OpenFonts): Promise<void> {
  const faces: ProjectFace[] = [];
  for (const face of state.faces) {
    const data = state.data.get(face.file);
    if (data) faces.push({ family: face.family, weight: face.weight, italic: face.italic, data: data.slice(0) });
  }
  await fontLibrary.setProjectFaces(faces);
}

let scheduled = false;

/** Copies used system fonts soon (after the current burst of commands). */
function scheduleCopy(): void {
  if (scheduled || !open) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    const state = open;
    if (state) queue = queue.then(() => copyUsedFaces(state)).catch((error: unknown) => console.warn("[fonts] cannot copy a font into the project", error));
  });
}

/** The installed face each text clip's font picks, for families the project does not carry yet in that face. */
function wantedFaces(state: OpenFonts): LocalFace[] {
  const wanted = new Map<string, LocalFace>();
  for (const clip of Object.values(documentStore.getState().clips)) {
    if (clip.kind !== "text") continue;
    const { fontFamily, fontWeight, italic } = (clip as TextClip).style;
    const faces = localFaces.get(fontFamily);
    if (!faces || fontLibrary.source(fontFamily) === "bundled") continue;
    const face = nearestFace(faces, fontWeight, italic);
    if (!face || state.faces.some((known) => known.postscriptName === face.postscriptName)) continue;
    wanted.set(face.postscriptName, face);
  }
  return [...wanted.values()];
}

async function copyUsedFaces(state: OpenFonts): Promise<void> {
  if (state.closed || !state.isWritable() || localFaces.size === 0) return;
  const faces = wantedFaces(state);
  if (faces.length === 0) return;
  const fontsDir = await state.dir.dir(FONTS_DIR, { create: true });
  if (!fontsDir) return;
  const taken = await takenNames(fontsDir);
  for (const face of faces) {
    if (state.closed) return;
    const blob = await face.blob();
    const data = await blob.arrayBuffer();
    const name = uniqueName(taken, safeFileName(`${face.postscriptName || face.fullName}${fontExtension(new Uint8Array(data, 0, Math.min(4, data.byteLength)))}`));
    await fontsDir.writeFile(name, blob);
    state.faces.push({ family: face.family, style: face.style, weight: face.weight, italic: face.italic, postscriptName: face.postscriptName, file: name });
    state.data.set(name, data);
    console.info(`[fonts] copied ${face.fullName} into ${FONTS_DIR}/${name}`);
  }
  await fontsDir.writeText(FONT_MANIFEST, formatFontManifest(state.faces));
  if (!state.closed) await register(state);
}
