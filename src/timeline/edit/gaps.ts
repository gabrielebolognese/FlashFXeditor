// Closing gaps (spec §6.11, §6.19, P2): the pure edit behind Close gap (`G`, `Delete` on a selected
// gap), Close all gaps / Compact (`Shift+G`) and the ripple of Ripple delete. Ripple semantics: the
// clips after a gap move left by its length.
// - Each track with gaps to close (a source track) closes its own gaps, each by its own length, so
//   two tracks with different gaps close them independently.
// - The other unlocked tracks (passive tracks) move with the ripple, keeping their content in sync
//   with what moved: gaps overlapping in time on several tracks form a cluster, and the clips of a
//   passive track starting at or after a cluster's end move left by the cluster's amount (the most
//   any one source track closes in it).
// - A passive clip that would collide (one spanning the cluster's end, with another after it, or
//   one inside the cluster) limits the cluster to the largest safe amount; its gaps then close
//   that far only, left to right, and the limit is reported (the toast names the track).
// - Locked tracks neither move nor limit. Nothing is ever trimmed, split or reordered.
// One sweep per track computes the new starts, one pass over the clusters checks the passive tracks,
// and one command commits it (never a loop of close-gap commands), so 500 clips compact at once.
import type { Command } from "../../core/commands/command.js";
import type { Clip, ClipId, Frame, Project, TrackId } from "../../core/document/types.js";
import { clipInIndex, gapAt, lastClipStartingBy, trackGaps, trackIndex, type Gap } from "../model/queries.js";

/** The passive clip that stopped a gap from closing fully, and its track. */
export interface GapLimit {
  trackId: TrackId;
  clipId: ClipId;
}

export interface CloseResult {
  /** One undo step, or null when nothing changes. */
  command: Command | null;
  /** Frames each given gap closes, in input order (0 for gaps on locked or unknown tracks). */
  closed: readonly number[];
  /** The first collision that limited a gap, or null when every gap closed fully. */
  limit: GapLimit | null;
  /** The new start of every clip that moves. */
  starts: ReadonlyMap<ClipId, Frame>;
  /** The clips the command removes (ripple delete). */
  removed: ReadonlySet<ClipId>;
}

export interface CloseOptions {
  /**
   * Clips removed by the same edit (ripple delete): they are gone before the gaps close, and the
   * gaps given are their spans.
   */
  removed?: ReadonlySet<ClipId>;
  /** Command id and undo label. */
  id?: string;
  label?: string;
}

interface Cluster {
  start: Frame;
  end: Frame;
  /** Gap length per source track inside the cluster. */
  perTrack: Map<TrackId, number>;
  /** Frames the cluster closes (the largest per-track length, then limited by collisions). */
  amount: number;
}

interface Entry {
  gap: Gap;
  /** Position in the input. */
  input: number;
  cluster: Cluster;
}

const NO_CLIPS: ReadonlySet<ClipId> = new Set();

