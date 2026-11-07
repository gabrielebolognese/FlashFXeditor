// Make editable (spec §21.5, Batch 56): a baked stand-in (`fallbackOf`) becomes the native clip it stands for.
// The conversion reuses the app's own pieces: `normalizeProject` (migrates `fallbackOf.schemaVersion` to the
// current one, then fills the field table's defaults), the editor's head trim (`trimmedClip`, so keys, in
// points and offsets shift as in a normal trim) and the strict validator. Pure: media facts come in from the
// caller (probed in a worker by the app, by the header readers in the CLI). Changes made to the stand-in
// itself (transform, opacity, keys) are not carried over: the native clip is the stand-in's `data`.
import type { Draft } from "immer";
import type { Command } from "../commands/command.js";
import { trimmedClip } from "../../timeline/edit/trim.js";
import { normalizeProject, type MediaFacts } from "./normalize.js";
import { schemaOf } from "./schema.js";
import { validateStrict } from "./strict.js";
import { SCHEMA_VERSION, type Clip, type ClipId, type MediaId, type MediaItem, type Project } from "./types.js";

type Obj = Record<string, unknown>;
const isObject = (value: unknown): value is Obj => typeof value === "object" && value !== null && !Array.isArray(value);

export interface ConvertOptions {
  now: string;
  appVersion: string;
  /** Header facts of `data.media` by media id (probed like an import). */
  facts?: Readonly<Record<string, MediaFacts>>;
  /** Run the strict validation of the whole project with the clip in place (default). `convertAll` checks once at the end. */
  validate?: boolean;
}

/** What a conversion changes: the clips replaced (same id, same track) and the media records it adds. */
export interface Changes {
  clips: Record<ClipId, Clip>;
  media: Record<MediaId, MediaItem>;
}

export type Conversion = { ok: true; project: Project; changes: Changes } | { ok: false; reason: string };

/** The clips that are baked stand-ins, in track order then start order. */
export function standIns(project: Project): Clip[] {
  const found: Clip[] = [];
  for (const track of project.tracks) for (const id of track.clipIds) if (project.clips[id]?.fallbackOf !== undefined) found.push(project.clips[id] as Clip);
  return found;
}

/** The media records of a stand-in's `data.media`, by id (empty when it has none). */
export function standInMedia(clip: Clip): Record<string, Obj> {
  const media = clip.fallbackOf?.data.media;
  if (!isObject(media)) return {};
  return Object.fromEntries(Object.entries(media as Obj).filter((entry): entry is [string, Obj] => isObject(entry[1])));
}

const failure = (reason: string): Conversion => ({ ok: false, reason });

