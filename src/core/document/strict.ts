// The strict validator (spec §21.3, Batch 54): a project's JSON against the field table (types, ranges,
// required fields; unknown fields are refused everywhere except inside `fallbackOf.data`), then the
// document invariants of `validate.ts`. The app itself loads leniently; only the CLI uses this. Pure.
import { MIGRATIONS, migrateProject, ProjectFileError } from "../../project/projectFile.js";
import { schemaOf, type FieldType } from "./schema.js";
import { validateProject } from "./validate.js";
import type { JsonObject, Project } from "./types.js";

export interface StrictIssue {
  /** Where, as a dotted JSON path (`clips.c1.transform.anchor`; `$` is the document itself). */
  path: string;
  message: string;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

const describe = (value: unknown): string => {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  if (typeof value === "string") return `the string ${JSON.stringify(value.length > 40 ? `${value.slice(0, 40)}...` : value)}`;
  if (typeof value === "object") return "an object";
  return `${typeof value} ${String(value)}`;
};

const join = (path: string, key: string | number): string => (path === "$" ? String(key) : `${path}.${key}`);

/** The problems of `value` against the schema `name` (empty when valid). */
export function strictIssues(name: string, value: unknown, path = "$"): StrictIssue[] {
  const issues: StrictIssue[] = [];
  checkSchema(name, value, path, issues);
  return issues;
}

function checkSchema(name: string, value: unknown, path: string, issues: StrictIssue[]): void {
  const schema = schemaOf(name);
  if (schema.value) return checkType(schema.value, value, path, issues);
  if (!isObject(value)) return void issues.push({ path, message: `must be an object (${name}), found ${describe(value)}` });
  if (schema.variants) {
    const kind = value.kind;
    const variant = typeof kind === "string" && Object.hasOwn(schema.variants, kind) ? schema.variants[kind] : undefined;
    if (variant === undefined) return void issues.push({ path: join(path, "kind"), message: `must be one of ${Object.keys(schema.variants).join(", ")}, found ${describe(kind)}` });
    return checkSchema(variant, value, path, issues);
  }
  for (const [key, field] of Object.entries(schema.fields)) {
    if (value[key] === undefined) {
      if (field.required) issues.push({ path: join(path, key), message: `is required (${name}.${key})` });
      continue;
    }
    checkType(field.type, value[key], join(path, key), issues);
  }
  for (const key of Object.keys(value)) if (!Object.hasOwn(schema.fields, key)) issues.push({ path: join(path, key), message: `is not a field of ${name}` });
  if (name === "FileRef") fileRefIssues(value, path, issues);
}

/** A media file is a `relPath`, or a linked file's `handleKey` with its `pathHint`. */
function fileRefIssues(value: Record<string, unknown>, path: string, issues: StrictIssue[]): void {
  const hasPath = value.relPath !== undefined;
  const hasHandle = value.handleKey !== undefined;
  if (hasPath === hasHandle) issues.push({ path, message: "must have either relPath or handleKey (with pathHint)" });
  else if (hasHandle && value.pathHint === undefined) issues.push({ path: join(path, "pathHint"), message: "is required with handleKey" });
  if (typeof value.relPath === "string") {
    const parts = value.relPath.split("/");
    if (value.relPath.startsWith("/") || /^[A-Za-z]:/.test(value.relPath) || value.relPath.includes("\\") || parts.some((part) => part === "" || part === "." || part === "..")) {
      issues.push({ path: join(path, "relPath"), message: `"${value.relPath}" must be a relative path inside the project folder, with / separators` });
    }
  }
}

function checkType(type: FieldType, value: unknown, path: string, issues: StrictIssue[]): void {
  switch (type.t) {
    case "string":
      if (typeof value !== "string") issues.push({ path, message: `must be a string, found ${describe(value)}` });
      else if (type.nonEmpty && value === "") issues.push({ path, message: "must not be empty" });
      return;
    case "boolean":
      if (typeof value !== "boolean") issues.push({ path, message: `must be true or false, found ${describe(value)}` });
      return;
    case "number": {
      if (value === null && type.nullable) return;
      if (typeof value !== "number" || !Number.isFinite(value)) return void issues.push({ path, message: `must be a number, found ${describe(value)}` });
      if (type.integer && !Number.isInteger(value)) return void issues.push({ path, message: `must be an integer, found ${value}` });
      if (type.min !== undefined && (type.exclusiveMin ? value <= type.min : value < type.min)) issues.push({ path, message: `must be ${type.exclusiveMin ? ">" : ">="} ${type.min}, found ${value}` });
      if (type.max !== undefined && value > type.max) issues.push({ path, message: `must be <= ${type.max}, found ${value}` });
      return;
    }
    case "enum":
      if (!type.values.includes(value as string | number)) issues.push({ path, message: `must be one of ${type.values.map((v) => JSON.stringify(v)).join(", ")}, found ${describe(value)}` });
      return;
    case "object":
      if (value === null && type.nullable) return;
      return checkSchema(type.schema, value, path, issues);
    case "array":
      if (!Array.isArray(value)) return void issues.push({ path, message: `must be an array, found ${describe(value)}` });
      if (type.length !== undefined && value.length !== type.length) issues.push({ path, message: `must have ${type.length} items, found ${value.length}` });
      value.forEach((item, index) => checkType(type.item, item, join(path, index), issues));
      return;
    case "record":
      if (!isObject(value)) return void issues.push({ path, message: `must be an object, found ${describe(value)}` });
      for (const [key, item] of Object.entries(value)) {
        if (type.keys && !type.keys.includes(key) && !(type.keyPatterns ?? []).some((pattern) => new RegExp(pattern).test(key))) issues.push({ path: join(path, key), message: `is not one of ${type.keys.join(", ")}` });
        else checkType(type.item, item, join(path, key), issues);
      }
      return;
    case "union": {
      if (value === null && type.nullable) return;
      const option = isObject(value) ? type.options.find((candidate) => candidate.when in value) : undefined;
      if (!option) return void issues.push({ path, message: `must be ${type.options.map((candidate) => candidate.label).join(" or ")}, found ${describe(value)}` });
      return checkType(option.type, value, path, issues);
    }
    case "json":
      if (!isObject(value)) issues.push({ path, message: `must be an object, found ${describe(value)}` });
      return;
    case "numberOrVector":
      if (typeof value === "number") {
        if (!Number.isFinite(value)) issues.push({ path, message: `must be a finite number, found ${describe(value)}` });
      } else if (!Array.isArray(value) || value.length < 1 || value.length > type.max || !value.every((item) => typeof item === "number" && Number.isFinite(item))) {
        issues.push({ path, message: `must be a number or an array of 1 to ${type.max} numbers, found ${describe(value)}` });
      }
  }
}

// --- Whole projects -----------------------------------------------------------------------------------

export interface StrictResult {
  ok: boolean;
  schemaVersion: number | null;
  errors: StrictIssue[];
  warnings: StrictIssue[];
  /** The migrated project when it passed the field table (else null). */
  project: Project | null;
}

/**
 * The path an invariant message of `validate.ts` is about: its clip, track, media or marker, found from
 * the label it starts with (`clip "name" (id): ...`).
 */
export function invariantPath(message: string, project: Project): string {
  const label = /^(clip|track|media|marker|bin) (?:"[^"]*" )?\(?([^\s):]+)\)?/.exec(message);
  if (!label) return "$";
  const [, what, id] = label as unknown as [string, string, string];
  if (what === "clip") return `clips.${id}`;
  if (what === "media") return `media.${id}`;
  if (what === "track") return `tracks.${project.tracks.findIndex((track) => track.id === id)}`;
  if (what === "marker") return `markers.${project.markers.findIndex((marker) => marker.id === id)}`;
  return `bins.${project.bins.findIndex((bin) => bin.id === id)}`;
}

/**
 * Migrates `raw` (an older schema version opens as the app opens it), checks every field against the
 * field table and, when that passes, the document invariants. File checks are the CLI's.
 */
export function validateStrict(raw: unknown): StrictResult {
  const result: StrictResult = { ok: false, schemaVersion: null, errors: [], warnings: [], project: null };
  if (isObject(raw) && typeof raw.schemaVersion === "number") result.schemaVersion = raw.schemaVersion;
  let data: JsonObject;
  try {
    data = migrateProject(raw, MIGRATIONS);
  } catch (error) {
    const message = error instanceof ProjectFileError ? error.message : String(error);
    result.errors.push({ path: "schemaVersion", message });
    return result;
  }
  result.errors.push(...strictIssues("Project", data));
  if (result.errors.length === 0) {
    const project = data as unknown as Project;
    result.project = project;
    try {
      for (const message of validateProject(project)) result.errors.push({ path: invariantPath(message, project), message });
    } catch (error) {
      result.errors.push({ path: "$", message: `validation failed: ${error instanceof Error ? error.message : String(error)}` });
    }
  }
  result.ok = result.errors.length === 0;
  return result;
}
