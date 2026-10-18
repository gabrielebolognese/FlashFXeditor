// Media flows of the open project (spec §9.1, §12): import from the picker (button, Mod+I), drops and
// pasted images, copied into media/ or linked (reference mode, Batch 41); posters, thumbnail sheets and
// peaks per project (the media cards' pictures and the timeline's clip visuals, `clipVisuals`; the
// hover-scrub's sheets, `scrubSheets`); proxies (§9.5: `ProxyJobs`, their progress in `proxyProgress`,
// Generate / Remove proxy and Regenerate thumbnails); panel selection, inline rename, removal (used
// media keep offline clips or lose them, the copied files optionally deleted) and the context menu;
// source ranges of removed media are dropped.
// Batch 41: bins (new, rename, delete, move to), the filter chips and the search, offline media (found
// on open through `MediaSources`, read access asked for again, Relink one file or a folder) and Reveal
// in folder (the path, copied). Framework-free; the media panel reads `mediaPanel` through narrow
// selectors.
import { addBin, clipsOfMedia, mediaUseCounts, nextBinName, relinkMedia, removeBin, removeMedia, renameBin, renameMedia, setMediaBin, type RelinkFields } from "../core/commands/mediaCommands.js";
import { isMediaClip, type MediaId, type MediaItem } from "../core/document/types.js";
import { isEditableTarget } from "../core/keyboard/KeyDispatcher.js";
import { createStore } from "../core/store/createStore.js";
import { filterSelection, toSnapshot } from "../core/store/selection.js";
import type { SessionState } from "../core/store/sessionStore.js";
import { AnalysisScheduler } from "../media/AnalysisScheduler.js";
import { PeaksJobs } from "../media/PeaksJobs.js";
import { browserDecodeAudio } from "../media/probe/audioProbe.js";
import { createProbeFile, MediaImporter, type ImportSource, type ProbeFile, type Refusal } from "../media/MediaImporter.js";
import { ProxyJobs, type ProxyFiles, type ProxyProgress } from "../media/ProxyJobs.js";
import { classifyFile, PICKER_TYPES } from "../media/mediaKinds.js";
import { PosterStore } from "../media/PosterStore.js";
import { svgPoster } from "../media/probe/svgProbe.js";
import { ThumbnailStore, type ThumbFiles, type ThumbnailDeps } from "../media/ThumbnailStore.js";
import { isAbortError } from "../media/workers/protocol.js";
import type { ScrubSheets } from "../panels/media/hoverScrub.js";
import { clickSelection, EMPTY_MEDIA_SELECTION, mediaMatcher, mediaPath, pruneSelection, revealQuery, shownBin, shownSelection, sortMedia, type MediaQuery, type MediaSelection } from "../panels/media/mediaList.js";
import { PosterPainter, wholeImage, type PosterSource } from "../panels/media/PosterPainter.js";
import { errorMessage } from "../project/errorMessage.js";
import type { FsDir } from "../project/fs.js";
import { proxySettings } from "../project/appSettings.js";
import { copyIntoMedia, MEDIA_DIR, openWritableAt, peaksPath, posterPath, PROXIES_DIR, proxyPartPath, proxyPath, removeFileAt, renameFileAt, resolveFile, sampleIndexPath, takenNames, thumbIndexPath, writeFileAt } from "../project/mediaFiles.js";
import { subdir } from "../project/layout.js";
import { MediaSources, sameContent, sameFile, type FileHandleLike } from "../project/mediaSources.js";
import { listFolderFiles, matchFolderFiles, MAX_FOLDER_FILES, type DirHandleLike } from "../project/relink.js";
import type { ClipVisualsSource } from "../timeline/view/clipVisuals.js";
import { dismissToast, showToast, updateToast } from "../ui/toasts.js";
import { decodedAudio, peaksFiles } from "./audioController.js";
import { mediaSources, mediaStatus, offlineReason, onRefreshMedia, refreshMedia, setMediaSources, sourceFile } from "./mediaOffline.js";
import { actions, appSettings, documentStore, focusScopes, idleQueue, keyValueStore, scheduler, sessionStore, workerPool } from "./services.js";

export interface MediaPanelState {
  selection: MediaSelection;
  /** Media whose name is being edited inline. */
  renaming: MediaId | null;
  /** Media waiting for the Remove dialog. */
  removing: readonly MediaId[] | null;
  /** The bin whose name is being edited inline (Batch 41). */
  renamingBin: string | null;
  /** The search field's words (spec §12; not kept in session.json). */
  search: string;
}

const initialPanel = (): MediaPanelState => ({ selection: EMPTY_MEDIA_SELECTION, renaming: null, removing: null, renamingBin: null, search: "" });

