// Display rotation from an mp4 `tkhd` matrix (spec §9.1). The matrix is { a b u, c d v, x y w } in
// 16.16 fixed point; a pure rotation by θ (clockwise on screen) is a = cos θ, b = sin θ. iPhone
// portrait video stores (0, 1, -1, 0): coded landscape, shown rotated 90° clockwise.

export type Rotation = 0 | 90 | 180 | 270;

/** The rotation snapped to the nearest quarter turn; 0 for a missing or degenerate matrix. */
export function rotationFromMatrix(matrix: ArrayLike<number> | undefined): Rotation {
  if (!matrix || matrix.length < 5) return 0;
  const a = matrix[0] ?? 0;
  const b = matrix[1] ?? 0;
  if (a === 0 && b === 0) return 0;
  const degrees = (Math.atan2(b, a) * 180) / Math.PI;
  const quarter = (((Math.round(degrees / 90) % 4) + 4) % 4) as 0 | 1 | 2 | 3;
  return ([0, 90, 180, 270] as const)[quarter];
}

/** Width and height as shown, after the rotation. */
export function displaySize(width: number, height: number, rotation: Rotation | undefined): { width: number; height: number } {
  return rotation === 90 || rotation === 270 ? { width: height, height: width } : { width, height };
}
