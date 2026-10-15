// Edit cursors (spec §6.4, §6.10, §6.18): trim brackets with a double arrow, `[` on in points and `]`
// on out points, in the primary text color, or in the accent color for the ripple variant (Ripple
// mode on, or Mod held); the roll `][`, the slip `|<->|` and slide `<-||->` marks, and the rate
// stretch bracket with a double chevron, and the razor (a cut line with a blade beside it). SVG data
// URLs built from the theme, so no color literal lives in code; a dark outline keeps them visible on
// any clip color. Built once per theme.
import type { Theme } from "../../core/theme/theme.js";
import type { TrimEdge } from "../edit/trim.js";

export interface TrimCursors {
  in: string;
  out: string;
  rippleIn: string;
  rippleOut: string;
  roll: string;
  slip: string;
  slide: string;
  stretchIn: string;
  stretchOut: string;
  razor: string;
}

/** 24x24, hotspot at the center (on the bracket's spine for trims, on the cut for rolls). */
const SIZE = 24;
const HOT = 12;

/** An arrow along y = 12 from `base` to `tip` (`side` -1: pointing left, 1: right). */
function pointer(side: number, base: number, tip: number): string {
  return `M${base} 12 H${tip} M${tip - side * 3} 9 L${tip} 12 L${tip - side * 3} 15`;
}

/** A double arrow on one side of the hotspot from `base` to `tip`. */
function arrow(side: number, base: number, tip: number): string {
  return `${pointer(side, base, tip)} M${base + side * 3} 9 L${base} 12 L${base + side * 3} 15`;
}

function bracketPath(edge: TrimEdge): string {
  // The spine sits on the hotspot; the serifs point into the clip (right for `[`, left for `]`).
  const serif = edge === "in" ? 4 : -4;
  const bracket = `M${HOT + serif} 4 H${HOT} V20 H${HOT + serif}`;
  // The double arrow on the other side: the edge moves both ways.
  const side = edge === "in" ? -1 : 1;
  return `${bracket} ${arrow(side, HOT + side * 2, HOT + side * 9)}`;
}

/** The trim bracket with a second chevron at the arrow's tip: the edge changes the speed. */
function stretchPath(edge: TrimEdge): string {
  const side = edge === "in" ? -1 : 1;
  const tip = HOT + side * 9;
  return `${bracketPath(edge)} M${tip - side * 6} 9 L${tip - side * 3} 12 L${tip - side * 6} 15`;
}

/** `][`: the left clip's out point against the right clip's in point, arrows outward. */
const ROLL = `M6 4 H10 V20 H6 M18 4 H14 V20 H18 ${pointer(-1, 8, 2)} ${pointer(1, 16, 22)}`;
/** The clip's edges stay, its content moves between them. */
const SLIP = `M5 4 V20 M19 4 V20 ${pointer(-1, 12, 8)} ${pointer(1, 12, 16)}`;
/** The clip moves, pushing on both sides. */
const SLIDE = `M10 6 V18 M14 6 V18 ${pointer(-1, 8, 2)} ${pointer(1, 16, 22)}`;
/** The cut line on the hotspot, a blade up and right of it (spec §6.11 Razor). */
const RAZOR = `M12 3 V21 M15 3 H21 V9 H15 Z M18 9 V11`;

function cursor(d: string, color: string, outline: string, fallback = "ew-resize"): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" fill="none" stroke-linecap="square" stroke-linejoin="miter">` +
    `<path d="${d}" stroke="${outline}" stroke-width="4"/><path d="${d}" stroke="${color}" stroke-width="2"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${HOT} ${HOT}, ${fallback}`;
}

export function trimCursors(theme: Theme): TrimCursors {
  const { textPrimary, accent, bgSunken } = theme.color;
  return {
    in: cursor(bracketPath("in"), textPrimary, bgSunken),
    out: cursor(bracketPath("out"), textPrimary, bgSunken),
    rippleIn: cursor(bracketPath("in"), accent, bgSunken),
    rippleOut: cursor(bracketPath("out"), accent, bgSunken),
    roll: cursor(ROLL, textPrimary, bgSunken),
    slip: cursor(SLIP, textPrimary, bgSunken),
    slide: cursor(SLIDE, textPrimary, bgSunken),
    stretchIn: cursor(stretchPath("in"), textPrimary, bgSunken),
    stretchOut: cursor(stretchPath("out"), textPrimary, bgSunken),
    razor: cursor(RAZOR, textPrimary, bgSunken, "crosshair"),
  };
}

export function trimCursor(cursors: TrimCursors, edge: TrimEdge, ripple: boolean): string {
  if (ripple) return edge === "in" ? cursors.rippleIn : cursors.rippleOut;
  return edge === "in" ? cursors.in : cursors.out;
}
