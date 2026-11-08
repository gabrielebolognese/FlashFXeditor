// Vector shapes in the editor (spec §21.12, §6.1 `+ Shape`, §11 Shape section, Batch 66): new shapes and
// edits of their paths.
// - `addShape` (`+ Shape`, Import as shapes): a shape clip at the playhead on the topmost video track
//   when it is free there, else on a new one, centered; one command `clip.addShape`.
// - `defaultShape`: the seven primitives of the `+ Shape` dropdown with their default look (closed shapes
//   a white fill, the arc and the line a white round-capped stroke).
// - `editShapes`: one command `clip.shape` that applies an edit to shape clips' paths. An edit of a keyed
//   property writes a key at the playhead (spec §11 stopwatch), any other writes the base value; the
//   `d` of a path with a primitive is generated again afterwards. Clips that are gone, locked, not shapes
//   or unchanged are skipped.
// - Stopwatches (`setShapeStopwatch`, `toggleShapeKey`, `adjacentShapeKey`): per path and group (Trim,
//   Stroke, Fill, Shape = the primitive's parameters), keying the properties of the group together.
// Pure.
import type { Draft } from "immer";
import { addTrack } from "../../core/commands/basicCommands.js";
import type { Command } from "../../core/commands/command.js";
import { clipRel, sampleValue, setKey, withKeys, type Key, type KeyframeProp } from "../../core/document/keyframes.js";
import { readProp, writeProp, type KeyValue } from "../../core/document/keyProps.js";
import { emptyTrack, nextTrackName } from "../../core/document/project.js";
import { type ClipId, type Fill, type Frame, type Keyframes, type PathStroke, type PrimitiveKind, type Project, type RGBA, type ShapeClip, type ShapePath, type Track } from "../../core/document/types.js";
import { PRIMITIVE_LIMITS, PRIMITIVE_PARAMS, defaultPrimitive, primitivePathData } from "../../core/shapes/primitives.js";
import { clipsInRange, isClipLocked } from "../model/queries.js";
import { defaultFrames, editDefaults } from "./editDefaults.js";
import { IDENTITY_TRANSFORM } from "./transform.js";

const WHITE: RGBA = { r: 1, g: 1, b: 1, a: 1 };

/** The `+ Shape` dropdown's shapes, in menu order. */
export const SHAPE_KINDS: readonly PrimitiveKind[] = ["rect", "ellipse", "polygon", "star", "arrow", "arc", "line"];

const SHAPE_NAMES: Readonly<Record<PrimitiveKind, string>> = { rect: "Rectangle", ellipse: "Ellipse", polygon: "Polygon", star: "Star", arrow: "Arrow", arc: "Arc", line: "Line" };

/** The name of a primitive (the dropdown rows, the Shape section, the new clip). */
export const shapeKindName = (kind: PrimitiveKind): string => SHAPE_NAMES[kind];

/** What a new shape clip is made of. */
export interface ShapeSpec {
  name: string;
  /** The view box, project px at scale 1. */
  size: { w: number; h: number };
  paths: ShapePath[];
  /** The clip's transform scale (an imported icon is fitted to the frame). */
  scale?: number;
}

/** A `+ Shape` shape with its default look, fitted to a frame. */
export function defaultShape(kind: PrimitiveKind, frame: { width: number; height: number }, newId: () => string): ShapeSpec {
  const side = Math.min(frame.width, frame.height);
  const stroke = Math.max(2, Math.round(side / 90));
  const box = Math.max(8, Math.round(side * 0.4));
  let w = box;
  let h = box;
  if (kind === "rect") [w, h] = [Math.round(side * 0.5), Math.round(side * 0.3)];
  if (kind === "arrow") [w, h] = [Math.round(side * 0.5), Math.round(side * 0.2)];
  if (kind === "line") [w, h] = [Math.round(side * 0.5), stroke * 2];
  const primitive = defaultPrimitive(kind, w, h);
  const outline = kind === "arc" || kind === "line";
  const path: ShapePath = { id: newId(), d: primitivePathData(primitive, w, h), fill: outline ? null : { ...WHITE }, fillRule: "nonzero", primitive };
  if (outline) path.stroke = { width: stroke, color: { ...WHITE }, align: "center", cap: "round", join: "round", miterLimit: 4 };
  return { name: SHAPE_NAMES[kind], size: { w, h }, paths: [path] };
}

