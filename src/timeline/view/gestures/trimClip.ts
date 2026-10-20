// The edit drags of spec §6.10 (P2): an ephemeral object owned by the timeline view. It turns the
// pointer position and the held modifiers into a proposed edit (the document the drop would leave, the
// frame or frames the preview shows, the rows the overlay redraws); the document is untouched until
// the drop, which becomes one TrimRequest and so one command.
// - trim: an edge follows the pointer; Mod (or Ripple mode) ripples, Alt trims without the partners;
// - roll (Mod+Alt on a cut): the cut follows the pointer; the partners' cut rolls with it;
// - stretch (Rate stretch tool): an edge follows the pointer and the speed changes;
// - slide (Slide tool): the clip follows the pointer, its neighbors trim;
// - slip (Slip tool): the content moves with the pointer under the clip (dragging right shows earlier
//   frames, as in Premiere).
// Alt edits one side of a link (except a roll, which Mod+Alt starts). The dragged edge (a slide: both
// edges) snaps (spec §6.9) to every candidate but the clips the edit moves.
import type { Clip, ClipId, Frame, Project, TrackId } from "../../../core/document/types.js";
import { applyTrim, edgeFrame, planEdit, resolveTrim, type EditKind, type EditSpec, type TrimEdge, type TrimPlan, type TrimResult } from "../../edit/trim.js";
import { resolveSnap, type SnapTarget } from "../../snap/snapIndex.js";
import type { DragModifiers, MoveSnap } from "./moveClips.js";

/** The session toggles an edit reads (spec §6.1): Ripple mode and Linked selection. */
export interface TrimToggles {
  ripple: boolean;
  linkedSelection: boolean;
}

/** Frames [from, to) of a track whose clips the overlay redraws from the proposed document. */
export interface RepaintSpan {
  from: Frame;
  to: Frame;
}

/**
 * Two frames the preview shows side by side (spec §6.10): a roll's both sides (the left clip's last
 * frame, the right clip's first), a slip's new first and last frames, a slide's neighbors' new edges.
 */
export interface PreviewSplit {
  leftFrame: Frame;
  rightFrame: Frame;
}

export interface TrimProposal {
  result: TrimResult;
  ripple: boolean;
  /** Linked partners take the edit too (Linked selection on and, but for a roll, no Alt). */
  linked: boolean;
  /** What the dragged edge snapped to, or null. */
  snap: SnapTarget | null;
  /** The document the drop would leave. */
  project: Project;
  /** The dragged clip after the edit. */
  clip: Clip;
  /** The frame the preview shows (spec §6.10): the new edge frame, the first included (in) or the last (out). */
  previewFrame: Frame;
  /** Rolls, slips and slides show two frames instead. */
  previewSplit: PreviewSplit | null;
  /** Per track, the frames whose clips change (the edited clips' old and new extents, a ripple's shifted clips). */
  repaint: ReadonlyMap<TrackId, RepaintSpan>;
}

/** An edit as the gesture ends it; the controller replays it on the current document as one command. */
export interface TrimRequest extends EditSpec {
  deltaFrames: number;
}

/** What a press starts: the edit, the dragged clip and edge, and a roll's clip right of the cut. */
export interface EditTarget {
  kind: EditKind;
  clipId: ClipId;
  edge: TrimEdge;
  rightId?: ClipId | null;
}

export class TrimGesture {
  readonly clip: Clip;
  readonly kind: EditKind;
  readonly edge: TrimEdge;
  readonly rightId: ClipId | null;
  private readonly plans = new Map<string, TrimPlan>();
  private current: TrimProposal | null = null;
  private currentKey = "";

  /** `startFrame`: the fractional frame under the pointer when it went down. */
  constructor(
    readonly project: Project,
    target: EditTarget,
    private readonly startFrame: number,
  ) {
    const clip = project.clips[target.clipId];
    if (!clip) throw new Error(`TrimGesture: clip ${target.clipId} does not exist`);
    this.clip = clip;
    this.kind = target.kind;
    this.edge = target.edge;
    this.rightId = target.rightId ?? null;
  }

  get proposal(): TrimProposal | null {
    return this.current;
  }

  private spec(ripple: boolean, linked: boolean): EditSpec {
    return { kind: this.kind, clipId: this.clip.id, edge: this.edge, rightId: this.rightId, ripple, linked };
  }

