// Number field bindings of the Shape section (spec §21.12, §11, Batch 66): a path's trim, stroke and
// primitive numbers over the selected shapes (the path by index in each). A typed value or an arrow
// step is one command; a label scrub commits on release (no live preview: like the gradient fields,
// the preview shows it when the command lands). A keyed field shows its value at the playhead and an
// edit writes a key there. Framework-free.
import { clipRel } from "../../core/document/keyframes.js";
import type { ClipId, Frame, Project } from "../../core/document/types.js";
import type { DocumentStore } from "../../core/store/DocumentStore.js";
import { editShapes, setShapeField, shapeValueAt } from "../../timeline/edit/shape.js";
import { roundTo, type NumberBinding } from "../../ui/NumberField.js";
import { valueBinding } from "../../ui/NumberField.js";
import { shared } from "./context.js";

export interface ShapeBindingDeps {
  document: Pick<DocumentStore, "getState" | "subscribe" | "dispatch">;
  playhead: { get(): Frame; subscribe(listener: () => void): () => void };
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
export function sharedShapeValue(project: Project, ids: readonly ClipId[], pathIndex: number, field: string, at: Frame, scale: number): number | null {
  const values: number[] = [];
  for (const id of ids) {
    const clip = project.clips[id];
    if (clip?.kind !== "shape") continue;
    const path = clip.paths[pathIndex];
    const value = path ? shapeValueAt(clip, path.id, field, clipRel(clip, at)) : undefined;
    if (typeof value === "number") values.push(value);
  }
  const common = shared(values, (v) => v);
  return common && !common.mixed ? common.value * scale : null;
}

export function shapeBinding(deps: ShapeBindingDeps, prop: ShapeNumberProp, ids: readonly ClipId[], pathIndex: number): NumberBinding {
  const clamp = (value: number) => roundTo(Math.min(prop.max, Math.max(prop.min, value)), prop.precision);
  return valueBinding(
    {
      read: () => sharedShapeValue(deps.document.getState(), ids, pathIndex, prop.field, deps.playhead.get(), prop.scale),
      subscribe: (listener) => {
        const stops = [deps.document.subscribe(() => listener(), { affects: ["composite"] }), deps.playhead.subscribe(listener)];
        return () => {
          for (const stop of stops) stop();
        };
      },
    },
    (value) => {
      const at = deps.playhead.get();
      const stored = clamp(value) / prop.scale;
      const command = editShapes(
        deps.document.getState(),
        ids,
        (clip, rel) => {
          const path = clip.paths[pathIndex];
          if (path) setShapeField(clip, path.id, prop.field, stored, rel);
        },
        { label: prop.label, at, coalesceKey: `properties.shape.${pathIndex}.${prop.field}` },
      );
      if (command) deps.document.dispatch(command);
    },
  );
}
