// The History list (spec §15, §9.7 history/: the 20 rotating backups autosave keeps; Batch 42): the
// backups newest first with their time and size, and Restore, which asks first and then makes the
// backup the current document (`ProjectSession.restoreBackup`: the state before it becomes the newest
// backup, autosave goes on). Reading the list works in a read-only project; restoring does not.
import { createStore } from "../core/store/createStore.js";
import { errorMessage } from "../project/errorMessage.js";
import { listBackups, type Backup } from "../project/history.js";
import { HISTORY_DIR } from "../project/layout.js";
import { parseProjectFile } from "../project/projectFile.js";
import { showToast } from "../ui/toasts.js";
import { closeDialog, currentSession, refuseReadOnly, showDialog } from "./projectController.js";
import { actions } from "./services.js";

export interface HistoryState {
  /** Newest first; null while loading. */
  backups: readonly Backup[] | null;
  error: string | null;
  /** The backup being restored, or null. */
  restoring: string | null;
}

export const historyList = createStore<HistoryState>({ backups: null, error: null, restoring: null });

/** A backup's time as the dialog shows it ("18 Oct 2026, 14:03:12"). */
export function backupLabel(time: number): string {
  return new Date(time).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" });
}

/** Reads history/ again. */
export async function loadHistory(): Promise<void> {
  const session = currentSession();
  if (!session) return;
  historyList.set({ backups: null, error: null, restoring: null });
  try {
    const history = await session.dir.dir(HISTORY_DIR);
    const backups = history ? await listBackups(history) : [];
    if (currentSession() === session) historyList.set({ backups, error: null, restoring: null });
  } catch (error) {
    historyList.set({ backups: [], error: errorMessage(error), restoring: null });
  }
}

/** `project.history`: the History dialog. */
export function openHistory(): void {
  if (!currentSession()) return;
  showDialog({ kind: "history" });
  void loadHistory();
}

/** Restores `name` (after the dialog's confirmation). */
export async function restoreBackup(name: string): Promise<void> {
  const session = currentSession();
  if (!session || historyList.getState().restoring) return;
  if (session.readOnly) {
    refuseReadOnly("restore a backup");
    return;
  }
  historyList.set((state) => ({ ...state, restoring: name }));
  try {
    const file = await (await session.dir.dir(HISTORY_DIR))?.readFile(name);
    if (!file) throw new Error(`${name} is no longer in the history folder.`);
    const project = parseProjectFile(file.text);
    if (!(await session.restoreBackup(project))) throw new Error("The current version could not be saved first, so nothing was restored. Check the save status and try again.");
    closeDialog();
    const time = (historyList.getState().backups ?? []).find((backup) => backup.name === name)?.time;
    showToast({ tone: "success", message: time ? `Restored the version from ${backupLabel(time)}` : "Restored the backup", detail: "The version before it is the newest entry in History." });
  } catch (error) {
    console.warn("[history] restore failed", error);
    showToast({ tone: "error", message: "Can't restore this backup", detail: errorMessage(error) });
  } finally {
    historyList.set((state) => ({ ...state, restoring: null }));
  }
}

export function installHistoryController(): () => void {
  const stop = actions.register("project.history", openHistory, { enabled: () => currentSession() !== null });
  return stop;
}
