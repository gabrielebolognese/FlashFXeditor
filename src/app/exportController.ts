// Export (spec §16, §17, Batch 43 engine, Batch 44 UX). `app.export` (the app bar's Export, Mod+E) opens
// the Export tab in the properties panel; its Export button (`export.start`) queues a job with the
// tab's choices: the preset (or Custom's settings), the range (whole timeline or in/out), the file
// name template and the destination (the project's exports/, or a file picked at once, in the click).
// - The queue runs one job at a time (export/queue.ts). A job takes a snapshot of the document when
//   it is queued, so editing goes on meanwhile; its inputs are gathered when it starts: the files of
//   the media the range shows (and their cache/index/ sample indexes), the SVG images rasterized here
//   (workers have no DOM to draw SVG), the project's fonts, the slates of offline media and the stereo
//   mixdown, rendered here by the playback code (`renderMixdown`: OfflineAudioContext exists on windows
//   only) and transferred. Export audio is a job too (the mixdown as a WAV or an M4A).
// - The worker's bytes are written at their positions (export/exportFile.ts) into
//   cache/export-temp/<id> and moved to exports/ under a free name when done, or into the picked file.
//   A cancel or a failure aborts the write and deletes the file, so nothing unfinished is left; temp
//   files of exports a closed tab interrupted are deleted when the project opens again.
// - While jobs run (exportState): the main texture pool keeps 70% of the budget and the worker gets
//   30%, proxy jobs pause, playback plays proxies, Clear cache is refused; closing the project cancels
//   every job. A fresh worker runs each job.
// - Progress: each job has a live store (percent, frames, time left by a moving average) that the
//   Export tab's job cards write into the DOM without a React render (P1); while the tab is not shown,
//   the running job's progress is a pinned toast with Pause / Resume and Cancel. A Pause while the
//   inputs are gathered (or while queued) posts the job paused (ExportPauseSync).
// - When a job ends it goes into the export log (session state, the last 20); a finished one shows a
//   toast with Open folder and Export again (the same request on the current document).
// - Extras (spec §16): Export frame (the composite at the playhead at project size, PNG), Copy frame
//   (the same image on the clipboard), Export audio, Export captions (SRT / VTT of the range), written
//   to the same destination.
import { renderMixdown } from "../audio/mixdown.js";
import { createStore, type Store } from "../core/store/createStore.js";
import type { MediaId, Project } from "../core/document/types.js";
import { AUDIO_FILE_EXTENSIONS, type AudioFileFormat } from "../export/audioExport.js";
import { EtaEstimator, formatRemaining } from "../export/eta.js";
import { clearExportTemp, EXPORTS_DIR, ExportFile, pickedFile, saveExport, type PickedFile } from "../export/exportFile.js";
import { exportNeeds } from "../export/inputs.js";
import type { AudioJobParams, AudioJobResult, ExportJobParams, ExportJobResult, ExportMediaFile, ExportProgress } from "../export/job.js";
import { pushLogEntry, type ExportKind, type ExportLogEntry, type ExportRequest } from "../export/log.js";
import { ExportPauseSync } from "../export/pauseSync.js";
import { exportPlan } from "../export/plan.js";
import {
  BUILT_IN_PRESETS,
  customFrom,
  CUSTOM_PRESET_ID,
  exportFormat,
  fillFileName,
  formatSummary,
  MAX_USER_PRESETS,
  MAX_PRESET_NAME,
  presetSlug,
  REELS_PRESET,
  withExtension,
  type ExportFormat,
  type ExportPreset,
  type ExportSettings,
} from "../export/presets.js";
import { ExportQueue, type JobOutcome, type QueueJob } from "../export/queue.js";
import { SVG_MAX_SIZE } from "../media/decode/ImageService.js";
import { isSvgImage } from "../media/mediaKinds.js";
import { svgPoster } from "../media/probe/svgProbe.js";
import { isAbortError } from "../media/workers/protocol.js";
import type { AppSettings } from "../project/appSettings.js";
import { formatBytes } from "../project/cache.js";
import { errorMessage } from "../project/errorMessage.js";
import { isDirectoryHandle, type FsDir } from "../project/fs.js";
import { subdir } from "../project/layout.js";
import { resolveFile, safeFileName, sampleIndexPath } from "../project/mediaFiles.js";
import type { ProjectSession } from "../project/ProjectSession.js";
import { slateLook } from "../render/preview/PreviewView.js";
import type { SubtitleFormat } from "../text/subtitles.js";
import { exportCues } from "../timeline/edit/captions.js";
import { markedRange, type FrameRange } from "../timeline/model/inOut.js";
import { contentEnd } from "../timeline/model/queries.js";
import { formatSubtitles } from "../text/subtitles.js";
import { dismissToast, showToast, updateToast, type ToastLive } from "../ui/toasts.js";
import { decodedAudio } from "./audioController.js";
import { closeExportTab, exportState, exportTab, openExportTab } from "./exportState.js";
import { appBaseUrl } from "../render/text/bundledFonts.js";
import { exportFontFaces } from "./fontController.js";
import { offlineReason, OFFLINE_LABEL, sourceFile } from "./mediaOffline.js";
import { renderer, renderFramePng, setTextureShare, textureBudget } from "./previewController.js";
import { currentSession, refuseReadOnly } from "./projectController.js";
import { actions, appSettings, documentStore, sessionStore, themeBridge, workerPool } from "./services.js";

