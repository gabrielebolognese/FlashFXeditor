// Track management (spec §6.12, §6.16): reorder within a kind (video z-order follows track order), add
// above or below a track, delete tracks (refused for locked ones) and empty tracks, heights, header
// toggles and the track menu's bulk toggles. Pure: each builds one command (one undo step) or null when
// nothing would change. Heights are session state: their command is applied with `DocumentStore.amend`
// (no undo step), and undo keeps them (`carryTrackHeights`).
//
// Video tracks stay before audio tracks in `project.tracks` (spec §5.2), so a reorder moves a track only
// among the tracks of its kind: the divider never moves (video tracks stack up from it, audio down).
import { original } from "immer";
import { addTrack, defaultTrackIndex } from "../../core/commands/basicCommands.js";
import type { Command } from "../../core/commands/command.js";
import { emptyTrack, nextTrackName } from "../../core/document/project.js";
import type { ClipId, Project, Track, TrackId, TrackKind } from "../../core/document/types.js";
import { laneTracks, type LaneKind } from "../model/queries.js";

export type TrackHeight = Track["height"];
/** The header toggles that are track flags (the height toggle cycles `height`). */
export type TrackFlag = "targeted" | "locked" | "muted" | "solo" | "hidden";

const HEIGHTS: readonly TrackHeight[] = ["S", "M", "L"];

/** The next height preset: up S -> M -> L -> S, down L -> M -> S -> L (spec §6.12: `Mod+Alt+Up/Down` cycles). */
export function cycleHeight(height: TrackHeight, direction: "up" | "down"): TrackHeight {
  const at = HEIGHTS.indexOf(height);
  return HEIGHTS[(at + (direction === "up" ? 1 : HEIGHTS.length - 1)) % HEIGHTS.length] as TrackHeight;
}

/** The toolbar's Track height button (spec §6.12: cycles all): the height after the tallest one present. */
export function nextHeightForAll(tracks: readonly Track[]): TrackHeight {
  const tallest = tracks.reduce((max, track) => Math.max(max, HEIGHTS.indexOf(track.height)), -1);
  return tallest === -1 ? "M" : cycleHeight(HEIGHTS[tallest] as TrackHeight, "up");
}

/**
 * Sets the height of `trackIds` (caption tracks stay S, spec §6.2). Session state: apply it with
 * `DocumentStore.amend`, never `dispatch` (no undo step). Null when nothing changes.
 */
export function setTrackHeights(project: Project, trackIds: readonly TrackId[], height: TrackHeight): Command | null {
  const ids = new Set(trackIds);
  if (!project.tracks.some((track) => ids.has(track.id) && track.kind !== "caption" && track.height !== height)) return null;
  return {
    id: "track.height",
    label: "Track height",
    affects: ["tracks"],
    run(draft) {
      for (const track of draft.tracks) if (ids.has(track.id) && track.kind !== "caption") track.height = height;
    },
  };
}

const FLAG_COMMANDS: Record<TrackFlag, { id: string; on: string; off: string }> = {
  targeted: { id: "track.target", on: "Target track", off: "Untarget track" },
  locked: { id: "track.lock", on: "Lock track", off: "Unlock track" },
  muted: { id: "track.mute", on: "Mute track", off: "Unmute track" },
  solo: { id: "track.solo", on: "Solo track", off: "Unsolo track" },
  hidden: { id: "track.hide", on: "Hide track", off: "Show track" },
};

/** Which tracks a flag applies to (spec §6.12): solo is audio only, hide is for video and caption tracks. */
export function hasFlag(track: Pick<Track, "kind">, flag: TrackFlag): boolean {
  if (flag === "solo") return track.kind === "audio";
  if (flag === "hidden") return track.kind !== "audio";
  if (flag === "muted") return track.kind !== "caption";
  return true;
}

/**
 * Sets one flag on `trackIds` (the tracks it applies to), one undo step with the flag's own command id
 * (`track.lock`, `track.mute`...). Mute and solo also carry `audio` (the audio engine applies them while
 * playing). Null when nothing changes.
 */
export function setTrackFlag(project: Project, trackIds: readonly TrackId[], flag: TrackFlag, value: boolean): Command | null {
  const ids = new Set(trackIds);
  const changed = project.tracks.filter((track) => ids.has(track.id) && hasFlag(track, flag) && track[flag] !== value);
  if (changed.length === 0) return null;
  const names = FLAG_COMMANDS[flag];
  const label = value ? names.on : names.off;
  return {
    id: names.id,
    label: changed.length === 1 ? label : `${label.replace(/ track$/, "")} tracks`,
    affects: flag === "muted" || flag === "solo" ? ["tracks", "audio"] : ["tracks"],
    run(draft) {
      for (const track of draft.tracks) if (ids.has(track.id) && hasFlag(track, flag)) track[flag] = value;
    },
  };
}

/** Track menu "Mute all others" (spec §6.16): every other track of the clicked one's kind muted, it unmuted. One undo step. */
export function muteOthers(project: Project, trackId: TrackId): Command | null {
  const track = project.tracks.find((candidate) => candidate.id === trackId);
  if (!track || track.kind === "caption") return null;
  const wanted = (candidate: Track) => candidate.id !== trackId;
  const ofKind = project.tracks.filter((candidate) => candidate.kind === track.kind);
  if (ofKind.every((candidate) => candidate.muted === wanted(candidate))) return null;
  return {
    id: "track.muteOthers",
    label: "Mute all others",
    affects: ["tracks", "audio"],
    run(draft) {
      for (const candidate of draft.tracks) if (candidate.kind === track.kind) candidate.muted = wanted(candidate);
    },
  };
}

