// Media flows of the open project (spec §9.1, §12): import from the picker (button, Mod+I), drops and
// pasted images; posters and the analysis queue per project; panel selection, inline rename and
// removal. Framework-free; the media panel reads `mediaPanel` through narrow selectors.
import { mediaUseCounts, removeMedia, renameMedia } from "../core/commands/mediaCommands.js";
import type { MediaId } from "../core/document/types.js";
import { isEditableTarget } from "../core/keyboard/KeyDispatcher.js";
import { createStore } from "../core/store/createStore.js";
import { AnalysisScheduler } from "../media/AnalysisScheduler.js";
import { createProbeFile, MediaImporter, type Refusal } from "../media/MediaImporter.js";
import { PICKER_TYPES } from "../media/mediaKinds.js";
import { PosterStore } from "../media/PosterStore.js";
import { svgPoster } from "../media/probe/svgProbe.js";
import { isAbortError } from "../media/workers/protocol.js";
import { clickSelection, EMPTY_MEDIA_SELECTION, pruneSelection, type MediaSelection } from "../panels/media/mediaList.js";
import { errorMessage } from "../project/errorMessage.js";
import type { FsDir } from "../project/fs.js";
import { dismissToast, showToast, updateToast } from "../ui/toasts.js";
import { actions, appSettings, documentStore, focusScopes, idleQueue, workerPool } from "./services.js";

export interface MediaPanelState {
  selection: MediaSelection;
  /** Media whose name is being edited inline. */
  renaming: MediaId | null;
  /** Media waiting for the "Remove from project" confirmation. */
  removing: readonly MediaId[] | null;
}

export const mediaPanel = createStore<MediaPanelState>({ selection: EMPTY_MEDIA_SELECTION, renaming: null, removing: null });

/** The open project's posters. A store: reopening the same project keeps the cards mounted. */
export const posterStore = createStore<PosterStore | null>(null);

/** Imports at least this large show a progress toast (gap: the spec says "large copies"). */
export const LARGE_IMPORT_BYTES = 32 * 1024 * 1024;
const PROGRESS_INTERVAL_MS = 150;

interface OpenMedia {
  importer: MediaImporter;
  posters: PosterStore;
  analysis: AnalysisScheduler;
  /** Aborted when the project closes: running imports stop and clean up. */
  controller: AbortController;
  isWritable: () => boolean;
  stops: (() => void)[];
}

let open: OpenMedia | null = null;

const patch = (next: Partial<MediaPanelState>) => mediaPanel.set((state) => ({ ...state, ...next }));

/** Wires media to a newly opened project (after its document is loaded). */
export function attachMedia(dir: FsDir, isWritable: () => boolean): void {
  detachMedia();
  const posters = new PosterStore({ dir, pool: workerPool, isWritable, svgPoster });
  const analysis = new AnalysisScheduler(idleQueue);
  const importer = new MediaImporter({ dir, documentStore, probe: createProbeFile(workerPool), importMode: () => appSettings.getState().importMode });
  open = {
    importer,
    posters,
    analysis,
    controller: new AbortController(),
    isWritable,
    stops: [
      posters.attach(documentStore),
      analysis.attach(documentStore),
      documentStore.subscribe(
        (state) => {
          const exists = (id: MediaId) => Object.hasOwn(state.media, id);
          const current = mediaPanel.getState();
          const selection = pruneSelection(current.selection, exists);
          const renaming = current.renaming !== null && !exists(current.renaming) ? null : current.renaming;
          if (selection !== current.selection || renaming !== current.renaming) patch({ selection, renaming });
        },
        { affects: ["media"] },
      ),
    ],
  };
  mediaPanel.set({ selection: EMPTY_MEDIA_SELECTION, renaming: null, removing: null });
  posterStore.set(posters);
}

/** Before the project closes: stops imports, frees posters (P13), drops queued analysis. */
export function detachMedia(): void {
  const current = open;
  open = null;
  if (!current) return;
  current.controller.abort();
  for (const stop of current.stops) stop();
  posterStore.set(null);
  current.posters.dispose();
  current.analysis.dispose();
  mediaPanel.set({ selection: EMPTY_MEDIA_SELECTION, renaming: null, removing: null });
}