/** The main texture pool's share of the budget while exporting; the worker gets the rest (spec §16). */
export const MAIN_TEXTURE_SHARE = 0.7;
const MIX_RATE = 48000;
const MIX_CHANNELS = 2;

/** A queued export: its request and what was fixed when it was queued. */
export interface ExportJobSpec {
  request: ExportRequest;
  /** The document as it was when queued (spec §16: editing goes on meanwhile). */
  project: Project;
  session: ProjectSession;
  /** The file name it gets (in exports/ a free variant of it), or the picked file's. */
  fileName: string;
  picked: { file: PickedFile; handle: FileSystemFileHandle } | null;
  range: FrameRange;
  format: ExportFormat;
  /** The format in one line. */
  summary: string;
}

interface JobDone {
  name: string;
  bytes: number;
  /** The success toast's detail after the path and size. */
  detail: string;
}

/** A job's progress on the main thread. */
interface JobRuntime {
  live: Store<ToastLive>;
  eta: EtaEstimator;
  started: boolean;
  pause: ExportPauseSync;
  done: number;
  total: number;
}

const runtimes = new Map<string, JobRuntime>();
/** Picked files of finished exports by log entry id (Open folder starts in their folder; this session only). */
const pickedHandles = new Map<string, FileSystemFileHandle>();
/** Save as preset's name field in the Export tab is open. */
export const presetNaming = createStore(false);

