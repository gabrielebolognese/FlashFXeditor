// Canvas backing stores with headroom (spec §2.1, Batch 46). Reallocating a canvas costs 8-11 ms in
// Chrome (a new GPU surface, measured on the timeline's size), so a splitter drag that reallocated the
// timeline and preview canvases on every frame dropped frames. A canvas keeps a capacity that grows in
// steps a step ahead of what it shows and shrinks only when it is three steps too large: a drag across
// most of the window reallocates a few times instead of every frame. The canvas element is as large as
// its capacity, drawn from its top-left; its host clips the unused edge.

/** The capacity step in CSS px. */
export const CANVAS_STEP = 128;

/**
 * The capacity (CSS px) a canvas that has `current` should have to show `needed`: unchanged while it
 * fits with less than three steps to spare, else `needed` rounded up to a step plus one step.
 */
export function canvasCapacity(current: number, needed: number, step = CANVAS_STEP): number {
  if (needed <= 0) return 0;
  if (current >= needed && current - needed < 3 * step) return current;
  return Math.ceil(needed / step) * step + step;
}
