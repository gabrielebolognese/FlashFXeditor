// Number field bindings of the Animators section and the Counter rows (spec §21.13, §11, Batch 68):
// a field of one animator over the selected text clips that have it. A typed value or an arrow step is
// one command (steps coalesce); a keyed field shows its value at the playhead and an edit writes a key
// there. A label scrub commits once on release (the preview follows the document then). Framework-free.
import type { ClipId, Frame, Project, TextClip } from "../../core/document/types.js";
import { clipRel } from "../../core/document/keyframes.js";
import type { DocumentStore } from "../../core/store/DocumentStore.js";
import { animatorValueAt, editTextClips, writeAnimatorField, type AnimatorNumberField } from "../../timeline/edit/animators.js";
import { roundTo, type NumberBinding } from "../../ui/NumberField.js";
import { shared } from "./context.js";

export interface AnimatorBindingDeps {
  document: Pick<DocumentStore, "getState" | "subscribe" | "dispatch">;
  playhead: { get(): Frame; subscribe(listener: () => void): () => void };
}

/** A number field of an animator: display = stored * scale. */
export interface AnimatorNumberProp {
  field: AnimatorNumberField;
  label: string;
  scale: number;
  min: number;
  max: number;
  precision: number;
}

/** The value of the field the clips among `ids` that have the animator share at the playhead (display units), or null. */
export function sharedAnimatorValue(project: Project, ids: readonly ClipId[], animatorId: string, field: AnimatorNumberField, at: Frame, scale: number): number | null {
  const values: number[] = [];
  for (const id of ids) {
    const clip = project.clips[id];
    if (clip?.kind !== "text") continue;
    const value = animatorValueAt(clip, animatorId, field, clipRel(clip, at));
    if (value !== undefined) values.push(value);
  }
  const common = shared(values, (v) => roundTo(v * scale, 6));
  return common && !common.mixed ? common.value : null;
}

export function animatorBinding(deps: AnimatorBindingDeps, prop: AnimatorNumberProp, ids: readonly ClipId[], animatorId: string): NumberBinding {
  const read = () => sharedAnimatorValue(deps.document.getState(), ids, animatorId, prop.field, deps.playhead.get(), prop.scale);
  const clamp = (value: number) => roundTo(Math.min(prop.max, Math.max(prop.min, value)), prop.precision);
  const commit = (value: number, coalesce: boolean) => {
    const stored = clamp(value) / prop.scale;
    const command = editTextClips(deps.document.getState(), ids, (clip, rel) => writeAnimatorField(clip, animatorId, prop.field, stored, rel), {
      label: `Change ${prop.label.toLowerCase()}`,
      at: deps.playhead.get(),
      ...(coalesce && { coalesceKey: `properties.animator.${animatorId}.${prop.field}` }),
    });
    if (command) deps.document.dispatch(command);
  };
  return {
    read,
    subscribe(listener) {
      const stops = [deps.document.subscribe(() => listener(), { affects: ["composite", "text"] }), deps.playhead.subscribe(listener)];
      return () => {
        for (const stop of stops) stop();
      };
    },
    set: (value) => commit(value, false),
    change(delta, phase) {
      const base = read();
      if (base === null || delta === 0) return;
      if (phase === "step") commit(base + delta, true);
      if (phase === "commit") commit(base + delta, false);
    },
  };
}

/** The clip a section shows: the first text clip among `ids`. */
export const primaryText = (project: Project, ids: readonly ClipId[]): TextClip | null => {
  for (const id of ids) {
    const clip = project.clips[id];
    if (clip?.kind === "text") return clip;
  }
  return null;
};
