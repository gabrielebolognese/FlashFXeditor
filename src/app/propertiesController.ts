// Properties panel actions (spec §11, §17 quick row; §7.2 canvas menu; §6.16 clip menu): the one-click
// transforms of the selected layers (Fit, Fill, Center, Flip H / V, Reset), Enable/Disable, the Clip
// section's edits (time fields as trims without ripple, the enabled switch, the name), and the Crop
// section's (Batch 26): Crop to frame, Reset crop, the crop mode toggle and the aspect lock. Each edit
// is one command. The number fields' bindings (panels/properties/bindings.ts) write through `liveEdit`
// and the document store. Duplicate (the quick row, Mod+D) is the clipboard controller's (Batch 39).
import { updateClip } from "../core/commands/basicCommands.js";
import { setBackground, setPerspective } from "../core/commands/projectCommands.js";
import { backfaceHiddenAll, depthSortOf, resetDepth, setBackfaceHidden, setDepthSort } from "../timeline/edit/depth.js";
import { matteOnlyOf, setBlend, setMatte, setMatteOnly } from "../timeline/edit/compositing.js";
import { formatHexColor } from "../core/document/color.js";
import { BLEND_MODES, EFFECT_TYPES, type BlendMode, type ClipId, type RGBA } from "../core/document/types.js";
import { pushRecentColor } from "../project/appSettings.js";
import { retimeClips, setEnabled, type ClipTimeField } from "../timeline/edit/clipProps.js";
import { isCropClip, quickCrops, type QuickCrop } from "../timeline/edit/crop.js";
import { addNull, convertFromMotionPath, convertToMotionPath, onMotionPath, setAutoOrient, setParent, smoothMotionPath } from "../timeline/edit/rig.js";
import { isLayerClip, isTransformClip, quickTransforms, type QuickTransform } from "../timeline/edit/transform.js";
import { selectClips, toSnapshot } from "../core/store/selection.js";
import { isClipLocked } from "../timeline/model/queries.js";
import { projectSettingsLocked } from "./conversionController.js";
import { MAX_CLIP_NAME } from "./cutController.js";
import { patchLiveEdit } from "./liveEdit.js";
import { canvasInput, cropMode } from "./previewController.js";
import { addMasks, presetMasks, removeSelectedMasks } from "./maskController.js";
import { addEffects, applyLastLook, loadLutForSelection, removeSelectedEffects, saveLook } from "./effectController.js";
import { effectAddCommand } from "../panels/properties/effectIcons.js";
import { actions, appSettings, documentStore, sessionStore } from "./services.js";
import { reportTrimLimit } from "./timelineController.js";

/** The selected clips and the primary one (a clip selection; otherwise none). */
function selectedClips(): { ids: ClipId[]; primary: ClipId | null } {
  const selection = sessionStore.selection.getState();
  return selection.kind === "clips" ? { ids: [...selection.clipIds], primary: selection.primary } : { ids: [], primary: null };
}

/** Fit, Fill, Center, Flip H / V or Reset on the selected layers (spec §7.2, §11): one undo step. */
export function quickTransform(action: QuickTransform): void {
  const command = quickTransforms(documentStore.getState(), selectedClips().ids, action, sessionStore.state.getState().playhead);
  if (command) documentStore.dispatch(command);
}

/** `+ Null` (Batch 69): an invisible controller at the playhead, selected. */
export function addNullClip(): ClipId {
  const result = addNull(documentStore.getState(), sessionStore.state.getState().playhead, () => crypto.randomUUID());
  documentStore.dispatch(result.command, { selection: toSnapshot(selectClips([result.clipId])) });
  return result.clipId;
}

/** The Parent picker (Batch 69): the selected clips follow `parentId` (null clears), keeping their place at the playhead. */
export function changeParent(parentId: ClipId | null): void {
  const command = setParent(documentStore.getState(), selectedClips().ids, parentId, sessionStore.state.getState().playhead);
  if (command) documentStore.dispatch(command);
}

/** The Motion path toggle: x / y keys become one path (or a key at the playhead), or the path becomes x / y keys. */
export function toggleMotionPath(): void {
  const project = documentStore.getState();
  const ids = selectedClips().ids.filter((id) => {
    const clip = project.clips[id];
    return clip !== undefined && isTransformClip(clip);
  });
  const on = ids.length > 0 && ids.every((id) => onMotionPath(project.clips[id] as never));
  const command = on ? convertFromMotionPath(project, ids) : convertToMotionPath(project, ids, sessionStore.state.getState().playhead);
  if (command) documentStore.dispatch(command);
}

/** Auto tangents through every key of the selected motion paths. */
export function smoothPath(): void {
  const command = smoothMotionPath(documentStore.getState(), selectedClips().ids);
  if (command) documentStore.dispatch(command);
}

/** Hide back side on or off for the selected layers (on unless all already hide it; spec §21.15). */
export function toggleBackface(): void {
  const project = documentStore.getState();
  const ids = selectedClips().ids;
  const command = setBackfaceHidden(project, ids, !backfaceHiddenAll(project, ids));
  if (command) documentStore.dispatch(command);
}

/** Reset 3D (spec §21.15): the selected layers' X and Y rotations and depth back to 0. */
export function resetDepthRotation(): void {
  const command = resetDepth(documentStore.getState(), selectedClips().ids, sessionStore.state.getState().playhead);
  if (command) documentStore.dispatch(command);
}