export function newShapeClip(fields: { id: ClipId; trackId: string; start: Frame; duration: Frame; spec: ShapeSpec }): ShapeClip {
  const transform = structuredClone(IDENTITY_TRANSFORM);
  if (fields.spec.scale !== undefined) transform.scale = fields.spec.scale;
  return {
    id: fields.id,
    trackId: fields.trackId,
    kind: "shape",
    name: fields.spec.name,
    start: fields.start,
    duration: fields.duration,
    enabled: true,
    size: { ...fields.spec.size },
    paths: structuredClone(fields.spec.paths),
    transform,
    opacity: 1,
  };
}

/**
 * `+ Shape`: `spec` at the playhead, centered, the default duration long, on the topmost video track
 * when it is free there (unlocked, shown), else on a new video track above the others. One command
 * ("Add <name>"); the new clip's id.
 */
export function addShape(project: Project, playhead: Frame, newId: () => string, spec: ShapeSpec, label = `Add ${spec.name.toLowerCase()}`): { command: Command; clipId: ClipId } {
  const start = Math.max(0, Math.round(playhead));
  const length = defaultFrames(editDefaults().solidMs, project.settings.fps);
  const top = project.tracks.filter((track) => track.kind === "video").at(-1);
  const free = top && !top.locked && !top.hidden && clipsInRange(project, top.id, start, start + length).length === 0 ? top : null;
  const newTrack = free ? null : emptyTrack(newId(), "video", nextTrackName(project.tracks, "video"));
  const trackId = (free ?? (newTrack as Track)).id;
  const clip = newShapeClip({ id: newId(), trackId, start, duration: length, spec });
  const trackCommand = newTrack ? addTrack(newTrack) : null;
  return {
    clipId: clip.id,
    command: {
      id: "clip.addShape",
      label,
      affects: ["clips", "timeline", "composite", ...(newTrack ? (["tracks"] as const) : [])],
      run(draft, ctx) {
        trackCommand?.run(draft, ctx);
        draft.clips[clip.id] = structuredClone(clip);
        const track = draft.tracks.find((candidate) => candidate.id === trackId);
        if (!track) throw new Error(`clip.addShape: track ${trackId} does not exist`);
        const at = track.clipIds.findIndex((id) => (draft.clips[id]?.start ?? 0) > start);
        track.clipIds.splice(at === -1 ? track.clipIds.length : at, 0, clip.id);
      },
    },
  };
}

/** The scale an imported icon of `size` gets so its long side is `fraction` of the frame's short side. */
export function fitScale(size: { w: number; h: number }, frame: { width: number; height: number }, fraction = 0.5): number {
  const scale = (fraction * Math.min(frame.width, frame.height)) / Math.max(size.w, size.h, 1);
  return Math.round(scale * 1000) / 1000;
}

// --- Primitive parameters ---------------------------------------------------------------------------

/** `value` as a legal parameter `name` of a primitive: counts are whole numbers in their limits, roundness 0..1, angles in range, the rest lengths >= 0. */
export function clampPrimitiveParam(name: string, value: number): number {
  if (!Number.isFinite(value)) return 0;
  const limit = name === "sides" ? PRIMITIVE_LIMITS.sides : name === "points" ? PRIMITIVE_LIMITS.points : name === "roundness" ? PRIMITIVE_LIMITS.roundness : name === "start" || name === "end" ? PRIMITIVE_LIMITS.angle : null;
  if (limit) {
    const v = Math.min(limit.max, Math.max(limit.min, value));
    return name === "roundness" || name === "start" || name === "end" ? Math.round(v * 1000) / 1000 : Math.round(v);
  }
  return Math.min(16384, Math.max(0, Math.round(value * 100) / 100));
}

/** Regenerates the `d` of every path that has a primitive. */
function regenerate(clip: Draft<ShapeClip>): void {
  for (const path of clip.paths) if (path.primitive) path.d = primitivePathData(path.primitive, clip.size.w, clip.size.h);
}

// --- Edits ---------------------------------------------------------------------------------------------

