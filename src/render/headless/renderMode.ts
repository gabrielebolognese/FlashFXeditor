// The render-only entry `/?render=<token>` (spec §21.6): no panels, no React, no autosave, no project
// session, no IndexedDB writes and no service worker. The CLI (`scripts/cli/render.ts`) serves this
// build and the project folder on localhost, opens this page in headless Chrome and drives
// `window.__render` over the DevTools protocol. The project is read through `HttpDir`; video goes to
// `HttpSink`; both go through the editor's own paths: the export job of the Export tab
// (`requestVideoExport`) and the frame render of Export frame (`renderFramePng`).
//   ?render=<token>   required; the server's routes live under /__t/<token>/
//   ?renderer=webgl2  forces the WebGL2 backend (as in the app)
//   ?mode=compare     no project: only `compare` is used
import { installCatalogController } from "../../app/catalogController.js";
import { attachFonts } from "../../app/fontController.js";
import { attachLuts } from "../../app/lutController.js";
import { installTextController } from "../../app/textController.js";
import { projectTextStyles } from "../../text/fonts.js";
import { gatherInputs, requestVideoExport } from "../../app/exportController.js";
import { mediaStatus, setMediaSources } from "../../app/mediaOffline.js";
import { attachPreview, gpuDevice, renderFramePng, startGpu } from "../../app/previewController.js";
import { documentStore, fontLibrary, keyValueStore, sessionStore, themeBridge } from "../../app/services.js";
import { contentEnd } from "../../timeline/model/queries.js";
import { setPlayhead } from "../../core/store/sessionStore.js";
import type { Frame, Project } from "../../core/document/types.js";
import { ExportFile } from "../../export/exportFile.js";
import { BUILT_IN_PRESETS, exportFormat, REELS_PRESET } from "../../export/presets.js";
import { openProjectFolder } from "../../project/openProject.js";
import { MediaSources } from "../../project/mediaSources.js";
import { safeFileName } from "../../project/mediaFiles.js";
import { chooseBackend, forcedBackend } from "../gpu/backend.js";
import { webgl2Available } from "../gpu/GlContext.js";
import { requestGpuAdapter } from "../gpu/GpuDevice.js";
import { compareSources, openFrames, type CompareReport } from "./compareFrames.js";
import { HttpDir } from "./HttpDir.js";
import { HttpSink, putOutput } from "./HttpSink.js";
import type { Rect } from "./ssim.js";

export interface RenderInfo {
  backend: "webgpu" | "webgl2";
  project: { name: string; width: number; height: number; fps: { num: number; den: number }; frames: number } | null;
  offline: string[];
}

export interface VideoOptions {
  range?: { start: Frame; end: Frame } | null;
  preset?: string | null;
  fileName: string;
}

export interface VideoResult {
  name: string;
  bytes: number;
  frames: number;
  width: number;
  height: number;
  videoCodec: string;
  audioCodec: string | null;
  ms: number;
}

export interface FramesResult {
  files: string[];
  width: number;
  height: number;
}

export interface RenderApi {
  /** Resolves when the GPU and the project are ready (rejects with the reason when they cannot be). */
  ready: Promise<RenderInfo>;
  video(options: VideoOptions): Promise<VideoResult>;
  frames(frames: readonly Frame[]): Promise<FramesResult>;
  compare(options: { region: Rect | null; diff: boolean; worst: number }): Promise<CompareReport>;
}

