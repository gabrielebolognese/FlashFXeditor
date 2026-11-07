// Value ranges the document and the capability manifest share (spec §14, §21.2). Pure constants, so the
// project CLI reads them without the editing or media code that enforces them.

/** The speed range of clips (spec §14: 0.25x to 4x). */
export const MIN_SPEED = 0.25;
export const MAX_SPEED = 4;

/** The clip gain range (spec §14). */
export const MIN_GAIN_DB = -60;
export const MAX_GAIN_DB = 12;

/** Long-edge cap of animation frames (they are drawn at most this big without losing detail). */
export const ANIMATION_MAX_SIZE = 2048;
/** Texture memory one animated image may take (its frames' textures, mip levels included). */
export const ANIMATION_BUDGET_BYTES = 128 * 1024 * 1024;
