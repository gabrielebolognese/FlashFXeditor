// Template edits (spec §21.24, Batch 80): Expose as parameter, the parameter editor, the values of an instance
// and the rename of a sequence. Each is one command (one undo step). The parameters live on the sequence, the
// values on the compound clips that show it; deleting a clip never touches them (a target whose clip is gone
// sets nothing).
import type { Draft } from "immer";
import type { Command } from "../../core/commands/command.js";
import { findTrack, sequenceOfTrack } from "../../core/document/sequences.js";
import { FORBIDDEN_PATH_ROOTS, getPath, kindFitsField, kindsForValue, nextParamId, paramValueIssue, pathSegments } from "../../core/document/templates.js";
import type { ClipId, CompoundClip, JsonValue, Project, Sequence, SequenceId, TemplateParam, TemplateParamKind } from "../../core/document/types.js";

export const MAX_PARAM_LABEL = 40;

/** The fields offered for the selected clip (the ones that exist on it and can be exposed). */
export const EXPOSABLE_FIELDS: readonly { path: string; label: string }[] = [
  { path: "text.value", label: "Text" },
  { path: "style.fill", label: "Text color" },
  { path: "style.fontFamily", label: "Font" },
  { path: "style.fontSize", label: "Font size" },
  { path: "fill", label: "Color" },
  { path: "mediaId", label: "Media" },
  { path: "size.w", label: "Width" },
  { path: "size.h", label: "Height" },
  { path: "transform.x", label: "Position X" },
  { path: "transform.y", label: "Position Y" },
  { path: "transform.scale", label: "Scale" },
  { path: "transform.rotation", label: "Rotation" },
  { path: "opacity", label: "Opacity" },
  { path: "enabled", label: "Visible" },
  { path: "loop", label: "Loop" },
];

/** True when the clip sits on a locked track of the project or of a sequence. */
function isClipLocked(project: Project, clipId: ClipId): boolean {
  const clip = project.clips[clipId];
  return clip !== undefined && findTrack(project, clip.trackId)?.locked === true;
}

/** The sequence an inner clip belongs to, or null for a project clip. */
export function clipSequence(project: Project, clipId: ClipId): Sequence | null {
  const clip = project.clips[clipId];
  return clip ? sequenceOfTrack(project, clip.trackId) : null;
}

/** Trimmed, one line, capped; an empty name becomes null. */
export function cleanLabel(label: string, max = MAX_PARAM_LABEL): string | null {
  const clean = label.replace(/\s+/g, " ").trim().slice(0, max);
  return clean === "" ? null : clean;
}

const FRIENDLY: Record<string, string> = { "text.value": "text", "style.fill": "color", fill: "color", mediaId: "media", enabled: "visible", "style.fontFamily": "font", "style.fontSize": "size", opacity: "opacity" };

/** "Title text": the clip's name and what the field is. */
export function defaultParamLabel(project: Project, clipId: ClipId, path: string): string {
  const clip = project.clips[clipId];
  const field = FRIENDLY[path] ?? (path.split(".").pop() ?? path);
  return cleanLabel(`${clip?.name ?? "Clip"} ${field}`) ?? "Parameter";
}

/** The kinds the field of an inner clip can be exposed as; empty when it cannot. */
export function exposeKinds(project: Project, clipId: ClipId, path: string): TemplateParamKind[] {
  const clip = project.clips[clipId];
  const parts = pathSegments(path);
  if (!clip || !parts || FORBIDDEN_PATH_ROOTS.has(parts[0] as string)) return [];
  return kindsForValue(path, getPath(clip, path));
}

/** Why the field cannot be exposed (the reason shown), or null. */
export function exposeProblem(project: Project, clipId: ClipId, path: string): string | null {
  const clip = project.clips[clipId];
  if (!clip) return "Select a clip inside a compound";
  const sequence = clipSequence(project, clipId);
  if (!sequence) return "Open a compound first: parameters belong to a compound's sequence";
  if (isClipLocked(project, clipId)) return "The track is locked";
  if (exposeKinds(project, clipId, path).length === 0) return "This field cannot be a parameter";
  if (sequence.params?.some((param) => param.targets.some((target) => target.clipId === clipId && target.path === path))) return "This field is a parameter already";
  return null;
}

