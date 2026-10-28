// Where a new layer starts (spec §6.19): the identity transform and the Fit placement of a media item. Pure,
// shared by the editing commands and by `normalize` (Batch 55), which fills a sparse clip with what the app
// would have created.
import { displaySize } from "../../media/probe/rotation.js";
import type { MediaItem, Transform } from "./types.js";

/** No move, scale 1, anchored at the layer's center (`anchor` is a fraction of the layer's size from its top-left corner). */
export const IDENTITY_TRANSFORM: Transform = { x: 0, y: 0, scale: 1, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false };

/**
 * The transform of a newly placed clip (spec §6.19): Fit, the media contained in the frame (letterboxed
 * when the aspects differ, filling it exactly when they match), centered, anchored at the media center.
 * Rotation metadata swaps width and height first. Media without a size (audio) keep scale 1.
 */
export function defaultTransform(media: Pick<MediaItem, "width" | "height" | "rotation">, frame: { width: number; height: number }): Transform {
  const shown = media.width && media.height ? displaySize(media.width, media.height, media.rotation) : null;
  const scale = shown ? Math.min(frame.width / shown.width, frame.height / shown.height) : 1;
  return { x: 0, y: 0, scale, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false };
}
