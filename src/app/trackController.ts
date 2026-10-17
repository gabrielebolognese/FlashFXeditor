// Tracks, links and groups (spec §6.12, §6.16, §6.7): the track header toggles (target, lock, mute,
// solo, hide, height), track reorder and inline rename, the track context menu's actions, track heights
// (`Mod+Alt+Up/Down` and the toolbar cycle: session state, applied with no undo step), Linked selection
// (`Shift+S`), link / unlink (`Mod+L`), group / ungroup (`Mod+G`, `Mod+Shift+G`) and Move into sync.
// Every document edit is one command (one undo step) built by the pure edits in `timeline/edit`.
import { updateTrack } from "../core/commands/basicCommands.js";
import type { CommandRun } from "../core/commands/CommandRegistry.js";
import type { ClipId, Project, Track, TrackId } from "../core/document/types.js";
import { createStore } from "../core/store/createStore.js";
import { EMPTY_SELECTION, selectClips, selectedTrackIds, toSnapshot, type Selection } from "../core/store/selection.js";
import { selectEditPoint, selectGap, setSelection } from "../core/store/sessionStore.js";
import { groupClips, moveIntoSync, toggleLink, ungroupClips } from "../timeline/edit/links.js";
import type { MoveResult } from "../timeline/edit/move.js";
import {
  addTrackNear,
  cycleHeight,
  deleteEmptyTracks,
  deleteTracks,
  lockAll,
  muteOthers,
  nextHeightForAll,
  reorderTrack,
  setTrackFlag,
  setTrackHeights,
  type TrackFlag,
  type TrackHeight,
} from "../timeline/edit/tracks.js";
import type { HeaderToggle } from "../timeline/view/geometry.js";
import { showToast } from "../ui/toasts.js";
import { timelineMenu } from "./cutController.js";
import { actions, documentStore, sessionStore } from "./services.js";

/** Longest track name kept by a rename (as for clip and media names). */
export const MAX_TRACK_NAME = 255;

const newId = () => crypto.randomUUID();

const FLAGS: Record<Exclude<HeaderToggle, "height">, TrackFlag> = { target: "targeted", lock: "locked", mute: "muted", solo: "solo", hide: "hidden" };

const trackById = (project: Project, trackId: TrackId): Track | undefined => project.tracks.find((track) => track.id === trackId);

/** The selected clip ids (none for a track or cue selection) and the primary. */
function selectedClips(): { ids: ClipId[]; primary: ClipId | null } {
  const selection = sessionStore.selection.getState();
  return selection.kind === "clips" ? { ids: [...selection.clipIds], primary: selection.primary } : { ids: [], primary: null };
}

/** The selection without the clips on `trackId` (locking it: spec §6.12, no selection on a locked track). */
function withoutTrackClips(selection: Selection, project: Project, trackId: TrackId): Selection {
  if (selection.kind !== "clips") return selection;
  const kept = [...selection.clipIds].filter((id) => project.clips[id]?.trackId !== trackId);
  return kept.length === selection.clipIds.size ? selection : selectClips(kept, selection.primary);
}

/** Sets track heights (session state: no undo step, spec §5.3), each track to its own next height. */
function applyHeights(heights: ReadonlyMap<TrackId, TrackHeight>): void {
  const byHeight = new Map<TrackHeight, TrackId[]>();
  for (const [trackId, height] of heights) byHeight.set(height, [...(byHeight.get(height) ?? []), trackId]);
  for (const [height, ids] of byHeight) {
    const command = setTrackHeights(documentStore.getState(), ids, height);
    if (command) documentStore.amend(command);
  }
}

/**
 * A track header toggle was clicked (spec §6.1, §6.12): its flag flips (one undo step, the audio engine
 * applies mute and solo at once while playing); the height toggle cycles S -> M -> L. Locking a track
 * drops its clips (and a gap or edit point on it) from the selection.
 */
export function toggleTrack(trackId: TrackId, toggle: HeaderToggle): void {
  const project = documentStore.getState();
  const track = trackById(project, trackId);
  if (!track) return;
  if (toggle === "height") {
    applyHeights(new Map([[trackId, cycleHeight(track.height, "up")]]));
    return;
  }
  const flag = FLAGS[toggle];
  const command = setTrackFlag(project, [trackId], flag, !track[flag]);
  if (!command) return;
  if (flag !== "locked" || track.locked) {
    documentStore.dispatch(command);
    return;
  }
  const gap = sessionStore.gap.getState();
  if (gap?.trackId === trackId) selectGap(sessionStore, null);
  const point = sessionStore.editPoint.getState();
  if (point && project.clips[point.left]?.trackId === trackId) selectEditPoint(sessionStore, null);
  documentStore.dispatch(command, { selection: toSnapshot(withoutTrackClips(sessionStore.selection.getState(), project, trackId)) });
}

