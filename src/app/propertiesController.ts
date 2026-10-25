// Properties panel actions (spec §11, §17 quick row; §7.2 canvas menu; §6.16 clip menu; §18 Mod+D):
// the one-click transforms of the selected layers (Fit, Fill, Center, Flip H / V, Reset), Duplicate
// (one clip, Batch 25; Batch 39 extends it), Enable/Disable, and the Clip section's edits (time
// fields as trims without ripple, the enabled switch, the name). Each edit is one command. The number
// fields' bindings (panels/properties/bindings.ts) write through `liveEdit` and the document store.
import { updateClip } from "../core/commands/basicCommands.js";
import { canChangeFrameRate, setBackground, setFrameRate, setResolution } from "../core/commands/projectCommands.js";
import { formatHexColor } from "../core/document/color.js";
import type { ClipId, Rational, RGBA } from "../core/document/types.js";
import { pushRecentColor } from "../project/appSettings.js";
import { selectClips, toSnapshot } from "../core/store/selection.js";
import { retimeClips, setEnabled, type ClipTimeField } from "../timeline/edit/clipProps.js";
import { duplicateClip } from "../timeline/edit/duplicate.js";
import { quickTransforms, type QuickTransform } from "../timeline/edit/transform.js";
import { isClipLocked } from "../timeline/model/queries.js";
import { MAX_CLIP_NAME } from "./cutController.js";
import { liveEdit, NO_LIVE_EDIT } from "./liveEdit.js";
import { actions, appSettings, documentStore, sessionStore } from "./services.js";
import { reportTrimLimit } from "./timelineController.js";

const newId = () => crypto.randomUUID();

/** The selected clips and the primary one (a clip selection; otherwise none). */
function selectedClips(): { ids: ClipId[]; primary: ClipId | null } {
  const selection = sessionStore.selection.getState();
  return selection.kind === "clips" ? { ids: [...selection.clipIds], primary: selection.primary } : { ids: [], primary: null };
}

/** Fit, Fill, Center, Flip H / V or Reset on the selected layers (spec §7.2, §11): one undo step. */
export function quickTransform(action: QuickTransform): void {
  const command = quickTransforms(documentStore.getState(), selectedClips().ids, action);
  if (command) documentStore.dispatch(command);
}

/** Duplicate (spec §11, §18 Mod+D): the primary clip copied into the next free spot after it on its track; the copy is selected. */
function duplicate(): void {
  const { ids, primary } = selectedClips();
  const clipId = primary ?? ids[0];
  if (clipId === undefined) return;
  const result = duplicateClip(documentStore.getState(), clipId, newId);
  if (result) documentStore.dispatch(result.command, { selection: toSnapshot(selectClips([result.clipId])) });
}

/** Enables or disables clips (the Clip section's switch): one undo step. */
export function setClipsEnabled(ids: readonly ClipId[], enabled: boolean): void {
  const command = setEnabled(documentStore.getState(), ids, enabled);
  if (command) documentStore.dispatch(command);
}

/** Enable/Disable (spec §6.16): disables the selected clips when any is enabled, else enables them. */
function toggleEnabled(): void {
  const project = documentStore.getState();
  const { ids } = selectedClips();
  setClipsEnabled(ids, !ids.some((id) => project.clips[id]?.enabled === true));
}

/**
 * The Clip section's start, end, duration and source in / out (spec §11): each clip trimmed (no ripple,
 * linked partners with it while Linked selection is on) so the field reads `value`, as one undo step.
 * A media bound or a neighbor that stopped it short gets the trim toast.
 */
export function retime(ids: readonly ClipId[], field: ClipTimeField, value: number): void {
  const result = retimeClips(documentStore.getState(), ids, field, value, { linked: sessionStore.state.getState().linkedSelection });
  if (result.limit) reportTrimLimit(result.limit);
  if (result.command) documentStore.dispatch(result.command);
}

/** The Clip section's name: every given clip renamed (one undo step); a name left empty is ignored. */
export function renameClips(ids: readonly ClipId[], name: string): void {
  const clean = name.replace(/\s+/g, " ").trim().slice(0, MAX_CLIP_NAME);
  if (clean === "") return;
  const project = documentStore.getState();
  const changed = ids.filter((id) => project.clips[id] !== undefined && project.clips[id].name !== clean && !isClipLocked(project, id));
  if (changed.length === 0) return;
  documentStore.transaction(changed.length === 1 ? "Rename clip" : "Rename clips", () => {
    for (const id of changed) documentStore.dispatch(updateClip(id, { name: clean }));
  });
}

/**
 * A new frame size from the Project section (spec §15 "changing resolution offers scale layout or
 * keep"): the conversion flow's placeholder. TODO(batch 42): the Scale layout / Keep dialog; until
 * then the layout is scaled with the frame (one undo step).
 */
export function changeResolution(width: number, height: number): void {
  const { settings } = documentStore.getState();
  if (width !== settings.width || height !== settings.height) documentStore.dispatch(setResolution(width, height, { scaleLayout: true }));
}

/**
 * A new frame rate from the Project section. TODO(batch 42): the conversion of every frame value by
 * the rational ratio (§15); until then the rate changes only while the timeline has no clips or markers.
 */
export function changeFrameRate(fps: Rational): void {
  if (canChangeFrameRate(documentStore.getState())) documentStore.dispatch(setFrameRate(fps));
}

/** The project background (one undo step); the color joins the picker's recent colors. */
export function changeBackground(color: RGBA): void {
  documentStore.dispatch(setBackground(color));
  rememberColor(color);
}

/** The color picker dragged over the background: shown live (P2), or null when the drag ends. */
export function previewBackground(color: RGBA | null): void {
  const current = liveEdit.getState();
  if (current.background !== color) liveEdit.set(color === null && current.transforms === null && current.opacities === null ? NO_LIVE_EDIT : { ...current, background: color });
}

/** A picked color first in the picker's recent colors (app settings). */
export function rememberColor(color: RGBA): void {
  const recentColors = pushRecentColor(appSettings.getState().recentColors, formatHexColor(color));
  void appSettings.update({ recentColors });
}

/** Registers the properties actions. Returns a stop function. */
export function installPropertiesController(): () => void {
  const stops = [
    actions.register("transform.fit", () => quickTransform("fit")),
    actions.register("transform.fill", () => quickTransform("fill")),
    actions.register("transform.center", () => quickTransform("center")),
    actions.register("transform.flipH", () => quickTransform("flipH")),
    actions.register("transform.flipV", () => quickTransform("flipV")),
    actions.register("transform.reset", () => quickTransform("reset")),
    actions.register("edit.duplicate", duplicate),
    actions.register("clip.toggleEnabled", toggleEnabled),
  ];
  return () => {
    for (const stop of stops) stop();
  };
}
