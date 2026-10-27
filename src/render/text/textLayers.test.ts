// Text layers through the compositor, the preview's texture resolution, detail on zoom and canvas hit
// testing (spec §10.1, §7.1, §7.2), with the approximate measurer: 55 px per character at 100 px,
// lines 120 px tall (line height 1.2), ink 72 px up and 20 px down from a baseline 92.5 px into a line.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { makeProject, makeTextClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { Project, TextClip, TextStyle, Transform } from "../../core/document/types.js";
import { TexturePool } from "../../media/cache/TexturePool.js";
import { DEFAULT_TEXT_STYLE, textContent } from "../../text/style.js";
import { Compositor } from "../compositor/Compositor.js";
import type { TextCompositeLayer, TextureLayer } from "../compositor/drawList.js";
import type { TextureHandle } from "../gpu/renderer.js";
import { applyToPoint } from "../mat3.js";
import { canvasLayersAt, layersInRect, layersUnder } from "../preview/canvasLayers.js";
import { fullScale, sourceDetail } from "../preview/detail.js";
import { LayerTextures } from "../preview/LayerTextures.js";
import { approximateMeasurer, setTextMeasurer } from "./layoutCache.js";
import type { ResolvedText } from "./TextRasterCache.js";

beforeAll(() => setTextMeasurer(approximateMeasurer));
afterAll(() => setTextMeasurer(null));

const style = (patch: Partial<TextStyle> = {}): TextStyle => ({ ...structuredClone(DEFAULT_TEXT_STYLE), fontSize: 100, lineHeight: 1.2, ...patch });
const identity: Transform = { x: 0, y: 0, scale: 1, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false };

function project(clip: Partial<TextClip> = {}): Project {
  const p = makeProject();
  p.tracks = [makeTrack("v1"), makeTrack("v2"), makeTrack("a1", "audio")];
  return withClips(p, [{ ...makeTextClip({ id: "t", trackId: "v1", start: 0, duration: 30, value: "ab" }), style: style(), ...clip }]);
}

describe("text layers in the compositor (spec §10.1)", () => {
  it("evaluates a text clip into a layer whose model maps its box onto the frame", () => {
    const layer = new Compositor().evaluate(project({ transform: { ...identity, x: 10, scale: 2 } }), 5).layers[0] as TextCompositeLayer;
    expect(layer.kind).toBe("text");
    expect(layer.clipId).toBe("t");
    expect(layer.scale).toBe(2);
    // The 110 x 120 box, centered on (540 + 10, 960), twice as big.
    expect(applyToPoint(layer.model, 0, 0)).toEqual({ x: 550 - 110, y: 960 - 120 });
    expect(applyToPoint(layer.model, 110, 120)).toEqual({ x: 550 + 110, y: 960 + 120 });
    // Raster px per project px it can show: the 4x cap over its own scale.
    expect(layer.detail).toBe(2);
  });

  it("mirrors the text inside its box for flips, fades it and uses a scrub's live text", () => {
    const doc = project({ transform: { ...identity, flipH: true }, fades: { in: 10, out: 0 } });
    const compositor = new Compositor();
    const layer = compositor.evaluate(doc, 5).layers[0] as TextCompositeLayer;
    expect(applyToPoint(layer.model, 0, 0)).toEqual({ x: 540 + 55, y: 900 });
    expect(layer.opacity).toBeCloseTo(0.5);
    const live = new Map([["t", { text: textContent("abcd"), style: style({ fontSize: 50 }) }]]);
    const shown = compositor.evaluate(doc, 5, null, null, null, live).layers[0] as TextCompositeLayer;
    expect(shown.text.value).toBe("abcd");
    expect(shown.style.fontSize).toBe(50);
    expect(shown.highlight).toBeNull();
  });

  it("carries an inline edit's selection highlight to the layer (spec §7.7)", () => {
    const highlight = { rects: [{ x: 0, y: 0, width: 55, height: 120 }], color: "gold" };
    const live = new Map([["t", { text: textContent("ab"), style: style(), highlight }]]);
    const layer = new Compositor().evaluate(project(), 5, null, null, null, live).layers[0] as TextCompositeLayer;
    expect(layer.highlight).toBe(highlight);
  });

  it("draws nothing for an empty text", () => {
    expect(new Compositor().evaluate(project({ text: textContent("") }), 5).layers).toEqual([]);
  });

  it("raises the source detail so a zoom re-rasterizes text (spec §7.1)", () => {
    const composite = new Compositor().evaluate(project(), 5);
    const detail = sourceDetail(composite, () => null);
    expect(detail).toBe(4);
    expect(fullScale(4, detail)).toBe(4);
    expect(fullScale(8, detail)).toBe(4);
  });
});