  /** One plan per (ripple, linked): the limits and the moved clips do not depend on the delta. */
  private plan(ripple: boolean, linked: boolean): TrimPlan {
    const key = `${ripple}|${linked}`;
    let plan = this.plans.get(key);
    if (!plan) {
      plan = planEdit(this.project, this.spec(ripple, linked));
      this.plans.set(key, plan);
    }
    return plan;
  }

  /**
   * The proposal for a pointer over `pointerFrame` (fractional). The dragged edge (or clip, or source)
   * follows the pointer by the frames it moved since the press, snaps within the threshold, then the
   * edit's limits clamp it; a snap the limits do not reach does not hold. Recomputed only when the
   * outcome changes.
   */
  update(pointerFrame: number, modifiers: DragModifiers, toggles: TrimToggles, snap: MoveSnap | null = null): TrimProposal {
    const ripple = this.kind === "trim" && (toggles.ripple || modifiers.mod);
    const linked = toggles.linkedSelection && (this.kind === "roll" || !modifiers.alt);
    const plan = this.plan(ripple, linked);
    const moved = pointerFrame - this.startFrame;
    let hit = null;
    let requested: number;
    if (this.kind === "slip") {
      // The content moves with the pointer: dragging right brings earlier source frames in.
      requested = Math.round(-moved);
    } else {
      // A slide drags the clip (both edges snap); the others drag one edge (a roll: the cut).
      const origin = this.kind === "slide" ? this.clip.start : edgeFrame(this.clip, this.edge);
      const raw = origin + moved;
      const edges = this.kind === "slide" ? [raw, raw + this.clip.duration] : [raw];
      hit = snap ? resolveSnap(snap.candidates, edges, { thresholdPx: snap.thresholdPx, pxPerFrame: snap.pxPerFrame, playhead: snap.playhead, exclude: plan.moving }) : null;
      requested = Math.round(hit ? raw + hit.offset : raw) - origin;
    }
    const result = resolveTrim(plan, requested);
    if (result.delta !== requested) hit = null;
    const target = hit?.target ?? null;
    const snapKey = target ? `${target.kind}:${target.frame}:${target.ref ?? ""}` : "";
    const key = `${result.delta}|${ripple}|${linked}|${snapKey}|${result.limit?.reason ?? ""}`;
    if (this.current && key === this.currentKey) return this.current;
    this.currentKey = key;
    this.current = this.propose(result, ripple, linked, target);
    return this.current;
  }

  /** The drop as a request (null before the first update or when nothing changes). */
  request(): TrimRequest | null {
    const proposal = this.current;
    if (!proposal || proposal.result.delta === 0) return null;
    return { ...this.spec(proposal.ripple, proposal.linked), deltaFrames: proposal.result.delta };
  }

  private propose(result: TrimResult, ripple: boolean, linked: boolean, snap: SnapTarget | null): TrimProposal {
    const project = applyTrim(this.project, result);
    const clip = project.clips[this.clip.id] ?? this.clip;
    const first = clip.start;
    const last = clip.start + clip.duration - 1;
    let previewFrame = this.edge === "in" ? first : last;
    let previewSplit: PreviewSplit | null = null;
    if (this.kind === "roll") previewSplit = { leftFrame: last, rightFrame: last + 1 };
    else if (this.kind === "slip") previewSplit = { leftFrame: first, rightFrame: last };
    // The neighbors' new edges: the left one's last frame, the right one's first.
    else if (this.kind === "slide") previewSplit = { leftFrame: first - 1, rightFrame: last + 1 };
    if (previewSplit) previewFrame = previewSplit.leftFrame;
    return { result, ripple, linked, snap, project, clip, previewFrame, previewSplit, repaint: repaintSpans(result) };
  }
}

/** The frames per track where the edit changes what the timeline shows. */
function repaintSpans(result: TrimResult): Map<TrackId, RepaintSpan> {
  const spans = new Map<TrackId, RepaintSpan>();
  if (result.delta === 0) return spans;
  const add = (trackId: TrackId, from: Frame, to: Frame) => {
    const span = spans.get(trackId);
    spans.set(trackId, span ? { from: Math.min(span.from, from), to: Math.max(span.to, to) } : { from, to });
  };
  for (const clip of result.plan.trimmed) {
    const next = result.changes.get(clip.id) ?? clip;
    add(clip.trackId, Math.min(clip.start, next.start), Math.max(clip.start + clip.duration, next.start + next.duration));
  }
  for (const [trackId, first] of result.plan.firstShifted) add(trackId, Math.min(first, first + result.shift), Infinity);
  return spans;
}
