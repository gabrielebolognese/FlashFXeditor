// Compound templates (spec §21.24, Batch 80): a compound's sequence saved with everything it needs (nested sequences,
// inner clips, the media they play, the fonts they use) so it can be inserted in any project. This file is
// the pure part: collecting a bundle from a project, instantiating one into fresh ids, the stored record and
// its sanitizer. The stores and the library folder are `compoundTemplateStore.ts`; the app glue is
// `app/templateController.ts`.
import type { Draft } from "immer";
import type { Command } from "../core/commands/command.js";
import { nestedSequences, sequenceClipIds } from "../core/document/sequences.js";
import { templateParamIssues } from "../core/document/templates.js";
import type { Clip, ClipId, JsonValue, MediaId, MediaItem, Project, Sequence, SequenceId, TemplateParam, Track, TrackId } from "../core/document/types.js";
import { isMediaClip } from "../core/document/types.js";
import { copyClips } from "../timeline/edit/duplicate.js";
import { cleanLabel } from "../timeline/edit/templates.js";

export const COMPOUND_TEMPLATE_VERSION = 1;
export const MAX_COMPOUND_TEMPLATES = 100;
export const MAX_COMPOUND_TEMPLATE_NAME = 40;
export const DEFAULT_CATEGORY = "General";

/** A sequence with the clips and media its tree needs. Media items keep their name and facts; their files travel beside it. */
export interface TemplateBundle {
  /** The sequence an instance shows. */
  sequenceId: SequenceId;
  /** The root sequence and the ones nested in it, by id. */
  sequences: Record<SequenceId, Sequence>;
  /** The inner clips of those sequences, by id. */
  clips: Record<ClipId, Clip>;
  /** The media they play (and the media parameters offer as defaults), by id. */
  media: Record<MediaId, MediaItem>;
  /** Font families the inner text uses. */
  families: string[];
}

/** What the library lists: the bundle without its heavy parts. */
export interface CompoundTemplateMeta {
  id: string;
  name: string;
  category: string;
  /** ISO time it was saved. */
  createdAt: string;
  /** A PNG data URL of the template's first frame; null when none could be drawn. */
  thumbnail: string | null;
  /** The sequence's size and length (frames at `fps`). */
  size: { w: number; h: number };
  duration: number;
  /** How many parameters it exposes. */
  params: number;
}

export interface CompoundTemplate extends CompoundTemplateMeta {
  version: typeof COMPOUND_TEMPLATE_VERSION;
  bundle: TemplateBundle;
}

/** Trimmed, one line, capped; empty names become null. */
export const cleanCompoundTemplateName = (name: string): string | null => cleanLabel(name, MAX_COMPOUND_TEMPLATE_NAME);
export const cleanCategory = (category: string): string => cleanLabel(category, MAX_COMPOUND_TEMPLATE_NAME) ?? DEFAULT_CATEGORY;

/** "Template 3": the first free "Template <n>" among `taken` (compared without case). */
export function nextCompoundTemplateName(taken: readonly string[]): string {
  const used = new Set(taken.map((name) => name.toLowerCase()));
  let n = 1;
  while (used.has(`template ${n}`)) n += 1;
  return `Template ${n}`;
}

/** Why `sequenceId` cannot be saved as a template, or null. */
export function compoundTemplateProblem(project: Project, sequenceId: SequenceId): string | null {
  const sequence = project.sequences[sequenceId];
  if (!sequence) return "The compound's sequence is missing";
  if (!sequence.params || sequence.params.length === 0) return "Expose at least one field as a parameter first";
  return null;
}

/** The sequences of `sequenceId`'s tree, the root first. */
function treeOf(project: Project, sequenceId: SequenceId): Sequence[] {
  const order: Sequence[] = [];
  const seen = new Set<SequenceId>();
  const visit = (id: SequenceId) => {
    const sequence = project.sequences[id];
    if (!sequence || seen.has(id)) return;
    seen.add(id);
    order.push(sequence);
    for (const next of nestedSequences(project, id)) visit(next);
  };
  visit(sequenceId);
  return order;
}