/** Track menu "Lock/Unlock all" (spec §6.16): every track locked, or all unlocked when every one already is. */
export function lockAll(project: Project): Command | null {
  if (project.tracks.length === 0) return null;
  const value = !project.tracks.every((track) => track.locked);
  return {
    id: value ? "track.lockAll" : "track.unlockAll",
    label: value ? "Lock all tracks" : "Unlock all tracks",
    affects: ["tracks"],
    run(draft) {
      for (const track of draft.tracks) track.locked = value;
    },
  };
}

/**
 * Moves a video or audio track to `lane` among the tracks of its kind (lane 0 = V1 at the bottom of the
 * video tracks, A1 at the top of the audio tracks; clamped). Video z-order follows (spec §6.12). Null
 * for a caption track, an unknown track or a move to the lane it is on.
 */
export function reorderTrack(project: Project, trackId: TrackId, lane: number): Command | null {
  const track = project.tracks.find((candidate) => candidate.id === trackId);
  if (!track || track.kind === "caption") return null;
  const kind: LaneKind = track.kind;
  const lanes = laneTracks(project.tracks, kind);
  const from = lanes.indexOf(track);
  const to = Math.min(Math.max(Math.round(lane), 0), lanes.length - 1);
  if (from === to) return null;
  return {
    id: "track.reorder",
    label: "Reorder track",
    affects: ["tracks"],
    run(draft) {
      // The tracks of the kind are rewritten in their own slots, so the other kinds keep theirs.
      const base = original(draft.tracks) as readonly Track[];
      const slots = base.flatMap((candidate, index) => (candidate.kind === kind ? [index] : []));
      const order = slots.map((slot) => base[slot] as Track);
      const [moved] = order.splice(from, 1);
      order.splice(to, 0, moved as Track);
      slots.forEach((slot, i) => {
        draft.tracks[slot] = order[i] as Track;
      });
    },
  };
}

/**
 * Adds an empty track of `kind` (spec §6.12, §6.16 "Add video track above/below, Add audio track"):
 * next to `relativeTo` (a track of the same kind; `above` = one lane further from the divider for video,
 * closer to it for audio), else where new tracks of the kind go (top video track, bottom audio track).
 */
export function addTrackNear(project: Project, kind: Exclude<TrackKind, "caption">, relativeTo: TrackId | null, side: "above" | "below", id: TrackId): Command {
  const at = relativeTo === null ? -1 : project.tracks.findIndex((track) => track.id === relativeTo && track.kind === kind);
  let index = defaultTrackIndex(project.tracks, kind);
  // Video lanes count up with the index (V1 at index 0), audio lanes count down the screen with it.
  if (at !== -1) index = kind === "video" ? (side === "above" ? at + 1 : at) : side === "above" ? at : at + 1;
  const command = addTrack(emptyTrack(id, kind, nextTrackName(project.tracks, kind)), index);
  return { ...command, label: kind === "video" ? "Add video track" : "Add audio track" };
}

export interface DeleteTracksResult {
  command: Command | null;
  /** A locked track among them: nothing is deleted (spec §6.11 "refuses if locked"). */
  locked: Track | null;
}

/**
 * Deletes tracks with their clips (spec §6.11: via the track header menu; refuses if any is locked).
 * Clips left as the only member of a link group or a group lose it (their partners went with the
 * track). One undo step.
 */
export function deleteTracks(project: Project, trackIds: readonly TrackId[], options: { label?: string } = {}): DeleteTracksResult {
  const ids = new Set(trackIds);
  const tracks = project.tracks.filter((track) => ids.has(track.id));
  const locked = tracks.find((track) => track.locked) ?? null;
  if (locked || tracks.length === 0) return { command: null, locked };
  const removed = new Set<ClipId>(tracks.flatMap((track) => track.clipIds));
  // Link groups and groups by the clips that stay.
  const members = (field: "linkGroup" | "group") => {
    const count = new Map<string, number>();
    for (const clip of Object.values(project.clips)) {
      const group = clip[field];
      if (group !== undefined && !removed.has(clip.id)) count.set(group, (count.get(group) ?? 0) + 1);
    }
    return count;
  };
  const links = members("linkGroup");
  const groups = members("group");
  return {
    locked: null,
    command: {
      id: "track.delete",
      label: options.label ?? (tracks.length === 1 ? "Delete track" : "Delete tracks"),
      affects: ["tracks", "clips", "timeline", "captions", "audio"],
      run(draft) {
        draft.tracks = draft.tracks.filter((track) => !ids.has(track.id));
        for (const clipId of removed) delete draft.clips[clipId];
        for (const trackId of ids) delete draft.captionTracks[trackId];
        for (const clip of Object.values(draft.clips)) {
          if (clip.linkGroup !== undefined && (links.get(clip.linkGroup) ?? 0) < 2) delete clip.linkGroup;
          if (clip.group !== undefined && (groups.get(clip.group) ?? 0) < 2) delete clip.group;
        }
      },
    },
  };
}

/**
 * Track menu "Delete empty tracks" (spec §6.11, §6.16): every unlocked track with no clips, except that
 * the lowest video track and the first audio track stay when every track of their kind is empty (so
 * the timeline keeps a row of each kind to drop onto). One undo step; null when there is none.
 */
export function deleteEmptyTracks(project: Project): Command | null {
  const empty = project.tracks.filter((track) => !track.locked && track.clipIds.length === 0);
  const keep = new Set<TrackId>();
  for (const kind of ["video", "audio"] as const) {
    const ofKind = project.tracks.filter((track) => track.kind === kind);
    const first = ofKind[0];
    if (first && ofKind.every((track) => empty.includes(track))) keep.add(first.id);
  }
  const ids = empty.filter((track) => !keep.has(track.id)).map((track) => track.id);
  return ids.length > 0 ? deleteTracks(project, ids, { label: "Delete empty tracks" }).command : null;
}
