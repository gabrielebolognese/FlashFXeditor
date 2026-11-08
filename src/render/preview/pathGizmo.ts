// The motion path on the canvas (Batch 69, spec §21.14): the selected clip's `transform.position` keys
// drawn as a curve with a point per key and a handle per tangent. Pure geometry: the scene (in project
// points, origin top-left), the hit test and the key edit a drag makes. CanvasEditInput owns the gesture
// (ephemeral edits while dragging, one `setPathKeys` command on release, P2) and PreviewOverlayView draws.
import { invertAffine, RigResolver, type Affine } from "../../core/document/rig.js";
import { positionOnSegment } from "../../core/document/positionPath.js";
import type { Clip, ClipId, KeyData, Project } from "../../core/document/types.js";
import type { PathKeyEdit } from "../../timeline/edit/rig.js";

type Vec = [number, number];

export interface PathKeyMark {
  /** Index in the clip's position keys. */
  index: number;
  /** The key's frame, relative to the clip start. */
  frame: number;
  x: number;
  y: number;
}

export interface PathHandleMark {
  index: number;
  side: "in" | "out";
  x: number;
  y: number;
  /** The key point the handle hangs from. */
  fromX: number;
  fromY: number;
}

export interface PathScene {
  clipId: ClipId;
  /** The curve: x, y pairs. */
  line: number[];
  keys: PathKeyMark[];
  handles: PathHandleMark[];
}

/** What a press on the path grabbed. */
export type PathHit = { kind: "key"; index: number } | { kind: "handle"; index: number; side: "in" | "out" };

/** The live (ephemeral) edits of a drag, by key index. */
export type PathLive = ReadonlyMap<number, PathKeyEdit>;

const SAMPLES = 24;
const IDENTITY: Affine = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };

export function positionKeys(clip: Clip): KeyData[] {
  return "keyframes" in clip ? (clip.keyframes?.["transform.position"] ?? []) : [];
}

/** The keys as a drag edits them: `live` laid over the document's. */
function editedKeys(keys: readonly KeyData[], live: PathLive | null): KeyData[] {
  if (!live) return keys.map((key) => ({ ...key }));
  return keys.map((key, index) => {
    const edit = live.get(index);
    if (!edit) return { ...key };
    const out: KeyData = { ...key };
    if (edit.value) out.value = [...edit.value];
    for (const side of ["spatialIn", "spatialOut"] as const) {
      const value = edit[side];
      if (value === undefined) continue;
      if (value === null) delete out[side];
      else out[side] = [...value];
    }
    return out;
  });
}

/** The space the clip's position keys live in (its parent's world at the frame), identity without a parent. */
export function pathSpace(project: Project, clip: Clip, frame: number): Affine {
  const resolver = new RigResolver();
  resolver.begin(project, frame, null);
  return resolver.parentSpace(clip) ?? IDENTITY;
}

const mapPoint = (m: Affine, x: number, y: number, cx: number, cy: number): Vec => [cx + m.a * x + m.c * y + m.tx, cy + m.b * x + m.d * y + m.ty];
const mapVector = (m: Affine, x: number, y: number): Vec => [m.a * x + m.c * y, m.b * x + m.d * y];

/** The path scene of `clip` (null with fewer than one position key), optionally with a drag's live edits. */
export function pathScene(project: Project, clip: Clip, frame: number, live: PathLive | null = null): PathScene | null {
  const stored = positionKeys(clip);
  if (stored.length === 0) return null;
  const keys = editedKeys(stored, live);
  const space = pathSpace(project, clip, frame);
  const cx = project.settings.width / 2;
  const cy = project.settings.height / 2;
  const point = (v: Vec) => mapPoint(space, v[0], v[1], cx, cy);
  const scene: PathScene = { clipId: clip.id, line: [], keys: [], handles: [] };
  keys.forEach((key, index) => {
    const value = key.value as Vec;
    const [x, y] = point(value);
    scene.keys.push({ index, frame: key.frame, x, y });
    for (const side of ["in", "out"] as const) {
      const tangent = side === "in" ? key.spatialIn : key.spatialOut;
      if (!tangent || (tangent[0] === 0 && tangent[1] === 0)) continue;
      const [dx, dy] = mapVector(space, tangent[0], tangent[1]);
      scene.handles.push({ index, side, x: x + dx, y: y + dy, fromX: x, fromY: y });
    }
  });
  for (let i = 0; i + 1 < keys.length; i++) {
    const from = keys[i] as KeyData;
    const to = keys[i + 1] as KeyData;
    for (let s = i === 0 ? 0 : 1; s <= SAMPLES; s++) {
      const p = positionOnSegment(from.value as Vec, to.value as Vec, from.spatialOut, to.spatialIn, s / SAMPLES);
      const [x, y] = point(p);
      scene.line.push(x, y);
    }
  }
  if (scene.line.length === 0) scene.line.push(scene.keys[0]?.x ?? 0, scene.keys[0]?.y ?? 0);
  return scene;
}

