// Nested sequences (spec §21.10, Batch 62): the graph of compound clips (a sequence holds compound
// clips that show other sequences), its cycle and depth rules, and lookups of a clip's scope. Pure.
import { MAX_COMPOUND_DEPTH, type Clip, type ClipId, type CompoundClip, type Project, type RGBA, type Sequence, type SequenceId, type Track, type TrackId } from "./types.js";

/** The compound clips on `tracks`, in track order. */
function compoundsOn(project: Project, tracks: readonly Track[]): CompoundClip[] {
  const out: CompoundClip[] = [];
  for (const track of tracks) {
    for (const id of track.clipIds) {
      const clip = project.clips[id];
      if (clip?.kind === "compound") out.push(clip);
    }
  }
  return out;
}

/** The compound clips directly inside `scope`: a sequence id, or null for the project's own tracks. */
export function compoundsIn(project: Project, scope: SequenceId | null): CompoundClip[] {
  if (scope === null) return compoundsOn(project, project.tracks);
  const sequence = project.sequences[scope];
  return sequence ? compoundsOn(project, sequence.tracks) : [];
}

/** The sequences `scope` shows directly (distinct ids, in order of first use). */
export function nestedSequences(project: Project, scope: SequenceId | null): SequenceId[] {
  return [...new Set(compoundsIn(project, scope).map((clip) => clip.sequenceId))];
}

/** True when `from` (a sequence id) shows `target` directly or through other sequences. Cycles do not loop. */
export function reachesSequence(project: Project, from: SequenceId, target: SequenceId): boolean {
  const seen = new Set<SequenceId>();
  const stack = [from];
  while (stack.length > 0) {
    const id = stack.pop() as SequenceId;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const next of nestedSequences(project, id)) {
      if (next === target) return true;
      stack.push(next);
    }
  }
  return false;
}

/** How many levels of compounds sit inside `id` (0: none). Meaningful only without cycles. */
export function sequenceHeight(project: Project, id: SequenceId, memo = new Map<SequenceId, number>(), path = new Set<SequenceId>()): number {
  const known = memo.get(id);
  if (known !== undefined) return known;
  if (path.has(id)) return 0;
  path.add(id);
  let height = 0;
  for (const next of nestedSequences(project, id)) {
    if (project.sequences[next]) height = Math.max(height, 1 + sequenceHeight(project, next, memo, path));
  }
  path.delete(id);
  memo.set(id, height);
  return height;
}

/** How many compound levels `scope` sits in (a project: 0). The deepest way to reach it, cycles ignored. */
export function scopeDepth(project: Project, scope: SequenceId | null, memo = new Map<SequenceId | null, number>(), path = new Set<SequenceId>()): number {
  if (scope === null) return 0;
  const known = memo.get(scope);
  if (known !== undefined) return known;
  if (path.has(scope)) return 0;
  path.add(scope);
  let depth = 1;
  for (const host of [null, ...Object.keys(project.sequences)]) {
    if (host === scope) continue;
    if (nestedSequences(project, host).includes(scope)) depth = Math.max(depth, 1 + scopeDepth(project, host, memo, path));
  }
  path.delete(scope);
  memo.set(scope, depth);
  return depth;
}

/**
 * Why a compound clip showing `target` cannot be placed in `host` (a sequence id, or null for the
 * project), or null when it can: it would show a sequence inside itself, or nest too deep.
 */
export function nestingProblem(project: Project, host: SequenceId | null, target: SequenceId): string | null {
  if (!project.sequences[target]) return `The sequence ${target} does not exist`;
  if (host !== null && (host === target || reachesSequence(project, target, host))) return "A compound cannot contain itself";
  if (scopeDepth(project, host) + 1 + sequenceHeight(project, target) > MAX_COMPOUND_DEPTH) return `Compounds nest at most ${MAX_COMPOUND_DEPTH} levels`;
  return null;
}

