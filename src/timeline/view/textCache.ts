// Text measurement cache for the timeline canvases (spec §6.17): each string is measured once per
// font, and ellipsized names are remembered per available width. Both maps are capped; reaching the
// cap clears them (a zoom sweep over thousands of names must not grow memory without bound).

export interface Measurer {
  font: string;
  measureText(text: string): { width: number };
}

const ELLIPSIS = "…";

export class TextCache {
  private readonly widths = new Map<string, number>();
  private readonly fitted = new Map<string, string>();

  constructor(private readonly cap = 4096) {}

  /** Width of `text` in the context's current font. */
  width(ctx: Measurer, text: string): number {
    const key = `${ctx.font}\u0000${text}`;
    let width = this.widths.get(key);
    if (width === undefined) {
      if (this.widths.size >= this.cap) this.widths.clear();
      width = ctx.measureText(text).width;
      this.widths.set(key, width);
    }
    return width;
  }

  /** `text`, or its longest prefix + "…" that fits `maxWidth`; "" when not even "…" fits. */
  fit(ctx: Measurer, text: string, maxWidth: number): string {
    if (this.width(ctx, text) <= maxWidth) return text;
    const key = `${ctx.font}\u0000${Math.floor(maxWidth)}\u0000${text}`;
    const cached = this.fitted.get(key);
    if (cached !== undefined) return cached;
    let lo = 0;
    let hi = text.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1;
      if (this.width(ctx, text.slice(0, mid) + ELLIPSIS) <= maxWidth) lo = mid;
      else hi = mid - 1;
    }
    const result = lo > 0 ? text.slice(0, lo).trimEnd() + ELLIPSIS : this.width(ctx, ELLIPSIS) <= maxWidth ? ELLIPSIS : "";
    if (this.fitted.size >= this.cap) this.fitted.clear();
    this.fitted.set(key, result);
    return result;
  }

  clear(): void {
    this.widths.clear();
    this.fitted.clear();
  }
}