/** Expose as parameter: the field `path` of the inner clip becomes a parameter of its sequence (default = its value now). */
export function exposeParam(project: Project, clipId: ClipId, path: string, fields: { label?: string; kind?: TemplateParamKind } = {}): Command | null {
  if (exposeProblem(project, clipId, path) !== null) return null;
  const sequence = clipSequence(project, clipId) as Sequence;
  const kind = fields.kind ?? (exposeKinds(project, clipId, path)[0] as TemplateParamKind);
  const existing = getPath(project.clips[clipId], path);
  if (!kindFitsField(kind, existing)) return null;
  const id = nextParamId(sequence.params);
  const value = structuredClone(existing) as JsonValue;
  const param: TemplateParam = { id, label: cleanLabel(fields.label ?? "") ?? defaultParamLabel(project, clipId, path), kind, targets: [{ clipId, path }], default: value };
  if (paramValueIssue(param, value) !== null) return null;
  const sequenceId = sequence.id;
  return {
    id: "template.expose",
    label: "Expose as parameter",
    affects: ["clips", "composite"],
    run(draft) {
      const target = draft.sequences[sequenceId];
      if (!target) throw new Error(`template.expose: sequence ${sequenceId} is missing`);
      (target.params ??= []).push(structuredClone(param) as Draft<TemplateParam>);
    },
  };
}

/** Another field of an inner clip that follows an existing parameter (one name, several fields). */
export function addParamTarget(project: Project, sequenceId: SequenceId, paramId: string, clipId: ClipId, path: string): Command | null {
  const sequence = project.sequences[sequenceId];
  const param = sequence?.params?.find((candidate) => candidate.id === paramId);
  const clip = project.clips[clipId];
  if (!sequence || !param || !clip || clipSequence(project, clipId)?.id !== sequenceId) return null;
  const parts = pathSegments(path);
  if (!parts || FORBIDDEN_PATH_ROOTS.has(parts[0] as string) || !kindFitsField(param.kind, getPath(clip, path))) return null;
  if (param.targets.some((target) => target.clipId === clipId && target.path === path)) return null;
  return {
    id: "template.addTarget",
    label: "Add parameter field",
    affects: ["clips", "composite"],
    run(draft) {
      draft.sequences[sequenceId]?.params?.find((candidate) => candidate.id === paramId)?.targets.push({ clipId, path });
    },
  };
}

export interface ParamPatch {
  label?: string;
  default?: JsonValue;
  min?: number | null;
  max?: number | null;
}

/** Edits a parameter's name, default or range. Null when nothing changes or a value is wrong. */
export function updateParam(project: Project, sequenceId: SequenceId, paramId: string, patch: ParamPatch): Command | null {
  const param = project.sequences[sequenceId]?.params?.find((candidate) => candidate.id === paramId);
  if (!param) return null;
  const next: TemplateParam = { ...param };
  if (patch.label !== undefined) {
    const label = cleanLabel(patch.label);
    if (label === null) return null;
    next.label = label;
  }
  if (patch.min !== undefined) {
    if (patch.min === null) delete next.min;
    else next.min = patch.min;
  }
  if (patch.max !== undefined) {
    if (patch.max === null) delete next.max;
    else next.max = patch.max;
  }
  if (param.kind !== "number" && (next.min !== undefined || next.max !== undefined)) return null;
  if (next.min !== undefined && next.max !== undefined && next.min > next.max) return null;
  if (patch.default !== undefined) next.default = patch.default;
  if (paramValueIssue(next, next.default) !== null) return null;
  if (JSON.stringify(next) === JSON.stringify(param)) return null;
  const done = structuredClone(next);
  return {
    id: "template.updateParam",
    label: "Edit parameter",
    coalesceKey: `template.param:${sequenceId}:${paramId}`,
    affects: ["clips", "composite"],
    run(draft) {
      const list = draft.sequences[sequenceId]?.params;
      const at = list?.findIndex((candidate) => candidate.id === paramId) ?? -1;
      if (list && at >= 0) list[at] = structuredClone(done) as Draft<TemplateParam>;
      // A narrower range or another default must not leave an instance holding a value the parameter refuses:
      // a number is moved to the nearest limit, anything else goes back to the default.
      for (const clip of Object.values(draft.clips)) {
        if (clip.kind !== "compound" || clip.sequenceId !== sequenceId || clip.params?.[paramId] === undefined) continue;
        const value = clip.params[paramId];
        if (paramValueIssue(done, value) === null) continue;
        if (done.kind === "number" && typeof value === "number" && Number.isFinite(value)) clip.params[paramId] = Math.min(done.max ?? value, Math.max(done.min ?? value, value));
        else delete clip.params[paramId];
        if (Object.keys(clip.params).length === 0) delete clip.params;
      }
    },
  };
}

