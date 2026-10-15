// Detail on zoom and the quality modes (spec §7.1 BINDING, §7.5, §8). Every preview render picks a
// render scale `r` (device px per project px of the composite):
// - The full scale: at the view scale up to 100% ("At Fit and below, it renders at the panel's device
//   size"); above it, `min(zoom, source detail)`, where the source detail is how many source pixels the
//   most detailed visible media layer has per project px (rendering finer shows nothing more).
// - Quality modes: `full` always renders at the full scale. `auto` renders reduced while playing or
//   scrubbing and for 300 ms after (§8), else full. `proxy` always renders reduced. `half` and `quarter`
//   render at 1/2 and 1/4 of the reduced scale while playing, else as `auto`.
//   Reduced = the full scale capped at the project size: no detail beyond the project's pixels, the
//   render playback has always had. TODO(batch 24): reduced means proxy frames for media that have one.
// - Video frames are uploaded at most at `projectLongEdge * max(1, r)` (at most 4096 px and the
//   device limit): detail needs bigger frames, a reduced render does not; 1/2 and 1/4 playback uploads
//   at the reduced size itself.
// TODO(batch 28): text layers have no source limit (re-rasterized at `r`), so a visible text layer
// raises the source detail to the zoom.
import type { PreviewQuality } from "../../core/store/sessionStore.js";
import type { Composite } from "../compositor/drawList.js";

/** Long-edge cap of detail renders and frame uploads (§7.1). */
export const DETAIL_MAX_SIZE = 4096;

/** Auto quality goes back to full this long after playback or a scrub (§8). */
export const AUTO_SETTLE_MS = 300;

/** What the preview is doing: playing, scrubbing (or a trim), within the settle time after either, or at rest. */
export type PreviewActivity = "playing" | "scrubbing" | "settling" | "idle";

export interface DetailScales {
  /** The scale a full-quality render would use. */
  full: number;
  /** The scale this render uses (at most `full`). */
  render: number;
}

/**
 * Source pixels per project px of the most detailed media layer (at least 1); `size(mediaId)` gives a
 * media's pixel size. Rotation and crop count: the layer's crop area in source px over its area on
 * the frame.
 */
export function sourceDetail(composite: Composite, size: (mediaId: string) => { width: number; height: number } | null): number {
  let detail = 1;
  for (const layer of composite.layers) {
    if (layer.kind !== "media") continue;
    const media = size(layer.mediaId);
    if (!media || media.width <= 0 || media.height <= 0) continue;
    const t = layer.transform;
    const area = Math.abs(t[0] * t[3] - t[1] * t[2]);
    if (!(area > 0)) continue;
    const crop = Math.abs((layer.crop.u1 - layer.crop.u0) * (layer.crop.v1 - layer.crop.v0));
    const ratio = Math.sqrt((media.width * media.height * crop) / area);
    if (ratio > detail) detail = ratio;
  }
  return detail;
}

/** The full-quality render scale at view scale `zoom` (device px per project px). */
export function fullScale(zoom: number, detail: number): number {
  return zoom <= 1 ? zoom : Math.min(zoom, Math.max(1, detail));
}

/** The render scale of `mode` while the preview is `activity`. */
export function renderScale(mode: PreviewQuality, activity: PreviewActivity, full: number): number {
  const reduced = Math.min(full, 1);
  switch (mode) {
    case "full":
      return full;
    case "proxy":
      return reduced;
    case "half":
    case "quarter":
      if (activity === "playing") return reduced * (mode === "half" ? 0.5 : 0.25);
      return activity === "idle" ? full : reduced;
    case "auto":
      return activity === "idle" ? full : reduced;
  }
}

/** Long edge video frames are uploaded at for a render at scale `render` (§7.1 caps, the device limit). */
export function uploadLongEdge(projectLongEdge: number, mode: PreviewQuality, activity: PreviewActivity, render: number, maxTextureSize: number): number {
  const fraction = activity === "playing" && (mode === "half" || mode === "quarter");
  const factor = fraction ? render : Math.max(1, render);
  return Math.max(1, Math.min(DETAIL_MAX_SIZE, maxTextureSize, Math.ceil(projectLongEdge * factor)));
}

const MODE_LABELS: Record<PreviewQuality, string> = { auto: "Auto", full: "Full", proxy: "Proxy", half: "1/2", quarter: "1/4" };

/** The quality menu's name of a mode. */
export const qualityName = (mode: PreviewQuality): string => MODE_LABELS[mode];

/**
 * The status strip's quality text (§13 `Auto: proxy` / `Auto: full`): the mode, then what this render
 * is: `full`, `reduced` (below the full scale; `half` / `quarter` for those playback renders).
 */
export function qualityLabel(mode: PreviewQuality, scales: DetailScales): string {
  if (mode === "full") return "Full";
  const name = MODE_LABELS[mode];
  if (scales.render >= scales.full - 1e-6) return `${name}: full`;
  if (mode === "half" || mode === "quarter") {
    const reduced = Math.min(scales.full, 1);
    if (scales.render < reduced - 1e-6) return `${name}: ${mode}`;
  }
  return `${name}: reduced`;
}
