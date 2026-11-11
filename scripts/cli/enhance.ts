// `cli enhance` and `cli enhance-server` (v1.3): the denoise and color correction endpoint for other apps
// (docs/denoise_color_endpoint.md). The measuring happens in the render page (the browser's decoders on the
// project's own media); this file starts the session, writes the effects into project.json and reports.
//   enhance <dir> [--preset <id>] [--only denoise|color] [--no-match] [--match <0..1>] [--clips <id,id>] [--dry-run] [--json]
//   enhance-server [--port <n>] [--host <name>]     HTTP: GET /health, GET /presets, POST /enhance
// Exit codes: 0 written (or planned with --dry-run), 1 failed or nothing to enhance, 2 usage.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Effect } from "../../src/core/document/types.js";
import { SCHEMA_VERSION } from "../../src/core/document/types.js";
import { enhancedEffects } from "../../src/core/enhance/apply.js";
import { DEFAULT_PRESET, ENHANCE_PRESETS, enhancePreset, type ClipEnhancement, type EnhanceOptions } from "../../src/core/enhance/solve.js";
import type { EnhanceRequest, EnhanceResult, RenderInfo } from "../../src/render/headless/renderMode.js";
import { PROJECT_FILE, validateProjectFolder } from "./folder.js";
import { RESERVED_PORTS, withSession } from "./headless.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const DIST = join(root, "dist");

export const ENHANCE_USAGE = `  enhance <dir> [--preset <id>] [--only denoise|color] [--no-match] [--match <0..1>] [--clips <id,id>] [--dry-run] [--json]
                            measure the project's video and image clips and write their denoise and color correct
                            effects into project.json, matched across the clips (presets: ${ENHANCE_PRESETS.map((p) => p.id).join(", ")})
  enhance-presets           print the presets as JSON
  enhance-server [--port <n>] [--host <name>]
                            the same over HTTP: GET /health, GET /presets, POST /enhance (docs/denoise_color_endpoint.md)
`;

export const DEFAULT_PORT = 5320;

export interface EnhanceJob extends EnhanceOptions {
  /** The project folder. */
  project: string;
  clips?: string[] | null;
  /** Plan only: project.json is left as it is. */
  dryRun?: boolean;
}

export interface EnhanceReport {
  ok: boolean;
  project: string;
  preset: string;
  written: boolean;
  clips: ClipEnhancement[];
  skipped: { clipId: string; reason: string }[];
  /** Why nothing was written, or the validation errors of the result. */
  errors: string[];
}

/** What is wrong with a job before any work, or null. */
export function jobError(job: EnhanceJob): string | null {
  if (typeof job.project !== "string" || job.project === "") return "project: the path of a project folder is required";
  if (!existsSync(join(job.project, PROJECT_FILE))) return `${job.project} has no ${PROJECT_FILE}`;
  if (job.preset !== undefined && !enhancePreset(job.preset)) return `preset: unknown "${job.preset}" (${ENHANCE_PRESETS.map((p) => p.id).join(", ")})`;
  if (job.matchStrength !== undefined && !(job.matchStrength >= 0 && job.matchStrength <= 1)) return "matchStrength is between 0 and 1";
  if (job.denoise === false && job.color === false) return "denoise and color are both off: nothing to do";
  if (job.clips != null && (!Array.isArray(job.clips) || job.clips.some((id) => typeof id !== "string"))) return "clips is a list of clip ids";
  return null;
}

/** `plan` written into the clips of a parsed project.json (in place); the ids that were not found. */
export function writePlan(project: { clips?: Record<string, { effects?: Effect[] }> }, plan: readonly ClipEnhancement[]): string[] {
  const missing: string[] = [];
  for (const item of plan) {
    const clip = project.clips?.[item.clipId];
    if (!clip) missing.push(item.clipId);
    else clip.effects = enhancedEffects(clip.effects, item);
  }
  return missing;
}

