// Text presets in the app (spec §10.3, §10.2, §6.1, §11, §15). Framework-free; React reads
// `presetLibrary` through narrow selectors.
// - Stores: the global presets live in IndexedDB (`textPresets.v1`; the starters are put there on the
//   first start) and, when the user chose one, in a library folder (one JSON file per preset, read
//   and merged on start and on Sync, written on every change). The open project's presets are files in
//   `presets/text/` (read when it opens, written on every change while it is writable). Preset changes
//   are not document commands: they are not undone with the edits.
// - Actions: Save as preset (the selected text clip's look, linked to the new preset: one undo step),
//   Update preset (the selected clip's look into its preset; other clips keep theirs), Apply (the
//   selected text clips, one undo step; else a new clip), Add (a new text clip at the playhead with
//   the preset, edited inline at once, like `+ Title`), rename, duplicate, delete, favorite, apply
//   position, default Title / Subtitle (T / Shift+T use them), import and export JSON.
// - Hover: a card hovered with text clips selected shows the preset on them, live only (P2).
// - Captions (spec §10.5): with cues or the caption track selected (and no text clip), Apply sets the
//   caption track's text style from the preset (position, width, lines and highlight stay); hovering
//   shows it live.
// - Drags: a card dragged onto the timeline (or the canvas) adds a text clip with the preset there.
// - Thumbnails: the Presets tab's cards are drawn by `presetThumbs` in the FrameScheduler loop.
import type { ClipId, Project, TextClip, TextPreset, TrackId, Transform } from "../core/document/types.js";
import { usToFrame } from "../core/document/time.js";
import { createStore } from "../core/store/createStore.js";
import type { PresetScope } from "../core/store/sessionStore.js";
import { errorMessage } from "../project/errorMessage.js";
import { fromHandle, isDirectoryHandle, type FsDir } from "../project/fs.js";
import { PresetFolderWriter, projectPresetsDir, readPresetFolder } from "../project/presetFiles.js";
import { PresetThumbPainter } from "../panels/media/PresetThumbPainter.js";
import type { LiveText } from "../render/compositor/Compositor.js";
import { drawPresetThumbnail } from "../render/text/presetThumbnails.js";
import {
  cleanPresetName,
  defaultPresetName,
  duplicatePreset,
  exportFileName,
  formatPresetsFile,
  mergePresets,
  parsePresetsFile,
  presetDiffers,
  presetFromClip,
  presetLook,
  presetUpdatedFromClip,
  sanitizePreset,
  sortPresets,
  uniquePresetName,
} from "../text/presets.js";
import { starterPresets, upgradeStarters } from "../text/starterPresets.js";
import type { TitleKind } from "../text/style.js";
import type { DropItem } from "../timeline/edit/dropMedia.js";
import { captionStyleOf, captionTrackOf, setCaptionStyle } from "../timeline/edit/captions.js";
import { applyPreset, linkPreset, titleDuration, type TitleLook } from "../timeline/edit/text.js";
import { IDENTITY_TRANSFORM } from "../timeline/edit/transform.js";
import { isClipLocked } from "../timeline/model/queries.js";
import { showToast } from "../ui/toasts.js";
import { pickFile, saveFile, type PickerType } from "./filePickers.js";
import { patchLiveEdit } from "./liveEdit.js";
import type { CardDragSource } from "./mediaGestures.js";
import { addTitleClip, fontsVersion, selectedTextClip, setDefaultTitleLook } from "./textController.js";
import { actions, appSettings, documentStore, focusScopes, fontLibrary, keyValueStore, saveStatus, scheduler, sessionStore, themeBridge } from "./services.js";

export interface LibraryFolder {
  name: string;
  /** synced: read and merged, changes written. permission: chosen, waiting for a click (Sync) to allow access. */
  status: "syncing" | "synced" | "permission" | "error";
  message?: string;
}

