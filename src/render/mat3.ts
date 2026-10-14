// 3x3 affine matrices in pixel space (spec §9.4 implementation notes). The last row is always 0 0 1, so
// only the first two rows are stored, column-major like WGSL's mat3x3: [a, b, c, d, tx, ty] maps
// (x, y) to (a*x + c*y + tx, b*x + d*y + ty).

export type Mat3 = readonly [a: number, b: number, c: number, d: number, tx: number, ty: number];

export const IDENTITY: Mat3 = [1, 0, 0, 1, 0, 0];

/** `a * b`: applies `b` first, then `a`. */
export function multiply(a: Mat3, b: Mat3): Mat3 {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

export function translation(tx: number, ty: number): Mat3 {
  return [1, 0, 0, 1, tx, ty];
}

export function scaling(sx: number, sy: number = sx): Mat3 {
  return [sx, 0, 0, sy, 0, 0];
}

/** Maps the unit square (0..1, 0..1) onto the rectangle at (x, y) of size w x h. */
export function rectTransform(x: number, y: number, w: number, h: number): Mat3 {
  return [w, 0, 0, h, x, y];
}

export function applyToPoint(m: Mat3, x: number, y: number): { x: number; y: number } {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

/** The inverse matrix, or null when `m` is singular (zero scale). */
export function invert(m: Mat3): Mat3 | null {
  const det = m[0] * m[3] - m[1] * m[2];
  if (det === 0 || !Number.isFinite(det)) return null;
  const a = m[3] / det;
  const b = -m[1] / det;
  const c = -m[2] / det;
  const d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}
