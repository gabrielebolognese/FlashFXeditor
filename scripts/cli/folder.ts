// Project folders on disk for the CLI (spec §21.3, Batches 54 and 55): `validateProjectFolder`, `projectInfo`
// and `normalizeProjectFolder`. Node only; the document model, the field table, the validator, the media
// header readers and the defaults are the app's own modules.
import { existsSync, openAsBlob, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve, sep } from "node:path";
import { normalizeProject, type MediaFacts, type NormalizeNote } from "../../src/core/document/normalize.js";
import { formatTimecode, usPerFrame } from "../../src/core/document/time.js";
import { strictIssues, validateStrict, type StrictIssue } from "../../src/core/document/strict.js";
import type { JsonObject, MediaItem, Project } from "../../src/core/document/types.js";
import { readMediaHeader } from "../../src/media/probe/nodeHeaders.js";
import { fontFormat } from "../../src/text/fonts/sfnt.js";
import { existingFaces, planFonts, readCatalog, writeFonts, type FontPlan } from "./fonts.js";

export const PROJECT_FILE = "project.json";
export const FONTS_MANIFEST = "fonts/fonts.json";

/** `C:\x`, `C:/x` and `/c/x` (Git Bash) all name the same folder on Windows. */
export function normalizeCliPath(path: string, platform: string = process.platform): string {
  const drive = /^\/([a-zA-Z])(\/.*)?$/.exec(path);
  if (platform === "win32" && drive) return `${(drive[1] as string).toUpperCase()}:${drive[2] ?? "/"}`;
  return path;
}

export interface FolderReport {
  ok: boolean;
  schemaVersion: number | null;
  errors: StrictIssue[];
  warnings: StrictIssue[];
  /** Baked stand-ins by the kind they stand for. */
  standIns: Record<string, number>;
}

const fileExists = (path: string): boolean => existsSync(path) && statSync(path).isFile();

function readJson(path: string): { value: unknown } | { error: string } {
  try {
    const text = readFileSync(path, "utf8");
    return { value: JSON.parse(text.startsWith("\uFEFF") ? text.slice(1) : text) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function standInsOf(project: Project): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const clip of Object.values(project.clips)) if (clip.fallbackOf) counts[clip.fallbackOf.kind] = (counts[clip.fallbackOf.kind] ?? 0) + 1;
  return counts;
}

/** The file of a media record inside the project folder (null for a path that leaves it). */
function mediaPath(dir: string, relPath: string): string | null {
  const path = resolve(dir, relPath);
  return path.startsWith(dir + sep) ? path : null;
}

/** What the header of a media file says (or why it cannot be read); undefined when there is no file. */
export async function readFacts(dir: string, relPath: string): Promise<MediaFacts | undefined> {
  const path = mediaPath(dir, relPath);
  if (!path || !fileExists(path)) return undefined;
  const size = statSync(path).size;
  try {
    return { probe: await readMediaHeader(await openAsBlob(path), relPath), size };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), size };
  }
}

/** The record against its file's header: a duration within a frame is a warning, beyond it an error; a size that differs is an error. */
function headerIssues(id: string, media: MediaItem, facts: MediaFacts, project: Project, errors: StrictIssue[], warnings: StrictIssue[]): void {
  const path = `media.${id}`;
  if (!facts.probe) {
    warnings.push({ path: `${path}.file`, message: `its header cannot be read (${facts.error ?? "unknown"}); the app repairs it on open` });
    return;
  }
  const probe = facts.probe;
  const frame = usPerFrame(project.settings.fps);
  if (media.kind !== "image" || probe.durationUs > 0) {
    const diff = Math.abs(media.durationUs - probe.durationUs);
    const message = `durationUs ${media.durationUs} differs from the file's ${probe.durationUs} (${(diff / frame).toFixed(2)} frames)`;
    if (diff > frame) errors.push({ path: `${path}.durationUs`, message });
    else if (diff > 1000) warnings.push({ path: `${path}.durationUs`, message });
  }
  for (const key of ["width", "height"] as const) {
    if (media[key] !== undefined && probe[key] !== undefined && media[key] !== probe[key]) errors.push({ path: `${path}.${key}`, message: `${key} ${media[key]} differs from the file's ${probe[key]}` });
  }
  if (media.kind !== probe.kind && !(media.kind === "video" && probe.kind === "audio")) warnings.push({ path: `${path}.kind`, message: `kind "${media.kind}" differs from the file's "${probe.kind}"` });
  if (media.hasAudio !== probe.hasAudio && media.kind === "video") warnings.push({ path: `${path}.hasAudio`, message: `hasAudio ${media.hasAudio} differs from the file's ${probe.hasAudio}` });
  if (media.fps && probe.fps && Math.abs(media.fps.num / media.fps.den - probe.fps.num / probe.fps.den) > 0.01) {
    warnings.push({ path: `${path}.fps`, message: `fps ${media.fps.num}/${media.fps.den} differs from the file's ${probe.fps.num}/${probe.fps.den}` });
  }
}

