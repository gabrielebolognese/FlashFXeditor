// Media flows of the open project (spec §9.1, §12): import from the picker (button, Mod+I), drops and
// pasted images; posters, thumbnail sheets and peaks per project (the media cards' pictures and the
// timeline's clip visuals, `clipVisuals`; the hover-scrub's sheets, `scrubSheets`); proxies (§9.5:
// `ProxyJobs`, their progress in `proxyProgress`, Generate / Remove proxy and Regenerate thumbnails);
// panel selection, inline rename, removal and the context menu; source ranges of removed media are
// dropped. Framework-free; the media panel reads `mediaPanel` through narrow selectors.
import { mediaUseCounts, removeMedia, renameMedia } from "../core/commands/mediaCommands.js";
import type { MediaId, MediaItem } from "../core/document/types.js";
import { isEditableTarget } from "../core/keyboard/KeyDispatcher.js";
import { createStore } from "../core/store/createStore.js";
import type { SessionState } from "../core/store/sessionStore.js";
import { AnalysisScheduler } from "../media/AnalysisScheduler.js";
import { PeaksJobs } from "../media/PeaksJobs.js";
import { browserDecodeAudio } from "../media/probe/audioProbe.js";
import { createProbeFile, MediaImporter, type Refusal } from "../media/MediaImporter.js";
import { ProxyJobs, type ProxyFiles, type ProxyProgress } from "../media/ProxyJobs.js";
import { PICKER_TYPES } from "../media/mediaKinds.js";
import { PosterStore } from "../media/PosterStore.js";
import { svgPoster } from "../media/probe/svgProbe.js";
import { ThumbnailStore, type ThumbFiles, type ThumbnailDeps } from "../media/ThumbnailStore.js";
import { isAbortError } from "../media/workers/protocol.js";
import type { ScrubSheets } from "../panels/media/hoverScrub.js";
import { clickSelection, EMPTY_MEDIA_SELECTION, pruneSelection, type MediaSelection } from "../panels/media/mediaList.js";
import { PosterPainter, wholeImage, type PosterSource } from "../panels/media/PosterPainter.js";
import { errorMessage } from "../project/errorMessage.js";
import type { FsDir } from "../project/fs.js";
import { proxySettings } from "../project/appSettings.js";
import { openWritableAt, PROXIES_DIR, proxyPartPath, proxyPath, removeFileAt, renameFileAt, resolveFile, sampleIndexPath, writeFileAt } from "../project/mediaFiles.js";
import type { ClipVisualsSource } from "../timeline/view/clipVisuals.js";
import { dismissToast, showToast, updateToast } from "../ui/toasts.js";
import { decodedAudio, peaksFiles } from "./audioController.js";
import { actions, appSettings, documentStore, focusScopes, idleQueue, scheduler, sessionStore, workerPool } from "./services.js";

export interface MediaPanelState {
  selection: MediaSelection;
  /** Media whose name is being edited inline. */
  renaming: MediaId | null;
  /** Media waiting for the "Remove from project" confirmation. */
  removing: readonly MediaId[] | null;
}

export const mediaPanel = createStore<MediaPanelState>({ selection: EMPTY_MEDIA_SELECTION, renaming: null, removing: null });

/** The media context menu (spec §12) open at a page point, or null. */
export const mediaMenu = createStore<{ x: number; y: number } | null>(null);

/**
 * The open project's card pictures: a video's first thumbnail (sheet LOD0), an image's poster. A store:
 * reopening the same project keeps the cards mounted.
 */
export const cardImages = createStore<PosterSource | null>(null);
/** Draws the card pictures in the FrameScheduler loop (the `mediaThumbs` view). */
export const posterPainter = new PosterPainter(scheduler);

/** The running proxy job's progress (cards and list rows draw it through direct DOM writes, P1). */
export const proxyProgress = createStore<ProxyProgress>({ mediaId: null, fraction: 0 });

/**
 * Writes a media's proxy progress into `text` ("42%", or `idle` while it waits for its turn) and the
 * width of `bar`, on change only, never through React (P1). Returns a stop function.
 */
