// Project lifecycle for the UI (spec §15): folder pickers, create/open/switch, recovery offer,
// permission retries, Mod+S/N/O; templates (save, new from), the History list and its restore, Clear
// cache, the recent list's thumbnails and the read-only rules (Batch 42). Framework-free; React reads
// `appView` through narrow selectors.
// Read-only (no write permission, spec §15): edits stay possible and are kept in memory only (the
// banner and the dot say so). Everything that would write to the folder is refused with the one
// read-only toast (`refuseReadOnly`): imports, media removal, bins, proxies, Clear cache, History
// restore. Closing the tab or opening another project with such edits asks first.
import { createStore } from "../core/store/createStore.js";
import type { ConversionReport } from "../core/document/fpsConvert.js";
import { createProject as emptyDocument } from "../core/document/project.js";
import type { Rational } from "../core/document/types.js";
import { showToast } from "../ui/toasts.js";
import { errorMessage } from "../project/errorMessage.js";
import { fromHandle, isDirectoryHandle, type FsDir } from "../project/fs.js";
import { createProject, openProjectFolder, ProjectOpenError, type NewProjectSettings, type OpenedProject } from "../project/openProject.js";
import { ProjectSession } from "../project/ProjectSession.js";
import { resolveOpenLink } from "../project/inbox/links.js";
import { parseOpenLink, withoutOpenLink } from "../project/projectsFolder.js";
import { RECENT_THUMB_HEIGHT, type RecentProject } from "../project/recentProjects.js";
import type { RepairReport } from "../project/repair.js";
import { RESOLUTION_PRESETS, ratioCommandId } from "../project/projectPresets.js";
import type { Recovery } from "../project/recovery.js";
import { changeRatio, followFrameRate } from "./conversionController.js";
import { cancelExport, clearExportLeftovers } from "./exportController.js";
import { attachExternal, detachExternal } from "./externalController.js";
import { clearGeneratorNotes, loadGeneratorNotes } from "./generatorNotes.js";
import { attachFonts, detachFonts } from "./fontController.js";
import { attachLuts, detachLuts } from "./lutController.js";
import { attachMedia, detachMedia } from "./mediaController.js";
import { attachPresets, detachPresets } from "./presetController.js";
import { attachPreview, captureThumbnail, detachPreview, frameService } from "./previewController.js";
import { reportRepair, repairOpened } from "./repairController.js";
import { syncTemplatesFromLibrary } from "./compoundTemplateController.js";
import { actions, appSettings, appVersion, documentStore, focusScopes, layoutStore, inbox, recentProjects, saveStatus, sessionStore, templateStore, lookStore, compoundTemplateStore, watchedFolders, workerPool } from "./services.js";

/** Workers that serve one project (sessions, indexes, analysis and proxy jobs): stopped when it closes (P13). */
const PROJECT_WORKERS = ["decode", "analysis", "proxy"] as const;

/** What opening another project waits for while a read-only project has unsaved edits. */
type Flow = () => Promise<void>;

export type Dialog =
  | { kind: "newProject"; dir: FsDir; template: string | null }
  | { kind: "recovery"; recovery: Recovery }
  | { kind: "permission"; dir: FsDir; message: string }
  | { kind: "error"; title: string; message: string; issues: readonly string[] }
  /** Adapt layout or Keep (spec §15) for a new frame size. */
  | { kind: "resolution"; width: number; height: number }
  /** A frame rate conversion that rounds timings (spec §15 "warning if lossy"). */
  | { kind: "frameRate"; fps: Rational; report: ConversionReport }
  /** The History list (spec §15): the backups in history/, each restorable. */
  | { kind: "history" }
  | { kind: "saveTemplate" }
  | { kind: "clearCache" }
  /** Make editable (one baked stand-in, or all of them when null): edits to the stand-in itself are not carried over (spec §21.5). */
  | { kind: "makeEditable"; clipId: string | null }
  /** A read-only project has edits nothing saved: opening another drops them (asked first). */
  | { kind: "discardChanges"; next: Flow };

export interface AppView {
  /** The open project; null shows the start screen. */
  project: { id: string; folder: string } | null;
  dialog: Dialog | null;
  /** A pick/open/create flow is running; buttons that start another one are disabled. */
  busy: boolean;
  /** `/?open=<path>` waits for a watched folder (a choice) or for access to one (a click): the start screen says so (spec §21.5). */
  openLink: { path: string; need: "folder" | "permission" } | null;
}

