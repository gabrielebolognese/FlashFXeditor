// project.json: serialization, schema migrations and validation on load.
import { SCHEMA_VERSION, type JsonObject, type Project } from "../core/document/types.js";
import { validateProject } from "../core/document/validate.js";
import { upgradeCaptionStyle } from "../text/captions.js";
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
 * `MIGRATIONS[n]` turns a version-n file into version n+1; a schema change bumps SCHEMA_VERSION and
 * adds its step here.
 * - 1 -> 2 (Batch 41): media bins (`bins`, empty). `MediaItem.size` is optional: older items have none.
 * - 2 -> 3 (Batch 53): caption styles get a custom `x` (0: centered, as before). Cues may carry a
 *   `styleOverride` and a `presetId`; older cues have none, so they look as they did.
 * - 3 -> 4 (Batch 54): `meta.generator` and `ClipBase.fallbackOf` (both optional).
 * - 4 -> 5 (Batch 58): solid `cornerRadii`, `stroke`, `shadow`; picture `cornerRadius`, `stroke`, `shadow`; `TextBackground.stroke`
 *   and `.shadow`; gradient fills with stops (all optional or a new `Fill` shape): older projects open unchanged.
 * - 5 -> 6 (Batch 59): caption highlight modes `progressive` and `reveal`, `emphasisColor`, `CaptionWord.emphasis` and `.color`,
 *   `CaptionStyle.anim` (and in overrides), background mode `word` (all optional or new values): older projects open unchanged.
 * - 8 -> 9 (Batch 64): `MediaItem.alpha` and `MediaItem.sequence` (both optional): older projects open unchanged.
 * - 9 -> 10 (Batch 65): the `shape` clip kind (vector paths) and its `paths.<id>.*` keyframe properties: older projects open unchanged.
 * - 10 -> 11 (Batch 67): `TextClip.spans` (optional): older projects open unchanged.
 * - 11 -> 12 (Batch 68): `TextClip.counter` and `TextClip.animators` (optional), the kinetic In and Out animation ids and the
 *   `text.counter.value` and `animators.<id>.*` keyframe properties: older projects open unchanged.
 * - 12 -> 13 (Batch 69): `ClipBase.parentId` and `.autoOrient` (optional), the `null` clip kind, the `transform.position` keyframe
 *   property and `spatialIn` / `spatialOut` on its keys: older projects open unchanged.
 * - 13 -> 14 (Batch 70): `Transform.rotationX`, `.rotationY`, `.z`, `settings.perspective`, `Sequence.perspective` and `.depthSort`,
 *   `ClipBase.backfaceHidden` (all optional) and their keyframe properties: older projects open unchanged.
 * - 14 -> 15 (Batch 71): the transition kinds slide, push, wipe, iris, zoomIn, zoomOut, whip, blurDissolve, glitch and flash and
 *   `Transition.direction`, `.angle`, `.softness`, `.center`, `.ease` (all optional; an absent `ease` is the v1 linear mix):
 *   older projects open unchanged.
 * - 15 -> 16 (Batch 72): `ClipBase.blend`, `.matte` and `.matteOnly` (all optional; absent = normal, no matte, drawn):
 *   older projects open unchanged.
 * - 16 -> 17 (Batch 73): `ClipBase.masks` (optional; absent = the whole clip shows): older projects open unchanged.
 * - 7 -> 8 (Batch 62): `sequences` (empty) and the `compound` clip kind: older projects open unchanged.
 * - 6 -> 7 (Batch 60): the 30 Penner eases, `bezier` and `spring` on keys, vector (color) key values and the keyframe
 *   properties of spec §21.9 (all new values of existing fields): older projects open unchanged.
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  1: (raw) => ({ ...raw, bins: Array.isArray(raw.bins) ? raw.bins : [] }),
  2: (raw) => {
    const tracks = isObject(raw.captionTracks) ? raw.captionTracks : null;
    if (!tracks) return raw;
    const captionTracks: JsonObject = {};
    for (const [id, data] of Object.entries(tracks)) {
      captionTracks[id] = isObject(data) && isObject(data.style) ? { ...data, style: upgradeCaptionStyle(data.style) } : data;
    }
    return { ...raw, captionTracks };
  },
  // 3 -> 4 (Batch 54): `meta.generator` and `ClipBase.fallbackOf` are optional: nothing to change.
  3: (raw) => raw,
  // 4 -> 5 (Batch 58): every new field is optional and absent means none: nothing to change.
  4: (raw) => raw,
  // 5 -> 6 (Batch 59): every new field is optional and absent means none: nothing to change.
  5: (raw) => raw,
  // 6 -> 7 (Batch 60): new ease ids, key fields and keyframe properties only: nothing to change.
  6: (raw) => raw,
  // 7 -> 8 (Batch 62): nested sequences: none in an older project.
  7: (raw) => ({ ...raw, sequences: isObject(raw.sequences) ? raw.sequences : {} }),
  // 8 -> 9 (Batch 64): alpha video and image sequences: none in an older project.
  8: (raw) => raw,
  // 9 -> 10 (Batch 65): vector shape clips: none in an older project.
  9: (raw) => raw,
  // 10 -> 11 (Batch 67): styled text spans: none in an older project.
  10: (raw) => raw,
  // 11 -> 12 (Batch 68): counters and animators: none in an older project.
  11: (raw) => raw,
  // 12 -> 13 (Batch 69): parenting, null clips and motion paths: none in an older project.
  12: (raw) => raw,
  // 13 -> 14 (Batch 70): 2.5D fields (3D rotation, depth, perspective, depth sort, backface): all optional, none in an older project.
  13: (raw) => raw,
  // 14 -> 15 (Batch 71): new transition kinds and optional transition fields: none in an older project, no `ease` = the v1 linear mix.
  14: (raw) => raw,
  // 15 -> 16 (Batch 72): blend modes and track mattes: all optional, none in an older project.
  15: (raw) => raw,
  // 16 -> 17 (Batch 73): masks: optional, none in an older project.
  16: (raw) => raw,
};

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
  expect("bins", Array.isArray, "an array");
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
    // A UTF-8 byte order mark (an editor may add one) is not JSON.
    raw = JSON.parse(text.startsWith("\uFEFF") ? text.slice(1) : text);
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