/** Runs one job: measures in headless Chrome, writes project.json (unless dryRun) and validates the result. */
export async function enhanceFolder(job: EnhanceJob, onProgress?: (done: number, total: number) => void): Promise<EnhanceReport> {
  const dir = resolve(job.project);
  const preset = job.preset ?? DEFAULT_PRESET;
  const report: EnhanceReport = { ok: false, project: dir, preset, written: false, clips: [], skipped: [], errors: [] };
  const problem = jobError({ ...job, project: dir });
  if (problem) return { ...report, errors: [problem] };
  const file = join(dir, PROJECT_FILE);
  const before = JSON.parse(readFileSync(file, "utf8")) as { schemaVersion?: number; clips?: Record<string, { effects?: Effect[] }> };
  if (!job.dryRun && before.schemaVersion !== SCHEMA_VERSION) return { ...report, errors: [`project.json is schema ${before.schemaVersion}, effects are written at schema ${SCHEMA_VERSION}: run "normalize ${job.project} --write" first`] };
  const request: EnhanceRequest = { preset, clips: job.clips ?? null, ...(job.denoise !== undefined && { denoise: job.denoise }), ...(job.color !== undefined && { color: job.color }), ...(job.match !== undefined && { match: job.match }), ...(job.matchStrength !== undefined && { matchStrength: job.matchStrength }) };
  const result = await withSession({ dist: DIST, renderer: "webgpu", roots: { project: dir } }, async ({ page, server }) => {
    await page.evaluate<RenderInfo>("window.__render.ready").catch((error: unknown) => {
      throw new Error(`${error instanceof Error ? error.message : String(error)}${page.logs.length > 0 ? `\n${page.logs.slice(-5).join("\n")}` : ""}`);
    });
    if (onProgress) server.onProgress(onProgress);
    return page.evaluate<EnhanceResult>(`window.__render.enhance(${JSON.stringify(request)})`);
  });
  report.clips = result.plan;
  report.skipped = result.skipped;
  if (result.plan.length === 0) return { ...report, errors: ["no clip could be measured"] };
  if (job.dryRun) return { ...report, ok: true };
  // The file is read again: the measuring took a while and only the effects of the planned clips are touched.
  const project = JSON.parse(readFileSync(file, "utf8")) as { clips?: Record<string, { effects?: Effect[] }> };
  for (const id of writePlan(project, result.plan)) report.skipped.push({ clipId: id, reason: "the clip is no longer in project.json" });
  writeFileSync(file, `${JSON.stringify(project, null, 2)}\n`, "utf8");
  report.written = true;
  const check = await validateProjectFolder(dir);
  report.errors = check.errors.map((issue) => `${issue.path}: ${issue.message}`);
  if (!check.ok) {
    // An invalid result is never left behind.
    writeFileSync(file, `${JSON.stringify(before, null, 2)}\n`, "utf8");
    report.written = false;
    return report;
  }
  return { ...report, ok: true };
}

interface Parsed {
  positional: string[];
  values: Map<string, string>;
  flags: Set<string>;
  error?: string;
}

function parse(argv: readonly string[], valueOptions: readonly string[], flagOptions: readonly string[]): Parsed {
  const parsed: Parsed = { positional: [], values: new Map(), flags: new Set() };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (!arg.startsWith("--")) parsed.positional.push(arg);
    else if (flagOptions.includes(arg)) parsed.flags.add(arg);
    else if (valueOptions.includes(arg)) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) return { ...parsed, error: `${arg} needs a value` };
      parsed.values.set(arg, value);
      i++;
    } else return { ...parsed, error: `Unknown option ${arg}` };
  }
  return parsed;
}

function usage(message: string): number {
  console.error(`${message}\n${ENHANCE_USAGE}`);
  return 2;
}

const describe = (item: ClipEnhancement): string => {
  const parts = [`${item.clipId}: brightness ${item.measured.brightness.toFixed(3)}${item.predicted ? ` -> ${item.predicted.brightness.toFixed(3)}` : ""}, noise ${item.measured.noise.toFixed(4)}`];
  if (item.denoise) parts.push(`denoise ${item.denoise.method} luma ${item.denoise.luma} chroma ${item.denoise.chroma}`);
  if (item.color) parts.push(`exposure ${item.color.exposure}, brightness ${item.color.gamma}, contrast ${item.color.contrast}, temperature ${item.color.temperature}, tint ${item.color.tint}, saturation ${item.color.saturation}`);
  return parts.join("; ");
};

