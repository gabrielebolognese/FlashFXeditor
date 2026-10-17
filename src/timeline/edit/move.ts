// Moving clips (spec §6.8, §6.19, P2): the pure edit behind a clip drag, the nudge keys and Alt+Up/Down.
// `moveClips` resolves a drop against the document and returns one command (one undo step):
// - overwrite (the default): clips under the dropped ones are trimmed, removed when fully covered and
//   split in two when covered in the middle;
// - insert (Mod on drop): every unlocked track opens a gap as long as the moved block at its start
//   (clips crossing that frame are split), then the clips land in it. Locked tracks never move.
// Cues never overwrite: an overwrite move of cues stops at the cues that stay (spec §10.5, captions.ts).
// Moving clips off or onto a locked track is refused. Collision lookups are binary searches on the
// per-track sorted arrays (O(log n + k) per clip). `dropClips` lands new clips (media drops, §6.14)
// with the same rules.
import type { Draft } from "immer";
import { defaultTrackIndex } from "../../core/commands/basicCommands.js";
import type { Affect, Command } from "../../core/commands/command.js";
import { emptyTrack, nextTrackName } from "../../core/document/project.js";
import { framesToSourceUs } from "../../core/document/time.js";
import { sliceKeyframes } from "../../core/document/keyframes.js";
import { isFreeze, isMediaClip, type Clip, type ClipId, type Frame, type Project, type Rational, type Track, type TrackId } from "../../core/document/types.js";
import { cueSlice } from "../../text/captions.js";
import { clipsOverlapping, firstEndingAfter, laneOf, laneTracks, trackIndex, type LaneKind, type TrackIndex } from "../model/queries.js";
import { clampCueDelta } from "./captions.js";

export type MoveMode = "overwrite" | "insert";

/** Lane shift per kind (spec §6.8): +1 takes V1 to V2 and A1 to A2 (both away from the divider). */
export interface LaneDelta {
  video: number;
  audio: number;
}

export const NO_LANE_DELTA: LaneDelta = { video: 0, audio: 0 };

/** Source track -> destination track; tracks not in the map keep their clips. */
export type TrackMap = ReadonlyMap<TrackId, TrackId>;

export interface MoveRefusal {
  /** `occupied`: Alt+Up/Down found the adjacent track taken. */
  reason: "lockedSource" | "lockedTarget" | "occupied";
  trackId: TrackId;
}

export interface MoveOptions {
  /** Alt+drag: the originals stay and copies (new ids) are dropped. */
  duplicate?: boolean;
  /** Tracks to create first (targets of the track map not in the document yet), each at the default place for its kind. */
  newTracks?: readonly Track[];
  newId: () => string;
  /** Undo label (default from the mode and the clip count). */
  label?: string;
  coalesceKey?: string;
}

export type MoveResult =
  | { kind: "noop" }
  | { kind: "refused"; refusal: MoveRefusal }
  /** `placed`: each moved clip's id after the drop (the copy's id when duplicating), in input order. */
  | { kind: "ok"; command: Command; placed: ReadonlyMap<ClipId, ClipId> };

/** A clip drag as the gesture ends it (spec §6.8); `applyMoveRequest` turns it into the edit. */
export interface MoveRequest {
  clipIds: readonly ClipId[];
  /** The dragged clip: it stays the primary selection (or its copy does). */
  primary: ClipId | null;
  deltaFrames: number;
  laneDelta: LaneDelta;
  mode: MoveMode;
  duplicate: boolean;
}

const NOOP: MoveResult = { kind: "noop" };

// --- Lanes ---------------------------------------------------------------------------------------

