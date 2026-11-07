// Reload on external change (spec §21.5, Batch 56): watches the open project's project.json (focus check and
// a 5 s idle check, `project/externalChange.ts`). A change the app did not write: with nothing unsaved the
// project reloads in place (the document in memory goes to history/ first; playhead, zoom and scroll stay);
// with unsaved changes the banner offers Reload and Keep mine, and autosave waits for the answer (Keep
// mine: the next save backs the disk version up to history/ and overwrites it). Changed media files are read
// again (the repair pass of the reloaded project).
import { createStore } from "../core/store/createStore.js";
import type { Project } from "../core/document/types.js";
import { ExternalWatcher } from "../project/externalChange.js";
import type { ProjectSession } from "../project/ProjectSession.js";
import { repairProject } from "../project/repair.js";
import { showToast } from "../ui/toasts.js";
import { pausedWhileExporting } from "./exportState.js";
import { currentSession } from "./projectController.js";
import { actions, idleQueue, saveStatus, workerPool } from "./services.js";
import { reportRepair, repairHeaderReader } from "./repairController.js";

/** `pending`: the banner shows (the file changed while the project has unsaved changes). */
export const externalView = createStore<{ pending: boolean }>({ pending: false });

let watcher: ExternalWatcher | null = null;
let watched: ProjectSession | null = null;

const busy = (): boolean => pausedWhileExporting(idleQueue).isPaused || saveStatus.getState().state === "saving";

async function reload(session: ProjectSession): Promise<void> {
  let report: Awaited<ReturnType<typeof repairProject>> | null = null;
  const outcome = await session.reloadFromDisk(async (project: Project) => {
    report = await repairProject(project, session.dir, repairHeaderReader(workerPool)).catch(() => null);
    return report?.project ?? project;
  });
  if (watched !== session) return;
  if (outcome.result === "closed") return;
  watcher?.accept(outcome.stamp);
  session.autosaver.hold(false);
  externalView.set({ pending: false });
  if (outcome.result === "unreadable") {
    showToast({ tone: "warning", message: "project.json changed on disk but cannot be read", detail: `${outcome.error ?? "It is not a project."} Your version stays open and is saved over it.` });
    session.autosaver.markDirty();
    return;
  }
  showToast({ tone: "info", message: "Reloaded from disk", detail: "project.json was changed by another tool. Your previous version is in History." });
  if (report) void reportRepair(session, report);
}

/** Banner: Reload (the disk version replaces mine; mine goes to history/). */
export function reloadFromDisk(): void {
  const session = currentSession();
  if (session && watched === session) void reload(session);
}

/** Banner: Keep mine. The next save backs the disk version up to history/ and overwrites it. */
export function keepMine(): void {
  const session = currentSession();
  if (!session || watched !== session) return;
  session.autosaver.hold(false);
  externalView.set({ pending: false });
}

function onChange(session: ProjectSession): void {
  if (watched !== session) return;
  if (session.autosaver.isDirty || saveStatus.getState().state === "unsaved") {
    session.autosaver.hold(true);
    externalView.set({ pending: true });
    return;
  }
  void reload(session);
}

export function attachExternal(session: ProjectSession): void {
  detachExternal();
  watched = session;
  const own = new ExternalWatcher({
    dir: session.dir,
    written: () => session.autosaver.lastWritten,
    busy,
    onChange: () => onChange(session),
    win: window,
    doc: document,
  });
  watcher = own;
  void own.start();
}

export function detachExternal(): void {
  watcher?.stop();
  watcher = null;
  if (watched) watched.autosaver.hold(false);
  watched = null;
  externalView.set({ pending: false });
}

export function installExternalController(): () => void {
  const stops = [
    actions.register("project.reloadFromDisk", () => reloadFromDisk(), { enabled: () => externalView.getState().pending }),
    actions.register("project.keepMine", () => keepMine(), { enabled: () => externalView.getState().pending }),
  ];
  return () => {
    for (const stop of stops) stop();
  };
}
