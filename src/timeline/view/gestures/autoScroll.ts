// Auto-scroll while dragging (spec §6.6): within `zone` CSS px of an edge of the track area, or past
// it, the view scrolls toward that edge with a speed that grows with how deep the pointer goes.
//
// The acceleration curve (Batch 46): inside the band the speed eases in (depth squared), so grazing the
// band barely moves the view and a drag that ends near an edge does not jump; past the edge it keeps
// growing linearly, continuous with the band's slope, up to a cap. Holding at an edge ramps the speed
// up further (up to `HOLD_BOOST` over `HOLD_RAMP_MS`), so a long timeline is crossed without dragging
// past the window.

/** Scroll speed at the edge itself, in zones per 60 Hz frame (24 px zone: 12 px per frame, 720 px/s). */
const SPEED_AT_EDGE = 0.5;
/** Past the edge the speed keeps growing, up to this multiple of the speed at the edge. */
const MAX_DEPTH = 3;
/** Holding at an edge multiplies the speed up to this much... */
export const HOLD_BOOST = 2;
/** ...reached after this long (ms) of continuous auto-scroll. */
export const HOLD_RAMP_MS = 1000;

/** The speed multiple for a depth in zones: 0 at the band's inner edge, 1 at the edge, `MAX_DEPTH` at most. */
export function depthCurve(depth: number): number {
  if (depth <= 0) return 0;
  if (depth <= 1) return depth * depth;
  return Math.min(1 + 2 * (depth - 1), MAX_DEPTH);
}

/** The speed multiple after `heldMs` of continuous auto-scroll (eased in: no step when it starts). */
export function holdBoost(heldMs: number): number {
  const t = Math.min(Math.max(heldMs / HOLD_RAMP_MS, 0), 1);
  return 1 + (HOLD_BOOST - 1) * t * t;
}

/**
 * The scroll step in CSS px for one 60 Hz frame, for a pointer at `pos` on an axis whose visible range
 * is [min, max]: negative toward `min`, positive toward `max`, 0 outside the edge bands.
 */
export function edgeStep(pos: number, min: number, max: number, zone: number): number {
  if (zone <= 0 || max <= min) return 0;
  const step = (depth: number) => depthCurve(depth) * SPEED_AT_EDGE * zone;
  const before = min + zone - pos;
  const after = pos - (max - zone);
  // In a view narrower than two bands, the nearer edge wins.
  if (before > 0 && (after <= 0 || pos - min < max - pos)) return -step(before / zone);
  if (after > 0) return step(after / zone);
  return 0;
}
