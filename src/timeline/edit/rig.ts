// Parenting, null clips and motion paths as commands (spec §21.14, Batch 69). Pure: they read the
// project and return a `Command`; the controllers pick the clips and the frame.
//
// - `setParent` keeps every child's world placement at the playhead (and at each of its transform keys):
//   the local transform and keys are converted under the new parent, so nothing jumps.
// - `convertToMotionPath` turns a clip's x and y keys into `transform.position` keys (straight segments,
//   no tangents yet; `smoothMotionPath` gives them auto-bezier tangents); `convertFromMotionPath` goes back
//   (the tangents are dropped: the clip follows straight lines between the points).
import type { Draft } from "immer";
import { addTrack } from "../../core/commands/basicCommands.js";
import type { Command } from "../../core/commands/command.js";
import { animatedTransform, clipRel, samplePath, sampleVector, withKeys } from "../../core/document/keyframes.js";
import { autoSpatialTangents } from "../../core/document/positionPath.js";
import { emptyTrack, nextTrackName } from "../../core/document/project.js";
import { ancestorsOf, composeAffine, invertAffine, parentOf, RigResolver, worldToLocal } from "../../core/document/rig.js";
import type { Clip, ClipId, Frame, KeyData, Keyframes, NullClip, Project, Track, Transform } from "../../core/document/types.js";
import { clipsInRange, isClipLocked } from "../model/queries.js";
import { defaultFrames, editDefaults } from "./editDefaults.js";
import { applyTransformWrite, IDENTITY_TRANSFORM, isTransformClip, normalizeTransform, type TransformClip } from "./transform.js";

/** The outline of a new null, project px. */
export const NULL_SIZE = 100;

/** `+ Null`: an invisible controller at the playhead, on the topmost video track when it is free there, else on a new track above. */
export function addNull(project: Project, playhead: Frame, newId: () => string): { command: Command; clipId: ClipId } {
  const start = Math.max(0, Math.round(playhead));
  const length = defaultFrames(editDefaults().solidMs, project.settings.fps);
  const top = project.tracks.filter((track) => track.kind === "video").at(-1);
  const free = top && !top.locked && !top.hidden && clipsInRange(project, top.id, start, start + length).length === 0 ? top : null;
  const newTrack = free ? null : emptyTrack(newId(), "video", nextTrackName(project.tracks, "video"));
  const trackId = (free ?? (newTrack as Track)).id;
  const clip: NullClip = {
    id: newId(),
    trackId,
    kind: "null",
    name: "Null",
    start,
    duration: length,
    enabled: true,
    size: { w: NULL_SIZE, h: NULL_SIZE },
    transform: structuredClone(IDENTITY_TRANSFORM),
  };
  const trackCommand = newTrack ? addTrack(newTrack) : null;
  return {
    clipId: clip.id,
    command: {
      id: "clip.addNull",
      label: "Add null",
      affects: ["clips", "timeline", "composite", ...(newTrack ? (["tracks"] as const) : [])],
      run(draft, ctx) {
        trackCommand?.run(draft, ctx);
        draft.clips[clip.id] = structuredClone(clip);
        const track = draft.tracks.find((candidate) => candidate.id === trackId);
        if (!track) throw new Error(`clip.addNull: track ${trackId} does not exist`);
        const at = track.clipIds.findIndex((id) => (draft.clips[id]?.start ?? 0) > start);
        track.clipIds.splice(at === -1 ? track.clipIds.length : at, 0, clip.id);
      },
    },
  };
}

/** The key of the track list a clip sits in: "" for the project's own tracks, else its sequence id (and null for none). */
function scopeOf(project: Project, clip: Clip): string | null {
  if (project.tracks.some((track) => track.id === clip.trackId)) return "";
  for (const sequence of Object.values(project.sequences)) if (sequence.tracks.some((track) => track.id === clip.trackId)) return sequence.id;
  return null;
}

