// Captions in the app (spec §10.5, §12 Captions tab, §17): the caption track, the cue list's edits, SRT
// and VTT files, and the Caption style focus. Every edit is one command (timeline/edit/captions.ts).
// - Actions: `add.captionTrack` (the timeline toolbar), `captions.addCue` (`+ Cue at playhead`),
//   `captions.import`, `captions.export`, `captions.style`, `captions.clear` (the Captions header),
//   `caption.mergePrevious` (the cue menu). Transcribe: transcribeController.ts (Batch 33).
// - The cue list types into a draft shown live on the canvas (`liveEdit.cues`, no undo step per key);
//   blur, Tab, Enter (split), Mod+Backspace (merge) commit it. Selecting a cue moves the playhead to
//   its start. After a split or a merge the list focuses the cue named by `cueFocus`.
// - Dev builds: `__editor.captions` for the acceptance checks.
import type { CaptionClip, ClipId, Project } from "../core/document/types.js";
import { createStore } from "../core/store/createStore.js";
import { selectClips, selectTracks, toSnapshot } from "../core/store/selection.js";
import { setSectionCollapsed } from "../core/store/sessionStore.js";
import { evenWords } from "../text/captions.js";
import { formatSubtitles, parseSubtitles, type SubtitleFormat } from "../text/subtitles.js";
import { addCaptionTrack, addCueAt, captionTrackOf, clearCues, cuesOf, exportCues, importCues, mergeWithPrevious, setCueText, splitCue } from "../timeline/edit/captions.js";
import { showToast } from "../ui/toasts.js";
import { pickFile, saveFile, type PickerType } from "./filePickers.js";
import { patchLiveEdit } from "./liveEdit.js";
import { errorMessage } from "../project/errorMessage.js";
import { actions, documentStore, sessionStore } from "./services.js";
import { movePlayhead } from "./timelineController.js";

const newId = () => crypto.randomUUID();

/** A cue row of the list to focus once it is shown: its text field with the caret at `caret` (`all`: selected). */
export interface CueFocus {
  cueId: ClipId;
  caret: number | "all";
}

/** The cue the list focuses next (consumed by the row that shows it). */
export const cueFocus = createStore<CueFocus | null>(null);

/** A properties section to scroll to and focus (the Captions header's Style), consumed by the panel. */
export const revealSection = createStore<"captionStyle" | "transition" | null>(null);

/** Opens the Media panel's Captions tab. */
export function showCaptionsTab(): void {
  sessionStore.state.set((state) => (state.mediaPanel.tab === "captions" ? state : { ...state, mediaPanel: { ...state.mediaPanel, tab: "captions" } }));
}

function lockedToast(): void {
  showToast({ tone: "warning", message: "The caption track is locked", detail: "Unlock CC to edit its cues." });
}

/** `+ Caption track` (spec §17): the caption track, then the Captions tab. */
function addTrack(): void {
  const command = addCaptionTrack(documentStore.getState(), newId());
  if (!command) return;
  documentStore.dispatch(command);
  showCaptionsTab();
}

/** `+ Cue at playhead` (spec §10.5): a 2 s cue, selected, its text ready to type over. */
export function addCue(): ClipId | null {
  const project = documentStore.getState();
  const result = addCueAt(project, sessionStore.state.getState().playhead, newId);
  if (!result) {
    lockedToast();
    return null;
  }
  documentStore.dispatch(result.command, { selection: toSnapshot(selectClips([result.cueId])) });
  showCaptionsTab();
  cueFocus.set({ cueId: result.cueId, caret: "all" });
  return result.cueId;
}

/** A cue clicked in the list: selected, the playhead on its first frame. */
export function selectCue(cueId: ClipId): void {
  const cue = documentStore.getState().clips[cueId];
  if (cue?.kind !== "caption") return;
  const selection = sessionStore.selection.getState();
  if (!(selection.kind === "clips" && selection.clipIds.size === 1 && selection.clipIds.has(cueId))) sessionStore.selection.set(selectClips([cueId]));
  if (sessionStore.state.getState().playhead !== cue.start) movePlayhead(cue.start);
}

/** The cue list's draft of `cueId`: shown on the canvas at once (spec §10.5), no undo step yet. */
export function draftCue(cueId: ClipId, text: string): void {
  patchLiveEdit({ cues: new Map([[cueId, text]]) });
}

