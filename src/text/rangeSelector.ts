// The range selector of a text animator (spec §21.13, Batch 68): the weight 0..1 each unit of a text gets,
// with After Effects semantics. Pure and deterministic (a seeded RNG for the random order), so a frame
// evaluates the same however it is reached.
// Ported from FlashFX-v2 `src/text/rangeSelector.ts` (commit a91c675), narrowed to the editor's selector:
// one `ease` number (positive eases the high end, negative the low end), an `order` instead of a
// randomize flag, and weights written into a caller's array (no allocation per frame).
import type { AnimatorSelector, SelectorShape } from "../core/document/types.js";

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** mulberry32: the same generator as the other seeded code of the editor. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The base ramp of the window at `t` (0 at its start edge, 1 at its end edge). */
function shapeAt(shape: SelectorShape, t: number): number {
  const u = clamp01(t);
  switch (shape) {
    case "square":
      return t > 0 ? 1 : 0;
    case "rampUp":
      return u;
    case "rampDown":
      return 1 - u;
    case "triangle":
      return 1 - Math.abs(2 * u - 1);
    case "round":
      return Math.sqrt(1 - (1 - u) * (1 - u));
    case "smooth":
      return u * u * (3 - 2 * u);
  }
}

/** The ease as an endpoint-preserving gamma: positive eases the high end, negative the low end. */
function applyEase(v: number, ease: number): number {
  const x = clamp01(v);
  if (ease === 0) return x;
  const e = Math.max(-1, Math.min(1, ease));
  return e > 0 ? 1 - Math.pow(1 - x, Math.pow(3, e)) : Math.pow(x, Math.pow(3, -e));
}

/** The weight of a unit at position `p` (0..1) in the window. */
export function weightAt(p: number, selector: Pick<AnimatorSelector, "start" | "end" | "offset" | "shape" | "ease">): number {
  const winStart = selector.start + selector.offset;
  const winEnd = selector.end + selector.offset;
  const span = winEnd - winStart;
  let t: number;
  if (span === 0) t = p < winStart ? 0 : 1;
  else if (span > 0) t = p <= winStart ? 0 : p >= winEnd ? 1 : (p - winStart) / span;
  else t = p >= winStart ? 0 : p <= winEnd ? 1 : (winStart - p) / -span;
  return applyEase(shapeAt(selector.shape, t), selector.ease);
}

const permutations = new Map<string, readonly number[]>();

/** A seeded shuffle of 0..count-1 (cached: the same for a count and a seed, however often it is asked). */
export function shuffled(count: number, seed: number): readonly number[] {
  const key = `${count}|${seed >>> 0}`;
  let order = permutations.get(key);
  if (!order) {
    const made = Array.from({ length: count }, (_, i) => i);
    const rng = mulberry32(seed >>> 0);
    for (let i = count - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = made[i] as number;
      made[i] = made[j] as number;
      made[j] = tmp;
    }
    if (permutations.size > 256) permutations.clear();
    permutations.set(key, (order = made));
  }
  return order;
}

/** Where unit `index` of `count` sits in the window (0..1), by the selector's order. */
export function unitPosition(index: number, count: number, selector: Pick<AnimatorSelector, "order" | "seed">): number {
  if (count <= 1) return 0;
  const place = selector.order === "random" ? ((shuffled(count, selector.seed)[index] as number) ?? index) : selector.order === "reverse" ? count - 1 - index : index;
  return place / (count - 1);
}

/** The amount (0..1) of each of `count` units into `out` (length set to `count`). */
export function selectorWeights(count: number, selector: AnimatorSelector, out: number[] = []): number[] {
  out.length = Math.max(0, count);
  for (let i = 0; i < count; i++) out[i] = weightAt(unitPosition(i, count, selector), selector);
  return out;
}