export function currentPosters(): PosterStore | null {
  return posterStore.getState();
}

function refusalToast(refused: readonly Refusal[]): void {
  const [first] = refused;
  if (!first) return;
  const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
  showToast(
    refused.length === 1
      ? { tone: "error", message: `Can't import ${first.name}`, detail: sentence(first.reason) }
      : { tone: "error", message: `Can't import ${refused.length} files`, detail: refused.map((r) => `${r.name}: ${r.reason}`).join(" · ") },
  );
}

/** Imports files into the open project, with refusal, progress and failure toasts. */
export async function importMediaFiles(files: readonly File[]): Promise<void> {
  const current = open;
  if (!current || files.length === 0) return;
  if (!current.isWritable()) {
    showToast({ tone: "error", message: "This project is read-only", detail: "Allow editing to import media." });
    return;
  }
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  let toast: number | null = null;
  let lastUpdate = 0;
  try {
    const report = await current.importer.importFiles(files, {
      signal: current.controller.signal,
      ...(totalBytes >= LARGE_IMPORT_BYTES && {
        onProgress: ({ index, count, name, copiedBytes, totalBytes: total }) => {
          const now = performance.now();
          if (toast !== null && now - lastUpdate < PROGRESS_INTERVAL_MS && copiedBytes < total) return;
          lastUpdate = now;
          const progress = total > 0 ? copiedBytes / total : 0;
          const message = count === 1 ? `Importing ${name}` : `Importing ${index + 1} of ${count}`;
          const detail = count === 1 ? `${Math.round(progress * 100)}%` : `${name} · ${Math.round(progress * 100)}%`;
          if (toast === null) toast = showToast({ tone: "info", message, detail, progress });
          else updateToast(toast, { message, detail, progress });
        },
      }),
    });
    if (toast !== null) {
      updateToast(toast, { tone: "success", message: `Imported ${report.added.length} of ${files.length} files`, detail: "" }, { durationMs: 2500 });
      toast = null;
    }
    refusalToast(report.refused);
    if (report.added.length > 0 && open === current) {
      const ids = report.added.map((item) => item.id);
      patch({ selection: { ids: new Set(ids), anchor: ids[0] ?? null } });
    }
  } catch (error) {
    if (toast !== null) dismissToast(toast);
    if (isAbortError(error)) return;
    console.error("[media] import failed", error);
    showToast({ tone: "error", message: "Import failed", detail: errorMessage(error) });
  }
}

interface FilePickerWindow {
  showOpenFilePicker(options: { multiple?: boolean; id?: string; types?: typeof PICKER_TYPES; excludeAcceptAllOption?: boolean }): Promise<FileSystemFileHandle[]>;
}

/** The Import button and Mod+I. Must run inside a user gesture. */
export async function importFromPicker(): Promise<void> {
  if (!open) return;
  let handles: FileSystemFileHandle[];
  try {
    handles = await (window as unknown as FilePickerWindow).showOpenFilePicker({ multiple: true, id: "shorts-editor-media", types: PICKER_TYPES, excludeAcceptAllOption: false });
  } catch (error) {
    if (isAbortError(error)) return;
    showToast({ tone: "error", message: "Could not open the file picker", detail: errorMessage(error) });
    return;
  }
  await importMediaFiles(await Promise.all(handles.map((handle) => handle.getFile())));
}

interface HandleItem {
  getAsFileSystemHandle?(): Promise<FileSystemHandle | null>;
}

async function filesIn(handle: FileSystemHandle): Promise<File[]> {
  if (handle.kind === "file") return [await (handle as FileSystemFileHandle).getFile()];
  const files: File[] = [];
  for await (const entry of (handle as FileSystemDirectoryHandle).values()) files.push(...(await filesIn(entry)));
  return files;
}

/** Files and folders dropped on the media panel. Reads the items synchronously, inside the event. */
export function dropMedia(transfer: DataTransfer): void {
  const items = [...transfer.items].filter((item) => item.kind === "file");
  const handles = items.map((item) => (item as unknown as HandleItem).getAsFileSystemHandle?.().catch(() => null) ?? Promise.resolve(null));
  const plain = items.map((item) => item.getAsFile());
  void (async () => {
    const files: File[] = [];
    for (const [i, pending] of handles.entries()) {
      const handle = await pending;
      if (handle) files.push(...(await filesIn(handle).catch(() => [])));
      else if (plain[i]) files.push(plain[i] as File);
    }
    await importMediaFiles(files);
  })();
}

