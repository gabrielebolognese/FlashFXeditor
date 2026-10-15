// Closing gaps (spec §6.11, §6.19, P2): the pure edit behind Close gap (`G`, `Delete` on a selected
// gap), Close all gaps / Compact (`Shift+G`) and the ripple of Ripple delete. Ripple semantics: the
// clips after a gap move left by its length.
// - Each track with gaps to close (a source track) closes its own gaps, each by its own length, so
//   two tracks with different gaps close them independently.
// - The other unlocked tracks (passive tracks) move with the ripple, keeping their content in sync
//   with what moved: a passive clip moves left by the most any one source track has closed before
//   its start (in the gaps ending at or before it). Gaps on different tracks apart in time do not
//   add up: a passive clip never moves more than the source content beside it.
// - A passive clip that would collide (it would move more than the clip before it plus the free
//   space between them: one spanning a gap's end, or one inside a gap, with another after it) limits
//   the gaps ending before it to the largest safe amount; they then close that far only, left to
//   right, and the limit is reported (the toast names the track).
// - Locked tracks neither move nor limit. Nothing is ever trimmed, split or reordered.
// One sweep over the gaps by end (each passive track's clips walked once alongside it) gives the
// closed amounts and the passive shifts, one pass per source track its new starts, and one command
// commits it (never a loop of close-gap commands), so 500 clips compact at once.
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
  /**
   * More source tracks: tracks that close their own gaps only, so they never follow the ripple, even
   * when they have no gap to close (Compact on the given tracks, spec §6.11).
   */
  sources?: readonly TrackId[];
  /** Command id and undo label. */
  id?: string;
  label?: string;
}

/** A passive track as the sweep walks it: the clips before `next` have their shift. */
interface Lane {
  clips: readonly Clip[];
  /** The first clip starting at or after the sweep's position. */
  next: number;
  /** Shift and end of the clip before `next` (0 and frame 0 before the first clip). */
  shift: number;
  end: Frame;
}

/** Closed amounts of one source track in sweep order: after `ends[i]`, its clips move `shifts[i]`. */
interface Steps {
  ends: Frame[];
  shifts: number[];
}

const NO_CLIPS: ReadonlySet<ClipId> = new Set();

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

  // By end: a gap moves the clips starting at or after its end.
  const valid: { gap: Gap; input: number }[] = [];
  gaps.forEach((gap, input) => {
    const track = tracks.get(gap.trackId);
    if (track && !track.locked && gap.end > gap.start) valid.push({ gap, input });
  });
  valid.sort((a, b) => a.gap.end - b.gap.end || a.gap.start - b.gap.start);

  const sources = new Set([...valid.map((entry) => entry.gap.trackId), ...(options.sources ?? [])]);
  const lanes: Lane[] = project.tracks.filter((track) => !track.locked && !sources.has(track.id)).map((track) => ({ clips: kept(track.id), next: 0, shift: 0, end: 0 }));
  const starts = new Map<ClipId, Frame>();
  /** Moves a lane's clips starting before `frame` by `shift` (what was closed at or before their starts). */
  const settle = (lane: Lane, frame: Frame, shift: number): void => {
    for (let clip = lane.clips[lane.next]; clip && clip.start < frame; clip = lane.clips[++lane.next]) {
      if (shift > 0) starts.set(clip.id, clip.start - shift);
      lane.shift = shift;
      lane.end = clip.start + clip.duration;
    }
  };

  // The sweep. `moved` is the most any source track has closed so far: the shift of a passive clip
  // starting here. The first passive clip after a gap may move at most its free space more than the
  // clip before it, which caps every source track's total there.
  const closed = new Array<number>(gaps.length).fill(0);
  const steps = new Map<TrackId, Steps>();
  let moved = 0;
  let limit: GapLimit | null = null;
  for (const { gap, input } of valid) {
    let cap = Infinity;
    let blocker: GapLimit | null = null;
    for (const lane of lanes) {
      settle(lane, gap.end, moved);
      const after = lane.clips[lane.next];
      if (!after) continue;
      const room = lane.shift + after.start - lane.end;
      if (room < cap) {
        cap = room;
        blocker = { trackId: after.trackId, clipId: after.id };
      }
    }
    let step = steps.get(gap.trackId);
    if (!step) {
      step = { ends: [], shifts: [] };
      steps.set(gap.trackId, step);
    }
    const total = step.shifts[step.shifts.length - 1] ?? 0;
    const amount = Math.max(0, Math.min(gap.end - gap.start, cap - total));
    if (amount < gap.end - gap.start) limit ??= blocker;
    closed[input] = amount;
    step.ends.push(gap.end);
    step.shifts.push(total + amount);
    moved = Math.max(moved, total + amount);
  }
  for (const lane of lanes) settle(lane, Infinity, moved);

  // Source tracks: the clips after each gap move by everything their track closed before them.
  for (const [trackId, { ends, shifts }] of steps) {
    let g = 0;
    let shift = 0;
    for (const clip of kept(trackId)) {
      while (g < ends.length && (ends[g] as number) <= clip.start) shift = shifts[g++] as number;
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
 * Close all gaps / Compact (spec §6.11, `Shift+G`): every gap on `trackIds` (the selected tracks; by
 * default the targeted unlocked tracks), from frame 0 to each track's last clip, closed left to right in
 * one command. Each of those tracks closes its own gaps: one with no gap stays as it is (it neither
 * follows nor limits the others); the other unlocked tracks follow the ripple.
 */
export function compactGaps(project: Project, trackIds?: readonly TrackId[], options: { label?: string } = {}): CloseResult {
  const ids = trackIds ?? project.tracks.filter((track) => track.targeted && !track.locked).map((track) => track.id);
  const gaps: Gap[] = [];
  for (const trackId of ids) gaps.push(...trackGaps(project, trackId));
  return closeGaps(project, gaps, { id: "gap.closeAll", label: options.label ?? "Close all gaps", sources: ids });
}