/** What a press at `x, y` (project points) grabs: handles first (they sit over keys), then key points. `reach` in project points. */
export function hitPath(scene: PathScene, x: number, y: number, reach: number): PathHit | null {
  let best: PathHit | null = null;
  let bestDistance = reach;
  for (const handle of scene.handles) {
    const d = Math.hypot(handle.x - x, handle.y - y);
    if (d <= bestDistance) {
      bestDistance = d;
      best = { kind: "handle", index: handle.index, side: handle.side };
    }
  }
  if (best) return best;
  for (const key of scene.keys) {
    const d = Math.hypot(key.x - x, key.y - y);
    if (d <= bestDistance) {
      bestDistance = d;
      best = { kind: "key", index: key.index };
    }
  }
  return best;
}

/**
 * The edit a drag makes. `to` is the pointer (project points) with the grab offset removed; `symmetric` (Alt)
 * mirrors a dragged tangent on the other side, or pulls both tangents out of a key.
 */
export function pathDragEdit(project: Project, clip: Clip, frame: number, hit: PathHit, start: { x: number; y: number }, to: { x: number; y: number }, symmetric: boolean): PathLive | null {
  const keys = positionKeys(clip);
  const key = keys[hit.index];
  if (!key) return null;
  const inverse = invertAffine(pathSpace(project, clip, frame));
  if (!inverse) return null;
  const cx = project.settings.width / 2;
  const cy = project.settings.height / 2;
  const value = key.value as Vec;
  // The pointer in the space of the keys.
  const local = (p: { x: number; y: number }): Vec => mapPoint(inverse, p.x - cx, p.y - cy, 0, 0);
  const round = (v: number) => Math.round(v * 100) / 100 || 0;
  const here = local(to);
  if (hit.kind === "key") {
    const from = local(start);
    const dx = here[0] - from[0];
    const dy = here[1] - from[1];
    const edit: PathKeyEdit = { value: [round(value[0] + dx), round(value[1] + dy)] };
    if (symmetric) {
      edit.spatialOut = [round(dx), round(dy)];
      edit.spatialIn = [round(-dx), round(-dy)];
    }
    return new Map([[hit.index, edit]]);
  }
  const offset: Vec = [round(here[0] - value[0]), round(here[1] - value[1])];
  const edit: PathKeyEdit = hit.side === "out" ? { spatialOut: offset } : { spatialIn: offset };
  if (symmetric) {
    const mirror: Vec = [-offset[0] || 0, -offset[1] || 0];
    if (hit.side === "out") edit.spatialIn = mirror;
    else edit.spatialOut = mirror;
  }
  return new Map([[hit.index, edit]]);
}

/** `live` by key frame, for `setPathKeys`. */
export function liveByFrame(clip: Clip, live: PathLive): Map<number, PathKeyEdit> {
  const keys = positionKeys(clip);
  const out = new Map<number, PathKeyEdit>();
  for (const [index, edit] of live) {
    const key = keys[index];
    if (key) out.set(key.frame, edit);
  }
  return out;
}

/** The numbers of a scene, flattened (the overlay compares them to skip a redraw that would draw the same). */
export function flattenPath(scene: PathScene | null, out: number[]): void {
  if (!scene) {
    out.push(0);
    return;
  }
  out.push(1, scene.line.length, scene.keys.length, scene.handles.length);
  for (const n of scene.line) out.push(n);
  for (const key of scene.keys) out.push(key.x, key.y, key.frame);
  for (const handle of scene.handles) out.push(handle.x, handle.y, handle.side === "in" ? 0 : 1);
}
