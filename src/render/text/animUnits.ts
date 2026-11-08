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

// Batch 68: the geometry range-selector animators need (text/animators.ts).

const FINENESS: Record<AtlasUnitKind, number> = { char: 0, word: 1, line: 2 };

/** The finest of `kinds` (a character is finer than a word, a word than a line). */
export function finestUnit(kinds: readonly AtlasUnitKind[]): AtlasUnitKind {
  let best: AtlasUnitKind = "line";
  for (const kind of kinds) if (FINENESS[kind] < FINENESS[best]) best = kind;
  return best;
}

const indexCache = new WeakMap<TextLayout, Partial<Record<string, Int32Array>>>();

/**
 * For each unit of `atlas`, the index of the unit of `kind` (the same or a coarser one) it belongs to: a
 * character's word and line, a word's line.
 */
export function unitIndex(layout: TextLayout, style: TextStyle, atlas: AtlasUnitKind, kind: AtlasUnitKind): Int32Array {
  let byKey = indexCache.get(layout);
  if (!byKey) {
    byKey = {};
    indexCache.set(layout, byKey);
  }
  const key = `${atlas}>${kind}`;
  let found = byKey[key];
  if (found) return found;
  const fine = layoutUnits(layout, style, atlas);
  found = new Int32Array(fine.length);
  if (atlas === kind) {
    for (let i = 0; i < fine.length; i++) found[i] = i;
  } else {
    const coarse = layoutUnits(layout, style, kind);
    for (let i = 0; i < fine.length; i++) {
      const unit = fine[i] as AtlasUnit;
      let at = 0;
      for (let j = 0; j < coarse.length; j++) {
        const c = coarse[j] as AtlasUnit;
        if (c.line !== unit.line) continue;
        if (kind === "line" || (unit.offset >= c.offset && unit.offset < c.offset + c.text.length)) {
          at = j;
          break;
        }
      }
      found[i] = at;
    }
  }
  byKey[key] = found;
  return found;
}

const lineCache = new WeakMap<TextLayout, Partial<Record<AtlasUnitKind, Int32Array>>>();

/** Each unit of `atlas`'s line. */
export function unitLines(layout: TextLayout, style: TextStyle, atlas: AtlasUnitKind): Int32Array {
  let byKind = lineCache.get(layout);
  if (!byKind) {
    byKind = {};
    lineCache.set(layout, byKind);
  }
  let found = byKind[atlas];
  if (!found) {
    const units = layoutUnits(layout, style, atlas);
    found = new Int32Array(units.length);
    for (let i = 0; i < units.length; i++) found[i] = (units[i] as AtlasUnit).line;
    byKind[atlas] = found;
  }
  return found;
}
