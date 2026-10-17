// Transcription in the app (spec §10.6): the Captions header's Transcribe opens the Transcribe dialog
// (model with its download size and cache status, language, range). Start mixes the range's audio
// offline (audio/mixdown.ts: the playback scheduler on an OfflineAudioContext, 48 kHz mono), hands it
// to transcribe.worker and shows the phases in a progress toast with Cancel. The words become cues
// (text/transcript.ts: the caption track's max lines, ~32 characters per line), shown in the review
// dialog, which adds them, replacing the cues of the range, in one undo step "Transcribe captions",
// or discards them.
// - Cancel at any point leaves the project unchanged: nothing is dispatched before the review is
//   confirmed, and the worker is terminated (its model's memory freed at once).
// - Range: the in/out range when one is set (the dialog can switch to the whole timeline), else the
//   whole timeline (frame 0 to the content end).
// - The worker is stopped after each run and when the dialog closes (P13); the library and the model
//   load again from the browser's cache next time.
// - The toast's progress is not updated while playback runs (no React commits while playing, P1): it
//   catches up when playback stops. Phase changes always show.
// - Dev builds: `__editor.transcribe` for the acceptance checks.
import { renderMixdown } from "../audio/mixdown.js";
import { transcribeDialog, transcribeRange, transcription, type TranscribeOptions } from "./transcription.js";
import { frameToUs } from "../core/document/time.js";
import { selectClips, toSnapshot } from "../core/store/selection.js";
import { languageName } from "../media/transcribe/languages.js";
import { whisperModel, type TranscribeDevice, type WhisperModelId } from "../media/transcribe/models.js";
import { isAbortError, type TranscribeProgress } from "../media/workers/protocol.js";
import { errorMessage } from "../project/errorMessage.js";
import { defaultCaptionStyle } from "../text/captions.js";
import { cuesFromWords } from "../text/transcript.js";
import { captionStyleOf, captionTrackOf, cuesInRange, replaceCuesInRange, transcribedCues } from "../timeline/edit/captions.js";
import { dismissToast, showToast, updateToast } from "../ui/toasts.js";
import { decodedAudio } from "./audioController.js";
import { showCaptionsTab } from "./captionController.js";
import { playbackEngine } from "./previewController.js";
import { actions, appSettings, documentStore, sessionStore, workerPool } from "./services.js";

/** The mix's rate: the project audio rate (spec §14); the worker resamples it to 16 kHz. */
const MIX_RATE = 48_000;
const MB = 1e6;
/** Progress toasts change at most this often (and only by a whole percent). */
const TOAST_EVERY_MS = 250;

const newId = () => crypto.randomUUID();

function lockedToast(): void {
  showToast({ tone: "error", message: "The caption track is locked", detail: "Unlock CC to add transcribed captions." });
}

// --- The dialog ---------------------------------------------------------------------------------

async function refreshStatus(): Promise<void> {
  try {
    const status = await workerPool.request("transcribeStatus", {}, { priority: "user" });
    transcribeDialog.set((state) => (state ? { ...state, status, error: null } : state));
  } catch (error) {
    if (!isAbortError(error)) transcribeDialog.set((state) => (state ? { ...state, error: errorMessage(error) } : state));
  }
}

/** The Captions header's Transcribe: opens the dialog; while a transcription runs it cancels it. */
export function openTranscribeDialog(): void {
  const state = transcription.getState();
  if (state.kind === "running") {
    cancelTranscription();
    return;
  }
  if (state.kind === "review" || transcribeDialog.getState()) return;
  transcribeDialog.set({ status: null, error: null, removing: null });
  void refreshStatus();
}

export function closeTranscribeDialog(): void {
  if (!transcribeDialog.getState()) return;
  transcribeDialog.set(null);
  if (transcription.getState().kind !== "running") workerPool.stop("transcribe");
}

/** Deletes a downloaded model from the browser's cache (the dialog's Remove). */
export async function removeModel(model: WhisperModelId): Promise<void> {
  transcribeDialog.set((state) => (state ? { ...state, removing: model } : state));
  try {
    await workerPool.request("transcribeRemove", { model }, { priority: "user" });
    showToast({ tone: "success", message: `Removed Whisper ${whisperModel(model).label}`, detail: "Its files were deleted from this browser." });
  } catch (error) {
    if (!isAbortError(error)) showToast({ tone: "error", message: "Couldn't remove the model", detail: errorMessage(error) });
  }
  transcribeDialog.set((state) => (state ? { ...state, removing: null } : state));
  await refreshStatus();
}