/** Why `parentId` cannot be `childId`'s parent (a sentence), or null when it can. */
export function parentProblem(project: Project, childId: ClipId, parentId: ClipId): string | null {
  const child = project.clips[childId];
  const parent = project.clips[parentId];
  if (!child || !parent) return "The clip does not exist.";
  if (!isTransformClip(child)) return "This kind of clip cannot have a parent.";
  if (childId === parentId) return "A clip cannot be its own parent.";
  if (!isTransformClip(parent)) return "That clip has no transform to follow.";
  if (scopeOf(project, child) !== scopeOf(project, parent)) return "The parent must be in the same sequence.";
  if (ancestorsOf(project, parent).includes(childId)) return "That would make a loop: the clip is already a parent of it.";
  return null;
}

/** The clips that can be `childId`'s parent, in track order (top track first): for the Parent picker. */
export function parentCandidates(project: Project, childId: ClipId): Clip[] {
  const out: Clip[] = [];
  for (const track of [...project.tracks].reverse()) {
    for (const id of track.clipIds) if (parentProblem(project, childId, id) === null) out.push(project.clips[id] as Clip);
  }
  for (const sequence of Object.values(project.sequences)) {
    for (const track of [...sequence.tracks].reverse()) {
      for (const id of track.clipIds) if (parentProblem(project, childId, id) === null) out.push(project.clips[id] as Clip);
    }
  }
  return out;
}

interface Write {
  id: ClipId;
  parentId: ClipId | null;
  transform: Transform;
  keyframes?: Keyframes | undefined;
}

const TRANSFORM_PROPS = ["transform.x", "transform.y", "transform.scale", "transform.scaleY", "transform.rotation"] as const;
const same = (a: number, b: number) => Math.abs(a - b) < 1e-6;

/** The frames (project timeline) at which a clip's transform has keys, ascending. */
function keyedFrames(clip: TransformClip): Frame[] {
  const frames = new Set<Frame>();
  for (const prop of [...TRANSFORM_PROPS, "transform.position"] as const) for (const key of clip.keyframes?.[prop] ?? []) frames.add(clip.start + key.frame);
  return [...frames].sort((a, b) => a - b);
}

/** How `clip` is written when it follows `parentId` (or nobody) and still shows where it does at `frame` (and at every key). */
function reparentWrite(project: Project, clip: TransformClip, parentId: ClipId | null, frame: Frame): Write {
  const after: Clip = { ...clip };
  if (parentId === null) delete after.parentId;
  else after.parentId = parentId;
  const next: Project = { ...project, clips: { ...project.clips, [clip.id]: after } };
  const resolverBefore = new RigResolver();
  const resolverAfter = new RigResolver();
  const scratch: Transform = { x: 0, y: 0, scale: 1, rotation: 0, anchor: { x: 0, y: 0 }, flipH: false, flipV: false };
  const worldBefore = (at: Frame): Transform => {
    resolverBefore.begin(project, at, null);
    const rel = Math.min(Math.max(at - clip.start, 0), clip.duration - 1);
    const local = animatedTransform(clip, rel, scratch);
    return resolverBefore.resolve(clip, local, {} as Transform);
  };
  const localAfter = (at: Frame): Transform => worldToLocal(next, clip.id, worldBefore(at), at, null, resolverAfter);

  const frames = keyedFrames(clip);
  const here = Math.min(Math.max(frame, clip.start), clip.start + clip.duration - 1);
  const base = normalizeTransform({ ...localAfter(here), anchor: clip.transform.anchor, flipH: clip.transform.flipH, flipV: clip.transform.flipV });
  if (frames.length === 0 || !clip.keyframes) return { id: clip.id, parentId, transform: base };

  const at = new Map<Frame, Transform>(frames.map((f) => [f, localAfter(f)]));
  let keyframes: Keyframes | undefined = { ...clip.keyframes };
  const path = clip.keyframes["transform.position"];
  const hasPath = path !== undefined && path.length > 0;
  if (hasPath) {
    // The points and tangents of the path, seen from the new parent (a tangent is an offset: only the linear part applies).
    const moved: KeyData[] = path.map((key) => {
      const f = clip.start + key.frame;
      resolverBefore.begin(project, f, null);
      resolverAfter.begin(next, f, null);
      const through = composeAffine(invertOrIdentity(resolverAfter.parentSpace(after)), resolverBefore.parentSpace(clip) ?? IDENTITY);
      const local = at.get(f) as Transform;
      const out: KeyData = { ...key, value: [local.x, local.y] };
      for (const side of ["spatialIn", "spatialOut"] as const) {
        const t = key[side];
        if (t) out[side] = [through.a * t[0] + through.c * t[1], through.b * t[0] + through.d * t[1]];
      }
      return out;
    });
    keyframes = withKeys(keyframes, "transform.position", moved);
  }
  // Auto-orient adds the path's heading to the rotation: the local rotation is what is left of the world one.
  const heading = (rel: Frame): number => {
    const keys = keyframes?.["transform.position"];
    return clip.autoOrient && keys ? (samplePath(keys, rel, [0, 0]) ?? 0) : 0;
  };
  for (const prop of TRANSFORM_PROPS) {
    if (hasPath && (prop === "transform.x" || prop === "transform.y")) continue;
    const value = (f: Frame): number => readProp(at.get(f) as Transform, prop) - (prop === "transform.rotation" ? heading(f - clip.start) : 0);
    const keys = clip.keyframes[prop];
    if (keys && keys.length > 0) keyframes = withKeys(keyframes, prop, keys.map((key) => ({ ...key, value: value(clip.start + key.frame) })));
    else if (frames.some((f) => !same(value(f), value(frames[0] as Frame)))) {
      // Still before, but the parent moves it between the keys: it gets keys there, exact at each.
      keyframes = withKeys(keyframes, prop, frames.map((f): KeyData => ({ frame: f - clip.start, value: value(f), ease: "linear" })));
    }
  }
  const rotation = base.rotation - heading(here - clip.start);
  return { id: clip.id, parentId, transform: { ...base, rotation }, keyframes };
}

