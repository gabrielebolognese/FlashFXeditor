// Timeline queries (spec §3.2, P10). Per-track indexes (start-sorted clips, their ends, longest clip,
// track end) are built lazily and cached per document version, so lookups are binary searches.
import type { Clip, ClipId, Frame, Project, Track, TrackId } from "../../core/document/types.js";

export interface Gap {
  trackId: TrackId;
  start: Frame;
  end: Frame;
}

export interface TrackIndex {
  /** Clips sorted by start. */
  clips: readonly Clip[];
  starts: readonly Frame[];
  /** Clip ends, sorted too: clips on a track never overlap (spec §5.2). */
  ends: readonly Frame[];
  /** Longest clip on the track: bounds how far back a range query must look. */
  maxDuration: Frame;
  /** End of the last clip; 0 when empty. */
  end: Frame;
}

// The clips record is replaced whenever any clip changes and a track object whenever its id list
// changes, so this pair identifies a valid index.
const cache = new WeakMap<Project["clips"], WeakMap<Track, TrackIndex>>();

export function trackIndex(project: Project, track: Track): TrackIndex {
  let byTrack = cache.get(project.clips);
  if (!byTrack) {
    byTrack = new WeakMap();
    cache.set(project.clips, byTrack);
  }
  let index = byTrack.get(track);
  if (!index) {
    const clips = track.clipIds.map((id) => project.clips[id]).filter((clip): clip is Clip => clip !== undefined);
    let maxDuration = 0;
    let end = 0;
    for (const clip of clips) {
      maxDuration = Math.max(maxDuration, clip.duration);
      end = Math.max(end, clip.start + clip.duration);
    }
    index = { clips, starts: clips.map((clip) => clip.start), ends: clips.map((clip) => clip.start + clip.duration), maxDuration, end };
    byTrack.set(track, index);
  }
  return index;
}

function indexOf(project: Project, trackId: TrackId): TrackIndex | null {
  const track = project.tracks.find((t) => t.id === trackId);
  return track ? trackIndex(project, track) : null;
}

