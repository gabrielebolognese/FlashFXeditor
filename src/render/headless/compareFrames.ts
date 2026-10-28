// `cli compare` inside the headless page (spec §21.6): frames of a video (decoded with WebCodecs by the
// decode worker, the same path the editor's preview uses) or of a folder of PNGs, matched by frame
// number and scored with SSIM and PSNR (ssim.ts). Difference images go to the CLI through HttpSink.
import { workerPool } from "../../app/services.js";
import type { FsDir } from "../../project/fs.js";
import { putOutput } from "./HttpSink.js";
import { diffImage, scoreFrames, type FrameScore, type Rect } from "./ssim.js";

export interface RawFrame {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** A source of frames keyed by frame number. */
export interface FrameSource {
  kind: "video" | "png";
  keys: number[];
  get(key: number): Promise<RawFrame>;
  close(): Promise<void>;
}

export interface FrameReport extends FrameScore {
  frame: number;
  note?: string;
}

export interface CompareReport {
  a: { kind: string; frames: number };
  b: { kind: string; frames: number };
  compared: number;
  min: { ssim: number; psnr: number };
  mean: { ssim: number };
  /** The lowest scoring frames, worst first. */
  worst: FrameReport[];
  /** Frame numbers present on one side only (a video against a video of another length). */
  unmatched: number[];
  frames: FrameReport[];
}

/** PSNR of identical frames (infinite) is reported as this many dB: JSON has no infinity. */
export const PSNR_CAP = 100;
const VIDEO_EXT = /\.(mp4|m4v|mov|webm)$/i;

function toRaw(source: CanvasImageSource, width: number, height: number): RawFrame {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("No 2D canvas to read frames with");
  context.drawImage(source, 0, 0);
  return { width, height, data: context.getImageData(0, 0, width, height).data };
}

/** The frames of the video or PNG folder in `dir` (a folder holding one video file, or PNG files). */
export async function openFrames(dir: FsDir, id: string): Promise<FrameSource> {
  const entries = (await dir.list()).filter((entry) => entry.kind === "file");
  const video = entries.find((entry) => VIDEO_EXT.test(entry.name));
  if (video) {
    const file = await dir.getFile(video.name);
    if (!file) throw new Error(`Cannot read ${video.name}`);
    const mediaId = `compare-${id}`;
    const { info } = await workerPool.request("openVideo", { mediaId, lod: "full", file, cachedIndex: null }, { priority: "user" });
    if (!info.decodable) throw new Error(`This browser cannot decode ${video.name} (${info.codec})`);
    const times = info.frameTimesUs;
    return {
      kind: "video",
      keys: Array.from(times, (_, index) => index),
      async get(key) {
        const delivered = await workerPool.request("requestFrame", { mediaId, lod: "full", timeUs: times[key] as number, priority: "scrub" }, { priority: "user" });
        try {
          return toRaw(delivered.frame, delivered.frame.displayWidth, delivered.frame.displayHeight);
        } finally {
          delivered.frame.close();
        }
      },
      close: async () => {
        await workerPool.request("closeVideo", { mediaId }, { priority: "user" });
      },
    };
  }
  const pngs = entries.filter((entry) => /\.png$/i.test(entry.name));
  if (pngs.length === 0) throw new Error("Expected a video file or PNG files");
  // `<name>-frame-<n>.png` (what Export frame writes) is frame n; any other name is its position in the sorted list.
  const numbered = pngs.map((entry, position) => ({ name: entry.name, key: Number(/-frame-(\d+)\.png$/i.exec(entry.name)?.[1] ?? position) }));
  numbered.sort((x, y) => x.key - y.key);
  const names = new Map(numbered.map((item) => [item.key, item.name]));
  return {
    kind: "png",
    keys: numbered.map((item) => item.key),
    async get(key) {
      const file = await dir.getFile(names.get(key) as string);
      if (!file) throw new Error(`Cannot read ${names.get(key)}`);
      const bitmap = await createImageBitmap(file, { premultiplyAlpha: "none", colorSpaceConversion: "none" });
      try {
        return toRaw(bitmap, bitmap.width, bitmap.height);
      } finally {
        bitmap.close();
      }
    },
    close: async () => undefined,
  };
}

export interface CompareOptions {
  region: Rect | null;
  /** Server base URL to upload difference images to, or null for none. */
  diffBase: string | null;
  worst: number;
}

/** Scores the frames two sources have in common (all of them for two videos; the numbered ones for PNGs). */
export async function compareSources(a: FrameSource, b: FrameSource, options: CompareOptions, progress: (done: number, total: number) => void = () => undefined): Promise<CompareReport> {
  const inB = new Set(b.keys);
  const inA = new Set(a.keys);
  const both = a.keys.filter((key) => inB.has(key));
  // A PNG set is a sample of frames: only the video's frames it names count as unmatched when the other is a video of the same length.
  const sparse = a.kind === "png" || b.kind === "png";
  const unmatched = sparse ? a.keys.filter((key) => !inB.has(key)).concat(b.keys.filter((key) => !inA.has(key) && a.kind === "png")) : [...a.keys.filter((key) => !inB.has(key)), ...b.keys.filter((key) => !inA.has(key))];
  const frames: FrameReport[] = [];
  for (const key of both) {
    const [x, y] = [await a.get(key), await b.get(key)];
    if (x.width !== y.width || x.height !== y.height) {
      frames.push({ frame: key, ssim: 0, psnr: 0, region: null, note: `size ${x.width}x${x.height} against ${y.width}x${y.height}` });
    } else {
      const score = scoreFrames(x.data, y.data, x.width, x.height, options.region);
      frames.push({ frame: key, ...score, psnr: Math.min(score.psnr, PSNR_CAP) });
      if (options.diffBase && score.ssim < 1) {
        const canvas = new OffscreenCanvas(x.width, x.height);
        canvas.getContext("2d")?.putImageData(new ImageData(diffImage(x.data, y.data) as Uint8ClampedArray<ArrayBuffer>, x.width, x.height), 0, 0);
        await putOutput(options.diffBase, `diff-${String(key).padStart(5, "0")}.png`, await canvas.convertToBlob({ type: "image/png" }));
      }
    }
    progress(frames.length, both.length);
  }
  const lowest = [...frames].sort((p, q) => p.ssim - q.ssim);
  return {
    a: { kind: a.kind, frames: a.keys.length },
    b: { kind: b.kind, frames: b.keys.length },
    compared: frames.length,
    min: { ssim: lowest[0]?.ssim ?? 1, psnr: frames.reduce((low, f) => Math.min(low, f.psnr), Infinity) },
    mean: { ssim: frames.length === 0 ? 1 : frames.reduce((sum, f) => sum + f.ssim, 0) / frames.length },
    worst: lowest.slice(0, options.worst),
    unmatched,
    frames,
  };
}
