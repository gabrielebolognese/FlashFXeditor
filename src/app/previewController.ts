// Preview wiring (spec §7.1, §8, §9.3, §9.4): the app's one GPU device, renderer and texture pool, the
// frame service (video frames from decode.worker into the pool), still images, the preview canvas
// view (the composite at the playhead) and its dev stats, the playback engine that drives it, the
// preview chrome readouts and Export frame. Framework-free; PreviewPanel only mounts the canvas host,
// the chrome bar and the stats element.
import { formatTimecode } from "../core/document/time.js";
import type { MediaId } from "../core/document/types.js";
import { createStore } from "../core/store/createStore.js";
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
import { PreviewStatsOverlay } from "../render/preview/PreviewStatsOverlay.js";
import { PreviewView } from "../render/preview/PreviewView.js";
import type { PreviewZoom } from "../render/preview/viewport.js";
import { contentEnd } from "../timeline/model/queries.js";
import { showToast } from "../ui/toasts.js";
import { actions, audioClock, documentStore, idleQueue, layoutStore, scheduler, sessionStore, themeBridge, workerPool } from "./services.js";
import { timelineView } from "./timelineController.js";

const MB = 1024 * 1024;

export const gpuDevice = new GpuDevice();
export const renderer = new WebGpuRenderer(gpuDevice);
export const texturePool = new TexturePool();
/**
 * Video frames for the preview and playback. Frames are uploaded at most at the project's long edge:
 * the preview never draws more of them (a 4K frame in a 1080x1920 project).
 * TODO(batch 21): detail-on-zoom renders above 100% need more than the project size.
 */
export const frameService = new FrameService({
  workers: workerPool,
  renderer,
  pool: texturePool,
  uploadSize: () => {
    const { width, height } = documentStore.getState().settings;
    return Math.max(width, height);
  },
});
/** Still image textures. */
export const imageService = new ImageService({ workers: workerPool, renderer, pool: texturePool, document: documentStore, svgBitmap: svgPoster });
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
  priority: (): FramePriority => (playbackEngine.playing ? "playback" : timelineView.scrubbing ? "scrub" : "idle"),
  watchPriority: (listener) => playbackEngine.subscribe(listener),
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
  scrubbing: () => timelineView.scrubbing,
  idle: idleQueue,
});
export const previewStats = new PreviewStatsOverlay({ scheduler, preview: previewView, pool: texturePool, gpu: gpuDevice, frames: frameService, playback: playbackEngine });

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
  if (event === "lost") texturePool.clear();
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
      frames: frameService,
      images: imageService,
      playback: playbackEngine,
    }));
  }
}

/** The project's media files and cache/index/ for the frame service. */
function frameSource(dir: FsDir, isWritable: () => boolean): FrameSource {
  return {
    file: async (mediaId, lod) => {
      // TODO(batch 24): proxy files; TODO(batch 41): media referenced by a file handle.
      const item = documentStore.getState().media[mediaId];
      if (lod !== "full" || !item || !("relPath" in item.file)) return null;
      return resolveFile(dir, item.file.relPath);
    },
    readIndex: async (mediaId, lod) => (lod === "full" ? resolveFile(dir, sampleIndexPath(mediaId)) : null),
    writeIndex: async (mediaId, lod, bytes) => {
      if (lod === "full" && isWritable()) await writeFileAt(dir, sampleIndexPath(mediaId), new Blob([bytes]));
    },
  };
}

/** Frees the frames, decoders and images of media that leave the project (removal, undo of an import). */
function releaseRemovedMedia(): () => void {
  let media = documentStore.getState().media;
  return documentStore.subscribe(
    (state) => {
      for (const id of Object.keys(media) as MediaId[]) if (!Object.hasOwn(state.media, id)) frameService.release(id);
      for (const id of Object.keys(state.media) as MediaId[]) if (state.media[id] !== media[id]) previewView.forgetMedia(id);
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
  ];
  previewView.resetFrames();
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
}

export function setPreviewZoom(zoom: PreviewZoom): void {
  sessionStore.state.set((state) => (state.preview.zoom === zoom ? state : { ...state, preview: { ...state.preview, zoom } }));
}

export interface PreviewReadouts {
  timecode: HTMLElement;
  duration: HTMLElement;
  fps: HTMLElement;
}

/**
 * The preview chrome's readouts (spec §7.8): playhead timecode, duration and fps badge, written by
 * subscriptions, never by React (P1). The timecode changes every frame during playback.
 */
export function bindPreviewReadouts({ timecode, duration, fps }: PreviewReadouts): () => void {
  const write = (element: HTMLElement, text: string) => {
    if (element.textContent !== text) element.textContent = text;
  };
  const showTimecode = () => write(timecode, formatTimecode(sessionStore.state.getState().playhead, documentStore.getState().settings.fps));
  const showDocument = () => {
    const project = documentStore.getState();
    write(duration, formatTimecode(contentEnd(project), project.settings.fps));
    write(fps, `${formatFps(project.settings.fps)} fps`);
    showTimecode();
  };
  const stops = [sessionStore.state.select((state) => state.playhead, showTimecode), documentStore.subscribe(showDocument, { affects: ["timeline", "clips", "settings"] })];
  showDocument();
  return () => {
    for (const stop of stops) stop();
  };
}

interface SaveFilePickerWindow {
  showSaveFilePicker(options: { suggestedName: string; id?: string; types: { description: string; accept: Record<string, string[]> }[] }): Promise<FileSystemFileHandle>;
}

/** Saves the current frame at project size as a PNG (the picker opens first, inside the click). */
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

/** Registers the preview actions. Returns a stop function. */
export function installPreviewController(): () => void {
  return actions.register("preview.exportFrame", () => void exportFrame());
}
