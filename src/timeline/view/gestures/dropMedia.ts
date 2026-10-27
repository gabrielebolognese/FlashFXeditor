// A media drag over the timeline (spec §6.14, P2): an ephemeral object owned by the timeline view
// while media from the Media panel (or files from the OS) are dragged over it. It turns the pointer
// frame, the lanes under it and the held modifiers into a proposal shaped like a clip move's (ghosts
// at the clips' natural durations with the linked audio, new track rows, overwritten regions, the
// insert line, a refusal), so the overlay draws it the same way; the document is untouched until the
// drop, which becomes one MediaDropRequest. Files from the OS have no duration before their import:
// their proposal is the insert line at the drop frame alone.
import type { Frame, Project } from "../../../core/document/types.js";
import { blockLength, requestItem, stageDrop, type DropItem, type DropLanes, type MediaDropRequest } from "../../edit/dropMedia.js";
import { overwrittenSpans, type MoveMode, type MoveRefusal } from "../../edit/move.js";
import { trackIndex } from "../../model/queries.js";
import { resolveSnap, type SnapTarget } from "../../snap/snapIndex.js";
import { newLanes, type DragModifiers, type Ghost, type MoveProposal, type MoveSnap } from "./moveClips.js";

export class MediaDropGesture {
  /** Timeline length of the dragged items back to back (0 for OS files). */
  readonly length: Frame;
  private current: MoveProposal | null = null;
  private currentKey = "";
  private start: Frame | null = null;
  private lanes: DropLanes = { video: 0, audio: 0 };

  /** `items`: the media in drop order; empty for files dragged from the OS. */
  constructor(
    readonly project: Project,
    readonly items: readonly DropItem[],
  ) {
    this.length = blockLength(items, project);
  }

  get proposal(): MoveProposal | null {
    return this.current;
  }

  /** The block's first frame at the current position, or null before the first update. */
  get startFrame(): Frame | null {
    return this.start;
  }

  /**
   * The proposal for a pointer over `pointerFrame` (fractional) on `lanes`: the block starts at the
   * pointer (spec §6.14 "starting at the snapped cursor frame"); with `snap`, its leading or trailing
   * edge (whichever is closer) lands on a candidate within the threshold. Mod inserts. Recomputed
   * only when the outcome changes.
   */
  update(pointerFrame: number, lanes: DropLanes, modifiers: DragModifiers, snap: MoveSnap | null = null): MoveProposal {
    const raw = Math.max(0, pointerFrame);
    const edges = this.length > 0 ? [raw, raw + this.length] : [raw];
    let hit = snap ? resolveSnap(snap.candidates, edges, { thresholdPx: snap.thresholdPx, pxPerFrame: snap.pxPerFrame, playhead: snap.playhead }) : null;
    let start = Math.round(hit ? raw + hit.offset : raw);
    // Frame 0 bounds the block; a trailing edge's snap that would pass it does not count.
    if (start < 0) {
      start = 0;
      hit = null;
    }
    const target = hit?.target ?? null;
    const mode: MoveMode = modifiers.mod ? "insert" : "overwrite";
    const snapKey = target ? `${target.kind}:${target.frame}:${target.ref ?? ""}` : "";
    const key = `${start}|${lanes.video}|${lanes.audio}|${mode}|${snapKey}`;
    this.start = start;
    this.lanes = { video: lanes.video, audio: lanes.audio };
    if (this.current && key === this.currentKey) return this.current;
    this.currentKey = key;
    this.current = this.propose(start, mode, target);
    return this.current;
  }

  /** The drop as a request for the controller (null before the first update). */
  request(): MediaDropRequest | null {
    const proposal = this.current;
    if (!proposal || this.start === null) return null;
    return { items: this.items.map(requestItem), start: this.start, lanes: { ...this.lanes }, mode: proposal.mode };
  }

  private propose(start: Frame, mode: MoveMode, snap: SnapTarget | null): MoveProposal {
    const { project } = this;
    let counter = 0;
    // Ghost ids only: the controller stages the drop again with real ids.
    const staged = stageDrop(project, this.items, start, this.lanes, () => `drop-ghost-${++counter}`);
    const locked = staged.targets.find((target) => target.track?.locked);
    const refused: MoveRefusal | null = locked?.track ? { reason: "lockedTarget", trackId: locked.track.id } : null;
    const ghosts = staged.clips.map((clip, i): Ghost => {
      const target = staged.targets[i] as Ghost["target"];
      const hatch = !refused && mode === "overwrite" && target.track ? overwrittenSpans(trackIndex(project, target.track), clip.start, clip.start + clip.duration, null) : [];
      return { clip, start: clip.start, target, hatch };
    });
    return {
      deltaFrames: 0,
      laneDelta: { ...this.lanes },
      mode,
      duplicate: false,
      ghosts,
      newLanes: newLanes(project.tracks, staged.targets),
      refused,
      // OS files: where they will start (their length is unknown until they are imported).
      insertFrame: mode === "insert" || this.items.length === 0 ? start : null,
      end: Math.max(staged.end, start),
      snap,
    };
  }
}