/** Removes a parameter and the values every instance holds for it. */
export function removeParam(project: Project, sequenceId: SequenceId, paramId: string): Command | null {
  if (!project.sequences[sequenceId]?.params?.some((param) => param.id === paramId)) return null;
  return {
    id: "template.removeParam",
    label: "Remove parameter",
    affects: ["clips", "composite"],
    run(draft) {
      const sequence = draft.sequences[sequenceId];
      if (!sequence?.params) return;
      sequence.params = sequence.params.filter((param) => param.id !== paramId);
      if (sequence.params.length === 0) delete sequence.params;
      for (const clip of Object.values(draft.clips)) {
        if (clip.kind !== "compound" || clip.sequenceId !== sequenceId || !clip.params) continue;
        delete clip.params[paramId];
        if (Object.keys(clip.params).length === 0) delete clip.params;
      }
    },
  };
}

/** The compound clips among `ids` that are editable and whose sequence has the parameter. */
export function instancesWith(project: Project, ids: readonly ClipId[], paramId: string): CompoundClip[] {
  const out: CompoundClip[] = [];
  for (const id of ids) {
    const clip = project.clips[id];
    if (clip?.kind === "compound" && !isClipLocked(project, id) && project.sequences[clip.sequenceId]?.params?.some((param) => param.id === paramId)) out.push(clip);
  }
  return out;
}

/** Sets the value of a parameter on the selected instances (coalesced: one undo step per drag or typing run). */
export function setInstanceValue(project: Project, ids: readonly ClipId[], paramId: string, value: JsonValue): Command | null {
  const targets = instancesWith(project, ids, paramId).filter((clip) => {
    const param = project.sequences[clip.sequenceId]?.params?.find((candidate) => candidate.id === paramId) as TemplateParam;
    return paramValueIssue(param, value) === null && JSON.stringify(clip.params?.[paramId]) !== JSON.stringify(value);
  });
  if (targets.length === 0) return null;
  const list = targets.map((clip) => clip.id);
  return {
    id: "template.setValue",
    label: "Change template field",
    coalesceKey: `template.value:${list.join(",")}:${paramId}`,
    affects: ["clips", "composite"],
    run(draft) {
      for (const id of list) {
        const clip = draft.clips[id];
        if (clip?.kind !== "compound") continue;
        (clip.params ??= {})[paramId] = structuredClone(value) as Draft<JsonValue>;
      }
    },
  };
}

/** Removes the instances' own values (the fields show what the sequence has). `paramId` null: every value. */
export function resetInstanceValues(project: Project, ids: readonly ClipId[], paramId: string | null): Command | null {
  const list = ids.filter((id) => {
    const clip = project.clips[id];
    return clip?.kind === "compound" && !isClipLocked(project, id) && clip.params !== undefined && (paramId === null ? Object.keys(clip.params).length > 0 : clip.params[paramId] !== undefined);
  });
  if (list.length === 0) return null;
  return {
    id: "template.resetValues",
    label: paramId === null ? "Reset template fields" : "Reset template field",
    affects: ["clips", "composite"],
    run(draft) {
      for (const id of list) {
        const clip = draft.clips[id];
        if (clip?.kind !== "compound" || !clip.params) continue;
        if (paramId === null) delete clip.params;
        else {
          delete clip.params[paramId];
          if (Object.keys(clip.params).length === 0) delete clip.params;
        }
      }
    },
  };
}

/** The sequence's name, trimmed to one line (templates and the Compounds bin show it). */
export function renameSequence(project: Project, sequenceId: SequenceId, name: string): Command | null {
  const sequence = project.sequences[sequenceId];
  const clean = cleanLabel(name, 60);
  if (!sequence || clean === null || clean === sequence.name) return null;
  return {
    id: "sequence.rename",
    label: "Rename compound",
    coalesceKey: `sequence.rename:${sequenceId}`,
    affects: ["clips", "timeline"],
    run(draft) {
      const target = draft.sequences[sequenceId];
      if (target) target.name = clean;
    },
  };
}