function readProp(t: Transform, prop: (typeof TRANSFORM_PROPS)[number]): number {
  return prop === "transform.x" ? t.x : prop === "transform.y" ? t.y : prop === "transform.scale" ? t.scale : prop === "transform.scaleY" ? (t.scaleY ?? t.scale) : t.rotation;
}

const IDENTITY = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
const invertOrIdentity = (m: ReturnType<RigResolver["parentSpace"]>) => (m ? (invertAffine(m) ?? IDENTITY) : IDENTITY);

/**
 * Sets (or with `null` clears) the parent of `ids`. Each child keeps its world placement at `frame` (and at
 * each of its transform keys): its local transform and keys are converted. Clips that cannot have it,
 * locked ones and clips that already have it are skipped; null when nothing changes.
 */
export function setParent(project: Project, ids: readonly ClipId[], parentId: ClipId | null, frame: Frame, label = parentId === null ? "Clear parent" : "Set parent"): Command | null {
  const writes: Write[] = [];
  for (const id of ids) {
    const clip = project.clips[id];
    if (!clip || !isTransformClip(clip) || isClipLocked(project, id)) continue;
    if ((clip.parentId ?? null) === parentId) continue;
    if (parentId !== null && parentProblem(project, id, parentId) !== null) continue;
    if (parentId === null && parentOf(project, clip) === null && clip.parentId === undefined) continue;
    writes.push(reparentWrite(project, clip, parentId, frame));
  }
  if (writes.length === 0) return null;
  return {
    id: parentId === null ? "clip.clearParent" : "clip.setParent",
    label,
    affects: ["clips", "composite", "timeline"],
    run(draft) {
      for (const write of writes) {
        const clip = draft.clips[write.id] as Draft<TransformClip> | undefined;
        if (!clip) throw new Error(`clip.setParent: clip ${write.id} does not exist`);
        if (write.parentId === null) delete clip.parentId;
        else clip.parentId = write.parentId;
        applyTransformWrite(clip, { transform: write.transform, ...(write.keyframes !== undefined || clip.keyframes ? { keyframes: write.keyframes } : {}) });
      }
    },
  };
}