export interface PresetLibrary {
  /** The global presets were read (until then, T and Shift+T use the built-in looks). */
  loaded: boolean;
  global: readonly TextPreset[];
  project: readonly TextPreset[];
  /** A project is open, and its presets can be written. */
  projectOpen: boolean;
  projectWritable: boolean;
  folder: LibraryFolder | null;
}

export const presetLibrary = createStore<PresetLibrary>({ loaded: false, global: [], project: [], projectOpen: false, projectWritable: false, folder: null });

/** Where Save as preset's name field is open: the quick row (properties) or the Presets tab; null when closed. */
export const presetNaming = createStore<"quick" | "tab" | null>(null);
/** The preset card whose name is being edited (the card menu's Rename, `preset.rename`), or null. */
export const presetRenaming = createStore<string | null>(null);

/** The Presets tab's card thumbnails (spec §3.4, P3: drawn in the FrameScheduler loop, at the device pixel ratio of the frame). */
export const presetThumbs = new PresetThumbPainter(scheduler, (canvas, preset, width, height) => {
  drawPresetThumbnail(canvas, preset, width, height, window.devicePixelRatio || 1, themeBridge.theme.space[2], fontLibrary);
});

const GLOBAL_KEY = "textPresets.v1";
const FOLDER_KEY = "presetLibraryFolder.v1";
const now = () => new Date().toISOString();
const newId = () => crypto.randomUUID();
const setLibrary = (patch: Partial<PresetLibrary>) => presetLibrary.set((state) => ({ ...state, ...patch }));

/** A preset and where it lives. */
export interface FoundPreset {
  preset: TextPreset;
  scope: PresetScope;
}

/** The preset `id`: a global one first, else the open project's. */
export function findPreset(id: string): FoundPreset | null {
  const { global, project } = presetLibrary.getState();
  const inGlobal = global.find((preset) => preset.id === id);
  if (inGlobal) return { preset: inGlobal, scope: "global" };
  const inProject = project.find((preset) => preset.id === id);
  return inProject ? { preset: inProject, scope: "project" } : null;
}

// Persistence.

let globalWrites: Promise<void> = Promise.resolve();
let folder: { dir: FsDir; writer: PresetFolderWriter } | null = null;
/** A chosen folder waiting for permission (a click on Sync asks). */
let pendingFolder: FsDir | null = null;
interface OpenProject {
  root: FsDir;
  isWritable: () => boolean;
  writer: PresetFolderWriter | null;
  closed: boolean;
}
let openProject: OpenProject | null = null;
let projectWrites: Promise<void> = Promise.resolve();

function folderFailed(error: unknown): void {
  console.warn("[presets] cannot write the library folder", error);
  const current = presetLibrary.getState().folder;
  if (current) setLibrary({ folder: { ...current, status: "error", message: errorMessage(error) } });
}

/**
 * `presets` become the scope's list: shown, then stored (IndexedDB and the library folder, or the project's folder).
 * A project write runs after the read of `presets/text/` (`attachPresets`) and writes the list as it is then, so
 * a preset added while the folder was read joins the presets read instead of replacing their files.
 */
function commit(scope: PresetScope, presets: readonly TextPreset[]): void {
  const sorted = sortPresets(presets);
  setLibrary(scope === "global" ? { global: sorted } : { project: sorted });
  if (scope === "global") {
    globalWrites = globalWrites.then(() => keyValueStore.set(GLOBAL_KEY, sorted)).catch((error: unknown) => console.warn("[presets] cannot store the presets", error));
    folder?.writer.write(sorted).catch(folderFailed);
    return;
  }
  const state = openProject;
  if (!state || !state.isWritable()) return;
  projectWrites = projectWrites
    .then(async () => {
      if (state.closed) return;
      if (!state.writer) {
        const dir = await projectPresetsDir(state.root, true);
        if (!dir) return;
        state.writer = new PresetFolderWriter(dir);
      }
      if (!state.closed) await state.writer.write(list("project"));
    })
    .catch((error: unknown) => {
      console.warn("[presets] cannot write the project presets", error);
      showToast({ tone: "error", message: "Couldn't save the project's presets", detail: errorMessage(error) });
    });
}

