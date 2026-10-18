// Preset thumbnails (spec §10.3, §20.2): the preset's sample text laid out and rasterized by the real
// text engine in the preset's look (auto box: one line), scaled to fit a button or card with a margin,
// centered, as an ImageBitmap (PresetThumbService caches them and makes them in idle time). A preset
// with a word highlight (the Captions starters, Batch 52) shows its last word active as a caption
// track draws it: the other words in the inactive color, the active one in the highlight color, grown
// (scale modes) or on its pill (background). Main thread, like the preview's text rasters (Batch 28);
// the fonts must be loaded first (`FontLibrary.ready`).
import type { TextPreset, TextStyle } from "../../core/document/types.js";
import { presetSampleText } from "../../text/presets.js";
import { DEFAULT_TEXT_BOX, scaleTextStyle, textContent } from "../../text/style.js";
import { HIGHLIGHT_PAD_X, HIGHLIGHT_PAD_Y, HIGHLIGHT_SCALE } from "./captionLayout.js";
import type { Rect, TextLayout } from "./layout.js";
import { textLayout } from "./layoutCache.js";
import { rasterizeText } from "./raster.js";

/** Thumbnails never draw text larger than its preset size times this. */
const MAX_SCALE = 2;

interface Part {
  layout: TextLayout;
  style: TextStyle;
  /** Where its content box sits in the thumbnail's content px. */
  dx: number;
  dy: number;
}

const center = (rect: Rect) => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
const layoutOf = (text: string, style: TextStyle) => textLayout(textContent(text, DEFAULT_TEXT_BOX), style);

function union(a: Rect | null, b: Rect): Rect {
  if (!a) return b;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
}

/** The styles a highlight draws: the other words', and the active word's (spec §10.5 modes). */
function highlightStyles(preset: TextPreset): { inactive: TextStyle; active: TextStyle } | null {
  const highlight = preset.highlight;
  if (!highlight || highlight.mode === "none") return null;
  const style = preset.style;
  const inactive: TextStyle = { ...style, fill: { ...highlight.inactiveColor } };
  let active: TextStyle = highlight.mode === "color" || highlight.mode === "colorAndScale" ? { ...style, fill: { ...highlight.color } } : { ...style };
  if (highlight.mode === "scale" || highlight.mode === "colorAndScale") active = scaleTextStyle(active, HIGHLIGHT_SCALE);
  if (highlight.mode === "background") {
    // A pill behind the word, as the compositor draws it.
    const padY = style.fontSize * HIGHLIGHT_PAD_Y;
    active = { ...active, background: { enabled: true, color: { ...highlight.color }, paddingX: style.fontSize * HIGHLIGHT_PAD_X, paddingY: padY, radius: style.fontSize, mode: "line" } };
  }
  return { inactive, active };
}

/** What the thumbnail draws: the sample in the preset's style, or the inactive line with the active last word over it. */
function thumbnailParts(preset: TextPreset): Part[] {
  const text = presetSampleText(preset);
  const styles = highlightStyles(preset);
  const words = text.split(" ");
  const last = words[words.length - 1] ?? "";
  if (!styles || words.length < 2 || last === "") return [{ layout: layoutOf(text, preset.style), style: preset.style, dx: 0, dy: 0 }];
  const full = layoutOf(text, styles.inactive);
  const line = full.lines[full.lines.length - 1];
  const base = layoutOf(last, styles.inactive);
  const baseLine = base.lines[0];
  if (!line || !baseLine) return [{ layout: full, style: styles.inactive, dx: 0, dy: 0 }];
  // The last word's place in the line (at the line's size), then the active word centered on it.
  const at = { x: line.x + line.width - baseLine.width - baseLine.x, y: line.baseline - baseLine.baseline };
  const middle = center(base.block);
  const active = layoutOf(last, styles.active);
  const own = center(active.block);
  return [
    { layout: full, style: styles.inactive, dx: 0, dy: 0 },
    { layout: active, style: styles.active, dx: at.x + middle.x - own.x, dy: at.y + middle.y - own.y },
  ];
}

/**
 * `preset`'s thumbnail fitted into `width` x `height` device px (less `margin` each side), centered,
 * as a bitmap; null when there is nothing to draw (or no OffscreenCanvas).
 */
export function renderPresetThumbnail(preset: TextPreset, width: number, height: number, margin: number): ImageBitmap | null {
  if (typeof OffscreenCanvas === "undefined" || width <= 0 || height <= 0) return null;
  const parts = thumbnailParts(preset);
  let bounds: Rect | null = null;
  for (const part of parts) {
    const rect = part.layout.raster;
    if (rect) bounds = union(bounds, { ...rect, x: rect.x + part.dx, y: rect.y + part.dy });
  }
  const room = { width: width - 2 * margin, height: height - 2 * margin };
  if (!bounds || bounds.width <= 0 || bounds.height <= 0 || room.width <= 0 || room.height <= 0) return null;
  const scale = Math.min(MAX_SCALE, room.width / bounds.width, room.height / bounds.height);
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const ox = (width - bounds.width * scale) / 2 - bounds.x * scale;
  const oy = (height - bounds.height * scale) / 2 - bounds.y * scale;
  for (const part of parts) {
    const raster = rasterizeText(part.layout, part.style, scale);
    if (!raster) continue;
    // The raster covers `raster.rect` at its own scale (equal to `scale` at thumbnail sizes).
    const k = raster.scale / scale;
    ctx.drawImage(raster.canvas, Math.round(ox + (part.dx + raster.rect.x) * scale), Math.round(oy + (part.dy + raster.rect.y) * scale), raster.width / k, raster.height / k);
  }
  return canvas.transferToImageBitmap();
}