export const appView = createStore<AppView>({ project: null, dialog: null, busy: false, openLink: null });

let current: ProjectSession | null = null;
let stopFrameRate: (() => void) | null = null;

const setView = (patch: Partial<AppView>) => appView.set((view) => ({ ...view, ...patch }));

export function closeDialog(): void {
  setView({ dialog: null });
}

/** Opens one of the project dialogs (DialogHost shows it). */
export function showDialog(dialog: Dialog): void {
  setView({ dialog });
}

/** The open project, or null. */
export function currentSession(): ProjectSession | null {
  return current;
}

/** The read-only toast for an action that would write to the project folder (`what`: "clear the cache"). */
export function refuseReadOnly(what: string): void {
  showToast({ tone: "warning", message: "This project is read-only", detail: `Allow editing to ${what}.` });
}

function showError(title: string, error: unknown): void {
  // Expected failures (no project.json, no permission) are the user's to fix: shown, logged quietly.
  if (error instanceof ProjectOpenError) console.info(`[project] ${title}:`, error.message);
  else console.error(`[project] ${title}`, error);
  const issues = error instanceof ProjectOpenError ? error.issues : [];
  setView({ dialog: { kind: "error", title, message: errorMessage(error), issues } });
}

/** One flow at a time; failures end in an error dialog, never in an unhandled rejection. */
async function run(flow: Flow): Promise<void> {
  if (appView.getState().busy) return;
  setView({ busy: true });
  try {
    await flow();
  } catch (error) {
    showError("Something went wrong", error);
  } finally {
    setView({ busy: false });
  }
}

/** Edits of a read-only project that would be lost: nothing could save them. */
function unsavedReadOnlyEdits(): boolean {
  const status = saveStatus.getState();
  return current !== null && status.readOnly && status.state === "unsaved";
}

/** Runs `flow`, or first asks to drop the unsaved edits of a read-only project (the dialog's button runs it, a user gesture for the pickers). */
function guarded(flow: Flow): Promise<void> {
  if (unsavedReadOnlyEdits()) {
    setView({ dialog: { kind: "discardChanges", next: flow } });
    return Promise.resolve();
  }
  return run(flow);
}

/** The discard dialog's "Discard and continue". */
export function continueDiscarding(next: Flow): Promise<void> {
  closeDialog();
  return run(next);
}

interface DirectoryPickerWindow {
  showDirectoryPicker(options: { id?: string; mode: "read" | "readwrite" }): Promise<FileSystemDirectoryHandle>;
}

/** The folder picker; null when cancelled. Must run inside a user gesture. */
async function pickFolder(): Promise<FsDir | null> {
  try {
    const picker = window as unknown as DirectoryPickerWindow;
    return fromHandle(await picker.showDirectoryPicker({ id: "shorts-editor-project", mode: "readwrite" }));
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return null;
    throw error;
  }
}

/** The recent list's thumbnail of `session`: the frame at the playhead (spec §15), best effort. */
async function captureRecentThumbnail(session: ProjectSession, timeoutMs?: number): Promise<void> {
  const blob = await captureThumbnail(RECENT_THUMB_HEIGHT, timeoutMs);
  if (blob) await recentProjects.update(session.projectId, { thumbnail: blob });
}

/** What the last thumbnail showed: the document and the playhead (a hidden tab captures again only when they changed). */
let thumbnailOf: { project: unknown; playhead: number } | null = null;

function captureIfChanged(session: ProjectSession): void {
  const shown = { project: documentStore.getRoot(), playhead: sessionStore.state.getState().playhead };
  if (thumbnailOf && thumbnailOf.project === shown.project && thumbnailOf.playhead === shown.playhead) return;
  thumbnailOf = shown;
  void captureRecentThumbnail(session);
}

async function closeCurrent(): Promise<void> {
  const session = current;
  current = null;
  if (!session) return;
  stopFrameRate?.();
  stopFrameRate = null;
  detachExternal();
  clearGeneratorNotes();
  // An export of this project stops (its temp file is deleted).
  cancelExport();
  // The thumbnail first: the preview still shows the project.
  await captureRecentThumbnail(session, 1500);
  thumbnailOf = null;
  detachPreview();
  detachMedia();
  detachFonts();
  detachLuts();
  detachPresets();
  await session.close();
  // Their memory goes with the project (decoders, sample indexes, parsed audio tracks, heaps); the
  // next project starts new ones on its first request.
  for (const kind of PROJECT_WORKERS) workerPool.stop(kind);
}

