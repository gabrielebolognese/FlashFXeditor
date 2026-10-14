// Timeline queries (spec §3.2, P10). Per-track indexes (start-sorted clips, longest clip, track end)
// are built lazily and cached per document version, so lookups are binary searches.
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
    index = { clips, starts: clips.map((clip) => clip.start), maxDuration, end };
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