declare global {
  interface Window {
    __render?: RenderApi;
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The server's routes for this run, ending in "/". */
export function renderBase(search: string, origin: string): string {
  return `${origin}/__t/${encodeURIComponent(new URLSearchParams(search).get("render") ?? "")}/`;
}

function postProgress(base: string, done: number, total: number): void {
  void fetch(`${base}progress`, { method: "POST", body: JSON.stringify({ done, total }) }).catch(() => undefined);
}

async function startBackend(search: string): Promise<"webgpu" | "webgl2"> {
  const choice = await chooseBackend(forcedBackend(search), { requestAdapter: () => requestGpuAdapter(), webgl2: webgl2Available });
  if (!choice) throw new Error("This machine has neither WebGPU nor hardware WebGL2 (see docs/PROGRESS.md: headless Chrome flags)");
  startGpu(choice);
  for (let i = 0; i < 200 && gpuDevice.state !== "ready"; i++) {
    if (gpuDevice.state === "failed") throw new Error("The GPU device could not start");
    await sleep(50);
  }
  if (gpuDevice.state !== "ready") throw new Error("The GPU device did not become ready");
  return choice.backend;
}

async function loadProject(dir: HttpDir): Promise<Project> {
  const opened = await openProjectFolder(dir);
  documentStore.load(opened.project);
  const sources = new MediaSources({ dir, kv: keyValueStore, media: () => documentStore.getState().media, status: mediaStatus });
  setMediaSources(sources);
  await sources.checkAll();
  attachPreview(dir, () => false);
  // The text layouts and rasters follow the fonts that load (as in the app), and the project's faces are in before the first frame.
  installTextController();
  await attachFonts(dir, () => false);
  // The LUTs its LUT effects name (Batch 75), loaded before the first frame.
  await attachLuts(dir, () => false);
  await Promise.all(projectTextStyles(opened.project).map((style) => fontLibrary.load(style, "Aa")));
  installCatalogController();
  return opened.project;
}

function presetSettings(id: string | null | undefined) {
  if (!id) return REELS_PRESET.settings;
  const preset = BUILT_IN_PRESETS.find((candidate) => candidate.id === id);
  if (!preset) throw new Error(`Unknown preset "${id}" (${BUILT_IN_PRESETS.map((p) => p.id).join(", ")})`);
  return preset.settings;
}

/** Starts render mode: the page's only job. Never renders React. */
export function startRenderMode(search: string, origin: string): RenderApi {
  const base = renderBase(search, origin);
  const compareOnly = new URLSearchParams(search).get("mode") === "compare";
  const projectDir = new HttpDir(`${base}project/`, "project");
  themeBridge.refresh();

  const ready = (async (): Promise<RenderInfo> => {
    const backend = await startBackend(search);
    if (compareOnly) return { backend, project: null, offline: [] };
    const project = await loadProject(projectDir);
    const offline = Object.values(documentStore.getState().media)
      .filter((item) => mediaStatus.getState().has(item.id))
      .map((item) => item.name);
    return { backend, project: { name: project.name, width: project.settings.width, height: project.settings.height, fps: project.settings.fps, frames: contentEnd(project) }, offline };
  })();
  // A rejected `ready` is read by the CLI; keep the browser from reporting it as unhandled too.
  ready.catch(() => undefined);

  const api: RenderApi = {
    ready,
    async video(options) {
      await ready;
      const project = documentStore.getState();
      const range = options.range ?? { start: 0, end: contentEnd(project) };
      if (range.end <= range.start) throw new Error("Nothing to render: the range is empty");
      const format = exportFormat(project, presetSettings(options.preset));
      const controller = new AbortController();
      const inputs = await gatherInputs(projectDir, project, range, controller.signal);
      const output = await ExportFile.toPicked(new HttpSink(base, options.fileName), (error) => console.error("[render] write failed", error));
      try {
        const result = await requestVideoExport(
          project,
          range,
          format,
          inputs,
          false,
          controller.signal,
          (value) => {
            if (value.kind === "bytes") output.write(new Uint8Array(value.data), value.position);
            else if (value.kind !== "started") postProgress(base, value.done, value.total);
          },
          true,
        );
        const name = await output.finish(options.fileName);
        return { name, bytes: output.bytes, frames: result.frames, width: result.width, height: result.height, videoCodec: result.videoCodec, audioCodec: result.audioCodec, ms: result.ms };
      } catch (error) {
        await output.discard();
        throw error;
      }
    },
    async frames(frames) {
      await ready;
      const project = documentStore.getState();
      const files: string[] = [];
      let size = { width: 0, height: 0 };
      for (const [index, frame] of frames.entries()) {
        setPlayhead(sessionStore, frame);
        // The same call as Export frame.
        const png = await renderFramePng();
        const name = safeFileName(`${project.name}-frame-${frame}.png`);
        await putOutput(base, name, png.blob);
        files.push(name);
        size = { width: png.width, height: png.height };
        postProgress(base, index + 1, frames.length);
      }
      return { files, ...size };
    },
    async compare(options) {
      await ready;
      const [a, b] = [await openFrames(new HttpDir(`${base}input/a/`, "a"), "a"), await openFrames(new HttpDir(`${base}input/b/`, "b"), "b")];
      try {
        return await compareSources(a, b, { region: options.region, diffBase: options.diff ? base : null, worst: options.worst }, (done, total) => postProgress(base, done, total));
      } finally {
        await a.close();
        await b.close();
      }
    },
  };
  window.__render = api;
  return api;
}
