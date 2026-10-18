// Remove silence (spec §14, §11 quick row; Batch 38). The quick row's Remove silence opens a parameter row
// (threshold, minimum silence, padding) under the quick actions. While it is open:
// - the selection's audio (`silenceTargets`: the selected audio clips and the audio linked to selected
//   video clips) is analysed in analysis.worker from its peaks, one request per media (its clips'
//   source ranges together), a newer request cancelling the one still running; peaks not loaded yet are
//   asked for (the waveforms need them too) and the row says it is reading them;
// - the cuts Apply would make are drawn hatched on the timeline (`SessionStore.silence`) and counted in
//   the row; selection, document, peaks and parameter changes update them;
// - Apply cuts them out and closes the gaps (timeline/edit/silence.ts) in one transaction: one undo
//   step; the pieces of the selected clips stay selected. Cancel, Esc (`app.cancel`), the button again,
//   or a selection with no audio closes the row and clears the preview.
// The parameters are the app settings' (remembered). A slider drag or a field scrub previews `live`
// values and stores them on release. Nothing renders React while they move (P1): the readouts are DOM
// writes (`bindSilenceValue`, `bindSilenceStatus`), the row renders when it opens or closes only.
import type { ClipId, MediaClip, MediaId } from "../core/document/types.js";
import { frameToUs } from "../core/document/time.js";
import { createStore } from "../core/store/createStore.js";
import { selectClips, toSnapshot, type Selection } from "../core/store/selection.js";
import type { SilenceParams, SourceRange } from "../media/analysis/silence.js";
import { isAbortError } from "../media/workers/protocol.js";
import type { AppSettings } from "../project/appSettings.js";
import {
  clampSilenceParam,
  closeSilences,
  cutSilences,
  REMOVE_SILENCE_LABEL,
  SILENCE_MIN_MS,
  SILENCE_PADDING_MS,
  SILENCE_THRESHOLD,
  silencePlan,
  silenceTargets,
  sourceRange,
  spanFrames,
  type SilencePlan,
} from "../timeline/edit/silence.js";
import type { NumberBinding } from "../ui/NumberField.js";
import { showToast } from "../ui/toasts.js";
import { clipVisuals, loadPeaks } from "./mediaController.js";
import { actions, appSettings, documentStore, sessionStore, workerPool } from "./services.js";

export type SilenceField = keyof Pick<AppSettings, "silenceThresholdDb" | "silenceMinMs" | "silencePaddingMs">;

export const SILENCE_FIELDS: Readonly<Record<SilenceField, { min: number; max: number; default: number }>> = {
  silenceThresholdDb: SILENCE_THRESHOLD,
  silenceMinMs: SILENCE_MIN_MS,
  silencePaddingMs: SILENCE_PADDING_MS,
};

/** Whether the parameter row is open. */
export const silenceRow = createStore(false);

export interface SilenceStatus {
  /** Some peaks or analyses are still coming. */
  analysing: boolean;
  /** Silences found and the frames they remove (`SilencePlan`). */
  count: number;
  frames: number;
  /** The fps the frames are at (for the readout). */
  fps: { num: number; den: number };
}

const IDLE: SilenceStatus = { analysing: false, count: 0, frames: 0, fps: { num: 30, den: 1 } };
export const silenceStatus = createStore<SilenceStatus>(IDLE);

/** Values being dragged or scrubbed, not stored yet. */
const live = createStore<Partial<Record<SilenceField, number>>>({});

/** A parameter as the preview uses it: the live value while it moves, else the stored one. */
export function silenceValue(field: SilenceField): number {
  return live.getState()[field] ?? appSettings.getState()[field];
}

/** Calls `listener` when `silenceValue(field)` may have changed. */
export function subscribeSilenceValue(field: SilenceField, listener: () => void): () => void {
  const stops = [live.select((state) => state[field], listener), appSettings.select((state) => state[field], listener)];
  return () => {
    for (const stop of stops) stop();
  };
}