async function mediaFileIssues(dir: string, project: Project, errors: StrictIssue[], warnings: StrictIssue[]): Promise<void> {
  for (const [id, media] of Object.entries(project.media)) {
    if ("relPath" in media.file) {
      if (!fileExists(join(dir, media.file.relPath))) errors.push({ path: `media.${id}.file.relPath`, message: `file "${media.file.relPath}" does not exist in the project folder` });
      else {
        const facts = await readFacts(dir, media.file.relPath);
        if (facts) headerIssues(id, media, facts, project, errors, warnings);
      }
    } else {
      warnings.push({ path: `media.${id}.file`, message: "a linked file (handleKey) cannot be checked from a folder" });
    }
    if (media.proxy && !fileExists(join(dir, media.proxy.relPath))) warnings.push({ path: `media.${id}.proxy.relPath`, message: `proxy "${media.proxy.relPath}" does not exist (the app makes it again)` });
  }
}

function fontIssues(dir: string, errors: StrictIssue[]): void {
  const manifest = join(dir, FONTS_MANIFEST);
  if (!fileExists(manifest)) return;
  const read = readJson(manifest);
  if ("error" in read) return void errors.push({ path: FONTS_MANIFEST, message: `is not valid JSON (${read.error})` });
  const schemaIssues = strictIssues("FontManifest", read.value, FONTS_MANIFEST);
  errors.push(...schemaIssues);
  if (schemaIssues.length > 0) return;
  const faces = (read.value as { faces: { file: string }[] }).faces;
  faces.forEach((face, index) => {
    const path = `${FONTS_MANIFEST}.faces.${index}.file`;
    if (face.file.includes("/") || face.file.includes("\\") || face.file.startsWith(".")) return void errors.push({ path, message: `"${face.file}" must be a file name inside fonts/` });
    const file = join(dir, "fonts", face.file);
    if (!fileExists(file)) return void errors.push({ path, message: `font file "fonts/${face.file}" does not exist` });
    if (fontFormat(new Uint8Array(readFileSync(file).subarray(0, 16))) === null) errors.push({ path, message: `"fonts/${face.file}" is not a font file (TrueType, OpenType, WOFF or WOFF2)` });
  });
}

/** The strict check of a project folder: `project.json`, its media files and its fonts. */
export async function validateProjectFolder(dirPath: string): Promise<FolderReport> {
  const dir = resolve(normalizeCliPath(dirPath));
  const report: FolderReport = { ok: false, schemaVersion: null, errors: [], warnings: [], standIns: {} };
  const file = join(dir, PROJECT_FILE);
  if (!fileExists(file)) {
    report.errors.push({ path: PROJECT_FILE, message: `not found in ${dir}` });
    return report;
  }
  const read = readJson(file);
  if ("error" in read) {
    report.errors.push({ path: PROJECT_FILE, message: `is not valid JSON (${read.error})` });
    return report;
  }
  const result = validateStrict(read.value);
  report.schemaVersion = result.schemaVersion;
  report.errors.push(...result.errors);
  report.warnings.push(...result.warnings);
  if (result.project) {
    report.standIns = standInsOf(result.project);
    await mediaFileIssues(dir, result.project, report.errors, report.warnings);
  }
  fontIssues(dir, report.errors);
  report.ok = report.errors.length === 0;
  return report;
}

export interface InfoReport {
  name: string;
  generator: { name: string; version?: string; source?: string; url?: string } | null;
  schemaVersion: number;
  size: { width: number; height: number };
  fps: number;
  durationFrames: number;
  duration: string;
  tracks: { id: string; kind: string; name: string; clips: number }[];
  clipsByKind: Record<string, number>;
  standIns: Record<string, number>;
  mediaCount: number;
  missingMedia: string[];
  /** Each media record with the facts its file's header gives (Batch 55). */
  media: { id: string; name: string; kind: string; durationUs: number; width?: number; height?: number; fps?: number; hasAudio: boolean; codec?: string; audioCodec?: string; size?: number; header: "ok" | "unreadable" | "missing" | "linked"; headerError?: string }[];
}