/** The blend mode of the selected visual clips (spec §21.17). */
export function blendSelected(mode: BlendMode): void {
  const command = setBlend(documentStore.getState(), selectedClips().ids, mode);
  if (command) documentStore.dispatch(command);
}

/** Removes the track matte of the selected clips (spec §21.17). */
export function clearMatte(): void {
  const command = setMatte(documentStore.getState(), selectedClips().ids, null);
  if (command) documentStore.dispatch(command);
}

/** Matte only on or off for the selected clips (on unless all already are; spec §21.17). */
export function toggleMatteOnly(): void {
  const project = documentStore.getState();
  const ids = selectedClips().ids;
  const command = setMatteOnly(project, ids, matteOnlyOf(project, ids) !== true);
  if (command) documentStore.dispatch(command);
}

/** Depth sort on or off for the selected compounds' inner layers (spec §21.15). */
export function toggleDepthSort(): void {
  const project = documentStore.getState();
  const ids = selectedClips().ids;
  const command = setDepthSort(project, ids, depthSortOf(project, ids) !== true);
  if (command) documentStore.dispatch(command);
}

/** The viewing distance of the 2.5D layers (spec §21.15; null: none), the open compound's inside one. */
export function changePerspective(perspective: number | null): void {
  documentStore.dispatch(setPerspective(perspective));
}

/** Auto-orient on or off for the selected clips (on unless all already have it). */
export function toggleAutoOrient(): void {
  const project = documentStore.getState();
  const ids = selectedClips().ids.filter((id) => {
    const clip = project.clips[id];
    return clip !== undefined && isTransformClip(clip);
  });
  const on = ids.length > 0 && ids.every((id) => project.clips[id]?.autoOrient === true);
  const command = setAutoOrient(project, ids, !on);
  if (command) documentStore.dispatch(command);
}

/** Crop to frame or Reset crop on the selected video and image layers (spec §11): one undo step. */
export function quickCrop(action: QuickCrop): void {
  const command = quickCrops(documentStore.getState(), selectedClips().ids, action);
  if (command) documentStore.dispatch(command);
}

/**
 * Crop mode (spec §7.3, §11): off when on; on for the one layer selected when it is a video or image
 * (with other selected clips that are not layers: its linked audio).
 */
function toggleCropMode(): void {
  if (canvasInput.exitCropMode()) return;
  const project = documentStore.getState();
  const layers = selectedClips().ids.filter((id) => {
    const clip = project.clips[id];
    return clip !== undefined && isLayerClip(clip);
  });
  const only = layers.length === 1 ? project.clips[layers[0] as ClipId] : undefined;
  if (only && isCropClip(only)) canvasInput.enterCropMode(only.id);
}

/** The Crop section's aspect lock (the canvas crop handles use it too; Shift inverts it there). */
export function toggleCropLock(): void {
  cropMode.set((state) => ({ ...state, aspectLock: !state.aspectLock }));
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

/** The project background (one undo step); the color joins the picker's recent colors. */
export function changeBackground(color: RGBA): void {
  if (projectSettingsLocked()) return;
  documentStore.dispatch(setBackground(color));
  rememberColor(color);
}

/** The color picker dragged over the background: shown live (P2), or null when the drag ends. */
export function previewBackground(color: RGBA | null): void {
  patchLiveEdit({ background: color });
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
    actions.register("add.null", () => void addNullClip()),
    actions.register("clip.clearParent", () => changeParent(null)),
    actions.register("clip.motionPath", toggleMotionPath),
    actions.register("clip.smoothPath", smoothPath),
    actions.register("clip.autoOrient", toggleAutoOrient),
    actions.register("clip.backface", toggleBackface),
    actions.register("transform.reset3d", resetDepthRotation),
    actions.register("compound.depthSort", toggleDepthSort),
    ...BLEND_MODES.map((mode) => actions.register(`clip.blend.${mode}`, () => blendSelected(mode))),
    actions.register("clip.matte.clear", clearMatte),
    actions.register("clip.matteOnly", toggleMatteOnly),
    actions.register("clip.toggleEnabled", toggleEnabled),
    actions.register("crop.toFrame", () => quickCrop("frame")),
    actions.register("crop.reset", () => quickCrop("reset")),
    actions.register("crop.toggleMode", toggleCropMode),
    // Masks (Batch 73).
    actions.register("clip.mask.addRect", () => addMasks("rect")),
    actions.register("clip.mask.addEllipse", () => addMasks("ellipse")),
    actions.register("clip.mask.addPath", () => addMasks("path")),
    actions.register("clip.mask.wipeIn", () => presetMasks("wipeIn")),
    actions.register("clip.mask.circleReveal", () => presetMasks("circleReveal")),
    actions.register("clip.mask.removeAll", removeSelectedMasks),
    // Effects (Batch 74).
    ...EFFECT_TYPES.map((type) => actions.register(effectAddCommand(type), () => addEffects(type))),
    actions.register("clip.effect.removeAll", removeSelectedEffects),
    // LUTs and looks (Batch 75).
    actions.register("clip.effect.lut.load", () => void loadLutForSelection()),
    actions.register("clip.effect.saveLook", () => void saveLook()),
    actions.register("clip.effect.applyLastLook", () => void applyLastLook()),
  ];
  return () => {
    for (const stop of stops) stop();
  };
}
