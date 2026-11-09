// Ported from FlashFX-v2 src/core/maskReveal.ts @ a91c675, adapted.
// One-click mask reveals (spec §21.18, Batch 73): pure builders of the keys that grow a box mask from
// nothing to its full size so the clip wipes or irises on. The mask's box is the fully revealed end
// state; the start collapses it with its anchored edge (or its center) kept in place.
// Adapted: the editor's boxes are (x, y) top left + (w, h) in content px, so a wipe keys only the width
// (and x for a right-to-left wipe) and the circle reveal keys all four; only the two presets the spec
// names are offered in the UI (`wipeRight` = "Wipe in", `irisIn` = "Circle reveal"); the others stay
// for completeness of the port.
import type { MaskBox } from "../document/types.js";

export type MaskRevealKind = "irisIn" | "wipeRight" | "wipeLeft" | "wipeDown" | "wipeUp";

/** The box fields a reveal keys. */
export type MaskBoxField = "x" | "y" | "w" | "h";

/** Two keys per box field: (frame, value) at the start and at the end. */
export type MaskRevealKeys = Partial<Record<MaskBoxField, [{ frame: number; value: number }, { frame: number; value: number }]>>;

/**
 * Keys that reveal the clip through a box mask `box` over [startFrame, startFrame + durationFrames]:
 * - irisIn: size 0 at the center, growing out to the box.
 * - wipeRight / wipeLeft: a full height sliver at the left / right edge growing across.
 * - wipeDown / wipeUp: a full width sliver at the top / bottom edge growing down / up.
 */
export function buildMaskReveal(kind: MaskRevealKind, box: Pick<MaskBox, "x" | "y" | "w" | "h">, startFrame: number, durationFrames: number): MaskRevealKeys {
  const end = startFrame + Math.max(1, Math.round(durationFrames));
  const pair = (from: number, to: number): [{ frame: number; value: number }, { frame: number; value: number }] => [{ frame: startFrame, value: from }, { frame: end, value: to }];
  const { x, y, w, h } = box;
  switch (kind) {
    case "irisIn":
      return { x: pair(x + w / 2, x), y: pair(y + h / 2, y), w: pair(0, w), h: pair(0, h) };
    case "wipeRight":
      return { w: pair(0, w) };
    case "wipeLeft":
      return { x: pair(x + w, x), w: pair(0, w) };
    case "wipeDown":
      return { h: pair(0, h) };
    case "wipeUp":
      return { y: pair(y + h, y), h: pair(0, h) };
  }
}

/** The end box of a preset over content `width` x `height`: the whole box for a wipe, the circle through its corners for an iris. */
export function revealBox(kind: MaskRevealKind, width: number, height: number): Pick<MaskBox, "kind" | "x" | "y" | "w" | "h"> {
  if (kind !== "irisIn") return { kind: "rect", x: 0, y: 0, w: width, h: height };
  const d = Math.hypot(width, height);
  return { kind: "ellipse", x: (width - d) / 2, y: (height - d) / 2, w: d, h: d };
}
