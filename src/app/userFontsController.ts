// My fonts in the app (spec §20.1): the user's own font files, kept in the global store (IndexedDB, next
// to the global presets: the records under `userFonts.v1`, each file's bytes under `user-font:<id>`)
// and, when a library folder is set (§10.3), mirrored into its `fonts/` (`my-fonts.json` and one file
// per face), so every project can use them. Adding a file validates it by loading it as a `FontFace`
// and names it from its `name` table (else from the file name: WOFF2). The font library hears every
// change; a face's bytes are read only when a text or a font browser row needs them. Framework-free.
import { createStore } from "../core/store/createStore.js";
import { errorMessage } from "../project/errorMessage.js";
import type { FsDir } from "../project/fs.js";
import { pushRecentFont } from "../project/appSettings.js";
import { fontFormat, isFontFileName, namesFromFileName, readFontNames } from "../text/fonts/sfnt.js";
import type { CategoryId } from "../text/fonts/catalog.js";
import {
  cleanFamilyName,
  duplicateOf,
  MAX_FONT_BYTES,
  mergeUserFonts,
  removeFamily,
  renameFamily,
  sanitizeUserFonts,
  setFamilyCategories,
  setFamilyTags,
  userFamilies,
  userFontFile,
  type UserFont,
} from "../text/fonts/userFonts.js";
import { showToast } from "../ui/toasts.js";
import { pickFiles, type PickerType } from "./filePickers.js";
import { libraryFolderDir, presetLibrary } from "./presetController.js";
import { appSettings, fontLibrary, keyValueStore } from "./services.js";

const RECORDS_KEY = "userFonts.v1";
const fileKey = (id: string) => `user-font:${id}`;
/** The library folder's My fonts: `fonts/my-fonts.json` and `fonts/<id>.<ext>`. */
const FOLDER_DIR = "fonts";
const FOLDER_RECORDS = "my-fonts.json";
const OWN_FILE = /^[0-9a-f-]{36}\.(ttf|otf|woff|woff2)$/;

export const FONT_PICKER_TYPES: readonly PickerType[] = [{ description: "Fonts", accept: { "font/ttf": [".ttf"], "font/otf": [".otf"], "font/woff": [".woff"], "font/woff2": [".woff2"] } }];

export interface UserFontsState {
  loaded: boolean;
  fonts: readonly UserFont[];
}

export const userFonts = createStore<UserFontsState>({ loaded: false, fonts: [] });

const now = () => new Date().toISOString();

/** The bytes of a My fonts face (the global store, else the library folder's copy). */
export async function readUserFontData(font: Pick<UserFont, "id" | "format">): Promise<ArrayBuffer | null> {
  try {
    const value = await keyValueStore.get(fileKey(font.id));
    if (value instanceof Blob) return await value.arrayBuffer();
    if (value instanceof ArrayBuffer) return value;
    const dir = await libraryFolderDir()?.dir(FOLDER_DIR);
    const file = await dir?.getFile(userFontFile(font));
    return file ? await file.arrayBuffer() : null;
  } catch (error) {
    console.warn("[fonts] cannot read a font of My fonts", error);
    return null;
  }
}

function publish(fonts: readonly UserFont[]): void {
  userFonts.set({ loaded: true, fonts });
  fontLibrary.setUserFonts(userFamilies(fonts), readUserFontData);
}

let writes: Promise<void> = Promise.resolve();

/** The list shown, stored and mirrored into the library folder (one write at a time). */
function commit(fonts: readonly UserFont[]): Promise<void> {
  publish(fonts);
  writes = writes
    .then(async () => {
      await keyValueStore.set(RECORDS_KEY, fonts);
      const dir = libraryFolderDir();
      if (dir) await mirror(dir, fonts);
    })
    .catch((error: unknown) => console.warn("[fonts] cannot store My fonts", error));
  return writes;
}

/** Writes the faces the folder lacks and the records, and removes the files of faces that left. */
async function mirror(root: FsDir, fonts: readonly UserFont[]): Promise<void> {
  const dir = await root.dir(FOLDER_DIR, { create: true });
  if (!dir) return;
  const present = new Set((await dir.list()).filter((entry) => entry.kind === "file").map((entry) => entry.name));
  const wanted = new Set(fonts.map(userFontFile));
  for (const font of fonts) {
    const name = userFontFile(font);
    if (present.has(name)) continue;
    const data = await readUserFontData(font);
    if (data) await dir.writeFile(name, new Blob([data]));
  }
  for (const name of present) if (OWN_FILE.test(name) && !wanted.has(name)) await dir.remove(name);
  await dir.writeText(FOLDER_RECORDS, `${JSON.stringify({ version: 1, fonts }, null, 2)}\n`);
}

