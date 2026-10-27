// Preset card thumbnails (spec §10.3): the preset's name (or `Aa` when it is long) laid out and
// rasterized by the real text engine in the preset's look (auto box: one line), scaled to fit the
// card with a margin, centered. Rasters are cached by look, text, size and layout version (a font that
// loads drops the layouts, so the card draws again with it); a font still loading draws nothing yet
// (the caller redraws on the font change). Main thread, like the preview's text rasters (Batch 28).
import type { TextPreset } from "../../core/document/types.js";
import { thumbnailText } from "../../text/presets.js";
import { styleKey, textContent } from "../../text/style.js";
import type { FontLibrary } from "./FontLibrary.js";
import { textLayout, textLayoutVersion } from "./layoutCache.js";
import { rasterizeText, rasterRect, type TextRaster } from "./raster.js";

const MAX_CACHED = 96;
/** Thumbnails never draw text larger than its preset size times this. */
const MAX_SCALE = 2;
const cache = new Map<string, TextRaster | null>();

/** The raster of `preset`'s thumbnail fitted into `width` x `height` device px (less `margin` each side), or null. */
export function presetThumbnail(preset: TextPreset, width: number, height: number, margin: number): TextRaster | null {
  const text = thumbnailText(preset.name);
  const key = `${styleKey(preset.style)}|${text}|${width}x${height}|${margin}|${textLayoutVersion()}`;
  const cached = cache.get(key);
  if (cached !== undefined) {
    // Most recently used last.
    cache.delete(key);
    cache.set(key, cached);
    return cached;
  }
  const layout = textLayout(textContent(text, { mode: "auto", width: preset.box.width }), preset.style);
  const rect = rasterRect(layout);
  const room = { width: width - 2 * margin, height: height - 2 * margin };
  const raster = rect && room.width > 0 && room.height > 0 ? rasterizeText(layout, preset.style, Math.min(MAX_SCALE, room.width / rect.width, room.height / rect.height)) : null;
  cache.set(key, raster);
  if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value as string);
  return raster;
}

/**
 * Draws `preset`'s thumbnail on `canvas` (its pixel size set from `cssWidth` x `cssHeight` at `dpr`).
 * False when its font is still loading (nothing drawn; `fonts` reports the load).
 */
export function drawPresetThumbnail(canvas: HTMLCanvasElement, preset: TextPreset, cssWidth: number, cssHeight: number, dpr: number, cssMargin: number, fonts: FontLibrary): boolean {
  const width = Math.max(1, Math.round(cssWidth * dpr));
  const height = Math.max(1, Math.round(cssHeight * dpr));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return true;
  ctx.clearRect(0, 0, width, height);
  if (!fonts.ready(preset.style, thumbnailText(preset.name))) return false;
  const raster = presetThumbnail(preset, width, height, Math.round(cssMargin * dpr));
  if (raster) ctx.drawImage(raster.canvas, Math.round((width - raster.width) / 2), Math.round((height - raster.height) / 2));
  return true;
}