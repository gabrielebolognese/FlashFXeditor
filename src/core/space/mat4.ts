// Ported from FlashFX-v2 src/core/mat4.ts @ a91c675, adapted.
// Pure column-major 4x4 matrix and vec3 math for the 2.5D layers (spec §21.15, Batch 70). No dependencies,
// no side effects. Convention: column-major (element [col * 4 + row]); points are column vectors, so
// v' = M * v and a composite is P * V * M (projection outermost). Right-handed with y down and +z away
// from the viewer (the editor's raster space).

export type Mat4 = number[];
export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type Vec4 = [number, number, number, number];

export function identity(): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/** a * b (column-major matrix product). */
export function multiply(a: Mat4, b: Mat4): Mat4 {
  const o = new Array<number>(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = at(a, r) * at(b, c * 4) + at(a, 4 + r) * at(b, c * 4 + 1) + at(a, 8 + r) * at(b, c * 4 + 2) + at(a, 12 + r) * at(b, c * 4 + 3);
    }
  }
  return o;
}

export function multiplyAll(...ms: Mat4[]): Mat4 {
  return ms.reduce((acc, m) => multiply(acc, m), identity());
}

export function translate(x: number, y: number, z: number): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
}

export function scale(x: number, y: number, z: number): Mat4 {
  return [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1];
}

/** Radians. */
export function rotateX(a: number): Mat4 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
}

export function rotateY(a: number): Mat4 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
}

export function rotateZ(a: number): Mat4 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/** m * [x, y, z, 1] -> [x', y', z', w'] (before the perspective divide). */
export function transformPoint(m: Mat4, x: number, y: number, z: number): Vec4 {
  return [
    at(m, 0) * x + at(m, 4) * y + at(m, 8) * z + at(m, 12),
    at(m, 1) * x + at(m, 5) * y + at(m, 9) * z + at(m, 13),
    at(m, 2) * x + at(m, 6) * y + at(m, 10) * z + at(m, 14),
    at(m, 3) * x + at(m, 7) * y + at(m, 11) * z + at(m, 15),
  ];
}

export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** Right-handed lookAt (the camera looks down its -z toward `target`). Column-major view matrix. */
export function lookAt(eye: Vec3, target: Vec3, up: Vec3): Mat4 {
  const z = normalize(sub(eye, target));
  const x = normalize(cross(up, z));
  const y = cross(z, x);
  return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1];
}

/** Perspective projection, WebGPU depth convention (clip z in 0..1). `fovY` in radians. */
export function perspective(fovY: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, far * nf, -1, 0, 0, far * near * nf, 0];
}

/** A layer's local model matrix T(pos) * Rz * Ry * Rx * S * T(-anchor); radians, applied X, then Y, then Z. */
export function composeModel(pos: Vec3, rot: Vec3, scl: Vec3, anchor: Vec3): Mat4 {
  return multiplyAll(translate(pos[0], pos[1], pos[2]), rotateZ(rot[2]), rotateY(rot[1]), rotateX(rot[0]), scale(scl[0], scl[1], scl[2]), translate(-anchor[0], -anchor[1], -anchor[2]));
}

function at(m: Mat4, i: number): number {
  return m[i] as number;
}