export const exportQueue: ExportQueue<ExportJobSpec, JobDone> = new ExportQueue<ExportJobSpec, JobDone>({ run: runJob, ended: jobEnded });

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** The progress store of a job (made when first asked for: a queued job's card shows it). */
export function jobLive(id: string): Store<ToastLive> {
  // A card that renders once more after its job ended gets a store of its own, not kept.
  return exportQueue.get(id) ? runtimeOf(id).live : createStore<ToastLive>({ progress: 1, detail: "" });
}

export function jobPaused(id: string): boolean {
  return runtimes.get(id)?.pause.paused ?? false;
}

function runtimeOf(id: string): JobRuntime {
  let runtime = runtimes.get(id);
  if (!runtime) {
    const job = exportQueue.get(id);
    const total = job ? jobTotal(job.spec) : 0;
    runtime = {
      live: createStore<ToastLive>({ progress: 0, detail: "Queued" }),
      eta: new EtaEstimator(),
      started: false,
      pause: new ExportPauseSync((paused) => void workerPool.request("pauseExport", { paused }, { priority: "user" }).catch(() => undefined)),
      done: 0,
      total,
    };
    runtimes.set(id, runtime);
  }
  return runtime;
}

/** Frames (video) or sample frames (audio) of a job. */
function jobTotal(spec: ExportJobSpec): number {
  const fps = spec.project.settings.fps;
  return spec.request.kind === "video" ? exportPlan(spec.range, fps, spec.format.fps, spec.format.keyframeSeconds, MIX_RATE).frames : exportPlan(spec.range, fps, fps, 2, MIX_RATE).samples;
}

function progressLine(job: QueueJob<ExportJobSpec>, rt: JobRuntime): string {
  const paused = rt.pause.paused;
  if (job.status === "queued") return paused ? "Paused · Queued" : "Queued";
  if (!rt.started) return paused ? "Paused · Preparing…" : "Preparing…";
  const share = rt.total > 0 ? rt.done / rt.total : 0;
  const percent = `${Math.floor(share * 100)}%`;
  const head = job.spec.request.kind === "video" ? `${percent} · ${rt.done} / ${rt.total} frames` : percent;
  if (paused) return `Paused · ${head}`;
  const left = rt.eta.remainingMs(rt.total);
  return left === null ? head : `${head} · ${formatRemaining(left)} left`;
}

function showProgress(id: string): void {
  const job = exportQueue.get(id);
  const rt = runtimes.get(id);
  if (!job || !rt) return;
  rt.live.set({ progress: rt.total > 0 ? rt.done / rt.total : 0, detail: progressLine(job, rt) });
}

// The running job's pinned toast while the Export tab is not shown.
let progressToast: { id: number; job: string; paused: boolean; queued: number } | null = null;

function syncProgressToast(): void {
  const job = exportQueue.running;
  const queued = exportQueue.jobs.getState().length - 1;
  const show = job !== null && !exportTab.getState().active;
  if (progressToast && (!show || progressToast.job !== job?.id)) {
    dismissToast(progressToast.id);
    progressToast = null;
  }
  if (!show || !job) return;
  const rt = runtimeOf(job.id);
  const message = `Exporting ${job.spec.fileName}${queued > 0 ? ` (+${queued} queued)` : ""}`;
  const pause = { label: rt.pause.paused ? "Resume" : "Pause", run: () => togglePauseJob(job.id) };
  if (!progressToast) {
    const id = showToast({ tone: "info", message, live: rt.live, pinned: true, secondaryAction: pause, action: { label: "Cancel", run: () => cancelJob(job.id) } });
    progressToast = { id, job: job.id, paused: rt.pause.paused, queued };
  } else if (progressToast.paused !== rt.pause.paused || progressToast.queued !== queued) {
    updateToast(progressToast.id, { message, secondaryAction: pause });
    progressToast = { ...progressToast, paused: rt.pause.paused, queued };
  }
}

/** What the worker needs besides the document, gathered on the main thread. */
async function gatherInputs(dir: FsDir, project: Project, range: FrameRange, signal: AbortSignal): Promise<Pick<ExportJobParams, "media" | "svg" | "fonts" | "fontBaseUrl" | "offline" | "audio">> {
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
    const fonts = await exportFontFaces(exportNeeds(project, range).texts.map((text) => text.style));
    return { media, svg, offline, fonts, fontBaseUrl: appBaseUrl(), audio: await mixdown(project, range, signal) };
  } catch (error) {
    for (const bitmap of Object.values(svg)) bitmap.close();
    throw error;
  }
}

/** The stereo mixdown of the range (the master volume is monitoring only, spec §14: never in it). */
async function mixdown(project: Project, range: FrameRange, signal: AbortSignal): Promise<{ sampleRate: number; channels: ArrayBuffer[] } | null> {
  const mix = await renderMixdown(project, range, { sampleRate: MIX_RATE, channels: MIX_CHANNELS, signal }, { audio: decodedAudio, createContext: (init) => new OfflineAudioContext(init) });
  return mix ? { sampleRate: mix.sampleRate, channels: mix.channels.map((plane) => plane.buffer) } : null;
}

