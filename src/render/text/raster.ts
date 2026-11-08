// Text rasterization (spec §10.1, P11): a laid-out text drawn with Canvas2D into an OffscreenCanvas at
// `scale` px per content px, ready for upload as a texture.
// - Drawn at the scaled size (font size, letter spacing, stroke, padding, radius and shadow times the
//   scale; canvas shadows ignore the transform, so they are scaled by hand), with `fontKerning` and
//   `letterSpacing` (implementation notes). Each line is measured once at that size and aligned in the
//   block, so a right or centered line stays put whatever the hinting at that size.
// - Background boxes first (one path: per-line boxes that overlap fill once), then the text: the stroke
//   is drawn twice as wide and its inside cut away, so it lies outside the glyphs even under a
//   translucent fill; then the fill (solid, or the vertical gradient over the text block). With a
//   stroke or a shadow the text goes through a scratch canvas: the shadow is one pass of the whole
//   text (fill and stroke together), and the stroke's cut never reaches the background boxes.
// - While a text is edited inline (spec §7.7) its selection highlight is drawn between the background
//   boxes and the text, so the composite shows it as the glyphs see it (WYSIWYG).
// - At most TEXT_RASTER_MAX px on the long side: the scale is lowered to fit (implementation notes).
// Browser only (OffscreenCanvas); the geometry it draws is layout.ts's and atlas.ts's.
import { formatHexColor } from "../../core/document/color.js";
import type { RGBA, TextSpanStyle, TextStyle } from "../../core/document/types.js";
import { pieces, runStyle } from "../../text/spans.js";
import { fontShorthand } from "../../text/fonts.js";
import { isGradientFill, isTwoStop } from "../../core/document/fill.js";
import { atlasUnits, packShelves, type AtlasUnit, type AtlasUnitKind } from "./atlas.js";
import { decorationBoxes, type Rect, type TextLayout, type TextLine } from "./layout.js";
import { currentMeasurer, textFallback } from "./layoutCache.js";

/** Long-side cap of a text raster (implementation notes: "cap at 4096 px"). */
export const TEXT_RASTER_MAX = 4096;

/**
 * A selection highlight drawn in the raster (inline editing, spec §7.7): over the background boxes,
 * under the glyphs. Rects in content px, a CSS color.
 */
export interface TextHighlight {
  rects: readonly Rect[];
  color: string;
}

/** The content px a raster of `layout` covers: its raster rect, grown to whole px over the highlight's rects. */
export function rasterRect(layout: TextLayout, highlight?: TextHighlight | null): Rect | null {
  let rect = layout.raster;
  for (const box of highlight?.rects ?? []) {
    if (!rect) {
      rect = box;
      continue;
    }
    const x = Math.min(rect.x, Math.floor(box.x));
    const y = Math.min(rect.y, Math.floor(box.y));
    rect = { x, y, width: Math.max(rect.x + rect.width, Math.ceil(box.x + box.width)) - x, height: Math.max(rect.y + rect.height, Math.ceil(box.y + box.height)) - y };
  }
  return rect;
}

export interface TextRaster {
  canvas: OffscreenCanvas;
  width: number;
  height: number;
  /** Raster px per content px (the asked scale, lowered to fit TEXT_RASTER_MAX). */
  scale: number;
  /** The content px the raster covers (`layout.raster`). */
  rect: Rect;
}

type Ctx = OffscreenCanvasRenderingContext2D;

/** The scale a raster of `rect` gets for `scale`: lowered so its long side stays within TEXT_RASTER_MAX. */
export function cappedScale(rect: Rect, scale: number): number {
  const long = Math.max(rect.width, rect.height);
  return long * scale > TEXT_RASTER_MAX ? TEXT_RASTER_MAX / long : scale;
}

/** A scratch canvas (the text of a stroked or shadowed raster), at least `width` x `height`, cleared. */
let scratch: OffscreenCanvas | null = null;
function scratchContext(width: number, height: number): Ctx | null {
  if (!scratch || scratch.width < width || scratch.height < height) scratch = new OffscreenCanvas(Math.max(width, scratch?.width ?? 0), Math.max(height, scratch?.height ?? 0));
  const ctx = scratch.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, scratch.width, scratch.height);
  return ctx;
}

