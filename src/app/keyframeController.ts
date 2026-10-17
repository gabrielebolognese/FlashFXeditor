// Keyframe actions (spec §6.4, §6.15, §11; Batch 35), registered in the ActionRegistry (the command
// palette lists them from Batch 40): the timeline's Show clip keyframes toggle, the properties panel's
// stopwatch and navigator per section (`keyframes.<action>.<section>`), the Ease of the keys at the
// playhead, the lane's section per clip (clip menu "Show keyframes for"), and the selected keys'
// easing, delete, copy and paste (keyframe menu, Delete). Each edit is one command built by
// timeline/edit/keyframes.ts.
// - The stopwatch and the navigator act on the selected clips the section can key, at the playhead.
//   Turning a stopwatch on also turns Show clip keyframes on, so the new key shows on the lane.
// - Selected keys (the lane, `session.keyframes`) belong to one clip and one section; copy keeps them
//   in `keyframeClipboard` (in memory) and paste writes them on the selected clips from the playhead.
//   TODO(batch 39): Mod+C / Mod+V route to these while keys are selected.
import { KEYFRAME_SECTIONS, type KeyframeSection } from "../core/document/keyframes.js";
import { EASE_IDS, type ClipId, type EaseId } from "../core/document/types.js";
import { createStore } from "../core/store/createStore.js";
import { selectKeyframes, setPlayhead } from "../core/store/sessionStore.js";
import { adjacentKey, copyKeys, deleteKeys, pasteKeys, setKeysEase, setStopwatch, stopwatchOn, toggleKeyAt, type KeyframeClipboard } from "../timeline/edit/keyframes.js";
import { keyableIds } from "../panels/properties/keyframeBinding.js";
import { actions, documentStore, sessionStore } from "./services.js";

/** The sections with a stopwatch in the panel this batch (Volume's UI is Batch 37). */
export const PANEL_SECTIONS: readonly KeyframeSection[] = ["transform", "opacity"];

/** Copied keys (spec §6.15 copy/paste keyframes), or null. */
export const keyframeClipboard = createStore<KeyframeClipboard | null>(null);

const playhead = () => sessionStore.state.getState().playhead;

/** The selected clips `section` can key. */
function targets(section: KeyframeSection): ClipId[] {
  const selection = sessionStore.selection.getState();
  return selection.kind === "clips" ? keyableIds(documentStore.getState(), selection.clipIds, section) : [];
}

/** The stopwatch of `section` on the selected clips: on unless every one is animated already. */
export function toggleStopwatch(section: KeyframeSection): void {
  const ids = targets(section);
  const project = documentStore.getState();
  const on = !ids.every((id) => {
    const clip = project.clips[id];
    return clip !== undefined && stopwatchOn(clip, section);
  });
  const command = setStopwatch(project, ids, section, on, playhead());
  if (!command) return;
  documentStore.dispatch(command);
  if (on && !sessionStore.state.getState().clipKeyframes) sessionStore.state.set((state) => ({ ...state, clipKeyframes: true }));
}

/** Add / remove the key of `section` at the playhead on the selected clips. */
export function toggleKeyAtPlayhead(section: KeyframeSection): void {
  const command = toggleKeyAt(documentStore.getState(), targets(section), section, playhead());
  if (command) documentStore.dispatch(command);
}

/** The playhead to the previous (-1) or next (1) key of `section` on the selected clips. */
export function jumpToKey(section: KeyframeSection, direction: -1 | 1): void {
  const frame = adjacentKey(documentStore.getState(), targets(section), section, playhead(), direction);
  if (frame !== null) setPlayhead(sessionStore, frame);
}

/** The ease of the keys of `section` at the playhead on the selected clips (the panel's Ease dropdown). */
export function setEaseAtPlayhead(section: KeyframeSection, ease: EaseId): void {
  const at = playhead();
  const project = documentStore.getState();
  const frames = new Map<ClipId, number[]>();
  for (const id of targets(section)) {
    const clip = project.clips[id];
    if (clip && at >= clip.start && at < clip.start + clip.duration) frames.set(id, [at - clip.start]);
  }
  const command = setKeysEase(project, frames, section, ease);
  if (command) documentStore.dispatch(command);
}

/** The ease of the selected keys (keyframe menu). */
function easeSelected(ease: EaseId): void {
  const keys = sessionStore.keyframes.getState();
  if (!keys) return;
  const command = setKeysEase(documentStore.getState(), new Map([[keys.clipId, keys.frames]]), keys.section, ease);
  if (command) documentStore.dispatch(command);
}

/** Deletes the selected keys; false when none are selected (Delete then acts on the clips). */
export function deleteSelectedKeys(): boolean {
  const keys = sessionStore.keyframes.getState();
  if (!keys) return false;
  const command = deleteKeys(documentStore.getState(), keys.clipId, keys.section, keys.frames);
  selectKeyframes(sessionStore, null);
  if (command) documentStore.dispatch(command);
  return true;
}

function copySelected(): void {
  const keys = sessionStore.keyframes.getState();
  const clip = keys ? documentStore.getState().clips[keys.clipId] : undefined;
  if (!keys || !clip) return;
  const copied = copyKeys(clip, keys.section, keys.frames);
  if (copied) keyframeClipboard.set(copied);
}

function paste(): void {
  const clipboard = keyframeClipboard.getState();
  if (!clipboard) return;
  const command = pasteKeys(documentStore.getState(), targets(clipboard.section), clipboard, playhead());
  if (command) documentStore.dispatch(command);
}

/** The lane of the selected clips shows `section` (clip menu "Show keyframes for", spec §6.4). */
function showLane(section: KeyframeSection): void {
  const selection = sessionStore.selection.getState();
  if (selection.kind !== "clips") return;
  sessionStore.state.set((state) => {
    const keyframeLanes = { ...state.keyframeLanes };
    for (const id of selection.clipIds) {
      if (section === "transform") delete keyframeLanes[id];
      else keyframeLanes[id] = section;
    }
    return { ...state, keyframeLanes, clipKeyframes: true };
  });
  const keys = sessionStore.keyframes.getState();
  if (keys && keys.section !== section) selectKeyframes(sessionStore, null);
}

/** Registers the keyframe actions. Returns a stop function. */
export function installKeyframeController(): () => void {
  const stops = [
    actions.register("toggle.clipKeyframes", () => sessionStore.state.set((state) => ({ ...state, clipKeyframes: !state.clipKeyframes }))),
    ...PANEL_SECTIONS.flatMap((section) => [
      actions.register(`keyframes.stopwatch.${section}`, () => toggleStopwatch(section)),
      actions.register(`keyframes.toggle.${section}`, () => toggleKeyAtPlayhead(section)),
      actions.register(`keyframes.prev.${section}`, () => jumpToKey(section, -1)),
      actions.register(`keyframes.next.${section}`, () => jumpToKey(section, 1)),
    ]),
    ...KEYFRAME_SECTIONS.filter((section) => PANEL_SECTIONS.includes(section)).map((section) => actions.register(`keyframes.lane.${section}`, () => showLane(section))),
    ...EASE_IDS.map((ease) => actions.register(`keyframe.ease.${ease}`, () => easeSelected(ease))),
    actions.register("keyframe.delete", () => void deleteSelectedKeys()),
    actions.register("keyframe.copy", copySelected),
    actions.register("keyframe.paste", paste),
  ];
  return () => {
    for (const stop of stops) stop();
    keyframeClipboard.set(null);
  };
}