export function selectMedia(id: MediaId, mods: { toggle: boolean; range: boolean }, order: readonly MediaId[]): void {
  patch({ selection: clickSelection(mediaPanel.getState().selection, id, mods, order) });
}

export function clearMediaSelection(): void {
  if (mediaPanel.getState().selection.ids.size > 0) patch({ selection: EMPTY_MEDIA_SELECTION });
}

/** F2 / double-click: the given media, else the anchor of the selection. */
export function startRename(id?: MediaId): void {
  const { selection } = mediaPanel.getState();
  const target = id ?? (selection.anchor !== null && selection.ids.has(selection.anchor) ? selection.anchor : [...selection.ids][0]);
  if (target === undefined || !documentStore.getState().media[target]) return;
  patch({ renaming: target, ...(id !== undefined && !selection.ids.has(id) && { selection: { ids: new Set([id]), anchor: id } }) });
}

/** Ends the inline rename; `name` null cancels. One undoable command when the name changed. */
export function finishRename(id: MediaId, name: string | null): void {
  if (mediaPanel.getState().renaming === id) patch({ renaming: null });
  const media = documentStore.getState().media[id];
  if (name !== null && media && name.trim() !== media.name) documentStore.dispatch(renameMedia(id, name));
}

/** Delete in the media panel: asks before removing the selected media. */
export function requestRemove(): void {
  const ids = [...mediaPanel.getState().selection.ids].filter((id) => documentStore.getState().media[id]);
  if (ids.length > 0) patch({ removing: ids });
}

export function cancelRemove(): void {
  patch({ removing: null });
}

/** "Remove from project": one undoable command; the files stay in media/. */
export function confirmRemove(): void {
  const ids = mediaPanel.getState().removing ?? [];
  patch({ removing: null });
  if (ids.length === 0) return;
  try {
    documentStore.dispatch(removeMedia(ids));
  } catch (error) {
    showToast({ tone: "error", message: "Could not remove the media", detail: errorMessage(error) });
  }
}

/** How many clips use any of `ids` (the dialog's second option, Batch 41). */
export function clipsUsing(ids: readonly MediaId[]): number {
  const counts = mediaUseCounts(documentStore.getState());
  return ids.reduce((sum, id) => sum + (counts.get(id) ?? 0), 0);
}

/** Pasted images (Mod+V outside text inputs, when the media panel or nothing owns the keyboard). */
function onPaste(event: ClipboardEvent): void {
  if (!open || isEditableTarget(event.target)) return;
  const scope = focusScopes.scope;
  if (scope !== "media" && scope !== "global") return;
  const images = [...(event.clipboardData?.files ?? [])].filter((file) => file.type.startsWith("image/"));
  if (images.length === 0) return;
  event.preventDefault();
  void importMediaFiles(images);
}

/** Registers the media actions and the paste listener. Returns a stop function. */
export function installMediaController(doc: Document = document): () => void {
  doc.addEventListener("paste", onPaste);
  const stops = [
    () => doc.removeEventListener("paste", onPaste),
    actions.register("media.import", () => void importFromPicker()),
    actions.register("edit.delete", (context) => {
      if (context?.scope === "media") return requestRemove();
      // TODO(batch 15): delete the selected clips (timeline, preview).
      console.debug("[cmd]", "edit.delete", context);
    }),
    actions.register("edit.rename", (context) => {
      if (context?.scope === "media") return startRename();
      // TODO(batch 15): rename the selected clip; TODO(batch 16): rename the selected track.
      console.debug("[cmd]", "edit.rename", context);
    }),
    // The remove dialog owned the keyboard: give it back to the media panel.
    mediaPanel.select(
      (state) => state.removing,
      (removing, prev) => {
        if (!removing && prev) focusScopes.set("media");
      },
    ),
  ];
  return () => {
    for (const stop of stops) stop();
  };
}