/** The lowest and highest lane used by the given tracks, per kind (null when none). */
function laneRange(tracks: readonly Track[], sourceTrackIds: Iterable<TrackId>): Record<LaneKind, { min: number; max: number } | null> {
  const range: Record<LaneKind, { min: number; max: number } | null> = { video: null, audio: null };
  for (const trackId of new Set(sourceTrackIds)) {
    const lane = laneOf(tracks, trackId);
    if (!lane) continue;
    const current = range[lane.kind];
    range[lane.kind] = current ? { min: Math.min(current.min, lane.number), max: Math.max(current.max, lane.number) } : { min: lane.number, max: lane.number };
  }
  return range;
}

/** `desired` clamped per kind so no clip goes below the first lane (V1, A1); the block keeps its shape. */
export function clampLaneDelta(tracks: readonly Track[], sourceTrackIds: Iterable<TrackId>, desired: LaneDelta): LaneDelta {
  const range = laneRange(tracks, sourceTrackIds);
  return {
    // `|| 0`: no -0 from Math.max(-n, -0).
    video: range.video ? Math.max(desired.video, -range.video.min) || 0 : 0,
    audio: range.audio ? Math.max(desired.audio, -range.audio.min) || 0 : 0,
  };
}

export interface LaneTarget {
  /** Null for caption tracks, which never change. */
  kind: LaneKind | null;
  number: number;
  /** The existing track at that lane, or null past the last track of the kind (a track to create). */
  track: Track | null;
}

/** Where a source track's clips go for `delta`. */
export function laneTarget(tracks: readonly Track[], sourceTrackId: TrackId, delta: LaneDelta): LaneTarget {
  const lane = laneOf(tracks, sourceTrackId);
  if (!lane) return { kind: null, number: 0, track: tracks.find((track) => track.id === sourceTrackId) ?? null };
  const number = lane.number + delta[lane.kind];
  return { kind: lane.kind, number, track: laneTracks(tracks, lane.kind)[number] ?? null };
}

/**
 * The lane delta as a track map, with the tracks to create for lanes past the last track of a kind
 * (named V3, A4..., in lane order; each goes to the default place, so they stack in that order).
 */
export function mapLanes(tracks: readonly Track[], sourceTrackIds: Iterable<TrackId>, delta: LaneDelta, newId: () => string): { trackMap: Map<TrackId, TrackId>; newTracks: Track[] } {
  const trackMap = new Map<TrackId, TrackId>();
  const newTracks: Track[] = [];
  const created: Record<LaneKind, Track[]> = { video: [], audio: [] };
  const known: Track[] = [...tracks];
  for (const trackId of new Set(sourceTrackIds)) {
    const target = laneTarget(tracks, trackId, delta);
    if (target.kind === null) continue;
    let track = target.track;
    if (!track) {
      const existing = laneTracks(tracks, target.kind).length;
      const list = created[target.kind];
      while (existing + list.length <= target.number) {
        const fresh = emptyTrack(newId(), target.kind, nextTrackName(known, target.kind));
        list.push(fresh);
        known.push(fresh);
        newTracks.push(fresh);
      }
      track = list[target.number - existing] as Track;
    }
    if (track.id !== trackId) trackMap.set(trackId, track.id);
  }
  return { trackMap, newTracks };
}

// --- Clip pieces ---------------------------------------------------------------------------------

/**
 * The part [from, to) of a clip, keeping its id (start <= from < to <= end). Media clips move their
 * source in/out by the frames cut at the clip's speed. Keyframes (relative to the clip start) are
 * partitioned and re-based so the part animates exactly as before (core/document/keyframes.ts
 * `sliceKeyframes`: a key with the value at a new edge, or the key beyond it inside an eased
 * segment); an edge that did not move keeps the keyframes past it. A new edge drops the fade and
 * transition (and the text animation) of that side.
 * A cue keeps the part of its text and the word timings of its span (text/captions.ts `cueSlice`).
 */
