// The in/out range (spec §5.3, §6.13): session state, two frame boundaries. `inPoint` is the first
// frame of the range; `outPoint` is the boundary after its last frame (exclusive end), so `O` at the
// playhead frame F stores F + 1 and the frame on screen stays in the range (Premiere), and the out
// point snaps and navigates like a clip end. A point set on the wrong side of the other clears the
// other (Premiere). `X` marks the clip under the playhead.
import type { Clip, ClipId, Frame, Project, Track } from "../../core/document/types.js";
import type { Selection } from "../../core/store/selection.js";
import { clipInIndex, clipsSpan, trackIndex, type Gap } from "./queries.js";

export interface InOut {
  inPoint: Frame | null;
  outPoint: Frame | null;
}

/** A span of frames [start, end). */
export interface FrameRange {
  start: Frame;
  end: Frame;
}

const NO_RANGE: InOut = { inPoint: null, outPoint: null };

/** `I`: the range starts at `frame`; an out point at or before it is cleared. */
export function markIn(range: InOut, frame: Frame): InOut {
  const inPoint = Math.max(0, Math.round(frame));
  return { inPoint, outPoint: range.outPoint !== null && range.outPoint <= inPoint ? null : range.outPoint };
}

/** `O`: the range ends with the frame at `frame` (out point `frame + 1`); an in point after that frame is cleared. */
export function markOut(range: InOut, frame: Frame): InOut {
  const outPoint = Math.max(0, Math.round(frame)) + 1;
  return { inPoint: range.inPoint !== null && range.inPoint >= outPoint ? null : range.inPoint, outPoint };
}

/** The frame `Shift+O` goes to: the last frame of the range. */
export function lastFrameOf(outPoint: Frame): Frame {
  return Math.max(0, outPoint - 1);
}

/** An in handle dragged to `frame`: at least 0, at most one frame before the out point. */
export function dragIn(range: InOut, frame: Frame): InOut {
  const max = range.outPoint !== null ? range.outPoint - 1 : Infinity;
  return { ...range, inPoint: Math.max(0, Math.min(Math.round(frame), max)) };
}

/** An out handle dragged to `frame`: at least one frame after the in point (and after frame 0). */
export function dragOut(range: InOut, frame: Frame): InOut {
  return { ...range, outPoint: Math.max(Math.round(frame), (range.inPoint ?? 0) + 1) };
}

/**
 * The span the range marks (spec §6.11 Lift/Extract, §6.13 play in to out): [in, out), the in point
 * defaulting to 0 and the out point to the content end. Null when neither is set or the span is empty.
 */
export function markedRange(range: InOut, contentEnd: Frame): FrameRange | null {
  if (range.inPoint === null && range.outPoint === null) return null;
  const start = range.inPoint ?? 0;
  const end = range.outPoint ?? contentEnd;
  return end > start ? { start, end } : null;
}

/** The in/out of a span (`X`, Set in/out to selection). */
export function rangeOf(span: FrameRange | null): InOut {
  return span ? { inPoint: span.start, outPoint: span.end } : NO_RANGE;
}

/**
 * The frames the selection covers (Zoom to selection, spec §6.2; Set in/out to selection, §6.16): the
 * selected clips (a track selection: the clips on those tracks), else the selected gap, else the two
 * clips of the selected edit point. Null when nothing is selected.
 */
export function selectionSpan(project: Project, selection: Selection, gap: Gap | null, editPoint: { left: ClipId; right: ClipId } | null): FrameRange | null {
  if (selection.kind === "clips") return clipsSpan(project, selection.clipIds);
  if (selection.kind === "track") {
    const tracks = project.tracks.filter((track) => selection.trackIds?.has(track.id));
    if (tracks.length > 0) return clipsSpan(project, tracks.flatMap((track) => track.clipIds));
  }
  if (gap) return { start: gap.start, end: gap.end };
  return editPoint ? clipsSpan(project, [editPoint.left, editPoint.right]) : null;
}

/** Tracks as they stack on screen, top to bottom: the caption track and video tracks (highest first), then audio tracks. */
export function tracksTopDown(project: Project): Track[] {
  const upper = project.tracks.filter((track) => track.kind !== "audio").reverse();
  return [...upper, ...project.tracks.filter((track) => track.kind === "audio")];
}

/**
 * `X` (spec §6.13): the clip under `frame` whose bounds become the range. A selected clip there comes
 * first (the primary, then the topmost), then the topmost clip there on a targeted track, then the
 * topmost on any track. Null when no clip is under the frame.
 */
export function clipToMark(project: Project, frame: Frame, selected: ReadonlySet<ClipId> = new Set(), primary: ClipId | null = null): Clip | null {
  const under: { clip: Clip; targeted: boolean }[] = [];
  for (const track of tracksTopDown(project)) {
    const clip = clipInIndex(trackIndex(project, track), frame);
    if (clip) under.push({ clip, targeted: track.targeted });
  }
  const primaryClip = primary !== null ? under.find((entry) => entry.clip.id === primary) : undefined;
  return (primaryClip ?? under.find((entry) => selected.has(entry.clip.id)) ?? under.find((entry) => entry.targeted) ?? under[0])?.clip ?? null;
}
