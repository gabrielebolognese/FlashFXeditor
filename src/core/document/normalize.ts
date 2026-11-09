// `normalize` (spec §21.3, §21.4, Batch 55): a sparse project (ids, kinds, timing and content) completed with
// exactly what the app would have created. An older schema is migrated first; every omitted required field
// then comes from the field table's defaults (the table is checked against the app's constants by tests),
// nested styles merge with them field by field, track clip lists are rebuilt sorted, and what the table
// cannot hold (a clip's name, a media clip's `out`, Fit placement, a caption track's style, a media record's
// probed facts) is computed from the app's own factories. Pure: no DOM, no files; the CLI reads the media
// headers and passes them in `facts`.
import { MIGRATIONS, migrateProject, ProjectFileError } from "../../project/projectFile.js";
import { mediaItemFrom } from "../../media/mediaItem.js";
import type { ProbeResult } from "../../media/probe/types.js";
import { CUE_NAME, defaultCaptionStyle } from "../../text/captions.js";
import { textClipName } from "../../text/style.js";
import { newCaptionTrack } from "../../timeline/edit/captions.js";
import { defaultSolid } from "../../timeline/edit/solid.js";
import { defaultTransform, IDENTITY_TRANSFORM } from "./placement.js";
import { createProject, nextTrackName } from "./project.js";
import { schemaOf, type FieldType } from "./schema.js";
import { framesToSourceUs, frameToUs } from "./time.js";
import { SCHEMA_VERSION, type JsonObject, type JsonValue, type Project, type TextContent, type TextStyle, type TrackKind } from "./types.js";

type Obj = Record<string, unknown>;

const isObject = (value: unknown): value is Obj => typeof value === "object" && value !== null && !Array.isArray(value);
const clone = <T>(value: T): T => structuredClone(value);

/** What the CLI learned from a media file: its header, or why it could not be read, and its size in bytes. */
export interface MediaFacts {
  probe?: ProbeResult;
  error?: string;
  size?: number;
}

export interface NormalizeOptions {
  /** The time stamped on what the input does not date (ISO). */
  now: string;
  appVersion: string;
  /** The name of a project that has none (the folder's). */
  folderName?: string;
  /** Header facts by media id. */
  facts?: Readonly<Record<string, MediaFacts>>;
}

export interface NormalizeNote {
  path: string;
  message: string;
}

export interface NormalizeResult {
  project: JsonObject;
  /** What `normalize` could not do (a header it could not read); `validate` reports the rest. */
  notes: NormalizeNote[];
}

/** `defaults` with `value` on top, objects merged field by field (arrays and scalars of `value` replace). */
function merge(defaults: unknown, value: unknown): unknown {
  if (!isObject(defaults) || !isObject(value)) return value === undefined ? clone(defaults) : value;
  const out: Obj = clone(defaults);
  for (const [key, entry] of Object.entries(value)) out[key] = key in out ? merge(out[key], entry) : entry;
  return out;
}

/** An object with its keys in the field table's order, unknown keys after them (so output reads like the app's files). */
function ordered(fields: readonly string[], value: Obj): Obj {
  const out: Obj = {};
  for (const key of fields) if (key in value) out[key] = value[key];
  for (const key of Object.keys(value)) if (!(key in out)) out[key] = value[key];
  return out;
}

function fillType(type: FieldType, value: unknown): unknown {
  switch (type.t) {
    case "object":
      return isObject(value) ? fillObject(type.schema, value) : value;
    case "array":
      return Array.isArray(value) ? value.map((item) => fillType(type.item, item)) : value;
    case "record":
      return isObject(value) ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, fillType(type.item, item)])) : value;
    case "union": {
      const option = isObject(value) ? type.options.find((candidate) => candidate.when in value) : undefined;
      return option ? fillType(option.type, value) : value;
    }
    default:
      return value;
  }
}

/** The value of a required field the input omits: its default, completed; an empty list or record; or nothing. */
function missing(type: FieldType, def: JsonValue | undefined): unknown {
  if (def !== undefined) return fillType(type, clone(def));
  if (type.t === "array") return [];
  if (type.t === "record") return {};
  if (type.t === "object") {
    const built = fillObject(type.schema, {});
    return Object.keys(built).length > 0 ? built : undefined;
  }
  return undefined;
}

