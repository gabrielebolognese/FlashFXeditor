// Auto-scroll while dragging (spec §6.6): within `zone` CSS px of an edge of the track area, or past
// it, the view scrolls toward that edge with a speed proportional to how deep the pointer goes.

/** Scroll speed at the edge itself, in zones per 60 Hz frame (24 px zone: 12 px per frame, 720 px/s). */
const SPEED_AT_EDGE = 0.5;
/** Past the edge the speed keeps growing, up to this multiple of the speed at the edge. */
const MAX_DEPTH = 3;

/**
 * The scroll step in CSS px for one 60 Hz frame, for a pointer at `pos` on an axis whose visible range
 * is [min, max]: negative toward `min`, positive toward `max`, 0 outside the edge bands.
 */
export function edgeStep(pos: number, min: number, max: number, zone: number): number {
  if (zone <= 0 || max <= min) return 0;
  const step = (depth: number) => Math.min(depth, MAX_DEPTH) * SPEED_AT_EDGE * zone;
  const before = min + zone - pos;
  const after = pos - (max - zone);
  // In a view narrower than two bands, the nearer edge wins.
  if (before > 0 && (after <= 0 || pos - min < max - pos)) return -step(before / zone);
  if (after > 0) return step(after / zone);
  return 0;
}
