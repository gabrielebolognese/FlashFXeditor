// Vector shapes in the app (spec §21.12, §6.1 `+ Shape`, §9.1 SVG, §11 Shape section, Batch 66).
// - `add.shape.<kind>` (the `+ Shape` dropdown, the palette): the shape at the playhead, selected.
// - `media.importAsShapes` (the media menu): each selected SVG becomes one shape clip at the playhead; an SVG
//   with something the subset does not cover (filters, masks, text, ...) stays an image clip on the canvas,
//   with a toast naming what was unsupported.
// - `editShapes` and the stopwatch calls are the Shape section's writes: each one command.
import type { ClipId, MediaId, PrimitiveKind } from "../core/document/types.js";
import { importSvgShapes } from "../core/shapes/svgImport.js";
import { patchLiveEdit } from "./liveEdit.js";
import { selectClips, toSnapshot } from "../core/store/selection.js";
import { isSvgImage } from "../media/mediaKinds.js";
import { adjacentShapeKey, addShape, defaultShape, editedShapes, editShapes as editShapesCommand, fitScale, SHAPE_KINDS, setShapeStopwatch, shapeKindName, toggleShapeKey, type ShapeEdit, type ShapeKeyGroup, type ShapeSpec } from "../timeline/edit/shape.js";
import { showToast } from "../ui/toasts.js";
import { dropMediaOnCanvas, setSvgDropChoice } from "./dropController.js";
import { selectedMedia } from "./mediaController.js";
import { sourceFile } from "./mediaOffline.js";
import { actions, documentStore, sessionStore } from "./services.js";
import { movePlayhead } from "./timelineController.js";

const newId = () => crypto.randomUUID();

/** `spec` placed at the playhead and selected (one undo step); the new clip's id. */
export function placeShape(spec: ShapeSpec, label?: string): ClipId {
  const project = documentStore.getState();
  const result = addShape(project, sessionStore.state.getState().playhead, newId, spec, label);
  documentStore.dispatch(result.command, { selection: toSnapshot(selectClips([result.clipId])) });
  return result.clipId;
}

/** `+ Shape`: a shape of `kind` with its default look at the playhead. */
export function addShapeClip(kind: PrimitiveKind): ClipId {
  return placeShape(defaultShape(kind, documentStore.getState().settings, newId));
}

/** The shape spec of an SVG file's text, or the names of what the subset does not cover. */
export function svgSpec(text: string, name: string, frame: { width: number; height: number }): { ok: true; spec: ShapeSpec } | { ok: false; unsupported: string[] } {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  if (doc.getElementsByTagName("parsererror").length > 0) return { ok: false, unsupported: ["invalid SVG"] };
  const result = importSvgShapes(doc.documentElement, newId);
  if (!result.ok) return result;
  return { ok: true, spec: { name, size: result.size, paths: result.paths, scale: fitScale(result.size, frame) } };
}

/** Import as shapes: the selected SVG media as shape clips at the playhead (an unsupported one stays an image clip, with a toast). */
export async function importAsShapes(ids: readonly MediaId[] = selectedMedia()): Promise<void> {
  const frame = documentStore.getState().settings;
  for (const id of ids) {
    const item = documentStore.getState().media[id];
    if (!item || !isSvgImage(item)) continue;
    const file = await sourceFile(id);
    const parsed = file ? svgSpec(await file.text(), item.name.replace(/\.svg$/i, ""), frame) : ({ ok: false, unsupported: ["the file is not available"] } as const);
    if (parsed.ok) {
      placeShape(parsed.spec, `Import ${item.name} as shapes`);
      continue;
    }
    showToast({ tone: "warning", message: `${item.name} stays an image`, detail: `Not supported as shapes: ${parsed.unsupported.join(", ")}.` });
    // The image fallback offers no "Make shapes": the subset just refused this SVG.
    dropMediaOnCanvas([id], null, { offer: false });
  }
}

/** `edit` on the selected-or-given shape clips as one undo step (`coalesceKey`: consecutive steps merge). */
export function editShapes(ids: readonly ClipId[], edit: ShapeEdit, label: string, coalesceKey?: string): void {
  const at = sessionStore.state.getState().playhead;
  const command = editShapesCommand(documentStore.getState(), ids, edit, { label, at, ...(coalesceKey !== undefined && { coalesceKey }) });
  if (command) documentStore.dispatch(command);
}

/** `edit` shown live on the shape clips among `ids` (no document change, P2); null ends it. */
export function previewShapes(ids: readonly ClipId[], edit: ShapeEdit | null): void {
  const at = sessionStore.state.getState().playhead;
  patchLiveEdit({ shapes: edit ? editedShapes(documentStore.getState(), ids, edit, at) : null });
}

/** The stopwatch of a path's group (the path by index in each shape). */
export function shapeStopwatch(ids: readonly ClipId[], pathIndex: number, group: ShapeKeyGroup, on: boolean): void {
  const command = setShapeStopwatch(documentStore.getState(), ids, pathIndex, group, on, sessionStore.state.getState().playhead);
  if (command) documentStore.dispatch(command);
}

/** The navigator's add / remove key at the playhead. */
export function shapeToggleKey(ids: readonly ClipId[], pathIndex: number, group: ShapeKeyGroup): void {
  const command = toggleShapeKey(documentStore.getState(), ids, pathIndex, group, sessionStore.state.getState().playhead);
  if (command) documentStore.dispatch(command);
}

/** Moves the playhead to the previous / next key of the group. */
export function shapeGoToKey(ids: readonly ClipId[], pathIndex: number, group: ShapeKeyGroup, direction: -1 | 1): void {
  const frame = adjacentShapeKey(documentStore.getState(), ids, pathIndex, group, sessionStore.state.getState().playhead, direction);
  if (frame !== null) movePlayhead(frame);
}

/** Registers `+ Shape` (one command per shape) and Import as shapes. Returns a stop function. */
export function installShapeController(): () => void {
  const stops = [
    ...SHAPE_KINDS.map((kind) => actions.register(`add.shape.${kind}`, () => void addShapeClip(kind))),
    actions.register("media.importAsShapes", () => void importAsShapes()),
  ];
  // A dropped SVG offers "Make shapes" (spec §21.12).
  setSvgDropChoice((mediaId) => void importAsShapes([mediaId]));
  return () => {
    setSvgDropChoice(null);
    for (const stop of stops) stop();
  };
}

/** The `+ Shape` dropdown's rows. */
export const SHAPE_MENU = SHAPE_KINDS.map((kind) => ({ id: `add.shape.${kind}`, label: shapeKindName(kind) }));
