// Geometry of the preview overlays (spec §7.5, §7.6), in project px; `PreviewOverlayView` maps it onto
// the canvas. Safe zones scale from their 1080 x 1920 measurements to the frame; grids, the title-safe
// and action-safe rectangles (80% / 90% of the frame, centered), and the ruler ticks.
import type { PreviewGrid, SafeZone } from "../../core/store/sessionStore.js";
import { SAFE_ZONE_REFERENCE, SAFE_ZONE_SPECS, type SafeZoneRegion, type ZoneRect } from "./safeZones.js";

export interface FrameSize {
  width: number;
  height: number;
}

/** Title-safe and action-safe sizes (fractions of the frame; title-safe is the inner one). */
export const TITLE_SAFE = 0.8;
export const ACTION_SAFE = 0.9;

/** A safe zone's masks and safe rectangle on `frame` (project px); null for `none`. */
export function safeZoneOn(zone: SafeZone, frame: FrameSize): { regions: SafeZoneRegion[]; safe: ZoneRect } | null {
  if (zone === "none") return null;
  const spec = SAFE_ZONE_SPECS[zone];
  const sx = frame.width / SAFE_ZONE_REFERENCE.width;
  const sy = frame.height / SAFE_ZONE_REFERENCE.height;
  const scale = (rect: ZoneRect): ZoneRect => ({ x: rect.x * sx, y: rect.y * sy, width: rect.width * sx, height: rect.height * sy });
  return { regions: spec.regions.map((region) => ({ ...scale(region), label: region.label })), safe: scale(spec.safe) };
}

/**
 * Grid lines (project px, inside the frame): `thirds` at a third of each side; `squares` square cells a
 * third of the short side wide, the middle one centered on the frame; `custom` `divisions` equal cells
 * per side.
 */
export function gridLines(grid: PreviewGrid, divisions: number, frame: FrameSize): { xs: number[]; ys: number[] } {
  const { width, height } = frame;
  switch (grid) {
    case "none":
      return { xs: [], ys: [] };
    case "thirds":
      return { xs: [width / 3, (2 * width) / 3], ys: [height / 3, (2 * height) / 3] };
    case "custom": {
      const n = Math.max(1, Math.round(divisions));
      const steps = (size: number) => Array.from({ length: n - 1 }, (_, i) => ((i + 1) * size) / n);
      return { xs: steps(width), ys: steps(height) };
    }
    case "squares": {
      const cell = Math.min(width, height) / 3;
      return { xs: centeredSteps(width, cell), ys: centeredSteps(height, cell) };
    }
  }
}

/** Lines `cell` apart inside (0, size), the middle cell centered on size / 2. */
function centeredSteps(size: number, cell: number): number[] {
  const lines: number[] = [];
  for (let k = 0; ; k++) {
    const offset = cell / 2 + k * cell;
    if (offset >= size / 2) break;
    lines.push(size / 2 - offset, size / 2 + offset);
  }
  return lines.sort((a, b) => a - b);
}

/** A centered rectangle `fraction` of the frame on each side. */
export function centeredRect(frame: FrameSize, fraction: number): ZoneRect {
  const width = frame.width * fraction;
  const height = frame.height * fraction;
  return { x: (frame.width - width) / 2, y: (frame.height - height) / 2, width, height };
}

/** Ruler steps in project px: labeled ticks at least `labelGap` device px apart, minor ticks at a fifth or a half of that. */
export function rulerStep(scale: number, labelGap: number): { major: number; minor: number } {
  const target = labelGap / scale;
  let magnitude = 10 ** Math.floor(Math.log10(Math.max(target, 1e-9)));
  for (;;) {
    for (const factor of [1, 2, 5]) {
      const major = factor * magnitude;
      if (major >= target && major >= 1) return { major, minor: factor === 2 ? major / 2 : major / 5 >= 1 ? major / 5 : major };
    }
    magnitude *= 10;
  }
}

/** Multiples of `step` within [from, to] (project px), at most `max` of them. */
export function ticksIn(from: number, to: number, step: number, max = 2000): number[] {
  const ticks: number[] = [];
  for (let value = Math.ceil(from / step) * step; value <= to && ticks.length < max; value += step) ticks.push(Math.round(value * 1e6) / 1e6 || 0);
  return ticks;
}