describe("text layers in the preview's textures", () => {
  function setup() {
    const texture: TextureHandle = { width: 64, height: 32, mipLevels: 1, bytes: 1, valid: true, destroy: () => undefined };
    const resolved: ResolvedText = { texture, crop: { u0: 0, v0: 0, u1: 0.5, v1: 1 }, rect: { x: -1, y: 19, width: 112, height: 95 } };
    const text = { begin: vi.fn(), end: vi.fn(), resolve: vi.fn(() => resolved), exact: vi.fn(async () => ({ ...resolved, release: () => undefined })) };
    const pool = new TexturePool();
    const textures = new LayerTextures({
      frames: { info: () => null, video: () => new Promise(() => undefined), getFrame: () => new Promise(() => undefined), prefetch: async () => 0, lodFor: () => "full" },
      images: { get: () => null, load: async () => null },
      pool,
      onChange: () => undefined,
      text,
    });
    return { textures, text, resolved };
  }

  it("asks the raster cache at the render scale times the layer's scale, and draws it over the raster's rect", () => {
    const { textures, text, resolved } = setup();
    const composite = new Compositor().evaluate(project({ transform: { ...identity, scale: 2 } }), 5);
    const list = textures.resolve(composite, "idle", 0, 0.5);
    expect(text.begin).toHaveBeenCalledTimes(1);
    expect(text.end).toHaveBeenCalledTimes(1);
    expect(text.resolve).toHaveBeenCalledWith("t", expect.objectContaining({ value: "ab" }), expect.objectContaining({ fontSize: 100 }), 1, null);
    const layer = list.layers[0] as TextureLayer;
    expect(layer.texture).toBe(resolved.texture);
    expect(layer.crop).toEqual(resolved.crop);
    // The unit quad onto the raster rect (-1, 19, 112 x 95) in content px, then the model (x2 around the center).
    expect(applyToPoint(layer.transform, 0, 0)).toEqual({ x: 540 - 110 - 2, y: 960 - 120 + 38 });
    expect(applyToPoint(layer.transform, 1, 1)).toEqual({ x: 540 - 110 + 222, y: 960 - 120 + 228 });
    expect(textures.stats.texts).toBe(1);
  });

  it("gives Export frame an exact raster at the layer's scale", async () => {
    const { textures, text } = setup();
    const composite = new Compositor().evaluate(project({ transform: { ...identity, scale: 3 } }), 5);
    const { list, release } = await textures.resolveExact(composite, 4096);
    expect(text.exact).toHaveBeenCalledWith(expect.objectContaining({ value: "ab" }), expect.anything(), 3);
    expect(list.layers).toHaveLength(1);
    release();
  });
});

describe("text hit testing on the canvas (spec §7.2)", () => {
  it("selects on the glyph bounds padded by 4 px, not on the empty corners of the box", () => {
    // Box 110 x 120 at (485, 900); ink 0..110 x 20.5..112.5 -> project y 920.5..1012.5, padded 916.5..1016.5.
    const layers = canvasLayersAt(project(), 5);
    expect(layers[0]?.quad[0]).toEqual({ x: 485, y: 900 });
    expect(layersUnder(layers, 490, 905)).toEqual([]);
    expect(layersUnder(layers, 590, 1018)).toEqual([]);
    expect(layersUnder(layers, 490, 918).map((layer) => layer.clipId)).toEqual(["t"]);
    expect(layersUnder(layers, 540, 960).map((layer) => layer.clipId)).toEqual(["t"]);
    // A marquee over the empty top band only does not take it.
    expect(layersInRect(layers, { x0: 480, y0: 895, x1: 600, y1: 910 })).toEqual([]);
    expect(layersInRect(layers, { x0: 480, y0: 895, x1: 600, y1: 930 })).toHaveLength(1);
  });

  it("selects on the background box when it has one, and follows flips and scale", () => {
    const withBox = canvasLayersAt(project({ style: style({ background: { ...DEFAULT_TEXT_STYLE.background, enabled: true, paddingX: 10, paddingY: 10 } }) }), 5);
    // Box 130 x 140 at (475, 890): the padding is on the background.
    expect(layersUnder(withBox, 478, 893).map((layer) => layer.clipId)).toEqual(["t"]);
    const scaled = canvasLayersAt(project({ transform: { ...identity, scale: 0.5 } }), 5);
    // Box 55 x 60 at (512.5, 930); ink from y 940.25; the pad stays 4 project px.
    expect(layersUnder(scaled, 515, 937).map((layer) => layer.clipId)).toEqual(["t"]);
    expect(layersUnder(scaled, 515, 935)).toEqual([]);
  });

  it("uses a scrub's live text for the box and the glyphs", () => {
    const live = new Map([["t", { text: textContent("ab\nab"), style: style() }]]);
    const layers = canvasLayersAt(project(), 5, null, null, live);
    // Two lines: 110 x 240 at (485, 840).
    expect(layers[0]?.quad[0]).toEqual({ x: 485, y: 840 });
    expect(layersUnder(layers, 490, 1060).map((layer) => layer.clipId)).toEqual(["t"]);
  });
});
