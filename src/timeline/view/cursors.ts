// Trim cursors (spec §6.4): a bracket with a double arrow, `[` on in points and `]` on out points, in
// the primary text color, or in the accent color for the ripple variant (Ripple mode on, or Mod
// held). SVG data URLs built from the theme, so no color literal lives in code; a dark outline keeps
// them visible on any clip color. Built once per theme.
import type { Theme } from "../../core/theme/theme.js";
import type { TrimEdge } from "../edit/trim.js";

export interface TrimCursors {
  in: string;
  out: string;
  rippleIn: string;
  rippleOut: string;
}

/** 24x24, hotspot on the bracket's spine at the center. */
const SIZE = 24;
const HOT = 12;

function bracketPath(edge: TrimEdge): string {
  // The spine sits on the hotspot; the serifs point into the clip (right for `[`, left for `]`).
  const serif = edge === "in" ? 4 : -4;
  const bracket = `M${HOT + serif} 4 H${HOT} V20 H${HOT + serif}`;
  // The double arrow on the other side: the edge moves both ways.
  const side = edge === "in" ? -1 : 1;
  const tip = HOT + side * 9;
  const base = HOT + side * 2;
  const arrow = `M${base} 12 H${tip} M${tip - side * 3} 9 L${tip} 12 L${tip - side * 3} 15 M${base + side * 3} 9 L${base} 12 L${base + side * 3} 15`;
  return `${bracket} ${arrow}`;
}

function cursor(edge: TrimEdge, color: string, outline: string): string {
  const d = bracketPath(edge);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" fill="none" stroke-linecap="square" stroke-linejoin="miter">` +
    `<path d="${d}" stroke="${outline}" stroke-width="4"/><path d="${d}" stroke="${color}" stroke-width="2"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${HOT} ${HOT}, ew-resize`;
}

export function trimCursors(theme: Theme): TrimCursors {
  const { textPrimary, accent, bgSunken } = theme.color;
  return {
    in: cursor("in", textPrimary, bgSunken),
    out: cursor("out", textPrimary, bgSunken),
    rippleIn: cursor("in", accent, bgSunken),
    rippleOut: cursor("out", accent, bgSunken),
  };
}

export function trimCursor(cursors: TrimCursors, edge: TrimEdge, ripple: boolean): string {
  if (ripple) return edge === "in" ? cursors.rippleIn : cursors.rippleOut;
  return edge === "in" ? cursors.in : cursors.out;
}