/** Index of the first value >= `value` in sorted `values`. */
function firstAtOrAfter(values: readonly number[], value: number): number {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((values[mid] as number) < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Closes `gaps` with ripple semantics (see the module comment) as one command. Each gap must be empty
 * on its track once `removed` clips are gone. Gaps on locked tracks, unknown tracks or of no length are
 * ignored.
 */
export function closeGaps(project: Project, gaps: readonly Gap[], options: CloseOptions = {}): CloseResult {
  const removed = options.removed ?? NO_CLIPS;
  const tracks = new Map(project.tracks.map((track) => [track.id, track]));
  const kept = (trackId: TrackId): readonly Clip[] => {
    const track = tracks.get(trackId);
    if (!track) return [];
    const clips = trackIndex(project, track).clips;
    return removed.size === 0 ? clips : clips.filter((clip) => !removed.has(clip.id));
  };

  // Clusters: the gaps overlapping in time, across tracks, sorted by start (and so by end).
  const valid: { gap: Gap; input: number }[] = [];
  gaps.forEach((gap, input) => {
    const track = tracks.get(gap.trackId);
    if (track && !track.locked && gap.end > gap.start) valid.push({ gap, input });
  });
  valid.sort((a, b) => a.gap.start - b.gap.start || a.gap.end - b.gap.end);
  const clusters: Cluster[] = [];
  const entries: Entry[] = valid.map(({ gap, input }) => {
    let cluster = clusters[clusters.length - 1];
    if (!cluster || gap.start >= cluster.end) {
      cluster = { start: gap.start, end: gap.end, perTrack: new Map(), amount: 0 };
      clusters.push(cluster);
    }
    cluster.end = Math.max(cluster.end, gap.end);
    cluster.perTrack.set(gap.trackId, (cluster.perTrack.get(gap.trackId) ?? 0) + gap.end - gap.start);
    return { gap, input, cluster };
  });
  for (const cluster of clusters) cluster.amount = Math.max(...cluster.perTrack.values());

  // Passive tracks: for each cluster, the first clip at or after its end moves by the cluster's
  // amount more than the clip before it. The free space between the two bounds the clusters ending
  // between their starts (they share it, earliest first).
  const sources = new Set(entries.map((entry) => entry.gap.trackId));
  const passive = project.tracks.filter((track) => !track.locked && !sources.has(track.id)).map((track) => kept(track.id));
  let limit: GapLimit | null = null;
  if (passive.length > 0 && clusters.length > 0) {
    const lanes = passive.map((clips) => ({ clips, starts: clips.map((clip) => clip.start), used: new Map<number, number>() }));
    const next = new Array<number>(lanes.length);
    for (const cluster of clusters) {
      let amount = cluster.amount;
      let blocker: GapLimit | null = null;
      for (let i = 0; i < lanes.length; i++) {
        const lane = lanes[i] as (typeof lanes)[number];
        const q = firstAtOrAfter(lane.starts, cluster.end);
        next[i] = q;
        const after = lane.clips[q];
        if (!after) continue;
        const before = lane.clips[q - 1];
        const room = after.start - (before ? before.start + before.duration : 0) - (lane.used.get(q) ?? 0);
        if (room < amount) {
          amount = Math.max(0, room);
          blocker = { trackId: after.trackId, clipId: after.id };
        }
      }
      if (amount < cluster.amount) {
        cluster.amount = amount;
        limit ??= blocker;
      }
      for (let i = 0; i < lanes.length; i++) {
        const lane = lanes[i] as (typeof lanes)[number];
        const q = next[i] as number;
        if (q < lane.clips.length) lane.used.set(q, (lane.used.get(q) ?? 0) + amount);
      }
    }
  }

  // Source tracks: each gap closes up to what its cluster's amount leaves for its track, left to
  // right; the clips after it move by everything closed before them.
  const closed = new Array<number>(gaps.length).fill(0);
  const starts = new Map<ClipId, Frame>();
  const byTrack = new Map<TrackId, Entry[]>();
  for (const entry of entries) {
    const list = byTrack.get(entry.gap.trackId);
    if (list) list.push(entry);
    else byTrack.set(entry.gap.trackId, [entry]);
  }
  for (const [trackId, list] of byTrack) {
    const budget = new Map<Cluster, number>();
    const ends: Frame[] = [];
    const shifts: number[] = [];
    let total = 0;
    for (const entry of list) {
      const left = budget.get(entry.cluster) ?? entry.cluster.amount;
      const amount = Math.min(entry.gap.end - entry.gap.start, left);
      budget.set(entry.cluster, left - amount);
      closed[entry.input] = amount;
      total += amount;
      ends.push(entry.gap.end);
      shifts.push(total);
    }
    let g = 0;
    let shift = 0;
    for (const clip of kept(trackId)) {
      while (g < ends.length && (ends[g] as number) <= clip.start) shift = shifts[g++] as number;
      if (shift > 0) starts.set(clip.id, clip.start - shift);
    }
  }
  // Passive tracks: by the clusters ending at or before each clip's start.
  for (const clips of passive) {
    let k = 0;
    let shift = 0;
    for (const clip of clips) {
      while (k < clusters.length && (clusters[k] as Cluster).end <= clip.start) shift += (clusters[k++] as Cluster).amount;
      if (shift > 0) starts.set(clip.id, clip.start - shift);
    }
  }

  const gone = new Set([...removed].filter((id) => project.clips[id] !== undefined));
  const command = starts.size > 0 || gone.size > 0 ? closeCommand(options.id ?? "gap.close", options.label ?? "Close gap", starts, gone, project) : null;
  return { command, closed, limit, starts, removed: gone };
}

/** Removes `gone`, then moves clips to their new starts (the order on each track stays). */
function closeCommand(id: string, label: string, starts: ReadonlyMap<ClipId, Frame>, gone: ReadonlySet<ClipId>, project: Project): Command {
  const moves = [...starts];
  const removed = [...gone];
  const tracksWithRemovals = new Set(removed.map((clipId) => (project.clips[clipId] as Clip).trackId));
  return {
    id,
    label,
    affects: ["clips", "timeline"],
    run(draft) {
      for (const track of draft.tracks) if (tracksWithRemovals.has(track.id)) track.clipIds = track.clipIds.filter((clipId) => !gone.has(clipId));
      for (const clipId of removed) delete draft.clips[clipId];
      for (const [clipId, start] of moves) {
        const clip = draft.clips[clipId];
        if (!clip) throw new Error(`${id}: clip ${clipId} does not exist`);
        clip.start = start;
      }
    },
  };
}

/** Close gap (spec §6.11): one gap, if it still is one (same track, start and end). */
export function closeGap(project: Project, gap: Gap): CloseResult {
  const current = gapAt(project, gap.trackId, gap.start);
  const valid = current !== null && current.start === gap.start && current.end === gap.end;
  return closeGaps(project, valid ? [gap] : [], { id: "gap.close", label: "Close gap" });
}

/**
 * `G` with no gap selected (spec §6.11): on each targeted unlocked track, the gap under the playhead,
 * or the gap right after the clip under it; of those, the one that ends first (the next one to close
 * as the playhead moves on), the lowest track on a tie. Null when there is none.
 */
export function gapAtPlayhead(project: Project, playhead: Frame): Gap | null {
  let best: Gap | null = null;
  for (const track of project.tracks) {
    if (track.locked || !track.targeted) continue;
    let gap = gapAt(project, track.id, playhead);
    if (!gap) {
      const index = trackIndex(project, track);
      const clip = clipInIndex(index, playhead);
      const next = clip ? index.clips[lastClipStartingBy(index, clip.start) + 1] : undefined;
      if (clip && next && next.start > clip.start + clip.duration) gap = { trackId: track.id, start: clip.start + clip.duration, end: next.start };
    }
    if (gap && (!best || gap.end < best.end)) best = gap;
  }
  return best;
}

/**
 * Close all gaps / Compact (spec §6.11, `Shift+G`): every gap on `trackIds` (default: the targeted
 * unlocked tracks), from frame 0 to each track's last clip, closed left to right in one command.
 * TODO(batch 16): the selected tracks first, once tracks can be selected.
 */
export function compactGaps(project: Project, trackIds?: readonly TrackId[], options: { label?: string } = {}): CloseResult {
  const ids = trackIds ?? project.tracks.filter((track) => track.targeted && !track.locked).map((track) => track.id);
  const gaps: Gap[] = [];
  for (const trackId of ids) gaps.push(...trackGaps(project, trackId));
  return closeGaps(project, gaps, { id: "gap.closeAll", label: options.label ?? "Close all gaps" });
}
