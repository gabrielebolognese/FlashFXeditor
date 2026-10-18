// Frame rate estimation (spec §9.1): the dominant presentation-time delta of the first samples,
// reported as an exact rational. Variable-frame-rate phones jitter around one delta and drop frames
// (double deltas); the mode ignores both. The deltas near the mode are averaged (a timescale of 600
// cannot express 29.97 exactly and alternates 20 and 21 ticks) and the result snaps to the nearest
// standard rate within 0.03% (29.97 and 30 are 0.1% apart). Deltas that jitter by a tick are rounded
// times, so the rate is only known to half a tick: WebM's millisecond times give 30 fps as 33 and 34
// ms (Batch 49), and such rates snap within that error, to a standard rate or a whole one (15 fps).
import type { Rational } from "../../core/document/types.js";

/** How many samples the estimate looks at. */
export const FPS_SAMPLE_COUNT = 120;

const STANDARD_RATES: readonly Rational[] = [
  { num: 24000, den: 1001 },
  { num: 24, den: 1 },
  { num: 25, den: 1 },
  { num: 30000, den: 1001 },
  { num: 30, den: 1 },
  { num: 48, den: 1 },
  { num: 50, den: 1 },
  { num: 60000, den: 1001 },
  { num: 60, den: 1 },
  { num: 90, den: 1 },
  { num: 100, den: 1 },
  { num: 120000, den: 1001 },
  { num: 120, den: 1 },
  { num: 240, den: 1 },
];

const SNAP_TOLERANCE = 0.0003;
/** Deltas within this fraction of the mode (or one tick) belong to its cluster. */
const CLUSTER_TOLERANCE = 0.005;

function gcd(a: number, b: number): number {
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

/** `num/den` in lowest terms. */
export function reduceRational(num: number, den: number): Rational {
  const divisor = gcd(num, den) || 1;
  return { num: num / divisor, den: den / divisor };
}

/** The nearest standard rate within `tolerance` (relative, default 0.03%) of `fps`, if any. */
export function snapToStandardRate(fps: number, tolerance = SNAP_TOLERANCE): Rational | null {
  let best: Rational | null = null;
  let bestError = tolerance;
  for (const rate of STANDARD_RATES) {
    const value = rate.num / rate.den;
    const error = Math.abs(fps - value) / value;
    if (error <= bestError) [best, bestError] = [rate, error];
  }
  return best;
}

/**
 * Estimates the frame rate from the presentation times (`cts`, in `timescale` ticks per second) of
 * the first samples, in decode order. Null when there are fewer than two distinct times.
 */
export function estimateFps(cts: readonly number[], timescale: number): Rational | null {
  if (!(timescale > 0)) return null;
  const sorted = cts.slice(0, FPS_SAMPLE_COUNT).sort((a, b) => a - b);
  const counts = new Map<number, number>();
  for (let i = 1; i < sorted.length; i++) {
    const delta = (sorted[i] ?? 0) - (sorted[i - 1] ?? 0);
    if (delta > 0) counts.set(delta, (counts.get(delta) ?? 0) + 1);
  }
  let mode = 0;
  let modeCount = 0;
  for (const [delta, count] of counts) {
    if (count > modeCount || (count === modeCount && delta < mode)) [mode, modeCount] = [delta, count];
  }
  if (mode === 0) return null;

  // Average the cluster around the mode: a 20/21-tick alternation averages to 20.02.
  const reach = Math.max(1, mode * CLUSTER_TOLERANCE);
  let sum = 0;
  let n = 0;
  let distinct = 0;
  for (const [delta, count] of counts) {
    if (Math.abs(delta - mode) <= reach) {
      sum += delta * count;
      n += count;
      distinct += 1;
    }
  }
  const mean = sum / n;
  const fps = timescale / mean;
  const tolerance = distinct > 1 ? Math.max(SNAP_TOLERANCE, 0.5 / mean) : SNAP_TOLERANCE;
  return snapToStandardRate(fps, tolerance) ?? wholeRate(fps, tolerance) ?? reduceRational(timescale, mode);
}

/** `fps` as a whole rate when it is within `tolerance` of one. */
function wholeRate(fps: number, tolerance: number): Rational | null {
  const whole = Math.round(fps);
  return whole >= 1 && Math.abs(fps - whole) / whole <= tolerance ? { num: whole, den: 1 } : null;
}