/** The bundle of a sequence (deep copies), or null when it cannot be saved. */
export function collectBundle(project: Project, sequenceId: SequenceId): TemplateBundle | null {
  if (compoundTemplateProblem(project, sequenceId) !== null) return null;
  const sequences: Record<SequenceId, Sequence> = {};
  const clips: Record<ClipId, Clip> = {};
  const media: Record<MediaId, MediaItem> = {};
  const families = new Set<string>();
  const wantMedia = (id: unknown) => {
    if (typeof id !== "string") return;
    const item = project.media[id];
    if (item) media[id] = structuredClone(item);
  };
  for (const sequence of treeOf(project, sequenceId)) {
    sequences[sequence.id] = structuredClone(sequence);
    for (const param of sequence.params ?? []) if (param.kind === "media") wantMedia(param.default);
    for (const id of sequenceClipIds(sequence)) {
      const clip = project.clips[id];
      if (!clip) continue;
      clips[id] = structuredClone(clip);
      if (isMediaClip(clip)) wantMedia(clip.mediaId);
      if (clip.kind === "text") families.add(clip.style.fontFamily);
    }
    for (const param of sequence.params ?? []) if (param.kind === "font" && typeof param.default === "string") families.add(param.default);
  }
  return { sequenceId, sequences, clips, media, families: [...families].sort() };
}

/** A bundle placed in a project under fresh ids. */
export interface Instantiated {
  /** The new root sequence. */
  sequenceId: SequenceId;
  sequences: Record<SequenceId, Sequence>;
  clips: Record<ClipId, Clip>;
  media: Record<MediaId, MediaItem>;
}

/**
 * The bundle with every id replaced (sequences, tracks, clips and the references between them: parameter
 * targets, compound clips' sequences, parents, mattes, link groups). `media` gives the project's item for each
 * bundle media id (the app imports the files first); media without an entry keep their bundle id and item.
 */
export function instantiateBundle(bundle: TemplateBundle, newId: () => string, media: Readonly<Record<MediaId, MediaItem>> = {}): Instantiated {
  const sequenceIds = new Map<SequenceId, SequenceId>(Object.keys(bundle.sequences).map((id) => [id, newId()]));
  const trackIds = new Map<TrackId, TrackId>();
  for (const sequence of Object.values(bundle.sequences)) for (const track of sequence.tracks) trackIds.set(track.id, newId());
  const old = Object.values(bundle.clips);
  const copies = copyClips(old, newId, { links: true, transitions: true });
  const clipIds = new Map<ClipId, ClipId>(old.map((clip, i) => [clip.id, (copies[i] as Clip).id]));
  const mediaId = (id: MediaId): MediaId => media[id]?.id ?? id;
  const clips: Record<ClipId, Clip> = {};
  for (const copy of copies) {
    const next = { ...copy, trackId: trackIds.get(copy.trackId) ?? copy.trackId } as Clip;
    if (next.kind === "compound") next.sequenceId = sequenceIds.get(next.sequenceId) ?? next.sequenceId;
    if (isMediaClip(next)) next.mediaId = mediaId(next.mediaId);
    clips[next.id] = next;
  }
  const sequences: Record<SequenceId, Sequence> = {};
  for (const sequence of Object.values(bundle.sequences)) {
    const id = sequenceIds.get(sequence.id) as SequenceId;
    const copy: Sequence = {
      ...structuredClone(sequence),
      id,
      tracks: sequence.tracks.map((track): Track => ({ ...structuredClone(track), id: trackIds.get(track.id) as TrackId, clipIds: track.clipIds.map((clipId) => clipIds.get(clipId) ?? clipId) })),
    };
    if (sequence.params) {
      copy.params = sequence.params.map((param): TemplateParam => ({
        ...structuredClone(param),
        targets: param.targets.map((target) => ({ clipId: clipIds.get(target.clipId) ?? target.clipId, path: target.path })),
        default: param.kind === "media" && typeof param.default === "string" ? (mediaId(param.default) as JsonValue) : structuredClone(param.default),
      }));
    }
    sequences[id] = copy;
  }
  const items: Record<MediaId, MediaItem> = {};
  for (const [id, item] of Object.entries(bundle.media)) {
    const placed = media[id];
    if (placed) items[placed.id] = placed;
    else items[id] = item;
  }
  return { sequenceId: sequenceIds.get(bundle.sequenceId) as SequenceId, sequences, clips, media: items };
}

