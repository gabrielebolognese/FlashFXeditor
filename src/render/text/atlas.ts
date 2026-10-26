// The per-unit text atlas (spec §10.1, §10.4, P11): animated text is rasterized once as separate words
// (or lines) packed into one texture, and the compositor draws each unit as its own quad with its own
// transform and opacity, never re-rasterizing per frame. Built now so the raster cache's design is
// final; the animations that draw from it are Batch 31.
// - `atlasUnits`: each unit's text, where it is drawn in the layout (its baseline origin), and the rect
//   it covers in content px (its ink grown by the stroke and the shadow, whole px).
// - `packShelves`: unit cells packed left to right in rows ("shelves") no wider than the cap.
// Pure: the drawing is in raster.ts (`buildTextAtlas`).
import type { TextStyle } from "../../core/document/types.js";
import { SHADOW_REACH, type Rect, type TextLayout, type TextMeasurer } from "./layout.js";

export type AtlasUnitKind = "word" | "line";

export interface AtlasUnit {
  kind: AtlasUnitKind;
  /** Line index, and the unit's index in reading order. */
  line: number;
  index: number;
  text: string;
  /** Where its text is drawn from: the left of its advance box and its baseline (content px). */
  x: number;
  baseline: number;
  /** What it covers in content px (whole px): the quad its atlas cell is drawn on. */
  rect: Rect;
}

export interface Size {
  width: number;
  height: number;
}

/** Cells of `sizes` packed in rows `maxWidth` wide, `gap` px apart (and from the edges): positions and the atlas size. */
export function packShelves(sizes: readonly Size[], maxWidth: number, gap = 1): { positions: { x: number; y: number }[]; width: number; height: number } {
  const positions: { x: number; y: number }[] = [];
  let x = gap;
  let y = gap;
  let shelf = 0;
  let width = 0;
  for (const size of sizes) {
    if (x > gap && x + size.width + gap > maxWidth) {
      x = gap;
      y += shelf + gap;
      shelf = 0;
    }
    positions.push({ x, y });
    x += size.width + gap;
    shelf = Math.max(shelf, size.height);
    width = Math.max(width, x);
  }
  return { positions, width: Math.max(1, width), height: Math.max(1, sizes.length > 0 ? y + shelf + gap : 1) };
}

/** The units of a layout: its words (split at spaces) or its lines, empty ones left out, in reading order. */
export function atlasUnits(layout: TextLayout, style: TextStyle, measurer: TextMeasurer, kind: AtlasUnitKind): AtlasUnit[] {
  const size = style.fontSize;
  const spacing = style.letterSpacing;
  const stroke = style.stroke.enabled ? Math.max(0, style.stroke.width) : 0;
  const shadow = style.shadow.enabled && style.shadow.color.a > 0 ? style.shadow : null;
  const units: AtlasUnit[] = [];
  const add = (line: number, text: string, x: number, baseline: number) => {
    const m = measurer.measure(text, layout.font, size, spacing);
    if (m.left + m.right <= 0 || m.ascent + m.descent <= 0) return;
    let x0 = x - m.left - stroke;
    let y0 = baseline - m.ascent - stroke;
    let x1 = x + m.right + stroke;
    let y1 = baseline + m.descent + stroke;
    if (shadow) {
      const reach = Math.max(0, shadow.blur) * SHADOW_REACH;
      x0 = Math.min(x0, x0 + shadow.x - reach);
      y0 = Math.min(y0, y0 + shadow.y - reach);
      x1 = Math.max(x1, x1 + shadow.x + reach);
      y1 = Math.max(y1, y1 + shadow.y + reach);
    }
    const rx = Math.floor(x0) - 1;
    const ry = Math.floor(y0) - 1;
    units.push({ kind, line, index: units.length, text, x, baseline, rect: { x: rx, y: ry, width: Math.ceil(x1) + 1 - rx, height: Math.ceil(y1) + 1 - ry } });
  };
  layout.lines.forEach((line, lineIndex) => {
    if (line.text === "") return;
    if (kind === "line") {
      add(lineIndex, line.text, line.x, line.baseline);
      return;
    }
    const pattern = /\S+/g;
    for (let match = pattern.exec(line.text); match; match = pattern.exec(line.text)) {
      const prefix = line.text.slice(0, match.index);
      const advance = prefix === "" ? 0 : measurer.measure(prefix, layout.font, size, spacing).width;
      add(lineIndex, match[0], line.x + advance, line.baseline);
    }
  });
  return units;
}