interface Run {
  text: string;
  /** Left of the advance box and baseline, in canvas px. */
  x: number;
  y: number;
  /** A span's run: its own font (the clip style with the span's family, weight and italic), fill and decorations. */
  style?: TextStyle;
  fill?: TextStyle["fill"];
  span?: TextSpanStyle;
  /** The advance of the run, and the font's em box above and below the baseline, in canvas px. */
  width?: number;
  ascent?: number;
  descent?: number;
}

/** Sets the text state of `ctx` for `style` at `scale`. */
function applyFont(ctx: Ctx, style: TextStyle, scale: number): void {
  ctx.font = fontShorthand(style, style.fontSize * scale, textFallback());
  ctx.letterSpacing = `${style.letterSpacing * scale}px`;
  ctx.fontKerning = "normal";
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
}

/** The box a gradient fill spans, in canvas px. */
interface FillBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** `fill` as a canvas fill style over `box` (spec §21.7: the same geometry as the solid shader's). */
function fillStyleOf(ctx: Ctx, fill: TextStyle["fill"], box: FillBox): string | CanvasGradient {
  if (isGradientFill(fill)) {
    const w = Math.max(1, box.right - box.left);
    const h = Math.max(1, box.bottom - box.top);
    const cx = box.left + w / 2;
    const cy = box.top + h / 2;
    let gradient: CanvasGradient;
    if (fill.type === "radial") {
      const x = box.left + fill.center.x * w;
      const y = box.top + fill.center.y * h;
      gradient = ctx.createRadialGradient(x, y, 0, x, y, Math.max(0.01, fill.radius * 0.5 * Math.hypot(w, h)));
    } else {
      const a = (fill.angle * Math.PI) / 180;
      const dx = -Math.sin(a);
      const dy = Math.cos(a);
      const half = (Math.abs(dx) * w + Math.abs(dy) * h) / 2;
      gradient = ctx.createLinearGradient(cx - dx * half, cy - dy * half, cx + dx * half, cy + dy * half);
    }
    for (const stop of fill.stops) gradient.addColorStop(Math.min(1, Math.max(0, stop.at)), formatHexColor(stop.color));
    return gradient;
  }
  if (isTwoStop(fill)) {
    const gradient = ctx.createLinearGradient(0, box.top, 0, Math.max(box.top + 1, box.bottom));
    gradient.addColorStop(0, formatHexColor(fill.from));
    gradient.addColorStop(1, formatHexColor(fill.to));
    return gradient;
  }
  return formatHexColor(fill);
}

/** Draws `runs`: the stroke outside the glyphs, then the fill (`box`: the gradient's span in canvas px). */
function drawRuns(ctx: Ctx, runs: readonly Run[], style: TextStyle, scale: number, box: FillBox): void {
  const stroke = style.stroke;
  /** A span's run has its own font; the others keep the one set by the caller. */
  const font = (run: Run) => {
    if (run.style) applyFont(ctx, run.style, scale);
  };
  if (stroke.enabled && stroke.width > 0 && stroke.color.a > 0) {
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    ctx.lineWidth = 2 * stroke.width * scale;
    ctx.strokeStyle = formatHexColor(stroke.color);
    for (const run of runs) {
      font(run);
      ctx.strokeText(run.text, run.x, run.y);
    }
    // The inner half goes: the stroke lies outside the glyphs.
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = formatHexColor({ r: 0, g: 0, b: 0, a: 1 });
    for (const run of runs) {
      font(run);
      ctx.fillText(run.text, run.x, run.y);
    }
    ctx.globalCompositeOperation = "source-over";
  }
  const base = fillStyleOf(ctx, style.fill, box);
  for (const run of runs) {
    font(run);
    ctx.fillStyle = run.fill ? fillStyleOf(ctx, run.fill, box) : base;
    ctx.fillText(run.text, run.x, run.y);
    // Underline and strike are lines in the run's fill.
    const span = run.span;
    if (span && (span.underline || span.strike) && run.width !== undefined) {
      const lines = decorationBoxes(span, run.x, run.width, run.y, 0, 0, style.fontSize * scale);
      for (const rect of [lines.underline, lines.strike]) if (rect) ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    }
  }
}

/** Fills the highlight boxes behind the spans' runs. */
function drawHighlights(ctx: Ctx, runs: readonly Run[], style: TextStyle, scale: number): void {
  for (const run of runs) {
    const span = run.span;
    if (!span?.highlight || span.highlight.a <= 0 || run.width === undefined) continue;
    const box = decorationBoxes(span, run.x, run.width, run.y, run.ascent ?? 0, run.descent ?? 0, style.fontSize * scale).highlight;
    if (!box) continue;
    ctx.fillStyle = formatHexColor(span.highlight as RGBA);
    ctx.fillRect(box.x, box.y, box.width, box.height);
  }
}

/**
 * Draws text into `ctx` (whose own content is backgrounds or nothing): straight, or through the
 * scratch canvas when it has a stroke or a shadow (one shadow for fill and stroke together).
 */
function paintText(ctx: Ctx, width: number, height: number, style: TextStyle, scale: number, draw: (target: Ctx) => void): void {
  const shadow = style.shadow.enabled && style.shadow.color.a > 0 ? style.shadow : null;
  const stroked = style.stroke.enabled && style.stroke.width > 0;
  if (!shadow && !stroked) {
    draw(ctx);
    return;
  }
  const ink = scratchContext(width, height);
  if (!ink || !scratch) return;
  draw(ink);
  ctx.save();
  if (shadow) {
    ctx.shadowColor = formatHexColor(shadow.color);
    ctx.shadowBlur = shadow.blur * scale;
    ctx.shadowOffsetX = shadow.x * scale;
    ctx.shadowOffsetY = shadow.y * scale;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(scratch, 0, 0, width, height, 0, 0, width, height);
  ctx.restore();
}

/** The advance of `line`'s characters [from, to) at `scale`, run by run in each span's font (the base font when there are none). */
function rangeWidth(ctx: Ctx, layout: TextLayout, line: TextLine, style: TextStyle, scale: number, from: number, to: number): number {
  if (to <= from) return 0;
  let width = 0;
  for (const cut of pieces(layout.spans, line.start + from, line.start + to)) {
    applyFont(ctx, runStyle(style, cut.span), scale);
    width += ctx.measureText(line.text.slice(from + cut.from, from + cut.to)).width;
  }
  return width;
}

/** Where `line` starts at `scale` (canvas px, the raster's origin at content 0): aligned by its width measured at that size. */
function lineRunX(ctx: Ctx, layout: TextLayout, line: TextLine, style: TextStyle, scale: number): number {
  const width = Math.max(0, rangeWidth(ctx, layout, line, style, scale, 0, line.text.length) - style.letterSpacing * scale);
  const left = line.x * scale;
  return style.align === "left" ? left : style.align === "right" ? (line.x + line.width) * scale - width : (line.x + line.width / 2) * scale - width / 2;
}

/** The runs of `line`'s characters [from, to), whose first starts at canvas x `x`, baseline `y`: one, or one per span piece. */
function pieceRuns(ctx: Ctx, layout: TextLayout, line: TextLine, style: TextStyle, scale: number, from: number, to: number, x: number, y: number): Run[] {
  if (!layout.spans) return [{ text: line.text.slice(from, to), x, y }];
  const runs: Run[] = [];
  let at = x;
  for (const cut of pieces(layout.spans, line.start + from, line.start + to)) {
    const st = runStyle(style, cut.span);
    applyFont(ctx, st, scale);
    const text = line.text.slice(from + cut.from, from + cut.to);
    const m = ctx.measureText(text);
    const run: Run = { text, x: at, y, style: st, width: m.width, ascent: m.fontBoundingBoxAscent ?? st.fontSize * scale * 0.8, descent: m.fontBoundingBoxDescent ?? st.fontSize * scale * 0.2 };
    if (cut.span) {
      run.span = cut.span;
      if (cut.span.fill) run.fill = cut.span.fill;
    }
    runs.push(run);
    at += m.width;
  }
  return runs;
}

/** The runs of `layout`'s lines at `scale`, offset by (`ox`, `oy`) canvas px; each line aligned by its width measured at that size. */
function lineRuns(ctx: Ctx, layout: TextLayout, style: TextStyle, scale: number, ox: number, oy: number): Run[] {
  const runs: Run[] = [];
  for (const line of layout.lines) {
    if (line.text === "") continue;
    const left = lineRunX(ctx, layout, line, style, scale);
    runs.push(...pieceRuns(ctx, layout, line, style, scale, 0, line.text.length, left + ox, line.baseline * scale + oy));
  }
  applyFont(ctx, style, scale);
  return runs;
}

/** What a raster holds: everything, or the background boxes alone (drawn under the units of an animated text, spec §10.4). */
export type RasterPart = "all" | "backgrounds";

/** Whether `layout` in `style` draws background boxes. */
export function hasBackgrounds(layout: TextLayout, style: TextStyle): boolean {
  const bg = style.background;
  return bg.enabled && layout.backgrounds.length > 0 && (bg.color.a > 0 || boxBorder(bg) !== null || boxShadow(bg) !== null);
}

/** The box's border when it is drawn (enabled, a width and a visible color). */
export function boxBorder(bg: TextStyle["background"]): { width: number; color: TextStyle["background"]["color"] } | null {
  const stroke = bg.stroke;
  return stroke && stroke.enabled && stroke.width > 0 && stroke.color.a > 0 ? stroke : null;
}

/** The box's shadow when it is drawn. */
export function boxShadow(bg: TextStyle["background"]): { x: number; y: number; blur: number; color: TextStyle["background"]["color"] } | null {
  const shadow = bg.shadow;
  return shadow && shadow.enabled && shadow.color.a > 0 ? shadow : null;
}

/**
 * The background boxes (spec §21.7): the shadow outside them (hard when blur is 0, else a Gaussian of
 * sigma blur / 2), the fill, then the border inside their edge. One path, so boxes that overlap fill once.
 */
function drawBackgrounds(ctx: Ctx, layout: TextLayout, style: TextStyle, s: number, ox: number, oy: number): void {
  const bg = style.background;
  const path = new Path2D();
  for (const box of layout.backgrounds) {
    const w = box.width * s;
    const h = box.height * s;
    path.roundRect(box.x * s + ox, box.y * s + oy, w, h, Math.max(0, Math.min(bg.radius * s, w / 2, h / 2)));
  }
  const shadow = boxShadow(bg);
  if (shadow) {
    ctx.save();
    if (shadow.blur > 0) ctx.filter = `blur(${(shadow.blur * s) / 2}px)`;
    ctx.fillStyle = formatHexColor(shadow.color);
    ctx.translate(shadow.x * s, shadow.y * s);
    ctx.fill(path);
    ctx.restore();
    // The shadow stays outside the box, as a CSS box-shadow does.
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.fill(path);
    ctx.restore();
  }
  if (bg.color.a > 0) {
    ctx.fillStyle = formatHexColor(bg.color);
    ctx.fill(path);
  }
  const border = boxBorder(bg);
  if (border) {
    ctx.save();
    ctx.clip(path);
    ctx.lineWidth = 2 * border.width * s;
    ctx.lineJoin = "round";
    ctx.strokeStyle = formatHexColor(border.color);
    ctx.stroke(path);
    ctx.restore();
  }
}

/**
 * `layout` in `style` at `scale` px per content px (with a selection `highlight`), or null when nothing
 * is drawn. The `backgrounds` part covers the same rect as the whole raster (its quad is the same).
 */
export function rasterizeText(layout: TextLayout, style: TextStyle, scale: number, highlight?: TextHighlight | null, part: RasterPart = "all"): TextRaster | null {
  const rect = rasterRect(layout, highlight);
  if (!rect || typeof OffscreenCanvas === "undefined") return null;
  if (part === "backgrounds" && !hasBackgrounds(layout, style)) return null;
  const s = cappedScale(rect, scale);
  const width = Math.max(1, Math.ceil(rect.width * s));
  const height = Math.max(1, Math.ceil(rect.height * s));
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const ox = -rect.x * s;
  const oy = -rect.y * s;
  if (hasBackgrounds(layout, style)) drawBackgrounds(ctx, layout, style, s, ox, oy);
  if (part === "backgrounds") return { canvas, width, height, scale: s, rect };
  if (highlight && highlight.rects.length > 0) {
    ctx.fillStyle = highlight.color;
    for (const box of highlight.rects) ctx.fillRect(box.x * s + ox, box.y * s + oy, box.width * s, box.height * s);
  }
  if (layout.glyphs.length > 0) {
    const box: FillBox = { left: layout.block.x * s + ox, top: layout.block.y * s + oy, right: (layout.block.x + layout.block.width) * s + ox, bottom: (layout.block.y + layout.block.height) * s + oy };
    const runs = lineRuns(ctx, layout, style, s, ox, oy);
    if (layout.spans) drawHighlights(ctx, runs, style, s);
    paintText(ctx, width, height, style, s, (target) => {
      applyFont(target, style, s);
      drawRuns(target, runs, style, s, box);
    });
  }
  return { canvas, width, height, scale: s, rect };
}

export interface TextAtlas {
  canvas: OffscreenCanvas;
  width: number;
  height: number;
  scale: number;
  units: readonly (AtlasUnit & { cell: Rect })[];
}

/**
 * The per-unit atlas of `layout` (spec §10.1, §10.4): each character, word or line drawn on its own in
 * a packed cell, stroke, fill and shadow included, at `scale` (lowered so the atlas stays within
 * TEXT_RASTER_MAX). A unit is drawn where the layer raster draws it (its line aligned at that size, its
 * prefix measured at it), so a text at rest looks the same from either. Backgrounds have their own
 * raster (`rasterizeText` part `backgrounds`). Null when there is nothing to draw.
 */
export function buildTextAtlas(layout: TextLayout, style: TextStyle, scale: number, kind: AtlasUnitKind): TextAtlas | null {
  if (typeof OffscreenCanvas === "undefined") return null;
  const units = atlasUnits(layout, style, currentMeasurer(), kind);
  if (units.length === 0) return null;
  let s = scale;
  let packed = packShelves(units.map((unit) => ({ width: Math.ceil(unit.rect.width * s), height: Math.ceil(unit.rect.height * s) })), TEXT_RASTER_MAX);
  if (packed.height > TEXT_RASTER_MAX) {
    s *= Math.sqrt(TEXT_RASTER_MAX / packed.height) * 0.95;
    packed = packShelves(units.map((unit) => ({ width: Math.ceil(unit.rect.width * s), height: Math.ceil(unit.rect.height * s) })), TEXT_RASTER_MAX);
  }
  const canvas = new OffscreenCanvas(packed.width, Math.min(TEXT_RASTER_MAX, packed.height));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const blockLeft = layout.block.x * s;
  const blockRight = (layout.block.x + layout.block.width) * s;
  const top = layout.block.y * s;
  const bottom = (layout.block.y + layout.block.height) * s;
  const cells = units.map((unit, i) => {
    const at = packed.positions[i] as { x: number; y: number };
    return { ...unit, cell: { x: at.x, y: at.y, width: Math.ceil(unit.rect.width * s), height: Math.ceil(unit.rect.height * s) } };
  });
  applyFont(ctx, style, s);
  const starts = layout.lines.map((line) => (line.text === "" ? 0 : lineRunX(ctx, layout, line, style, s)));
  /** Each unit's runs where the layer raster draws them (its prefix measured run by run), moved into its cell. */
  const unitRuns = cells.map((unit) => {
    const line = layout.lines[unit.line];
    if (!line) return [];
    const x = (starts[unit.line] ?? unit.x * s) + rangeWidth(ctx, layout, line, style, s, 0, unit.offset);
    const dx = unit.cell.x - unit.rect.x * s;
    const dy = unit.cell.y - unit.rect.y * s;
    return pieceRuns(ctx, layout, line, style, s, unit.offset, unit.offset + unit.text.length, x + dx, unit.baseline * s + dy);
  });
  applyFont(ctx, style, s);
  if (layout.spans) for (const runs of unitRuns) drawHighlights(ctx, runs, style, s);
  paintText(ctx, canvas.width, canvas.height, style, s, (target) => {
    applyFont(target, style, s);
    cells.forEach((unit, i) => {
      const dx = unit.cell.x - unit.rect.x * s;
      const dy = unit.cell.y - unit.rect.y * s;
      target.save();
      target.beginPath();
      target.rect(unit.cell.x, unit.cell.y, unit.cell.width, unit.cell.height);
      target.clip();
      drawRuns(target, unitRuns[i] as Run[], style, s, { left: blockLeft + dx, top: top + dy, right: blockRight + dx, bottom: bottom + dy });
      target.restore();
    });
  });
  return { canvas, width: canvas.width, height: canvas.height, scale: s, units: cells };
}