// --- The run ------------------------------------------------------------------------------------

interface Run {
  controller: AbortController;
  toast: number;
}

let run: Run | null = null;

/** The progress toast's text for a phase. */
function progressText(model: WhisperModelId, progress: TranscribeProgress | { phase: "mix"; fraction: number }, device: TranscribeDevice | null): { message: string; detail: string } {
  const name = `Whisper ${whisperModel(model).label}`;
  switch (progress.phase) {
    case "mix":
      return { message: "Preparing the audio", detail: "Mixing the timeline's audio of the range." };
    case "download": {
      const loaded = "loaded" in progress && progress.loaded !== undefined ? Math.round(progress.loaded / MB) : 0;
      const total = "total" in progress && progress.total !== undefined ? Math.round(progress.total / MB) : whisperModel(model).sizeMb[device ?? "webgpu"];
      return { message: `Downloading ${name}`, detail: `${loaded} of ${total} MB. Only this once: the model stays in this browser.` };
    }
    case "load":
      return { message: `Loading ${name}`, detail: "From this browser's cache." };
    case "detect":
      return { message: "Detecting the language", detail: `${name}, on this computer.` };
    case "transcribe": {
      const language = "language" in progress && progress.language ? languageName(progress.language) : "";
      return { message: `Transcribing · ${Math.floor(progress.fraction * 100)}%`, detail: [language, `${name}, on this computer`].filter((part) => part !== "").join(" · ") };
    }
  }
}

/** Updates the run's toast: phase changes at once, progress at most every TOAST_EVERY_MS and never while playing. */
function toastUpdater(toast: number, model: WhisperModelId, device: () => TranscribeDevice | null) {
  let shown = { phase: "", percent: -1, at: 0 };
  let pending: (TranscribeProgress | { phase: "mix"; fraction: number }) | null = null;
  const show = (progress: TranscribeProgress | { phase: "mix"; fraction: number }) => {
    const percent = Math.floor(progress.fraction * 100);
    shown = { phase: progress.phase, percent, at: performance.now() };
    pending = null;
    updateToast(toast, { ...progressText(model, progress, device()), progress: progress.fraction });
  };
  const stopFlush = playbackEngine.subscribe(() => {
    if (!playbackEngine.playing && pending) show(pending);
  });
  return {
    update(progress: TranscribeProgress | { phase: "mix"; fraction: number }) {
      transcription.set((state) => (state.kind === "running" ? { ...state, phase: progress.phase, fraction: progress.fraction } : state));
      if (progress.phase !== shown.phase) show(progress);
      else if (Math.floor(progress.fraction * 100) !== shown.percent) {
        pending = progress;
        if (!playbackEngine.playing && performance.now() - shown.at >= TOAST_EVERY_MS) show(progress);
      }
    },
    stop: stopFlush,
  };
}

/** Starts a transcription (the dialog's Transcribe). Resolves when it ends (review, error or cancel). */
export async function startTranscription(options: TranscribeOptions): Promise<void> {
  if (run) return;
  const project = documentStore.getState();
  const range = transcribeRange(project, sessionStore.state.getState(), options.range);
  transcribeDialog.set(null);
  void appSettings.update({ transcribeModel: options.model, transcribeLanguage: options.language });
  if (captionTrackOf(project)?.locked) {
    lockedToast();
    return;
  }
  if (!range) {
    showToast({ tone: "info", message: "Nothing to transcribe", detail: "The timeline is empty." });
    return;
  }
  const controller = new AbortController();
  const { signal } = controller;
  const toast = showToast({ tone: "info", ...progressText(options.model, { phase: "mix", fraction: 0 }, null), progress: 0, action: { label: "Cancel", run: cancelTranscription } });
  const current: Run = { controller, toast };
  run = current;
  transcription.set({ kind: "running", phase: "mix", fraction: 0, model: options.model });
  let device: TranscribeDevice | null = null;
  const toastProgress = toastUpdater(toast, options.model, () => device);
  try {
    const mix = await renderMixdown(project, range, { sampleRate: MIX_RATE, channels: 1, signal }, { audio: decodedAudio, createContext: (init) => new OfflineAudioContext(init) });
    const pcm = mix?.channels[0];
    if (!mix || !pcm) {
      finish(current);
      showToast({ tone: "info", message: "No audio to transcribe", detail: "No audio clip is heard in the range (muted tracks are left out)." });
      return;
    }
    const status = await workerPool.request("transcribeStatus", {}, { priority: "user", signal });
    device = status.device;
    const result = await workerPool.request(
      "transcribe",
      { model: options.model, audio: pcm.buffer, sampleRate: mix.sampleRate, language: options.language },
      { priority: "user", signal, transfer: [pcm.buffer], onProgress: (progress) => toastProgress.update(progress) },
    );
    if (run !== current) return;
    finish(current);
    // The project was closed or switched meanwhile: the words belong to another timeline.
    const now = documentStore.getState();
    if (now.id !== project.id) return;
    const track = captionTrackOf(now);
    const maxLines = (track ? captionStyleOf(now, track.id) : defaultCaptionStyle(now.settings)).maxLines;
    const durationUs = frameToUs(range.end, now.settings.fps) - frameToUs(range.start, now.settings.fps);
    const cues = transcribedCues(cuesFromWords(result.words, { maxLines, durationUs }), range, now.settings.fps);
    if (cues.length === 0) {
      showToast({ tone: "info", message: "No speech found", detail: `Whisper ${whisperModel(options.model).label} heard no words in the range.` });
      return;
    }
    transcription.set({
      kind: "review",
      review: { projectId: project.id, range, cues, language: result.language, model: options.model, device: result.device, words: result.words.length, replaced: cuesInRange(now, range).length },
    });
  } catch (error) {
    if (run !== current) return;
    finish(current);
    if (isAbortError(error)) return;
    const offline = error instanceof TypeError && /fetch/i.test(error.message);
    showToast({
      tone: "error",
      message: "Couldn't transcribe",
      detail: offline ? "The model could not be downloaded. Check the connection and try again." : errorMessage(error),
    });
  } finally {
    toastProgress.stop();
  }
}