export function sliceClip(clip: Clip, from: Frame, to: Frame, fps: Rational): Clip {
  const end = clip.start + clip.duration;
  if (!(from >= clip.start && to <= end && to > from)) throw new Error(`sliceClip: [${from}, ${to}) is not inside clip ${clip.id} [${clip.start}, ${end})`);
  if (from === clip.start && to === end) return clip;
  const newIn = from > clip.start;
  const newOut = to < end;
  const piece = { ...clip, start: from, duration: to - from } as Clip & Record<string, unknown>;
  // A freeze frame's pieces hold the same source time (Batch 27).
  if (isMediaClip(clip) && !isFreeze(clip)) {
    const media = piece as Clip & { in: number; out: number };
    if (newIn) media.in = clip.in + framesToSourceUs(from - clip.start, clip.speed, fps);
    if (newOut) media.out = Math.min(clip.out, clip.in + framesToSourceUs(to - clip.start, clip.speed, fps));
  }
  if ("keyframes" in clip && clip.keyframes) {
    const keyframes = sliceKeyframes(clip.keyframes, from - clip.start, to - clip.start, newIn, newOut);
    if (keyframes) piece.keyframes = keyframes;
    else delete piece.keyframes;
  }
  if ("fades" in clip) {
    const duration = to - from;
    piece.fades = { in: newIn ? 0 : Math.min(clip.fades.in, duration), out: newOut ? 0 : Math.min(clip.fades.out, duration) };
  }
  if (clip.kind === "caption") {
    const { text, words } = cueSlice(clip, from, to);
    piece.text = text;
    if (words) piece.words = words;
    else delete piece.words;
  }
  if (newIn) {
    delete piece.transitionIn;
    delete piece.animIn;
  }
  if (newOut) {
    delete piece.transitionOut;
    delete piece.animOut;
  }
  return piece;
}

/** What is left of [start, end) once `spans` are cut out. */
function remainder(start: Frame, end: Frame, spans: readonly (readonly [Frame, Frame])[]): [Frame, Frame][] {
  const parts: [Frame, Frame][] = [];
  let cursor = start;
  for (const [from, to] of [...spans].sort((a, b) => a[0] - b[0])) {
    if (from > cursor) parts.push([cursor, Math.min(from, end)]);
    cursor = Math.max(cursor, to);
    if (cursor >= end) break;
  }
  if (cursor < end) parts.push([cursor, end]);
  return parts.filter(([from, to]) => to > from);
}

/** The clip with `field` set, or removed when `value` is undefined (no undefined-valued keys in the document). */
export function withField(clip: Clip, field: "linkGroup" | "group", value: string | undefined): Clip {
  const next = { ...clip };
  if (value === undefined) delete next[field];
  else next[field] = value;
  return next;
}

