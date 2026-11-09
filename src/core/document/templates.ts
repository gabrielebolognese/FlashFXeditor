// Templates (spec §21.24, Batch 80): the parameters of a sequence (named fields of its inner clips), the values
// each compound instance gives them, and the document view an instance is evaluated in. Pure.
//
// Instances share one sequence; a value overrides its target field only when the sequence is evaluated
// (`instanceView`), never by copying the sequence. A patched inner clip gets the id `<id>~<hash of its values>`
// so every cache keyed on clip ids (text rasters, textures) tells two instances with different values apart
// and lets two with equal values share.
import { sequenceView } from "./sequences.js";
import type { ClipId, CompoundClip, JsonValue, Project, RGBA, Sequence, TemplateParam, TemplateParamKind } from "./types.js";
import { TEMPLATE_PARAM_KINDS } from "./types.js";

/** Clip fields a parameter can never set: identity, placement in time and the clip's kind. */
export const FORBIDDEN_PATH_ROOTS: ReadonlySet<string> = new Set(["id", "trackId", "kind", "start", "duration", "sequenceId", "linkId", "linkGroup"]);

type Obj = Record<string, unknown>;
const isObject = (value: unknown): value is Obj => typeof value === "object" && value !== null && !Array.isArray(value);
const isRgba = (value: unknown): value is RGBA => isObject(value) && ["r", "g", "b", "a"].every((key) => typeof value[key] === "number" && Number.isFinite(value[key]) && (value[key] as number) >= 0 && (value[key] as number) <= 1);

/** The segments of a dotted path; null when it is empty or has an empty segment. */
export function pathSegments(path: string): string[] | null {
  if (typeof path !== "string" || path === "") return null;
  const parts = path.split(".");
  return parts.some((part) => part === "" || part === "__proto__" || part === "constructor" || part === "prototype") ? null : parts;
}

/** The value at `path` of `root`, or undefined when a step is missing. */
export function getPath(root: unknown, path: string): unknown {
  const parts = pathSegments(path);
  if (!parts) return undefined;
  let node: unknown = root;
  for (const part of parts) {
    if (Array.isArray(node)) node = node[Number(part)];
    else if (isObject(node)) node = node[part];
    else return undefined;
  }
  return node;
}

/** A copy of `root` with `value` at `path` (objects and arrays along the path are copied, the rest is shared). The path must resolve. */
export function withPath<T>(root: T, path: string, value: unknown): T {
  const parts = pathSegments(path) as string[];
  const step = (node: unknown, i: number): unknown => {
    if (i === parts.length) return value;
    const key = parts[i] as string;
    if (Array.isArray(node)) {
      const copy = node.slice();
      copy[Number(key)] = step(node[Number(key)], i + 1);
      return copy;
    }
    return { ...(node as Obj), [key]: step((node as Obj)[key], i + 1) };
  };
  return step(root, 0) as T;
}

/** Why `value` cannot be the value of a parameter, or null. */
export function paramValueIssue(param: Pick<TemplateParam, "kind" | "min" | "max">, value: unknown): string | null {
  switch (param.kind) {
    case "text":
      return typeof value === "string" ? null : "must be a string";
    case "color":
      return isRgba(value) ? null : "must be an RGBA color with channels 0..1";
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) return "must be a finite number";
      if (param.min !== undefined && value < param.min) return `must be at least ${param.min}`;
      if (param.max !== undefined && value > param.max) return `must be at most ${param.max}`;
      return null;
    case "media":
      return typeof value === "string" && value !== "" ? null : "must be a media id";
    case "font":
      return typeof value === "string" && value !== "" ? null : "must be a font family name";
    case "toggle":
      return typeof value === "boolean" ? null : "must be true or false";
  }
}

const hasChannels = (value: unknown): boolean => isObject(value) && ["r", "g", "b", "a"].every((key) => typeof value[key] === "number");

/** A color field holds an RGBA color; a field named `fill` may also hold a gradient (a color replaces it). */
function colorFieldFits(path: string, existing: unknown): boolean {
  if (hasChannels(existing)) return true;
  if (!isObject(existing) || (path.split(".").pop() ?? "") !== "fill") return false;
  return (hasChannels(existing.from) && hasChannels(existing.to)) || Array.isArray(existing.stops);
}

