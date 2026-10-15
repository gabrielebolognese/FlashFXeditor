// The 8 label colors as swatches (spec §6.4, §6.16): the clip menu's Label row, the marker editor and
// the Marker section of the properties panel.
import { LABEL_COLORS, type LabelColor } from "../../core/document/types.js";
import type { Swatch } from "../../ui/Swatches.js";

export const LABEL_NAMES: Record<LabelColor, string> = {
  red: "Red",
  orange: "Orange",
  green: "Green",
  teal: "Teal",
  blue: "Blue",
  violet: "Violet",
  pink: "Pink",
  grey: "Grey",
};

/**
 * One swatch per label color, `prefix` + the color as its id; `current` is the active one. With
 * `removable` (clip labels) the active swatch's name says that a click removes it.
 */
export function labelSwatches(current: LabelColor | null, options: { prefix?: string; removable?: boolean } = {}): Swatch[] {
  const prefix = options.prefix ?? "";
  return LABEL_COLORS.map((color) => ({
    id: `${prefix}${color}`,
    label: options.removable && current === color ? `${LABEL_NAMES[color]} (click to remove)` : LABEL_NAMES[color],
    color: `var(--label-${color})`,
    active: current === color,
  }));
}
