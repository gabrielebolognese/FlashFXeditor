// The design system's floating shadows (`--shadow-overlay`) for canvas-drawn floating chips (the drag
// tooltips), where CSS box-shadow does not apply.

/** One `box-shadow` layer in CSS px. */
export interface ShadowLayer {
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: string;
}

/** Splits on commas outside parentheses (`rgba(0, 0, 0, 0.5)` stays whole). */
function splitLayers(text: string): string[] {
  const layers: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    else if (char === "," && depth === 0) {
      layers.push(text.slice(start, i));
      start = i + 1;
    }
  }
  layers.push(text.slice(start));
  return layers.map((layer) => layer.trim()).filter((layer) => layer !== "");
}

/**
 * Parses a `box-shadow` value into its outer layers, first (topmost) first. Inset layers are skipped
 * (a canvas casts outer shadows only); a layer that does not parse is dropped.
 */
export function parseShadow(text: string): ShadowLayer[] {
  const layers: ShadowLayer[] = [];
  for (const layer of splitLayers(text)) {
    if (/\binset\b/.test(layer)) continue;
    const color = /(rgba?|hsla?)\([^)]*\)|#[0-9a-fA-F]{3,8}\b/.exec(layer)?.[0];
    if (!color) continue;
    const lengths = layer
      .replace(color, " ")
      .trim()
      .split(/\s+/)
      .map((part) => Number.parseFloat(part));
    if (lengths.length < 2 || lengths.length > 4 || !lengths.every(Number.isFinite)) continue;
    const [x, y, blur = 0, spread = 0] = lengths as [number, number, number?, number?];
    layers.push({ x, y, blur, spread, color });
  }
  return layers;
}

/**
 * Casts `layers` under a rounded rectangle (CSS px, the context scaled by `dpr`): each layer fills the
 * rectangle grown by its spread with its shadow on, bottom layer first. The caller draws the opaque
 * chip over it. Shadow offsets and blur are device pixels on a canvas, so they are scaled by `dpr`.
 */
export function castShadow(ctx: CanvasRenderingContext2D, layers: readonly ShadowLayer[], dpr: number, x: number, y: number, width: number, height: number, radius: number, fill: string): void {
  ctx.save();
  ctx.fillStyle = fill;
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i]!;
    const w = width + 2 * layer.spread;
    const h = height + 2 * layer.spread;
    if (w <= 0 || h <= 0) continue;
    ctx.shadowColor = layer.color;
    ctx.shadowOffsetX = layer.x * dpr;
    ctx.shadowOffsetY = layer.y * dpr;
    ctx.shadowBlur = layer.blur * dpr;
    ctx.beginPath();
    ctx.roundRect(x - layer.spread, y - layer.spread, w, h, Math.max(0, Math.min(radius + layer.spread, w / 2, h / 2)));
    ctx.fill();
  }
  ctx.restore();
}