/** Opening another project closes the current one after saving (spec §15). */
async function switchTo(opened: OpenedProject, repair: RepairReport | null = null): Promise<void> {
  await closeCurrent();
  const session = new ProjectSession(opened, {
    documentStore,
    session: sessionStore,
    layout: layoutStore,
    recent: recentProjects,
    settings: appSettings,
    saveStatus,
    appVersion,
    doc: document,
  });
  current = session;
  // Thumbnail decodes yield to the preview's (one hardware decoder).
  attachMedia(session.dir, () => !session.readOnly, frameService);
  attachPreview(session.dir, () => !session.readOnly);
  attachFonts(session.dir, () => !session.readOnly);
  void attachLuts(session.dir, () => !session.readOnly);
  attachPresets(session.dir, () => !session.readOnly);
  // Temp files of exports an earlier tab did not finish.
  if (!session.readOnly) clearExportLeftovers(session.dir).catch((error: unknown) => console.warn("[export] cannot clear cache/export-temp/", error));
  // After the document is loaded: a conversion, its undo or a restore move the session's frames.
  stopFrameRate = followFrameRate();
  attachExternal(session);
  loadGeneratorNotes(session.dir);
  if (repair) void reportRepair(session, repair);
  setView({
    project: { id: opened.project.id, folder: opened.dir.name },
    dialog: opened.recovery ? { kind: "recovery", recovery: opened.recovery } : null,
  });
}

/**
 * Closes the open project and shows the start screen over an empty placeholder document, so nothing
 * of the closed project stays referenced (dev builds: the memory benchmark of Batch 45).
 */
export async function closeProject(): Promise<void> {
  await closeCurrent();
  setView({ project: null, dialog: null });
  documentStore.load(emptyDocument({ id: crypto.randomUUID(), name: "Untitled project", now: new Date().toISOString(), appVersion }));
}

/**
 * Runs `work` with the project's media and preview services detached (Clear cache: nothing holds or
 * writes cache files meanwhile), then attaches them again: thumbnails, waveforms, proxies and sample
 * indexes are made again from what is on disk. The document and its undo history stay.
 */
export async function withMediaDetached<T>(work: (dir: FsDir) => Promise<T>): Promise<T | null> {
  const session = current;
  if (!session) return null;
  detachPreview();
  detachMedia();
  try {
    return await work(session.dir);
  } finally {
    if (current === session) {
      attachMedia(session.dir, () => !session.readOnly, frameService, { announceOffline: false });
      attachPreview(session.dir, () => !session.readOnly);
    }
  }
}

async function openDir(dir: FsDir, retry = false): Promise<void> {
  // Pending saves first: the folder may be the open project's, whose project.json is still stale.
  await current?.flush();
  let opened: OpenedProject;
  try {
    opened = await openProjectFolder(dir, { retry });
  } catch (error) {
    if (error instanceof ProjectOpenError && error.reason === "permission") {
      setView({ dialog: { kind: "permission", dir, message: error.message } });
    } else {
      showError("Could not open the project", error);
    }
    return;
  }
  // Media that disagree with their files are corrected before the project shows (one step, not undoable; spec §21.5).
  const repaired = await repairOpened(opened);
  await switchTo(repaired.opened, repaired.report);
  // Opened, whatever the way in (a card, Recent, a link, Open project, a drop): reviewed. review.json goes into the
  // folder, or the record stays in this browser when the folder cannot be written; then the inbox shows it.
  void inbox
    .markOpened(repaired.opened.dir, repaired.opened.project.id)
    .then(() => inbox.scan())
    .catch((error: unknown) => console.warn("[inbox] could not mark the project as reviewed", error));
}

/** New project: pick a folder, then the settings dialog (with a template preselected for New from template). */
export function newProject(template: string | null = null): Promise<void> {
  return guarded(async () => {
    const dir = await pickFolder();
    if (dir) setView({ dialog: { kind: "newProject", dir, template } });
  });
}

/** New from template (spec §15, the start screen's Templates): New project with the template chosen. */
export function newFromTemplate(id: string): Promise<void> {
  return newProject(templateStore.find(id) ? id : null);
}