/** Ends a draft: the text (when given and changed) becomes one undo step "Edit caption". */
export function commitCue(cueId: ClipId, text: string | null): void {
  if (text !== null) {
    const command = setCueText(documentStore.getState(), cueId, text);
    if (command) documentStore.dispatch(command);
  }
  patchLiveEdit({ cues: null });
}

/** Enter in the cue list: the cue split at the caret (proportional timing); the right half is focused. */
export function splitCueAtCaret(cueId: ClipId, text: string, caret: number): boolean {
  const result = splitCue(documentStore.getState(), cueId, text, caret, newId);
  if (!result) {
    showToast({ tone: "info", message: "Can't split this cue", detail: "A cue needs at least 2 frames to split (and an unlocked track)." });
    return false;
  }
  documentStore.dispatch(result.command, { selection: toSnapshot(selectClips([result.rightId])) });
  patchLiveEdit({ cues: null });
  cueFocus.set({ cueId: result.rightId, caret: 0 });
  return true;
}

/** Mod+Backspace at the start of a cue: merged into the previous cue; the caret goes to the junction. */
export function mergeCueIntoPrevious(cueId: ClipId, text?: string): boolean {
  const result = mergeWithPrevious(documentStore.getState(), cueId, text);
  if (!result) return false;
  documentStore.dispatch(result.command, { selection: toSnapshot(selectClips([result.cueId])) });
  patchLiveEdit({ cues: null });
  cueFocus.set({ cueId: result.cueId, caret: result.caret });
  return true;
}

/** The cue menu's merge: the primary selected cue into the one before it. */
function mergeSelected(): void {
  const selection = sessionStore.selection.getState();
  const id = selection.kind === "clips" ? selection.primary : null;
  if (id && documentStore.getState().clips[id]?.kind === "caption") mergeCueIntoPrevious(id);
}

const hasCues = () => (captionTrackOf(documentStore.getState())?.clipIds.length ?? 0) > 0;

/** The primary selected cue, or null. */
function selectedCue(): CaptionClip | null {
  const selection = sessionStore.selection.getState();
  const clip = selection.kind === "clips" && selection.primary !== null ? documentStore.getState().clips[selection.primary] : undefined;
  return clip?.kind === "caption" ? clip : null;
}

function editSelectedCue(): void {
  const cue = selectedCue();
  if (!cue) return;
  showCaptionsTab();
  cueFocus.set({ cueId: cue.id, caret: cue.text.length });
}

/** Clear all (spec §10.5): every cue goes in one undo step (no confirmation: Undo brings them back). */
function clearAll(): void {
  const command = clearCues(documentStore.getState());
  if (command) documentStore.dispatch(command);
}

const SUBTITLE_TYPES: readonly PickerType[] = [
  { description: "SubRip subtitles", accept: { "application/x-subrip": [".srt"] } },
  { description: "WebVTT subtitles", accept: { "text/vtt": [".vtt"] } },
];
const OPEN_TYPES: readonly PickerType[] = [{ description: "Subtitles (SRT, VTT)", accept: { "text/plain": [".srt", ".vtt"] } }];

/** Import SRT/VTT (spec §10.5): the file's cues replace the caption track's (one undo step). */
export async function importSubtitles(file?: File): Promise<void> {
  try {
    const picked = file ?? (await pickFile(OPEN_TYPES));
    if (!picked) return;
    importSubtitleText(await picked.text(), picked.name);
  } catch (error) {
    showToast({ tone: "error", message: "Couldn't import the captions", detail: errorMessage(error) });
  }
}

/** The import of a subtitle file's text (the acceptance checks call it with a generated file). */
export function importSubtitleText(text: string, fileName = ""): number {
  const parsed = parseSubtitles(text, fileName);
  if (parsed.cues.length === 0) {
    showToast({ tone: "error", message: "No captions imported", detail: `The file holds no ${parsed.format.toUpperCase()} cue this editor can read.` });
    return 0;
  }
  const project = documentStore.getState();
  const result = importCues(project, parsed.cues, newId);
  if (!result) {
    lockedToast();
    return 0;
  }
  documentStore.dispatch(result.command, { selection: toSnapshot(selectClips([])) });
  showCaptionsTab();
  const notes = [
    result.replaced > 0 ? `Replaced ${result.replaced} cue${result.replaced === 1 ? "" : "s"}.` : "",
    result.adjusted > 0 ? `${result.adjusted} overlapping cue${result.adjusted === 1 ? "" : "s"} adjusted.` : "",
    parsed.skipped > 0 ? `${parsed.skipped} block${parsed.skipped === 1 ? "" : "s"} skipped.` : "",
  ].filter((note) => note !== "");
  showToast({ tone: "success", message: `Imported ${result.count} cue${result.count === 1 ? "" : "s"}`, ...(notes.length > 0 && { detail: notes.join(" ") }) });
  return result.count;
}

