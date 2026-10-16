import { describe, expect, it } from "vitest";
import type { TextContent, TextStyle } from "../../core/document/types.js";
import { DEFAULT_TEXT_STYLE, textContent } from "../../text/style.js";
import type { TextureHandle } from "../gpu/renderer.js";
import type { TextLayout } from "./layout.js";
import type { TextRaster } from "./raster.js";
import { TextRasterCache, textScaleBucket } from "./TextRasterCache.js";

interface FakeTexture extends TextureHandle {
  destroyed: boolean;
  lost: boolean;
}

function setup(options: { budget?: number } = {}) {
  const uploads: FakeTexture[] = [];
  const rasters: { text: string; size: number; scale: number }[] = [];
  let ready = true;
  const loads: string[] = [];
  const cache = new TextRasterCache({
    upload(canvas) {
      const { width, height } = canvas as unknown as { width: number; height: number };
      const texture: FakeTexture = {
        width,
        height,
        mipLevels: 1,
        bytes: width * height * 4,
        destroyed: false,
        lost: false,
        get valid() {
          return !this.destroyed && !this.lost;
        },
        destroy() {
          this.destroyed = true;
        },
      };
      uploads.push(texture);
      return texture;
    },
    fontsReady: () => ready,
    loadFonts: async (_style, text) => {
      loads.push(text);
      ready = true;
    },
    // A layout whose raster is 100 x 50 content px per line of text (empty text: nothing drawn).
    layout: (content: TextContent, style: TextStyle) => ({ raster: content.value === "" ? null : { x: -2, y: -1, width: 100, height: 50 }, family: style.fontFamily }) as unknown as TextLayout,
    rasterize(layout, style, scale): TextRaster {
      rasters.push({ text: "", size: style.fontSize, scale });
      const rect = layout.raster as NonNullable<TextLayout["raster"]>;
      return { canvas: { width: Math.ceil(rect.width * scale), height: Math.ceil(rect.height * scale) } as OffscreenCanvas, width: 0, height: 0, scale, rect };
    },
    ...(options.budget !== undefined && { budget: options.budget }),
  });
  return {
    cache,
    uploads,
    rasters,
    loads,
    setReady: (value: boolean) => {
      ready = value;
    },
  };
}

const style = (patch: Partial<TextStyle> = {}): TextStyle => ({ ...structuredClone(DEFAULT_TEXT_STYLE), ...patch });

/** One preview pass drawing `layers` (clip id, content, style, scale). */
function pass(cache: TextRasterCache, layers: [string, TextContent, TextStyle, number][]) {
  cache.begin();
  const out = layers.map(([id, text, s, scale]) => cache.resolve(id, text, s, scale));
  cache.end();
  return out;
}

describe("textScaleBucket", () => {
  it("clamps to 0.25..4 and rounds up to 2^(1/8) steps", () => {
    expect(textScaleBucket(1)).toBe(1);
    expect(textScaleBucket(2)).toBe(2);
    expect(textScaleBucket(9)).toBe(4);
    expect(textScaleBucket(0.05)).toBe(0.25);
    expect(textScaleBucket(1.05)).toBeCloseTo(2 ** (1 / 8));
    expect(textScaleBucket(0.3)).toBe(textScaleBucket(0.31));
    expect(textScaleBucket(0.35)).toBeGreaterThan(textScaleBucket(0.31));
    expect(textScaleBucket(0.3)).toBeGreaterThanOrEqual(0.3);
  });
});

