// Timeline snapping (spec §6.9, BINDING). The candidates (clip edges on every track, locked ones
// included, markers, the in/out points and frame 0) live in one array sorted by frame. It is rebuilt
// lazily, on the first query after the clips, the markers or the in/out range changed, never per
// pointer move. A query is a binary search per dragged edge. The playhead is passed in at query time
// because it moves during playback, which would otherwise mean a rebuild per frame. Every gesture that
// snaps (clip moves and the Shift ruler scrub; trims from Batch 13) goes through `resolveSnap`.
// Keyframes (Batch 35): a clip drag also tests the keys on the dragged clip's lane (MoveGesture), and
// a keyframe drag snaps to the other keys of its lane, the playhead and its clip's edges through
// candidates of its own (`snapCandidatesOf`).
// TODO(batch 36): transition edges.
import type { ClipId, Frame, Marker, Project } from "../../core/document/types.js";

/** Candidate kinds in the §6.9 priority order: a tie in distance goes to the earlier kind. */
export const SNAP_KINDS = ["playhead", "clipStart", "clipEnd", "marker", "in", "out", "zero", "keyframe"] as const;
export type SnapKind = (typeof SNAP_KINDS)[number];

/** Priority rank per kind index (lower wins): clip starts and ends share one, as do in and out; keyframes rank with markers. */
const RANK: readonly number[] = [0, 1, 1, 2, 3, 3, 4, 2];
const PLAYHEAD = 0;
const CLIP_START = 1;
const CLIP_END = 2;
const MARKER = 3;
const IN = 4;
const OUT = 5;
const ZERO = 6;

/**
 * The sort keys pack (frame, kind, entry) into one float64: `(frame * 8 + kind) * ENTRY_SPACE +
 * entry`. A plain numeric sort of a Float64Array then orders by frame, then priority, with no
 * comparator calls. Integers stay exact below 2^53: frames below 2^29 (103 days at 60 fps).
 */
const ENTRY_SPACE = 2 ** 21;
const KIND_SPACE = 8;

/** Candidate frames, ascending (same-frame candidates in priority order). */
export interface SnapCandidates {
  readonly length: number;
  readonly frames: Float64Array;
  /** Index into `SNAP_KINDS`. */
  readonly kinds: Uint8Array;
  /** The clip id of a clip edge, the marker id of a marker, else null. */
  readonly refs: readonly (string | null)[];
}

/** One pass over clips and markers, then a numeric sort. */
export function buildSnapCandidates(project: Project, inPoint: Frame | null, outPoint: Frame | null): SnapCandidates {
  const { clips, markers } = project;
  const ids = Object.keys(clips);
  const count = 2 * ids.length + markers.length + (inPoint !== null ? 1 : 0) + (outPoint !== null ? 1 : 0) + 1;
  if (count > ENTRY_SPACE) throw new Error(`Snap index: ${count} candidates is over the ${ENTRY_SPACE} limit`);
  const keys = new Float64Array(count);
  const entries: (string | null)[] = new Array<string | null>(count);
  let n = 0;
  const add = (frame: Frame, kind: number, ref: string | null) => {
    keys[n] = (frame * KIND_SPACE + kind) * ENTRY_SPACE + n;
    entries[n] = ref;
    n += 1;
  };
  for (const id of ids) {
    const clip = clips[id];
    if (!clip) continue;
    add(clip.start, CLIP_START, id);
    add(clip.start + clip.duration, CLIP_END, id);
  }
  for (const marker of markers) add(marker.frame, MARKER, marker.id);
  if (inPoint !== null) add(inPoint, IN, null);
  if (outPoint !== null) add(outPoint, OUT, null);
  add(0, ZERO, null);

  const sorted = keys.subarray(0, n).sort();
  const frames = new Float64Array(n);
  const kinds = new Uint8Array(n);
  const refs: (string | null)[] = new Array<string | null>(n);
  for (let i = 0; i < n; i++) {
    const key = sorted[i] as number;
    const entry = key % ENTRY_SPACE;
    const rest = (key - entry) / ENTRY_SPACE;
    const kind = rest % KIND_SPACE;
    frames[i] = (rest - kind) / KIND_SPACE;
    kinds[i] = kind;
    refs[i] = entries[entry] ?? null;
  }
  return { length: n, frames, kinds, refs };
}

/** Candidates from a short list (a keyframe drag's: the lane's other keys, the clip's edges), sorted by frame then priority. */
export function snapCandidatesOf(entries: readonly { frame: Frame; kind: SnapKind; ref: string | null }[]): SnapCandidates {
  const sorted = [...entries].sort((a, b) => a.frame - b.frame || (RANK[SNAP_KINDS.indexOf(a.kind)] as number) - (RANK[SNAP_KINDS.indexOf(b.kind)] as number));
  return {
    length: sorted.length,
    frames: Float64Array.from(sorted, (entry) => entry.frame),
    kinds: Uint8Array.from(sorted, (entry) => SNAP_KINDS.indexOf(entry.kind)),
    refs: sorted.map((entry) => entry.ref),
  };
}