/** The library folder is synced: its My fonts join ours (the newer record wins) and ours go there. */
async function syncFolder(root: FsDir): Promise<void> {
  try {
    const dir = await root.dir(FOLDER_DIR);
    const file = dir ? await dir.readFile(FOLDER_RECORDS) : null;
    let theirs: UserFont[] = [];
    if (dir && file) {
      theirs = sanitizeUserFonts((JSON.parse(file.text) as { fonts?: unknown }).fonts);
      // Their faces' bytes into the global store (faces whose file is gone are left out).
      const kept: UserFont[] = [];
      for (const font of theirs) {
        if (await keyValueStore.get(fileKey(font.id))) {
          kept.push(font);
          continue;
        }
        const data = await dir.getFile(userFontFile(font));
        if (!data) continue;
        await keyValueStore.set(fileKey(font.id), new Blob([await data.arrayBuffer()]));
        kept.push(font);
      }
      theirs = kept;
    }
    await commit(mergeUserFonts(userFonts.getState().fonts, theirs));
  } catch (error) {
    console.warn("[fonts] cannot sync My fonts with the library folder", error);
  }
}

/** Reads My fonts (the records only; the files load when needed). */
export async function loadUserFonts(): Promise<void> {
  try {
    publish(sanitizeUserFonts(await keyValueStore.get(RECORDS_KEY)));
  } catch (error) {
    console.warn("[fonts] cannot read My fonts", error);
    publish([]);
  }
}

/** Whether the browser can load `data` as a font. */
async function loadsAsFont(data: ArrayBuffer): Promise<boolean> {
  try {
    await new FontFace(`shorts-editor-check-${Math.random().toString(36).slice(2)}`, data).load();
    return true;
  } catch {
    return false;
  }
}

export interface AddResult {
  added: UserFont[];
  /** Files left out, with the reason. */
  skipped: { name: string; reason: string }[];
}

/** Adds font files to My fonts (spec §20.1: picked or dropped, several at once). */
export async function addFontFiles(files: readonly File[]): Promise<AddResult> {
  const result: AddResult = { added: [], skipped: [] };
  let fonts = [...userFonts.getState().fonts];
  for (const file of files) {
    if (!isFontFileName(file.name)) {
      result.skipped.push({ name: file.name, reason: "not a .ttf, .otf, .woff or .woff2 file" });
      continue;
    }
    if (file.size > MAX_FONT_BYTES) {
      result.skipped.push({ name: file.name, reason: "larger than 32 MB" });
      continue;
    }
    try {
      const data = await file.arrayBuffer();
      const format = fontFormat(new Uint8Array(data, 0, Math.min(4, data.byteLength)));
      if (!format || format === "ttc") {
        result.skipped.push({ name: file.name, reason: format === "ttc" ? "font collections (.ttc) are not supported" : "not a font file" });
        continue;
      }
      if (!(await loadsAsFont(data))) {
        result.skipped.push({ name: file.name, reason: "the browser cannot read it as a font" });
        continue;
      }
      const names = (format === "woff2" ? null : await readFontNames(data)) ?? namesFromFileName(file.name);
      const family = cleanFamilyName(names.family) ?? cleanFamilyName(file.name.replace(/\.[^.]*$/, "")) ?? "My font";
      if (duplicateOf(fonts, { family, weight: names.weight, italic: names.italic, bytes: data.byteLength })) {
        result.skipped.push({ name: file.name, reason: "already in My fonts" });
        continue;
      }
      const stamp = now();
      const font: UserFont = {
        id: crypto.randomUUID(),
        family,
        style: names.style,
        weight: names.weight,
        italic: names.italic,
        postscriptName: names.postscriptName,
        fileName: file.name,
        format,
        bytes: data.byteLength,
        from: names.from,
        categories: [],
        tags: [],
        addedAt: stamp,
        updatedAt: stamp,
      };
      await keyValueStore.set(fileKey(font.id), new Blob([data]));
      fonts = [...fonts, font];
      result.added.push(font);
    } catch (error) {
      result.skipped.push({ name: file.name, reason: errorMessage(error) });
    }
  }
  if (result.added.length > 0) await commit(fonts);
  reportAdded(result);
  return result;
}