/** Replaces `prop`'s keys on a draft clip (removed when empty; the clip's key table goes with its last list). */
function putKeys(clip: Draft<ShapeClip>, prop: string, keys: readonly Key[] | undefined): void {
  const next = withKeys(clip.keyframes as Keyframes | undefined, prop, keys);
  if (next) clip.keyframes = next as Draft<Keyframes>;
  else delete clip.keyframes;
}

/** The `Fill` of a path as the Shape section's mode: none, a color, or a gradient. */
export type PathFillMode = "none" | "solid" | "linear" | "radial";

/**
 * Sets path `index`'s fill: a color over a color fill goes through the keys (a key at `rel` while Fill is
 * animated); any other fill replaces it, and drops the fill's keys (a gradient or none cannot be keyed).
 */
export function setPathFill(clip: Draft<ShapeClip>, index: number, fill: Fill | null, rel: Frame): void {
  const path = clip.paths[index];
  if (!path) return;
  if (fill !== null && "r" in fill && path.fill && "r" in path.fill) {
    setShapeField(clip, path.id, "fill", [fill.r, fill.g, fill.b, fill.a], rel);
    return;
  }
  path.fill = structuredClone(fill);
  putKeys(clip, `paths.${path.id}.fill`, undefined);
}

/** The edit of one shape clip: `rel` is the playhead's frame inside the clip. */
export type ShapeEdit = (clip: Draft<ShapeClip>, rel: Frame) => void;

const sameJson = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** The shape clips among `ids` that can be edited (unlocked). */
export function editableShapes(project: Project, ids: Iterable<ClipId>): ShapeClip[] {
  const out: ShapeClip[] = [];
  for (const id of new Set(ids)) {
    const clip = project.clips[id];
    if (clip?.kind === "shape" && !isClipLocked(project, id)) out.push(clip);
  }
  return out;
}

/** The property id of a path's field (`trim.end`, `stroke.width`, `fill`, `primitive.inner`, ...). */
export const shapeProp = (pathId: string, field: string): KeyframeProp => `paths.${pathId}.${field}` as KeyframeProp;

/**
 * Sets `field` of path `pathId` to `value`: a key at `rel` when the property has keys (the stopwatch is on),
 * else its base value. Primitive parameters are clamped. False when the path has no such field.
 */
export function setShapeField(clip: Draft<ShapeClip>, pathId: string, field: string, value: KeyValue, rel: Frame): boolean {
  const prop = shapeProp(pathId, field);
  const path = clip.paths.find((candidate) => candidate.id === pathId);
  if (!path || readProp(clip as ShapeClip, prop) === undefined) return false;
  let next = value;
  if (field.startsWith("primitive.") && !Array.isArray(value)) next = clampPrimitiveParam(field.slice(10), value);
  const keys = clip.keyframes?.[prop];
  if (keys && keys.length > 0) putKeys(clip, prop, setKey(keys, rel, next));
  else writeProp(clip as Draft<ShapeClip>, prop, next);
  return true;
}

/**
 * `edit` on the shape clips among `ids` as one command `clip.shape`, or null when nothing changes.
 * `at` is the playhead (keyed fields write keys there).
 */
export function editShapes(project: Project, ids: Iterable<ClipId>, edit: ShapeEdit, options: { label: string; coalesceKey?: string; at?: Frame }): Command | null {
  const changed: ClipId[] = [];
  let timeline = false;
  for (const clip of editableShapes(project, ids)) {
    const copy = structuredClone(clip) as Draft<ShapeClip>;
    edit(copy, clipRel(clip, options.at ?? clip.start));
    regenerate(copy);
    if (sameJson(copy, clip)) continue;
    // The timeline's swatch shows no path (it draws the shape glyph); its lane shows the keys.
    if (!sameJson(copy.keyframes, clip.keyframes)) timeline = true;
    changed.push(clip.id);
  }
  if (changed.length === 0) return null;
  return {
    id: "clip.shape",
    label: options.label,
    ...(options.coalesceKey !== undefined && { coalesceKey: options.coalesceKey }),
    affects: timeline ? ["composite", "clips"] : ["composite"],
    run(draft) {
      for (const id of changed) {
        const clip = draft.clips[id] as Draft<ShapeClip> | undefined;
        if (!clip || clip.kind !== "shape") continue;
        edit(clip, clipRel(clip, options.at ?? clip.start));
        regenerate(clip);
      }
    },
  };
}