/** A live value while a slider or a field moves (null: back to the stored one). */
export function previewSilenceValue(field: SilenceField, value: number | null): void {
  live.set((state) => {
    const next = { ...state };
    if (value === null) delete next[field];
    else next[field] = clampSilenceParam(SILENCE_FIELDS[field], value);
    return next;
  });
}

/** Stores a parameter (remembered for the next time) and ends its live value. */
export function setSilenceValue(field: SilenceField, value: number): void {
  const clamped = clampSilenceParam(SILENCE_FIELDS[field], value);
  previewSilenceValue(field, null);
  if (appSettings.getState()[field] !== clamped) void appSettings.update({ [field]: clamped });
}

function params(): SilenceParams {
  return { thresholdDb: silenceValue("silenceThresholdDb"), minSilenceUs: silenceValue("silenceMinMs") * 1000, paddingUs: silenceValue("silencePaddingMs") * 1000 };
}

// --- Analysis -------------------------------------------------------------------------------------

interface Analysis {
  /** The parameters and source ranges it was asked for. */
  key: string;
  /** Per range, the silent spans (media µs pairs); null while the worker works. */
  spans: number[][] | null;
  controller: AbortController | null;
}

const analyses = new Map<MediaId, Analysis>();
/** The plan last drawn, and whether some of it is still being analysed. */
let current: { plan: SilencePlan; analysing: boolean } | null = null;

/** Asks analysis.worker for a media's silences (the request it replaces is cancelled). */
function analyse(mediaId: MediaId, key: string, ranges: SourceRange[], silence: SilenceParams): Analysis | null {
  const peaks = clipVisuals.peaks(mediaId);
  const level = peaks?.levels[0];
  if (!peaks || !level) return null;
  analyses.get(mediaId)?.controller?.abort();
  const controller = new AbortController();
  const entry: Analysis = { key, spans: null, controller };
  analyses.set(mediaId, entry);
  // A copy: the timeline keeps drawing from its own.
  const level0 = level.slice().buffer;
  workerPool
    .request("detectSilence", { level0, sampleRate: peaks.sampleRate, frames: peaks.frames, channels: peaks.channels, ranges, ...silence }, { priority: "user", signal: controller.signal, transfer: [level0] })
    .then(({ spans }) => {
      if (analyses.get(mediaId) !== entry) return;
      entry.spans = spans;
      entry.controller = null;
      schedule();
    })
    .catch((error: unknown) => {
      if (isAbortError(error) || analyses.get(mediaId) !== entry) return;
      console.warn("[silence] analysis failed", error);
      entry.spans = ranges.map(() => []);
      entry.controller = null;
      schedule();
    });
  return entry;
}

function selectedIds(): ClipId[] {
  const selection = sessionStore.selection.getState();
  return selection.kind === "clips" ? [...selection.clipIds] : [];
}

/** Brings the preview up to date with the selection, the document, the peaks and the parameters. */
function refresh(): void {
  if (!silenceRow.getState()) return;
  const project = documentStore.getState();
  const targets = silenceTargets(project, selectedIds());
  if (targets.length === 0) {
    closeRow();
    return;
  }
  const silence = params();
  const byMedia = new Map<MediaId, ClipId[]>();
  for (const id of targets) {
    const { mediaId } = project.clips[id] as MediaClip;
    const list = byMedia.get(mediaId);
    if (list) list.push(id);
    else byMedia.set(mediaId, [id]);
  }
  const spansOf = new Map<ClipId, readonly number[]>();
  let analysing = false;
  const missing: MediaId[] = [];
  for (const [mediaId, ids] of byMedia) {
    const ranges = ids.map((id) => sourceRange(project.clips[id] as MediaClip));
    const key = JSON.stringify([silence, ranges]);
    let entry = analyses.get(mediaId);
    if (!entry || entry.key !== key) entry = analyse(mediaId, key, ranges, silence) ?? undefined;
    if (!entry) missing.push(mediaId);
    if (!entry?.spans) {
      analysing = true;
      continue;
    }
    const { spans } = entry;
    ids.forEach((id, i) => spansOf.set(id, spans[i] ?? []));
  }
  // Their peaks load first (and the timeline draws them); the arrival refreshes.
  if (missing.length > 0) loadPeaks(missing);
  const { fps } = project.settings;
  const plan = silencePlan(project, targets, (id) => {
    const spans = spansOf.get(id);
    return spans ? spanFrames(project.clips[id] as MediaClip, spans, fps) : null;
  });
  current = { plan, analysing };
  sessionStore.silence.set({ segments: plan.segments });
  const status = silenceStatus.getState();
  if (status.analysing !== analysing || status.count !== plan.count || status.frames !== plan.frames || status.fps !== fps) silenceStatus.set({ analysing, count: plan.count, frames: plan.frames, fps });
}

