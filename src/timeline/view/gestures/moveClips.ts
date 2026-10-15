// The clip drag (spec §6.8, P2): an ephemeral object owned by the timeline view. It turns the pointer
// position and the held modifiers into a proposed layout (ghosts, new track rows, overwritten
// regions, the insert frame, a refusal) that the overlay draws; the document is untouched until the
// drop, which becomes one MoveRequest and so one command.
import { nextTrackName } from "../../../core/document/project.js";
import type { Clip, ClipId, Frame, Project, Track, TrackId } from "../../../core/document/types.js";
import { clampLaneDelta, laneTarget, moveRefusal, overwrittenSpans, type LaneDelta, type LaneTarget, type MoveMode, type MoveRefusal, type MoveRequest } from "../../edit/move.js";
import { laneOf, laneTracks, trackIndex, type Lane, type LaneKind } from "../../model/queries.js";

export interface DragModifiers {
  shift: boolean;
  alt: boolean;
  /** Ctrl on Windows/Linux, Cmd on macOS. */
  mod: boolean;
}

export const NO_MODIFIERS: DragModifiers = { shift: false, alt: false, mod: false };

export interface Ghost {
  clip: Clip;
  /** Start frame at the drop position. */
  start: Frame;
  target: LaneTarget;
  /** Overwrite mode: the parts [from, to) that would overwrite another clip (hatched). */
  hatch: readonly (readonly [Frame, Frame])[];
}

/** A track the drop would create, drawn as a row beyond the outermost one of its kind. */
export interface NewLane {
  kind: LaneKind;
  lane: number;
  name: string;
}

export interface MoveProposal {
  deltaFrames: number;
  laneDelta: LaneDelta;
  mode: MoveMode;
  duplicate: boolean;
  ghosts: readonly Ghost[];
  newLanes: readonly NewLane[];
  /** Why the drop would be refused (the ghost turns red and the drop cancels), or null. */
  refused: MoveRefusal | null;
  /** Insert mode: the frame where every unlocked track opens the gap. */
  insertFrame: Frame | null;
  /** End of the last ghost: the view may scroll that far right. */
  end: Frame;
}

export class MoveGesture {
  /** The clips being dragged, from the document at the start of the drag. */
  readonly clips: readonly Clip[];
  readonly anchor: Clip;
  /** The dragged clip's lane (null on a caption track: no vertical moves). */
  readonly anchorLane: Lane | null;
  private readonly movingIds: ReadonlySet<ClipId>;
  private readonly minStart: Frame;
  private current: MoveProposal | null = null;
  private currentKey = "";

  /**
   * `clipIds`: the selection being dragged (it contains `anchorId`, the clip under the pointer).
   * `startFrame`: the fractional frame under the pointer when it went down.
   */
  constructor(
    readonly project: Project,
    clipIds: readonly ClipId[],
    anchorId: ClipId,
    private readonly startFrame: number,
  ) {
    const clips = clipIds.map((id) => project.clips[id]).filter((clip): clip is Clip => clip !== undefined);
    const anchor = project.clips[anchorId];
    if (!anchor) throw new Error(`MoveGesture: clip ${anchorId} does not exist`);
    if (!clips.includes(anchor)) clips.push(anchor);
    this.clips = clips;
    this.anchor = anchor;
    this.anchorLane = laneOf(project.tracks, anchor.trackId);
    this.movingIds = new Set(clips.map((clip) => clip.id));
    this.minStart = clips.reduce((min, clip) => Math.min(min, clip.start), Infinity);
  }

  get proposal(): MoveProposal | null {
    return this.current;
  }

  /**
   * The proposal for a pointer over `pointerFrame` (fractional) whose row puts the anchor in
   * `pointerLane` (`TimelineGeometry.laneAt` for the anchor's kind). Shift keeps every clip on its
   * track, Alt duplicates, Mod inserts. Recomputed only when the outcome changes.
   * TODO(batch 12): snap the block's leading or trailing edge to the candidates (Hold S inverts).
   */
  update(pointerFrame: number, pointerLane: number | null, modifiers: DragModifiers): MoveProposal {
    const deltaFrames = Math.max(Math.round(pointerFrame - this.startFrame), -this.minStart);
    const lanes = this.anchorLane && pointerLane !== null && !modifiers.shift ? pointerLane - this.anchorLane.number : 0;
    const laneDelta = clampLaneDelta(
      this.project.tracks,
      this.clips.map((clip) => clip.trackId),
      { video: lanes, audio: lanes },
    );
    const mode: MoveMode = modifiers.mod ? "insert" : "overwrite";
    const key = `${deltaFrames}|${laneDelta.video}|${laneDelta.audio}|${mode}|${modifiers.alt}`;
    if (this.current && key === this.currentKey) return this.current;
    this.currentKey = key;
    this.current = this.propose(deltaFrames, laneDelta, mode, modifiers.alt);
    return this.current;
  }

  /** The drop as a request for the controller (null before the first update). */
  request(): MoveRequest | null {
    const proposal = this.current;
    if (!proposal) return null;
    return {
      clipIds: this.clips.map((clip) => clip.id),
      primary: this.anchor.id,
      deltaFrames: proposal.deltaFrames,
      laneDelta: proposal.laneDelta,
      mode: proposal.mode,
      duplicate: proposal.duplicate,
    };
  }

  private propose(deltaFrames: number, laneDelta: LaneDelta, mode: MoveMode, duplicate: boolean): MoveProposal {
    const { project } = this;
    const targets = new Map<TrackId, LaneTarget>();
    for (const clip of this.clips) if (!targets.has(clip.trackId)) targets.set(clip.trackId, laneTarget(project.tracks, clip.trackId, laneDelta));
    const refused = moveRefusal(project, this.clips, (trackId) => targets.get(trackId)?.track ?? null);
    const moving = duplicate ? null : this.movingIds;
    let end = 0;
    let insertFrame = Infinity;
    const ghosts = this.clips.map((clip): Ghost => {
      const target = targets.get(clip.trackId) as LaneTarget;
      const start = clip.start + deltaFrames;
      end = Math.max(end, start + clip.duration);
      insertFrame = Math.min(insertFrame, start);
      const hatch = !refused && mode === "overwrite" && target.track ? overwrittenSpans(trackIndex(project, target.track), start, start + clip.duration, moving) : [];
      return { clip, start, target, hatch };
    });
    return { deltaFrames, laneDelta, mode, duplicate, ghosts, newLanes: newLanes(project.tracks, targets.values()), refused, insertFrame: mode === "insert" ? insertFrame : null, end };
  }
}

/** The tracks a drop would create, in lane order per kind, with the names they will get. */
function newLanes(tracks: readonly Track[], targets: Iterable<LaneTarget>): NewLane[] {
  const highest: Record<LaneKind, number> = { video: -1, audio: -1 };
  for (const target of targets) if (target.kind !== null && target.track === null) highest[target.kind] = Math.max(highest[target.kind], target.number);
  const lanes: NewLane[] = [];
  const known: Pick<Track, "kind" | "name">[] = [...tracks];
  for (const kind of ["video", "audio"] as const) {
    for (let lane = laneTracks(tracks, kind).length; lane <= highest[kind]; lane++) {
      const name = nextTrackName(known, kind);
      known.push({ kind, name });
      lanes.push({ kind, lane, name });
    }
  }
  return lanes;
}