/** The native clip a stand-in stands for, in place of the stand-in (or why it cannot be made). */
export function convertStandIn(project: Project, clipId: ClipId, options: ConvertOptions): Conversion {
  const stand = project.clips[clipId];
  const block = stand?.fallbackOf;
  if (!stand || !block) return failure("The clip is not a baked stand-in");
  const kinds = Object.keys(schemaOf("Clip").variants ?? {});
  if (!kinds.includes(block.kind)) return failure(`This editor has no "${block.kind}" clip yet`);
  if (block.schemaVersion > SCHEMA_VERSION) return failure(`Its data follows schema ${block.schemaVersion}, newer than this editor's ${SCHEMA_VERSION}`);
  const head = block.headTrim ?? 0;
  const start = stand.start - head;
  if (start < 0) return failure("Its head trim reaches before the start of the timeline");
  const track = project.tracks.find((t) => t.id === stand.trackId);
  if (!track) return failure("Its track is missing");

  // The media the data brings: records already in the project (same id and file) are kept, a clash is refused.
  const brought = standInMedia(stand);
  const added: Record<string, Obj> = {};
  for (const [id, record] of Object.entries(brought)) {
    const existing = project.media[id];
    if (!existing) {
      added[id] = record;
      continue;
    }
    const relPath = isObject(record.file) ? record.file.relPath : undefined;
    const same = "relPath" in existing.file && existing.file.relPath === relPath;
    if (!same) return failure(`Its media "${id}" is already used by another file in this project`);
  }

  const clipData: Obj = { ...(block.data as Obj) };
  delete clipData.media;
  const sparse = {
    schemaVersion: block.schemaVersion,
    id: "stand-in",
    name: "stand-in",
    settings: structuredClone(project.settings),
    media: structuredClone(added),
    tracks: [{ id: stand.trackId, kind: track.kind }],
    clips: { [clipId]: { ...structuredClone(clipData), id: clipId, trackId: stand.trackId, start, duration: stand.duration + head } },
  };
  let normalized: Project;
  try {
    normalized = normalizeProject(sparse, { now: options.now, appVersion: options.appVersion, ...(options.facts && { facts: options.facts }) }).project as unknown as Project;
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error));
  }
  const native = normalized.clips[clipId];
  if (!native) return failure("Its data holds no clip");
  const media: Record<MediaId, MediaItem> = {};
  for (const id of Object.keys(added)) {
    const item = normalized.media[id];
    if (item) media[id] = item;
  }

  const base: Project = { ...project, media: { ...project.media, ...media }, clips: { ...project.clips, [clipId]: native } };
  const trimmed = head > 0 ? trimmedClip(native, "in", head, false, base) : native;
  const next: Project = { ...base, clips: { ...base.clips, [clipId]: trimmed } };
  if (options.validate !== false) {
    const result = validateStrict(JSON.parse(JSON.stringify(next)));
    const first = result.errors[0];
    if (first) return failure(first.message);
  }
  return { ok: true, project: next, changes: { clips: { [clipId]: trimmed }, media } };
}

export interface ConvertAllResult {
  project: Project;
  changes: Changes;
  converted: ClipId[];
  remaining: { clipId: ClipId; reason: string }[];
}

/** Every convertible stand-in converted; the rest with their reasons. The project stays valid (checked as a whole). */
export function convertAll(project: Project, options: ConvertOptions & { factsFor?: (clip: Clip) => Readonly<Record<string, MediaFacts>> | undefined }): ConvertAllResult {
  const convertSet = (validate: boolean): ConvertAllResult => {
    let current = project;
    const changes: Changes = { clips: {}, media: {} };
    const converted: ClipId[] = [];
    const remaining: ConvertAllResult["remaining"] = [];
    for (const clip of standIns(project)) {
      const facts = options.factsFor?.(clip) ?? options.facts;
      const result = convertStandIn(current, clip.id, { ...options, validate, ...(facts && { facts }) });
      if (!result.ok) {
        remaining.push({ clipId: clip.id, reason: result.reason });
        continue;
      }
      current = result.project;
      Object.assign(changes.clips, result.changes.clips);
      Object.assign(changes.media, result.changes.media);
      converted.push(clip.id);
    }
    return { project: current, changes, converted, remaining };
  };
  // One strict check of the whole result; only when it fails does each conversion pay for its own.
  const fast = convertSet(false);
  if (fast.converted.length === 0 || validateStrict(JSON.parse(JSON.stringify(fast.project))).ok) return fast;
  return convertSet(true);
}

/** The one command that applies a conversion (`clip.makeEditable`, `project.makeAllEditable`): one undo step. */
export function makeEditableCommand(id: string, label: string, changes: Changes): Command {
  return {
    id,
    label,
    affects: ["clips", "timeline", "media", "text", "audio", "composite"],
    run(draft: Draft<Project>) {
      for (const [mediaId, item] of Object.entries(changes.media)) if (!draft.media[mediaId]) draft.media[mediaId] = structuredClone(item) as Draft<MediaItem>;
      for (const [clipId, clip] of Object.entries(changes.clips)) draft.clips[clipId] = structuredClone(clip) as Draft<Clip>;
    },
  };
}