export const mediaPanel = createStore<MediaPanelState>(initialPanel());

/** The media context menu (spec §12) open at a page point, or null. */
export const mediaMenu = createStore<{ x: number; y: number } | null>(null);

/** A bin chip's menu (Rename, Delete bin) open at a page point, or null. */
export const binMenu = createStore<{ x: number; y: number; binId: string } | null>(null);

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
  dir: FsDir;
  importer: MediaImporter;
  probe: ProbeFile;
  sources: MediaSources;
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
  offline: (mediaId) => offlineReason(mediaId) !== null,
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

/** A media's source file (copied or linked, Batch 41), or its ready proxy (`lod` "proxy"); null when missing. */
function mediaFile(dir: FsDir, mediaId: MediaId, lod: "full" | "proxy"): Promise<File | null> {
  const item = documentStore.getState().media[mediaId];
  if (!item) return Promise.resolve(null);
  if (lod === "proxy") return item.proxy?.status === "ready" ? resolveFile(dir, item.proxy.relPath) : Promise.resolve(null);
  return sourceFile(mediaId);
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

/**
 * Wires media to a newly opened project (after its document is loaded); `preview` is the frame service
 * thumbnail decodes yield to. `announceOffline` false: no offline toast (attached again after Clear cache).
 */
export function attachMedia(dir: FsDir, isWritable: () => boolean, preview?: ThumbnailDeps["preview"], options: { announceOffline?: boolean } = {}): void {
  detachMedia();
  // The media files (copied or linked) and which are offline: the panel, timeline, preview and audio read them.
  const sources = new MediaSources({ dir, kv: keyValueStore, media: () => documentStore.getState().media, status: mediaStatus });
  setMediaSources(sources);
  const posters = new PosterStore({ dir, pool: workerPool, isWritable, svgPoster, onChange: notifyArrival, file: sourceFile });
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
    storeHandle: (key, handle) => sources.storeHandle(key, handle),
    onAdded: (item, file) => {
      const decoded = decodedByFile.get(file);
      if (decoded) decodedAudio.put(item.id, decoded);
    },
  });
  open = {
    dir,
    importer,
    probe,
    sources,
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
      // Offline media change how clips are drawn (the timeline's slates).
      mediaStatus.subscribe(notifyArrival),
      // A media back online (relinked, access granted): its poster, sheets and peaks load again.
      onRefreshMedia((ids) => {
        posters.refresh(ids);
        const media = documentStore.getState().media;
        for (const id of ids) {
          thumbs.retry(id);
          peaks.forget(id);
          if (media[id]?.hasAudio) peaks.request(id);
        }
        notifyArrival();
      }),
      proxies.progress.subscribe((progress) => proxyProgress.set(progress)),
      proxies.attach(),
      // New media and changed files are checked, removed media lose their offline status.
      sources.attach(documentStore),
      documentStore.subscribe(
        (state, prev) => {
          const exists = (id: MediaId) => Object.hasOwn(state.media, id);
          const refiled = Object.keys(state.media).filter((id) => Object.hasOwn(prev.media, id) && !sameFile((prev.media[id] as MediaItem).file, (state.media[id] as MediaItem).file));
          if (refiled.length > 0 && open) filesChanged(open, refiled, prev.media, state.media);
          const current = mediaPanel.getState();
          const selection = pruneSelection(current.selection, exists);
          const renaming = current.renaming !== null && !exists(current.renaming) ? null : current.renaming;
          const renamingBin = current.renamingBin !== null && !state.bins.some((bin) => bin.id === current.renamingBin) ? null : current.renamingBin;
          if (selection !== current.selection || renaming !== current.renaming || renamingBin !== current.renamingBin) patch({ selection, renaming, renamingBin });
          // Source ranges (session state) of media no longer in the project.
          const ranges = sessionStore.state.getState().sourceRanges;
          if (Object.keys(ranges).some((id) => !exists(id))) {
            sessionStore.state.set((session) => ({ ...session, sourceRanges: Object.fromEntries(Object.entries(session.sourceRanges).filter(([id]) => exists(id))) }));
          }
        },
        { affects: ["media"] },
      ),
      // Media moved out of the shown bin, or used while Unused is on, leave the selection.
      documentStore.subscribe(keepShownSelection, { affects: ["media", "clips"] }),
    ],
  };
  mediaPanel.set(initialPanel());
  cardImages.set({
    observe: (id, listener) =>
      documentStore.getState().media[id]?.kind === "video" ? thumbs.observeCard(id, listener) : posters.observe(id, (bitmap) => listener(wholeImage(bitmap))),
  });
  if (import.meta.env.DEV) Object.assign(((globalThis as { __editor?: Record<string, unknown> }).__editor ??= {}), { thumbs, proxies, sources });
  notifyArrival();
  void findOfflineMedia(open, options.announceOffline ?? true);
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * On open (spec §12 missing media, §9.1 "asks for re-permission on open"): every media's file is
 * checked; linked files waiting for read access are asked for at once when the open came from a
 * click (the browser needs one), else the Media tab's Allow access does it. Offline media are named in
 * a toast.
 */
