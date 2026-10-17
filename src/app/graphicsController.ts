// Graphics in the app (spec §6.1, §11 Solid section, Batch 34): `+ Solid`, `+ Image` and the Solid
// section's edits.
// - `add.solid` adds the default solid (a white rounded rectangle, centered) at the playhead
//   (timeline/edit/solid.ts `addSolid`) and selects it.
// - `add.image` opens the file picker for images (spec §6.1 "opens file picker directly"); the picked
//   files are imported and placed at the playhead on the topmost video track (a new one when it is
//   taken), centered, 5 s long and fitted (§6.14, §6.19), in one undo step with the import ("Add image").
// - `editSolids` writes a change of the selected solids as one command; `previewSolids` shows one live
//   (a fill color dragged in the picker: ephemeral, P2).
import type { ClipId, SolidClip } from "../core/document/types.js";
import { selectClips, toSnapshot } from "../core/store/selection.js";
import { IMAGE_PICKER_TYPES } from "../media/mediaKinds.js";
import { addSolid, setSolids, solidLook, type SolidEdit, type SolidLook } from "../timeline/edit/solid.js";
import { isClipLocked } from "../timeline/model/queries.js";
import { dropMediaOnCanvas } from "./dropController.js";
import { patchLiveEdit } from "./liveEdit.js";
import { importFromPicker } from "./mediaController.js";
import { actions, documentStore, sessionStore } from "./services.js";

/** A solid's edit (null: leave the solid). */
export type SolidChange = (clip: SolidClip) => SolidEdit | null;

/** The unlocked solids among `ids`. */
function solidClips(ids: readonly ClipId[]): SolidClip[] {
  const project = documentStore.getState();
  const out: SolidClip[] = [];
  for (const id of ids) {
    const clip = project.clips[id];
    if (clip?.kind === "solid" && !isClipLocked(project, id)) out.push(clip);
  }
  return out;
}

/** `change` on the solids among `ids` as one undo step (`coalesceKey`: consecutive steps merge). */
export function editSolids(ids: readonly ClipId[], change: SolidChange, label: string, coalesceKey?: string): void {
  const edits = new Map<ClipId, SolidEdit>();
  for (const clip of solidClips(ids)) {
    const edit = change(clip);
    if (edit) edits.set(clip.id, edit);
  }
  const command = setSolids(documentStore.getState(), edits, { label, ...(coalesceKey !== undefined && { coalesceKey }) });
  if (command) documentStore.dispatch(command);
}

/** `change` shown live on the solids among `ids` (no document change, P2); null ends it. */
export function previewSolids(ids: readonly ClipId[], change: SolidChange | null): void {
  if (!change) {
    patchLiveEdit({ solids: null });
    return;
  }
  const solids = new Map<ClipId, SolidLook>();
  for (const clip of solidClips(ids)) {
    const edit = change(clip);
    if (!edit) continue;
    solids.set(clip.id, solidLook({ ...clip, ...edit }));
  }
  patchLiveEdit({ solids: solids.size > 0 ? solids : null });
}

/** `+ Solid` (spec §6.1): the default solid at the playhead, selected. Returns its id. */
export function addSolidClip(): ClipId {
  const project = documentStore.getState();
  const result = addSolid(project, sessionStore.state.getState().playhead, () => crypto.randomUUID());
  documentStore.dispatch(result.command, { selection: toSnapshot(selectClips([result.clipId])) });
  return result.clipId;
}

/** `+ Image` (spec §6.1): the image picker, then the picked images imported and placed at the playhead. Must run inside a user gesture. */
export function addImageClips(): Promise<void> {
  return importFromPicker({
    types: IMAGE_PICKER_TYPES,
    id: "shorts-editor-images",
    placement: { label: "Add image", place: (added) => dropMediaOnCanvas(added.filter((item) => item.kind === "image").map((item) => item.id), null) },
  });
}

/** Registers `+ Solid` and `+ Image`. Returns a stop function. */
export function installGraphicsController(): () => void {
  const stops = [actions.register("add.solid", () => void addSolidClip()), actions.register("add.image", () => void addImageClips())];
  return () => {
    for (const stop of stops) stop();
  };
}
