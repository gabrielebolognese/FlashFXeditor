// Timeline view test helpers. Not imported by app code.
import { readTheme, type Theme } from "../../core/theme/theme.js";
import type { TimelineMetrics } from "./geometry.js";

/** The token values of tokens.css that the timeline uses. */
const TOKENS: Record<string, string> = {
  "--timeline-header-width": "176px",
  "--timeline-ruler-height": "28px",
  "--timeline-divider-height": "4px",
  "--timeline-add-row-height": "24px",
  "--track-height-s": "32px",
  "--track-height-m": "56px",
  "--track-height-l": "88px",
  "--clip-label-height": "16px",
  "--clip-inset": "2px",
  "--selection-outline": "1.5px",
  "--playhead-width": "1px",
  "--playhead-width-active": "2px",
  "--playhead-head-width": "11px",
  "--playhead-head-height": "10px",
  "--radius-sm": "4px",
  "--icon-size": "14px",
  "--icon-size-sm": "12px",
  "--control-comfortable": "32px",
  "--type-caption-size": "11px",
  "--type-body-size": "12px",
  "--space-0": "2px",
  "--space-1": "4px",
  "--space-2": "6px",
  "--space-3": "8px",
  "--track-toggle-size": "16px",
  "--track-toggle-gap": "4px",
};

/** A Theme with the timeline metrics set; colors are their token names (canvases take any string). */
export function testTheme(): Theme {
  return readTheme((name) => TOKENS[name] ?? name).theme;
}

export const METRICS: TimelineMetrics = {
  headerWidth: 176,
  rulerHeight: 28,
  dividerHeight: 4,
  addRowHeight: 24,
  trackHeight: { S: 32, M: 56, L: 88 },
  headerPad: 8,
  headerLine: 32,
  toggleSize: 16,
  toggleGap: 4,
};
