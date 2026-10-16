// Project lifecycle for the UI (spec §15): folder pickers, create/open/switch, recovery offer,
// permission retries, Mod+S/N/O. Framework-free; React reads `appView` through narrow selectors.
import { createStore } from "../core/store/createStore.js";
import { errorMessage } from "../project/errorMessage.js";
import { fromHandle, isDirectoryHandle, type FsDir } from "../project/fs.js";
import { createProject, openProjectFolder, ProjectOpenError, type NewProjectSettings, type OpenedProject } from "../project/openProject.js";
import { ProjectSession } from "../project/ProjectSession.js";
import type { RecentProject } from "../project/recentProjects.js";
import type { Recovery } from "../project/recovery.js";
import { attachFonts, detachFonts } from "./fontController.js";
import { attachMedia, detachMedia } from "./mediaController.js";
import { attachPreview, detachPreview, frameService } from "./previewController.js";
import { actions, appSettings, appVersion, documentStore, focusScopes, layoutStore, recentProjects, saveStatus, sessionStore } from "./services.js";

export type Dialog =
  | { kind: "newProject"; dir: FsDir }
  | { kind: "recovery"; recovery: Recovery }
  | { kind: "permission"; dir: FsDir; message: string }
  | { kind: "error"; title: string; message: string; issues: readonly string[] };

export interface AppView {
  /** The open project; null shows the start screen. */
  project: { id: string; folder: string } | null;
  dialog: Dialog | null;
  /** A pick/open/create flow is running; buttons that start another one are disabled. */
  busy: boolean;
}

export const appView = createStore<AppView>({ project: null, dialog: null, busy: false });

let current: ProjectSession | null = null;

const setView = (patch: Partial<AppView>) => appView.set((view) => ({ ...view, ...patch }));

export function closeDialog(): void {
  setView({ dialog: null });
}

function showError(title: string, error: unknown): void {
  // Expected failures (no project.json, no permission) are the user's to fix: shown, logged quietly.
  if (error instanceof ProjectOpenError) console.info(`[project] ${title}:`, error.message);
  else console.error(`[project] ${title}`, error);
  const issues = error instanceof ProjectOpenError ? error.issues : [];
  setView({ dialog: { kind: "error", title, message: errorMessage(error), issues } });
}

/** One flow at a time; failures end in an error dialog, never in an unhandled rejection. */
async function run(flow: () => Promise<void>): Promise<void> {
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

async function closeCurrent(): Promise<void> {
  const session = current;
  current = null;
  if (!session) return;
  detachPreview();
  detachMedia();
  detachFonts();
  await session.close();
}

/** Opening another project closes the current one after saving (spec §15). */
async function switchTo(opened: OpenedProject): Promise<void> {
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
  setView({
    project: { id: opened.project.id, folder: opened.dir.name },
    dialog: opened.recovery ? { kind: "recovery", recovery: opened.recovery } : null,
  });
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
  await switchTo(opened);
}

/** New project: pick a folder, then the settings dialog. */
export function newProject(): Promise<void> {
  return run(async () => {
    const dir = await pickFolder();
    if (dir) setView({ dialog: { kind: "newProject", dir } });
  });
}

export function confirmNewProject(dir: FsDir, name: string, settings: NewProjectSettings): Promise<void> {
  return run(async () => {
    let opened: OpenedProject;
    try {
      opened = await createProject(dir, name, settings, { appVersion });
    } catch (error) {
      showError("Could not create the project", error);
      return;
    }
    await switchTo(opened);
  });
}

export function openProject(): Promise<void> {
  return run(async () => {
    const dir = await pickFolder();
    if (dir) await openDir(dir);
  });
}

export function openRecent(entry: RecentProject): Promise<void> {
  return run(async () => {
    if (!isDirectoryHandle(entry.handle)) {
      showError("Could not open the project", new Error(`The stored folder of "${entry.name}" is not usable any more. Remove it and open the folder again.`));
      return;
    }
    await openDir(fromHandle(entry.handle));
  });
}

/** Handles from a drop (DataTransferItem.getAsFileSystemHandle, requested inside the drop event). */
export function openDropped(handles: readonly Promise<FileSystemHandle | null>[]): Promise<void> {
  return run(async () => {
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

/** Mod+S and the save dot. */
export function saveNow(): void {
  void current?.saveNow();
}

/** The read-only banner and the dot: ask for write access again (needs the click's user gesture). */
export function allowEditing(): void {
  void current?.requestWriteAccess();
}

/** Registers project actions and loads persisted lists. Returns a stop function. */
export function installProjectController(): () => void {
  void recentProjects.load();
  void appSettings.load();
  const stops = [
    // A closing dialog owned the keyboard: hand it back to the global scope, whatever closed it.
    appView.select(
      (view) => view.dialog,
      (dialog, prev) => {
        if (!dialog && prev) focusScopes.set("global");
      },
    ),
    actions.register("project.save", () => saveNow()),
    actions.register("project.new", () => void newProject()),
    actions.register("project.open", () => void openProject()),
  ];
  return () => {
    for (const stop of stops) stop();
  };
}
