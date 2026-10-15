// The design system's easings (`--ease-out: cubic-bezier(0.2, 0, 0, 1)`) for motion drawn on canvases,
// where CSS transitions do not apply (the timeline's keyboard zoom, spec §6.2).

/** Control points x1, y1, x2, y2 of a CSS `cubic-bezier()`. */
export type CubicBezier = readonly [number, number, number, number];

export const LINEAR: CubicBezier = [0, 0, 1, 1];

/** Parses `cubic-bezier(x1, y1, x2, y2)`; anything else (a missing token) reads as linear. */
export function parseCubicBezier(text: string): CubicBezier {
  const match = /^cubic-bezier\(([^)]*)\)$/.exec(text.trim());
  const values = match?.[1]?.split(",").map((value) => Number(value.trim())) ?? [];
  if (values.length !== 4 || !values.every(Number.isFinite)) return LINEAR;
  const [x1, y1, x2, y2] = values as [number, number, number, number];
  return x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1 ? LINEAR : [x1, y1, x2, y2];
}

/** One coordinate of the curve with end points 0 and 1 and inner control points a, b, at parameter s. */
const bezier = (a: number, b: number, s: number) => 3 * a * (1 - s) ** 2 * s + 3 * b * (1 - s) * s ** 2 + s ** 3;

/**
 * The eased progress at time fraction `t` (0..1), as CSS computes it: solve x(s) = t (x is monotonic
 * for x1, x2 in [0, 1]), return y(s).
 */
export function ease(curve: CubicBezier, t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const [x1, y1, x2, y2] = curve;
  let lo = 0;
  let hi = 1;
  let s = t;
  for (let i = 0; i < 30; i++) {
    const x = bezier(x1, x2, s);
    if (Math.abs(x - t) < 1e-7) break;
    if (x < t) lo = s;
    else hi = s;
    s = (lo + hi) / 2;
  }
  return bezier(y1, y2, s);
}