/**
 * `edit` applied to copies of the shape clips among `ids` (as `editShapes` would write it), for the live
 * preview of a scrub or a color drag (P2: no document change). Null when no clip changes.
 */
export function editedShapes(project: Project, ids: Iterable<ClipId>, edit: ShapeEdit, at: Frame): Map<ClipId, ShapeClip> | null {
  const out = new Map<ClipId, ShapeClip>();
  for (const clip of editableShapes(project, ids)) {
    const copy = structuredClone(clip) as Draft<ShapeClip>;
    edit(copy, clipRel(clip, at));
    regenerate(copy);
    if (!sameJson(copy, clip)) out.set(clip.id, copy as ShapeClip);
  }
  return out.size > 0 ? out : null;
}

/** A new stroke for a path that has none: white, as wide as the shape's short side / 90. */
export function defaultStroke(size: { w: number; h: number }): PathStroke {
  return { width: Math.max(2, Math.round(Math.min(size.w, size.h) / 40)), color: { ...WHITE }, align: "center", cap: "round", join: "round", miterLimit: 4 };
}

// --- Stopwatches ---------------------------------------------------------------------------------------

/** The stopwatch groups of a path. */
export const SHAPE_KEY_GROUPS = ["trim", "stroke", "fill", "shape"] as const;
export type ShapeKeyGroup = (typeof SHAPE_KEY_GROUPS)[number];

export const SHAPE_GROUP_LABELS: Readonly<Record<ShapeKeyGroup, string>> = { trim: "Trim", stroke: "Stroke", fill: "Fill", shape: "Shape" };

/** The fields (`trim.end`, ...) of `path`'s group that exist now (a stroke only with a stroke, a fill only as a color, the parameters of its primitive). */
export function groupFields(path: ShapePath, group: ShapeKeyGroup): string[] {
  switch (group) {
    case "trim":
      return ["trim.start", "trim.end", "trim.offset"];
    case "stroke":
      return path.stroke ? ["stroke.width", "stroke.color", "stroke.dashOffset"] : [];
    case "fill":
      return path.fill && "r" in path.fill ? ["fill"] : [];
    case "shape":
      return path.primitive ? PRIMITIVE_PARAMS[path.primitive.kind].map((name) => `primitive.${name}`) : [];
  }
}

const framesOf = (clip: ShapeClip, path: ShapePath, group: ShapeKeyGroup): Frame[] => {
  const frames = new Set<Frame>();
  // A group's keys share their frames, but keys of a field that has since gone (stroke removed) stay in the document: all count.
  for (const field of groupFieldsAll(path, group)) for (const key of clip.keyframes?.[shapeProp(path.id, field)] ?? []) frames.add(key.frame);
  return [...frames].sort((a, b) => a - b);
};

/** Every field the group can ever have (keys may outlive a field: a stroke switched off keeps its keys). */
function groupFieldsAll(path: ShapePath, group: ShapeKeyGroup): string[] {
  if (group === "stroke") return ["stroke.width", "stroke.color", "stroke.dashOffset"];
  if (group === "fill") return ["fill"];
  return groupFields(path, group);
}

const pathOf = (clip: ShapeClip, pathIndex: number): ShapePath | undefined => clip.paths[pathIndex];

/** Whether the group of path `pathIndex` of `clip` has keys. */
export function shapeStopwatchOn(clip: ShapeClip, pathIndex: number, group: ShapeKeyGroup): boolean {
  const path = pathOf(clip, pathIndex);
  return path !== undefined && framesOf(clip, path, group).length > 0;
}

/** The frames (relative to the clip start) of the group's keys. */
export function shapeKeyFrames(clip: ShapeClip, pathIndex: number, group: ShapeKeyGroup): Frame[] {
  const path = pathOf(clip, pathIndex);
  return path ? framesOf(clip, path, group) : [];
}

/** The value `field` of path `pathId` shows `rel` frames in: sampled when keyed, else its base (undefined: the path has no such field). */
export function shapeValueAt(clip: ShapeClip, pathId: string, field: string, rel: Frame): KeyValue | undefined {
  const prop = shapeProp(pathId, field);
  const keys = clip.keyframes?.[prop];
  return keys && keys.length > 0 ? sampleValue(keys, rel) : readProp(clip, prop);
}