const list = (scope: PresetScope) => presetLibrary.getState()[scope];

/** `id` changed by `change` (dated now) in its list. False when it does not exist or cannot be written. */
function changePreset(id: string, change: (preset: TextPreset) => TextPreset): boolean {
  const found = findPreset(id);
  if (!found || !canWrite(found.scope)) return false;
  commit(
    found.scope,
    list(found.scope).map((preset) => (preset.id === id ? { ...change(preset), updatedAt: now() } : preset)),
  );
  return true;
}

/** Whether presets of `scope` can change (a read-only project's cannot). */
export function canWrite(scope: PresetScope): boolean {
  if (scope === "global") return true;
  const state = presetLibrary.getState();
  return state.projectOpen && state.projectWritable;
}

/** Where new presets go: the Presets tab's scope, the global presets when the project's cannot be written. */
function targetScope(): PresetScope {
  return sessionStore.state.getState().mediaPanel.presetScope === "project" && canWrite("project") ? "project" : "global";
}

async function loadGlobal(): Promise<void> {
  try {
    const stored = await keyValueStore.get(GLOBAL_KEY);
    if (Array.isArray(stored)) {
      const at = now();
      const presets = stored.map((value) => sanitizePreset(value, at)).filter((preset): preset is TextPreset => preset !== null);
      // Untouched starters seeded before they had animations take them (Batch 31), stored at once.
      const upgraded = upgradeStarters(presets);
      if (upgraded) commit("global", mergePresets(upgraded, list("global")));
      else setLibrary({ global: sortPresets(mergePresets(presets, list("global"))) });
      setLibrary({ loaded: true });
    } else {
      // The first start: the starters (spec §10.3 "bundled starter presets").
      commit("global", mergePresets(starterPresets(), list("global")));
      setLibrary({ loaded: true });
    }
  } catch (error) {
    console.warn("[presets] cannot read the presets", error);
    setLibrary({ loaded: true });
  }
  await loadFolder();
}

/**
 * Restore starter presets (Settings, Batch 42): the bundled starters that were deleted come back as
 * shipped; starters still there keep their edits. Returns how many came back.
 */
export function restoreStarterPresets(): number {
  const ids = new Set(list("global").map((preset) => preset.id));
  const missing = starterPresets().filter((preset) => !ids.has(preset.id));
  if (missing.length > 0) commit("global", [...list("global"), ...missing]);
  return missing.length;
}

function restoreStartersAction(): void {
  const restored = restoreStarterPresets();
  showToast(
    restored === 0
      ? { tone: "info", message: "Every starter preset is there", detail: "Starters you changed keep your changes." }
      : { tone: "success", message: `Restored ${restored} starter preset${restored === 1 ? "" : "s"}`, detail: "They are back among the Global presets of the Presets tab." },
  );
}

// The library folder (spec §10.3 "synced to a user-chosen library folder").

async function loadFolder(): Promise<void> {
  try {
    const handle = await keyValueStore.get(FOLDER_KEY);
    if (!isDirectoryHandle(handle)) return;
    const dir = fromHandle(handle);
    if ((await dir.queryPermission("readwrite")) === "granted") await syncFolder(dir);
    else {
      pendingFolder = dir;
      setLibrary({ folder: { name: dir.name, status: "permission" } });
    }
  } catch (error) {
    console.warn("[presets] cannot open the library folder", error);
  }
}

