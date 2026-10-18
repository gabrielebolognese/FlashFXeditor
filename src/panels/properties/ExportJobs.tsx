import { useEffect, useRef } from "react";
import { Ban, CircleCheck, CircleX, FileAudio, Film, FolderOpen, Pause, Play, RotateCcw, X } from "lucide-react";
import { exportQueue, jobLive, jobPaused, type ExportJobSpec } from "../../app/exportController.js";
import { sessionStore } from "../../app/services.js";
import type { SessionState } from "../../core/store/sessionStore.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import type { ExportLogEntry, ExportLogStatus } from "../../export/log.js";
import type { QueueJob } from "../../export/queue.js";
import { formatBytes } from "../../project/cache.js";
import { IconButton } from "../../ui/IconButton.js";
import styles from "./ExportTab.module.css";

// The Export tab's queue and log (spec §16, Batch 44). The queue renders when a job is added, starts,
// ends or is paused (the queue store); each card's bar and line follow the job's live store, written
// into the DOM without a React render (P1: an export's progress while the user plays or drags). The
// log is the session's last 20 jobs, newest first, each with Export again and Open folder.

const selectJobs = (jobs: readonly QueueJob<ExportJobSpec>[]) => jobs;
const selectLog = (state: SessionState) => state.exportLog;

function JobCard({ job }: { job: QueueJob<ExportJobSpec> }) {
  const bar = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const live = jobLive(job.id);
    const write = () => {
      const { progress, detail } = live.getState();
      if (bar.current) bar.current.style.width = `${Math.round(progress * 1000) / 10}%`;
      if (line.current) line.current.textContent = detail;
    };
    write();
    return live.subscribe(write);
  }, [job.id]);
  const paused = jobPaused(job.id);
  const Icon = job.spec.request.kind === "video" ? Film : FileAudio;
  return (
    <li className={styles.card} data-job={job.id} data-status={job.status}>
      <Icon className={styles.cardIcon} aria-hidden="true" />
      <div className={styles.cardText}>
        <span className={styles.cardName} title={job.spec.fileName}>
          {job.spec.fileName}
        </span>
        <span className={styles.cardMeta}>{job.spec.summary}</span>
      </div>
      <div className={styles.cardActions}>
        <IconButton commandId="export.pauseResume" arg={job.id} icon={paused ? Play : Pause} label={paused ? "Resume" : "Pause"} />
        <IconButton commandId="export.cancel" arg={job.id} icon={X} label={job.status === "queued" ? "Remove from the queue" : "Cancel"} />
      </div>
      <div className={styles.progress}>
        <div className={styles.track}>
          <div ref={bar} className={styles.bar} />
        </div>
        <span ref={line} className={styles.line} />
      </div>
    </li>
  );
}

export function ExportJobs() {
  const jobs = useStoreSelector(exportQueue.jobs, selectJobs);
  if (jobs.length === 0) return <span className={styles.empty}>Nothing to export. Exports you start wait here in order.</span>;
  return (
    <ul className={styles.list} aria-label="Export queue">
      {jobs.map((job) => (
        <JobCard key={job.id} job={job} />
      ))}
    </ul>
  );
}

const STATUS_ICONS: Record<ExportLogStatus, typeof CircleCheck> = { done: CircleCheck, cancelled: Ban, failed: CircleX };
const STATUS_TEXT: Record<ExportLogStatus, string> = { done: "Exported", cancelled: "Cancelled", failed: "Failed" };

const when = (at: number) => new Date(at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

function LogRow({ entry }: { entry: ExportLogEntry }) {
  const Icon = STATUS_ICONS[entry.status];
  const meta = entry.status === "done" ? `${when(entry.at)} · ${formatBytes(entry.bytes)} · ${entry.summary}` : `${STATUS_TEXT[entry.status]} ${when(entry.at)}${entry.error ? ` · ${entry.error}` : ""}`;
  return (
    <li className={styles.logRow} data-status={entry.status}>
      <Icon className={styles.logIcon} aria-label={STATUS_TEXT[entry.status]} />
      <div className={styles.cardText}>
        <span className={styles.logName} title={entry.name}>
          {entry.name}
        </span>
        <span className={styles.cardMeta} title={meta}>
          {meta}
        </span>
      </div>
      <div className={styles.cardActions}>
        <IconButton commandId="export.again" arg={entry.id} icon={RotateCcw} label="Export again with these settings" />
        <IconButton commandId="export.openFolder" arg={entry.id} icon={FolderOpen} label="Open folder" disabled={entry.status !== "done"} />
      </div>
    </li>
  );
}

export function ExportLog() {
  const log = useStoreSelector(sessionStore.state, selectLog);
  if (log.length === 0) return <span className={styles.empty}>Your last 20 exports appear here.</span>;
  return (
    <ul className={styles.list} aria-label="Export log">
      {log.map((entry) => (
        <LogRow key={entry.id} entry={entry} />
      ))}
    </ul>
  );
}
