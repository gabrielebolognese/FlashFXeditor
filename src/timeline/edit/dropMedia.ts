// Placing media items on the timeline (spec §6.14): the clips that a drag from the Media panel, an
// insert or overwrite at the playhead (double-click, `,`, `.`) and a drop on the preview canvas add.
// Several items go back to back in the given order; each lands as one command through `dropClips`
// (the move's overwrite/insert rules, §6.8). Missing tracks are created. Pure.
import { emptyTrack, nextTrackName } from "../../core/document/project.js";
import type { Frame, MediaClip, MediaId, MediaItem, Project, Track, TrackId, Transform } from "../../core/document/types.js";
import { clipsInRange, laneOf, laneTracks, type LaneKind } from "../model/queries.js";
import { defaultTransform, mediaClips, mediaLanes, naturalDuration, type ClipTracks, type SourceRange } from "./insertMedia.js";
import { dropClips, type LaneTarget, type MoveMode, type MoveResult } from "./move.js";

/** One media item to place, with its source range (spec §12) or null for all of it. */
export interface DropItem {
  media: MediaItem;
  range: SourceRange | null;
}

/** The lane of each kind a drag lands on (0 = V1 / A1, counted away from the divider). */
export interface DropLanes {
  video: number;
  audio: number;
}

/** A media drag released over the timeline (spec §6.14): what the controller applies. */
export interface MediaDropRequest {
  items: readonly { mediaId: MediaId; range: SourceRange | null }[];
  /** First frame of the block (snapped). */
  start: Frame;
  lanes: DropLanes;
  mode: MoveMode;
}

/** The clips to add (back to back from `start` to `end`) and the tracks to create for them. */
export interface DropPlan {
  clips: MediaClip[];
  newTracks: Track[];
  start: Frame;
  end: Frame;
}

/** A drag's plan with each clip's lane (`targets[i]` for `clips[i]`): what the drag ghosts draw. */
export interface StagedDrop extends DropPlan {
  targets: LaneTarget[];
}

/** Timeline length of the items back to back (items without a duration count 0). */
export function blockLength(items: readonly DropItem[], project: Project): Frame {
  return items.reduce((sum, item) => sum + (naturalDuration(item.media, project.settings.fps, item.range) ?? 0), 0);
}

/** Tracks by lane, creating the ones past the last of a kind (named V3, A4..., stacked in lane order). */
class LaneTracks {
  readonly created: Track[] = [];
  private readonly known: Track[];

  constructor(
    private readonly tracks: readonly Track[],
    private readonly newId: () => string,
  ) {
    this.known = [...tracks];
  }

  at(kind: LaneKind, lane: number): { target: LaneTarget; trackId: TrackId } {
    const number = Math.max(0, lane);
    const existing = laneTracks(this.tracks, kind);
    const track = existing[number];
    if (track) return { target: { kind, number, track }, trackId: track.id };
    const made = this.created.filter((candidate) => candidate.kind === kind);
    while (existing.length + made.length <= number) {
      const fresh = emptyTrack(this.newId(), kind, nextTrackName(this.known, kind));
      made.push(fresh);
      this.known.push(fresh);
      this.created.push(fresh);
    }
    return { target: { kind, number, track: null }, trackId: (made[number - existing.length] as Track).id };
  }

  /** A new track of `kind` beyond the outermost one (the top video track, the bottom audio track). */
  outer(kind: LaneKind): { target: LaneTarget; trackId: TrackId } {
    return this.at(kind, laneTracks(this.tracks, kind).length + this.created.filter((track) => track.kind === kind).length);
  }
}

function targetOf(tracks: readonly Track[], trackId: TrackId, created: readonly Track[]): LaneTarget {
  const lane = laneOf(tracks, trackId);
  if (lane) return { kind: lane.kind, number: lane.number, track: tracks.find((track) => track.id === trackId) ?? null };
  const fresh = created.find((track) => track.id === trackId);
  const kind = fresh?.kind === "audio" ? "audio" : "video";
  return { kind, number: laneTracks(tracks, kind).length + created.filter((track) => track.kind === kind).indexOf(fresh as Track), track: null };
}

/** Lays the items out back to back from `start`, each on the tracks `pick` gives for the kinds it needs. */
function layout(project: Project, items: readonly DropItem[], start: Frame, pick: (kind: LaneKind) => TrackId, newId: () => string, transform?: (item: DropItem) => Transform): DropPlan {
  const clips: MediaClip[] = [];
  let at = Math.max(0, start);
  for (const item of items) {
    const lanes = mediaLanes(item.media);
    if (naturalDuration(item.media, project.settings.fps, item.range) === null) continue;
    const tracks: ClipTracks = { video: lanes.video ? pick("video") : null, audio: lanes.audio ? pick("audio") : null };
    const made = mediaClips(item.media, item.range, at, tracks, project.settings, newId, transform?.(item));
    if (!made || made.length === 0) continue;
    clips.push(...made);
    at += (made[0] as MediaClip).duration;
  }
  return { clips, newTracks: [], start: Math.max(0, start), end: at };
}

