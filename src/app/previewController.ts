// Preview wiring (spec §7.1-§7.6, §8, §9.3, §9.4): the app's one GPU device, renderer and texture
// pool, the frame service (video frames from decode.worker into the pool), still images, the preview
// canvas view (the composite at the playhead) with its overlay canvas, zoom/pan input and canvas
// selection and gizmo input, its dev stats, the playback engine that drives it (and the audio
// scheduler, Batch 10), the preview chrome readouts, the view and overlay settings, fullscreen and
// Export frame. Framework-free; PreviewPanel only mounts the canvas host, the chrome, the meter, the
// stats element and the canvas context menu (`canvasMenu`; its actions are in canvasController).
// Proxies (spec §9.5): the frame service opens cache/proxies/<id>.mp4 of media whose proxy is ready
// (its sample index cached apart), the preview and the engine pick the lod of the quality mode, and
// a media whose playback falls behind gets a proxy queued when it has no proxy decision yet.
// Inline text editing (spec §7.7, `textEditor`): its textarea sits over the canvases; the preview and
// the canvas show its draft over the other live values (`liveTexts`, `liveTransforms`).
import { animatedTransform } from "../core/document/keyframes.js";
import type { ClipId, Frame, MediaId, TextClip, Transform } from "../core/document/types.js";
import { detectPlatform } from "../core/keyboard/keys.js";
import { createStore } from "../core/store/createStore.js";
import { GRID_DIVISIONS_MAX, GRID_DIVISIONS_MIN, type PreviewSession } from "../core/store/sessionStore.js";
import { GRID_IDS, PREVIEW_QUALITIES, SAFE_ZONE_IDS } from "./commandCatalog.js";
import { DEFAULT_TEXTURE_BUDGET, TexturePool } from "../media/cache/TexturePool.js";
import { FrameService, type FrameSource } from "../media/decode/FrameService.js";
import { ImageService } from "../media/decode/ImageService.js";
import { svgPoster } from "../media/probe/svgProbe.js";
import { isAbortError, type FramePriority } from "../media/workers/protocol.js";
import { PlaybackEngine } from "../playback/PlaybackEngine.js";
import { errorMessage } from "../project/errorMessage.js";
import type { FsDir } from "../project/fs.js";
import { resolveFile, safeFileName, sampleIndexPath, writeFileAt } from "../project/mediaFiles.js";
import { formatFps } from "../project/projectPresets.js";
import { GpuDevice } from "../render/gpu/GpuDevice.js";
import { WebGpuRenderer } from "../render/gpu/WebGpuRenderer.js";
import { CanvasEditInput } from "../render/preview/CanvasEditInput.js";
import type { LiveCaptions, LiveText } from "../render/compositor/Compositor.js";
import { InlineTextEditor, type DraftText } from "../render/preview/InlineTextEditor.js";
import { NO_CROP_MODE, type CropModeState } from "../render/preview/cropGizmo.js";
import { PreviewOverlayView } from "../render/preview/PreviewOverlayView.js";
import { PreviewStatsOverlay } from "../render/preview/PreviewStatsOverlay.js";
import { PreviewView } from "../render/preview/PreviewView.js";
import { ViewportInput } from "../render/preview/ViewportInput.js";
import { zoomAround, type PreviewZoom } from "../render/preview/viewport.js";
import { TextRasterCache } from "../render/text/TextRasterCache.js";
import { showToast } from "../ui/toasts.js";
import { attachAudio, audioScheduler, detachAudio, meterView, scrubGrain } from "./audioController.js";
import { toggleFullscreen } from "./fullscreen.js";
import { liveEdit, setLiveCrops, type LiveEdit } from "./liveEdit.js";
import { requestProxyIfUndecided } from "./mediaController.js";
import { mediaSources, mediaStatus, offlineReason, OFFLINE_LABEL, onRefreshMedia, sourceFile } from "./mediaOffline.js";
import { actions, audioClock, documentStore, focusScopes, fontLibrary, idleQueue, layoutStore, scheduler, sessionStore, themeBridge, workerPool } from "./services.js";

/** The last keyed text transform made for the inline editor (one object per clip and frame: its draft memo keys on it). */
let keyedMemo: { clip: TextClip; frame: Frame; transform: Transform } | null = null;

