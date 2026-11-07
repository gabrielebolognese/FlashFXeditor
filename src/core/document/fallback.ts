// Baked stand-ins (spec §21.4, Batch 54): how a clip's `fallbackOf.headTrim` follows the edits that move
// the clip's first frame within what it stands for (the right half of a split, a head trim, a slip).
import type { Clip, Frame } from "./types.js";

/**
 * Moves the first frame of `next` (a private copy of a clip) `delta` frames later (earlier when
 * negative) within the clip it stands for: `fallbackOf.headTrim` follows, never below 0. A clip that
 * is not a stand-in is left as it is.
 */
export function shiftHeadTrim(next: Clip, delta: Frame): void {
  const block = next.fallbackOf;
  if (!block || delta === 0) return;
  const headTrim = Math.max(0, (block.headTrim ?? 0) + delta);
  next.fallbackOf = headTrim === 0 ? withoutHeadTrim(block) : { ...block, headTrim };
}

function withoutHeadTrim(block: NonNullable<Clip["fallbackOf"]>): NonNullable<Clip["fallbackOf"]> {
  const rest = { ...block };
  delete rest.headTrim;
  return rest;
}