/** The properties panel's Track section (spec §11): one flag on every given track, one undo step. */
export function setTracksFlag(trackIds: readonly TrackId[], flag: TrackFlag, value: boolean): void {
  const project = documentStore.getState();
  const command = setTrackFlag(project, trackIds, flag, value);
  if (!command) return;
  let selection = sessionStore.selection.getState();
  if (flag === "locked" && value) for (const trackId of trackIds) selection = withoutTrackClips(selection, project, trackId);
  documentStore.dispatch(command, { selection: toSnapshot(selection) });
}

/** The properties panel's Track section: the height of every given track (session state, no undo step). */
export function setTracksHeight(trackIds: readonly TrackId[], height: TrackHeight): void {
  applyHeights(new Map(trackIds.map((id) => [id, height])));
}

/** Renames a track (one undo step); blank names are ignored. */
export function renameTrack(trackId: TrackId, name: string): void {
  const track = trackById(documentStore.getState(), trackId);
  const clean = name.replace(/\s+/g, " ").trim().slice(0, MAX_TRACK_NAME);
  if (track && clean && clean !== track.name) documentStore.dispatch(updateTrack(trackId, { name: clean }, "Rename track"));
}

/** A track header was dropped on `lane` (spec §6.12: video z-order follows). One undo step. */
export function moveTrackTo(trackId: TrackId, lane: number): void {
  const command = reorderTrack(documentStore.getState(), trackId, lane);
  if (command) documentStore.dispatch(command);
}

// --- Rename --------------------------------------------------------------------------------------

/** The track whose name is being edited inline in its header (double-click, F2, menu Rename), or null. */
export const trackRename = createStore<TrackId | null>(null);

export function startTrackRename(trackId: TrackId): void {
  if (trackById(documentStore.getState(), trackId)) trackRename.set(trackId);
}

/** Ends the inline rename; `name` null cancels. One undoable command when the name changed. */
export function finishTrackRename(trackId: TrackId, name: string | null): void {
  if (trackRename.getState() === trackId) trackRename.set(null);
  if (name !== null) renameTrack(trackId, name);
}

// --- Track menu ----------------------------------------------------------------------------------

/** The track a track menu row acts on: the menu's track while it is open, else the first selected track. */
function menuTrack(): TrackId | null {
  const menu = timelineMenu.getState();
  if (menu?.kind === "track") return menu.trackId;
  return selectedTrackIds(sessionStore.selection.getState())[0] ?? null;
}

/** The tracks the track actions apply to: the selected tracks (the menu's track among them), else the menu's track. */
function actionTracks(): TrackId[] {
  const selected = selectedTrackIds(sessionStore.selection.getState());
  const menu = menuTrack();
  return menu !== null && !selected.includes(menu) ? [menu] : selected;
}

function addTrackAction(kind: "video" | "audio", side: "above" | "below" | null): CommandRun {
  return () => {
    const project = documentStore.getState();
    const relative = side !== null ? menuTrack() : null;
    const near = relative !== null && trackById(project, relative)?.kind === kind ? relative : null;
    documentStore.dispatch(addTrackNear(project, kind, near, side ?? "above", newId()));
  };
}

/** Track menu "Delete track" (spec §6.11): refused with a toast when a track is locked. */
const deleteTrackAction: CommandRun = () => {
  const result = deleteTracks(documentStore.getState(), actionTracks());
  if (result.locked) {
    showToast({ tone: "error", message: "Can't delete a locked track", detail: `${result.locked.name} is locked. Unlock it to delete it.` });
    return;
  }
  if (result.command) documentStore.dispatch(result.command, { selection: toSnapshot(EMPTY_SELECTION) });
};

const deleteEmptyAction: CommandRun = () => {
  const command = deleteEmptyTracks(documentStore.getState());
  if (command) documentStore.dispatch(command, { selection: toSnapshot(EMPTY_SELECTION) });
  else showToast({ tone: "info", message: "No empty tracks to delete", detail: "Unlocked tracks without clips are deleted; one video and one audio track always stay." });
};

function heightAction(height: TrackHeight): CommandRun {
  return () => applyHeights(new Map(actionTracks().map((id) => [id, height])));
}

/** Track menu "Select all clips on track" (spec §6.16; also Mod+Shift+click on the header). */
const selectTrackClips: CommandRun = () => {
  const track = trackById(documentStore.getState(), menuTrack() ?? "");
  if (track && !track.locked) setSelection(sessionStore, selectClips(track.clipIds));
};

// --- Heights -------------------------------------------------------------------------------------

/**
 * `Mod+Alt+Up/Down` (spec §6.12): each selected track to its next taller / shorter preset (wrapping);
 * with no track selected, the tracks of the selected clips, else every track.
 */