/** Whether a clip's x or y has keys (a candidate for `Convert to motion path`). */
export function hasPositionKeys(clip: Clip): boolean {
  return "keyframes" in clip && (clip.keyframes?.["transform.x"]?.length ?? 0) + (clip.keyframes?.["transform.y"]?.length ?? 0) > 0;
}

export function onMotionPath(clip: Clip): boolean {
  return "keyframes" in clip && (clip.keyframes?.["transform.position"]?.length ?? 0) > 0;
}

function toPath(clip: TransformClip, at: Frame): Keyframes | undefined {
  const keyframes = clip.keyframes;
  const xs = keyframes?.["transform.x"] ?? [];
  const ys = keyframes?.["transform.y"] ?? [];
  const frames = new Set<Frame>([...xs.map((k) => k.frame), ...ys.map((k) => k.frame)]);
  if (frames.size === 0) frames.add(clipRel(clip, at));
  const sample = (keys: readonly KeyData[], rel: Frame, base: number): number => {
    if (keys.length === 0) return base;
    const v = sampleVector(keys, rel, []);
    return v[0] ?? base;
  };
  const path: KeyData[] = [];
  for (const frame of [...frames].sort((a, b) => a - b)) {
    const source = xs.find((k) => k.frame === frame) ?? ys.find((k) => k.frame === frame);
    const key: KeyData = { frame, value: [sample(xs, frame, clip.transform.x), sample(ys, frame, clip.transform.y)], ease: source?.ease ?? "linear" };
    if (source?.bezier) key.bezier = [...source.bezier];
    if (source?.spring) key.spring = { ...source.spring };
    path.push(key);
  }
  return withKeys(withKeys(withKeys(keyframes, "transform.x", undefined), "transform.y", undefined), "transform.position", path);
}

/** `Convert to motion path`: x and y keys (or, with none, the clip's place at `at`) become `transform.position` keys. */
export function convertToMotionPath(project: Project, ids: readonly ClipId[], at: Frame): Command | null {
  const writes: { id: ClipId; keyframes: Keyframes | undefined }[] = [];
  for (const id of ids) {
    const clip = project.clips[id];
    if (!clip || !isTransformClip(clip) || isClipLocked(project, id) || onMotionPath(clip)) continue;
    writes.push({ id, keyframes: toPath(clip, at) });
  }
  if (writes.length === 0) return null;
  return {
    id: "clip.motionPath",
    label: "Convert to motion path",
    affects: ["clips", "composite", "timeline"],
    run(draft) {
      for (const { id, keyframes } of writes) {
        const clip = draft.clips[id] as Draft<TransformClip>;
        if (keyframes) clip.keyframes = structuredClone(keyframes);
      }
    },
  };
}

function fromPath(clip: TransformClip): Keyframes | undefined {
  const path = clip.keyframes?.["transform.position"] ?? [];
  const copy = (key: KeyData, value: number): KeyData => {
    const out: KeyData = { frame: key.frame, value, ease: key.ease };
    if (key.bezier) out.bezier = [...key.bezier];
    if (key.spring) out.spring = { ...key.spring };
    return out;
  };
  const xs = path.map((key) => copy(key, (key.value as number[])[0] ?? 0));
  const ys = path.map((key) => copy(key, (key.value as number[])[1] ?? 0));
  return withKeys(withKeys(withKeys(clip.keyframes, "transform.position", undefined), "transform.x", xs), "transform.y", ys);
}

/** `Convert to x and y keys`: the path's points become `transform.x` and `transform.y` keys (the curve between them is lost). */
export function convertFromMotionPath(project: Project, ids: readonly ClipId[]): Command | null {
  const writes: { id: ClipId; keyframes: Keyframes | undefined }[] = [];
  for (const id of ids) {
    const clip = project.clips[id];
    if (!clip || !isTransformClip(clip) || isClipLocked(project, id) || !onMotionPath(clip)) continue;
    writes.push({ id, keyframes: fromPath(clip) });
  }
  if (writes.length === 0) return null;
  return {
    id: "clip.unMotionPath",
    label: "Convert to x and y keys",
    affects: ["clips", "composite", "timeline"],
    run(draft) {
      for (const { id, keyframes } of writes) {
        const clip = draft.clips[id] as Draft<TransformClip>;
        if (keyframes) clip.keyframes = structuredClone(keyframes);
        else delete clip.keyframes;
        delete clip.autoOrient;
      }
    },
  };
}