async function runJob(job: QueueJob<ExportJobSpec>, signal: AbortSignal, fail: (reason: unknown) => void): Promise<JobDone> {
  const { spec } = job;
  const rt = runtimeOf(job.id);
  exportState.set({ running: true, paused: rt.pause.paused });
  if (spec.request.kind === "video") setTextureShare(MAIN_TEXTURE_SHARE);
  showProgress(job.id);
  syncProgressToast();
  const ext = spec.request.kind === "video" ? "mp4" : AUDIO_FILE_EXTENSIONS[spec.request.audioFormat];
  let output: ExportFile | null = null;
  const onProgress = (value: ExportProgress) => {
    if (value.kind === "bytes") {
      output?.write(new Uint8Array(value.data), value.position);
      return;
    }
    if (value.kind === "started") rt.started = true;
    else {
      rt.done = value.done;
      rt.total = value.total;
      rt.eta.update(value.done, performance.now());
    }
    showProgress(job.id);
  };
  try {
    const { dir } = spec.session;
    if (spec.request.kind === "video") {
      const inputs = await gatherInputs(dir, spec.project, spec.range, signal);
      signal.throwIfAborted();
      output = spec.picked ? await ExportFile.toPicked(spec.picked.file, fail) : await ExportFile.create(dir, crypto.randomUUID(), fail, ext);
      // Read right before the post (no await in between): a Pause from now on is sent after the job.
      const params: ExportJobParams = { project: spec.project, range: spec.range, format: spec.format, slate: slateLook(themeBridge.theme), textureBudget: Math.round(textureBudget() * (1 - MAIN_TEXTURE_SHARE)), renderer: renderer.backend ?? "webgpu", ...inputs, paused: rt.pause.post() };
      const transfer: Transferable[] = [...Object.values(inputs.svg), ...(inputs.audio?.channels ?? []), ...inputs.fonts.flatMap((face) => (face.data ? [face.data] : []))];
      const result: ExportJobResult = await workerPool.request("exportVideo", params, { priority: "user", signal, transfer, onProgress });
      const name = await output.finish(spec.fileName);
      const bytes = output.bytes;
      output = null;
      console.info(`[export] ${name}: ${result.frames} frames ${result.width}x${result.height} ${result.videoCodec} / ${result.audioCodec ?? "no audio"} in ${Math.round(result.ms)} ms, ${bytes} bytes`);
      return { name, bytes, detail: `${result.width}×${result.height} · ${plural(result.frames, "frame")}` };
    }
    const audio = await mixdown(spec.project, spec.range, signal);
    signal.throwIfAborted();
    output = spec.picked ? await ExportFile.toPicked(spec.picked.file, fail) : await ExportFile.create(dir, crypto.randomUUID(), fail, ext);
    const samples = jobTotal(spec);
    const params: AudioJobParams = { format: spec.request.audioFormat, audio, sampleRate: MIX_RATE, channels: MIX_CHANNELS, samples, audioBitrate: spec.format.audioBitrate, paused: rt.pause.post() };
    const result: AudioJobResult = await workerPool.request("exportAudio", params, { priority: "user", signal, transfer: audio?.channels ?? [], onProgress });
    const name = await output.finish(spec.fileName);
    const bytes = output.bytes;
    output = null;
    console.info(`[export] ${name}: ${result.samples} samples ${result.codec} in ${Math.round(result.ms)} ms, ${bytes} bytes`);
    return { name, bytes, detail: audioDuration(samples) };
  } catch (error) {
    await output?.discard();
    throw error;
  } finally {
    // A fresh worker per job: the device, decoders and textures of this one go at once (P13).
    workerPool.stop("export");
  }
}

function audioDuration(samples: number): string {
  return formatRemaining((samples * 1000) / MIX_RATE);
}

/** Where a finished file is shown in the toasts and the log. */
function shownPath(spec: ExportJobSpec, name: string): string {
  return spec.picked ? name : `${EXPORTS_DIR}/${name}`;
}

function jobEnded(job: QueueJob<ExportJobSpec>, outcome: JobOutcome<JobDone>): void {
  const { spec } = job;
  const rt = runtimes.get(job.id);
  runtimes.delete(job.id);
  if (exportQueue.jobs.getState().length === 0) {
    exportState.set({ running: false, paused: false });
    setTextureShare(1);
  }
  syncProgressToast();
  // The project closed meanwhile (its jobs were cancelled): nothing to log or say in another one.
  if (currentSession() !== spec.session) return;
  const done = outcome.status === "done" ? outcome.result : null;
  const entry: ExportLogEntry = {
    id: crypto.randomUUID(),
    name: done?.name ?? spec.fileName,
    status: outcome.status,
    ...(outcome.status === "failed" && { error: errorMessage(outcome.error) }),
    at: Date.now(),
    bytes: done?.bytes ?? 0,
    summary: spec.summary,
    request: spec.request,
  };
  sessionStore.state.set((state) => ({ ...state, exportLog: pushLogEntry(state.exportLog, entry) }));
  if (done) {
    if (spec.picked) pickedHandles.set(entry.id, spec.picked.handle);
    const toast = showToast(
      {
        tone: "success",
        message: `Exported ${done.name}`,
        detail: `${shownPath(spec, done.name)} · ${formatBytes(done.bytes)} · ${done.detail}`,
        secondaryAction: { label: "Open folder", run: () => void openFolder(entry.id) },
        action: {
          label: "Export again",
          run: () => {
            dismissToast(toast);
            void exportAgain(entry.id);
          },
        },
      },
      { durationMs: 8000 },
    );
  } else if (outcome.status === "cancelled") {
    // A job cancelled while queued never wrote anything: its card going away says enough.
    if (rt?.started || job.status === "running") showToast({ tone: "info", message: "Export cancelled", detail: spec.picked ? "The picked file was left as it was." : "Nothing was written to exports/." });
  } else if (outcome.status === "failed") {
    console.error("[export] failed", outcome.error);
    showToast({ tone: "error", message: "Export failed", detail: errorMessage(outcome.error) });
  }
}