export function confirmNewProject(dir: FsDir, name: string, settings: NewProjectSettings, template: string | null = null): Promise<void> {
  return run(async () => {
    let opened: OpenedProject;
    try {
      opened = await createProject(dir, name, settings, { appVersion, template: template ? templateStore.find(template) : null });
    } catch (error) {
      showError("Could not create the project", error);
      return;
    }
    await switchTo(opened);
  });
}

export function openProject(): Promise<void> {
  return guarded(async () => {
    const dir = await pickFolder();
    if (dir) await openDir(dir);
  });
}

export function openRecent(entry: RecentProject): Promise<void> {
  return guarded(async () => {
    if (!isDirectoryHandle(entry.handle)) {
      showError("Could not open the project", new Error(`The stored folder of "${entry.name}" is not usable any more. Remove it and open the folder again.`));
      return;
    }
    await openDir(fromHandle(entry.handle));
  });
}

/** Handles from a drop (DataTransferItem.getAsFileSystemHandle, requested inside the drop event). */
export function openDropped(handles: readonly Promise<FileSystemHandle | null>[]): Promise<void> {
  return guarded(async () => {
    const settled = await Promise.allSettled(handles);
    const folder = settled.map((result) => (result.status === "fulfilled" ? result.value : null)).find(isDirectoryHandle);
    if (!folder) {
      showError("Drop a project folder", new Error("Drop the folder that contains project.json, not single files."));
      return;
    }
    await openDir(fromHandle(folder));
  });
}

/** "Try again" in the permission dialog: asks even for permissions the user denied before. */
export function retryOpen(dir: FsDir): Promise<void> {
  return run(async () => {
    closeDialog();
    await openDir(dir, true);
  });
}

export function restoreRecovery(recovery: Recovery): void {
  current?.restoreRecovery(recovery);
  closeDialog();
}

export function keepSavedVersion(): void {
  void current?.discardRecovery();
  closeDialog();
}

/** The app bar's project name is being edited (`project.rename`: a click on the name, or the palette). */
export const projectNaming = createStore(false);

/** Mod+S and the save dot. */
export function saveNow(): void {
  void current?.saveNow();
}

/** Saves the open project now and waits (the fatal screen's Reload, Batch 47). */
export async function saveBeforeReload(): Promise<void> {
  await current?.saveNow();
}

/** The read-only banner and the dot: ask for write access again (needs the click's user gesture). */
export function allowEditing(): void {
  void current?.requestWriteAccess();
}

/** Closing the tab would lose edits: a read-only project's, or ones whose save failed. */
function onBeforeUnload(event: BeforeUnloadEvent): void {
  if (!current) return;
  const status = saveStatus.getState();
  if (unsavedReadOnlyEdits() || status.state === "error") {
    event.preventDefault();
    // Chrome shows its own "Leave site?" text; returnValue must be set for it to ask.
    event.returnValue = "";
  }
}

// --- Watched folders and open links (spec §21.5; the project inbox) ---

/** Chrome refuses some folders in its picker; what to do instead, in plain words. */
export const BLOCKED_FOLDER_HINT = "Chrome does not allow Desktop, Documents, the home folder or a OneDrive folder itself, or a folder that contains them. Pick a folder inside one of them, or a folder like Videos.";

/** The watched folder picker (a user gesture); null when cancelled. */
async function pickWatchedFolder(): Promise<FsDir | null> {
  try {
    const picker = window as unknown as DirectoryPickerWindow;
    return fromHandle(await picker.showDirectoryPicker({ id: "shorts-editor-projects", mode: "readwrite" }));
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return null;
    throw error;
  }
}

const sameFolder = (a: FsDir, b: FsDir): Promise<boolean> =>
  isDirectoryHandle(a.handle) && isDirectoryHandle(b.handle) ? a.handle.isSameEntry(b.handle) : Promise.resolve(a.handle === b.handle);

/** Opens a project folder the app already holds (an inbox card, a link): the same path as Open project. */
export function openFolder(dir: FsDir): Promise<void> {
  return guarded(() => openDir(dir));
}

/** The link is used (or leads nowhere): the address drops it and the start screen stops asking. */
function finishLink(): void {
  setView({ openLink: null });
  window.history.replaceState(null, "", `${window.location.pathname}${withoutOpenLink(window.location.search)}${window.location.hash}`);
}

/**
 * Follows `/?open=<path>` or `/?open=<folder label>:<path>`: the path is tried in each watched folder in order
 * and the first project found opens. `request`: a click allows asking for access to folders that lost it.
 */