/** `clip`'s transform at timeline `frame` (its own when unkeyed). */
function keyedTransformAt(clip: TextClip, frame: Frame): Transform {
  if (keyedMemo?.clip === clip && keyedMemo.frame === frame) return keyedMemo.transform;
  const transform = animatedTransform(clip, frame - clip.start);
  if (transform !== clip.transform) keyedMemo = { clip, frame, transform };
  return transform;
}
import { timelineView } from "./timelineController.js";

const MB = 1024 * 1024;

export const gpuDevice = new GpuDevice();
export const renderer = new WebGpuRenderer(gpuDevice);
export const texturePool = new TexturePool();
/**
 * Video frames for the preview and playback. Frames are uploaded at most at the size the preview
 * needs (spec §7.1): the project's long edge, more for detail on zoom, less for 1/2 and 1/4 playback.
 */
export const frameService = new FrameService({
  workers: workerPool,
  renderer,
  pool: texturePool,
  uploadSize: () => previewView.uploadLongEdge,
  proxyReady: (mediaId) => documentStore.getState().media[mediaId]?.proxy?.status === "ready",
});
/** Still image textures. */
export const imageService = new ImageService({
  workers: workerPool,
  renderer,
  pool: texturePool,
  document: documentStore,
  svgBitmap: svgPoster,
  // Animation frames as they arrive, a sharper SVG raster.
  onChange: () => scheduler.invalidate("preview"),
});
/** Text rasters as GPU textures (spec §10.1, P11). */
export const textRasters = new TextRasterCache({
  upload: (canvas, options) => renderer.uploadImageBitmap(canvas, options),
  fontsReady: (style, text) => fontLibrary.ready(style, text),
  loadFonts: (style, text) => fontLibrary.load(style, text),
});
export const previewView: PreviewView = new PreviewView({
  renderer,
  scheduler,
  layout: layoutStore,
  session: sessionStore.state,
  document: documentStore,
  theme: themeBridge,
  frames: frameService,
  images: imageService,
  pool: texturePool,
  text: textRasters,
  priority: (): FramePriority => (playbackEngine.playing ? "playback" : timelineView.scrubbing || timelineView.trimming ? "scrub" : "idle"),
  // Play and pause, and the end of a ruler scrub or an edge trim (timeline gestures pause the IdleQueue
  // until they end): Auto asks for full frames at once (spec §7.5, §9.5).
  watchPriority: (listener) => {
    const stops = [playbackEngine.subscribe(listener), idleQueue.onPauseChange(() => listener())];
    return () => {
      for (const stop of stops) stop();
    };
  },
  // A trim shows its new edge frame live (spec §6.10).
  override: () => timelineView.trimPreview,
  // A canvas gesture (spec §7.3), a properties field scrub (§11) or inline text editing (§7.7) shows its values live (P2).
  transforms: () => canvasInput.transforms,
  opacities: () => liveEdit.getState().opacities,
  crops: () => liveEdit.getState().crops,
  background: () => liveEdit.getState().background,
  texts: () => liveTexts(),
  anims: () => liveEdit.getState().anims,
  captions: () => liveCaptions(),
  // A size handle drag on a solid (spec §7.3), else a Solid field scrub (Batch 34).
  solids: () => canvasInput.solids ?? liveEdit.getState().solids,
  // Export frame waits for the fonts of its text layers.
  loadFonts: async (style, text) => {
    if (fontLibrary.ready(style, text)) return false;
    await fontLibrary.load(style, text);
    return true;
  },
  behind: (mediaId) => playbackEngine.playing && playbackEngine.autoProxy.has(mediaId),
  // Offline media draw a labeled slate (spec §6.19, Batch 41); one the decoder refuses becomes offline too.
  offline: (mediaId) => {
    const reason = offlineReason(mediaId);
    return reason === null ? null : OFFLINE_LABEL[reason];
  },
  onFail: (mediaId) => mediaSources()?.markFailed(mediaId),
});
/** Plays the timeline through the preview (spec §8). */
export const playbackEngine: PlaybackEngine = new PlaybackEngine({
  scheduler,
  clock: audioClock,
  document: documentStore,
  session: sessionStore,
  frames: frameService,
  images: imageService,
  pool: texturePool,
  preview: previewView,
  // A ruler scrub or an edge trim pauses playback (the preview shows the scrubbed or trimmed frame).
  scrubbing: () => timelineView.scrubbing || timelineView.trimming,
  idle: idleQueue,
  audio: audioScheduler,
  quality: () => sessionStore.state.getState().preview.quality,
  // Auto quality: a media too heavy to play at full gets a proxy, unless one was decided against.
  onBehind: (mediaId) => requestProxyIfUndecided(mediaId),
  // Keyboard stepping plays a grain with the audio scrub on (Batch 37).
  onStep: (frame) => scrubGrain(frame),
});
// The meter reads the mix from the first frame of a playback on.
playbackEngine.subscribe(() => {
  if (playbackEngine.playing) meterView.wake();
});
/** The open canvas context menu (spec §7.2) at client px, or null. React renders it from this store. */
export const canvasMenu = createStore<{ x: number; y: number } | null>(null);
/**
 * Crop mode on the canvas (spec §7.3, §11, Batch 26): the layer it crops and the aspect lock. The Crop
 * section's header toggle and the crop chip over the canvas render from it (when it changes only).
 */