// The Export tab's choices (app settings) and the requests they make.

const CUSTOM_DESCRIPTION = "Custom: your own codec, size, frame rate and bitrates";

/** The preset the tab has chosen (Custom with its settings, one's own, or a built-in; Reels when it is gone). */
export function chosenPreset(settings: AppSettings = appSettings.getState()): ExportPreset {
  if (settings.exportPresetId === CUSTOM_PRESET_ID) return { id: CUSTOM_PRESET_ID, name: "Custom", description: CUSTOM_DESCRIPTION, settings: settings.exportCustom };
  return BUILT_IN_PRESETS.find((p) => p.id === settings.exportPresetId) ?? settings.exportPresets.find((p) => p.id === settings.exportPresetId) ?? REELS_PRESET;
}

export const isBuiltIn = (id: string): boolean => BUILT_IN_PRESETS.some((p) => p.id === id);

/** The settings the tab's fields show: a built-in preset's as Custom would hold them for this project. */
export function editableSettings(settings: AppSettings = appSettings.getState(), project: Project = documentStore.getState()): ExportSettings {
  const preset = chosenPreset(settings);
  return isBuiltIn(preset.id) ? customFrom(preset.settings, project) : preset.settings;
}

/** A setting changed in the tab: one's own preset and Custom change in place; a built-in one becomes Custom with its values. */
export function changeExportSettings(patch: Partial<ExportSettings>): void {
  const settings = appSettings.getState();
  const preset = chosenPreset(settings);
  const next = { ...editableSettings(settings), ...patch };
  if (preset.id !== CUSTOM_PRESET_ID && !isBuiltIn(preset.id)) {
    void appSettings.update({ exportPresets: settings.exportPresets.map((p) => (p.id === preset.id ? { ...p, settings: next } : p)) });
    return;
  }
  void appSettings.update({ exportPresetId: CUSTOM_PRESET_ID, exportCustom: next });
}

export function chooseExportPreset(id: string): void {
  if (appSettings.getState().exportPresetId !== id) void appSettings.update({ exportPresetId: id });
}

/** Saves the tab's settings as one's own preset (chosen at once); false when the name is empty or the list is full. */
export function saveExportPreset(name: string): boolean {
  const settings = appSettings.getState();
  const trimmed = name.trim().slice(0, MAX_PRESET_NAME);
  if (trimmed === "") return false;
  if (settings.exportPresets.length >= MAX_USER_PRESETS) {
    showToast({ tone: "warning", message: "Too many export presets", detail: `Delete one of your ${MAX_USER_PRESETS} presets first.` });
    return false;
  }
  const preset: ExportPreset = { id: crypto.randomUUID(), name: trimmed, description: trimmed, settings: editableSettings(settings) };
  void appSettings.update({ exportPresets: [...settings.exportPresets, preset], exportPresetId: preset.id });
  presetNaming.set(false);
  return true;
}

/** Deletes one's own preset (the chosen one by default); Custom takes its settings when it was chosen. */
export function deleteExportPreset(id?: string): void {
  const settings = appSettings.getState();
  const target = settings.exportPresets.find((p) => p.id === (id ?? settings.exportPresetId));
  if (!target) return;
  const chosen = settings.exportPresetId === target.id;
  void appSettings.update({ exportPresets: settings.exportPresets.filter((p) => p.id !== target.id), ...(chosen && { exportPresetId: CUSTOM_PRESET_ID, exportCustom: target.settings }) });
}

/** The in/out range when the tab exports it and one is marked, else null (the whole timeline). */
export function exportRange(project: Project = documentStore.getState()): FrameRange | null {
  const state = sessionStore.state.getState();
  return state.exportRange === "inOut" ? markedRange(state, contentEnd(project)) : null;
}

/** What the tab's Export (or Export audio) asks for now. */
export function currentRequest(kind: ExportKind): ExportRequest {
  const settings = appSettings.getState();
  const preset = chosenPreset(settings);
  return {
    kind,
    presetId: preset.id,
    presetName: preset.name,
    settings: preset.settings,
    audioFormat: settings.exportAudioFormat,
    range: exportRange(),
    template: settings.exportFileTemplate,
    destination: settings.exportDestination,
  };
}

