// project.json: serialization, schema migrations and validation on load.
import { SCHEMA_VERSION, type JsonObject, type Project } from "../core/document/types.js";
import { validateProject } from "../core/document/validate.js";
import { errorMessage } from "./errorMessage.js";

export class ProjectFileError extends Error {
  readonly issues: readonly string[];

  constructor(message: string, issues: readonly string[] = []) {
    super(issues.length > 0 ? `${message}:\n${issues.map((issue) => `  - ${issue}`).join("\n")}` : message);
    this.name = "ProjectFileError";
    this.issues = issues;
  }
}

/** Upgrades the raw JSON of one schema version to the next. Gets a private copy it may mutate. */
export type Migration = (raw: JsonObject) => JsonObject;

/**
 * `MIGRATIONS[n]` turns a version-n file into version n+1. Empty while the schema is at version 1;
 * a schema change bumps SCHEMA_VERSION and adds its step here.
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Brings raw project JSON to `target` by running the migration steps in order. */
export function migrateProject(raw: unknown, migrations: Readonly<Record<number, Migration>> = MIGRATIONS, target = SCHEMA_VERSION): JsonObject {
  if (!isObject(raw)) throw new ProjectFileError("project.json does not hold a project object");
  let version = raw.schemaVersion;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 0) {
    throw new ProjectFileError("project.json has no valid schemaVersion");
  }
  if (version > target) {
    throw new ProjectFileError(`project.json was saved by a newer version of the app (schema ${version}; this version reads up to ${target})`);
  }
  let data = raw;
  while (version < target) {
    const step = migrations[version];
    if (!step) throw new ProjectFileError(`No migration from schema version ${version}`);
    data = { ...step(structuredClone(data)), schemaVersion: version + 1 };
    version += 1;
  }
  return data;
}

// Enough structure for validateProject to run; everything deeper is its job.
function shapeIssues(raw: JsonObject): string[] {
  const issues: string[] = [];
  const expect = (key: string, ok: (value: unknown) => boolean, what: string) => {
    if (!ok(raw[key])) issues.push(`${key} must be ${what}`);
  };
  const string = (v: unknown) => typeof v === "string";
  expect("id", string, "a string");
  expect("name", string, "a string");
  expect("settings", isObject, "an object");
  expect("media", isObject, "an object");
  expect("tracks", Array.isArray, "an array");
  expect("clips", isObject, "an object");
  expect("markers", Array.isArray, "an array");
  expect("captionTracks", isObject, "an object");
  expect("textPresetsLocal", Array.isArray, "an array");
  expect("meta", isObject, "an object");
  const settings = raw.settings;
  if (isObject(settings)) {
    const fps = settings.fps;
    if (!Number.isInteger(settings.width) || !Number.isInteger(settings.height)) issues.push("settings.width/height must be integers");
    if (!isObject(fps) || !Number.isInteger(fps.num) || !Number.isInteger(fps.den) || !((fps.num as number) > 0 && (fps.den as number) > 0)) {
      issues.push("settings.fps must be a positive integer fraction");
    }
    if (!isObject(settings.background)) issues.push("settings.background must be an object");
  }
  for (const [index, track] of (Array.isArray(raw.tracks) ? raw.tracks : []).entries()) {
    if (!isObject(track) || typeof track.id !== "string" || !Array.isArray(track.clipIds)) issues.push(`tracks[${index}] is not a track`);
  }
  for (const [key, clip] of Object.entries(isObject(raw.clips) ? raw.clips : {})) {
    if (!isObject(clip)) issues.push(`clips.${key} is not a clip`);
  }
  return issues;
}

/** Parses, migrates and validates project.json. Throws ProjectFileError naming what is wrong. */
export function parseProjectFile(text: string, migrations?: Readonly<Record<number, Migration>>, target?: number): Project {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new ProjectFileError(`project.json is not valid JSON (${errorMessage(error)})`);
  }
  const data = migrateProject(raw, migrations, target);
  const shape = shapeIssues(data);
  if (shape.length > 0) throw new ProjectFileError("project.json is not a valid project", shape);
  const project = data as unknown as Project;
  let issues: string[];
  try {
    issues = validateProject(project);
  } catch (error) {
    // Malformed nested data (e.g. an unknown track kind) can trip the validator itself.
    issues = [`validation failed: ${errorMessage(error)}`];
  }
  if (issues.length > 0) throw new ProjectFileError("project.json breaks document invariants", issues);
  return project;
}

/** project.json text. `meta.modifiedAt` and `meta.appVersion` are stamped here, not by a command. */
export function serializeProject(project: Project, stamp: { now: string; appVersion: string }): string {
  const stamped: Project = { ...project, meta: { ...project.meta, modifiedAt: stamp.now, appVersion: stamp.appVersion } };
  return `${JSON.stringify(stamped, null, 2)}\n`;
}