/** Number of entries in sorted `values` that are <= `value`. */
function countAtOrBelow(values: readonly number[], value: number): number {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((values[mid] as number) <= value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Position in `index.clips` of the last clip starting at or before `frame`; -1 when none does. */
export function lastClipStartingBy(index: TrackIndex, frame: Frame): number {
  return countAtOrBelow(index.starts, frame) - 1;
}

/** The clip of an indexed track covering `frame`, or null. */
export function clipInIndex(index: TrackIndex, frame: Frame): Clip | null {
  const clip = index.clips[lastClipStartingBy(index, frame)];
  return clip && frame < clip.start + clip.duration ? clip : null;
}

/** The clip covering `frame` on a track, or null. */
export function clipAtFrame(project: Project, trackId: TrackId, frame: Frame): Clip | null {
  const index = indexOf(project, trackId);
  return index ? clipInIndex(index, frame) : null;
}

/** The clip covering `frame` on each track, in track order. */
export function clipsAtFrame(project: Project, frame: Frame): Clip[] {
  const result: Clip[] = [];
  for (const track of project.tracks) {
    const clip = clipInIndex(trackIndex(project, track), frame);
    if (clip) result.push(clip);
  }
  return result;
}

/** Clips on a track intersecting [from, to). */
export function clipsInRange(project: Project, trackId: TrackId, from: Frame, to: Frame): Clip[] {
  const index = indexOf(project, trackId);
  if (!index || to <= from) return [];
  // A clip starting at or before from - maxDuration ends at or before from.
  const result: Clip[] = [];
  for (let i = countAtOrBelow(index.starts, from - index.maxDuration); i < index.clips.length; i++) {
    const clip = index.clips[i] as Clip;
    if (clip.start >= to) break;
    if (clip.start + clip.duration > from) result.push(clip);
  }
  return result;
}

/** Clips of an indexed track intersecting [from, to): a binary search on the ends, then the hits (O(log n + k)). */
export function clipsOverlapping(index: TrackIndex, from: Frame, to: Frame): Clip[] {
  const result: Clip[] = [];
  if (to <= from) return result;
  for (let i = countAtOrBelow(index.ends, from); i < index.clips.length; i++) {
    const clip = index.clips[i] as Clip;
    if (clip.start >= to) break;
    result.push(clip);
  }
  return result;
}

/** Position in `index.clips` of the first clip ending after `frame` (the clips from there on end after it). */
export function firstEndingAfter(index: TrackIndex, frame: Frame): number {
  return countAtOrBelow(index.ends, frame);
}

/** The clips just before and after a clip on its track. */
export function neighbors(project: Project, clipId: ClipId): { prev: Clip | null; next: Clip | null } {
  const clip = project.clips[clipId];
  const index = clip ? indexOf(project, clip.trackId) : null;
  if (!clip || !index) return { prev: null, next: null };
  const i = countAtOrBelow(index.starts, clip.start) - 1;
  return { prev: index.clips[i - 1] ?? null, next: index.clips[i + 1] ?? null };
}

/** Empty spans between frame 0 and the end of the last clip. */
export function trackGaps(project: Project, trackId: TrackId): Gap[] {
  const index = indexOf(project, trackId);
  if (!index) return [];
  const gaps: Gap[] = [];
  let cursor = 0;
  for (const clip of index.clips) {
    if (clip.start > cursor) gaps.push({ trackId, start: cursor, end: clip.start });
    cursor = Math.max(cursor, clip.start + clip.duration);
  }
  return gaps;
}

/** The gap containing `frame`, or null (also null after the last clip). */
export function gapAt(project: Project, trackId: TrackId, frame: Frame): Gap | null {
  const index = indexOf(project, trackId);
  if (!index || frame < 0 || frame >= index.end || clipInIndex(index, frame)) return null;
  const i = countAtOrBelow(index.starts, frame);
  const before = index.clips[i - 1];
  const after = index.clips[i] as Clip;
  return { trackId, start: before ? before.start + before.duration : 0, end: after.start };
}

export function trackEnd(project: Project, trackId: TrackId): Frame {
  return indexOf(project, trackId)?.end ?? 0;
}

/** End of the last clip on any track. */
export function contentEnd(project: Project): Frame {
  let end = 0;
  for (const track of project.tracks) end = Math.max(end, trackIndex(project, track).end);
  return end;
}

/** Sorted, unique clip starts and ends on the given tracks (all tracks by default). */
export function editPoints(project: Project, trackIds?: readonly TrackId[]): Frame[] {
  const points = new Set<Frame>();
  for (const track of project.tracks) {
    if (trackIds && !trackIds.includes(track.id)) continue;
    for (const clip of trackIndex(project, track).clips) {
      points.add(clip.start);
      points.add(clip.start + clip.duration);
    }
  }
  return [...points].sort((a, b) => a - b);
}

/** First point after `frame`, or null. `points` sorted ascending. */
export function nextEditPoint(points: readonly Frame[], frame: Frame): Frame | null {
  return points[countAtOrBelow(points, frame)] ?? null;
}

/** Last point before `frame`, or null. `points` sorted ascending. */
export function prevEditPoint(points: readonly Frame[], frame: Frame): Frame | null {
  return points[countAtOrBelow(points, frame - 1) - 1] ?? null;
}

/** Sorted, unique marker frames (Shift+Up/Down stops). */
export function markerFrames(project: Project): Frame[] {
  return [...new Set(project.markers.map((marker) => marker.frame))].sort((a, b) => a - b);
}

/** Up/Down stops (spec §6.5): clip starts and ends on unlocked tracks, markers, and the in/out points given. */
export function navigationPoints(project: Project, inOut: readonly (Frame | null)[] = []): Frame[] {
  const unlocked = project.tracks.filter((track) => !track.locked).map((track) => track.id);
  const points = new Set(editPoints(project, unlocked));
  for (const marker of project.markers) points.add(marker.frame);
  for (const frame of inOut) if (frame !== null) points.add(frame);
  return [...points].sort((a, b) => a - b);
}

export function trackOf(project: Project, trackId: TrackId): Track | null {
  return project.tracks.find((track) => track.id === trackId) ?? null;
}

/** True when the clip sits on a locked track (spec §6.12: no edits, no selection). */
export function isClipLocked(project: Project, clipId: ClipId): boolean {
  const clip = project.clips[clipId];
  return clip !== undefined && trackOf(project, clip.trackId)?.locked === true;
}

// Link groups by document version: the clip ids sharing each `linkGroup`.
const linkCache = new WeakMap<Project["clips"], Map<string, ClipId[]>>();

function linkGroups(project: Project): Map<string, ClipId[]> {
  let groups = linkCache.get(project.clips);
  if (!groups) {
    groups = new Map();
    for (const clip of Object.values(project.clips)) {
      if (clip.linkGroup === undefined) continue;
      const ids = groups.get(clip.linkGroup);
      if (ids) ids.push(clip.id);
      else groups.set(clip.linkGroup, [clip.id]);
    }
    linkCache.set(project.clips, groups);
  }
  return groups;
}

/** The other clips sharing the clip's `linkGroup` (spec §6.12), on unlocked tracks only. */
export function linkedPartners(project: Project, clipId: ClipId): ClipId[] {
  const group = project.clips[clipId]?.linkGroup;
  if (group === undefined) return [];
  return (linkGroups(project).get(group) ?? []).filter((id) => id !== clipId && !isClipLocked(project, id));
}

/**
 * The sync badge of a linked clip (spec §6.12, §6.10: Alt-trimming one side of a link produces an
 * offset badge): how many frames its start lies after its partner's start or, when the starts match,
 * its end after the partner's end. 0 when aligned or unlinked. The partner is the first clip of the
 * other kind (video or audio) in the link group, else the first other clip; locked ones count.
 * TODO(batch 16): "Move into sync" and the offset it realigns by.
 */
export function linkOffset(project: Project, clipId: ClipId): Frame {
  const clip = project.clips[clipId];
  if (!clip || clip.linkGroup === undefined) return 0;
  let partner: Clip | undefined;
  for (const id of linkGroups(project).get(clip.linkGroup) ?? []) {
    const other = id === clipId ? undefined : project.clips[id];
    if (!other) continue;
    partner ??= other;
    if ((other.kind === "audio") !== (clip.kind === "audio")) {
      partner = other;
      break;
    }
  }
  if (!partner) return 0;
  const start = clip.start - partner.start;
  return start !== 0 ? start : clip.start + clip.duration - (partner.start + partner.duration);
}

/** Every clip on an unlocked track (spec §6.7 `Mod+A`), track by track in start order. */
export function selectableClipIds(project: Project): ClipId[] {
  const ids: ClipId[] = [];
  for (const track of project.tracks) if (!track.locked) ids.push(...track.clipIds);
  return ids;
}

/**
 * Lanes (spec §6.8): video and audio tracks are numbered outward from the divider, V1 upward and A1
 * downward, from 0. A vertical move shifts every clip by the same lane delta within its own kind, so
 * linked audio follows its video (V1 -> V2 takes A1 -> A2). Caption tracks have no lane.
 */
export type LaneKind = "video" | "audio";

export interface Lane {
  kind: LaneKind;
  number: number;
}

/** The tracks of a kind in lane order (V1, V2... bottom to top; A1, A2... top to bottom). */
export function laneTracks(tracks: readonly Track[], kind: LaneKind): Track[] {
  return tracks.filter((track) => track.kind === kind);
}

export function laneOf(tracks: readonly Track[], trackId: TrackId): Lane | null {
  let video = 0;
  let audio = 0;
  for (const track of tracks) {
    if (track.id === trackId) {
      if (track.kind === "caption") return null;
      return { kind: track.kind, number: track.kind === "video" ? video : audio };
    }
    if (track.kind === "video") video += 1;
    else if (track.kind === "audio") audio += 1;
  }
  return null;
}
