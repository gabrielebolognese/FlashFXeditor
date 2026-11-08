// 2.5D projection of a layer (spec §21.15, Batch 70). A layer is laid out flat as before (its 2D model:
// anchor, scale, rotation, position, `writeModel`); its X and Y rotation and depth then turn that flat
// picture in 3D about its anchor point and the fixed camera of `core/space/camera3d.ts` projects it back:
//   world = T(0, 0, z) * T(p) * Rz * Ry * Rx * Rz^-1 * T(-p)      (p: the anchor in project px)
// so the X and Y axes are the layer's own (after its Z rotation), as in After Effects. For the points of
// the flat plane that is a 3x3 homography in project px (`Homography`), applied after the layer's model.
// The renderers draw it with perspective-correct texturing (the vertex stage outputs w); hit testing and
// the gizmo use the projected quad. Signs follow CSS: positive rotationY turns the right edge away,
// positive rotationX the top edge.
import type { Transform } from "../core/document/types.js";
import { frameCamera } from "../core/space/camera3d.js";
import { multiply, multiplyAll, rotateX, rotateY, rotateZ, translate, type Mat4 } from "../core/space/mat4.js";
import type { Mat3 } from "./mat3.js";

/**
 * A projective map of the plane, project px -> project px: (x, y) -> ((a x + c y + tx) / w, (b x + d y + ty) / w)
 * with w = g x + h y + i. The first six entries read like a `Mat3`.
 */
export type Homography = [a: number, b: number, c: number, d: number, tx: number, ty: number, g: number, h: number, i: number];

/** The viewing distance a project or sequence gets when it has none set (spec §21.15). */
export const DEFAULT_PERSPECTIVE = 1600;
/** The smallest w a drawn corner may have: a layer reaching the viewer's plane is not drawn. */
export const MIN_W = 1e-3;

export function newHomography(): Homography {
  return [1, 0, 0, 1, 0, 0, 0, 0, 1];
}

/** The viewing distance in px of a project's or a sequence's `perspective` field: absent 1600, null none. */
export function viewingDistance(perspective: number | null | undefined): number | null {
  if (perspective === null) return null;
  return perspective !== undefined && Number.isFinite(perspective) && perspective > 0 ? perspective : DEFAULT_PERSPECTIVE;
}

/** Whether `t` leaves the flat plane (an X or Y rotation or a depth). */
export function isDepthTransform(t: Transform): boolean {
  return nonZero(t.rotationX) || nonZero(t.rotationY) || nonZero(t.z);
}

const nonZero = (value: number | undefined) => value !== undefined && value !== 0 && Number.isFinite(value);
const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * The 3D placement of the flat plane of a layer with transform `t` (world, with `t.x`, `t.y` from the
 * center of a `width` x `height` frame): `world` above, as a 4x4 matrix.
 */
export function depthMatrix(t: Transform, width: number, height: number): Mat4 {
  const px = width / 2 + t.x;
  const py = height / 2 + t.y;
  const rz = rad(t.rotation);
  // CSS signs: the editor's +z is away from the viewer, CSS's toward it, so X and Y turn the other way round.
  return multiplyAll(translate(px, py, t.z ?? 0), rotateZ(rz), rotateY(-rad(t.rotationY ?? 0)), rotateX(-rad(t.rotationX ?? 0)), rotateZ(-rz), translate(-px, -py, 0));
}

/**
 * Writes the homography of `t` into `out` (project px -> project px) for a viewer `distance` px in front of
 * the frame center (null: no perspective, a parallel projection where depth changes nothing). Returns `out`.
 */
export function writeProjection(out: Homography, t: Transform, width: number, height: number, distance: number | null): Homography {
  const world = depthMatrix(t, width, height);
  if (distance === null) {
    // Parallel: drop z.
    return setHomography(out, m(world, 0), m(world, 1), m(world, 4), m(world, 5), m(world, 12), m(world, 13), 0, 0, 1);
  }
  const clip = multiply(frameCamera(width, height, distance).viewProjection, world);
  // Clip space -> project px: x = (ndc.x + 1) W / 2, y = (1 - ndc.y) H / 2, homogeneous in w, scaled so a flat layer has w = 1.
  const hw = width / 2 / distance;
  const hh = height / 2 / distance;
  const col = (c: number) => [m(clip, c * 4), m(clip, c * 4 + 1), m(clip, c * 4 + 3)] as const;
  const [x0, y0, w0] = col(0);
  const [x1, y1, w1] = col(1);
  const [x3, y3, w3] = col(3);
  return setHomography(out, hw * (x0 + w0), hh * (w0 - y0), hw * (x1 + w1), hh * (w1 - y1), hw * (x3 + w3), hh * (w3 - y3), w0 / distance, w1 / distance, w3 / distance);
}

/** `out = H * A` (the homography after the affine `A`). `out` may be `h`. Returns `out`. */
export function homographyTimesAffine(out: Homography, h: Homography, a: Mat3): Homography {
  return setHomography(
    out,
    h[0] * a[0] + h[2] * a[1],
    h[1] * a[0] + h[3] * a[1],
    h[0] * a[2] + h[2] * a[3],
    h[1] * a[2] + h[3] * a[3],
    h[0] * a[4] + h[2] * a[5] + h[4],
    h[1] * a[4] + h[3] * a[5] + h[5],
    h[6] * a[0] + h[7] * a[1],
    h[6] * a[2] + h[7] * a[3],
    h[6] * a[4] + h[7] * a[5] + h[8],
  );
}

