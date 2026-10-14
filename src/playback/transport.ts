// Transport rules of the playback engine (spec §8), as pure functions.

/** The J/L ladder: pressing the same key again doubles the speed up to 8x. */
export const SHUTTLE_SPEEDS: readonly number[] = [1, 2, 4, 8];

/**
 * The signed speed after a J (-1) or L (+1) press at `current` (0 = paused). Paused, or playing the
 * other way, starts at 1x in the pressed direction; the same direction climbs 1x, 2x, 4x, 8x and
 * stays at 8x.
 */
export function shuttleSpeed(current: number, direction: 1 | -1): number {
  if (current === 0 || Math.sign(current) !== direction) return direction;
  const magnitude = Math.abs(current);
  const next = SHUTTLE_SPEEDS.find((speed) => speed > magnitude) ?? (SHUTTLE_SPEEDS[SHUTTLE_SPEEDS.length - 1] as number);
  return direction * next;
}