export function bindProxyProgress(mediaId: MediaId, text: HTMLElement | null, bar: HTMLElement | null, idle = ""): () => void {
  return proxyProgress.select(
    (state) => (state.mediaId === mediaId ? Math.floor(state.fraction * 100) : -1),
    (percent) => {
      const label = percent < 0 ? idle : `${percent}%`;
      if (text && text.textContent !== label) text.textContent = label;
      if (bar) bar.style.width = `${Math.max(0, percent)}%`;
    },
    { fireImmediately: true },
  );
}

/** Imports at least this large show a progress toast (gap: the spec says "large copies"). */
export const LARGE_IMPORT_BYTES = 32 * 1024 * 1024;
const PROGRESS_INTERVAL_MS = 150;

interface OpenMedia {
  importer: MediaImporter;
  posters: PosterStore;
  thumbs: ThumbnailStore;
  peaks: PeaksJobs;
  analysis: AnalysisScheduler;
  proxies: ProxyJobs;
  /** Aborted when the project closes: running imports stop and clean up. */
  controller: AbortController;
  isWritable: () => boolean;
  stops: (() => void)[];
}

let open: OpenMedia | null = null;

const arrivalListeners = new Set<() => void>();
const notifyArrival = () => {
  for (const listener of arrivalListeners) listener();
};

/**
 * What the timeline's clip bodies draw from (spec §6.17): the open project's thumbnail sheets, image
 * posters and peaks, with the content pass's wants routed to their loaders and their arrivals to the
 * view (which coalesces the redraws).
 */
export const clipVisuals: ClipVisualsSource = {
  thumbLayout: (mediaId) => open?.thumbs.layout(mediaId) ?? null,
  sheet: (mediaId, level, sheet) => open?.thumbs.sheet(mediaId, level, sheet) ?? null,
  poster: (mediaId) => open?.posters.get(mediaId) ?? null,
  strip: (mediaId) => open?.posters.strip(mediaId) ?? null,
  peaks: (mediaId) => open?.peaks.get(mediaId) ?? null,
  want: (wants) => {
    open?.thumbs.want(wants.sheets);
    open?.peaks.prioritize(wants.peaks);
  },
  subscribe: (listener) => {
    arrivalListeners.add(listener);
    return () => arrivalListeners.delete(listener);
  },
  stats: () => {
    if (!open) return "";
    const s = open.thumbs.stats;
    return `thumbs ${s.cached} cached · ${s.decoded} decoded · ${s.resident} sheets ${(s.bytes / 1048576).toFixed(1)} MB · peaks ${open.peaks.loadedCount}`;
  },
};

/** Loads the peaks of media first (Normalize needs them, Batch 37); idempotent. */
export function loadPeaks(mediaIds: readonly MediaId[]): void {
  for (const id of mediaIds) open?.peaks.request(id);
  open?.peaks.prioritize(mediaIds);
}

/** The hover-scrub's view of the thumbnail sheets (spec §12): the open project's, the hovered sheet loaded first. */
export const scrubSheets: ScrubSheets = {
  layout: (mediaId) => open?.thumbs.layout(mediaId) ?? null,
  sheet: (mediaId, level, sheet) => open?.thumbs.sheet(mediaId, level, sheet) ?? null,
  hover: (key) => open?.thumbs.hover(key),
  subscribe: (listener) => {
    arrivalListeners.add(listener);
    return () => arrivalListeners.delete(listener);
  },
};

/** A media's source file, or its ready proxy (`lod` "proxy"); null when missing. */
function mediaFile(dir: FsDir, mediaId: MediaId, lod: "full" | "proxy"): Promise<File | null> {
  // TODO(batch 41): media referenced by a file handle.
  const item = documentStore.getState().media[mediaId];
  if (!item) return Promise.resolve(null);
  if (lod === "proxy") return item.proxy?.status === "ready" ? resolveFile(dir, item.proxy.relPath) : Promise.resolve(null);
  return "relPath" in item.file ? resolveFile(dir, item.file.relPath) : Promise.resolve(null);
}

/** The project's files for the thumbnail sheets (cache/thumbs/, the sources or proxies, cache/index/). */
function thumbFiles(dir: FsDir, isWritable: () => boolean): ThumbFiles {
  return {
    source: (mediaId, lod) => mediaFile(dir, mediaId, lod),
    sampleIndex: (mediaId, lod) => resolveFile(dir, sampleIndexPath(mediaId, lod)),
    read: (relPath) => resolveFile(dir, relPath),
    write: async (relPath, data) => {
      if (isWritable()) await writeFileAt(dir, relPath, data);
    },
  };
}

