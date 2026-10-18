// Export (spec §16, Batch 43): `app.export` (the app bar's Export, Mod+E) exports the whole timeline
// with the Instagram Reels preset in export.worker. TODO(batch 44): Export opens the Export tab
// (presets, range, file name, destination, custom settings, queue and log).
// - The export reads a snapshot of the document taken when it starts, so editing goes on meanwhile.
//   With it go the files of the media the range shows (and their cache/index/ sample indexes), the
//   SVG images rasterized here (workers have no DOM to draw SVG), the project's fonts, the slates of
//   offline media and the stereo mixdown, rendered here by the playback code (`renderMixdown`:
//   OfflineAudioContext exists on windows only) and transferred.
// - The worker's bytes are written at their positions into cache/export-temp/<id>.mp4 (spec §9.7);
//   the finished file moves to exports/{project}-{preset}-{date}.mp4 under a free name. A cancel or a
//   failure aborts the write and deletes the temp file, so nothing reaches exports/; temp files of
//   exports a closed tab interrupted are deleted when the project opens again.
// - While it runs (exportState): the main texture pool keeps 70% of the budget and the worker gets
//   30%, proxy jobs pause, playback plays proxies, Clear cache is refused; closing the project
//   cancels it. One export at a time (the queue is Batch 44's).
// - Progress: a toast whose bar and line (percent, frames, time left by a moving average) follow a
//   live store, written without a React render (P1), with Pause / Resume and Cancel; the palette has
//   `export.pauseResume` and `export.cancel`.
import { renderMixdown } from "../audio/mixdown.js";
import { createStore, type Store } from "../core/store/createStore.js";
import type { Frame, MediaId, Project } from "../core/document/types.js";
import { EtaEstimator, formatRemaining } from "../export/eta.js";
import { clearExportTemp, ExportFile, EXPORTS_DIR } from "../export/exportFile.js";
import { exportNeeds } from "../export/inputs.js";
import type { ExportJobParams, ExportJobResult, ExportMediaFile } from "../export/job.js";
import { exportFormat, fillFileName, FILE_NAME_TEMPLATE, REELS_PRESET, type ExportFormat, type ExportPreset } from "../export/presets.js";
import { SVG_MAX_SIZE } from "../media/decode/ImageService.js";
import { isSvgImage } from "../media/mediaKinds.js";
import { svgPoster } from "../media/probe/svgProbe.js";
import { isAbortError } from "../media/workers/protocol.js";
import { formatBytes } from "../project/cache.js";
import { errorMessage } from "../project/errorMessage.js";
import type { FsDir } from "../project/fs.js";
import { resolveFile, safeFileName, sampleIndexPath } from "../project/mediaFiles.js";
import { slateLook } from "../render/preview/PreviewView.js";
import { contentEnd } from "../timeline/model/queries.js";
import { dismissToast, showToast, updateToast, type ToastLive } from "../ui/toasts.js";
import { decodedAudio } from "./audioController.js";
import { exportState } from "./exportState.js";
import { projectFontFaces } from "./fontController.js";
import { offlineReason, OFFLINE_LABEL, sourceFile } from "./mediaOffline.js";
import { setTextureShare, textureBudget } from "./previewController.js";
import { currentSession, refuseReadOnly } from "./projectController.js";
import { actions, documentStore, themeBridge, workerPool } from "./services.js";

/** The main texture pool's share of the budget while exporting; the worker gets the rest (spec §16). */
export const MAIN_TEXTURE_SHARE = 0.7;

interface Job {
  controller: AbortController;
  toast: number;
  live: Store<ToastLive>;
  eta: EtaEstimator;
  started: boolean;
  paused: boolean;
  done: number;
  total: number;
}

let running: Job | null = null;

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

function progressLine(job: Job): string {
  if (!job.started) return "Preparing…";
  const share = job.total > 0 ? job.done / job.total : 0;
  const head = `${Math.floor(share * 100)}% · ${job.done} / ${job.total} frames`;
  if (job.paused) return `Paused · ${head}`;
  const left = job.eta.remainingMs(job.total);
  return left === null ? head : `${head} · ${formatRemaining(left)} left`;
}