describe("TextRasterCache", () => {
  it("rasterizes a text once and reuses it while nothing changes", () => {
    const { cache, rasters } = setup();
    const text = textContent("Title");
    const s = style();
    const [first] = pass(cache, [["a", text, s, 1]]);
    const [second] = pass(cache, [["a", text, s, 1]]);
    expect(rasters).toHaveLength(1);
    expect(second).toBe(first);
    expect(cache.stats.rasterizations).toBe(1);
    expect(cache.stats.lastRasterized).toEqual([]);
    // The crop is the part of the (rounded up) texture the raster rect covers.
    expect(first?.rect).toEqual({ x: -2, y: -1, width: 100, height: 50 });
    expect(first?.crop).toEqual({ u0: 0, v0: 0, u1: 1, v1: 1 });
  });

  it("re-rasterizes only the clip whose style changed (P11)", () => {
    const { cache, rasters } = setup();
    const a = textContent("A");
    const b = textContent("B");
    const s = style();
    pass(cache, [
      ["a", a, s, 1],
      ["b", b, style({ fontWeight: 400 }), 1],
    ]);
    expect(cache.stats.lastRasterized).toEqual(["a", "b"]);
    pass(cache, [
      ["a", a, style({ fontSize: 120 }), 1],
      ["b", b, style({ fontWeight: 400 }), 1],
    ]);
    // b's style is a new object with equal values: its raster is found by key.
    expect(cache.stats.lastRasterized).toEqual(["a"]);
    expect(rasters.map((r) => r.size)).toEqual([96, 96, 120]);
    expect(cache.stats.rasterizations).toBe(3);
  });

  it("shares one raster between clips with equal text and style", () => {
    const { cache, rasters } = setup();
    const [one, two] = pass(cache, [
      ["a", textContent("Same"), style(), 1],
      ["b", textContent("Same"), style(), 1],
    ]);
    expect(one).toBe(two);
    expect(rasters).toHaveLength(1);
  });

  it("rasterizes again per scale bucket, not per scale", () => {
    const { cache, rasters } = setup();
    const text = textContent("Zoom");
    const s = style();
    pass(cache, [["a", text, s, 0.3]]);
    pass(cache, [["a", text, s, 0.31]]);
    expect(rasters).toHaveLength(1);
    pass(cache, [["a", text, s, 4]]);
    expect(rasters.map((r) => r.scale)).toEqual([textScaleBucket(0.3), 4]);
    // Back to Fit: the earlier raster is still cached.
    pass(cache, [["a", text, s, 0.3]]);
    expect(rasters).toHaveLength(2);
  });

  it("holds the previous raster while a new font loads, and draws nothing before the first", () => {
    const { cache, rasters, setReady } = setup();
    const text = textContent("Hi");
    setReady(false);
    expect(pass(cache, [["a", text, style(), 1]])).toEqual([null]);
    expect(cache.stats.waiting).toBe(1);
    setReady(true);
    const [first] = pass(cache, [["a", text, style(), 1]]);
    expect(first).not.toBeNull();
    setReady(false);
    const [held] = pass(cache, [["a", text, style({ fontFamily: "Oswald" }), 1]]);
    expect(held).toBe(first);
    setReady(true);
    const [next] = pass(cache, [["a", text, style({ fontFamily: "Oswald" }), 1]]);
    expect(next).not.toBe(first);
    expect(rasters).toHaveLength(2);
  });

  it("draws nothing for an empty text", () => {
    const { cache, rasters } = setup();
    expect(pass(cache, [["a", textContent(""), style(), 1]])).toEqual([null]);
    expect(rasters).toHaveLength(0);
  });

  it("evicts unused rasters least recently used first once over budget, never what is drawn", () => {
    // Each raster is 100 x 50 x 4 = 20 000 bytes at scale 1.
    const { cache, uploads } = setup({ budget: 50_000 });
    const s = style();
    pass(cache, [["a", textContent("1"), s, 1]]);
    pass(cache, [["b", textContent("2"), s, 1]]);
    pass(cache, [["c", textContent("3"), s, 1]]);
    // Three rasters (60 000 bytes): "1" (unused for two passes) goes.
    expect(cache.stats.bytes).toBe(40_000);
    expect(uploads.map((u) => u.destroyed)).toEqual([true, false, false]);
    pass(cache, [
      ["c", textContent("3"), s, 1],
      ["d", textContent("4"), s, 1],
      ["e", textContent("5"), s, 1],
    ]);
    // c, d and e are drawn: kept even over budget; "2" goes.
    expect(uploads.map((u) => u.destroyed)).toEqual([true, true, false, false, false]);
  });

  it("rasterizes again after a lost device, and after its family's fonts changed", () => {
    const { cache, uploads, rasters } = setup();
    const text = textContent("Hi");
    const s = style();
    pass(cache, [["a", text, s, 1]]);
    (uploads[0] as FakeTexture).lost = true;
    pass(cache, [["a", text, s, 1]]);
    expect(rasters).toHaveLength(2);
    cache.dropFamily("Oswald");
    pass(cache, [["a", text, s, 1]]);
    expect(rasters).toHaveLength(2);
    cache.dropFamily("Inter");
    pass(cache, [["a", text, s, 1]]);
    expect(rasters).toHaveLength(3);
    expect(uploads[1]?.destroyed).toBe(true);
  });

  it("gives Export frame its own raster at the exact scale after the fonts load", async () => {
    const { cache, rasters, loads, setReady } = setup();
    setReady(false);
    const exact = await cache.exact(textContent("Out"), style(), 1.3);
    expect(loads).toEqual(["Out"]);
    expect(rasters.map((r) => r.scale)).toEqual([1.3]);
    expect(cache.stats.rasters).toBe(0);
    exact?.release();
    expect(exact?.texture.valid).toBe(false);
  });
});
