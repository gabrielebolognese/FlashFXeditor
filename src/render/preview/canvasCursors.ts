// Gizmo cursors (spec §7.3): the rotate cursor shown in the zones outside the box corners, an arc with
// an arrow at each end. An SVG data URL built from the theme like the timeline's edit cursors (no
// color literal in code; a dark outline keeps it visible on any picture). Resize cursors are the
// browser's, picked by the handle's direction on screen (gizmo.ts `resizeCursor`).
import type { Theme } from "../../core/theme/theme.js";

export interface CanvasCursors {
  rotate: string;
}

/** 24x24, hotspot at the center. */
const SIZE = 24;
const HOT = 12;

/** A quarter arc around the hotspot's lower left, arrows at both ends. */
const ROTATE = "M6 17 A11 11 0 0 1 17 6 M14 3 L17 6 L14 9 M3 14 L6 17 L9 14";

export function canvasCursors(theme: Theme): CanvasCursors {
  const { textPrimary, bgSunken } = theme.color;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" fill="none" stroke-linecap="square" stroke-linejoin="miter">` +
    `<path d="${ROTATE}" stroke="${bgSunken}" stroke-width="4"/><path d="${ROTATE}" stroke="${textPrimary}" stroke-width="2"/></svg>`;
  return { rotate: `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${HOT} ${HOT}, crosshair` };
}