/** The project's files for the proxy jobs (the sources, cache/index/, cache/proxies/). */
function proxyFiles(dir: FsDir): ProxyFiles {
  return {
    source: (mediaId) => mediaFile(dir, mediaId, "full"),
    sampleIndex: (mediaId) => resolveFile(dir, sampleIndexPath(mediaId)),
    openPart: (mediaId) => openWritableAt(dir, proxyPartPath(mediaId)),
    commit: (mediaId) => renameFileAt(dir, proxyPartPath(mediaId), proxyPath(mediaId)),
    removePart: (mediaId) => removeFileAt(dir, proxyPartPath(mediaId)),
    remove: async (mediaId) => {
      await removeFileAt(dir, proxyPartPath(mediaId));
      await removeFileAt(dir, proxyPath(mediaId));
    },
    list: async () => {
      const cache = await dir.dir("cache");
      const proxies = await cache?.dir(PROXIES_DIR.slice(PROXIES_DIR.indexOf("/") + 1));
      return proxies ? (await proxies.list()).filter((entry) => entry.kind === "file").map((entry) => entry.name) : [];
    },
    removeName: (name) => removeFileAt(dir, `${PROXIES_DIR}/${name}`),
  };
}

const patch = (next: Partial<MediaPanelState>) => mediaPanel.set((state) => ({ ...state, ...next }));

/** Wires media to a newly opened project (after its document is loaded); `preview` is the frame service thumbnail decodes yield to. */
export function attachMedia(dir: FsDir, isWritable: () => boolean, preview?: ThumbnailDeps["preview"]): void {
  detachMedia();
  const posters = new PosterStore({ dir, pool: workerPool, isWritable, svgPoster, onChange: notifyArrival });
  const peaks = new PeaksJobs({ idle: idleQueue, document: documentStore, audio: decodedAudio, workers: workerPool, ...peaksFiles(dir, isWritable), onLoaded: notifyArrival });
  const thumbs = new ThumbnailStore({ idle: idleQueue, document: documentStore, workers: workerPool, files: thumbFiles(dir, isWritable), onArrival: notifyArrival, ...(preview && { preview }) });
  const analysis = new AnalysisScheduler({ peaks, thumbs });
  const proxies = new ProxyJobs({
    document: documentStore,
    workers: workerPool,
    files: proxyFiles(dir),
    settings: () => proxySettings(appSettings.getState()),
    watchSettings: (listener) => appSettings.subscribe(listener),
    idle: idleQueue,
    isWritable,
  });
  // Audio files the probe decodes (decodeAudioData) are not decoded again for playback and peaks.
  const decodedByFile = new WeakMap<File, AudioBuffer>();
  const probe = createProbeFile(workerPool, browserDecodeAudio(), (file, decoded) => {
    if (typeof AudioBuffer !== "undefined" && decoded instanceof AudioBuffer) decodedByFile.set(file, decoded);
  });
  const importer = new MediaImporter({
    dir,
    documentStore,
    probe,
    importMode: () => appSettings.getState().importMode,
    onAdded: (item, file) => {
      const decoded = decodedByFile.get(file);
      if (decoded) decodedAudio.put(item.id, decoded);
    },
  });
  open = {
    importer,
    posters,
    thumbs,
    peaks,
    analysis,
    proxies,
    controller: new AbortController(),
    isWritable,
    stops: [
      posters.attach(documentStore),
      analysis.attach(documentStore),
      proxies.progress.subscribe((progress) => proxyProgress.set(progress)),
      proxies.attach(),
      documentStore.subscribe(
        (state) => {
          const exists = (id: MediaId) => Object.hasOwn(state.media, id);
          const current = mediaPanel.getState();
          const selection = pruneSelection(current.selection, exists);
          const renaming = current.renaming !== null && !exists(current.renaming) ? null : current.renaming;
          if (selection !== current.selection || renaming !== current.renaming) patch({ selection, renaming });
          // Source ranges (session state) of media no longer in the project.
          const ranges = sessionStore.state.getState().sourceRanges;
          if (Object.keys(ranges).some((id) => !exists(id))) {
            sessionStore.state.set((session) => ({ ...session, sourceRanges: Object.fromEntries(Object.entries(session.sourceRanges).filter(([id]) => exists(id))) }));
          }
        },
        { affects: ["media"] },
      ),
    ],
  };
  mediaPanel.set({ selection: EMPTY_MEDIA_SELECTION, renaming: null, removing: null });
  cardImages.set({
    observe: (id, listener) =>
      documentStore.getState().media[id]?.kind === "video" ? thumbs.observeCard(id, listener) : posters.observe(id, (bitmap) => listener(wholeImage(bitmap))),
  });
  if (import.meta.env.DEV) Object.assign(((globalThis as { __editor?: Record<string, unknown> }).__editor ??= {}), { thumbs, proxies });
  notifyArrival();
}