/** Reads the folder, merges it with the global presets (the newer copy of each wins) and writes the result back. */
async function syncFolder(dir: FsDir): Promise<void> {
  setLibrary({ folder: { name: dir.name, status: "syncing" } });
  try {
    const { presets, skipped } = await readPresetFolder(dir, now());
    const writer = new PresetFolderWriter(dir);
    writer.know(presets);
    folder = { dir, writer };
    pendingFolder = null;
    commit("global", mergePresets(list("global"), presets));
    await writer.write(list("global"));
    setLibrary({ folder: { name: dir.name, status: "synced", ...(skipped > 0 && { message: `${skipped} file${skipped === 1 ? "" : "s"} skipped: not presets` }) } });
  } catch (error) {
    folder = null;
    pendingFolder = dir;
    setLibrary({ folder: { name: dir.name, status: "error", message: errorMessage(error) } });
  }
}

interface DirectoryPickerWindow {
  showDirectoryPicker(options: { id?: string; mode: "read" | "readwrite" }): Promise<FileSystemDirectoryHandle>;
}

/** Choose library folder (a click): the global presets are merged with it and kept in sync. */
export async function chooseLibraryFolder(): Promise<void> {
  let handle: FileSystemDirectoryHandle;
  try {
    handle = await (window as unknown as DirectoryPickerWindow).showDirectoryPicker({ id: "shorts-editor-presets", mode: "readwrite" });
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) showToast({ tone: "error", message: "Couldn't open the folder", detail: errorMessage(error) });
    return;
  }
  await keyValueStore.set(FOLDER_KEY, handle).catch((error: unknown) => console.warn("[presets] cannot remember the library folder", error));
  await syncFolder(fromHandle(handle));
}

/** Sync (a click): asks for access when the browser needs it, then merges again. */
export async function syncLibraryFolder(): Promise<void> {
  const dir = folder?.dir ?? pendingFolder;
  if (!dir) return;
  try {
    if ((await dir.queryPermission("readwrite")) !== "granted" && (await dir.requestPermission("readwrite")) !== "granted") {
      setLibrary({ folder: { name: dir.name, status: "permission" } });
      return;
    }
  } catch (error) {
    setLibrary({ folder: { name: dir.name, status: "error", message: errorMessage(error) } });
    return;
  }
  await syncFolder(dir);
}

/** Stop syncing: the folder keeps its files; the global presets stay in the browser. */
export async function stopLibraryFolder(): Promise<void> {
  folder = null;
  pendingFolder = null;
  setLibrary({ folder: null });
  await keyValueStore.del(FOLDER_KEY).catch(() => undefined);
}

// The open project's presets (spec §9.7 `presets/text/*.json`).

/** A project opened: its presets are read from `presets/text/`. */
export function attachPresets(root: FsDir, isWritable: () => boolean): void {
  detachPresets();
  const state: OpenProject = { root, isWritable, writer: null, closed: false };
  openProject = state;
  setLibrary({ project: [], projectOpen: true, projectWritable: isWritable() });
  projectWrites = projectWrites.then(async () => {
    try {
      const dir = await projectPresetsDir(root, false);
      if (!dir || state.closed) return;
      const { presets } = await readPresetFolder(dir, now());
      if (state.closed) return;
      state.writer = new PresetFolderWriter(dir);
      state.writer.know(presets);
      // Presets saved or imported while the folder was read stay (the newer copy of an id wins).
      setLibrary({ project: sortPresets(mergePresets(presets, list("project"))) });
    } catch (error) {
      console.warn("[presets] cannot read the project presets", error);
    }
  });
}

/** The project closed: its presets leave the tab (and the chips). */
export function detachPresets(): void {
  if (openProject) openProject.closed = true;
  openProject = null;
  endHover();
  setLibrary({ project: [], projectOpen: false, projectWritable: false });
}

// Selection helpers.

/** The unlocked text clips selected. */
function selectedTextIds(project: Project = documentStore.getState()): ClipId[] {
  const selection = sessionStore.selection.getState();
  if (selection.kind !== "clips") return [];
  return [...selection.clipIds].filter((id) => project.clips[id]?.kind === "text" && !isClipLocked(project, id));
}