export const cropMode = createStore<CropModeState>(NO_CROP_MODE);
/** Selection, hover, marquee and the transform gizmo on the preview canvas (spec §7.2, §7.3). */
export const canvasInput: CanvasEditInput = new CanvasEditInput({
  document: documentStore,
  session: sessionStore,
  scheduler,
  theme: themeBridge,
  layout: layoutStore,
  platform: detectPlatform(),
  placement: () => previewView.placement,
  panning: () => viewportInput.panning,
  commit: (command) => documentStore.dispatch(command),
  // A drag on the canvas pauses playback (the gesture edits the frame on screen).
  onDragStart: () => playbackEngine.pause(),
  onContextMenu: (request) => canvasMenu.set(request),
  // A properties field scrub moves the gizmo with the layer (spec §11); inline editing moves its box.
  live: () => liveTransforms(),
  // Crop handle drags and Crop field scrubs share the live crops (the Crop fields follow a drag).
  crops: { read: () => liveEdit.getState().crops, write: setLiveCrops },
  // A Text field scrub resizes text boxes live, as the draft of inline editing does.
  texts: () => liveTexts(),
  // A Solid field scrub resizes the solid's box live.
  solids: () => liveEdit.getState().solids,
  cropMode,
  textEditor: {
    get editing() {
      return textEditor.editing;
    },
    begin: (clipId, at) => textEditor.begin(clipId, at),
    end: (commit) => textEditor.end(commit),
    contains: (point, reach) => textEditor.contains(point, reach),
    press: (point, shift) => textEditor.press(point, shift),
    drag: (point) => textEditor.drag(point),
    release: () => textEditor.release(),
    scene: () => textEditor.scene(),
  },
});

/** Where a press or focus keeps inline text editing on: the canvas, the properties panel and the popovers and menus over the app. */
function keepsTextEditing(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target === previewOverlay.element || target.closest('[data-scope="properties"], [role="dialog"], [role="menu"], [role="listbox"]') !== null;
}

/** Inline text editing on the canvas (spec §7.7, §10.2). */
export const textEditor: InlineTextEditor = new InlineTextEditor({
  document: documentStore,
  session: sessionStore,
  scheduler,
  theme: themeBridge,
  platform: detectPlatform(),
  placement: () => previewView.placement,
  textScale: () => previewView.textRenderScale,
  // The clip as a Text field scrub shows it (the draft goes over it), keyed at the playhead.
  shown: (clipId) => {
    const clip = documentStore.getState().clips[clipId];
    if (clip?.kind !== "text") return null;
    const live = liveEdit.getState();
    const text = live.texts?.get(clipId);
    return { text: text?.text ?? clip.text, style: text?.style ?? clip.style, transform: live.transforms?.get(clipId) ?? keyedTransformAt(clip, sessionStore.state.getState().playhead) };
  },
  commit: (command) => documentStore.dispatch(command),
  keeps: keepsTextEditing,
  // Editing owns the keyboard (a press on the text goes to the canvas first); out of it the keyboard
  // goes back to the preview, unless a press already took it elsewhere.
  onEditing: (clipId) => {
    if (clipId !== null) focusScopes.set("textEditing");
    else if (focusScopes.scope === "textEditing") focusScopes.set("preview");
  },
});