function cycleSelectedHeights(direction: "up" | "down"): CommandRun {
  return () => {
    const project = documentStore.getState();
    const { ids } = selectedClips();
    let trackIds = selectedTrackIds(sessionStore.selection.getState());
    if (trackIds.length === 0) trackIds = [...new Set(ids.map((id) => project.clips[id]?.trackId).filter((id): id is TrackId => id !== undefined))];
    if (trackIds.length === 0) trackIds = project.tracks.map((track) => track.id);
    const heights = new Map<TrackId, TrackHeight>();
    for (const trackId of trackIds) {
      const track = trackById(project, trackId);
      if (track && track.kind !== "caption") heights.set(trackId, cycleHeight(track.height, direction));
    }
    applyHeights(heights);
  };
}

/** The toolbar's Track height button (spec §6.12: cycles all tracks together). */
const cycleAllHeights: CommandRun = () => {
  const { tracks } = documentStore.getState();
  const next = nextHeightForAll(tracks.filter((track) => track.kind !== "caption"));
  applyHeights(new Map(tracks.map((track) => [track.id, next])));
};

// --- Links and groups ----------------------------------------------------------------------------

/** `Mod+L` (spec §6.12): unlink the selection's link groups, or link a selected video + audio set. The selection stays. */
const toggleLinkAction: CommandRun = () => {
  const result = toggleLink(documentStore.getState(), selectedClips().ids, newId);
  if (result.kind === "refused") {
    if (result.reason === "needsPair") showToast({ tone: "info", message: "Select a video and an audio clip to link", detail: "Linked clips sit on different tracks: at least one audio clip and one clip on a video track." });
    return;
  }
  documentStore.dispatch(result.command);
};

/** "Move into sync" (spec §6.12): the clip the menu was opened on, else the primary selected clip. */
const moveIntoSyncAction: CommandRun = () => {
  const menu = timelineMenu.getState();
  const clipId = menu?.kind === "clip" ? menu.clipId : selectedClips().primary;
  if (clipId === null) return;
  const result: MoveResult | null = moveIntoSync(documentStore.getState(), clipId, newId);
  if (result?.kind === "refused") showToast({ tone: "error", message: "Can't move the clip into sync", detail: "Its track is locked." });
  if (result?.kind === "ok") documentStore.dispatch(result.command);
};

/** Registers the track, link and group actions. Returns a stop function. */
export function installTrackController(): () => void {
  const stops = [
    actions.register("toggle.linkedSelection", () => sessionStore.state.set((state) => ({ ...state, linkedSelection: !state.linkedSelection }))),
    actions.register("edit.toggleLink", toggleLinkAction),
    actions.register("edit.group", () => {
      const command = groupClips(documentStore.getState(), selectedClips().ids, newId);
      if (command) documentStore.dispatch(command);
    }),
    actions.register("edit.ungroup", () => {
      const command = ungroupClips(documentStore.getState(), selectedClips().ids);
      if (command) documentStore.dispatch(command);
    }),
    actions.register("edit.moveIntoSync", moveIntoSyncAction),
    actions.register("timeline.trackHeightUp", cycleSelectedHeights("up")),
    actions.register("timeline.trackHeightDown", cycleSelectedHeights("down")),
    actions.register("timeline.trackHeightCycle", cycleAllHeights),
    actions.register("track.addVideoAbove", addTrackAction("video", "above")),
    actions.register("track.addVideoBelow", addTrackAction("video", "below")),
    actions.register("track.addVideo", addTrackAction("video", null)),
    actions.register("track.addAudioAbove", addTrackAction("audio", "above")),
    actions.register("track.addAudioBelow", addTrackAction("audio", "below")),
    actions.register("track.addAudio", addTrackAction("audio", null)),
    actions.register("track.rename", () => {
      const trackId = menuTrack();
      if (trackId !== null) startTrackRename(trackId);
    }),
    actions.register("track.delete", deleteTrackAction),
    actions.register("track.deleteEmpty", deleteEmptyAction),
    actions.register("track.heightS", heightAction("S")),
    actions.register("track.heightM", heightAction("M")),
    actions.register("track.heightL", heightAction("L")),
    actions.register("track.selectClips", selectTrackClips),
    actions.register("track.lockAll", () => {
      const command = lockAll(documentStore.getState());
      // Locking every track leaves nothing selectable.
      if (command) documentStore.dispatch(command, command.id === "track.lockAll" ? { selection: toSnapshot(EMPTY_SELECTION) } : {});
    }),
    actions.register("track.muteOthers", () => {
      const trackId = menuTrack();
      const command = trackId !== null ? muteOthers(documentStore.getState(), trackId) : null;
      if (command) documentStore.dispatch(command);
    }),
    // A track renamed inline that an edit removed (undo of its insert) closes its field.
    documentStore.subscribe(
      (state) => {
        const renaming = trackRename.getState();
        if (renaming !== null && !trackById(state, renaming)) trackRename.set(null);
      },
      { affects: ["tracks"] },
    ),
  ];
  return () => {
    for (const stop of stops) stop();
    trackRename.set(null);
  };
}
