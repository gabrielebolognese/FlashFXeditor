// `cli render` and `cli compare` (spec §21.6, Batch 57). The work happens in the render page (the app's
// own compositor, export job and decoders, in headless Chrome); this file parses the command line,
// starts the session (headless.ts), prints the progress and the report, and sets the exit code.
//   render <dir> --out <file.mp4> [--range <from>:<to>] [--preset <id>] [--backend webgpu|webgl2]
//   render <dir> --frames <f1,f2,...> --png <outdir> [--backend ...]
//   compare <a> <b> [--ssim <min>] [--psnr <min>] [--region x,y,w,h] [--diff <dir>] [--json]
// Exit codes: 0 done / within thresholds, 1 below thresholds (compare) or a failed render, 2 usage.
import { existsSync, mkdirSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { withSession } from "./headless.js";
import type { CompareReport, FrameReport } from "../../src/render/headless/compareFrames.js";
import type { FramesResult, RenderInfo, VideoResult } from "../../src/render/headless/renderMode.js";
import { parseRegion, type Rect } from "../../src/render/headless/ssim.js";

// Bundled into dist-cli/project-cli.mjs (like project-cli.ts): the repository root is one level up.
const root = fileURLToPath(new URL("../", import.meta.url));
const DIST = join(root, "dist");

export const RENDER_USAGE = `  render <dir> --out <file.mp4> [--range <from>:<to>] [--preset <id>] [--backend webgpu|webgl2]
  render <dir> --frames <f1,f2,...> --png <outdir> [--backend webgpu|webgl2]
                            render a project folder with the editor's own compositor and encoders
  compare <a> <b> [--ssim <min>] [--psnr <min>] [--region x,y,w,h] [--diff <dir>] [--json]
                            compare two videos or PNG folders frame by frame (exit 1 below the thresholds)
`;

const VALUE_OPTIONS = new Set(["--out", "--range", "--preset", "--backend", "--frames", "--png", "--ssim", "--psnr", "--region", "--diff", "--worst"]);
const FLAG_OPTIONS = new Set(["--json"]);

export interface ParsedArgs {
  positional: string[];
  options: Map<string, string>;
  flags: Set<string>;
  error?: string;
}

/** Splits arguments into positionals, `--name value` options and `--flag` switches. */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const parsed: ParsedArgs = { positional: [], options: new Map(), flags: new Set() };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (!arg.startsWith("--")) {
      parsed.positional.push(arg);
    } else if (FLAG_OPTIONS.has(arg)) {
      parsed.flags.add(arg);
    } else if (VALUE_OPTIONS.has(arg)) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) return { ...parsed, error: `${arg} needs a value` };
      parsed.options.set(arg, value);
      i++;
    } else {
      return { ...parsed, error: `Unknown option ${arg}` };
    }
  }
  return parsed;
}

/** `from:to` as a frame range (end exclusive), or null. */
export function parseFrameRange(text: string): { start: number; end: number } | null {
  const match = /^(\d+):(\d+)$/.exec(text.trim());
  if (!match) return null;
  const [start, end] = [Number(match[1]), Number(match[2])];
  return end > start ? { start, end } : null;
}

/** `0,45,89` as frame numbers, or null. */
export function parseFrameList(text: string): number[] | null {
  const parts = text.split(",").map((part) => part.trim());
  if (parts.length === 0 || parts.some((part) => !/^\d+$/.test(part))) return null;
  return [...new Set(parts.map(Number))];
}

function usage(message: string): number {
  console.error(`${message}\n${RENDER_USAGE}`);
  return 2;
}

function backendOf(parsed: ParsedArgs): "webgpu" | "webgl2" | null {
  const value = parsed.options.get("--backend") ?? "webgpu";
  return value === "webgpu" || value === "webgl2" ? value : null;
}

const bar = (done: number, total: number) => `${String(done).padStart(String(total).length)} / ${total} frames`;