/** The command that adds an instantiated bundle to the project (media items the project lacks, clips, sequences): one undo step. */
export function insertBundleCommand(project: Project, placed: Instantiated): Command {
  const media = Object.values(placed.media).filter((item) => !project.media[item.id]);
  return {
    id: "template.insert",
    label: "Insert template",
    affects: ["clips", "media", "composite"],
    run(draft) {
      for (const item of media) draft.media[item.id] = structuredClone(item) as Draft<MediaItem>;
      for (const clip of Object.values(placed.clips)) draft.clips[clip.id] = structuredClone(clip) as Draft<Clip>;
      for (const sequence of Object.values(placed.sequences)) draft.sequences[sequence.id] = structuredClone(sequence) as Draft<Sequence>;
    },
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** The sequence tree of a bundle seen as a small project, to run the document validator over it. */
export function bundleProject(base: Project, bundle: TemplateBundle): Project {
  return { ...base, tracks: [], clips: { ...bundle.clips }, media: { ...bundle.media }, sequences: { ...bundle.sequences } };
}

/** A stored template whose shape is sound (a root sequence with parameters whose targets are in the bundle); null otherwise. */
export function sanitizeCompoundTemplate(value: unknown, base: Project, now: string): CompoundTemplate | null {
  if (!isRecord(value) || typeof value.id !== "string" || value.id === "" || typeof value.name !== "string" || !isRecord(value.bundle)) return null;
  const bundle = value.bundle as unknown as TemplateBundle;
  if (typeof bundle.sequenceId !== "string" || !isRecord(bundle.sequences) || !isRecord(bundle.clips) || !isRecord(bundle.media)) return null;
  const root = bundle.sequences[bundle.sequenceId];
  if (!root || !Array.isArray(root.tracks) || !Array.isArray(root.params) || root.params.length === 0) return null;
  const project = bundleProject(base, bundle);
  for (const sequence of Object.values(bundle.sequences)) if (templateParamIssues(project, sequence, sequence.name).length > 0) return null;
  const name = cleanCompoundTemplateName(value.name);
  if (!name) return null;
  const size = root.size;
  return {
    version: COMPOUND_TEMPLATE_VERSION,
    id: value.id,
    name,
    category: typeof value.category === "string" ? cleanCategory(value.category) : DEFAULT_CATEGORY,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : now,
    thumbnail: typeof value.thumbnail === "string" && value.thumbnail.startsWith("data:image/") ? value.thumbnail : null,
    size: { w: size.w, h: size.h },
    duration: root.duration,
    params: root.params.length,
    bundle: { sequenceId: bundle.sequenceId, sequences: bundle.sequences, clips: bundle.clips, media: bundle.media, families: Array.isArray(bundle.families) ? bundle.families.filter((family) => typeof family === "string") : [] },
  };
}

/** The record of a bundle. */
export function compoundTemplate(bundle: TemplateBundle, fields: { id: string; name: string; category: string; now: string; thumbnail: string | null }): CompoundTemplate {
  const root = bundle.sequences[bundle.sequenceId] as Sequence;
  return {
    version: COMPOUND_TEMPLATE_VERSION,
    id: fields.id,
    name: cleanCompoundTemplateName(fields.name) ?? "Template",
    category: cleanCategory(fields.category),
    createdAt: fields.now,
    thumbnail: fields.thumbnail,
    size: { w: root.size.w, h: root.size.h },
    duration: root.duration,
    params: root.params?.length ?? 0,
    bundle,
  };
}

/** Templates matching `query` (words, any case) in name or category, grouped by nothing: the list order is kept. */
export function filterCompoundTemplates<T extends Pick<CompoundTemplateMeta, "name" | "category">>(list: readonly T[], query: string): T[] {
  const words = query.toLowerCase().split(/\s+/).filter((word) => word !== "");
  if (words.length === 0) return [...list];
  return list.filter((item) => {
    const text = `${item.name} ${item.category}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}