/** The candidates of the current document and in/out range, rebuilt only after they changed. */
export class SnapIndex {
  private cached: SnapCandidates | null = null;
  private clips: Project["clips"] | null = null;
  private markers: readonly Marker[] | null = null;
  private inPoint: Frame | null = null;
  private outPoint: Frame | null = null;
  /** Rebuilds so far (tests, dev stats). */
  rebuilds = 0;

  get(project: Project, inPoint: Frame | null, outPoint: Frame | null): SnapCandidates {
    // The document is immutable: a change to any clip or marker replaces these objects.
    if (this.cached && this.clips === project.clips && this.markers === project.markers && this.inPoint === inPoint && this.outPoint === outPoint) {
      return this.cached;
    }
    this.cached = buildSnapCandidates(project, inPoint, outPoint);
    this.clips = project.clips;
    this.markers = project.markers;
    this.inPoint = inPoint;
    this.outPoint = outPoint;
    this.rebuilds += 1;
    return this.cached;
  }
}

export interface SnapTarget {
  frame: Frame;
  kind: SnapKind;
  /** The clip id of a clip edge, the marker id of a marker, else null. */
  ref: string | null;
}

export interface SnapHit {
  target: SnapTarget;
  /** Which of the tested frames snapped (0 = the first, a block's leading edge). */
  edge: number;
  /** Frames to add to every tested frame so that the snapped one lands on the target. */
  offset: number;
  /** Screen distance from the tested frame to the target, in CSS px. */
  distancePx: number;
}

export interface SnapOptions {
  /** CSS px (spec §6.9: 8, in screen space so it does not depend on the zoom). */
  thresholdPx: number;
  pxPerFrame: number;
  /** Clips (or markers) that are no candidates, by id: the dragged ones. */
  exclude?: ReadonlySet<ClipId | Marker["id"]> | null;
  /** The playhead as a candidate; null or absent when the playhead is what moves. */
  playhead?: Frame | null;
}

/** Distances closer than this (CSS px) are equal: rounding of fractional frames never breaks a tie. */
const EPSILON_PX = 1e-6;

/** First index whose frame is >= `frame`. */
function lowerBound(frames: Float64Array, length: number, frame: number): number {
  let lo = 0;
  let hi = length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((frames[mid] as number) < frame) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * The snap for a dragged set of edges (`frames`, fractional, e.g. a block's leading and trailing
 * edge), or null when no candidate is within the threshold. Among the candidates within it the
 * smallest screen distance wins, then the §6.9 priority, then the earlier edge, then the lower frame.
 */
export function resolveSnap(candidates: SnapCandidates, frames: readonly number[], options: SnapOptions): SnapHit | null {
  const { thresholdPx, pxPerFrame, exclude, playhead } = options;
  if (!(pxPerFrame > 0) || !(thresholdPx >= 0)) return null;
  // The search window gets the same tolerance as the distance test: a pointer exactly at the
  // threshold may come out a hair past it in frames (62.666666666666686 for 60 + 8 px at 3 px/frame).
  const reach = (thresholdPx + EPSILON_PX) / pxPerFrame;
  let best: SnapHit | null = null;
  let bestRank = Infinity;
  const consider = (target: number, kind: number, ref: string | null, edge: number, frame: number) => {
    const distancePx = Math.abs(target - frame) * pxPerFrame;
    if (distancePx > thresholdPx + EPSILON_PX) return;
    const rank = RANK[kind] as number;
    if (best && (distancePx > best.distancePx + EPSILON_PX || (distancePx >= best.distancePx - EPSILON_PX && rank >= bestRank))) return;
    best = { target: { frame: target, kind: SNAP_KINDS[kind] as SnapKind, ref }, edge, offset: target - frame, distancePx };
    bestRank = rank;
  };
  const { frames: sorted, kinds, refs, length } = candidates;
  for (let edge = 0; edge < frames.length; edge++) {
    const frame = frames[edge] as number;
    if (playhead !== null && playhead !== undefined) consider(playhead, PLAYHEAD, null, edge, frame);
    for (let i = lowerBound(sorted, length, frame - reach); i < length && (sorted[i] as number) <= frame + reach; i++) {
      const ref = refs[i] ?? null;
      if (exclude && ref !== null && exclude.has(ref)) continue;
      consider(sorted[i] as number, kinds[i] as number, ref, edge, frame);
    }
  }
  return best;
}

/** The name shown next to the snap line (spec §6.9: "a small label with the target name"). */
export function snapLabel(project: Project, target: SnapTarget): string {
  switch (target.kind) {
    case "playhead":
      return "Playhead";
    case "clipStart":
    case "clipEnd": {
      const name = target.ref !== null ? project.clips[target.ref]?.name : undefined;
      const edge = target.kind === "clipStart" ? "Start" : "End";
      return name ? `${edge} of ${name}` : `Clip ${edge.toLowerCase()}`;
    }
    case "marker": {
      const marker = project.markers.find((candidate) => candidate.id === target.ref);
      return marker?.label ? `Marker: ${marker.label}` : "Marker";
    }
    case "in":
      return "In point";
    case "out":
      return "Out point";
    case "zero":
      return "Timeline start";
    case "keyframe":
      return "Keyframe";
  }
}