let textsMemo: { base: ReadonlyMap<ClipId, LiveText> | null; draft: DraftText | null; value: ReadonlyMap<ClipId, LiveText> | null } = { base: null, draft: null, value: null };
let transformsMemo: { base: ReadonlyMap<ClipId, Transform> | null; draft: DraftText | null; value: ReadonlyMap<ClipId, Transform> | null } = { base: null, draft: null, value: null };

let captionsMemo: { cues: ReadonlyMap<ClipId, string> | null; styles: LiveEdit["captionStyles"]; value: LiveCaptions | null } = { cues: null, styles: null, value: null };

/** The cue list's live text and a Caption style scrub's style (the same object while nothing changed). */
function liveCaptions(): LiveCaptions | null {
  const { cues, captionStyles } = liveEdit.getState();
  if (cues === null && captionStyles === null) return null;
  if (captionsMemo.cues !== cues || captionsMemo.styles !== captionStyles) captionsMemo = { cues, styles: captionStyles, value: { texts: cues, styles: captionStyles } };
  return captionsMemo.value;
}

/** The live texts: a canvas text handle drag's or a Text field scrub's, with the inline draft over them (the same map while nothing changed). */
function liveTexts(): ReadonlyMap<ClipId, LiveText> | null {
  const base = canvasInput.texts ?? liveEdit.getState().texts;
  const draft = textEditor.live();
  if (!draft) return base;
  if (textsMemo.base !== base || textsMemo.draft !== draft) {
    const value = new Map<ClipId, LiveText>(base ?? []);
    // Edited inline: shown at rest (no animation), where the caret and the box are.
    value.set(draft.clipId, { text: draft.text, style: draft.style, highlight: draft.highlight, editing: true });
    textsMemo = { base, draft, value };
  }
  return textsMemo.value;
}

/** The live transforms of field scrubs, with the inline draft's box (moved by its anchor) over them. */
function liveTransforms(): ReadonlyMap<ClipId, Transform> | null {
  const base = liveEdit.getState().transforms;
  const draft = textEditor.live();
  if (!draft) return base;
  if (transformsMemo.base !== base || transformsMemo.draft !== draft) {
    const value = new Map<ClipId, Transform>(base ?? []);
    value.set(draft.clipId, draft.transform);
    transformsMemo = { base, draft, value };
  }
  return transformsMemo.value;
}
export const previewStats = new PreviewStatsOverlay({ scheduler, preview: previewView, pool: texturePool, gpu: gpuDevice, frames: frameService, playback: playbackEngine, canvas: canvasInput, text: textRasters });
/** The 2D canvas over the preview: overlays (spec §7.6), the selection and the gizmo (§7.3). */
export const previewOverlay = new PreviewOverlayView({ scheduler, layout: layoutStore, session: sessionStore.state, document: documentStore, theme: themeBridge, preview: previewView, gizmo: canvasInput });

/** The preview canvas in device px with the Fit margin, as last rendered. */
function viewTarget(): { width: number; height: number; margin: number; dpr: number } {
  const { width, height, dpr } = previewView.stats;
  return { width, height, dpr, margin: themeBridge.theme.layout.previewMargin * dpr };
}

/** Wheel zoom at the cursor, wheel / Space / middle / Hand pans on the overlay canvas (spec §7.1). */
export const viewportInput = new ViewportInput({
  session: sessionStore.state,
  layout: layoutStore,
  frame: () => documentStore.getState().settings,
  target: viewTarget,
  playing: () => playbackEngine.playing,
  onSpaceTap: () => void actions.run("transport.playPause"),
  // Out of a pan, the cursor of the gizmo zone under the pointer.
  cursor: () => canvasInput.cursor(),
});

/** Pool budgets of the dev select: the P6 default and the Batch 05 test budget. */
export const POOL_BUDGETS: readonly number[] = [DEFAULT_TEXTURE_BUDGET, 64 * MB];