/** `value` (an object of the schema `name`) with every omitted required field filled from the field table. */
export function fillObject(name: string, value: Obj): Obj {
  let schema = schemaOf(name);
  if (schema.variants) {
    const variant = typeof value.kind === "string" ? schema.variants[value.kind] : undefined;
    if (!variant) return value;
    schema = schemaOf(variant);
  }
  if (schema.value) return fillType(schema.value, value) as Obj;
  const out: Obj = {};
  for (const [key, field] of Object.entries(schema.fields)) {
    if (value[key] !== undefined) out[key] = fillType(field.type, value[key]);
    else if (field.required) {
      const filled = missing(field.type, field.default);
      if (filled !== undefined) out[key] = filled;
    }
  }
  return ordered(Object.keys(schema.fields), { ...value, ...out });
}

/** A deterministic id for a project that has none. */
function projectId(name: string): string {
  let hash = 2166136261;
  for (const char of name) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return `project-${hash.toString(16).padStart(8, "0")}`;
}

const baseName = (path: string): string => path.slice(path.lastIndexOf("/") + 1);

function normalizeMedia(id: string, raw: Obj, project: Obj, options: NormalizeOptions, notes: NormalizeNote[]): Obj {
  const file = isObject(raw.file) ? raw.file : {};
  const relPath = typeof file.relPath === "string" ? file.relPath : undefined;
  const facts = options.facts?.[id];
  const name = typeof raw.name === "string" ? raw.name : baseName(relPath ?? (typeof file.pathHint === "string" ? file.pathHint : id));
  const meta = project.meta as Obj;
  const fields = { id, name, file: clone(file) as { relPath: string }, addedAt: typeof raw.addedAt === "string" ? raw.addedAt : (meta.createdAt as string), ...(facts?.size !== undefined && { size: facts.size }) };
  let base: Obj;
  if (facts?.probe) base = { ...mediaItemFrom(facts.probe, fields) };
  else {
    if (facts?.error) notes.push({ path: `media.${id}.file`, message: `its header cannot be read (${facts.error}); left for the app's repair on open` });
    base = { ...fields, durationUs: 0, hasAudio: false, analysis: { thumbs: "none", peaks: "none" } };
  }
  // What the input wrote wins over what the file says (`validate` compares the two).
  const merged = merge(base, raw) as Obj;
  if (typeof raw.kind !== "string" && typeof merged.kind !== "string") merged.kind = "video";
  return fillObject("MediaItem", merged);
}

function clipName(clip: Obj, media: Obj | undefined): string | undefined {
  switch (clip.kind) {
    case "video":
    case "audio":
    case "image":
      return typeof media?.name === "string" ? media.name : undefined;
    case "text": {
      const text = merge({ value: "", box: { mode: "auto", width: 900 } }, clip.text) as unknown as TextContent;
      const style = merge({ textCase: "none" }, isObject(clip.style) ? clip.style : {}) as unknown as Pick<TextStyle, "textCase">;
      return textClipName(text, style);
    }
    case "caption":
      return CUE_NAME;
    case "solid":
      return "Solid";
    case "null":
      return "Null";
    case "adjustment":
      return "Adjustment";
    default:
      return undefined;
  }
}

function normalizeClip(id: string, raw: Obj, project: Project): Obj {
  const { fps } = project.settings;
  const media = typeof raw.mediaId === "string" ? (project.media[raw.mediaId] as unknown as Obj | undefined) : undefined;
  const clip: Obj = { id, ...raw };
  const defaults: Obj = {};
  const name = clipName(clip, media);
  if (name !== undefined) defaults.name = name;
  if (clip.kind === "video" || clip.kind === "audio" || clip.kind === "image") {
    const speed = typeof clip.speed === "number" ? clip.speed : 1;
    const start = typeof clip.in === "number" ? clip.in : 0;
    defaults.in = 0;
    if (typeof clip.duration === "number") {
      const played = clip.kind === "image" ? frameToUs(clip.duration, fps) : framesToSourceUs(clip.duration, speed, fps);
      const length = typeof media?.durationUs === "number" && media.durationUs > 0 && clip.kind !== "image" ? media.durationUs : Infinity;
      defaults.out = clip.kind === "image" ? start + played : Math.min(length, start + played);
    }
    defaults.transform = media && clip.kind !== "audio" ? defaultTransform(media as { width?: number; height?: number; rotation?: 0 | 90 | 180 | 270 }, project.settings) : IDENTITY_TRANSFORM;
  } else defaults.transform = IDENTITY_TRANSFORM;
  // A solid starts as `+ Solid` makes it in this frame (rounded rectangle, white).
  if (clip.kind === "solid") Object.assign(defaults, defaultSolid(project.settings));
  if (clip.kind === "null") defaults.size = { w: 100, h: 100 };
  // An adjustment clip (Batch 76): no change until effects are added, fully shown.
  if (clip.kind === "adjustment") Object.assign(defaults, { effects: [], opacity: 1 });
  const merged = merge(defaults, clip) as Obj;
  // Only a clip kind with a transform gets one.
  if (!(clip.kind === "video" || clip.kind === "audio" || clip.kind === "image" || clip.kind === "text" || clip.kind === "solid" || clip.kind === "shape" || clip.kind === "null")) delete merged.transform;
  return fillObject("Clip", merged);
}