/** Progress on stderr: one line rewritten in a terminal, a line every 2 s in a log. */
function progressPrinter(server: { onProgress(listener: (done: number, total: number) => void): void }, label: string): void {
  let lastLine = 0;
  const tty = process.stderr.isTTY === true;
  server.onProgress((done, total) => {
    const now = Date.now();
    if (done !== total && now - lastLine < (tty ? 500 : 2000)) return;
    lastLine = now;
    process.stderr.write(tty ? `\r${label} ${bar(done, total)}   ${done === total ? "\n" : ""}` : `${label} ${bar(done, total)}\n`);
  });
}

export async function renderCommand(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if (parsed.error) return usage(parsed.error);
  const [folder] = parsed.positional;
  if (parsed.positional.length !== 1 || !folder) return usage("render needs one project folder");
  if (!existsSync(join(folder, "project.json"))) return usage(`${folder} has no project.json`);
  const backend = backendOf(parsed);
  if (!backend) return usage("--backend is webgpu or webgl2");
  const framesText = parsed.options.get("--frames");
  const out = parsed.options.get("--out");
  const png = parsed.options.get("--png");
  const frames = framesText === undefined ? null : parseFrameList(framesText);
  if (framesText !== undefined && !frames) return usage("--frames is a comma-separated list of frame numbers");
  if (frames && !png) return usage("--frames needs --png <outdir>");
  if (!frames && !out) return usage("render needs --out <file.mp4> (or --frames and --png)");
  if (frames && out) return usage("use --out for a video or --frames with --png for frames, not both");
  const rangeText = parsed.options.get("--range");
  const range = rangeText === undefined ? null : parseFrameRange(rangeText);
  if (rangeText !== undefined && !range) return usage("--range is <from>:<to> in frames, end after start");

  const outFile = out ? resolve(out) : null;
  const pngDir = png ? resolve(png) : null;
  if (outFile) mkdirSync(dirname(outFile), { recursive: true });
  if (pngDir) mkdirSync(pngDir, { recursive: true });
  try {
    await withSession({ dist: DIST, renderer: backend, roots: { project: resolve(folder), ...(outFile && { sinkFile: outFile }), ...(pngDir && { out: pngDir }) } }, async ({ page, server }) => {
      const info = await page.evaluate<RenderInfo>("window.__render.ready").catch((error: unknown) => {
        throw new Error(`${error instanceof Error ? error.message : String(error)}${page.logs.length > 0 ? `\n${page.logs.slice(-5).join("\n")}` : ""}`);
      });
      console.error(`${info.backend}: ${info.project?.name} ${info.project?.width}x${info.project?.height}, ${info.project?.frames} frames${info.offline.length > 0 ? `; offline media: ${info.offline.join(", ")}` : ""}`);
      progressPrinter(server, frames ? "frames" : "rendering");
      if (frames) {
        const result = await page.evaluate<FramesResult>(`window.__render.frames(${JSON.stringify(frames)})`);
        for (const name of result.files) console.log(join(png as string, name));
        return;
      }
      const options = JSON.stringify({ fileName: basename(outFile as string), range, preset: parsed.options.get("--preset") ?? null });
      const started = Date.now();
      const result = await page.evaluate<VideoResult>(`window.__render.video(${options})`);
      const seconds = (Date.now() - started) / 1000;
      const length = result.frames / ((info.project?.fps.num ?? 30) / (info.project?.fps.den ?? 1));
      console.error(`${outFile}: ${result.frames} frames ${result.width}x${result.height} ${result.videoCodec}${result.audioCodec ? ` / ${result.audioCodec}` : ""}, ${result.bytes} bytes in ${seconds.toFixed(1)} s (${(seconds / length).toFixed(2)}x real time)`);
      console.log(outFile);
      if (!statSync(outFile as string).isFile()) throw new Error("The render wrote no file");
    });
    return 0;
  } catch (error) {
    console.error(`render failed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

function describe(frame: FrameReport): string {
  const region = frame.region ? ` region ${frame.region.x},${frame.region.y},${frame.region.w},${frame.region.h}` : "";
  return `frame ${frame.frame}: SSIM ${frame.ssim.toFixed(4)}, PSNR ${frame.psnr >= 100 ? "inf" : `${frame.psnr.toFixed(2)} dB`}${region}${frame.note ? ` (${frame.note})` : ""}`;
}

export interface Verdict {
  ok: boolean;
  failing: FrameReport[];
}

/** Frames below the thresholds (and any unmatched frame fails the comparison). */
export function judge(report: CompareReport, minSsim: number, minPsnr: number | null): Verdict {
  const failing = report.frames.filter((frame) => frame.ssim < minSsim || (minPsnr !== null && frame.psnr < minPsnr));
  return { ok: failing.length === 0 && report.unmatched.length === 0 && report.compared > 0, failing };
}

export async function compareCommand(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if (parsed.error) return usage(parsed.error);
  const [a, b] = parsed.positional;
  if (parsed.positional.length !== 2 || !a || !b) return usage("compare needs two videos or PNG folders");
  for (const input of [a, b]) if (!existsSync(input)) return usage(`${input} does not exist`);
  const minSsim = Number(parsed.options.get("--ssim") ?? "0.99");
  const minPsnr = parsed.options.has("--psnr") ? Number(parsed.options.get("--psnr")) : null;
  if (!Number.isFinite(minSsim) || minSsim < 0 || minSsim > 1) return usage("--ssim is between 0 and 1");
  if (minPsnr !== null && !Number.isFinite(minPsnr)) return usage("--psnr is a number of dB");
  let region: Rect | null = null;
  if (parsed.options.has("--region")) {
    region = parseRegion(parsed.options.get("--region") as string);
    if (!region) return usage("--region is x,y,w,h in pixels");
  }
  const diffDir = parsed.options.has("--diff") ? resolve(parsed.options.get("--diff") as string) : null;
  if (diffDir) mkdirSync(diffDir, { recursive: true });
  const worst = Number(parsed.options.get("--worst") ?? "5");
  const json = parsed.flags.has("--json");
  try {
    const report = await withSession({ dist: DIST, renderer: "webgpu", mode: "compare", roots: { inputs: { a: resolve(a), b: resolve(b) }, ...(diffDir && { out: diffDir }) } }, async ({ page, server }) => {
      await page.evaluate("window.__render.ready").catch((error: unknown) => {
        throw new Error(`${error instanceof Error ? error.message : String(error)}${page.logs.length > 0 ? `\n${page.logs.slice(-5).join("\n")}` : ""}`);
      });
      if (!json) progressPrinter(server, "comparing");
      return page.evaluate<CompareReport>(`window.__render.compare(${JSON.stringify({ region, diff: diffDir !== null, worst })})`);
    });
    const verdict = judge(report, minSsim, minPsnr);
    if (json) {
      console.log(JSON.stringify({ ok: verdict.ok, thresholds: { ssim: minSsim, psnr: minPsnr }, region, ...report, frames: undefined, failing: verdict.failing }, null, 2));
    } else {
      console.log(`compared ${report.compared} frames (${report.a.kind} ${report.a.frames} against ${report.b.kind} ${report.b.frames})${region ? ` in region ${region.x},${region.y},${region.w},${region.h}` : ""}`);
      console.log(`SSIM min ${report.min.ssim.toFixed(4)}, mean ${report.mean.ssim.toFixed(4)}; PSNR min ${report.min.psnr >= 100 ? "inf" : `${report.min.psnr.toFixed(2)} dB`}`);
      for (const frame of report.worst.filter((f) => f.ssim < 1)) console.log(`  ${describe(frame)}`);
      if (report.unmatched.length > 0) console.log(`unmatched frames: ${report.unmatched.slice(0, 20).join(", ")}${report.unmatched.length > 20 ? ", ..." : ""}`);
      if (verdict.failing.length > 0) console.log(`below the threshold (${verdict.failing.length} frames): ${verdict.failing.slice(0, 20).map((f) => f.frame).join(", ")}${verdict.failing.length > 20 ? ", ..." : ""}`);
      console.log(verdict.ok ? "ok" : "differs");
    }
    return verdict.ok ? 0 : 1;
  } catch (error) {
    console.error(`compare failed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