export interface PreviewDevState {
  stats: boolean;
  budget: number;
}

/** Dev chrome of the preview header (not persisted). */
export const previewDev = createStore<PreviewDevState>({ stats: false, budget: DEFAULT_TEXTURE_BUDGET });

previewDev.select(
  (state) => state.budget,
  (budget) => texturePool.setBudget(budget),
);

// Textures of a lost device are dead: empty the pool; owners upload again on "ready".
renderer.subscribe((event) => {
  if (event === "lost") {
    texturePool.clear();
    textRasters.clear();
  }
});

let stopProject: (() => void) | null = null;

/** Creates the GPU device from the adapter of the startup check. */
export function startGpu(adapter: GPUAdapter): void {
  void gpuDevice.start(adapter);
  if (import.meta.env.DEV) {
    // Console access for the acceptance checks, e.g. `__editor.device.destroy()`.
    const editor = ((globalThis as { __editor?: Record<string, unknown> }).__editor ??= {});
    Object.defineProperties(editor, Object.getOwnPropertyDescriptors({
      gpu: gpuDevice,
      get device() {
        return gpuDevice.device;
      },
      renderer,
      pool: texturePool,
      preview: previewView,
      canvas: canvasInput,
      overlay: previewOverlay,
      textEditor,
      frames: frameService,
      images: imageService,
      playback: playbackEngine,
    }));
  }
}

/** The project's media files (copied or linked), their ready proxies and cache/index/ for the frame service. */
function frameSource(dir: FsDir, isWritable: () => boolean): FrameSource {
  return {
    file: async (mediaId, lod) => {
      const item = documentStore.getState().media[mediaId];
      if (!item) return null;
      if (lod === "proxy") return item.proxy?.status === "ready" ? resolveFile(dir, item.proxy.relPath) : null;
      // A copy in media/ or a linked file (Batch 41); an offline one is marked for the slate.
      return sourceFile(mediaId);
    },
    readIndex: (mediaId, lod) => resolveFile(dir, sampleIndexPath(mediaId, lod)),
    writeIndex: async (mediaId, lod, bytes) => {
      if (isWritable()) await writeFileAt(dir, sampleIndexPath(mediaId, lod), new Blob([bytes]));
    },
  };
}

/**
 * Frees the frames, decoders and images of media that leave the project (removal, undo of an import),
 * and the proxy sessions and frames of a proxy that stops being ready (removed, made again).
 */
function releaseRemovedMedia(): () => void {
  let media = documentStore.getState().media;
  return documentStore.subscribe(
    (state) => {
      for (const id of Object.keys(media) as MediaId[]) {
        if (Object.hasOwn(state.media, id)) continue;
        frameService.release(id);
        imageService.release(id);
      }
      for (const id of Object.keys(state.media) as MediaId[]) {
        const before = media[id];
        const now = state.media[id];
        if (now === before) continue;
        previewView.forgetMedia(id);
        if (before && now && before.file !== now.file) {
          // Relinked (Batch 41): the old file's decoders and frames go.
          frameService.release(id);
          imageService.release(id);
        } else if (before?.proxy?.status === "ready" && now?.proxy?.status !== "ready") frameService.release(id, "proxy");
      }
      media = state.media;
    },
    { affects: ["media"] },
  );
}

/** Wires the preview to a newly opened project. */
export function attachPreview(dir: FsDir, isWritable: () => boolean): void {
  detachPreview();
  playbackEngine.pause();
  const source = frameSource(dir, isWritable);
  const stops = [
    frameService.attach(source),
    imageService.attach({ file: (mediaId) => source.file(mediaId, "full") }),
    releaseRemovedMedia(),
    // A media back online (relinked, access granted): its frames load again; offline ones draw a slate.
    onRefreshMedia((ids) => {
      for (const id of ids) {
        frameService.release(id);
        imageService.release(id);
        previewView.forgetMedia(id);
      }
      scheduler.invalidate("preview");
    }),
    mediaStatus.subscribe(() => scheduler.invalidate("preview")),
  ];
  previewView.resetFrames();
  attachAudio(dir, isWritable);
  stopProject = () => {
    // The view lets go of its pins and requests first, then the services close the worker sessions.
    previewView.resetFrames();
    for (const stop of stops.reverse()) stop();
  };
}

