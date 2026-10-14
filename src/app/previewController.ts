// Preview wiring (spec §7.1, §9.3): the app's one GPU device, renderer and texture pool, the frame
// service (video frames from decode.worker into the pool), the preview canvas view and its dev stats,
// the Batch 05/06 image and video harnesses of the open project, and Export frame.
// Framework-free; PreviewPanel only mounts the canvas host, the scrub bar and the stats element.
import type { MediaId } from "../core/document/types.js";
import { createStore } from "../core/store/createStore.js";
import { DEFAULT_TEXTURE_BUDGET, TexturePool } from "../media/cache/TexturePool.js";
import { FrameService, type FrameSource } from "../media/decode/FrameService.js";
import { svgPoster } from "../media/probe/svgProbe.js";
import { isAbortError } from "../media/workers/protocol.js";
import { errorMessage } from "../project/errorMessage.js";
import type { FsDir } from "../project/fs.js";
import { resolveFile, safeFileName, sampleIndexPath, writeFileAt } from "../project/mediaFiles.js";
import { GpuDevice } from "../render/gpu/GpuDevice.js";
import { WebGpuRenderer } from "../render/gpu/WebGpuRenderer.js";
import { ImageHarness } from "../render/preview/ImageHarness.js";
import { PreviewStatsOverlay } from "../render/preview/PreviewStatsOverlay.js";
import { PreviewView } from "../render/preview/PreviewView.js";
import { VideoHarness } from "../render/preview/VideoHarness.js";
import type { PreviewZoom } from "../render/preview/viewport.js";
import { showToast } from "../ui/toasts.js";
import { mediaPanel } from "./mediaController.js";
import { actions, documentStore, layoutStore, scheduler, sessionStore, themeBridge, workerPool } from "./services.js";

const MB = 1024 * 1024;

export const gpuDevice = new GpuDevice();
export const renderer = new WebGpuRenderer(gpuDevice);
export const texturePool = new TexturePool();
export const previewView = new PreviewView({ renderer, scheduler, layout: layoutStore, session: sessionStore.state, document: documentStore, theme: themeBridge });
/** Video frames for every view (preview now, the compositor and playback later). */
export const frameService = new FrameService({ workers: workerPool, renderer, pool: texturePool });
export const previewStats = new PreviewStatsOverlay({ scheduler, preview: previewView, pool: texturePool, gpu: gpuDevice, frames: frameService });
/** The Batch 06 dev scrub bar: the selected video at any frame. */
export const videoHarness = new VideoHarness({ frames: frameService, pool: texturePool, preview: previewView, document: documentStore, panel: mediaPanel, renderer });

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

/** Frees the frames and decoders of media that leave the project (removal, undo of an import). */
function releaseRemovedMedia(): () => void {
  let media = documentStore.getState().media;
  return documentStore.subscribe(
    (state) => {
      for (const id of Object.keys(media) as MediaId[]) if (!Object.hasOwn(state.media, id)) frameService.release(id);
      media = state.media;
    },
    { affects: ["media"] },
  );
}

/** Wires the preview to a newly opened project. */
export function attachPreview(dir: FsDir, isWritable: () => boolean): void {
  detachPreview();
  const stopFrames = frameService.attach(frameSource(dir, isWritable));
  const harness = new ImageHarness({
    renderer,
    pool: texturePool,
    preview: previewView,
    document: documentStore,
    panel: mediaPanel,
    workers: workerPool,
    resolve: (relPath) => resolveFile(dir, relPath),
    svgBitmap: svgPoster,
  });
  const stops = [stopFrames, releaseRemovedMedia(), harness.attach(), videoHarness.attach()];
  stopProject = () => {
    // Harnesses first (they unpin), then the frame service closes the worker sessions.
    for (const stop of stops.reverse()) stop();
  };
}

/** Before the project closes: frees its decoders and textures (P13). */
export function detachPreview(): void {
  stopProject?.();
  stopProject = null;
  texturePool.clear();
}

export function setPreviewZoom(zoom: PreviewZoom): void {
  sessionStore.state.set((state) => (state.preview.zoom === zoom ? state : { ...state, preview: { ...state.preview, zoom } }));
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
