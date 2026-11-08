// Parenting (spec §21.14, Batch 69): a clip's transform is in its parent's space. The parent's world
// transform applies after the clip's own, with the parent's own position as the origin (After Effects
// semantics): rotating a parent turns its children around the parent's position, which is its anchor
// point. Opacity is not inherited. Every ancestor is evaluated at the frame clamped into its own range.
//
// A transform has no skew: with a non-uniform parent scale and a rotated child the result is the closest
// rotation + scale + scaleY (exact for uniform parent scales). Flips are not inherited.
import { animatedTransform } from "./keyframes.js";
import type { Clip, ClipId, Project, Transform } from "./types.js";

/** x' = a x + c y + tx, y' = b x + d y + ty: a clip's space in the frame, relative to the frame's center. */
export interface Affine {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

const MAX_DEPTH = 64;
const RAD = Math.PI / 180;

/** The affine of `transform` about its position (the anchor offsets the content, not the space). */
export function affineOf(transform: Transform): Affine {
  const rotation = transform.rotation * RAD;
  const sin = Math.sin(rotation);
  const cos = Math.cos(rotation);
  const sx = transform.scale;
  const sy = transform.scaleY ?? transform.scale;
  return { a: cos * sx, b: sin * sx, c: -sin * sy, d: cos * sy, tx: transform.x, ty: transform.y };
}

/** `parent` after `local`: the point goes through `local`, then `parent`. */
export function composeAffine(parent: Affine, local: Affine): Affine {
  return {
    a: parent.a * local.a + parent.c * local.b,
    b: parent.b * local.a + parent.d * local.b,
    c: parent.a * local.c + parent.c * local.d,
    d: parent.b * local.c + parent.d * local.d,
    tx: parent.tx + parent.a * local.tx + parent.c * local.ty,
    ty: parent.ty + parent.b * local.tx + parent.d * local.ty,
  };
}

export function invertAffine(m: Affine): Affine | null {
  const det = m.a * m.d - m.b * m.c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  const a = m.d / det;
  const b = -m.b / det;
  const c = -m.c / det;
  const d = m.a / det;
  return { a, b, c, d, tx: -(a * m.tx + c * m.ty), ty: -(b * m.tx + d * m.ty) };
}

/** `m` as x, y, rotation, scale and scaleY written into `out`; `hint` keeps the rotation turn and the scale sign the clip had. */
export function writeAffine(out: Transform, m: Affine, hint: Transform): Transform {
  const sign = hint.scale < 0 ? -1 : 1;
  const length = Math.hypot(m.a, m.b);
  out.x = m.tx;
  out.y = m.ty;
  if (length < 1e-9) {
    out.scale = 0;
    out.scaleY = 0;
    out.rotation = hint.rotation;
    return out;
  }
  const sx = sign * length;
  let rotation = (Math.atan2(sign * m.b, sign * m.a) * 180) / Math.PI;
  // The turn nearest the hint (a rotation of 370 stays 370, not 10).
  rotation += 360 * Math.round((hint.rotation - rotation) / 360);
  out.rotation = rotation;
  out.scale = sx;
  out.scaleY = (m.a * m.d - m.b * m.c) / sx;
  return out;
}

type Placed = Parameters<typeof animatedTransform>[0] & { start: number; duration: number };

/** The clip's parent in `project`, or null (none, gone, itself, or a clip without a transform). */
export function parentOf(project: Project, clip: Clip): Clip | null {
  if (clip.parentId === undefined || clip.parentId === clip.id) return null;
  const parent = project.clips[clip.parentId];
  return parent && "transform" in parent ? parent : null;
}

/** The ids a clip's parent chain passes through, nearest first (stops at a cycle or a gone parent). */
export function ancestorsOf(project: Project, clip: Clip): ClipId[] {
  const out: ClipId[] = [];
  let at: Clip | null = clip;
  while (out.length < MAX_DEPTH) {
    at = parentOf(project, at);
    if (!at || at.id === clip.id || out.includes(at.id)) break;
    out.push(at.id);
  }
  return out;
}

/** The clips whose parent chain reaches `id` (its children, grandchildren and so on). */
export function descendantsOf(project: Project, id: ClipId): ClipId[] {
  const out: ClipId[] = [];
  for (const key in project.clips) {
    const clip = project.clips[key] as Clip;
    if (clip.id !== id && ancestorsOf(project, clip).includes(id)) out.push(clip.id);
  }
  return out;
}

/**
 * World transforms for one frame, memoized per clip: `begin` for a frame, then `resolve` per drawn clip
 * (a parent chain is evaluated once however many children share it, so 100 parented layers stay cheap).
 * `overrides` are the live transforms of a gesture (local, like the clip's own).
 */
export class RigResolver {
  private project: Project | null = null;
  private frame = 0;
  private overrides: ReadonlyMap<ClipId, Transform> | null = null;
  private readonly cache = new Map<ClipId, Affine>();
  private readonly active = new Set<ClipId>();
  private readonly scratch: Transform = { x: 0, y: 0, scale: 1, rotation: 0, anchor: { x: 0, y: 0 }, flipH: false, flipV: false };

  begin(project: Project, frame: number, overrides: ReadonlyMap<ClipId, Transform> | null): void {
    this.project = project;
    this.frame = frame;
    this.overrides = overrides;
    this.cache.clear();
    this.active.clear();
  }

  /** The space of `clip`'s parent at the frame, or null. */
  parentSpace(clip: Clip): Affine | null {
    const project = this.project;
    const parent = project ? parentOf(project, clip) : null;
    return parent ? this.world(parent) : null;
  }

  /** The world affine of `clip` (its own transform at the frame clamped into its range, then its ancestors'). */
  world(clip: Clip): Affine {
    const known = this.cache.get(clip.id);
    if (known) return known;
    const project = this.project as Project;
    const rel = Math.min(Math.max(this.frame - clip.start, 0), clip.duration - 1);
    const local = "transform" in clip ? (this.overrides?.get(clip.id) ?? animatedTransform(clip as Placed, rel, this.scratch)) : this.scratch;
    let own = affineOf(local);
    if (!this.active.has(clip.id) && this.active.size < MAX_DEPTH) {
      this.active.add(clip.id);
      const parent = parentOf(project, clip);
      if (parent) own = composeAffine(this.world(parent), own);
      this.active.delete(clip.id);
    }
    this.cache.set(clip.id, own);
    return own;
  }

  /** `local` (the clip's transform at the frame) in the frame's space: `local` itself when there is no parent, else written into `out`. */
  resolve(clip: Clip, local: Transform, out: Transform): Transform {
    const space = this.parentSpace(clip);
    if (!space) return local;
    out.anchor = local.anchor;
    out.flipH = local.flipH;
    out.flipV = local.flipV;
    return writeAffine(out, composeAffine(space, affineOf(local)), local);
  }
}

/**
 * The local transform that shows `world` at `frame` under `clipId`'s parent (the parent as the document
 * has it, or with the live local `overrides` of a gesture that also moves it), the inverse of `RigResolver.resolve`. `world` itself when the clip has no parent.
 */
export function worldToLocal(project: Project, clipId: ClipId, world: Transform, frame: number, overrides: ReadonlyMap<ClipId, Transform> | null = null, resolver = new RigResolver()): Transform {
  const clip = project.clips[clipId];
  if (!clip) return world;
  resolver.begin(project, frame, overrides);
  const space = resolver.parentSpace(clip);
  const inverse = space ? invertAffine(space) : null;
  if (!inverse) return world;
  const out: Transform = { ...world, anchor: world.anchor };
  return writeAffine(out, composeAffine(inverse, affineOf(world)), world);
}
