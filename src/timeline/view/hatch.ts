// Diagonal hatching for the timeline canvases (locked rows, overwrites, disabled clips, a transition's
// repeated frames).

/**
 * Diagonal lines over [left, right) x [y, y + height), `gap` apart on a fixed grid (by x, so the
 * pattern never crawls while what it covers moves), 1 device px wide.
 */
export function drawDiagonalHatch(ctx: CanvasRenderingContext2D, dpr: number, left: number, right: number, y: number, height: number, color: string, gap: number): void {
  if (right <= left || height <= 0) return;
  const step = Math.max(gap, 1);
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, y, right - left, height);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1 / dpr;
  ctx.beginPath();
  for (let x = Math.floor((left - height) / step) * step; x < right; x += step) {
    ctx.moveTo(x, y + height);
    ctx.lineTo(x + height, y);
  }
  ctx.stroke();
  ctx.restore();
}