function showProgress(job: Job): void {
  job.live.set({ progress: job.total > 0 ? job.done / job.total : 0, detail: progressLine(job) });
}

/** What the worker needs besides the document, gathered on the main thread. */
async function gatherInputs(dir: FsDir, project: Project, range: { start: Frame; end: Frame }, signal: AbortSignal): Promise<Pick<ExportJobParams, "media" | "svg" | "fonts" | "offline" | "audio">> {
  const media: Record<MediaId, ExportMediaFile> = {};
  const svg: Record<MediaId, ImageBitmap> = {};
  const offline: Record<MediaId, string> = {};
  try {
    for (const mediaId of exportNeeds(project, range).media) {
      signal.throwIfAborted();
      const item = project.media[mediaId];
      const reason = item ? offlineReason(mediaId) : "removed";
      const file = reason === null ? await sourceFile(mediaId) : null;
      if (!item || !file) {
        offline[mediaId] = OFFLINE_LABEL[reason ?? "missing"];
        continue;
      }
      const index = item.kind === "video" ? await resolveFile(dir, sampleIndexPath(mediaId, "full")).catch(() => null) : null;
      media[mediaId] = { file, index };
      if (isSvgImage(item)) svg[mediaId] = await svgPoster(file, SVG_MAX_SIZE);
    }
    signal.throwIfAborted();
    // The master volume is monitoring only (spec §14): the mixdown never has it.
    const mix = await renderMixdown(project, range, { sampleRate: 48000, channels: 2, signal }, { audio: decodedAudio, createContext: (init) => new OfflineAudioContext(init) });
    return { media, svg, offline, fonts: projectFontFaces(), audio: mix ? { sampleRate: mix.sampleRate, channels: mix.channels.map((plane) => plane.buffer) } : null };
  } catch (error) {
    for (const bitmap of Object.values(svg)) bitmap.close();
    throw error;
  }
}

/**
 * Exports frames [0, content end) with `preset` (spec §16); resolves when the export ended (done,
 * cancelled or failed: each says so in a toast).
 */