/** Cycles and nesting depth of the whole document (invariant messages). */
export function sequenceGraphIssues(project: Project): string[] {
  const issues: string[] = [];
  const ids = Object.keys(project.sequences);
  const cyclic = new Set<SequenceId>();
  for (const id of ids) if (reachesSequence(project, id, id)) cyclic.add(id);
  for (const id of cyclic) issues.push(`sequence "${project.sequences[id]?.name}" (${id}): contains itself through its compound clips`);
  if (cyclic.size > 0) return issues;
  const memo = new Map<SequenceId, number>();
  for (const id of ids) {
    if (1 + sequenceHeight(project, id, memo) > MAX_COMPOUND_DEPTH) issues.push(`sequence "${project.sequences[id]?.name}" (${id}): compounds nest more than ${MAX_COMPOUND_DEPTH} levels`);
  }
  const top = Math.max(0, ...nestedSequences(project, null).map((id) => 1 + sequenceHeight(project, id, memo)));
  if (top > MAX_COMPOUND_DEPTH) issues.push(`the project's compounds nest ${top} levels: at most ${MAX_COMPOUND_DEPTH}`);
  return issues;
}

/** The inner clip ids of a sequence, in track order. */
export function sequenceClipIds(sequence: Sequence): ClipId[] {
  return sequence.tracks.flatMap((track) => track.clipIds);
}

/** The sequence that owns track `trackId`, or null for a project track (or an unknown id). */
export function sequenceOfTrack(project: Project, trackId: TrackId): Sequence | null {
  for (const sequence of Object.values(project.sequences)) if (sequence.tracks.some((track) => track.id === trackId)) return sequence;
  return null;
}

/** The track `trackId` of the project or of any sequence. */
export function findTrack(project: Project, trackId: TrackId): Track | undefined {
  return project.tracks.find((track) => track.id === trackId) ?? sequenceOfTrack(project, trackId)?.tracks.find((track) => track.id === trackId);
}

/** True when `clip` lives inside a sequence rather than on a project track. */
export function isInnerClip(project: Project, clip: Clip): boolean {
  return !project.tracks.some((track) => track.id === clip.trackId);
}

/** The compound clips that show `sequenceId` (the project's and the sequences'), the instances. */
export function instancesOf(project: Project, sequenceId: SequenceId): CompoundClip[] {
  return Object.values(project.clips).filter((clip): clip is CompoundClip => clip.kind === "compound" && clip.sequenceId === sequenceId);
}

const TRANSPARENT: RGBA = { r: 0, g: 0, b: 0, a: 0 };
const views = new WeakMap<Sequence, { doc: Project; view: Project }>();

/**
 * The document seen from inside a sequence: its tracks, size and background (transparent when it has
 * none) in place of the project's. Cached per sequence and document, so an unrelated edit of the
 * project costs one object and an edit inside the sequence keeps `tracks` and `settings` stable.
 */
export function sequenceView(doc: Project, sequence: Sequence): Project {
  const known = views.get(sequence);
  if (known?.doc === doc) return known.view;
  // The sequence's own perspective (spec §21.15): the project's does not reach inside it.
  const settings = { ...doc.settings };
  delete settings.perspective;
  const view: Project = {
    ...doc,
    tracks: sequence.tracks,
    settings: { ...settings, width: sequence.size.w, height: sequence.size.h, background: sequence.background ?? TRANSPARENT, ...(sequence.perspective !== undefined && { perspective: sequence.perspective }) },
  };
  views.set(sequence, { doc, view });
  return view;
}

/** The sequence `project` is a view of (see `sequenceView`: its tracks are the sequence's), or null for the real project. */
export function hostSequenceOf(project: Project): SequenceId | null {
  for (const sequence of Object.values(project.sequences)) if (sequence.tracks === project.tracks) return sequence.id;
  return null;
}

/** The sequence a path of open compounds ends in (null: the project, also when it no longer exists). */
export function scopeSequence(project: Project, path: readonly SequenceId[]): Sequence | null {
  const last = path[path.length - 1];
  return last === undefined ? null : (project.sequences[last] ?? null);
}