/** Whether a field that holds `existing` can be set by a parameter of `kind`. */
export function kindFitsField(kind: TemplateParamKind, existing: unknown, path = ""): boolean {
  switch (kind) {
    case "text":
    case "media":
    case "font":
      return typeof existing === "string";
    case "color":
      return colorFieldFits(path, existing);
    case "number":
      return typeof existing === "number";
    case "toggle":
      return typeof existing === "boolean";
  }
}

/** The kinds a field value can be exposed as (the first is the natural one). */
export function kindsForValue(path: string, existing: unknown): TemplateParamKind[] {
  if (typeof existing === "boolean") return ["toggle"];
  if (typeof existing === "number") return ["number"];
  if (isObject(existing)) return colorFieldFits(path, existing) ? ["color"] : [];
  if (typeof existing === "string") {
    const last = path.split(".").pop() ?? "";
    if (last === "mediaId") return ["media"];
    if (last === "fontFamily") return ["font"];
    return ["text"];
  }
  return [];
}

/** What is wrong with the parameters of a sequence (targets in this sequence, fields that exist, values that fit); empty when fine. */
export function templateParamIssues(project: Project, sequence: Sequence, label: string): string[] {
  const params = sequence.params;
  if (params === undefined) return [];
  if (!Array.isArray(params)) return [`${label}: params must be a list`];
  const issues: string[] = [];
  const own = new Set<ClipId>(Array.isArray(sequence.tracks) ? sequence.tracks.flatMap((track) => track?.clipIds ?? []) : []);
  const ids = new Set<string>();
  for (const [i, param] of params.entries()) {
    const at = `${label}: param ${i}`;
    if (!isObject(param)) {
      issues.push(`${at} must be an object`);
      continue;
    }
    const name = `${label}: param "${String(param.id)}"`;
    if (typeof param.id !== "string" || param.id === "") issues.push(`${at}: id must be a non-empty string`);
    else if (ids.has(param.id)) issues.push(`${name}: id is used twice`);
    else ids.add(param.id);
    if (typeof param.label !== "string") issues.push(`${name}: label must be a string`);
    if (!(TEMPLATE_PARAM_KINDS as readonly unknown[]).includes(param.kind)) {
      issues.push(`${name}: kind ${String(param.kind)} must be one of ${TEMPLATE_PARAM_KINDS.join(", ")}`);
      continue;
    }
    if (param.min !== undefined && !(typeof param.min === "number" && Number.isFinite(param.min))) issues.push(`${name}: min must be a number`);
    if (param.max !== undefined && !(typeof param.max === "number" && Number.isFinite(param.max))) issues.push(`${name}: max must be a number`);
    if ((param.min !== undefined || param.max !== undefined) && param.kind !== "number") issues.push(`${name}: only a number parameter has min and max`);
    if (typeof param.min === "number" && typeof param.max === "number" && param.min > param.max) issues.push(`${name}: min ${param.min} is above max ${param.max}`);
    const bad = paramValueIssue(param, param.default);
    if (bad) issues.push(`${name}: default ${bad}`);
    else if (param.kind === "media" && !(typeof param.default === "string" && Object.hasOwn(project.media, param.default))) issues.push(`${name}: default must be a media id of the project`);
    if (!Array.isArray(param.targets) || param.targets.length === 0) {
      issues.push(`${name}: targets must list at least one clip field`);
      continue;
    }
    for (const target of param.targets) {
      if (!isObject(target) || typeof target.clipId !== "string" || typeof target.path !== "string") {
        issues.push(`${name}: a target must be { clipId, path }`);
        continue;
      }
      const parts = pathSegments(target.path);
      const clip = project.clips[target.clipId];
      // A target whose clip was deleted, or whose optional field is gone, dangles: it sets nothing (deleting a clip never
      // has to rewrite the template). One that names a clip of another scope, a forbidden field or a field of the wrong type is wrong.
      if (clip && !own.has(target.clipId)) issues.push(`${name}: target clip ${target.clipId} is not in this sequence`);
      else if (!parts || FORBIDDEN_PATH_ROOTS.has(parts[0] as string)) issues.push(`${name}: target path "${target.path}" cannot be set by a parameter`);
      else if (clip) {
        const existing = getPath(clip, target.path);
        if (existing !== undefined && !kindFitsField(param.kind, existing, target.path)) issues.push(`${name}: clip ${target.clipId} has no ${param.kind} field at "${target.path}"`);
      }
    }
  }
  return issues;
}

