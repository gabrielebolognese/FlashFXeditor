// Text layouts as a derived cache (spec §3.3 "layout measurements", P11): `textLayout(content, style)`
// is the layout of a text clip, memoized per (content, style) object pair (documents are immutable, so
// an unchanged clip keeps its objects and a lookup allocates nothing). Fonts that finish loading (or
// project fonts that come and go) change measurements: `invalidateTextLayouts` drops every layout and
// tells the listeners (the preview, the canvas, the timeline redraw).
// Measuring uses a 2D canvas context (`ctx.letterSpacing`, `fontKerning`) where there is one; elsewhere
// (unit tests, no OffscreenCanvas) an approximate measurer. Tests install their own.
import type { TextContent, TextStyle } from "../../core/document/types.js";
import { layoutText, type RunMetrics, type TextLayout, type TextMeasurer } from "./layout.js";

/** A deterministic measurer without a canvas: every character 0.55 em wide, letter spacing after each. */
export const approximateMeasurer: TextMeasurer = {
  measure(text, _font, size, letterSpacing) {
    const count = Array.from(text).length;
    const width = count * ((size * 55) / 100 + letterSpacing);
    const ink = Math.max(0, width - letterSpacing);
    return count === 0 ? { width: 0, left: 0, right: 0, ascent: 0, descent: 0 } : { width, left: 0, right: ink, ascent: (size * 72) / 100, descent: (size * 20) / 100 };
  },
  fontMetrics: (_font, size) => ({ ascent: (size * 90) / 100, descent: (size * 25) / 100 }),
};

/** The canvas measurer, or null where there is no OffscreenCanvas 2D context. */
export function canvasMeasurer(): TextMeasurer | null {
  if (typeof OffscreenCanvas === "undefined") return null;
  const ctx = new OffscreenCanvas(1, 1).getContext("2d");
  if (!ctx) return null;
  ctx.fontKerning = "normal";
  ctx.textBaseline = "alphabetic";
  let font = "";
  let spacing = Number.NaN;
  const select = (nextFont: string, letterSpacing: number) => {
    if (nextFont !== font) {
      ctx.font = nextFont;
      font = nextFont;
    }
    if (letterSpacing !== spacing) {
      ctx.letterSpacing = `${letterSpacing}px`;
      spacing = letterSpacing;
    }
  };
  const fontMetrics = new Map<string, { ascent: number; descent: number }>();
  return {
    measure(text, nextFont, _size, letterSpacing): RunMetrics {
      select(nextFont, letterSpacing);
      const m = ctx.measureText(text);
      return { width: m.width, left: m.actualBoundingBoxLeft, right: m.actualBoundingBoxRight, ascent: m.actualBoundingBoxAscent, descent: m.actualBoundingBoxDescent };
    },
    fontMetrics(nextFont) {
      let metrics = fontMetrics.get(nextFont);
      if (!metrics) {
        select(nextFont, 0);
        const m = ctx.measureText("Hg");
        metrics = { ascent: m.fontBoundingBoxAscent, descent: m.fontBoundingBoxDescent };
        if (fontMetrics.size > 256) fontMetrics.clear();
        fontMetrics.set(nextFont, metrics);
      }
      return metrics;
    },
  };
}

let measurer: TextMeasurer | null = null;
let fallback = "sans-serif";
let version = 0;
const listeners = new Set<() => void>();

interface Entry {
  version: number;
  layout: TextLayout;
}

let cache = new WeakMap<TextContent, WeakMap<TextStyle, Entry>>();

/** The measurer layouts use (the atlas measures word positions with it). */
export function currentMeasurer(): TextMeasurer {
  measurer ??= canvasMeasurer() ?? approximateMeasurer;
  return measurer;
}

/** The layout of a text clip's content in its style (cached). */
export function textLayout(content: TextContent, style: TextStyle): TextLayout {
  let byStyle = cache.get(content);
  if (!byStyle) {
    byStyle = new WeakMap();
    cache.set(content, byStyle);
  }
  const entry = byStyle.get(style);
  if (entry && entry.version === version) return entry.layout;
  const layout = layoutText(content, style, currentMeasurer(), fallback);
  byStyle.set(style, { version, layout });
  return layout;
}

/** A counter that changes whenever cached layouts were dropped (caches keyed on layouts compare it). */
export function textLayoutVersion(): number {
  return version;
}

/** Drops every cached layout (fonts changed) and tells the listeners. */
export function invalidateTextLayouts(): void {
  version += 1;
  cache = new WeakMap();
  for (const listener of [...listeners]) listener();
}

/** Calls `listener` after layouts were dropped. */
export function onTextLayoutsChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The font stack drawn where a family is missing (the DS body font, spec §10.1), from the theme. */
export function setTextFallback(stack: string): void {
  if (stack === fallback || stack === "") return;
  fallback = stack;
  invalidateTextLayouts();
}

export function textFallback(): string {
  return fallback;
}

/** Replaces the measurer (tests); null goes back to the canvas one. */
export function setTextMeasurer(next: TextMeasurer | null): void {
  measurer = next;
  invalidateTextLayouts();
}