/** "WAV · 16-bit · 48 kHz stereo" / "M4A · AAC 192 kbps · 48 kHz stereo". */
export function audioSummary(format: AudioFileFormat, audioBitrate: number): string {
  return format === "wav" ? "WAV · 16-bit · 48 kHz stereo" : `M4A · AAC ${Math.round(audioBitrate / 1000)} kbps · 48 kHz stereo`;
}

/** The file name a request gives (template filled, invalid characters replaced, the extension set). */
export function requestFileName(request: Pick<ExportRequest, "template" | "presetId" | "presetName">, project: Project, ext: string, date = new Date()): string {
  return safeFileName(withExtension(fillFileName(request.template, { project: project.name, preset: presetSlug({ id: request.presetId, name: request.presetName }), date }), ext));
}

const PICKER_TYPES: Record<string, { description: string; accept: Record<string, string[]> }> = {
  mp4: { description: "MP4 video", accept: { "video/mp4": [".mp4"] } },
  m4a: { description: "M4A audio", accept: { "audio/mp4": [".m4a"] } },
  wav: { description: "WAV audio", accept: { "audio/wav": [".wav"] } },
  png: { description: "PNG image", accept: { "image/png": [".png"] } },
  srt: { description: "SubRip subtitles", accept: { "application/x-subrip": [".srt"] } },
  vtt: { description: "WebVTT subtitles", accept: { "text/vtt": [".vtt"] } },
};

interface SaveFilePickerWindow {
  showSaveFilePicker?(options: { suggestedName: string; id?: string; types: { description: string; accept: Record<string, string[]> }[] }): Promise<FileSystemFileHandle>;
}

/** The save picker for `name` (call it first in a click: it needs the user's gesture); null when cancelled. */
async function pickDestination(name: string, ext: string): Promise<{ file: PickedFile; handle: FileSystemFileHandle } | null> {
  const picker = (window as unknown as SaveFilePickerWindow).showSaveFilePicker;
  if (!picker) {
    showToast({ tone: "error", message: "This browser can't pick a file", detail: "Choose the exports folder as the destination." });
    return null;
  }
  try {
    const handle = await picker.call(window, { suggestedName: name, id: "shorts-editor-export", types: [PICKER_TYPES[ext] ?? { description: "File", accept: {} }] });
    return { file: pickedFile(handle), handle };
  } catch (error) {
    if (!isAbortError(error)) showToast({ tone: "error", message: "Can't save there", detail: errorMessage(error) });
    return null;
  }
}

/** Queues an export of `request` on the current document; resolves with the job id, or null when nothing was queued. */
export async function enqueueExport(request: ExportRequest): Promise<string | null> {
  const session = currentSession();
  if (!session) return null;
  if (session.readOnly && request.destination === "project") {
    refuseReadOnly("export into the project's folder");
    return null;
  }
  const project = documentStore.getState();
  const range = request.range ?? { start: 0, end: contentEnd(project) };
  if (range.end <= range.start) {
    showToast({ tone: "info", message: "Nothing to export", detail: "Add clips to the timeline first." });
    return null;
  }
  const ext = request.kind === "video" ? "mp4" : AUDIO_FILE_EXTENSIONS[request.audioFormat];
  const fileName = requestFileName(request, project, ext);
  const picked = request.destination === "pick" ? await pickDestination(fileName, ext) : null;
  if (request.destination === "pick" && !picked) return null;
  const format = exportFormat(project, request.settings);
  const summary = request.kind === "video" ? formatSummary(format) : audioSummary(request.audioFormat, format.audioBitrate);
  const id = exportQueue.add({ request, project, session, fileName: picked ? picked.handle.name : fileName, picked, range, format, summary });
  syncProgressToast();
  return id;
}

/** Runs a log entry's request again (the newest entry by default) on the current document. */
export function exportAgain(entryId?: string): Promise<string | null> {
  const log = sessionStore.state.getState().exportLog;
  const entry = entryId ? log.find((e) => e.id === entryId) : log[0];
  return entry ? enqueueExport(entry.request) : Promise.resolve(null);
}

/** Pauses or resumes a job (the running one by default); a queued job starts in that state. */
export function togglePauseJob(id?: string): void {
  const job = id ? exportQueue.get(id) : exportQueue.running;
  if (!job) return;
  const rt = runtimeOf(job.id);
  const paused = rt.pause.toggle();
  const now = performance.now();
  if (paused) rt.eta.pause(now);
  else rt.eta.resume(now);
  if (job.status === "running") exportState.set({ running: true, paused });
  showProgress(job.id);
  syncProgressToast();
  // The cards read the pause state when the queue's list renders.
  exportQueue.jobs.set((jobs) => [...jobs]);
}