/** The caption track a preset applies to: selected cues' or the selected caption track, when no text clip is selected. */
function captionTarget(project: Project = documentStore.getState()): TrackId | null {
  if (selectedTextIds(project).length > 0) return null;
  const track = captionTrackOf(project);
  if (!track || track.locked) return null;
  const selection = sessionStore.selection.getState();
  if (selection.kind === "track") return selection.trackIds?.has(track.id) ? track.id : null;
  if (selection.kind === "clips") return [...selection.clipIds].some((id) => project.clips[id]?.kind === "caption") ? track.id : null;
  return null;
}

/** Whether Apply (a card click) would set the caption track's style (the card menu names it). */
export function appliesToCaptions(): boolean {
  return captionTarget() !== null;
}

/** The text clip Save as preset and Update preset read: the primary selected one, else the first. */
export function presetSourceClip(project: Project = documentStore.getState()): TextClip | null {
  const id = selectedTextClip(project, sessionStore.selection.getState());
  const clip = id ? project.clips[id] : undefined;
  return clip?.kind === "text" ? clip : null;
}

/** The preset `Update preset` would write into for `clip`, when it exists, can be written and differs. */
export function updatablePreset(project: Project, clip: TextClip | null): TextPreset | null {
  if (!clip?.presetId) return null;
  const found = findPreset(clip.presetId);
  if (!found || !canWrite(found.scope) || isClipLocked(project, clip.id)) return null;
  return presetDiffers(found.preset, clip, project.settings) ? found.preset : null;
}

// Actions.

/** The name field's start for the selected text clip (spec §10.3: font + size). */
export function suggestedPresetName(): string {
  const clip = presetSourceClip();
  return clip ? defaultPresetName(clip.style) : "";
}

/**
 * Save as preset (spec §10.3): the selected text clip's look as a new preset named `name` (made unique)
 * in the Presets tab's scope; the clip is linked to it (one undo step). Returns the new preset's id.
 */
export function saveSelectionAsPreset(name: string): string | null {
  const project = documentStore.getState();
  const clip = presetSourceClip(project);
  if (!clip) return null;
  const scope = targetScope();
  const taken = list(scope).map((preset) => preset.name);
  const preset = presetFromClip(clip, project.settings, { id: newId(), name: uniquePresetName(cleanPresetName(name) || defaultPresetName(clip.style), taken), now: now() });
  commit(scope, [...list(scope), preset]);
  const command = linkPreset(project, clip.id, preset.id, `Save preset "${preset.name}"`);
  if (command) documentStore.dispatch(command);
  return preset.id;
}

/** Update preset (spec §10.3): the selected clip's look into its preset; clips using it keep their own look until it is applied again. */
export function updatePresetFromSelection(): boolean {
  const project = documentStore.getState();
  const clip = presetSourceClip(project);
  const preset = updatablePreset(project, clip);
  if (!clip || !preset) return false;
  changePreset(preset.id, (current) => presetUpdatedFromClip(current, clip, project.settings, now()));
  showToast({ tone: "success", message: `Updated "${preset.name}"`, detail: "Other clips that use it keep their style until you apply it again." });
  return true;
}

export function renamePreset(id: string, name: string): void {
  const clean = cleanPresetName(name);
  if (clean !== "") changePreset(id, (preset) => ({ ...preset, name: clean }));
}

export function toggleFavorite(id: string): void {
  changePreset(id, (preset) => ({ ...preset, favorite: !preset.favorite }));
}

export function toggleApplyPosition(id: string): void {
  changePreset(id, (preset) => ({ ...preset, applyPosition: !preset.applyPosition }));
}

export function duplicatePresetById(id: string): string | null {
  const found = findPreset(id);
  if (!found || !canWrite(found.scope)) return null;
  const copy = duplicatePreset(found.preset, { id: newId(), now: now(), taken: list(found.scope).map((preset) => preset.name) });
  commit(found.scope, [...list(found.scope), copy]);
  return copy.id;
}