export async function enhanceCommand(argv: readonly string[]): Promise<number> {
  const parsed = parse(argv, ["--preset", "--only", "--match", "--clips"], ["--no-match", "--dry-run", "--json"]);
  if (parsed.error) return usage(parsed.error);
  const [folder] = parsed.positional;
  if (parsed.positional.length !== 1 || !folder) return usage("enhance needs one project folder");
  const only = parsed.values.get("--only");
  if (only !== undefined && only !== "denoise" && only !== "color") return usage("--only is denoise or color");
  const match = parsed.values.get("--match");
  const job: EnhanceJob = {
    project: folder,
    ...(parsed.values.has("--preset") && { preset: parsed.values.get("--preset") as string }),
    ...(only === "denoise" && { color: false }),
    ...(only === "color" && { denoise: false }),
    ...(parsed.flags.has("--no-match") && { match: false }),
    ...(match !== undefined && { matchStrength: Number(match) }),
    ...(parsed.values.has("--clips") && { clips: (parsed.values.get("--clips") as string).split(",").map((id) => id.trim()).filter(Boolean) }),
    dryRun: parsed.flags.has("--dry-run"),
  };
  const problem = jobError(job);
  if (problem) return usage(problem);
  const json = parsed.flags.has("--json");
  try {
    const report = await enhanceFolder(job, json ? undefined : (done, total) => console.error(`measured ${done} / ${total} clips`));
    if (json) console.log(JSON.stringify(report, null, 2));
    else {
      for (const item of report.clips) console.log(describe(item));
      for (const skip of report.skipped) console.error(`skipped ${skip.clipId}: ${skip.reason}`);
      for (const error of report.errors) console.error(`error   ${error}`);
      console.error(report.written ? `written: ${join(report.project, PROJECT_FILE)} (preset ${report.preset}, ${report.clips.length} clips)` : report.ok ? `planned ${report.clips.length} clips (dry run, nothing written)` : "not written");
    }
    return report.ok ? 0 : 1;
  } catch (error) {
    console.error(`enhance failed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

function readBody(request: IncomingMessage, limit = 1 << 20): Promise<string> {
  return new Promise((done, fail) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        fail(new Error("The request body is too large"));
        request.destroy();
      } else chunks.push(chunk);
    });
    request.on("end", () => done(Buffer.concat(chunks).toString("utf8")));
    request.on("error", fail);
  });
}

function send(response: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body, null, 2);
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(text), "cache-control": "no-store" });
  response.end(text);
}

/** The presets as the endpoint lists them. */
export const presetList = () => ENHANCE_PRESETS.map((preset) => ({ id: preset.id, name: preset.name, description: preset.description, default: preset.id === DEFAULT_PRESET, denoise: preset.denoise, color: preset.color }));

/**
 * The HTTP endpoint. Jobs run one at a time (each starts a headless Chrome); a request waits for the ones
 * before it. `run` is the job runner (enhanceFolder; a stub in tests).
 */
export function createEnhanceServer(version: string, run: (job: EnhanceJob) => Promise<EnhanceReport> = enhanceFolder) {
  let queue: Promise<unknown> = Promise.resolve();
  return createServer((request, response) => {
    void (async () => {
      const path = (request.url ?? "/").split("?")[0];
      if (request.method === "GET" && path === "/health") return send(response, 200, { ok: true, name: "shorts-editor-enhance", version, schemaVersion: SCHEMA_VERSION });
      if (request.method === "GET" && path === "/presets") return send(response, 200, { default: DEFAULT_PRESET, presets: presetList() });
      if (path !== "/enhance") return send(response, 404, { ok: false, errors: [`no route ${request.method} ${path}: GET /health, GET /presets, POST /enhance`] });
      if (request.method !== "POST") return send(response, 405, { ok: false, errors: ["/enhance takes POST with a JSON body"] });
      let job: EnhanceJob;
      try {
        job = JSON.parse(await readBody(request)) as EnhanceJob;
        if (job === null || typeof job !== "object" || Array.isArray(job)) throw new Error("the body is a JSON object");
      } catch (error) {
        return send(response, 400, { ok: false, errors: [`bad request body: ${error instanceof Error ? error.message : String(error)}`] });
      }
      const problem = jobError(job);
      if (problem) return send(response, 400, { ok: false, errors: [problem] });
      const turn = queue.then(() => run(job));
      queue = turn.catch(() => undefined);
      try {
        const report = await turn;
        send(response, report.ok ? 200 : 422, report);
      } catch (error) {
        send(response, 500, { ok: false, errors: [error instanceof Error ? error.message : String(error)] });
      }
    })();
  });
}

export async function enhanceServerCommand(argv: readonly string[], version: string): Promise<number> {
  const parsed = parse(argv, ["--port", "--host"], []);
  if (parsed.error) return usage(parsed.error);
  if (parsed.positional.length > 0) return usage("enhance-server takes no folder: the project comes with each request");
  const port = Number(parsed.values.get("--port") ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return usage("--port is a port number");
  if (RESERVED_PORTS.includes(port)) return usage(`port ${port} is reserved (${RESERVED_PORTS.join(", ")})`);
  const host = parsed.values.get("--host") ?? "127.0.0.1";
  const server = createEnhanceServer(version);
  await new Promise<void>((done, fail) => {
    server.once("error", fail);
    server.listen(port, host, done);
  });
  console.error(`enhance endpoint on http://${host}:${port} (POST /enhance, GET /presets, GET /health); Ctrl+C stops it`);
  await new Promise<void>((done) => {
    const stop = () => server.close(() => done());
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
  return 0;
}
