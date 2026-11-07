// Project folders on disk for the CLI (spec §21.3, Batch 54): `validateProjectFolder` and `projectInfo`.
// Node only; the document model, the field table and the validator are the app's own modules.
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { formatTimecode } from "../../src/core/document/time.js";
import { strictIssues, validateStrict, type StrictIssue } from "../../src/core/document/strict.js";
import type { Project } from "../../src/core/document/types.js";
import { fontFormat } from "../../src/text/fonts/sfnt.js";

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

function mediaFileIssues(dir: string, project: Project, errors: StrictIssue[], warnings: StrictIssue[]): void {
  for (const [id, media] of Object.entries(project.media)) {
    if ("relPath" in media.file) {
      if (!fileExists(join(dir, media.file.relPath))) errors.push({ path: `media.${id}.file.relPath`, message: `file "${media.file.relPath}" does not exist in the project folder` });
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
export function validateProjectFolder(dirPath: string): FolderReport {
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
    mediaFileIssues(dir, result.project, report.errors, report.warnings);
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
}

/** What a project folder holds. Throws an Error naming the problem when `project.json` cannot be read. */
export function projectInfo(dirPath: string): InfoReport {
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
  };
}