let scheduled = false;
/** Coalesces the changes of one task into one refresh. */
function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    refresh();
  });
}

// --- Row ------------------------------------------------------------------------------------------

let watching: (() => void)[] = [];

function openRow(): void {
  if (silenceRow.getState()) return;
  if (silenceTargets(documentStore.getState(), selectedIds()).length === 0) {
    showToast({ tone: "info", message: "Select a clip with sound", detail: "Remove silence works on audio clips and on video clips with linked audio." });
    return;
  }
  silenceRow.set(true);
  watching = [sessionStore.selection.subscribe(schedule), documentStore.subscribe(schedule), clipVisuals.subscribe(schedule), live.subscribe(schedule), appSettings.subscribe(schedule)];
  refresh();
}

function closeRow(): void {
  for (const stop of watching) stop();
  watching = [];
  for (const entry of analyses.values()) entry.controller?.abort();
  analyses.clear();
  current = null;
  live.set({});
  sessionStore.silence.set(null);
  silenceStatus.set(IDLE);
  silenceRow.set(false);
}

/** Esc (`app.cancel`): closes the row; false when it was not open. */
export function cancelRemoveSilence(): boolean {
  if (!silenceRow.getState()) return false;
  closeRow();
  return true;
}

/** `Removed 3 silences · 2.4 s`, or what the row is waiting for. */
export function silenceStatusText(status: SilenceStatus): string {
  if (status.analysing && status.count === 0) return "Reading the waveform…";
  if (status.count === 0) return "No silence found";
  const seconds = (frameToUs(status.frames, status.fps) / 1e6).toFixed(1);
  return `${status.count} ${status.count === 1 ? "silence" : "silences"} · ${seconds} s${status.analysing ? " · reading…" : ""}`;
}

/** Writes the count into `element` (DOM only, P1). Returns a stop function. */
export function bindSilenceStatus(element: HTMLElement): () => void {
  return silenceStatus.select(
    (status) => status,
    (status) => {
      const text = silenceStatusText(status);
      if (element.textContent !== text) element.textContent = text;
      element.dataset.found = status.count > 0 ? "true" : "false";
    },
    { fireImmediately: true },
  );
}

/** The pieces of the selected clips, the primary on the first piece of the old primary. */
function selectionAfter(selection: Selection, pieces: ReadonlyMap<ClipId, readonly ClipId[]>): Selection {
  if (selection.kind !== "clips") return selection;
  const ids: ClipId[] = [];
  for (const id of selection.clipIds) ids.push(...(pieces.get(id) ?? [id]));
  const primary = selection.primary !== null && pieces.has(selection.primary) ? (pieces.get(selection.primary)?.[0] ?? null) : selection.primary;
  return selectClips(ids, primary);
}

const newId = () => crypto.randomUUID();

