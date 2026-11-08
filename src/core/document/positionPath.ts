// Spatial motion paths (spec §21.14, Batch 69): the shape a layer travels through space, separate from
// its temporal easing. A segment between two `transform.position` keys is a cubic bezier whose inner
// control points are the keys' spatial tangents (offsets from each key's point). Segments are sampled by
// ARC LENGTH so a linear ease is a constant speed along a curve. Ported from FlashFX-v2
// `src/core/positionPath.ts`; pure, no document imports.

export type Vec2 = readonly [number, number];

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function cubicBezierVec2(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, u: number): [number, number] {
  const mt = 1 - u;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * u;
  const c = 3 * mt * u * u;
  const d = u * u * u;
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
}

const ARC_SAMPLES = 24;
const lens = new Float64Array(ARC_SAMPLES + 1);

/** The point at distance-fraction `s` (0..1) along the curve: equal steps in `s` are equal distances. */
export function pointAtArcFraction(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, s: number): [number, number] {
  let px = p0[0];
  let py = p0[1];
  let total = 0;
  lens[0] = 0;
  for (let i = 1; i <= ARC_SAMPLES; i++) {
    const pt = cubicBezierVec2(p0, p1, p2, p3, i / ARC_SAMPLES);
    total += Math.hypot(pt[0] - px, pt[1] - py);
    lens[i] = total;
    px = pt[0];
    py = pt[1];
  }
  if (total < 1e-6) return cubicBezierVec2(p0, p1, p2, p3, clamp01(s));
  const target = clamp01(s) * total;
  let i = 1;
  while (i < ARC_SAMPLES && (lens[i] as number) < target) i++;
  const l0 = lens[i - 1] as number;
  const l1 = lens[i] as number;
  const f = l1 > l0 ? (target - l0) / (l1 - l0) : 0;
  return cubicBezierVec2(p0, p1, p2, p3, (i - 1 + f) / ARC_SAMPLES);
}

/**
 * The point along one segment from `from` to `to` for the temporal progress (0..1; an overshooting
 * ease may leave it, the line continues straight). No tangents: a straight line.
 */
export function positionOnSegment(from: Vec2, to: Vec2, spatialOut: Vec2 | undefined, spatialIn: Vec2 | undefined, progress: number): [number, number] {
  if (!spatialOut && !spatialIn) return [from[0] + (to[0] - from[0]) * progress, from[1] + (to[1] - from[1]) * progress];
  const p1: Vec2 = spatialOut ? [from[0] + spatialOut[0], from[1] + spatialOut[1]] : from;
  const p2: Vec2 = spatialIn ? [to[0] + spatialIn[0], to[1] + spatialIn[1]] : to;
  return pointAtArcFraction(from, p1, p2, to, progress);
}

/** The direction of travel on a segment at `progress`, in degrees clockwise from +x (y points down), or null for a zero-length segment. */
export function segmentAngle(from: Vec2, to: Vec2, spatialOut: Vec2 | undefined, spatialIn: Vec2 | undefined, progress: number): number | null {
  const eps = 0.01;
  const a = positionOnSegment(from, to, spatialOut, spatialIn, clamp01(progress - eps));
  const b = positionOnSegment(from, to, spatialOut, spatialIn, clamp01(progress + eps));
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return null;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

/** Total arc length of one segment. */
export function segmentArcLength(from: Vec2, to: Vec2, spatialOut?: Vec2, spatialIn?: Vec2): number {
  if (!spatialOut && !spatialIn) return Math.hypot(to[0] - from[0], to[1] - from[1]);
  const p1: Vec2 = spatialOut ? [from[0] + spatialOut[0], from[1] + spatialOut[1]] : from;
  const p2: Vec2 = spatialIn ? [to[0] + spatialIn[0], to[1] + spatialIn[1]] : to;
  let prev: Vec2 = from;
  let total = 0;
  for (let i = 1; i <= ARC_SAMPLES; i++) {
    const pt = cubicBezierVec2(from, p1, p2, to, i / ARC_SAMPLES);
    total += Math.hypot(pt[0] - prev[0], pt[1] - prev[1]);
    prev = pt;
  }
  return total;
}

/**
 * Smooth ("auto bezier") tangents for the middle key of prev, cur, next, as offsets from `cur`: the
 * direction follows next - prev, each side about a third of the distance to its neighbor. A missing
 * neighbor gives a zero tangent on that side.
 */
export function autoSpatialTangents(prev: Vec2 | null, cur: Vec2, next: Vec2 | null): { in: [number, number]; out: [number, number] } {
  const a = prev ?? cur;
  const b = next ?? cur;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dl = Math.hypot(dx, dy) || 1;
  const nx = dx / dl;
  const ny = dy / dl;
  const outLen = next ? Math.hypot(next[0] - cur[0], next[1] - cur[1]) / 3 : 0;
  const inLen = prev ? Math.hypot(cur[0] - prev[0], cur[1] - prev[1]) / 3 : 0;
  const z = (n: number) => n || 0;
  return { out: [z(nx * outLen), z(ny * outLen)], in: [z(-nx * inLen), z(-ny * inLen)] };
}