async function followLink(link: string, request: boolean): Promise<void> {
  try {
    await watchedFolders.load();
    const result = await resolveOpenLink(watchedFolders.folders(), link, { request });
    if (result.kind === "noFolders") {
      setView({ openLink: { path: link, need: "folder" } });
    } else if (result.kind === "needsAccess") {
      setView({ openLink: { path: link, need: "permission" } });
      if (request) showToast({ tone: "warning", message: "No access to a watched folder", detail: `Allow access to ${result.folders.map((folder) => folder.label).join(", ")} to open ${result.path}.` });
    } else if (result.kind === "missing") {
      finishLink();
      const where = result.searched.length === 1 ? (result.searched[0]?.label ?? "the watched folder") : "any watched folder";
      showToast({
        tone: "warning",
        message: `Can't open ${result.path}`,
        detail: result.reason === "missing" ? `There is no folder "${result.path}" inside ${where}.` : `The folder "${result.path}" has no project.json.`,
      });
    } else {
      finishLink();
      await openFolder(result.dir);
    }
  } catch (error) {
    showError("Could not open the link", error);
  }
}

/** `/?open=<path>` at start: opens at once when a watched folder with access has it, else the start screen asks for the one click it needs. */
export function startOpenLink(link: string): Promise<void> {
  return followLink(link, false);
}

/** The start screen's "Open <path>": the click gives `requestPermission` its user gesture. */
export async function continueOpenLink(): Promise<void> {
  const pending = appView.getState().openLink;
  if (pending) await followLink(pending.path, true);
}

/** Start screen, Settings > General and the palette: add a folder to watch; a waiting link opens with it. */
export async function addWatchedFolder(): Promise<void> {
  let dir: FsDir | null;
  try {
    dir = await pickWatchedFolder();
  } catch (error) {
    console.info("[watched-folders] the browser refused the folder:", error);
    showToast({ tone: "warning", message: "The browser did not allow that folder", detail: BLOCKED_FOLDER_HINT }, { durationMs: 12_000 });
    return;
  }
  if (!dir) return;
  try {
    await watchedFolders.add(dir, sameFolder);
    void inbox.scan();
    const pending = appView.getState().openLink;
    if (pending) await followLink(pending.path, false);
  } catch (error) {
    showError("Could not use that folder", error);
  }
}

/** Settings > General: stop watching a folder (nothing on disk changes). */
export function removeWatchedFolder(id: string): void {
  void watchedFolders.remove(id).then(() => inbox.scan());
}

/** Settings > General: the label a folder shows on its cards and takes in `/?open=<label>:<path>`. */
export function renameWatchedFolder(id: string, label: string): void {
  void watchedFolders.rename(id, label).then(() => inbox.scan());
}

/** Registers project actions and loads persisted lists. Returns a stop function. */
export function installProjectController(): () => void {
  void recentProjects.load();
  void watchedFolders.load();
  const link = parseOpenLink(window.location.search);
  if (link) void startOpenLink(link);
  void appSettings.load();
  void templateStore.load();
  void lookStore.load();
  void compoundTemplateStore.load().then(() => syncTemplatesFromLibrary());
  const onVisibility = () => {
    if (document.visibilityState === "hidden" && current) captureIfChanged(current);
  };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("beforeunload", onBeforeUnload);
  const stops = [
    // A closing dialog owned the keyboard: hand it back to the global scope, whatever closed it.
    appView.select(
      (view) => view.dialog,
      (dialog, prev) => {
        if (!dialog && prev) focusScopes.set("global");
      },
    ),
    actions.register("project.save", () => saveNow(), { enabled: () => current !== null }),
    actions.register("project.new", () => void newProject()),
    actions.register("project.newFromTemplate", (_context, id) => {
      if (typeof id === "string") void newFromTemplate(id);
    }),
    actions.register("project.open", () => void openProject()),
    actions.register("project.chooseProjectsFolder", () => void addWatchedFolder()),
    actions.register("project.rename", () => projectNaming.set(true), { enabled: () => current !== null }),
    actions.register("project.allowEditing", () => allowEditing(), { enabled: () => saveStatus.getState().readOnly }),
    ...RESOLUTION_PRESETS.map((preset) => actions.register(ratioCommandId(preset), () => changeRatio(preset), { enabled: () => current !== null })),
    () => document.removeEventListener("visibilitychange", onVisibility),
    () => window.removeEventListener("beforeunload", onBeforeUnload),
  ];
  return () => {
    for (const stop of stops) stop();
  };
}
