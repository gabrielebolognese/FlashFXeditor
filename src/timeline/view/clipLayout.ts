// Clip rectangles on device pixels and their level of detail (spec §6.4, §6.17). Edges are rounded
// to whole device pixels so they stay crisp at any zoom, and a clip that abuts the next one gives
// up its last device pixel as the 1 px separator.

/** Below this width (CSS px) a clip is only its body color: no corners, label bar or outline. */
export const LOD_BODY_PX = 6;
/** Below this width the label bar has no icon or name. */
export const LOD_LABEL_PX = 24;

export type ClipLod = "line" | "body" | "full";

export function clipLod(widthCss: number): ClipLod {
  return widthCss < LOD_BODY_PX ? "line" : widthCss < LOD_LABEL_PX ? "body" : "full";
}

/** A horizontal span in device px, `x1` exclusive. */
export interface DeviceSpan {
  x0: number;
  x1: number;
}

/** Device-pixel span of a clip from its start/end x in CSS px; at least 1 device px wide. */
export function clipSpan(startX: number, endX: number, abutsNext: boolean, dpr: number): DeviceSpan {
  const x0 = Math.round(startX * dpr);
  const x1 = Math.round(endX * dpr) - (abutsNext ? 1 : 0);
  return { x0, x1: Math.max(x0 + 1, x1) };
}

/** A length in CSS px as whole device px, at least 1. */
export function devicePx(css: number, dpr: number): number {
  return Math.max(1, Math.round(css * dpr));
}
