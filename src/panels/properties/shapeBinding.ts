// Number field bindings of the Shape section (spec §21.12, §11, Batch 66): a path's trim, stroke and
// primitive numbers over the selected shapes (the path by index in each). A typed value or an arrow
// step is one command; a label scrub shows its values live (`liveEdit.shapes`: the preview draws the
// edited clips, no React component renders, P2), then one command on release. A keyed field shows its
// value at the playhead and an edit writes a key there. Framework-free.
import { clipRel } from "../../core/document/keyframes.js";
import type { ClipId, Frame, Project, ShapeClip } from "../../core/document/types.js";
import type { Store } from "../../core/store/createStore.js";
import type { DocumentStore } from "../../core/store/DocumentStore.js";
import { editedShapes, editShapes, setShapeField, shapeValueAt, type ShapeEdit } from "../../timeline/edit/shape.js";
import { patchLive, type LiveEdit } from "../../app/liveEdit.js";
import { roundTo, type NumberBinding } from "../../ui/NumberField.js";
import { shared } from "./context.js";

export interface ShapeBindingDeps {
  document: Pick<DocumentStore, "getState" | "subscribe" | "dispatch">;
  playhead: { get(): Frame; subscribe(listener: () => void): () => void };
  live: Store<LiveEdit>;
}

/** A number field of a path: its property (`trim.end`), the display factor (a fraction shows as %), limits in display units. */
export interface ShapeNumberProp {
  field: string;
  label: string;
  /** Display = stored * scale. */
  scale: number;
  min: number;
  max: number;
  precision: number;
}

/** The value of `field` the shapes among `ids` share at the playhead (display units), or null when they differ or lack it. */
export function sharedShapeValue(project: Project, ids: readonly ClipId[], pathIndex: number, field: string, at: Frame, scale: number, live: ReadonlyMap<ClipId, ShapeClip> | null = null): number | null {
  const values: number[] = [];
  for (const id of ids) {
    const clip = live?.get(id) ?? project.clips[id];
    if (clip?.kind !== "shape") continue;
    const path = clip.paths[pathIndex];
    const value = path ? shapeValueAt(clip, path.id, field, clipRel(clip, at)) : undefined;
    if (typeof value === "number") values.push(value);
  }
  const common = shared(values, (v) => v);
  return common && !common.mixed ? common.value * scale : null;
}

/** What a live number binding over shape clips needs: how to read it and how to write a value. */
export interface LiveShapeField {
  /** The value the clips share (display units) in `project`, with `live` clips replacing the document's; null when mixed or absent. */
  read(project: Project, live: ReadonlyMap<ClipId, ShapeClip> | null): number | null;
  /** The legal value nearest to `value` (display units). */
  clamp(value: number): number;
  /** The edit that writes `value` (display units). */
  edit(value: number): ShapeEdit;
  label: string;
  coalesceKey: string;
}

/**
 * A number binding over the shape clips `ids`: a typed value or an arrow step is one command, a label scrub
 * is shown live (nothing reaches the document) and one command lands on release, Esc drops it.
 */
export function liveShapeBinding(deps: ShapeBindingDeps, field: LiveShapeField, ids: readonly ClipId[]): NumberBinding {
  const current = () => field.read(deps.document.getState(), null);
  const commit = (value: number) => {
    const command = editShapes(deps.document.getState(), ids, field.edit(field.clamp(value)), { label: field.label, at: deps.playhead.get(), coalesceKey: field.coalesceKey });
    if (command) deps.document.dispatch(command);
  };
  const clearLive = () => patchLive(deps.live, { shapes: null });
  return {
    read: () => field.read(deps.document.getState(), deps.live.getState().shapes),
    subscribe(listener) {
      const stops = [deps.document.subscribe(() => listener(), { affects: ["composite"] }), deps.playhead.subscribe(listener), deps.live.subscribe(() => listener())];
      return () => {
        for (const stop of stops) stop();
      };
    },
    set: commit,
    change(delta, phase) {
      if (phase === "cancel") return clearLive();
      const base = current();
      if (base === null) return clearLive();
      switch (phase) {
        case "scrub":
          patchLive(deps.live, { shapes: editedShapes(deps.document.getState(), ids, field.edit(field.clamp(base + delta)), deps.playhead.get()) });
          return;
        case "step":
          if (delta !== 0) commit(base + delta);
          return;
        case "commit":
          // The document takes over from the live values in the same frame.
          if (delta !== 0) commit(base + delta);
          clearLive();
      }
    },
  };
}

export function shapeBinding(deps: ShapeBindingDeps, prop: ShapeNumberProp, ids: readonly ClipId[], pathIndex: number): NumberBinding {
  return liveShapeBinding(
    deps,
    {
      read: (project, live) => sharedShapeValue(project, ids, pathIndex, prop.field, deps.playhead.get(), prop.scale, live),
      clamp: (value) => roundTo(Math.min(prop.max, Math.max(prop.min, value)), prop.precision),
      edit: (value) => (clip, rel) => {
        const path = clip.paths[pathIndex];
        if (path) setShapeField(clip, path.id, prop.field, value / prop.scale, rel);
      },
      label: prop.label,
      coalesceKey: `properties.shape.${pathIndex}.${prop.field}`,
    },
    ids,
  );
}