/** New values for the link groups (or groups) shared by copies: a fresh id when two or more copies share one, none for a lone copy. */
export function regroup(clips: readonly Clip[], field: "linkGroup" | "group", newId: () => string): Map<string, string | undefined> {
  const counts = new Map<string, number>();
  for (const clip of clips) {
    const value = clip[field];
    if (value !== undefined) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const map = new Map<string, string | undefined>();
  for (const [value, count] of counts) map.set(value, count > 1 ? newId() : undefined);
  return map;
}

// --- Refusal and overlaps ------------------------------------------------------------------------

/**
 * Why a move is refused (spec §6.8, §6.12: locked tracks take no edits), or null. `targetOf` gives a
 * source track's destination track, null for a track that does not exist yet (new tracks are unlocked).
 */
export function moveRefusal(project: Project, clips: readonly Clip[], targetOf: (trackId: TrackId) => Track | null): MoveRefusal | null {
  const tracks = new Map(project.tracks.map((track) => [track.id, track]));
  for (const clip of clips) {
    if (tracks.get(clip.trackId)?.locked) return { reason: "lockedSource", trackId: clip.trackId };
    const target = targetOf(clip.trackId);
    if (target?.locked) return { reason: "lockedTarget", trackId: target.id };
  }
  return null;
}

/**
 * The parts of [start, end) where a dropped clip would overwrite a clip of `track` (the hatched
 * regions of the drag overlay), sorted. `moving` clips are ignored (they leave their place).
 */
export function overwrittenSpans(index: TrackIndex, start: Frame, end: Frame, moving: ReadonlySet<ClipId> | null): [Frame, Frame][] {
  const spans: [Frame, Frame][] = [];
  for (const clip of clipsOverlapping(index, start, end)) {
    if (moving?.has(clip.id)) continue;
    spans.push([Math.max(start, clip.start), Math.min(end, clip.start + clip.duration)]);
  }
  return spans;
}

// --- The edit ------------------------------------------------------------------------------------

/** Changed clips over the base document, the tracks whose id lists change, and the split pieces to relink. */
class Edit {
  readonly changes = new Map<ClipId, Clip | null>();
  readonly touched = new Set<TrackId>();
  /** Pieces split off with a new id from a linked clip: their link groups are settled at the end. */
  readonly pieces: { id: ClipId; linkGroup: string }[] = [];
  private readonly indexes = new Map<TrackId, TrackIndex | null>();

  constructor(readonly project: Project) {}

  index(trackId: TrackId): TrackIndex | null {
    if (!this.indexes.has(trackId)) {
      const track = this.project.tracks.find((candidate) => candidate.id === trackId);
      this.indexes.set(trackId, track ? trackIndex(this.project, track) : null);
    }
    return this.indexes.get(trackId) ?? null;
  }

  put(clip: Clip): void {
    const base = this.project.clips[clip.id];
    if (base) this.touched.add(base.trackId);
    this.touched.add(clip.trackId);
    this.changes.set(clip.id, clip);
  }

  remove(clip: Clip): void {
    this.touched.add(clip.trackId);
    this.changes.set(clip.id, null);
  }

  /** A piece cut off a clip, under a new id. */
  addPiece(piece: Clip, newId: () => string): void {
    const clip = { ...piece, id: newId() } as Clip;
    if (clip.linkGroup !== undefined) this.pieces.push({ id: clip.id, linkGroup: clip.linkGroup });
    this.put(clip);
  }

  /**
   * Split pieces of linked clips: pieces of one link group that start at the same frame (cut at the
   * same frame) are linked to each other under a new group, whatever their lengths (a linked video
   * and a longer audio split together stay a pair); a piece with no such partner is unlinked. A clip
   * gives at most one piece starting at a given frame, so two pieces of one clip are never linked.
   */
  relinkPieces(newId: () => string): void {
    const byKey = new Map<string, ClipId[]>();
    for (const { id, linkGroup } of this.pieces) {
      const clip = this.changes.get(id);
      if (!clip) continue;
      const key = `${linkGroup}\u0000${clip.start}`;
      const ids = byKey.get(key);
      if (ids) ids.push(id);
      else byKey.set(key, [id]);
    }
    for (const ids of byKey.values()) {
      const group = ids.length > 1 ? newId() : undefined;
      for (const id of ids) this.changes.set(id, withField(this.changes.get(id) as Clip, "linkGroup", group));
    }
  }

  private finalClip(id: ClipId): Clip | null | undefined {
    return this.changes.has(id) ? this.changes.get(id) : this.project.clips[id];
  }

  /** The sorted id list of every touched track. */
  private trackLists(): Map<TrackId, ClipId[]> {
    const byTrack = new Map<TrackId, Set<ClipId>>();
    for (const trackId of this.touched) byTrack.set(trackId, new Set(this.project.tracks.find((track) => track.id === trackId)?.clipIds ?? []));
    for (const [id, clip] of this.changes) if (clip) byTrack.get(clip.trackId)?.add(id);
    const lists = new Map<TrackId, ClipId[]>();
    for (const [trackId, ids] of byTrack) {
      const list = [...ids].filter((id) => this.finalClip(id)?.trackId === trackId);
      list.sort((a, b) => (this.finalClip(a) as Clip).start - (this.finalClip(b) as Clip).start);
      lists.set(trackId, list);
    }
    return lists;
  }

  command(id: string, label: string, newTracks: readonly Track[], coalesceKey: string | undefined): Command {
    const lists = this.trackLists();
    const changes = [...this.changes];
    const affects: Affect[] = newTracks.length > 0 ? ["clips", "timeline", "tracks"] : ["clips", "timeline"];
    return {
      id,
      label,
      affects,
      ...(coalesceKey !== undefined && { coalesceKey }),
      run(draft) {
        for (const track of newTracks) {
          if (draft.tracks.some((t) => t.id === track.id)) throw new Error(`${id}: track ${track.id} already exists`);
          draft.tracks.splice(defaultTrackIndex(draft.tracks, track.kind), 0, structuredClone(track));
        }
        for (const [id, clip] of changes) {
          if (clip) draft.clips[id] = clip as Draft<Clip>;
          else delete draft.clips[id];
        }
        for (const [trackId, ids] of lists) {
          const track = draft.tracks.find((t) => t.id === trackId);
          if (!track) throw new Error(`${id}: track ${trackId} does not exist`);
          track.clipIds = [...ids];
        }
      },
    };
  }
}

/** Overwrite: every stationary clip under a dropped one loses the covered part (trimmed, removed or split). */
function overwrite(edit: Edit, placed: readonly Clip[], stationary: (clip: Clip) => boolean, fps: Rational, newId: () => string): void {
  const covered = new Map<ClipId, { clip: Clip; spans: [Frame, Frame][] }>();
  for (const clip of placed) {
    const index = edit.index(clip.trackId);
    if (!index) continue;
    const end = clip.start + clip.duration;
    for (const under of clipsOverlapping(index, clip.start, end)) {
      if (!stationary(under)) continue;
      const entry = covered.get(under.id);
      if (entry) entry.spans.push([clip.start, end]);
      else covered.set(under.id, { clip: under, spans: [[clip.start, end]] });
    }
  }
  for (const { clip, spans } of covered.values()) {
    const parts = remainder(clip.start, clip.start + clip.duration, spans);
    if (parts.length === 0) edit.remove(clip);
    parts.forEach(([from, to], i) => {
      const piece = sliceClip(clip, from, to, fps);
      if (i === 0) edit.put(piece);
      else edit.addPiece(piece, newId);
    });
  }
}

/** Insert: each unlocked track opens [from, from + length) by shifting what starts there or later; a clip crossing `from` is split. */
function insert(edit: Edit, placed: readonly Clip[], stationary: (clip: Clip) => boolean, fps: Rational, newId: () => string): void {
  let from = Infinity;
  let to = -Infinity;
  for (const clip of placed) {
    from = Math.min(from, clip.start);
    to = Math.max(to, clip.start + clip.duration);
  }
  const length = to - from;
  for (const track of edit.project.tracks) {
    if (track.locked) continue;
    const index = edit.index(track.id) as TrackIndex;
    for (let i = firstEndingAfter(index, from); i < index.clips.length; i++) {
      const clip = index.clips[i] as Clip;
      if (!stationary(clip)) continue;
      if (clip.start < from) {
        edit.put(sliceClip(clip, clip.start, from, fps));
        const right = sliceClip(clip, from, clip.start + clip.duration, fps);
        edit.addPiece({ ...right, start: right.start + length } as Clip, newId);
      } else {
        edit.put({ ...clip, start: clip.start + length });
      }
    }
  }
}

function moveLabel(count: number, mode: MoveMode, duplicate: boolean): string {
  const noun = count === 1 ? "clip" : "clips";
  if (duplicate) return mode === "insert" ? `Duplicate and insert ${noun}` : `Duplicate ${noun}`;
  return mode === "insert" ? `Insert ${noun}` : `Move ${noun}`;
}

/**
 * Moves (or, with `duplicate`, copies) clips by `deltaFrames` and onto the tracks of `trackMap`,
 * resolving collisions by `mode`. The delta is clamped so no clip starts before frame 0. A move that
 * changes nothing is a no-op (no command, no undo step).
 */
export function moveClips(project: Project, ids: Iterable<ClipId>, deltaFrames: number, trackMap: TrackMap, mode: MoveMode, options: MoveOptions): MoveResult {
  const moving: Clip[] = [];
  let minStart = Infinity;
  for (const id of new Set(ids)) {
    const clip = project.clips[id];
    if (!clip) continue;
    moving.push(clip);
    minStart = Math.min(minStart, clip.start);
  }
  if (moving.length === 0) return NOOP;
  const { newId } = options;
  const duplicate = options.duplicate === true;
  let delta = Math.max(Math.round(deltaFrames), -minStart);
  // Cues never overwrite one another (spec §10.5): an overwrite move stops at the cues that stay.
  if (mode === "overwrite") {
    const clamped = clampCueDelta(project, moving.map((clip) => clip.id), delta, duplicate);
    if (clamped === null) return NOOP;
    delta = clamped;
  }
  const destination = (clip: Clip) => trackMap.get(clip.trackId) ?? clip.trackId;
  if (!duplicate && delta === 0 && moving.every((clip) => destination(clip) === clip.trackId)) return NOOP;

  const tracks = new Map(project.tracks.map((track) => [track.id, track]));
  const refusal = moveRefusal(project, moving, (trackId) => tracks.get(trackMap.get(trackId) ?? trackId) ?? null);
  if (refusal) return { kind: "refused", refusal };

  const edit = new Edit(project);
  const movingIds = new Set(moving.map((clip) => clip.id));
  const links = duplicate ? regroup(moving, "linkGroup", newId) : null;
  const groups = duplicate ? regroup(moving, "group", newId) : null;
  const placedIds = new Map<ClipId, ClipId>();
  const placed = moving.map((clip) => {
    let next = { ...clip, start: clip.start + delta, trackId: destination(clip) } as Clip;
    if (duplicate) {
      next = { ...next, id: newId() } as Clip;
      if (clip.linkGroup !== undefined) next = withField(next, "linkGroup", links?.get(clip.linkGroup));
      if (clip.group !== undefined) next = withField(next, "group", groups?.get(clip.group));
    }
    placedIds.set(clip.id, next.id);
    return next;
  });
  if (!duplicate) for (const clip of moving) edit.remove(clip);
  const stationary = (clip: Clip) => duplicate || !movingIds.has(clip.id);
  if (mode === "overwrite") overwrite(edit, placed, stationary, project.settings.fps, newId);
  else insert(edit, placed, stationary, project.settings.fps, newId);
  for (const clip of placed) edit.put(clip);
  edit.relinkPieces(newId);
  const label = options.label ?? moveLabel(moving.length, mode, duplicate);
  return { kind: "ok", command: edit.command("clip.move", label, options.newTracks ?? [], options.coalesceKey), placed: placedIds };
}

/** A finished clip drag as the edit: the lane delta becomes a track map (new tracks included), then `moveClips`. */
export function applyMoveRequest(project: Project, request: MoveRequest, newId: () => string): MoveResult {
  const sources: TrackId[] = [];
  for (const id of request.clipIds) {
    const clip = project.clips[id];
    if (clip) sources.push(clip.trackId);
  }
  const delta = clampLaneDelta(project.tracks, sources, request.laneDelta);
  const { trackMap, newTracks } = mapLanes(project.tracks, sources, delta, newId);
  return moveClips(project, request.clipIds, request.deltaFrames, trackMap, request.mode, { duplicate: request.duplicate, newTracks, newId });
}

export interface DropOptions {
  /** Tracks to create first (the targets of clips not in the document yet), each at the default place for its kind. */
  newTracks?: readonly Track[];
  newId: () => string;
  /** Undo label. */
  label: string;
  /** Command id (default `clip.add`). */
  id?: string;
}

/**
 * New clips (not in the document: media dropped or placed at the playhead, spec §6.14) landing with
 * the drop rules of a move (§6.8): `overwrite` trims, removes or splits what they cover; `insert`
 * opens a gap as long as their block at its start on every unlocked track (clips crossing it are
 * split). A clip onto a locked track refuses the drop. One command; `placed` maps each id to itself.
 */
export function dropClips(project: Project, clips: readonly Clip[], mode: MoveMode, options: DropOptions): MoveResult {
  if (clips.length === 0) return NOOP;
  const tracks = new Map(project.tracks.map((track) => [track.id, track]));
  for (const clip of clips) {
    if (project.clips[clip.id]) throw new Error(`dropClips: clip ${clip.id} already exists`);
    if (tracks.get(clip.trackId)?.locked) return { kind: "refused", refusal: { reason: "lockedTarget", trackId: clip.trackId } };
  }
  const edit = new Edit(project);
  const stationary = () => true;
  if (mode === "overwrite") overwrite(edit, clips, stationary, project.settings.fps, options.newId);
  else insert(edit, clips, stationary, project.settings.fps, options.newId);
  for (const clip of clips) edit.put(clip);
  edit.relinkPieces(options.newId);
  return { kind: "ok", command: edit.command(options.id ?? "clip.add", options.label, options.newTracks ?? [], undefined), placed: new Map(clips.map((clip) => [clip.id, clip.id])) };
}

/** `Alt+Left/Right`, `Alt+Shift+Left/Right` (spec §6.8): the clips move by `frames` on their tracks and overwrite what they land on. */
export function nudgeClips(project: Project, ids: readonly ClipId[], frames: number, newId: () => string): MoveResult {
  const count = ids.filter((id) => project.clips[id]).length;
  return moveClips(project, ids, frames, new Map(), "overwrite", { newId, label: count === 1 ? "Nudge clip" : "Nudge clips", coalesceKey: "clip.nudge" });
}

/**
 * `Alt+Up/Down` (spec §6.8): the clips move one track up or down on screen when the spans there are
 * free. `kind` (the primary clip's) gives the direction: up is the next video lane for video and the
 * previous audio lane for audio; the other kind follows with the same lane delta. Each kind stays
 * within its existing tracks (none is created): a move that cannot go further is a no-op.
 */
export function moveToAdjacentLane(project: Project, ids: readonly ClipId[], direction: "up" | "down", kind: LaneKind, newId: () => string): MoveResult {
  const clips = ids.map((id) => project.clips[id]).filter((clip): clip is Clip => clip !== undefined);
  const sources = clips.map((clip) => clip.trackId);
  const step = (direction === "up") === (kind === "video") ? 1 : -1;
  const range = laneRange(project.tracks, sources);
  const clampTo = (k: LaneKind) => {
    const r = range[k];
    if (!r) return 0;
    return Math.min(Math.max(step, -r.min), laneTracks(project.tracks, k).length - 1 - r.max) || 0;
  };
  const delta: LaneDelta = { video: clampTo("video"), audio: clampTo("audio") };
  if (delta[kind] === 0) return NOOP;
  const { trackMap } = mapLanes(project.tracks, sources, delta, newId);
  const tracks = new Map(project.tracks.map((track) => [track.id, track]));
  const refusal = moveRefusal(project, clips, (trackId) => tracks.get(trackMap.get(trackId) ?? trackId) ?? null);
  if (refusal) return { kind: "refused", refusal };
  const moving = new Set(clips.map((clip) => clip.id));
  for (const clip of clips) {
    const target = trackMap.get(clip.trackId);
    const track = target !== undefined ? tracks.get(target) : undefined;
    if (!track) continue;
    if (overwrittenSpans(trackIndex(project, track), clip.start, clip.start + clip.duration, moving).length > 0) return { kind: "refused", refusal: { reason: "occupied", trackId: track.id } };
  }
  return moveClips(project, ids, 0, trackMap, "overwrite", { newId, label: clips.length === 1 ? "Move clip to track" : "Move clips to track" });
}