/** Before the project closes: stops playback, frees its decoders and textures (P13). */
export function detachPreview(): void {
  playbackEngine.pause();
  stopProject?.();
  stopProject = null;
  texturePool.clear();
  textRasters.clear();
  detachAudio();
}

/** A zoom level (the Zoom menu, Mod+0/1/2, Fit) around the canvas center; Fit comes back centered (spec §7.1). */
export function setPreviewZoom(zoom: PreviewZoom): void {
  const target = viewTarget();
  const frame = documentStore.getState().settings;
  sessionStore.state.set((state) => {
    const { preview } = state;
    const next = target.width > 0 ? zoomAround(preview, zoom, target.width / 2, target.height / 2, frame, target, target.margin) : { zoom, panX: 0, panY: 0 };
    if (next.zoom === preview.zoom && next.panX === preview.panX && next.panY === preview.panY) return state;
    return { ...state, preview: { ...preview, ...next } };
  });
}

/** Changes overlay and quality settings of the preview (session state, never undoable). */
export function setPreviewOptions(patch: Partial<Omit<PreviewSession, "zoom" | "panX" | "panY">>): void {
  sessionStore.state.set((state) => {
    const { preview } = state;
    if ((Object.keys(patch) as (keyof typeof patch)[]).every((key) => preview[key] === patch[key])) return state;
    return { ...state, preview: { ...preview, ...patch } };
  });
}

/** The status strip's quality text (§13), written on change (never by React, P1). */
export function bindQualityLabel(element: HTMLElement): () => void {
  return previewView.quality.select(
    (label) => label,
    (label) => {
      if (element.textContent !== label) element.textContent = label;
    },
    { fireImmediately: true },
  );
}

/**
 * The preview chrome's fps badge (spec §7.8), written by a subscription, never by React (P1). The
 * timecode (editable) and the duration are bound like the timeline toolbar's (`bindTimecode`).
 */
export function bindFpsBadge(fps: HTMLElement): () => void {
  const show = () => {
    const text = `${formatFps(documentStore.getState().settings.fps)} fps`;
    if (fps.textContent !== text) fps.textContent = text;
  };
  show();
  return documentStore.subscribe(show, { affects: ["settings"] });
}

interface SaveFilePickerWindow {
  showSaveFilePicker(options: { suggestedName: string; id?: string; types: { description: string; accept: Record<string, string[]> }[] }): Promise<FileSystemFileHandle>;
}

/** Saves the current frame at project size as a PNG (the picker opens first, inside the click). */
/**
 * The frame at the playhead as a small image (`height` px tall, webp) for the recent projects list
 * (spec §15 "thumbnail captured at the playhead on close", Batch 42): rendered like Export frame, then
 * scaled. Null when the preview cannot draw it within `timeoutMs` (a frame still decoding, no GPU).
 */