/** What a project folder holds. Throws an Error naming the problem when `project.json` cannot be read. */
export async function projectInfo(dirPath: string): Promise<InfoReport> {
  const dir = resolve(normalizeCliPath(dirPath));
  const file = join(dir, PROJECT_FILE);
  if (!fileExists(file)) throw new Error(`${PROJECT_FILE} not found in ${dir}`);
  const read = readJson(file);
  if ("error" in read) throw new Error(`${PROJECT_FILE} is not valid JSON (${read.error})`);
  const result = validateStrict(read.value);
  const project = result.project;
  if (!project) throw new Error(`${PROJECT_FILE} does not pass the field table (run validate): ${result.errors[0]?.path} ${result.errors[0]?.message}`);
  const clips = Object.values(project.clips);
  const clipsByKind: Record<string, number> = {};
  for (const clip of clips) clipsByKind[clip.kind] = (clipsByKind[clip.kind] ?? 0) + 1;
  const durationFrames = clips.reduce((end, clip) => Math.max(end, clip.start + clip.duration), 0);
  const fps = project.settings.fps.num / project.settings.fps.den;
  const media: InfoReport["media"] = [];
  for (const [id, item] of Object.entries(project.media)) {
    const facts = "relPath" in item.file ? await readFacts(dir, item.file.relPath) : undefined;
    const probe = facts?.probe;
    media.push({
      id,
      name: item.name,
      kind: item.kind,
      durationUs: probe?.durationUs ?? item.durationUs,
      ...((probe?.width ?? item.width) !== undefined && { width: (probe?.width ?? item.width) as number }),
      ...((probe?.height ?? item.height) !== undefined && { height: (probe?.height ?? item.height) as number }),
      ...(((probe?.fps ?? item.fps) !== undefined) && { fps: Math.round(((probe?.fps ?? item.fps) as { num: number; den: number }).num / ((probe?.fps ?? item.fps) as { num: number; den: number }).den * 1000) / 1000 }),
      hasAudio: probe?.hasAudio ?? item.hasAudio,
      ...((probe?.codec ?? item.codec) !== undefined && { codec: (probe?.codec ?? item.codec) as string }),
      ...((probe?.audioCodec ?? item.audioCodec) !== undefined && { audioCodec: (probe?.audioCodec ?? item.audioCodec) as string }),
      ...(facts?.size !== undefined && { size: facts.size }),
      header: !("relPath" in item.file) ? "linked" : !facts ? "missing" : facts.probe ? "ok" : "unreadable",
      ...(facts?.error && { headerError: facts.error }),
    });
  }
  return {
    name: project.name,
    generator: project.meta.generator ?? null,
    schemaVersion: project.schemaVersion,
    size: { width: project.settings.width, height: project.settings.height },
    fps,
    durationFrames,
    duration: formatTimecode(durationFrames, project.settings.fps),
    tracks: project.tracks.map((track) => ({ id: track.id, kind: track.kind, name: track.name, clips: track.clipIds.length })),
    clipsByKind,
    standIns: standInsOf(project),
    mediaCount: Object.keys(project.media).length,
    missingMedia: Object.entries(project.media)
      .filter(([, media]) => "relPath" in media.file && !fileExists(join(dir, media.file.relPath)))
      .map(([id]) => id),
    media,
  };
}

export interface NormalizeReport {
  /** The completed project (schema current, every required field present). */
  project: JsonObject;
  /** The strict check of that result: its errors and warnings. */
  errors: StrictIssue[];
  warnings: StrictIssue[];
  /** What it could not do (an unreadable header) and the fonts it recorded. */
  notes: NormalizeNote[];
  fonts: FontPlan;
  written: boolean;
}

export interface NormalizeOptions {
  write: boolean;
  /** `public/fonts/library/` of the editor: where the fonts of texts and captions are copied from. */
  libraryDir: string;
  appVersion: string;
  now?: string;
}

/**
 * The sparse project of `dirPath` completed (spec §21.4): media headers read, defaults filled, library fonts
 * recorded in `fonts/fonts.json` with their files, then checked strictly. With `write` and no error, writes
 * `project.json` and the fonts into the folder; the folder is left alone when anything is invalid.
 */
export async function normalizeProjectFolder(dirPath: string, options: NormalizeOptions): Promise<NormalizeReport> {
  const dir = resolve(normalizeCliPath(dirPath));
  const file = join(dir, PROJECT_FILE);
  if (!fileExists(file)) throw new Error(`${PROJECT_FILE} not found in ${dir}`);
  const read = readJson(file);
  if ("error" in read) throw new Error(`${PROJECT_FILE} is not valid JSON (${read.error})`);
  const raw = read.value as { media?: Record<string, { file?: { relPath?: unknown } }> };
  const facts: Record<string, MediaFacts> = {};
  for (const [id, item] of Object.entries(raw && typeof raw === "object" && raw.media && typeof raw.media === "object" ? raw.media : {})) {
    const relPath = item?.file?.relPath;
    const found = typeof relPath === "string" ? await readFacts(dir, relPath) : undefined;
    if (found) facts[id] = found;
  }
  const result = normalizeProject(read.value, { now: options.now ?? new Date().toISOString(), appVersion: options.appVersion, folderName: basename(dir), facts });
  const strict = validateStrict(result.project);
  const errors = [...strict.errors];
  const warnings = [...strict.warnings];
  if (strict.project) await mediaFileIssues(dir, strict.project, errors, warnings);
  const manifest = join(dir, FONTS_MANIFEST);
  const fontsDir = join(dir, "fonts");
  const taken = new Set(existsSync(fontsDir) ? readdirSync(fontsDir) : []);
  const plan = strict.project ? planFonts(strict.project, existingFaces(manifest), taken, readCatalog(options.libraryDir)) : { faces: [], copies: [], missing: [] };
  const notes = [...result.notes, ...plan.missing.map((family) => ({ path: "fonts", message: `the font "${family}" is not in the library: its file cannot be copied (the app falls back to the UI font, or an installed font by name)` }))];
  let written = false;
  if (options.write && errors.length === 0) {
    writeFileSync(file, `${JSON.stringify(result.project, null, 2)}
`, "utf8");
    writeFonts(dir, options.libraryDir, plan);
    written = true;
  }
  return { project: result.project, errors, warnings, notes, fonts: plan, written };
}
