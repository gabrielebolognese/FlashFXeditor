// Masks (spec §21.18, Batch 73), the part both backends share: each masked clip's coverage is drawn into
// its own single-channel texture over its content box (one texel per content px, the long side capped)
// by a pass that reads the clip's packed mask block (core/masks/maskCoverage.ts) from a float data
// texture. The coverage is kept while the block's version stays the same (static masks are drawn once);
// the group composite multiplies the clip's picture by it.
import { MASK_DATA_WIDTH } from "../../core/masks/maskCoverage.js";
import type { MaskFrame } from "../compositor/drawList.js";

/** The longest side of a coverage texture (texels). */
export const MASK_COVERAGE_MAX = 2048;
/** Texels of the data texture before the block: [content px per texel x, y, 0, 0]. */
export const MASK_DATA_LEAD = 1;

/** The coverage texture size of a `width` x `height` content box (one texel per px, the long side at most MASK_COVERAGE_MAX). */
export function coverageSize(width: number, height: number): { width: number; height: number } {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const s = Math.min(1, MASK_COVERAGE_MAX / Math.max(w, h));
  return { width: Math.max(1, Math.min(MASK_COVERAGE_MAX, Math.ceil(w * s))), height: Math.max(1, Math.min(MASK_COVERAGE_MAX, Math.ceil(h * s))) };
}

/** Rows of the data texture the block of `mask` needs. */
export function maskDataRows(mask: MaskFrame): number {
  return Math.max(1, Math.ceil((MASK_DATA_LEAD + mask.length / 4) / MASK_DATA_WIDTH));
}

/**
 * Writes the data texture's contents for `mask` drawn at `texWidth` x `texHeight` into `out` (at least
 * `maskDataRows` rows of MASK_DATA_WIDTH texels): the lead texel, then the block. Returns the floats written.
 */
export function writeMaskData(out: Float32Array, mask: MaskFrame, texWidth: number, texHeight: number): number {
  out[0] = mask.width / texWidth;
  out[1] = mask.height / texHeight;
  out[2] = 0;
  out[3] = 0;
  out.set(mask.data.subarray(0, mask.length), MASK_DATA_LEAD * 4);
  return MASK_DATA_LEAD * 4 + mask.length;
}

/** What a backend keeps per coverage texture. */
export interface CoverageEntry {
  clipId: string;
  /** The block version drawn into it (0: none yet). */
  version: number;
  width: number;
  height: number;
  /** The draw that last used it. */
  used: number;
}

/**
 * The entry for `mask` in this draw (`draw`): one holding its version already (`draw: false`, nothing to
 * do), else the clip's entry not yet used in this draw (`draw: true`: its coverage must be drawn; its size
 * may differ), else null (make one). Two panes showing the same clip at different versions get two entries.
 */
export function pickCoverage<E extends CoverageEntry>(pool: readonly E[], mask: MaskFrame, draw: number): { entry: E; draw: boolean } | null {
  const size = coverageSize(mask.width, mask.height);
  for (const entry of pool) {
    if (entry.version === mask.version && entry.width === size.width && entry.height === size.height) {
      entry.used = draw;
      return { entry, draw: false };
    }
  }
  for (const entry of pool) {
    if (entry.clipId === mask.clipId && entry.used !== draw) {
      entry.used = draw;
      return { entry, draw: true };
    }
  }
  return null;
}

/** Removes (and destroys) the entries unused for more than `keep` draws. */
export function evictCoverage<E extends CoverageEntry>(pool: E[], draw: number, keep: number, destroy: (entry: E) => void): void {
  for (let i = pool.length - 1; i >= 0; i--) {
    const entry = pool[i] as E;
    if (draw - entry.used <= keep) continue;
    destroy(entry);
    pool.splice(i, 1);
  }
}