function apply(): void {
  if (!silenceRow.getState()) return;
  refresh();
  if (!current) return;
  const { plan, analysing } = current;
  if (analysing) {
    showToast({ tone: "info", message: "Still analysing", detail: "Remove silence is reading the waveform. Apply again in a moment." });
    return;
  }
  if (plan.groups.length === 0) {
    showToast({ tone: "info", message: "No silence to remove", detail: "Nothing stays under the threshold for the minimum silence. Raise the threshold or shorten the minimum silence." });
    return;
  }
  const selection = sessionStore.selection.getState();
  const result = documentStore.transaction(REMOVE_SILENCE_LABEL, () => {
    const cut = cutSilences(documentStore.getState(), plan.groups, newId);
    if (cut.command) documentStore.dispatch(cut.command, { selection: toSnapshot(selectionAfter(selection, cut.pieces)) });
    const close = closeSilences(documentStore.getState(), cut.gaps);
    if (close.command) documentStore.dispatch(close.command);
    return close;
  });
  closeRow();
  const seconds = (frameToUs(plan.frames, documentStore.getState().settings.fps) / 1e6).toFixed(1);
  const { limit } = result;
  if (limit) {
    const project = documentStore.getState();
    const clip = project.clips[limit.clipId]?.name ?? "A clip";
    const track = project.tracks.find((candidate) => candidate.id === limit.trackId)?.name ?? "another track";
    showToast({ tone: "warning", message: "Some gaps stayed open", detail: `The silences are cut out, but ${clip} on ${track} can't move further left without overlapping.` });
  } else showToast({ tone: "success", message: `Removed ${plan.count} ${plan.count === 1 ? "silence" : "silences"}`, detail: `${seconds} s cut out. Undo brings them back.` });
}

/** Registers Remove silence's actions. Returns a stop function. */
export function installSilenceController(): () => void {
  const stops = [
    actions.register("audio.removeSilence", () => (silenceRow.getState() ? closeRow() : openRow())),
    actions.register("audio.removeSilence.apply", apply, { enabled: () => silenceRow.getState() }),
    actions.register("audio.removeSilence.cancel", () => cancelRemoveSilence(), { enabled: () => silenceRow.getState() }),
  ];
  return () => {
    for (const stop of stops) stop();
    closeRow();
  };
}

// --- Controls -------------------------------------------------------------------------------------

/** Keys a focused slider keeps for itself (the shortcuts would step the playhead instead). */
const SLIDER_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);

/**
 * The threshold slider and its dB readout, bound outside React (P1): a drag previews live values and
 * stores the value on release; arrows move it while it has focus. Returns a stop function.
 */
export function bindThresholdSlider(input: HTMLInputElement, readout: HTMLElement): () => void {
  const field: SilenceField = "silenceThresholdDb";
  input.min = String(SILENCE_THRESHOLD.min);
  input.max = String(SILENCE_THRESHOLD.max);
  input.step = "1";
  let dragging = false;
  const show = () => {
    const value = silenceValue(field);
    const text = `${value} dB`;
    if (readout.textContent !== text) readout.textContent = text;
    if (!dragging && input.value !== String(value)) input.value = String(value);
    input.setAttribute("aria-valuetext", text);
  };
  const onInput = () => {
    dragging = true;
    previewSilenceValue(field, Number(input.value));
  };
  const onChange = () => {
    dragging = false;
    setSilenceValue(field, Number(input.value));
  };
  const onKey = (event: KeyboardEvent) => {
    if (SLIDER_KEYS.has(event.key)) event.stopPropagation();
  };
  input.addEventListener("input", onInput);
  input.addEventListener("change", onChange);
  input.addEventListener("keydown", onKey);
  const stop = subscribeSilenceValue(field, show);
  show();
  return () => {
    stop();
    input.removeEventListener("input", onInput);
    input.removeEventListener("change", onChange);
    input.removeEventListener("keydown", onKey);
  };
}

/** A NumberField binding to a parameter: a scrub previews live values and stores the last one on release. */
export function silenceFieldBinding(field: SilenceField): NumberBinding {
  let base: number | null = null;
  return {
    read: () => silenceValue(field),
    subscribe: (listener) => subscribeSilenceValue(field, listener),
    set: (value) => setSilenceValue(field, value),
    change(delta, phase) {
      if (phase === "step") setSilenceValue(field, silenceValue(field) + delta);
      else if (phase === "scrub") {
        base ??= appSettings.getState()[field];
        previewSilenceValue(field, base + delta);
      } else {
        const from = base ?? appSettings.getState()[field];
        base = null;
        if (phase === "commit") setSilenceValue(field, from + delta);
        else previewSilenceValue(field, null);
      }
    },
  };
}