function reportAdded(result: AddResult): void {
  const families = [...new Set(result.added.map((font) => font.family))];
  const named = result.added.filter((font) => font.from === "file").map((font) => font.family);
  if (families.length > 0) {
    const count = result.added.length;
    showToast({
      tone: "success",
      message: `Added ${count} font${count === 1 ? "" : "s"} to My fonts`,
      detail: [families.join(", "), named.length > 0 ? `Named from the file name: ${[...new Set(named)].join(", ")} (rename in My fonts)` : "", ...result.skipped.map((skip) => `${skip.name}: ${skip.reason}`)].filter(Boolean).join("\n"),
    });
  } else if (result.skipped.length > 0) {
    showToast({ tone: "error", message: result.skipped.length === 1 ? "Couldn't add the font" : "Couldn't add the fonts", detail: result.skipped.map((skip) => `${skip.name}: ${skip.reason}`).join("\n") });
  }
}

/** Add fonts… (spec §20.1): the file picker, several files at once. */
export async function pickFontFiles(): Promise<void> {
  try {
    const files = await pickFiles(FONT_PICKER_TYPES);
    if (files.length > 0) await addFontFiles(files);
  } catch (error) {
    showToast({ tone: "error", message: "Couldn't open the files", detail: errorMessage(error) });
  }
}

/** The font files of a drop (other files are not for My fonts). */
export const droppedFontFiles = (transfer: DataTransfer | null): File[] => [...(transfer?.files ?? [])].filter((file) => isFontFileName(file.name));

/** Whether a drag carries files (a drop target shows itself; the files' names are known only on drop). */
export const dragHasFiles = (transfer: DataTransfer | null): boolean => transfer?.types.includes("Files") === true;

/** Renames a family of My fonts (favorites and recent fonts follow). False when the name is empty or taken. */
export function renameUserFamily(family: string, name: string): boolean {
  const cleaned = cleanFamilyName(name);
  if (!cleaned) return false;
  const fonts = userFonts.getState().fonts;
  const taken = fonts.some((font) => font.family.toLowerCase() === cleaned.toLowerCase() && font.family.toLowerCase() !== family.toLowerCase());
  if (taken) return false;
  if (cleaned === family) return true;
  void commit(renameFamily(fonts, family, cleaned, now()));
  const settings = appSettings.getState();
  const rename = (list: readonly string[]) => list.map((item) => (item.toLowerCase() === family.toLowerCase() ? cleaned : item));
  void appSettings.update({ favoriteFonts: rename(settings.favoriteFonts), recentFonts: rename(settings.recentFonts) });
  return true;
}

export function setUserFamilyCategories(family: string, categories: readonly CategoryId[]): void {
  void commit(setFamilyCategories(userFonts.getState().fonts, family, categories, now()));
}

export function setUserFamilyTags(family: string, tags: readonly string[]): void {
  void commit(setFamilyTags(userFonts.getState().fonts, family, tags, now()));
}

/** Removes a family from My fonts (its files too). Projects that use it keep their copy in `fonts/`. */
export async function removeUserFamily(family: string): Promise<void> {
  const fonts = userFonts.getState().fonts;
  const gone = fonts.filter((font) => font.family.toLowerCase() === family.toLowerCase());
  await commit(removeFamily(fonts, family));
  for (const font of gone) await keyValueStore.del(fileKey(font.id)).catch(() => undefined);
  const settings = appSettings.getState();
  const keep = (list: readonly string[]) => list.filter((item) => item.toLowerCase() !== family.toLowerCase());
  void appSettings.update({ favoriteFonts: keep(settings.favoriteFonts), recentFonts: keep(settings.recentFonts) });
}

/** The font browser chose `family` (spec §20.1 Recent). */
export function rememberFont(family: string): void {
  void appSettings.update({ recentFonts: pushRecentFont(appSettings.getState().recentFonts, family) });
}

/** Loads My fonts and syncs them with the library folder whenever it becomes synced. Returns a stop function. */
export function installUserFonts(): () => void {
  void loadUserFonts().then(() => {
    const dir = libraryFolderDir();
    if (dir) void syncFolder(dir);
  });
  let synced = presetLibrary.getState().folder?.status === "synced";
  return presetLibrary.subscribe((state) => {
    const isSynced = state.folder?.status === "synced";
    if (isSynced && !synced) {
      const dir = libraryFolderDir();
      if (dir) void writes.then(() => syncFolder(dir));
    }
    synced = isSynced;
  });
}