/**
 * The stopwatch of a path's group on the shapes among `ids` (path by index): on, a key at the playhead
 * `at` for each field with the value shown; off, every key goes and the fields keep the values they show
 * at the playhead. Null when nothing changes.
 */
export function setShapeStopwatch(project: Project, ids: Iterable<ClipId>, pathIndex: number, group: ShapeKeyGroup, on: boolean, at: Frame): Command | null {
  const label = SHAPE_GROUP_LABELS[group].toLowerCase();
  const edit: ShapeEdit = (clip, rel) => {
    const path = pathOf(clip as ShapeClip, pathIndex);
    if (!path) return;
    const animated = framesOf(clip as ShapeClip, path, group).length > 0;
    if (animated === on) return;
    const pathId = path.id;
    if (on) {
      for (const field of groupFields(path, group)) {
        const value = shapeValueAt(clip as ShapeClip, pathId, field, rel);
        if (value === undefined) continue;
        const prop = shapeProp(pathId, field);
        putKeys(clip, prop, setKey(clip.keyframes?.[prop] ?? [], rel, value));
      }
      return;
    }
    // Bake the values shown at the playhead, then drop the keys.
    for (const field of groupFieldsAll(path, group)) {
      const prop = shapeProp(pathId, field);
      const keys = clip.keyframes?.[prop];
      if (!keys || keys.length === 0) continue;
      writeProp(clip as Draft<ShapeClip>, prop, sampleValue(keys, rel));
      putKeys(clip, prop, undefined);
    }
  };
  return editShapes(project, ids, edit, { label: on ? `Animate ${label}` : `Remove ${label} keyframes`, at });
}

/**
 * The navigator's add / remove at the playhead: when every shape among `ids` has a key of the group there,
 * they are removed; else the shapes without one get one (the values shown there).
 */
export function toggleShapeKey(project: Project, ids: Iterable<ClipId>, pathIndex: number, group: ShapeKeyGroup, at: Frame): Command | null {
  const clips = editableShapes(project, ids).filter((clip) => shapeStopwatchOn(clip, pathIndex, group));
  if (clips.length === 0) return null;
  const remove = clips.every((clip) => shapeKeyFrames(clip, pathIndex, group).includes(clipRel(clip, at)));
  const edit: ShapeEdit = (clip, rel) => {
    const path = pathOf(clip as ShapeClip, pathIndex);
    if (!path) return;
    const has = framesOf(clip as ShapeClip, path, group).includes(rel);
    if (remove && !has) return;
    if (!remove && has) return;
    for (const field of groupFieldsAll(path, group)) {
      const prop = shapeProp(path.id, field);
      const keys = clip.keyframes?.[prop] ?? [];
      if (remove) {
        const rest = keys.filter((key) => key.frame !== rel);
        // The last key going leaves its value as the base (the group stays animated through its other fields).
        if (rest.length === 0 && keys.length > 0) writeProp(clip as Draft<ShapeClip>, prop, sampleValue(keys, rel));
        putKeys(clip, prop, rest);
      } else if (groupFields(path, group).includes(field)) {
        const value = shapeValueAt(clip as ShapeClip, path.id, field, rel);
        if (value !== undefined) putKeys(clip, prop, setKey(keys, rel, value));
      }
    }
  };
  return editShapes(project, clips.map((clip) => clip.id), edit, { label: remove ? "Remove keyframe" : "Add keyframe", at });
}

/** The key frame of the group before (-1) or after (+1) timeline frame `at` on the first shape among `ids` that has one, as a timeline frame. */
export function adjacentShapeKey(project: Project, ids: Iterable<ClipId>, pathIndex: number, group: ShapeKeyGroup, at: Frame, direction: -1 | 1): Frame | null {
  let best: Frame | null = null;
  for (const clip of editableShapes(project, ids)) {
    for (const rel of shapeKeyFrames(clip, pathIndex, group)) {
      const frame = clip.start + rel;
      if (direction === 1 ? frame > at && (best === null || frame < best) : frame < at && (best === null || frame > best)) best = frame;
    }
  }
  return best;
}