/** Cancels a job (the running one by default): a queued one leaves the queue, the running one stops and its file is deleted. */
export function cancelJob(id?: string): void {
  const job = id ? exportQueue.get(id) : exportQueue.running;
  if (job) exportQueue.cancel(job.id);
}

/** Cancels every export (the project closes). */
export function cancelExport(): void {
  exportQueue.cancelAll();
}

/** Pauses or resumes the running export. */
export function togglePauseExport(): void {
  togglePauseJob();
}

/** Deletes the temp files of exports a closed tab interrupted (a project that opened, writable). */
export function clearExportLeftovers(dir: FsDir): Promise<void> {
  return clearExportTemp(dir);
}

// Extras.

/** Where an extra goes: exports/ (refused in a read-only project) or a picked file; null when cancelled or refused. */
async function extraDestination(name: string, ext: string): Promise<{ target: { root: FsDir } | { picked: PickedFile }; handle: FileSystemFileHandle | null; session: ProjectSession } | null> {
  const session = currentSession();
  if (!session) return null;
  if (appSettings.getState().exportDestination === "pick") {
    const picked = await pickDestination(name, ext);
    return picked ? { target: { picked: picked.file }, handle: picked.handle, session } : null;
  }
  if (session.readOnly) {
    refuseReadOnly("export into the project's folder");
    return null;
  }
  return { target: { root: session.dir }, handle: null, session };
}

/** A saved extra's toast (Open folder starts in its folder). */
function savedToast(name: string, picked: boolean, detail: string, handle: FileSystemFileHandle | null): void {
  const id = crypto.randomUUID();
  if (handle) pickedHandles.set(id, handle);
  showToast({ tone: "success", message: `Saved ${name}`, detail: `${picked ? name : `${EXPORTS_DIR}/${name}`} · ${detail}`, secondaryAction: { label: "Open folder", run: () => void openFolder(handle ? id : undefined) } });
}

/** Export frame (spec §16): the composite at the playhead at project size as a PNG (no overlays). */
export async function exportFrameNow(): Promise<string | null> {
  const project = documentStore.getState();
  const frame = sessionStore.state.getState().playhead;
  const name = safeFileName(`${project.name}-frame-${frame}.png`);
  const destination = await extraDestination(name, "png");
  if (!destination) return null;
  try {
    const png = await renderFramePng();
    const saved = await saveExport(destination.target, name, png.blob);
    savedToast(saved, "picked" in destination.target, `${png.width}×${png.height} PNG · ${formatBytes(png.blob.size)}`, destination.handle);
    return saved;
  } catch (error) {
    console.error("[export] export frame failed", error);
    showToast({ tone: "error", message: "Can't export the frame", detail: errorMessage(error) });
    return null;
  }
}

/** Copy frame (spec §16): the same PNG on the clipboard. */
export async function copyFrame(): Promise<boolean> {
  try {
    const png = renderFramePng();
    // A promise keeps the click's user activation while the frame renders.
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png.then((p) => p.blob) })]);
    const { width, height } = await png;
    showToast({ tone: "success", message: "Copied the frame", detail: `${width}×${height} PNG on the clipboard.` });
    return true;
  } catch (error) {
    console.error("[export] copy frame failed", error);
    showToast({ tone: "error", message: "Can't copy the frame", detail: errorMessage(error) });
    return false;
  }
}

/** Export captions (spec §16): the cues of the range (the tab's) as SRT or VTT. */
export async function exportCaptions(format: SubtitleFormat = appSettings.getState().exportCaptionFormat): Promise<string | null> {
  const project = documentStore.getState();
  const range = exportRange(project) ?? undefined;
  const cues = exportCues(project, range);
  if (cues.length === 0) {
    showToast({ tone: "info", message: "No captions to export", detail: range ? "No cue is in the in/out range." : "Add cues in the Captions tab first." });
    return null;
  }
  const name = requestFileName(currentRequest("video"), project, format);
  const destination = await extraDestination(name, format);
  if (!destination) return null;
  try {
    const saved = await saveExport(destination.target, name, new Blob([formatSubtitles(cues, format)], { type: "text/plain" }));
    savedToast(saved, "picked" in destination.target, `${plural(cues.length, "cue")}`, destination.handle);
    return saved;
  } catch (error) {
    showToast({ tone: "error", message: "Couldn't export the captions", detail: errorMessage(error) });
    return null;
  }
}