/** Deletes a preset (no confirmation, spec §0). Clips made with it keep their look. */
export function deletePreset(id: string): void {
  const found = findPreset(id);
  if (!found || !canWrite(found.scope)) return;
  if (hovered === id) endHover();
  commit(
    found.scope,
    list(found.scope).filter((preset) => preset.id !== id),
  );
}

/** Use as default Title / Subtitle (spec §10.2: T / Shift+T); `null` goes back to the built-in look. */
export function setDefaultPreset(kind: TitleKind, id: string | null): void {
  void appSettings.update(kind === "title" ? { defaultTitlePreset: id } : { defaultSubtitlePreset: id });
}

/** A preset's look in the open project, as `addTitle` takes it. */
function lookOf(preset: TextPreset, project: Project): TitleLook {
  const look = presetLook(preset, project.settings);
  return {
    ...look,
    presetId: preset.id,
    ...(preset.defaultDuration !== undefined && { duration: Math.max(1, usToFrame(preset.defaultDuration * 1000, project.settings.fps)) }),
  };
}

/** The look `+ Title` / `+ Subtitle` take: the default preset's, or null (built-in). */
function defaultTitleLook(kind: TitleKind): TitleLook | null {
  const settings = appSettings.getState();
  const id = kind === "title" ? settings.defaultTitlePreset : settings.defaultSubtitlePreset;
  const found = id ? findPreset(id) : null;
  return found ? lookOf(found.preset, documentStore.getState()) : null;
}

/**
 * A new text clip at the playhead with the preset (spec §10.2 favorite chips, a card with no text clip
 * selected): placed like `+ Title` (or at the preset's position, or centered on `point`), selected and
 * edited inline at once.
 */
export function addPresetClip(id: string, point: { x: number; y: number } | null = null): ClipId | null {
  const found = findPreset(id);
  if (!found) return null;
  endHover();
  const project = documentStore.getState();
  const look = lookOf(found.preset, project);
  if (point) look.position = { x: Math.round(point.x - project.settings.width / 2), y: Math.round(point.y - project.settings.height / 2) };
  return addTitleClip("title", { look, label: `Add "${found.preset.name}"` });
}

/** Click on a card (spec §10.3 Apply): onto the selected text clips (one undo step), else a new clip at the playhead. */
export function applyPresetById(id: string): void {
  const found = findPreset(id);
  if (!found) return;
  endHover();
  const project = documentStore.getState();
  const ids = selectedTextIds(project);
  const captions = captionTarget(project);
  if (captions) {
    const style = { ...captionStyleOf(project, captions), text: presetLook(found.preset, project.settings).style };
    const command = setCaptionStyle(project, captions, style, { label: `Apply "${found.preset.name}" to captions` });
    if (command) documentStore.dispatch(command);
    return;
  }
  if (ids.length === 0) {
    addPresetClip(id);
    return;
  }
  const look = presetLook(found.preset, project.settings);
  const command = applyPreset(project, ids, { presetId: id, ...look }, `Apply "${found.preset.name}"`);
  if (command) documentStore.dispatch(command);
}

// Hover preview (spec §10.3: "a non-committed preview on the canvas").

let hovered: string | null = null;

/** A card hovered (null: left): the selected text clips show the preset, live only. */
export function hoverPreset(id: string | null): void {
  if (id === hovered) return;
  if (id === null) {
    endHover();
    return;
  }
  const found = findPreset(id);
  const project = documentStore.getState();
  const ids = found ? selectedTextIds(project) : [];
  const captions = found ? captionTarget(project) : null;
  if (found && captions) {
    hovered = id;
    const style = { ...captionStyleOf(project, captions), text: presetLook(found.preset, project.settings).style };
    patchLiveEdit({ captionStyles: new Map([[captions, style]]) });
    return;
  }
  if (!found || ids.length === 0) {
    endHover();
    return;
  }
  hovered = id;
  const look = presetLook(found.preset, project.settings);
  const texts = new Map<ClipId, LiveText>();
  const transforms = new Map<ClipId, Transform>();
  for (const clipId of ids) {
    const clip = project.clips[clipId] as TextClip;
    texts.set(clipId, { text: { ...clip.text, box: look.box }, style: look.style });
    if (look.position) transforms.set(clipId, { ...clip.transform, x: look.position.x, y: look.position.y });
  }
  patchLiveEdit({ texts, transforms: transforms.size > 0 ? transforms : null });
}