export async function captureThumbnail(height: number, timeoutMs = 2000): Promise<Blob | null> {
  let late = false;
  const render = previewView.renderFrame().then((bitmap) => {
    if (late) bitmap.close();
    return bitmap;
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  try {
    const bitmap = await Promise.race([render, timeout]);
    if (!bitmap) {
      late = true;
      return null;
    }
    const scaled = await createImageBitmap(bitmap, { resizeHeight: height, resizeWidth: Math.max(1, Math.round((bitmap.width * height) / bitmap.height)), resizeQuality: "medium" });
    bitmap.close();
    const canvas = new OffscreenCanvas(scaled.width, scaled.height);
    canvas.getContext("2d")?.drawImage(scaled, 0, 0);
    scaled.close();
    return await canvas.convertToBlob({ type: "image/webp", quality: 0.82 });
  } catch (error) {
    late = true;
    console.warn("[preview] no thumbnail for the recent list", error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function exportFrame(): Promise<void> {
  let handle: FileSystemFileHandle;
  try {
    handle = await (window as unknown as SaveFilePickerWindow).showSaveFilePicker({
      suggestedName: safeFileName(`${documentStore.getState().name} frame.png`),
      id: "shorts-editor-frame",
      types: [{ description: "PNG image", accept: { "image/png": [".png"] } }],
    });
  } catch (error) {
    if (!isAbortError(error)) showToast({ tone: "error", message: "Can't export the frame", detail: errorMessage(error) });
    return;
  }
  try {
    const bitmap = await previewView.renderFrame();
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
    bitmap.close();
    const blob = await canvas.convertToBlob({ type: "image/png" });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    showToast({ tone: "success", message: `Saved ${handle.name}`, detail: `${canvas.width}×${canvas.height} PNG` });
  } catch (error) {
    console.error("[preview] export frame failed", error);
    showToast({ tone: "error", message: "Can't export the frame", detail: errorMessage(error) });
  }
}

const previewOptions = () => sessionStore.state.getState().preview;

/** Registers the preview actions. Returns a stop function. */
export function installPreviewController(): () => void {
  const stops = [
    actions.register("preview.exportFrame", () => void exportFrame()),
    // Spec §18: preview scope (the canvas zoom), Fit / 100% / 200% around the canvas center.
    actions.register("canvas.zoomFit", () => setPreviewZoom("fit")),
    actions.register("canvas.zoom100", () => setPreviewZoom(1)),
    actions.register("canvas.zoom200", () => setPreviewZoom(2)),
    // The Zoom menu's other levels (§7.5), and the Quality and Overlays menus' choices (§7.5, §7.6, Batch 40: commands for the palette).
    actions.register("canvas.zoom25", () => setPreviewZoom(0.25)),
    actions.register("canvas.zoom50", () => setPreviewZoom(0.5)),
    actions.register("canvas.zoom400", () => setPreviewZoom(4)),
    ...PREVIEW_QUALITIES.map((quality) => actions.register(`preview.quality.${quality}`, () => setPreviewOptions({ quality }))),
    ...SAFE_ZONE_IDS.map((safeZone) => actions.register(`preview.safeZone.${safeZone}`, () => setPreviewOptions({ safeZone }))),
    ...GRID_IDS.map((grid) => actions.register(`preview.grid.${grid}`, () => setPreviewOptions({ grid }))),
    actions.register("preview.gridCellsFewer", () => setPreviewOptions({ gridDivisions: Math.max(GRID_DIVISIONS_MIN, previewOptions().gridDivisions - 1) }), {
      enabled: () => previewOptions().grid === "custom" && previewOptions().gridDivisions > GRID_DIVISIONS_MIN,
    }),
    actions.register("preview.gridCellsMore", () => setPreviewOptions({ gridDivisions: Math.min(GRID_DIVISIONS_MAX, previewOptions().gridDivisions + 1) }), {
      enabled: () => previewOptions().grid === "custom" && previewOptions().gridDivisions < GRID_DIVISIONS_MAX,
    }),
    actions.register("preview.toggleCenterCross", () => setPreviewOptions({ centerCross: !previewOptions().centerCross })),
    actions.register("preview.toggleSafeMargins", () => setPreviewOptions({ safeMargins: !previewOptions().safeMargins })),
    actions.register("preview.toggleRulers", () => setPreviewOptions({ rulers: !previewOptions().rulers })),
    actions.register("preview.togglePixelGrid", () => setPreviewOptions({ pixelGrid: !previewOptions().pixelGrid })),
    actions.register("preview.toggleFullscreen", toggleFullscreen),
    // Smart guides on the canvas (spec §7.4, §13 "Guides toggle"): other layers and equal spacing as snap targets, and the Alt measure mode.
    actions.register("preview.toggleGuides", () => setPreviewOptions({ guides: !sessionStore.state.getState().preview.guides })),
    // A properties field scrub (spec §11, P2): the picture and the gizmo follow its ephemeral values.
    liveEdit.subscribe(() => {
      scheduler.invalidate("preview");
      scheduler.invalidate("gizmo");
    }),
  ];
  if (import.meta.env.DEV) stops.push(actions.register("dev.toggleGpuStats", () => previewDev.set((state) => ({ ...state, stats: !state.stats }))));
  return () => {
    for (const stop of stops) stop();
  };
}