async function findOfflineMedia(current: OpenMedia, announce: boolean): Promise<void> {
  await current.sources.checkAll();
  if (open !== current) return;
  const activation = (navigator as { userActivation?: { isActive: boolean } }).userActivation;
  if (current.sources.waitingForAccess().length > 0 && activation?.isActive) await current.sources.requestAccess();
  if (open !== current) return;
  const offline = [...mediaStatus.getState()];
  if (offline.length === 0 || !announce) return;
  const waiting = offline.filter(([, status]) => status === "permission").length;
  showToast({
    tone: "error",
    message: `${plural(offline.length, "media file")} offline`,
    detail: waiting === offline.length ? "Click Allow access in the Media panel to read the linked files." : "Their clips show a gray slate. Relink them from the Media panel.",
  });
}

/**
 * Media whose file changed (a relink, its undo or redo, spec §12; `MediaSources` checks them again):
 * when the file holds other content now, what was made from the other one goes at once and is made
 * again (the image poster, the sheets, the peaks, the proxy); media online before and after load their
 * file again (a status change does it for the others).
 */
function filesChanged(current: OpenMedia, ids: readonly MediaId[], prev: Readonly<Record<MediaId, MediaItem>>, next: Readonly<Record<MediaId, MediaItem>>): void {
  const replaced = ids.filter((id) => !sameContent(prev[id] as MediaItem, next[id] as MediaItem));
  current.posters.regenerate(replaced);
  for (const id of replaced) {
    current.thumbs.replace(id);
    current.peaks.forget(id);
  }
  current.proxies.filesChanged(ids, replaced);
  if (replaced.length > 0) notifyArrival();
  const online = (id: MediaId) => !mediaStatus.getState().has(id);
  const wereOnline = ids.filter(online);
  void current.sources.whenChecked().then(() => {
    if (open === current) refreshMedia(wereOnline.filter(online));
  });
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
  setMediaSources(null);
  proxyProgress.set({ mediaId: null, fraction: 0 });
  mediaPanel.set(initialPanel());
  mediaMenu.set(null);
  binMenu.set(null);
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

/**
 * Imports files into the open project, with refusal, progress and failure toasts; `placement` adds
 * their clips in the same undo step. Files that come with their handle are linked in reference mode.
 */
export async function importMediaFiles(files: readonly ImportSource[], placement?: ImportPlacement): Promise<void> {
  const current = open;
  if (!current || files.length === 0) return;
  if (!current.isWritable()) {
    showToast({ tone: "error", message: "This project is read-only", detail: "Allow editing to import media." });
    return;
  }
  const totalBytes = files.reduce((sum, source) => sum + (source instanceof File ? source : source.file).size, 0);
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
      // New media the bin, the chips or the search hide are not selected.
      keepShownSelection();
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
  await importMediaFiles(await Promise.all(handles.map(async (handle) => ({ file: await handle.getFile(), handle: handle as unknown as FileHandleLike }))), options.placement);
}

interface HandleItem {
  getAsFileSystemHandle?(): Promise<FileSystemHandle | null>;
}

/** The files under a dropped handle, with their handles and paths ("Folder/sub/clip.mp4") for reference mode. */
async function filesIn(handle: FileSystemHandle, prefix = ""): Promise<ImportSource[]> {
  if (handle.kind === "file") return [{ file: await (handle as FileSystemFileHandle).getFile(), handle: handle as unknown as FileHandleLike, path: `${prefix}${handle.name}` }];
  const files: ImportSource[] = [];
  for await (const entry of (handle as FileSystemDirectoryHandle).values()) files.push(...(await filesIn(entry, `${prefix}${handle.name}/`)));
  return files;
}

/** The files and folders (their files, recursively) of a drop. Reads the items synchronously: call it inside the event. */
export function filesFromTransfer(transfer: DataTransfer): Promise<ImportSource[]> {
  const items = [...transfer.items].filter((item) => item.kind === "file");
  const handles = items.map((item) => (item as unknown as HandleItem).getAsFileSystemHandle?.().catch(() => null) ?? Promise.resolve(null));
  const plain = items.map((item) => item.getAsFile());
  return (async () => {
    const files: ImportSource[] = [];
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

/**
 * The Remove dialog's choice (spec §12): "Remove from project" (`keep`: used media leave offline
 * clips) or "Remove and delete clips" (`delete`), one undoable command; with `deleteFiles` the copied
 * files go from media/ too (not undoable: the media come back offline).
 */
export function confirmRemove(clips: "keep" | "delete" = "keep", deleteFiles = false): void {
  const ids = mediaPanel.getState().removing ?? [];
  patch({ removing: null });
  const current = open;
  if (ids.length === 0 || !current) return;
  if (!current.isWritable()) {
    showToast({ tone: "error", message: "This project is read-only", detail: "Allow editing to remove media." });
    return;
  }
  const before = documentStore.getState().media;
  // Deleted clips leave the timeline selection.
  const deleted = new Set(clips === "delete" ? clipsOfMedia(documentStore.getState(), ids) : []);
  const selection = filterSelection(toSnapshot(sessionStore.selection.getState()), (id) => !deleted.has(id));
  try {
    documentStore.dispatch(removeMedia(ids, clips), { selection });
  } catch (error) {
    showToast({ tone: "error", message: "Could not remove the media", detail: errorMessage(error) });
    return;
  }
  if (deleteFiles) void deleteCopiedFiles(current, ids.map((id) => before[id]).filter((item): item is MediaItem => item !== undefined));
}

/** The copied files of removed media that no other media item uses (spec §12 "delete the copied file from media/"). */
export function copiedFiles(items: readonly MediaItem[], remaining: Readonly<Record<MediaId, MediaItem>>): string[] {
  const kept = new Set(Object.values(remaining).map(mediaPath));
  const paths = items.map((item) => ("relPath" in item.file ? item.file.relPath : null)).filter((path): path is string => path !== null && path.startsWith(`${MEDIA_DIR}/`));
  return [...new Set(paths)].filter((path) => !kept.has(path));
}

async function deleteCopiedFiles(current: OpenMedia, items: readonly MediaItem[]): Promise<void> {
  const paths = copiedFiles(items, documentStore.getState().media);
  const failed: string[] = [];
  for (const path of paths) await removeFileAt(current.dir, path).catch(() => failed.push(path));
  if (failed.length > 0) showToast({ tone: "error", message: `Could not delete ${plural(failed.length, "file")}`, detail: failed.join(" · ") });
  else if (paths.length > 0) showToast({ tone: "success", message: `Deleted ${plural(paths.length, "file")} from media/` });
}

/** How many clips use any of `ids` (the Remove dialog). */
export function clipsUsing(ids: readonly MediaId[]): number {
  return clipsOfMedia(documentStore.getState(), ids).length;
}

/** How many of `ids` have a copy in media/ (the Remove dialog's file checkbox). */
export function copiedCount(ids: readonly MediaId[]): number {
  const media = documentStore.getState().media;
  return ids.filter((id) => {
    const item = media[id];
    return item !== undefined && "relPath" in item.file && item.file.relPath.startsWith(`${MEDIA_DIR}/`);
  }).length;
}

// ---- Bins, filter chips, search (spec §12, Batch 41) ----

type MediaPanelSessionState = SessionState["mediaPanel"];

/** What the Media tab shows now: the shown bin, the filter chips and the search. */
function shownQuery(): MediaQuery {
  const panel = sessionStore.state.getState().mediaPanel;
  return { bin: shownBin(panel.bin, documentStore.getState().bins), filters: panel.filters, search: mediaPanel.getState().search };
}

/** The media the Media tab shows, in its order: the bin, the filter chips and the search over the sorted media. */
export function visibleMedia(): MediaItem[] {
  const project = documentStore.getState();
  const panel = sessionStore.state.getState().mediaPanel;
  const uses = mediaUseCounts(project);
  return sortMedia(Object.values(project.media).filter(mediaMatcher(shownQuery(), uses)), panel.sort, panel.descending, uses);
}

/**
 * The selection keeps only what the Media tab shows (spec §12): media a bin, a chip or the search
 * hide are never removed, moved to a bin or dragged with the shown ones.
 */
function keepShownSelection(): void {
  const { selection } = mediaPanel.getState();
  if (selection.ids.size === 0 && selection.anchor === null) return;
  const project = documentStore.getState();
  const next = shownSelection(selection, project.media, mediaMatcher(shownQuery(), mediaUseCounts(project)));
  if (next !== selection) patch({ selection: next });
}

/** Mod+A in the Media tab: every media it shows. */
export function selectAllMedia(): void {
  const ids = visibleMedia().map((item) => item.id);
  patch({ selection: { ids: new Set(ids), anchor: ids[0] ?? null } });
}

export function setMediaSearch(search: string): void {
  if (mediaPanel.getState().search === search) return;
  patch({ search });
  keepShownSelection();
}

function setPanelFilters(next: Partial<MediaPanelSessionState["filters"]>): void {
  sessionStore.state.set((state) => ({ ...state, mediaPanel: { ...state.mediaPanel, filters: { ...state.mediaPanel.filters, ...next } } }));
  keepShownSelection();
}

/** A kind's filter chip (Video, Audio, Image): any checked kinds show. */
function toggleKind(kind: MediaItem["kind"]): void {
  const { kinds } = sessionStore.state.getState().mediaPanel.filters;
  setPanelFilters({ kinds: kinds.includes(kind) ? kinds.filter((k) => k !== kind) : [...kinds, kind] });
}

/** Shows a bin: a virtual one (all, video, audio, image) or a bin id. */
export function showBin(bin: string): void {
  if (sessionStore.state.getState().mediaPanel.bin === bin) return;
  setPanelSession({ bin });
  keepShownSelection();
}

function writable(action: string): boolean {
  if (open?.isWritable()) return true;
  showToast({ tone: "error", message: "This project is read-only", detail: `Allow editing to ${action}.` });
  return false;
}

/** New bin (spec §12): added at the end of the strip, its name edited at once. */
export function newBin(): void {
  if (!writable("add bins")) return;
  const id = crypto.randomUUID();
  documentStore.dispatch(addBin({ id, name: nextBinName(documentStore.getState().bins) }));
  patch({ renamingBin: id });
}

export function startBinRename(id: string): void {
  if (documentStore.getState().bins.some((bin) => bin.id === id) && open?.isWritable()) patch({ renamingBin: id });
}

/** Ends a bin's inline rename; `name` null cancels. One undoable command when the name changed. */
export function finishBinRename(id: string, name: string | null): void {
  if (mediaPanel.getState().renamingBin === id) patch({ renamingBin: null });
  const bin = documentStore.getState().bins.find((other) => other.id === id);
  if (name !== null && bin && name.trim() !== bin.name && name.trim() !== "") documentStore.dispatch(renameBin(id, name));
}

/** Deletes a bin; its media stay in the project. The strip shows All when it showed that bin. */
export function deleteBin(id: string): void {
  if (!writable("delete bins")) return;
  documentStore.dispatch(removeBin(id));
  if (sessionStore.state.getState().mediaPanel.bin === id) setPanelSession({ bin: "all" });
}

/** Moves media into a bin (null: out of every bin); the selection when `ids` is not given (Move to bin, a drop on a bin chip). */
export function moveToBin(binId: string | null, ids: readonly MediaId[] = selectedMedia()): void {
  if (ids.length === 0 || !writable("move media")) return;
  const media = documentStore.getState().media;
  const moving = ids.filter((id) => (media[id]?.binId ?? null) !== binId);
  if (moving.length > 0) documentStore.dispatch(setMediaBin(moving, binId));
}

export function openBinMenu(binId: string, x: number, y: number): void {
  binMenu.set({ x, y, binId });
}

export function closeBinMenu(): void {
  if (!binMenu.getState()) return;
  binMenu.set(null);
  focusScopes.set("media");
}

// ---- Offline media: access, relink, reveal (spec §12, §9.1, Batch 41) ----

/** The selected media that are offline (missing, waiting for access, undecodable). */
export function selectedOffline(): MediaId[] {
  const status = mediaStatus.getState();
  return selectedMedia().filter((id) => status.has(id));
}

/** Allow access: the browser's read permission for the linked files that wait for it (a user gesture). */
export async function allowMediaAccess(): Promise<void> {
  const sources = mediaSources();
  if (!sources) return;
  const left = await sources.requestAccess();
  if (left > 0) showToast({ tone: "error", message: `${plural(left, "linked file")} still offline`, detail: "The browser did not allow reading them. Try again, or relink them." });
}

const relinkId = () => {
  const offline = selectedOffline();
  const { anchor } = mediaPanel.getState().selection;
  return anchor !== null && offline.includes(anchor) ? anchor : (offline[0] ?? null);
};

/** A file picked or found for an offline media item. */
interface RelinkSource {
  id: MediaId;
  file: File;
  handle: FileHandleLike | null;
  path?: string;
}

/** The picker's types of a media kind (the file must be of that kind). */
function pickerTypesOf(kind: MediaItem["kind"]): typeof PICKER_TYPES {
  const description = kind === "video" ? "Video" : kind === "audio" ? "Audio" : "Images";
  const types = PICKER_TYPES.filter((type) => type.description.startsWith(description));
  return types.length > 0 ? types : PICKER_TYPES;
}

/** Relink (spec §12): a file picker for one offline media (the anchor of the selection). Must run inside a user gesture. */
export async function relinkFromPicker(): Promise<void> {
  const id = relinkId();
  const item = id !== null ? documentStore.getState().media[id] : undefined;
  if (!open || !item || !writable("relink media")) return;
  let handles: FileSystemFileHandle[];
  try {
    handles = await (window as unknown as FilePickerWindow).showOpenFilePicker({ multiple: false, id: "shorts-editor-relink", types: pickerTypesOf(item.kind), excludeAcceptAllOption: false });
  } catch (error) {
    if (isAbortError(error)) return;
    showToast({ tone: "error", message: "Could not open the file picker", detail: errorMessage(error) });
    return;
  }
  const [handle] = handles;
  if (!handle) return;
  const report = await applyRelinks([{ id: item.id, file: await handle.getFile(), handle: handle as unknown as FileHandleLike }]);
  if (report.done === 1) showToast({ tone: "success", message: `Relinked ${item.name}` });
  else showToast({ tone: "error", message: `Can't relink ${item.name}`, detail: report.refused[0] ?? "" });
}

interface DirectoryPickerWindow {
  showDirectoryPicker(options: { id?: string; mode: "read" | "readwrite" }): Promise<DirHandleLike>;
}

/**
 * Relink folder (spec §12 "matched by name/size when relinking folders"): the selected offline media
 * (every offline media when none is selected) are matched with the folder's files, then relinked in
 * one undo step. Must run inside a user gesture.
 */
export async function relinkFromFolder(): Promise<void> {
  const current = open;
  if (!current || !writable("relink media")) return;
  const status = mediaStatus.getState();
  const selected = selectedOffline();
  const ids = selected.length > 0 ? selected : [...status.keys()];
  const media = documentStore.getState().media;
  const items = ids.map((id) => media[id]).filter((item): item is MediaItem => item !== undefined);
  if (items.length === 0) {
    showToast({ tone: "info", message: "No offline media to relink" });
    return;
  }
  let folder: DirHandleLike;
  try {
    folder = await (window as unknown as DirectoryPickerWindow).showDirectoryPicker({ id: "shorts-editor-relink", mode: "read" });
  } catch (error) {
    if (isAbortError(error)) return;
    showToast({ tone: "error", message: "Could not open the folder picker", detail: errorMessage(error) });
    return;
  }
  const toast = showToast({ tone: "info", message: `Looking for ${plural(items.length, "file")} in ${folder.name}…`, progress: 0 });
  try {
    const { files, truncated } = await listFolderFiles(folder);
    const matches = await matchFolderFiles(items, files, async (file) => (await file.handle.getFile()).size);
    const sources: RelinkSource[] = [];
    for (const [id, found] of matches) sources.push({ id, file: await found.handle.getFile(), handle: found.handle, path: found.path });
    const report = await applyRelinks(sources);
    dismissToast(toast);
    // Files not found, the search cut short, then the files found but refused (wrong kind, too short).
    const missed = items.length - matches.size;
    const notes = [
      ...(missed > 0 ? [`${plural(missed, "file")} not found in ${folder.name} (same name${items.some((item) => item.size !== undefined) ? " and size" : ""})`] : []),
      ...(truncated ? [`only its first ${MAX_FOLDER_FILES.toLocaleString("en-US")} files were searched`] : []),
      ...report.refused,
    ];
    showToast({
      tone: report.done > 0 ? "success" : "error",
      message: `Relinked ${report.done} of ${plural(items.length, "offline file")}`,
      detail: notes.join(" · "),
    });
  } catch (error) {
    dismissToast(toast);
    showToast({ tone: "error", message: "Relink failed", detail: errorMessage(error) });
  }
}

/** Where a relinked file goes: copied items get a copy in media/, linked ones the new handle; offline paste records follow the import mode. */
function relinkKeepsCopy(item: MediaItem): boolean {
  if ("relPath" in item.file) return true;
  return item.file.handleKey === "" && appSettings.getState().importMode === "copy";
}

/** What the clips of a media need from its file: the longest source range (us; 0 for stills), and sound when audio clips use it. */
function neededByClips(id: MediaId): { durationUs: number; audio: boolean } {
  let durationUs = 0;
  let audio = false;
  for (const clip of Object.values(documentStore.getState().clips)) {
    if (!isMediaClip(clip) || clip.mediaId !== id) continue;
    if (clip.kind !== "image") durationUs = Math.max(durationUs, clip.out);
    if (clip.kind === "audio") audio = true;
  }
  return { durationUs, audio };
}

/** Why a probed file cannot stand in for a media's clips, or null when it can. */
function relinkRefusal(name: string, id: MediaId, probe: { durationUs: number; hasAudio: boolean }): string | null {
  const needed = neededByClips(id);
  if (probe.durationUs < needed.durationUs) return `${name} is shorter than its clips need`;
  if (needed.audio && !probe.hasAudio) return `${name} has no sound for its audio clips`;
  return null;
}

/** Deletes a media's disposable caches (sample index, sheets, poster, peaks, proxy): its file changed. */
async function dropMediaCaches(dir: FsDir, id: MediaId): Promise<void> {
  const index = await resolveFile(dir, thumbIndexPath(id)).catch(() => null);
  const paths = [sampleIndexPath(id), sampleIndexPath(id, "proxy"), posterPath(id), peaksPath(id), proxyPath(id), proxyPartPath(id), ...(index ? [thumbIndexPath(id)] : [])];
  await Promise.all(paths.map((path) => removeFileAt(dir, path).catch(() => undefined)));
}

/** A file ready to stand in for an offline media: probed, copied into media/ (`copied`) or linked. */
interface RelinkEntry {
  id: MediaId;
  name: string;
  probe: { durationUs: number; hasAudio: boolean };
  fields: RelinkFields;
  /** The file holds other content than the media's record describes. */
  changed: boolean;
  copied: string | null;
}

/** Probes, checks and copies (or links) the files of a relink; null when the project closed meanwhile. */
async function prepareRelinks(current: OpenMedia, sources: readonly RelinkSource[], refused: string[]): Promise<RelinkEntry[] | null> {
  const media = documentStore.getState().media;
  const taken = await takenNames(await subdir(current.dir, MEDIA_DIR));
  const entries: RelinkEntry[] = [];
  for (const source of sources) {
    const item = media[source.id];
    if (!item) continue;
    const name = source.file.name;
    const kind = classifyFile(name, source.file.type);
    if (!kind) {
      refused.push(`${name}: unsupported file type`);
      continue;
    }
    let probe;
    try {
      probe = await current.probe(source.file, kind, current.controller.signal);
    } catch (error) {
      if (isAbortError(error)) return null;
      refused.push(`${name}: ${errorMessage(error)}`);
      continue;
    }
    if (probe.kind !== item.kind) {
      refused.push(`${name} is ${probe.kind === "image" ? "an image" : `${probe.kind}`}, not ${item.kind === "image" ? "an image" : item.kind}`);
      continue;
    }
    const refusal = relinkRefusal(name, item.id, probe);
    if (refusal) {
      refused.push(refusal);
      continue;
    }
    let file: MediaItem["file"];
    try {
      if (relinkKeepsCopy(item) || !source.handle) {
        file = { relPath: await copyIntoMedia(current.dir, source.file, name, taken, { signal: current.controller.signal }) };
      } else {
        const key = crypto.randomUUID();
        await current.sources.storeHandle(key, source.handle);
        file = { handleKey: key, pathHint: source.path ?? name };
      }
    } catch (error) {
      if (isAbortError(error)) return null;
      refused.push(`${name}: ${errorMessage(error)}`);
      continue;
    }
    const changed = !sameContent(item, { size: source.file.size, durationUs: probe.durationUs, width: probe.width, height: probe.height });
    const fields: RelinkFields = { file, size: source.file.size };
    if (changed) {
      Object.assign(fields, {
        durationUs: probe.durationUs,
        width: probe.width,
        height: probe.height,
        rotation: probe.kind === "video" ? probe.rotation : undefined,
        fps: probe.fps ? { ...probe.fps } : undefined,
        hasAudio: probe.hasAudio,
        codec: probe.codec,
        audioCodec: probe.audioCodec,
        analysis: { thumbs: probe.kind === "video" ? "pending" : "none", peaks: probe.hasAudio ? "pending" : "none" },
        proxy: undefined,
      } satisfies Partial<RelinkFields>);
    } else if (item.proxy?.status === "failed") {
      // The proxy failed for want of its file: decided again.
      fields.proxy = undefined;
    }
    entries.push({ id: item.id, name, probe, fields, changed, copied: "relPath" in file ? file.relPath : null });
  }
  return entries;
}

/**
 * Relinks offline media to new files: each is probed (its kind must match and it must hold the
 * clips' source ranges, with sound for their audio clips), copied into media/ (with no import running:
 * unique names) or linked, checked again against the clips (a trim may have run during a long copy),
 * then all in one undo step (`media.relink`). A different file (size or duration) drops the media's
 * caches on disk first; the document subscription (`filesChanged`) makes them again and `MediaSources`
 * checks the new files.
 */
async function applyRelinks(sources: readonly RelinkSource[]): Promise<{ done: number; refused: string[] }> {
  const current = open;
  const refused: string[] = [];
  if (!current || sources.length === 0) return { done: 0, refused };
  const entries = await current.importer.exclusive(() => prepareRelinks(current, sources, refused));
  if (!entries || open !== current) return { done: 0, refused };
  const ready: RelinkEntry[] = [];
  for (const entry of entries) {
    const refusal = documentStore.getState().media[entry.id] ? relinkRefusal(entry.name, entry.id, entry.probe) : `${entry.name}: its media was removed`;
    if (!refusal) {
      ready.push(entry);
      continue;
    }
    refused.push(refusal);
    if (entry.copied) await removeFileAt(current.dir, entry.copied).catch(() => undefined);
  }
  if (ready.length === 0) return { done: 0, refused };
  for (const entry of ready) if (entry.changed) await dropMediaCaches(current.dir, entry.id);
  if (open !== current) return { done: 0, refused };
  documentStore.dispatch(relinkMedia(ready.map(({ id, fields }) => ({ id, fields }))));
  await current.sources.whenChecked();
  return { done: ready.length, refused };
}

/** Reveal in folder (spec §12): the browser cannot open folders, so the path is shown and copied. */
export async function revealMediaPath(): Promise<void> {
  const { anchor } = mediaPanel.getState().selection;
  const media = documentStore.getState().media;
  const item = (anchor !== null ? media[anchor] : undefined) ?? media[selectedMedia()[0] ?? ""];
  if (!item) return;
  const path = mediaPath(item);
  const where = "relPath" in item.file ? `In the project folder: ${path}` : item.file.handleKey === "" ? `Offline, last at ${path}` : `Linked file: ${path}`;
  let copied = false;
  try {
    await navigator.clipboard.writeText(path);
    copied = true;
  } catch {
    // No clipboard permission: the path is still shown.
  }
  showToast({ tone: "info", message: where, detail: copied ? "Path copied. The browser can't open folders." : "The browser can't open folders." });
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

/** The Move to bin row's "no bin" choice (the command's argument). */
export const NO_BIN = "none";

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

/**
 * Reveal in media panel (spec §6.16): the Media tab, the clip's media shown (the search and chips
 * cleared, its bin shown, when they hid it), selected and scrolled into view.
 */
function revealSelectedMedia(): void {
  const id = selectedClipMedia();
  const project = documentStore.getState();
  const item = id !== null ? project.media[id] : undefined;
  if (id === null || !item) return;
  showTab("media");
  const query = shownQuery();
  const reveal = revealQuery(item, query, mediaUseCounts(project));
  if (reveal !== query) {
    setPanelSession({ bin: reveal.bin, filters: reveal.filters });
    patch({ search: reveal.search });
  }
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
    // Bins, filter chips and search (Batch 41).
    actions.register("media.newBin", newBin),
    actions.register("media.showBin", (_context, bin?: string) => {
      if (typeof bin === "string") showBin(bin);
    }),
    actions.register("media.renameBin", (_context, id?: string) => {
      if (typeof id === "string") startBinRename(id);
    }),
    actions.register("media.deleteBin", (_context, id?: string) => {
      if (typeof id === "string") deleteBin(id);
    }),
    actions.register(
      "media.moveToBin",
      (_context, bin?: string) => {
        if (typeof bin === "string") moveToBin(bin === NO_BIN ? null : bin);
      },
      { enabled: () => selectedMedia().length > 0 },
    ),
    actions.register("media.filterVideo", () => toggleKind("video")),
    actions.register("media.filterAudio", () => toggleKind("audio")),
    actions.register("media.filterImage", () => toggleKind("image")),
    actions.register("media.filterUnused", () => setPanelFilters({ unused: !sessionStore.state.getState().mediaPanel.filters.unused })),
    actions.register("media.clearFilters", () => {
      setPanelFilters({ kinds: [], unused: false });
      setMediaSearch("");
    }),
    actions.register("media.search", () => {
      showTab("media");
      requestAnimationFrame(() => document.querySelector<HTMLInputElement>('[data-panel="media"] input[aria-label="Search media"]')?.focus());
    }),
    // Offline media (Batch 41).
    actions.register("media.relink", () => void relinkFromPicker(), { enabled: () => relinkId() !== null }),
    actions.register("media.relinkFolder", () => void relinkFromFolder(), { enabled: () => mediaStatus.getState().size > 0 }),
    actions.register("media.allowAccess", () => void allowMediaAccess(), { enabled: () => (mediaSources()?.waitingForAccess().length ?? 0) > 0 }),
    actions.register("media.revealPath", () => void revealMediaPath(), { enabled: () => selectedMedia().length > 0 }),
    actions.register("media.importMode.copy", () => void appSettings.update({ importMode: "copy" })),
    actions.register("media.importMode.reference", () => void appSettings.update({ importMode: "reference" })),
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
