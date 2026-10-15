// The trim drag (spec §6.10, P2): an ephemeral object owned by the timeline view. It turns the pointer
// position and the held modifiers into a proposed trim (the document the drop would leave, the frame
// the preview shows, the rows the overlay redraws); the document is untouched until the drop, which
// becomes one TrimRequest and so one command. Mod (or Ripple mode) ripples, Alt trims the dragged clip
// without its linked partners. The dragged edge snaps (spec §6.9) to every candidate but the clips
// the trim moves.
import type { Clip, ClipId, Frame, Project, TrackId } from "../../../core/document/types.js";
import { applyTrim, edgeFrame, planTrim, resolveTrim, type TrimEdge, type TrimPlan, type TrimResult } from "../../edit/trim.js";
import { resolveSnap, type SnapTarget } from "../../snap/snapIndex.js";
import type { DragModifiers, MoveSnap } from "./moveClips.js";

/** The session toggles a trim reads (spec §6.1): Ripple mode and Linked selection. */
export interface TrimToggles {
  ripple: boolean;
  linkedSelection: boolean;
}

/** Frames [from, to) of a track whose clips the overlay redraws from the proposed document. */
export interface RepaintSpan {
  from: Frame;
  to: Frame;
}

export interface TrimProposal {
  result: TrimResult;
  ripple: boolean;
  /** Linked partners trim too (no Alt, Linked selection on). */
  linked: boolean;
  /** What the dragged edge snapped to, or null. */
  snap: SnapTarget | null;
  /** The document the drop would leave. */
  project: Project;
  /** The dragged clip after the trim. */
  clip: Clip;
  /** The new edge frame the preview shows (spec §6.10): the first included frame (in), the last (out). */
  previewFrame: Frame;
  /** Per track, the frames whose clips change (the trimmed clips' old and new extents, a ripple's shifted clips). */
  repaint: ReadonlyMap<TrackId, RepaintSpan>;
}

/** A trim as the gesture ends it; the controller turns it into the command. */
export interface TrimRequest {
  clipId: ClipId;
  edge: TrimEdge;
  deltaFrames: number;
  ripple: boolean;
  linked: boolean;
}

export class TrimGesture {
  readonly clip: Clip;
  private readonly plans = new Map<string, TrimPlan>();
  private current: TrimProposal | null = null;
  private currentKey = "";

  /** `startFrame`: the fractional frame under the pointer when it went down on the edge. */
  constructor(
    readonly project: Project,
    clipId: ClipId,
    readonly edge: TrimEdge,
    private readonly startFrame: number,
  ) {
    const clip = project.clips[clipId];
    if (!clip) throw new Error(`TrimGesture: clip ${clipId} does not exist`);
    this.clip = clip;
  }

  get proposal(): TrimProposal | null {
    return this.current;
  }

  /** One plan per (ripple, linked): the limits and the moved clips do not depend on the delta. */
  private plan(ripple: boolean, linked: boolean): TrimPlan {
    const key = `${ripple}|${linked}`;
    let plan = this.plans.get(key);
    if (!plan) {
      plan = planTrim(this.project, [this.clip.id], this.edge, { ripple, linked });
      this.plans.set(key, plan);
    }
    return plan;
  }

  /**
   * The proposal for a pointer over `pointerFrame` (fractional). The edge follows the pointer by the
   * frames it moved since the press, snaps within the threshold, then the trim's limits clamp it; a
   * snap the limits do not reach does not hold. Recomputed only when the outcome changes.
   */
  update(pointerFrame: number, modifiers: DragModifiers, toggles: TrimToggles, snap: MoveSnap | null = null): TrimProposal {
    const ripple = toggles.ripple || modifiers.mod;
    const linked = toggles.linkedSelection && !modifiers.alt;
    const plan = this.plan(ripple, linked);
    const origin = edgeFrame(this.clip, this.edge);
    const raw = origin + pointerFrame - this.startFrame;
    let hit = snap
      ? resolveSnap(snap.candidates, [raw], { thresholdPx: snap.thresholdPx, pxPerFrame: snap.pxPerFrame, playhead: snap.playhead, exclude: plan.moving })
      : null;
    const requested = Math.round(hit ? hit.target.frame : raw) - origin;
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
    return { clipId: this.clip.id, edge: this.edge, deltaFrames: proposal.result.delta, ripple: proposal.ripple, linked: proposal.linked };
  }

  private propose(result: TrimResult, ripple: boolean, linked: boolean, snap: SnapTarget | null): TrimProposal {
    const project = applyTrim(this.project, result);
    const clip = project.clips[this.clip.id] ?? this.clip;
    const previewFrame = this.edge === "in" ? clip.start : clip.start + clip.duration - 1;
    return { result, ripple, linked, snap, project, clip, previewFrame, repaint: repaintSpans(result) };
  }
}

/** The frames per track where the trim changes what the timeline shows. */
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
