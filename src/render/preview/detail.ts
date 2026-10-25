// Detail on zoom and the quality modes (spec §7.1 BINDING, §7.5, §8). Every preview render picks a
// render scale `r` (device px per project px of the composite):
// - The full scale: at the view scale up to 100% ("At Fit and below, it renders at the panel's device
//   size"); above it, `min(zoom, source detail)`, where the source detail is how many source pixels the
//   most detailed visible media layer has per project px (rendering finer shows nothing more).
// - Quality modes: `full` always renders at the full scale. `auto` renders reduced while playing or
//   scrubbing and for 300 ms after (§8), else full. `proxy` always renders reduced. `half` and `quarter`
//   render at 1/2 and 1/4 of the reduced scale while playing, else as `auto`.
//   Reduced = the full scale capped at the project size: no detail beyond the project's pixels, the
//   render playback has always had.
// - Frames (spec §9.5, `wantedLod`): Auto plays and scrubs on proxies and asks for full frames as soon
//   as playback or a scrub ends (a scrub held still for AUTO_SETTLE_MS counts as ended); the proxy
//   frame stays on screen until the full one is decoded. Proxy always uses proxies, Full never; 1/2
//   and 1/4 decode the full file and switch a media whose playback falls behind to its proxy. Only
//   media with a ready proxy get one (`FrameService.lodFor`).
// - Video frames are uploaded at most at `projectLongEdge * max(1, r)` (at most 4096 px and the
//   device limit): detail needs bigger frames, a reduced render does not; 1/2 and 1/4 playback uploads
//   at the reduced size itself.
// TODO(batch 28): text layers have no source limit (re-rasterized at `r`), so a visible text layer
// raises the source detail to the zoom.
import type { PreviewQuality } from "../../core/store/sessionStore.js";
import type { Lod } from "../../media/cache/TexturePool.js";
import type { Composite, MediaLayer } from "../compositor/drawList.js";

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
    if (!media) continue;
    const ratio = layerDetail(layer, media.width, media.height);
    if (ratio > detail) detail = ratio;
  }
  return detail;
}

/** Source px per project px of one media layer whose source is `width` x `height` (0 when it covers nothing). */
export function layerDetail(layer: Pick<MediaLayer, "transform" | "crop">, width: number, height: number): number {
  if (width <= 0 || height <= 0) return 0;
  const t = layer.transform;
  const area = Math.abs(t[0] * t[3] - t[1] * t[2]);
  if (!(area > 0)) return 0;
  const crop = Math.abs((layer.crop.u1 - layer.crop.u0) * (layer.crop.v1 - layer.crop.v0));
  return Math.sqrt((width * height * crop) / area);
}

/**
 * The long edge Export frame uploads a video at (spec §9.5 "full resolution"): its own size, or twice
 * its size on the frame when it is drawn smaller than half its size (the upload and the draw filter
 * bilinearly, without mipmaps: a 2x step each keeps the lines of the source without aliasing), at most
 * `cap`. `detail` is the layer's source px per project px (`layerDetail`).
 */
export function exportLongEdge(codedLongEdge: number, detail: number, cap: number): number {
  const drawn = detail > 2 ? Math.ceil((2 * codedLongEdge) / detail) : codedLongEdge;
  return Math.max(1, Math.min(cap, codedLongEdge, drawn));
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

/** The lod video frames are asked for in `mode` while the preview is `activity`; `behind`: playback fell behind on the media. */
export function wantedLod(mode: PreviewQuality, activity: PreviewActivity, behind = false): Lod {
  switch (mode) {
    case "full":
      return "full";
    case "proxy":
      return "proxy";
    case "auto":
      return activity === "playing" || activity === "scrubbing" ? "proxy" : "full";
    case "half":
    case "quarter":
      return activity === "playing" && behind ? "proxy" : "full";
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
 * is: `proxy` (a layer drew a proxy frame), `full`, `reduced` (below the full scale; `half` /
 * `quarter` for those playback renders).
 */
export function qualityLabel(mode: PreviewQuality, scales: DetailScales, proxy = false): string {
  if (mode === "full") return "Full";
  const name = MODE_LABELS[mode];
  if (proxy) return `${name}: proxy`;
  if (scales.render >= scales.full - 1e-6) return `${name}: full`;
  if (mode === "half" || mode === "quarter") {
    const reduced = Math.min(scales.full, 1);
    if (scales.render < reduced - 1e-6) return `${name}: ${mode}`;
  }
  return `${name}: reduced`;
}