/** Before the project closes: stops imports, frees posters (P13), drops queued analysis. */
export function detachMedia(): void {
  const current = open;
  open = null;
  if (!current) return;
  current.controller.abort();
  for (const stop of current.stops) stop();
  cardImages.set(null);
  current.posters.dispose();
  current.analysis.dispose();
  current.proxies.dispose();
  proxyProgress.set({ mediaId: null, fraction: 0 });
  mediaPanel.set({ selection: EMPTY_MEDIA_SELECTION, renaming: null, removing: null });
  mediaMenu.set(null);
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

/** Placing imported items right away (files dropped on the timeline, spec §6.14): one undo step with the import. */
export interface ImportPlacement {
  place: (items: readonly MediaItem[]) => void;
  label: string;
}

/** Imports files into the open project, with refusal, progress and failure toasts; `placement` adds their clips in the same undo step. */
export async function importMediaFiles(files: readonly File[], placement?: ImportPlacement): Promise<void> {
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
      ...(placement && { place: placement.place, placeLabel: placement.label }),
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

/**
 * The Import button and Mod+I (every media type), or `+ Image` (Batch 34: `types` images only, its
 * `placement` adding the clips in the import's undo step). Must run inside a user gesture.
 */
export async function importFromPicker(options: { types?: typeof PICKER_TYPES; id?: string; placement?: ImportPlacement } = {}): Promise<void> {
  if (!open) return;
  let handles: FileSystemFileHandle[];
  try {
    handles = await (window as unknown as FilePickerWindow).showOpenFilePicker({ multiple: true, id: options.id ?? "shorts-editor-media", types: options.types ?? PICKER_TYPES, excludeAcceptAllOption: false });
  } catch (error) {
    if (isAbortError(error)) return;
    showToast({ tone: "error", message: "Could not open the file picker", detail: errorMessage(error) });
    return;
  }
  await importMediaFiles(await Promise.all(handles.map((handle) => handle.getFile())), options.placement);
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

/** The files and folders (their files, recursively) of a drop. Reads the items synchronously: call it inside the event. */
export function filesFromTransfer(transfer: DataTransfer): Promise<File[]> {
  const items = [...transfer.items].filter((item) => item.kind === "file");
  const handles = items.map((item) => (item as unknown as HandleItem).getAsFileSystemHandle?.().catch(() => null) ?? Promise.resolve(null));
  const plain = items.map((item) => item.getAsFile());
  return (async () => {
    const files: File[] = [];
    for (const [i, pending] of handles.entries()) {
      const handle = await pending;
      if (handle) files.push(...(await filesIn(handle).catch(() => [])));
      else if (plain[i]) files.push(plain[i] as File);
    }
    return files;
  })();
}

/** Files and folders dropped on the media panel. */
export function dropMedia(transfer: DataTransfer): void {
  void filesFromTransfer(transfer).then((files) => importMediaFiles(files));
}

export function selectMedia(id: MediaId, mods: { toggle: boolean; range: boolean }, order: readonly MediaId[]): void {
  patch({ selection: clickSelection(mediaPanel.getState().selection, id, mods, order) });
}

export function clearMediaSelection(): void {
  if (mediaPanel.getState().selection.ids.size > 0) patch({ selection: EMPTY_MEDIA_SELECTION });
}

/** The selected media in selection order (spec §6.14: multi-drops go back to back in that order). */
export function selectedMedia(): MediaId[] {
  const media = documentStore.getState().media;
  return [...mediaPanel.getState().selection.ids].filter((id) => Object.hasOwn(media, id));
}

/** A right-click on a card (spec §12): it is selected (alone, unless already selected), then its menu opens. */
export function openMediaMenu(id: MediaId, x: number, y: number): void {
  if (!mediaPanel.getState().selection.ids.has(id)) patch({ selection: { ids: new Set([id]), anchor: id } });
  mediaMenu.set({ x, y });
}

/** The menu closed: the keyboard goes back to the media panel (the menu owned it as a dialog). */
export function closeMediaMenu(): void {
  if (!mediaMenu.getState()) return;
  mediaMenu.set(null);
  focusScopes.set("media");
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

/** Playback fell behind on a media (Auto quality): a proxy is queued when none was decided yet. */
export function requestProxyIfUndecided(mediaId: MediaId): void {
  open?.proxies.generateIfUndecided(mediaId);
}

const readOnlyToast = () => showToast({ tone: "error", message: "This project is read-only", detail: "Allow editing to change proxies." });

/** Generate proxy (media menu, spec §12): the selected videos without a ready or running proxy. */
export function generateProxies(): void {
  if (open && !open.proxies.generate(selectedMedia())) readOnlyToast();
}

/** Remove proxy: cancels running jobs (their .part goes) and deletes the proxies of the selected media. */
export function removeProxies(): void {
  if (open && !open.proxies.remove(selectedMedia())) readOnlyToast();
}

/** Regenerate thumbnails of the selected videos (from the proxy when it is ready). */
export function regenerateThumbnails(): void {
  for (const id of selectedMedia()) open?.thumbs.regenerate(id);
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

type MediaPanelSession = SessionState["mediaPanel"];

function setPanelSession(patch: Partial<MediaPanelSession>): void {
  sessionStore.state.set((state) => ({ ...state, mediaPanel: { ...state.mediaPanel, ...patch } }));
}

/** A Media panel tab (the tab strip's buttons, the palette). */
function showTab(tab: MediaPanelSession["tab"]): void {
  setPanelSession({ tab });
  focusScopes.set("media");
}

/** The media of the primary selected clip (a video, audio or image clip), or null. */
function selectedClipMedia(): MediaId | null {
  const selection = sessionStore.selection.getState();
  if (selection.kind !== "clips" || selection.primary === null) return null;
  const clip = documentStore.getState().clips[selection.primary];
  return clip && "mediaId" in clip && documentStore.getState().media[clip.mediaId] ? clip.mediaId : null;
}

/** Reveal in media panel (spec §6.16): the Media tab, the clip's media selected and scrolled into view. */
function revealSelectedMedia(): void {
  const id = selectedClipMedia();
  if (id === null) return;
  showTab("media");
  mediaPanel.set((state) => ({ ...state, selection: { ids: new Set([id]), anchor: id } }));
  // After the tab renders its cards.
  requestAnimationFrame(() => document.querySelector(`[data-media-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "nearest" }));
}

/** Registers the media actions and the paste listener. Returns a stop function. */
export function installMediaController(doc: Document = document): () => void {
  doc.addEventListener("paste", onPaste);
  const stops = [
    () => doc.removeEventListener("paste", onPaste),
    actions.register("media.import", () => void importFromPicker()),
    actions.register("media.generateProxy", generateProxies),
    actions.register("media.removeProxy", removeProxies),
    actions.register("media.regenerateThumbnails", regenerateThumbnails),
    actions.register("media.viewGrid", () => setPanelSession({ view: "grid" })),
    actions.register("media.viewList", () => setPanelSession({ view: "list" })),
    actions.register("media.toggleSortDirection", () => setPanelSession({ descending: !sessionStore.state.getState().mediaPanel.descending })),
    actions.register("panel.media", () => showTab("media")),
    actions.register("panel.presets", () => showTab("presets")),
    actions.register("panel.captions", () => showTab("captions")),
    actions.register("clip.revealMedia", revealSelectedMedia, { enabled: () => selectedClipMedia() !== null }),
    // Delete and F2 in the media panel (`edit.delete`, `edit.rename`) are routed here by cutController.
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