/** What is wrong with an instance's values against its sequence's parameters; empty when fine. */
export function instanceParamIssues(project: Project, clip: CompoundClip, label: string): string[] {
  const values = clip.params;
  if (values === undefined) return [];
  if (!isObject(values)) return [`${label}: params must be an object`];
  const params = project.sequences[clip.sequenceId]?.params ?? [];
  const issues: string[] = [];
  for (const [id, value] of Object.entries(values)) {
    const param = params.find((candidate) => candidate.id === id);
    if (!param) issues.push(`${label}: params has "${id}", which its sequence does not define`);
    else {
      const bad = paramValueIssue(param, value);
      if (bad) issues.push(`${label}: params "${id}" ${bad}`);
      else if (param.kind === "media" && !(typeof value === "string" && Object.hasOwn(project.media, value))) issues.push(`${label}: params "${id}" must be a media id of the project`);
    }
  }
  return issues;
}

/** The value an instance shows for `param`: its own, else the default. */
export function paramValue(clip: Pick<CompoundClip, "params">, param: TemplateParam): JsonValue {
  const value = clip.params?.[param.id];
  return value !== undefined && paramValueIssue(param, value) === null ? value : param.default;
}

/** The instance values every parameter of `sequence` starts with (its defaults). */
export function defaultParamValues(sequence: Pick<Sequence, "params">): Record<string, JsonValue> {
  const values: Record<string, JsonValue> = {};
  for (const param of sequence.params ?? []) values[param.id] = structuredClone(param.default);
  return values;
}

/** The id of the next free parameter id: `p1`, `p2`, ... */
export function nextParamId(params: readonly TemplateParam[] | undefined): string {
  const used = new Set((params ?? []).map((param) => param.id));
  let n = 1;
  while (used.has(`p${n}`)) n += 1;
  return `p${n}`;
}

function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(36);
}

interface Cached {
  base: Project;
  params: readonly TemplateParam[];
  view: Project;
}
const views = new WeakMap<object, Cached>();

/**
 * The document an instance is evaluated in: `sequenceView` with each parameter value written over its target
 * fields. Values that do not fit their parameter, and targets that do not resolve, are ignored (a project
 * from another tool never reaches the compositor with a wrong type). Cached per values object, so a frame
 * costs a lookup.
 */
export function instanceView(doc: Project, sequence: Sequence, clip: CompoundClip): Project {
  const base = sequenceView(doc, sequence);
  const params = sequence.params;
  const values = clip.params;
  if (!params || params.length === 0 || !values) return base;
  const known = views.get(values);
  if (known && known.base === base && known.params === params) return known.view;
  const byClip = new Map<ClipId, { path: string; value: unknown }[]>();
  for (const param of params) {
    const value = values[param.id];
    if (value === undefined || paramValueIssue(param, value) !== null) continue;
    for (const target of param.targets) {
      const inner = base.clips[target.clipId];
      const parts = pathSegments(target.path);
      if (!inner || !parts || FORBIDDEN_PATH_ROOTS.has(parts[0] as string) || !kindFitsField(param.kind, getPath(inner, target.path), target.path)) continue;
      const list = byClip.get(target.clipId) ?? [];
      list.push({ path: target.path, value });
      byClip.set(target.clipId, list);
    }
  }
  let view = base;
  if (byClip.size > 0) {
    const clips = { ...base.clips };
    for (const [id, list] of byClip) {
      let patched = base.clips[id] as unknown;
      for (const { path, value } of list) patched = withPath(patched, path, value);
      clips[id] = { ...(patched as Obj), id: `${id}~${hash(JSON.stringify(list))}` } as unknown as Project["clips"][string];
    }
    view = { ...base, clips };
  }
  views.set(values, { base, params, view });
  return view;
}