function endHover(): void {
  if (hovered === null) return;
  hovered = null;
  patchLiveEdit({ texts: null, transforms: null, captionStyles: null });
}

// Drags (spec §10.3: "drag a card onto the timeline to create a clip with it").

/** A preset card's drag: one text clip of the preset's length (or a title's), at the drop. */
export function presetDragSource(id: string): CardDragSource {
  return {
    items(): DropItem[] {
      endHover();
      const found = findPreset(id);
      if (!found) return [];
      const project = documentStore.getState();
      const look = lookOf(found.preset, project);
      const duration = look.duration ?? titleDuration(project, sessionStore.state.getState().playhead, false);
      const fields = {
        value: "Title",
        style: look.style,
        box: look.box,
        presetId: id,
        ...(look.position && { transform: { ...IDENTITY_TRANSFORM, x: look.position.x, y: look.position.y } }),
        ...(look.animIn && { animIn: look.animIn }),
        ...(look.animOut && { animOut: look.animOut }),
      };
      return [{ text: { name: found.preset.name, duration, fields } }];
    },
    dropOnCanvas: (point) => void addPresetClip(id, point),
  };
}

// Files (spec §10.3: "exported/imported as a JSON file").

const JSON_TYPES: readonly PickerType[] = [{ description: "Text presets", accept: { "application/json": [".json"] } }];

/** Import (spec §10.3): presets from a JSON file into the shown scope; a preset with a known id replaces it. */
export async function importPresets(): Promise<void> {
  try {
    const file = await pickFile(JSON_TYPES);
    if (!file) return;
    const { presets, skipped } = parsePresetsFile(await file.text(), now());
    const scope = targetScope();
    if (presets.length === 0) {
      showToast({ tone: "error", message: "No presets imported", detail: "The file holds no preset this editor can read." });
      return;
    }
    const byId = new Map(list(scope).map((preset) => [preset.id, preset]));
    for (const preset of presets) byId.set(preset.id, preset);
    commit(scope, [...byId.values()]);
    showToast({
      tone: "success",
      message: `Imported ${presets.length} preset${presets.length === 1 ? "" : "s"}`,
      ...(skipped > 0 && { detail: `${skipped} entr${skipped === 1 ? "y" : "ies"} skipped.` }),
    });
  } catch (error) {
    showToast({ tone: "error", message: "Couldn't import the presets", detail: errorMessage(error) });
  }
}

/** Export (spec §10.3): one preset (`id`), or every preset the tab shows, as a JSON file. */
export async function exportPresets(id: string | null = null): Promise<void> {
  const one = id ? findPreset(id)?.preset : null;
  const presets = one ? [one] : list(sessionStore.state.getState().mediaPanel.presetScope);
  if (presets.length === 0) return;
  try {
    const text = formatPresetsFile(presets);
    const saved = (await saveFile(exportFileName(one ? one.name : null), JSON_TYPES, () => text)) !== null;
    if (saved) showToast({ tone: "success", message: `Exported ${presets.length} preset${presets.length === 1 ? "" : "s"}` });
  } catch (error) {
    showToast({ tone: "error", message: "Couldn't export the presets", detail: errorMessage(error) });
  }
}

function setPresetScope(presetScope: PresetScope): void {
  sessionStore.state.set((state) => ({ ...state, mediaPanel: { ...state.mediaPanel, presetScope } }));
}

