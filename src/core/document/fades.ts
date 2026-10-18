// The pair rule of a clip's fades (spec §6.15, Batch 36: "a clip's two fades never overlap"): the fade
// in and the fade out together fit the clip, in + out <= duration. The fade handles keep it as they are
// dragged (timeline/edit/fades.ts `maxFade`); edits that change a duration (trims, speed changes, frame
// rate conversions) fit both fades with `fitFades` (Batch 50; before, each was clamped on its own). The
// validator still checks each fade alone, so documents saved before stay valid.
import type { Frame } from "./types.js";

/**
 * `fades` within `duration`: when the two together are longer than it (or one alone is),
 * both shortened in proportion to fill it (the fade in rounded to the nearest frame, the fade out the rest).
 */
export function fitFades(fades: { in: Frame; out: Frame }, duration: Frame): { in: Frame; out: Frame } {
  const length = Math.max(0, duration);
  const total = fades.in + fades.out;
  if (total <= length) return { in: fades.in, out: fades.out };
  const scaledIn = Math.round((fades.in * length) / total);
  return { in: scaledIn, out: length - scaledIn };
}