interface OpenFilePickerWindow {
  showOpenFilePicker?(options: { startIn?: FileSystemHandle; id?: string }): Promise<FileSystemFileHandle[]>;
}

/**
 * Open folder (spec §16 after export): browsers cannot open a file manager, so the system's file dialog
 * opens in the folder that holds the file (exports/, or the picked file's); a file chosen there opens
 * in a new tab. Where that is not possible (a folder in the browser's own storage), a toast names it.
 */
export async function openFolder(entryId?: string): Promise<void> {
  const session = currentSession();
  if (!session) return;
  const handle = entryId ? pickedHandles.get(entryId) : undefined;
  const picker = (window as unknown as OpenFilePickerWindow).showOpenFilePicker;
  try {
    const startIn: FileSystemHandle | null = handle ?? (session.readOnly ? null : ((await subdir(session.dir, EXPORTS_DIR)).handle as FileSystemHandle | null));
    if (!picker || !startIn || !(handle || isDirectoryHandle(startIn))) throw new Error("no folder to open");
    const [chosen] = await picker.call(window, { startIn, id: "shorts-editor-exports" });
    if (!chosen) return;
    const url = URL.createObjectURL(await chosen.getFile());
    if (!window.open(url, "_blank")) showToast({ tone: "warning", message: "Pop-up blocked", detail: "Allow pop-ups for this site to open exported files." });
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    if (isAbortError(error)) return;
    showToast({ tone: "info", message: "Exports folder", detail: handle ? `The file is ${handle.name}, where you saved it.` : `${EXPORTS_DIR}/ in the project folder ${session.dir.name}.` });
  }
}

/** Registers the export commands. Returns a stop function. */
export function installExportController(): () => void {
  const isRunning = () => exportQueue.running !== null;
  const hasLog = () => sessionStore.state.getState().exportLog.length > 0;
  const ownPreset = () => appSettings.getState().exportPresets.some((p) => p.id === appSettings.getState().exportPresetId);
  const stops = [
    actions.register("app.export", openExportTab),
    actions.register("export.close", () => void closeExportTab(), { enabled: () => exportTab.getState().open }),
    actions.register("export.start", () => void enqueueExport(currentRequest("video"))),
    actions.register("export.audio", () => void enqueueExport(currentRequest("audio"))),
    actions.register("export.captions", () => void exportCaptions()),
    actions.register("preview.exportFrame", () => void exportFrameNow()),
    actions.register("export.copyFrame", () => void copyFrame()),
    actions.register("export.again", (_context, arg) => void exportAgain(arg), { enabled: hasLog }),
    actions.register("export.openFolder", (_context, arg) => void openFolder(arg)),
    actions.register("export.savePreset", () => {
      // Naming first: the tab's focus goes to the name field (ExportTab), not to its Export button.
      presetNaming.set(true);
      if (!exportTab.getState().active) openExportTab();
    }),
    actions.register("export.deletePreset", (_context, arg) => deleteExportPreset(arg), { enabled: ownPreset }),
    actions.register("export.cancel", (_context, arg) => cancelJob(arg), { enabled: isRunning }),
    actions.register("export.pauseResume", (_context, arg) => togglePauseJob(arg), { enabled: isRunning }),
    // The pinned toast stands in for the cards while the tab is not shown.
    exportTab.subscribe(syncProgressToast),
    exportQueue.jobs.subscribe(syncProgressToast),
  ];
  if (import.meta.env.DEV) {
    // Console access for the acceptance checks.
    const editor = ((globalThis as { __editor?: Record<string, unknown> }).__editor ??= {});
    editor.export = {
      start: (request?: Partial<ExportRequest>) => enqueueExport({ ...currentRequest("video"), ...request }),
      enqueue: enqueueExport,
      request: currentRequest,
      cancel: cancelJob,
      cancelAll: cancelExport,
      togglePause: togglePauseJob,
      queue: exportQueue,
      state: exportState,
      tab: exportTab,
      frame: exportFrameNow,
      copyFrame,
      captions: exportCaptions,
      again: exportAgain,
      live: jobLive,
      get job() {
        const job = exportQueue.running;
        return job ? { ...job, ...runtimes.get(job.id) } : null;
      },
    };
  }
  return () => {
    for (const stop of stops) stop();
  };
}