/** The commands of one preset (its id as the argument): the card menu's rows and the favorite chips. */
function presetCommands(): (() => void)[] {
  const on = (run: (id: string) => void) => (_context: unknown, id?: string) => {
    if (id !== undefined && findPreset(id)) run(id);
  };
  const defaults = appSettings.getState;
  return [
    actions.register("preset.apply", on(applyPresetById)),
    actions.register("preset.addAtPlayhead", on((id) => void addPresetClip(id))),
    actions.register("preset.defaultTitle", on((id) => setDefaultPreset("title", defaults().defaultTitlePreset === id ? null : id))),
    actions.register("preset.defaultSubtitle", on((id) => setDefaultPreset("subtitle", defaults().defaultSubtitlePreset === id ? null : id))),
    actions.register("preset.favorite", on(toggleFavorite)),
    actions.register("preset.applyPosition", on(toggleApplyPosition)),
    actions.register("preset.rename", on((id) => presetRenaming.set(id))),
    actions.register("preset.duplicate", on((id) => void duplicatePresetById(id))),
    actions.register("preset.export", on((id) => void exportPresets(id))),
    actions.register("preset.delete", on(deletePreset)),
  ];
}

/** Loads the presets and wires them in. Returns a stop function. */
export function installPresetController(): () => void {
  void loadGlobal();
  setDefaultTitleLook(defaultTitleLook);
  const stops = [
    // A read-only project becomes writable after Allow editing (and back).
    saveStatus.select(
      (status) => status.readOnly,
      () => {
        if (openProject) setLibrary({ projectWritable: openProject.isWritable() });
      },
    ),
    // The hover preview follows the selection it was made for.
    sessionStore.selection.subscribe(() => endHover()),
    // A font loaded (or the system fonts came): the card thumbnails draw again (at the next frame).
    fontsVersion.subscribe(() => presetThumbs.redrawAll()),
    // Save as preset (spec §11, §17: the quick row's, or the Presets header's New from selection when
    // the Presets tab has the keyboard; each opens its own name field) and Update preset.
    actions.register(
      "preset.save",
      (context) => {
        if (!presetSourceClip()) return false;
        const inTab = (context?.scope ?? focusScopes.scope) === "media" && sessionStore.state.getState().mediaPanel.tab === "presets";
        presetNaming.set(inTab ? "tab" : "quick");
      },
      { enabled: () => presetSourceClip() !== null },
    ),
    actions.register("preset.update", () => updatePresetFromSelection()),
    // The Presets header and the library folder strip (spec §10.3, §17).
    actions.register("presets.import", () => void importPresets()),
    actions.register("presets.export", () => void exportPresets(), { enabled: () => list(sessionStore.state.getState().mediaPanel.presetScope).length > 0 }),
    actions.register("presets.showGlobal", () => setPresetScope("global")),
    actions.register("presets.showProject", () => setPresetScope("project")),
    actions.register("presets.chooseFolder", () => void chooseLibraryFolder()),
    actions.register("presets.restoreStarters", restoreStartersAction, { enabled: () => presetLibrary.getState().loaded }),
    actions.register("presets.syncFolder", () => void syncLibraryFolder(), { enabled: () => presetLibrary.getState().folder !== null && presetLibrary.getState().folder?.status !== "syncing" }),
    actions.register("presets.stopFolder", () => void stopLibraryFolder(), { enabled: () => presetLibrary.getState().folder !== null }),
    // The card menu (spec §10.3 "Right-click card") and the toolbar's favorite chips act on the preset named by the argument.
    ...presetCommands(),
  ];
  if (import.meta.env.DEV) {
    // Console access for the acceptance checks.
    const editor = ((globalThis as { __editor?: Record<string, unknown> }).__editor ??= {});
    editor.presets = { library: presetLibrary, find: findPreset, save: saveSelectionAsPreset, update: updatePresetFromSelection, apply: applyPresetById, add: addPresetClip, remove: deletePreset, importPresets, exportPresets };
  }
  return () => {
    for (const stop of stops) stop();
    setDefaultTitleLook(() => null);
    endHover();
  };
}