// Timeline queries (spec §3.2, P10). Per-track indexes (start-sorted clips, their ends, longest clip,
// track end) are built lazily and cached per document version, so lookups are binary searches.
import { usPerFrame } from "../../core/document/time.js";
import { isFreeze, isMediaClip, type Clip, type ClipId, type Frame, type MediaClip, type Project, type Rational, type Track, type TrackId } from "../../core/document/types.js";

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

/** The frames the given clips cover together, [start, end); null when none of them exists (zoom to selection, spec §6.2). */
export function clipsSpan(project: Project, clipIds: Iterable<ClipId>): { start: Frame; end: Frame } | null {
  let start = Infinity;
  let end = -Infinity;
  for (const id of clipIds) {
    const clip = project.clips[id];
    if (!clip) continue;
    start = Math.min(start, clip.start);
    end = Math.max(end, clip.start + clip.duration);
  }
  return end > start ? { start, end } : null;
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

/** The clip a linked clip's sync is measured against: the first clip of the other kind (video or audio) in its link group, else the first other clip; locked ones count. */
function syncPartner(project: Project, clip: Clip): Clip | null {
  if (clip.linkGroup === undefined) return null;
  let partner: Clip | undefined;
  for (const id of linkGroups(project).get(clip.linkGroup) ?? []) {
    const other = id === clip.id ? undefined : project.clips[id];
    if (!other) continue;
    partner ??= other;
    if ((other.kind === "audio") !== (clip.kind === "audio")) return other;
  }
  return partner ?? null;
}

/** The timeline frame (fractional) where a media clip's source time 0 would play. */
function sourceOrigin(clip: MediaClip, fps: Rational): number {
  return clip.start - clip.in / (usPerFrame(fps) * clip.speed);
}

/**
 * The sync offset of a linked clip (spec §6.12 sync badge `+12` / `-12`): how many frames it plays
 * after its partner. Clips of the same media (a video and its own audio) are in sync when the same
 * source time plays at the same frame, so an Alt-trim of one side (a J or L cut) keeps them in sync and
 * a move of one side does not; clips of different media are in sync when they start together (spec
 * §5.2). Rounded to whole frames; 0 when aligned or unlinked.
 */
export function linkOffset(project: Project, clipId: ClipId): Frame {
  const clip = project.clips[clipId];
  const partner = clip ? syncPartner(project, clip) : null;
  if (!clip || !partner) return 0;
  // A freeze frame plays no source over time: it is in sync when it starts with its partner.
  if (isMediaClip(clip) && isMediaClip(partner) && clip.mediaId === partner.mediaId && !isFreeze(clip) && !isFreeze(partner)) {
    const fps = project.settings.fps;
    // `|| 0`: no -0.
    return Math.round(sourceOrigin(clip, fps) - sourceOrigin(partner, fps)) || 0;
  }
  return clip.start - partner.start;
}

/**
 * The clips selected together with `clipId` (spec §6.7, §6.12): its group (selecting any member selects
 * the group) and, with `linked` (Linked selection on), its linked partners, and theirs, transitively.
 * Clips on locked tracks are left out; `clipId` itself is not in the result.
 */
export function selectionPartners(project: Project, clipId: ClipId, linked: boolean): ClipId[] {
  const start = project.clips[clipId];
  if (!start) return [];
  const groups = groupMembers(project);
  const links = linkGroups(project);
  const seen = new Set<ClipId>([clipId]);
  const queue: Clip[] = [start];
  for (let clip = queue.pop(); clip; clip = queue.pop()) {
    const ids = [...(clip.group !== undefined ? (groups.get(clip.group) ?? []) : []), ...(linked && clip.linkGroup !== undefined ? (links.get(clip.linkGroup) ?? []) : [])];
    for (const id of ids) {
      const other = project.clips[id];
      if (seen.has(id) || !other || isClipLocked(project, id)) continue;
      seen.add(id);
      queue.push(other);
    }
  }
  seen.delete(clipId);
  return [...seen];
}

// Groups (spec §6.12 `Mod+G`) by document version: the clip ids sharing each `group`.
const groupCache = new WeakMap<Project["clips"], Map<string, ClipId[]>>();

function groupMembers(project: Project): Map<string, ClipId[]> {
  let groups = groupCache.get(project.clips);
  if (!groups) {
    groups = new Map();
    for (const clip of Object.values(project.clips)) {
      if (clip.group === undefined) continue;
      const ids = groups.get(clip.group);
      if (ids) ids.push(clip.id);
      else groups.set(clip.group, [clip.id]);
    }
    groupCache.set(project.clips, groups);
  }
  return groups;
}

/** The members of the clip's group (the clip included), or just the clip when it has none. */
export function groupOf(project: Project, clipId: ClipId): ClipId[] {
  const group = project.clips[clipId]?.group;
  return group === undefined ? [clipId] : (groupMembers(project).get(group) ?? [clipId]);
}

/** The members of the clip's link group (the clip included), or just the clip when it has none. */
export function linkGroupOf(project: Project, clipId: ClipId): ClipId[] {
  const group = project.clips[clipId]?.linkGroup;
  return group === undefined ? [clipId] : (linkGroups(project).get(group) ?? [clipId]);
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