/** The cues as a subtitle file of `format` (word timings left out, spec §10.5). */
export function subtitleText(format: SubtitleFormat, project: Project = documentStore.getState()): string {
  return formatSubtitles(exportCues(project), format);
}

/** Export SRT/VTT (spec §10.5): the format follows the name chosen (`.vtt`, else SRT). */
async function exportSubtitles(): Promise<void> {
  const project = documentStore.getState();
  if (cuesOf(project).length === 0) return;
  try {
    const name = `${project.name.replace(/[\\/:*?"<>|]+/g, "-").trim() || "captions"}.srt`;
    const saved = await saveFile(name, SUBTITLE_TYPES, (fileName) => subtitleText(/\.vtt$/i.test(fileName) ? "vtt" : "srt", project));
    if (saved) showToast({ tone: "success", message: `Exported ${saved}`, detail: `${cuesOf(project).length} cues.` });
  } catch (error) {
    showToast({ tone: "error", message: "Couldn't export the captions", detail: errorMessage(error) });
  }
}

/**
 * Style (spec §10.5): the properties panel shows the Caption style section (the caption track is
 * selected unless cues are), opened, scrolled to and focused.
 */
function focusStyle(): void {
  const project = documentStore.getState();
  const track = captionTrackOf(project);
  if (!track) return;
  const selection = sessionStore.selection.getState();
  const cuesSelected = selection.kind === "clips" && [...selection.clipIds].some((id) => project.clips[id]?.kind === "caption");
  const trackSelected = selection.kind === "track" && selection.trackIds?.has(track.id) === true;
  if (!cuesSelected && !trackSelected) sessionStore.selection.set(selectTracks([track.id]));
  setSectionCollapsed(sessionStore, "captionStyle", false);
  revealSection.set("captionStyle");
}

/** Registers the caption actions. Returns a stop function. */
export function installCaptionController(): () => void {
  const stops = [
    actions.register("add.captionTrack", addTrack, { enabled: () => captionTrackOf(documentStore.getState()) === null }),
    actions.register("captions.addCue", () => void addCue()),
    actions.register("captions.import", () => void importSubtitles()),
    actions.register("captions.export", () => void exportSubtitles(), { enabled: hasCues }),
    actions.register("captions.style", focusStyle),
    actions.register("captions.clear", clearAll, { enabled: hasCues }),
    actions.register("caption.mergePrevious", mergeSelected),
    // The cue menu's Edit text (Batch 40): the selected cue's text field on the Captions tab, caret at the end.
    actions.register("caption.editText", editSelectedCue, { enabled: () => selectedCue() !== null }),
  ];
  if (import.meta.env.DEV) {
    // Console access for the acceptance checks, e.g. `__editor.captions.karaoke(id)` (word timings
    // spread over a cue by word length: a generated karaoke cue).
    const editor = ((globalThis as { __editor?: Record<string, unknown> }).__editor ??= {});
    editor.captions = {
      addCue,
      importText: importSubtitleText,
      exportText: subtitleText,
      cues: () => cuesOf(documentStore.getState()),
      karaoke(cueId: ClipId) {
        const cue = documentStore.getState().clips[cueId];
        if (cue?.kind !== "caption") return false;
        documentStore.dispatch({
          id: "caption.devWords",
          label: "Generate word timings",
          affects: ["clips", "captions"],
          run(draft) {
            const target = draft.clips[cueId];
            if (target?.kind === "caption") target.words = evenWords(target.text, target.duration);
          },
        });
        return true;
      },
    };
  }
  return () => {
    for (const stop of stops) stop();
    cueFocus.set(null);
    revealSection.set(null);
    patchLiveEdit({ cues: null, captionStyles: null });
  };
}