/** Auto-bezier tangents on every key of the clips' paths (smooth through the points). */
export function smoothMotionPath(project: Project, ids: readonly ClipId[]): Command | null {
  const writes: { id: ClipId; keys: KeyData[] }[] = [];
  for (const id of ids) {
    const clip = project.clips[id];
    if (!clip || !isTransformClip(clip) || isClipLocked(project, id) || !onMotionPath(clip)) continue;
    const keys = (clip.keyframes?.["transform.position"] ?? []) as KeyData[];
    const next = keys.map((key, i) => {
      const point = (k: KeyData | undefined): [number, number] | null => (k ? [(k.value as number[])[0] ?? 0, (k.value as number[])[1] ?? 0] : null);
      const tangents = autoSpatialTangents(point(keys[i - 1]), point(key) as [number, number], point(keys[i + 1]));
      const out: KeyData = { ...key };
      if (i > 0) out.spatialIn = tangents.in;
      else delete out.spatialIn;
      if (i < keys.length - 1) out.spatialOut = tangents.out;
      else delete out.spatialOut;
      return out;
    });
    writes.push({ id, keys: next });
  }
  if (writes.length === 0) return null;
  return {
    id: "clip.smoothPath",
    label: "Smooth motion path",
    affects: ["clips", "composite"],
    run(draft) {
      for (const { id, keys } of writes) {
        const clip = draft.clips[id] as Draft<TransformClip>;
        if (clip.keyframes) clip.keyframes["transform.position"] = structuredClone(keys);
      }
    },
  };
}

/** Auto-orient on or off for the clips. */
export function setAutoOrient(project: Project, ids: readonly ClipId[], on: boolean): Command | null {
  const targets = ids.filter((id) => {
    const clip = project.clips[id];
    return clip && isTransformClip(clip) && !isClipLocked(project, id) && (clip.autoOrient === true) !== on;
  });
  if (targets.length === 0) return null;
  return {
    id: "clip.autoOrient",
    label: on ? "Auto-orient on" : "Auto-orient off",
    affects: ["clips", "composite"],
    run(draft) {
      for (const id of targets) {
        const clip = draft.clips[id] as Draft<TransformClip>;
        if (on) clip.autoOrient = true;
        else delete clip.autoOrient;
      }
    },
  };
}

/** What a canvas gesture changes on one motion-path key: its point and/or a tangent (null removes it). */
export interface PathKeyEdit {
  value?: [number, number];
  spatialIn?: [number, number] | null;
  spatialOut?: [number, number] | null;
}

/** One command for a path gesture (a key dragged, a tangent handle dragged): `edits` by key frame (relative to the clip start). */
export function setPathKeys(project: Project, clipId: ClipId, edits: ReadonlyMap<Frame, PathKeyEdit>, label: string): Command | null {
  const clip = project.clips[clipId];
  if (!clip || !isTransformClip(clip) || isClipLocked(project, clipId)) return null;
  const keys = clip.keyframes?.["transform.position"];
  if (!keys) return null;
  let changed = false;
  const next = keys.map((key) => {
    const edit = edits.get(key.frame);
    if (!edit) return { ...key };
    const out: KeyData = { ...key };
    if (edit.value) out.value = [...edit.value];
    for (const side of ["spatialIn", "spatialOut"] as const) {
      const value = edit[side];
      if (value === undefined) continue;
      if (value === null) delete out[side];
      else out[side] = [...value];
    }
    if (JSON.stringify(out) !== JSON.stringify(key)) changed = true;
    return out;
  });
  if (!changed) return null;
  return {
    id: "clip.pathKey",
    label,
    affects: ["clips", "composite"],
    run(draft) {
      const target = draft.clips[clipId] as Draft<TransformClip>;
      if (target.keyframes) target.keyframes["transform.position"] = structuredClone(next);
    },
  };
}