/** Ends a run: its toast goes, the worker stops (the model's memory is freed), the state is idle. */
function finish(current: Run): void {
  if (run !== current) return;
  run = null;
  dismissToast(current.toast);
  workerPool.stop("transcribe");
  transcription.set({ kind: "idle" });
}

/** Cancel (the toast's, or Transcribe again while running): the project stays as it was. */
export function cancelTranscription(): void {
  const current = run;
  if (current) {
    current.controller.abort();
    finish(current);
    showToast({ tone: "info", message: "Transcription cancelled", detail: "The captions were not changed." });
    return;
  }
  if (transcription.getState().kind === "review") discardTranscript();
}

/** The review's confirmation: the cues go in, replacing the cues of the range, in one undo step. */
export function applyTranscript(): boolean {
  const state = transcription.getState();
  if (state.kind !== "review") return false;
  const { review } = state;
  transcription.set({ kind: "idle" });
  const project = documentStore.getState();
  if (project.id !== review.projectId) return false;
  const result = replaceCuesInRange(project, review.range, review.cues, newId);
  if (!result) {
    lockedToast();
    return false;
  }
  documentStore.dispatch(result.command, { selection: toSnapshot(selectClips([])) });
  showCaptionsTab();
  showToast({
    tone: "success",
    message: `Added ${result.count} caption${result.count === 1 ? "" : "s"}`,
    detail: [result.replaced > 0 ? `Replaced ${result.replaced}.` : "", `${languageName(review.language)}, Whisper ${whisperModel(review.model).label}. Undo removes them.`].filter((part) => part !== "").join(" "),
  });
  return true;
}

/** The review's Discard: nothing changes. */
export function discardTranscript(): void {
  if (transcription.getState().kind === "review") transcription.set({ kind: "idle" });
}

/** Registers `captions.transcribe`. Returns a stop function (a run in progress is cancelled). */
export function installTranscribeController(): () => void {
  const stops = [actions.register("captions.transcribe", openTranscribeDialog)];
  // A project switch ends a run or a review of the previous project.
  let projectId = documentStore.getState().id;
  stops.push(
    documentStore.subscribe((project) => {
      if (project.id === projectId) return;
      projectId = project.id;
      if (run) {
        run.controller.abort();
        finish(run);
      }
      discardTranscript();
      closeTranscribeDialog();
    }),
  );
  if (import.meta.env.DEV) {
    const editor = ((globalThis as { __editor?: Record<string, unknown> }).__editor ??= {});
    editor.transcribe = {
      open: openTranscribeDialog,
      start: startTranscription,
      cancel: cancelTranscription,
      apply: applyTranscript,
      discard: discardTranscript,
      state: () => transcription.getState(),
      dialog: () => transcribeDialog.getState(),
    };
  }
  return () => {
    for (const stop of stops) stop();
    if (run) {
      run.controller.abort();
      finish(run);
    }
    transcription.set({ kind: "idle" });
    transcribeDialog.set(null);
  };
}
