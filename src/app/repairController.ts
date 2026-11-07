// Repair on open (spec §21.5, Batch 56): the app's side of `project/repair.ts`: headers are read in the
// analysis worker, the result is one not-undoable step (it replaces the document before the session starts
// or on a reload), the details go to history/repair-<date>.log and a toast gives the counts.
import type { WorkerPool } from "../media/workers/WorkerPool.js";
import type { OpenedProject } from "../project/openProject.js";
import type { ProjectSession } from "../project/ProjectSession.js";
import { repairProject, writeRepairLog, type HeaderReader, type RepairReport } from "../project/repair.js";
import { showToast } from "../ui/toasts.js";
import { workerPool } from "./services.js";

export function repairHeaderReader(pool: Pick<WorkerPool, "request">): HeaderReader {
  return (file, name) => pool.request("mediaHeader", { file, name }, { priority: "user" });
}

/** `opened` with its project repaired (the same object when nothing needed it); a failure leaves it as it is. */
export async function repairOpened(opened: OpenedProject): Promise<{ opened: OpenedProject; report: RepairReport | null }> {
  try {
    const report = await repairProject(opened.project, opened.dir, repairHeaderReader(workerPool));
    if (report.media === 0) return { opened, report: null };
    return { opened: { ...opened, project: report.project }, report };
  } catch (error) {
    console.warn("[repair] repair on open failed", error);
    return { opened, report: null };
  }
}

/** The toast and the log file of a repair; the autosave keeps the repaired project (a read-only one keeps it in memory). */
export async function reportRepair(session: ProjectSession, report: RepairReport): Promise<void> {
  session.autosaver.markDirty();
  let logPath: string | null = null;
  if (!session.readOnly) {
    try {
      logPath = await writeRepairLog(session.dir, report, new Date());
    } catch (error) {
      console.warn("[repair] could not write the repair log", error);
    }
  }
  const counts = [`${report.media} media record${report.media === 1 ? "" : "s"} corrected`, ...(report.clipsTrimmed > 0 ? [`${report.clipsTrimmed} clip${report.clipsTrimmed === 1 ? "" : "s"} trimmed`] : [])].join(", ");
  showToast({ tone: "info", message: "Repaired on open", detail: logPath ? `${counts}. Details in ${logPath}.` : `${counts}.` }, { durationMs: 9000 });
}