/**
 * A drag from the Media panel (spec §6.14): the items back to back from `start`, pictures on video
 * lane `lanes.video` and sounds on audio lane `lanes.audio` (a video and its audio on V2 / A2), the
 * lanes past the last track created.
 */
export function stageDrop(project: Project, items: readonly DropItem[], start: Frame, lanes: DropLanes, newId: () => string): StagedDrop {
  const tracks = new LaneTracks(project.tracks, newId);
  const plan = layout(project, items, start, (kind) => tracks.at(kind, lanes[kind]).trackId, newId);
  return { ...plan, newTracks: tracks.created, targets: plan.clips.map((clip) => targetOf(project.tracks, clip.trackId, tracks.created)) };
}

/** The track a new clip of `kind` goes to at the playhead: targeted and unlocked first, then any unlocked one. */
function targetTrack(tracks: readonly Track[], kind: LaneKind): Track | null {
  const ofKind = laneTracks(tracks, kind).filter((track) => !track.locked);
  return ofKind.find((track) => track.targeted) ?? ofKind[0] ?? null;
}

/**
 * Insert or overwrite at the playhead (spec §6.14: double-click, `,`, `.`): the items back to back from
 * the playhead on the first targeted video and audio tracks (else the first unlocked ones, else new).
 */
export function planAtPlayhead(project: Project, items: readonly DropItem[], playhead: Frame, newId: () => string): DropPlan {
  const tracks = new LaneTracks(project.tracks, newId);
  const chosen = new Map<LaneKind, TrackId>();
  const pick = (kind: LaneKind) => {
    let trackId = chosen.get(kind);
    if (trackId === undefined) {
      trackId = targetTrack(project.tracks, kind)?.id ?? tracks.outer(kind).trackId;
      chosen.set(kind, trackId);
    }
    return trackId;
  };
  return { ...layout(project, items, playhead, pick, newId), newTracks: tracks.created };
}

/** True when no clip of `trackId` lies in [from, to). */
const isFree = (project: Project, trackId: TrackId, from: Frame, to: Frame) => clipsInRange(project, trackId, from, to).length === 0;

/**
 * A drop on the preview canvas (spec §6.14, §7.2): the items back to back from the playhead on the
 * topmost video track when it is unlocked and free there, else on a new track above it; sounds on the
 * first audio track free there, else a new one. Nothing is overwritten. Each picture's position is
 * the drop point (`point`: project px from the frame's top-left; null: the frame center).
 */
export function planCanvasDrop(project: Project, items: readonly DropItem[], playhead: Frame, point: { x: number; y: number } | null, newId: () => string): DropPlan {
  const start = Math.max(0, playhead);
  const end = start + blockLength(items, project);
  const tracks = new LaneTracks(project.tracks, newId);
  const chosen = new Map<LaneKind, TrackId>();
  const pick = (kind: LaneKind) => {
    let trackId = chosen.get(kind);
    if (trackId === undefined) {
      const lanes = laneTracks(project.tracks, kind);
      const free = (track: Track | undefined) => track !== undefined && !track.locked && isFree(project, track.id, start, end);
      const top = lanes[lanes.length - 1];
      const found = kind === "video" ? (free(top) ? top : undefined) : lanes.find(free);
      trackId = found?.id ?? tracks.outer(kind).trackId;
      chosen.set(kind, trackId);
    }
    return trackId;
  };
  const { width, height } = project.settings;
  const at = point ?? { x: width / 2, y: height / 2 };
  // The anchor (the media center) at the point: positions count from the frame center.
  const placed = (item: DropItem) => ({ ...defaultTransform(item.media, project.settings), x: Math.round(at.x - width / 2), y: Math.round(at.y - height / 2) });
  return { ...layout(project, items, start, pick, newId, placed), newTracks: tracks.created };
}

/** A plan as one command: the §6.8 overwrite or insert rules (spec §6.14). */
export function commitPlan(project: Project, plan: DropPlan, mode: MoveMode, label: string, newId: () => string): MoveResult {
  return dropClips(project, plan.clips, mode, { newTracks: plan.newTracks, newId, label });
}

/** Undo label of a drop: `Add clip`, `Insert clips`, `Overwrite clip`... */
export function dropLabel(verb: "Add" | "Insert" | "Overwrite", items: number): string {
  return `${verb} ${items === 1 ? "clip" : "clips"}`;
}

/** The items of a request, from the document (media no longer there are skipped). */
export function requestItems(project: Project, request: Pick<MediaDropRequest, "items">): DropItem[] {
  const items: DropItem[] = [];
  for (const { mediaId, range } of request.items) {
    const media = project.media[mediaId];
    if (media) items.push({ media, range });
  }
  return items;
}

/** A released media drag as the edit (one command), with the plan it applied. */
export function applyMediaDrop(project: Project, request: MediaDropRequest, newId: () => string): { result: MoveResult; plan: DropPlan } {
  const items = requestItems(project, request);
  const plan = stageDrop(project, items, request.start, request.lanes, newId);
  return { result: commitPlan(project, plan, request.mode, dropLabel(request.mode === "insert" ? "Insert" : "Add", items.length), newId), plan };
}
