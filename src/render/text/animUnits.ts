// The units of a laid-out text as its animations move them (spec §10.4), cached per layout object
// (layouts are cached per content and style, so an unchanged clip finds its units with one lookup and
// the compositor allocates nothing per frame):
// - `layoutUnits`: the atlas units (characters, words or lines): their rects and middles.
// - `layoutStops`: each line's grapheme boundaries, how many graphemes come before it and in all, for
//   the typewriter, which cuts its characters out of the drawn lines.
import type { TextStyle } from "../../core/document/types.js";
import { atlasUnits, lineStops, type AtlasUnit, type AtlasUnitKind } from "./atlas.js";
import type { TextLayout } from "./layout.js";
import { currentMeasurer } from "./layoutCache.js";

const unitCache = new WeakMap<TextLayout, Partial<Record<AtlasUnitKind, readonly AtlasUnit[]>>>();

/** `layout`'s units of `kind` (measured with the current measurer, as the atlas is). */
export function layoutUnits(layout: TextLayout, style: TextStyle, kind: AtlasUnitKind): readonly AtlasUnit[] {
  let byKind = unitCache.get(layout);
  if (!byKind) {
    byKind = {};
    unitCache.set(layout, byKind);
  }
  return (byKind[kind] ??= atlasUnits(layout, style, currentMeasurer(), kind));
}

export interface LayoutStops {
  /** Per layout line: x of each grapheme boundary (content px). */
  stops: readonly (readonly number[])[];
  /** Per layout line: graphemes in the lines above it. */
  before: readonly number[];
  /** Graphemes in all (line breaks not counted). */
  total: number;
}

const stopCache = new WeakMap<TextLayout, LayoutStops>();

export function layoutStops(layout: TextLayout, style: TextStyle): LayoutStops {
  let found = stopCache.get(layout);
  if (!found) {
    const stops = lineStops(layout, style, currentMeasurer());
    const before: number[] = [];
    let total = 0;
    for (const line of stops) {
      before.push(total);
      total += line.length - 1;
    }
    found = { stops, before, total };
    stopCache.set(layout, found);
  }
  return found;
}