export async function startExport(preset: ExportPreset = REELS_PRESET): Promise<void> {
  const session = currentSession();
  if (!session) return;
  if (running) {
    showToast({ tone: "info", message: "An export is already running", detail: "Wait for it to finish, or cancel it." });
    return;
  }
  if (session.readOnly) {
    refuseReadOnly("export");
    return;
  }
  const project = documentStore.getState();
  const range = { start: 0, end: contentEnd(project) };
  if (range.end <= range.start) {
    showToast({ tone: "info", message: "Nothing to export", detail: "Add clips to the timeline first." });
    return;
  }
  const format: ExportFormat = exportFormat(project, preset);
  const fileName = safeFileName(fillFileName(FILE_NAME_TEMPLATE, { project: project.name, preset: preset.id, date: new Date() }));
  const live = createStore<ToastLive>({ progress: 0, detail: "Preparing…" });
  const job: Job = { controller: new AbortController(), toast: 0, live, eta: new EtaEstimator(), started: false, paused: false, done: 0, total: 0 };
  running = job;
  exportState.set({ running: true, paused: false });
  setTextureShare(MAIN_TEXTURE_SHARE);
  job.toast = showToast({
    tone: "info",
    message: `Exporting ${fileName}`,
    live,
    secondaryAction: { label: "Pause", run: togglePauseExport },
    action: { label: "Cancel", run: cancelExport },
  });
  const { signal } = job.controller;
  const dir = session.dir;
  let file: ExportFile | null = null;
  try {
    const inputs = await gatherInputs(dir, project, range, signal);
    signal.throwIfAborted();
    // A failed write stops the export with its error.
    const output = await ExportFile.create(dir, crypto.randomUUID(), (error) => job.controller.abort(error));
    file = output;
    const params: ExportJobParams = { project, range, format, slate: slateLook(themeBridge.theme), textureBudget: Math.round(textureBudget() * (1 - MAIN_TEXTURE_SHARE)), ...inputs };
    const transfer: Transferable[] = [...Object.values(inputs.svg), ...(inputs.audio?.channels ?? []), ...inputs.fonts.map((face) => face.data)];
    const result: ExportJobResult = await workerPool.request("exportVideo", params, {
      priority: "user",
      signal,
      transfer,
      onProgress: (value) => {
        if (value.kind === "bytes") {
          output.write(new Uint8Array(value.data), value.position);
          return;
        }
        if (value.kind === "started") job.started = true;
        else {
          job.done = value.done;
          job.total = value.total;
          job.eta.update(value.done, performance.now());
        }
        showProgress(job);
      },
    });
    const name = await output.finish(fileName);
    file = null;
    showToast({ tone: "success", message: `Exported ${name}`, detail: `${EXPORTS_DIR}/${name} · ${formatBytes(output.bytes)} · ${result.width}×${result.height} · ${plural(result.frames, "frame")}` }, { durationMs: 8000 });
    console.info(`[export] ${name}: ${result.frames} frames ${result.width}x${result.height} ${result.videoCodec} / ${result.audioCodec ?? "no audio"} in ${Math.round(result.ms)} ms, ${output.bytes} bytes`);
  } catch (error) {
    await file?.discard();
    // A failed write aborts the export with its error; a cancel with an AbortError.
    const reason: unknown = signal.aborted ? signal.reason : null;
    const failure = reason !== null && !isAbortError(reason) ? reason : error;
    if (isAbortError(failure)) showToast({ tone: "info", message: "Export cancelled", detail: "Nothing was written to exports/." });
    else {
      console.error("[export] failed", failure);
      showToast({ tone: "error", message: "Export failed", detail: errorMessage(failure) });
    }
  } finally {
    if (running === job) running = null;
    dismissToast(job.toast);
    exportState.set({ running: false, paused: false });
    setTextureShare(1);
    // A fresh worker per export: the device, decoders and textures of this one go at once (P13).
    workerPool.stop("export");
  }
}

/** Cancels the running export (its temp file is deleted). */
export function cancelExport(): void {
  running?.controller.abort();
}

/** Pauses the running export between frames, or resumes it. */
export function togglePauseExport(): void {
  const job = running;
  if (!job) return;
  job.paused = !job.paused;
  const now = performance.now();
  if (job.paused) job.eta.pause(now);
  else job.eta.resume(now);
  workerPool.request("pauseExport", { paused: job.paused }, { priority: "user" }).catch(() => undefined);
  exportState.set({ running: true, paused: job.paused });
  updateToast(job.toast, { secondaryAction: { label: job.paused ? "Resume" : "Pause", run: togglePauseExport } });
  showProgress(job);
}

/** Deletes the temp files of exports a closed tab interrupted (a project that opened, writable). */
export function clearExportLeftovers(dir: FsDir): Promise<void> {
  return clearExportTemp(dir);
}

/** Registers the export commands. Returns a stop function. */
export function installExportController(): () => void {
  const isRunning = () => running !== null;
  const stops = [
    actions.register("app.export", () => void startExport(REELS_PRESET)),
    actions.register("export.cancel", cancelExport, { enabled: isRunning }),
    actions.register("export.pauseResume", togglePauseExport, { enabled: isRunning }),
  ];
  if (import.meta.env.DEV) {
    // Console access for the acceptance checks.
    const editor = ((globalThis as { __editor?: Record<string, unknown> }).__editor ??= {});
    editor.export = {
      start: startExport,
      cancel: cancelExport,
      togglePause: togglePauseExport,
      state: exportState,
      get job() {
        return running;
      },
    };
  }
  return () => {
    for (const stop of stops) stop();
  };
}
