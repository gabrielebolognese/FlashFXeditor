// Pacing actions (Batch 27; spec §11 Speed section and quick row, §6.1 toolbar, §6.16 clip menu, §18):
// speed changes of the selected clips (the Speed section's field and duration, the 0.5x / 1x / 1.5x /
// 2x chips) with the section's options (duration link, ripple), Freeze frame (Shift+F) and Punch zoom
// (Shift+Z) at the playhead, and the clip menu's "Speed..." (opens the Speed section on the field).
// Each edit is one command built by the pure edits in timeline/edit (speed.ts, freeze.ts); a limit that
// stopped one short, or a one-click with nothing to act on, gets a toast.
import type { ClipId, MediaClip } from "../core/document/types.js";
import { createStore } from "../core/store/createStore.js";
import { selectClips, toSnapshot } from "../core/store/selection.js";
import { setSectionCollapsed } from "../core/store/sessionStore.js";
import { freezeFrame, punchZoom, type OneClickMiss } from "../timeline/edit/freeze.js";
import { setSpeedDurations, setSpeeds, type SpeedOptions } from "../timeline/edit/speed.js";
import type { TrimLimit } from "../timeline/edit/trim.js";
import { showToast } from "../ui/toasts.js";
import { actions, appSettings, documentStore, sessionStore } from "./services.js";
import { reportTrimLimit } from "./timelineController.js";

/** The Speed section's options for the session (not persisted): the duration follows the speed, later clips ripple. */
export const speedOptions = createStore<{ link: boolean; ripple: boolean }>({ link: true, ripple: true });

/** Bumped by "Speed...": the Speed section focuses its speed field (and resets it to 0). */
export const speedFocus = createStore(0);

/** The quick row's speed chips (spec §17): action id suffix and speed. */
export const SPEED_CHIPS: readonly { id: string; speed: number }[] = [
  { id: "clip.speed.50", speed: 0.5 },
  { id: "clip.speed.100", speed: 1 },
  { id: "clip.speed.150", speed: 1.5 },
  { id: "clip.speed.200", speed: 2 },
];

const newId = () => crypto.randomUUID();
const playhead = () => sessionStore.state.getState().playhead;

function options(): SpeedOptions {
  const { link, ripple } = speedOptions.getState();
  return { link, ripple, linked: sessionStore.state.getState().linkedSelection };
}

function selectedIds(): ClipId[] {
  const selection = sessionStore.selection.getState();
  return selection.kind === "clips" ? [...selection.clipIds] : [];
}

/** Why a speed change stopped a clip short, as a toast (the duration field's limits are trims: `reportTrimLimit`). */
function reportSpeedLimit(limit: TrimLimit): void {
  const project = documentStore.getState();
  const clip = project.clips[limit.clipId]?.name ?? "The clip";
  const track = project.tracks.find((candidate) => candidate.id === limit.trackId)?.name ?? "a track";
  switch (limit.reason) {
    case "mediaEnd":
      // Shortened to the media end, or, with less than one frame left, the speed kept.
      showToast({ tone: "info", message: "Limited by the media end", detail: `${clip} has no more frames at this speed.` });
      return;
    case "neighbor":
      showToast({ tone: "info", message: "Shortened at the next clip", detail: `${clip} stops where the next clip on ${track} starts. Turn on Ripple to move later clips.` });
      return;
    case "ripple":
      showToast({ tone: "info", message: `Ripple stopped by ${track}`, detail: `Clips on ${track} can't move back further without overlapping, so a gap stays.` });
      return;
    default:
      reportTrimLimit(limit);
  }
}

/** Sets the speed of `ids` (the selected clips by default): one undo step; arrow steps pass a coalesce key. */
export function applySpeed(ids: readonly ClipId[], speed: number | ((clip: MediaClip) => number), coalesceKey?: string): void {
  const result = setSpeeds(documentStore.getState(), ids, speed, options());
  if (result.limit) reportSpeedLimit(result.limit);
  if (result.command) documentStore.dispatch(coalesceKey === undefined ? result.command : { ...result.command, coalesceKey });
}

/** The Speed section's duration (frames): one undo step. */
export function applySpeedDuration(ids: readonly ClipId[], duration: number): void {
  const result = setSpeedDurations(documentStore.getState(), ids, duration, options());
  if (result.limit) reportTrimLimit(result.limit);
  if (result.command) documentStore.dispatch(result.command);
}

export function toggleSpeedLink(): void {
  speedOptions.set((state) => ({ ...state, link: !state.link }));
}

export function setSpeedRipple(ripple: boolean): void {
  speedOptions.set((state) => (state.ripple === ripple ? state : { ...state, ripple }));
}

function reportMiss(miss: OneClickMiss, what: "freeze" | "zoom"): void {
  if (miss === "notUnderPlayhead") {
    showToast({ tone: "info", message: "The playhead is not over the selected clip", detail: what === "freeze" ? "Move the playhead to the frame to freeze." : "Move the playhead to where the zoom should cut in." });
    return;
  }
  showToast(
    what === "freeze"
      ? { tone: "info", message: "No video under the playhead", detail: "Move the playhead over a video clip, or select one." }
      : { tone: "info", message: "No picture under the playhead", detail: "Move the playhead over a video or image clip, or select a layer." },
  );
}

/** Freeze frame (Shift+F): the freezes are selected. */
function freezeAtPlayhead(): void {
  const result = freezeFrame(documentStore.getState(), playhead(), selectedIds(), newId);
  if (typeof result === "string") return reportMiss(result, "freeze");
  documentStore.dispatch(result.command, { selection: toSnapshot(selectClips(result.freezeIds, result.freezeIds[0] ?? null)) });
}

/** Punch zoom (Shift+Z): the zoomed pieces are selected. TODO(batch 35): `punchZoomAnimated`. */
function punchZoomAtPlayhead(): void {
  const factor = appSettings.getState().punchZoomScale;
  const result = punchZoom(documentStore.getState(), playhead(), selectedIds(), factor, newId, { linked: sessionStore.state.getState().linkedSelection });
  if (typeof result === "string") return reportMiss(result, "zoom");
  documentStore.dispatch(result.command, { selection: toSnapshot(selectClips(result.zoomedIds, result.zoomedIds[0] ?? null)) });
}

/** "Speed..." (spec §6.16): the Speed section opens (expanded) with its speed field focused. */
function openSpeedSection(): void {
  setSectionCollapsed(sessionStore, "speed", false);
  speedFocus.set((count) => count + 1);
}

/** Registers the pacing actions. Returns a stop function. */
export function installSpeedController(): () => void {
  const stops = [
    actions.register("edit.freezeFrame", freezeAtPlayhead),
    actions.register("edit.punchZoom", punchZoomAtPlayhead),
    actions.register("clip.speedPanel", openSpeedSection),
    ...SPEED_CHIPS.map((chip) => actions.register(chip.id, () => applySpeed(selectedIds(), chip.speed))),
  ];
  return () => {
    for (const stop of stops) stop();
  };
}
