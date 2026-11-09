// LUT files in the app (spec §21.19, Batch 75): the open project's `luts/<name>.cube` files that its LUT
// effects name are read, parsed and handed to the renderer's LUT library (render/effects/lutLibrary.ts); a
// file an effect starts to name later (an edit, an undo, a look) is read when it appears. Importing a `.cube`
// copies it into `luts/` (a free name: `warm.cube`, `warm-2.cube`, ...), so the project never depends on the
// file's original place. Looks carry the text of their LUTs: `ensureLuts` writes the missing ones.
import { LUT_EXTENSION, LUT_FOLDER, projectEffectFiles } from "../core/effects/effectParams.js";
import { lutAtlas, parseCube } from "../core/effects/lut.js";
import type { FsDir } from "../project/fs.js";
import { lutLibrary } from "../render/effects/lutLibrary.js";
import { documentStore } from "./services.js";

interface OpenLuts {
  dir: FsDir;
  isWritable: () => boolean;
  /** The text of each file read or written, by project path. */
  texts: Map<string, string>;
  /** Paths that could not be read or parsed (not tried again until written). */
  failed: Set<string>;
  stop: () => void;
  closed: boolean;
}

let open: OpenLuts | null = null;
let queue: Promise<void> = Promise.resolve();

const fileName = (path: string) => path.slice(LUT_FOLDER.length + 1);

/** Parses `text` and registers it under `path`; false when it is not a 3D LUT. */
function register(state: OpenLuts, path: string, text: string): boolean {
  const lut = parseCube(text);
  if (!lut) return false;
  state.texts.set(path, text);
  state.failed.delete(path);
  lutLibrary.set(path, lutAtlas(lut));
  return true;
}

/** Reads every file the document names that is not loaded yet. */
function loadMissing(state: OpenLuts): Promise<void> {
  queue = queue.then(async () => {
    if (state.closed) return;
    const wanted = projectEffectFiles(documentStore.getState().clips).filter((path) => !lutLibrary.entry(path) && !state.failed.has(path));
    if (wanted.length === 0) return;
    try {
      const folder = await state.dir.dir(LUT_FOLDER);
      for (const path of wanted) {
        const file = folder ? await folder.getFile(fileName(path)) : null;
        const text = file ? await file.text() : null;
        if (state.closed) return;
        if (text === null || !register(state, path, text)) {
          state.failed.add(path);
          console.warn(`[luts] cannot read ${path}`);
        }
      }
    } catch (error) {
      console.warn("[luts] cannot read the project's LUTs", error);
    }
  });
  return queue;
}

/** A project opened: its LUTs load now (the promise ends once they are in) and whenever an effect names a new one. */
export function attachLuts(dir: FsDir, isWritable: () => boolean): Promise<void> {
  detachLuts();
  const state: OpenLuts = { dir, isWritable, texts: new Map(), failed: new Set(), stop: () => undefined, closed: false };
  open = state;
  state.stop = documentStore.subscribe(() => void loadMissing(state), { affects: ["clips", "composite"] });
  return loadMissing(state);
}

/** The project closed: its LUTs leave the library. */
export function detachLuts(): void {
  if (!open) return;
  open.closed = true;
  open.stop();
  open = null;
  lutLibrary.clear();
}

/** The `.cube` text of a loaded LUT (to save it with a look), or null. */
export function lutText(path: string): string | null {
  return open?.texts.get(path) ?? null;
}

/** `name` as a file name of luts/: letters, digits, spaces, `-`, `_` and `.` kept, ending in `.cube`. */
export function lutFileName(name: string): string {
  const stem = name.replace(/\.cube$/i, "").replace(/[^A-Za-z0-9 _.-]+/g, "-").replace(/^[.\s-]+/, "").trim().slice(0, 60);
  return `${stem === "" ? "lut" : stem}${LUT_EXTENSION}`;
}

/** The first name of `taken` not used: `warm.cube`, `warm-2.cube`, ... (compared without case). */
export function freeLutName(name: string, taken: readonly string[]): string {
  const used = new Set(taken.map((entry) => entry.toLowerCase()));
  const base = lutFileName(name);
  if (!used.has(base.toLowerCase())) return base;
  const stem = base.slice(0, -LUT_EXTENSION.length);
  let n = 2;
  while (used.has(`${stem}-${n}${LUT_EXTENSION}`.toLowerCase())) n += 1;
  return `${stem}-${n}${LUT_EXTENSION}`;
}

export type LutImport = { path: string } | { error: string };

/**
 * Copies a `.cube` file into the project's luts/ under a free name and loads it. The same text already in
 * the project is reused (its path returned, nothing written).
 */
export async function importLut(file: File): Promise<LutImport> {
  const state = open;
  if (!state) return { error: "Open a project first" };
  if (!state.isWritable()) return { error: "This project is read-only" };
  const text = await file.text();
  if (!parseCube(text)) return { error: `${file.name} is not a 3D LUT (.cube)` };
  for (const [path, known] of state.texts) if (known === text) return { path };
  const folder = await state.dir.dir(LUT_FOLDER, { create: true });
  if (!folder) return { error: "Cannot create the luts folder" };
  const taken = (await folder.list()).map((entry) => entry.name);
  const path = `${LUT_FOLDER}/${freeLutName(file.name, taken)}`;
  await folder.writeText(fileName(path), text);
  if (state.closed) return { error: "The project closed" };
  register(state, path, text);
  return { path };
}

/** Writes the LUTs of a look the project lacks (by path; a different file of that name is left alone) and loads them. */
export async function ensureLuts(luts: Readonly<Record<string, string>>): Promise<void> {
  const state = open;
  if (!state || Object.keys(luts).length === 0) return;
  const folder = state.isWritable() ? await state.dir.dir(LUT_FOLDER, { create: true }) : null;
  for (const [path, text] of Object.entries(luts)) {
    if (lutLibrary.entry(path) || state.closed) continue;
    const existing = folder ? await folder.getFile(fileName(path)) : null;
    const existingText = existing ? await existing.text() : null;
    if (existingText === null && folder) await folder.writeText(fileName(path), text);
    if (state.closed) return;
    // The project's own file wins; the look's text shows even when the project is read-only (not copied then).
    if (existingText !== null && register(state, path, existingText)) continue;
    register(state, path, text);
  }
}

/** The loaded LUTs a project's range needs for an export (atlases copied, by path). */
export function exportLuts(paths: readonly string[]): Record<string, ReturnType<typeof lutAtlas>> {
  const out: Record<string, ReturnType<typeof lutAtlas>> = {};
  for (const path of paths) {
    const entry = lutLibrary.entry(path);
    if (entry) out[path] = { ...entry.atlas, rgba: entry.atlas.rgba.slice() };
  }
  return out;
}