/** `out = A * H` (the affine `A` after the homography; the w row is unchanged). `out` may be `h`. Returns `out`. */
export function affineTimesHomography(out: Homography, a: Mat3, h: Homography): Homography {
  return setHomography(
    out,
    a[0] * h[0] + a[2] * h[1] + a[4] * h[6],
    a[1] * h[0] + a[3] * h[1] + a[5] * h[6],
    a[0] * h[2] + a[2] * h[3] + a[4] * h[7],
    a[1] * h[2] + a[3] * h[3] + a[5] * h[7],
    a[0] * h[4] + a[2] * h[5] + a[4] * h[8],
    a[1] * h[4] + a[3] * h[5] + a[5] * h[8],
    h[6],
    h[7],
    h[8],
  );
}

/** The point (x, y) through `h` (null when it lies on or behind the viewer's plane). */
export function projectPoint(h: Homography, x: number, y: number): { x: number; y: number } | null {
  const w = h[6] * x + h[7] * y + h[8];
  if (!(w > MIN_W)) return null;
  return { x: (h[0] * x + h[2] * y + h[4]) / w, y: (h[1] * x + h[3] * y + h[5]) / w };
}

/** The point of the flat plane `h` shows at (x, y) (the inverse map), or null when there is none. */
export function unprojectPoint(h: Homography, x: number, y: number): { x: number; y: number } | null {
  // Inverse of [[a c tx] [b d ty] [g h i]] by cofactors.
  const [a, b, c, d, tx, ty, g, hh, i] = h;
  const A = d * i - ty * hh;
  const B = -(c * i - tx * hh);
  const C = c * ty - tx * d;
  const D = -(b * i - ty * g);
  const E = a * i - tx * g;
  const F = -(a * ty - tx * b);
  const G = b * hh - d * g;
  const H = -(a * hh - c * g);
  const I = a * d - c * b;
  const w = G * x + H * y + I;
  if (w === 0 || !Number.isFinite(w)) return null;
  const px = (A * x + B * y + C) / w;
  const py = (D * x + E * y + F) / w;
  // The flat point must be in front of the viewer, else (x, y) shows nothing of the plane.
  return g * px + hh * py + i > MIN_W ? { x: px, y: py } : null;
}

/**
 * The four corners (0,0), (w,0), (w,h), (0,h) of a box laid out by `model` (box px -> project px) and
 * projected by `h`, written into `out` as x0, y0, ... x3, y3; false when a corner reaches the viewer's plane.
 */
export function projectedCorners(out: number[], h: Homography, model: Mat3, width: number, height: number): boolean {
  for (let k = 0; k < 4; k++) {
    const u = k === 1 || k === 2 ? width : 0;
    const v = k >= 2 ? height : 0;
    const x = model[0] * u + model[2] * v + model[4];
    const y = model[1] * u + model[3] * v + model[5];
    const p = projectPoint(h, x, y);
    if (!p) return false;
    out[2 * k] = p.x;
    out[2 * k + 1] = p.y;
  }
  return true;
}

/**
 * Whether the layer laid out by `model` (box px -> project px, `width` x `height`) shows its back once
 * projected by `h`: the projected box winds the other way round from the flat one.
 */
export function facesAway(h: Homography, model: Mat3, width: number, height: number): boolean {
  const corners = scratchCorners;
  if (!projectedCorners(corners, h, model, width, height)) return false;
  const projected = winding(corners);
  const flat = (model[0] * model[3] - model[1] * model[2]) * width * height;
  return projected !== 0 && flat !== 0 && Math.sign(projected) !== Math.sign(flat);
}

const scratchCorners: number[] = [0, 0, 0, 0, 0, 0, 0, 0];

/** Twice the signed area of the quad x0, y0 ... x3, y3. */
function winding(c: readonly number[]): number {
  let sum = 0;
  for (let k = 0; k < 4; k++) {
    const n = (k + 1) % 4;
    sum += (c[2 * k] as number) * (c[2 * n + 1] as number) - (c[2 * n] as number) * (c[2 * k + 1] as number);
  }
  return sum;
}

/** Whether (x, y) lies inside the convex quad x0, y0 ... x3, y3 (either winding). */
export function pointInQuad(c: readonly number[], x: number, y: number): boolean {
  let sign = 0;
  for (let k = 0; k < 4; k++) {
    const n = (k + 1) % 4;
    const ax = c[2 * k] as number;
    const ay = c[2 * k + 1] as number;
    const cross = ((c[2 * n] as number) - ax) * (y - ay) - ((c[2 * n + 1] as number) - ay) * (x - ax);
    if (cross === 0) continue;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

export function setHomography(out: Homography, a: number, b: number, c: number, d: number, tx: number, ty: number, g: number, h: number, i: number): Homography {
  out[0] = a;
  out[1] = b;
  out[2] = c;
  out[3] = d;
  out[4] = tx;
  out[5] = ty;
  out[6] = g;
  out[7] = h;
  out[8] = i;
  return out;
}

function m(mat: Mat4, i: number): number {
  return mat[i] as number;
}