/**
 * The completed project of a sparse one (§21.4). Throws a `ProjectFileError` when the input is not a project
 * object or its schema cannot be migrated; everything else the strict validation reports afterwards.
 */
export function normalizeProject(raw: unknown, options: NormalizeOptions): NormalizeResult {
  if (!isObject(raw)) throw new ProjectFileError("project.json does not hold a project object");
  const notes: NormalizeNote[] = [];
  const input: Obj = { ...raw, schemaVersion: raw.schemaVersion ?? SCHEMA_VERSION };
  const migrated = migrateProject(input, MIGRATIONS) as Obj;

  const name = typeof migrated.name === "string" ? migrated.name : (options.folderName ?? "Untitled");
  const blank = createProject({ id: typeof migrated.id === "string" ? migrated.id : projectId(name), name, now: options.now, appVersion: options.appVersion }) as unknown as Obj;
  const meta = merge(blank.meta, migrated.meta) as Obj;
  const settings = fillObject("Settings", isObject(migrated.settings) ? migrated.settings : {}) as unknown as Project["settings"];
  const project: Obj = { ...blank, ...migrated, name, id: blank.id, settings, meta };

  const mediaIn = isObject(migrated.media) ? migrated.media : {};
  project.media = Object.fromEntries(Object.entries(mediaIn).map(([id, item]) => [id, isObject(item) ? normalizeMedia(id, item, project, options, notes) : item]));

  const tracksIn = Array.isArray(migrated.tracks) ? migrated.tracks : [];
  const tracks: Obj[] = [];
  for (const entry of tracksIn) {
    if (!isObject(entry)) {
      tracks.push(entry as Obj);
      continue;
    }
    const kind = entry.kind as TrackKind;
    // A caption track is what `newCaptionTrack` makes (CC, height S); the others are numbered.
    const base = kind === "caption" && typeof entry.id === "string" ? (newCaptionTrack(entry.id) as unknown as Obj) : {};
    const named = typeof entry.name === "string" ? entry.name : (base.name as string | undefined) ?? nextTrackName(tracks as unknown as { kind: TrackKind; name: string }[], kind);
    tracks.push({ ...base, ...entry, name: named });
  }
  project.tracks = tracks;

  const clipsIn = isObject(migrated.clips) ? migrated.clips : {};
  const clips: Obj = {};
  for (const [id, entry] of Object.entries(clipsIn)) clips[id] = isObject(entry) ? normalizeClip(id, entry, project as unknown as Project) : entry;
  project.clips = clips;

  // Track clip lists: every clip of the track, sorted by start (a clip listed nowhere is added, a list is rebuilt).
  const byTrack = new Map<string, { id: string; start: number }[]>();
  for (const [id, clip] of Object.entries(clips)) {
    if (!isObject(clip) || typeof clip.trackId !== "string") continue;
    const list = byTrack.get(clip.trackId) ?? [];
    list.push({ id, start: typeof clip.start === "number" ? clip.start : 0 });
    byTrack.set(clip.trackId, list);
  }
  project.tracks = tracks.map((track) => {
    if (!isObject(track) || typeof track.id !== "string") return track;
    const ids = (byTrack.get(track.id) ?? []).sort((a, b) => a.start - b.start || (a.id < b.id ? -1 : 1)).map((entry) => entry.id);
    return fillObject("Track", { ...track, clipIds: ids });
  });

  // Caption tracks: the default style of the project's size under what the input wrote.
  const captionsIn = isObject(migrated.captionTracks) ? migrated.captionTracks : {};
  const captionTracks: Obj = {};
  for (const track of project.tracks as Obj[]) {
    if (!isObject(track) || track.kind !== "caption" || typeof track.id !== "string") continue;
    const given = captionsIn[track.id];
    const style = isObject(given) && isObject(given.style) ? given.style : {};
    captionTracks[track.id] = fillObject("CaptionTrackData", { ...(isObject(given) ? given : {}), style: merge(defaultCaptionStyle(settings), style) });
  }
  for (const [id, data] of Object.entries(captionsIn)) if (!(id in captionTracks)) captionTracks[id] = data;
  project.captionTracks = captionTracks;

  const markers = Array.isArray(migrated.markers) ? migrated.markers : [];
  project.markers = [...markers].sort((a, b) => (isObject(a) && isObject(b) ? Number(a.frame) - Number(b.frame) : 0));

  return { project: fillObject("Project", project) as JsonObject, notes };
}
