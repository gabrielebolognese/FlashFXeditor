// The image outputs of the export (spec §21.25, Batch 81), run by export.worker next to `runExport`:
// - PNG sequence: every exported frame is rendered, encoded as a PNG (straight alpha when the export is
//   transparent) and handed to the main thread as a file named `<name>_%05d.png`, numbered from 1.
// - GIF: a palette from frames spread over the range (`gif.ts`), a size estimate from encoding those
//   samples, then every frame through the shared palette; the file's bytes go out in order with their
//   positions, like the MP4's.
// `gate` pauses between frames and an aborted signal stops at the next frame, as in the video export.
// The browser parts (the renderer's pixels, PNG encoding) are injected: fakes in the tests.
import type { Frame } from "../core/document/types.js";
import { fpsToNumber } from "../core/document/time.js";
import { buildPalette, GifWriter, projectGifBytes, sampleIndices, type RgbaImage } from "./gif.js";
import { PauseGate, type PipelineProgress } from "./pipeline.js";
import { projectFrameAt, type ExportPlan } from "./plan.js";

/** What the image outputs add to the pipeline's progress values. */
export type FramesProgress = PipelineProgress | { kind: "file"; name: string; data: ArrayBuffer } | { kind: "estimate"; bytes: number };

export interface FramesJob {
  plan: ExportPlan;
  container: "png" | "gif";
  width: number;
  height: number;
  /** GIF: ordered dithering. */
  dither: boolean;
  /** The sequence's base name (frames are `<name>_00001.png`). */
  name: string;
}

export interface FramesDeps {
  /** Exported frame `k` (project frame `frame`) as straight RGBA pixels. */
  render(frame: Frame, k: number, signal: AbortSignal): Promise<RgbaImage>;
  /** The PNG file of `image`. */
  encodePng(image: RgbaImage): Promise<Uint8Array>;
  now(): number;
}

export interface FramesResult {
  frames: number;
  /** Files written (a PNG sequence), or 1 (the GIF). */
  files: number;
  ms: number;
}

/** At most one `frames` progress value this often (ms), and one at the end. */
export const FRAMES_PROGRESS_MS = 100;

/** `<name>_00001.png`: the file of exported frame `k` (0-based; the numbers start at 1, five digits at least). */
export function sequenceFileName(name: string, k: number): string {
  return `${name}_${String(k + 1).padStart(5, "0")}.png`;
}

/** The first and last file names of a sequence of `frames` frames, for the toast. */
export function sequenceRange(name: string, frames: number): string {
  return frames <= 1 ? sequenceFileName(name, 0) : `${sequenceFileName(name, 0)} … ${sequenceFileName(name, frames - 1)}`;
}

export async function runFrames(job: FramesJob, deps: FramesDeps, signal: AbortSignal, emit: (progress: FramesProgress) => void, gate: PauseGate = new PauseGate()): Promise<FramesResult> {
  const { plan } = job;
  const started = deps.now();
  let lastProgress = -Infinity;
  const progress = (done: number, force = false) => {
    const now = deps.now();
    if (!force && now - lastProgress < FRAMES_PROGRESS_MS) return;
    lastProgress = now;
    emit({ kind: "frames", done, total: plan.frames });
  };
  emit({ kind: "started", videoCodec: job.container, audioCodec: null });
  signal.throwIfAborted();

  if (job.container === "png") {
    for (let k = 0; k < plan.frames; k++) {
      await gate.wait(signal);
      signal.throwIfAborted();
      const image = await deps.render(projectFrameAt(plan, k), k, signal);
      const png = await deps.encodePng(image);
      emit({ kind: "file", name: sequenceFileName(job.name, k), data: png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer });
      progress(k + 1);
    }
    progress(plan.frames, true);
    return { frames: plan.frames, files: plan.frames, ms: deps.now() - started };
  }

  // GIF: the palette, and the size estimate from the sampled frames.
  const samples: RgbaImage[] = [];
  for (const k of sampleIndices(plan.frames)) {
    await gate.wait(signal);
    signal.throwIfAborted();
    samples.push(await deps.render(projectFrameAt(plan, k), k, signal));
  }
  const palette = buildPalette(samples);
  const fps = fpsToNumber(plan.fps);
  const options = { width: job.width, height: job.height, fps, palette, dither: job.dither };
  // The samples through a writer of their own: the first one's bytes carry the header and the palette.
  const probe = new GifWriter(options);
  const sizes = samples.map((sample) => probe.addFrame(sample).length);
  const rest = sizes.slice(1);
  const perFrame = rest.length > 0 ? rest : sizes;
  const mean = perFrame.reduce((n, b) => n + b, 0) / perFrame.length;
  // Header, palette and trailer: what the first frame cost beyond an average one.
  const fixed = rest.length > 0 ? Math.max(0, (sizes[0] as number) - mean) + 1 : 1;
  emit({ kind: "estimate", bytes: projectGifBytes(perFrame, plan.frames, fixed) });

  const gif = new GifWriter(options);
  let position = 0;
  const write = (data: Uint8Array) => {
    if (data.length === 0) return;
    emit({ kind: "bytes", position, data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer });
    position += data.length;
  };
  for (let k = 0; k < plan.frames; k++) {
    await gate.wait(signal);
    signal.throwIfAborted();
    write(gif.addFrame(await deps.render(projectFrameAt(plan, k), k, signal)));
    progress(k + 1);
  }
  write(gif.finish());
  progress(plan.frames, true);
  return { frames: plan.frames, files: 1, ms: deps.now() - started };
}
