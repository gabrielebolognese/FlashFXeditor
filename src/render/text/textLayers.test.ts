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
import { atlasUnits, type AtlasUnitKind } from "./atlas.js";
import { approximateMeasurer, setTextMeasurer, textLayout } from "./layoutCache.js";
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
    const resolved: ResolvedText = { texture, crop: { u0: 0, v0: 0, u1: 0.5, v1: 1 }, rect: { x: -1, y: 19, width: 112, height: 95 }, scale: 1, units: null };
    const text = {
      begin: vi.fn(),
      end: vi.fn(),
      resolve: vi.fn(() => resolved),
      exact: vi.fn(async () => ({ ...resolved, release: () => undefined })),
      resolveAtlas: vi.fn(() => null),
      resolveBackground: vi.fn(() => null),
      warm: vi.fn(() => false),
    };
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

describe("animated text layers (spec §10.4, Batch 31)", () => {
  const texture: TextureHandle = { width: 256, height: 128, mipLevels: 1, bytes: 1, valid: true, destroy: () => undefined };
  const raster: ResolvedText = { texture, crop: { u0: 0, v0: 0, u1: 0.5, v1: 1 }, rect: { x: -1, y: 19, width: 112, height: 95 }, scale: 1, units: null };

  /** An atlas of `value`'s units as the compositor cuts them, one 0.25-wide cell each, at `scale` texture px per content px. */
  function atlasOf(value: string, kind: AtlasUnitKind, s = style(), scale = 1): ResolvedText {
    const units = atlasUnits(textLayout(textContent(value), s), s, approximateMeasurer, kind);
    return { texture, crop: { u0: 0, v0: 0, u1: 1, v1: 1 }, rect: raster.rect, scale, units: units.map((unit, i) => ({ rect: unit.rect, crop: { u0: i * 0.25, v0: 0, u1: (i + 1) * 0.25, v1: 1 } })) };
  }

  function setup(atlas: ResolvedText | null = null, boxes: ResolvedText | null = null) {
    const text = {
      begin: vi.fn(),
      end: vi.fn(),
      resolve: vi.fn(() => raster),
      exact: vi.fn(async (_t: unknown, _s: unknown, _k: unknown, part = "all") => ({ ...(part === "all" ? raster : part === "backgrounds" ? (boxes ?? raster) : (atlas ?? raster)), release: () => undefined })),
      resolveAtlas: vi.fn(() => atlas),
      resolveBackground: vi.fn(() => boxes),
      warm: vi.fn(() => true),
    };
    const onChange = vi.fn();
    const textures = new LayerTextures({
      frames: { info: () => null, video: () => new Promise(() => undefined), getFrame: () => new Promise(() => undefined), prefetch: async () => 0, lodFor: () => "full" },
      images: { get: () => null, load: async () => null },
      pool: new TexturePool(),
      onChange,
      text,
    });
    return { textures, text, onChange };
  }

  const animated = (value: string, patch: Partial<TextClip>) => project({ text: textContent(value), ...patch });

  it("evaluates the animation at the frame: units in, at rest, a whole-text out, none while edited inline", () => {
    const p = animated("ab cd", { animIn: { id: "wordPop", duration: 10 }, animOut: { id: "fade", duration: 10 } });
    const compositor = new Compositor();
    const at = (frame: number, live: Map<string, { text: ReturnType<typeof textContent>; style: TextStyle; editing?: boolean }> | null = null) =>
      (compositor.evaluate(p, frame, null, null, null, live).layers[0] as TextCompositeLayer).anim;
    const first = at(0);
    expect(first?.atlas).toBe("word");
    expect(first?.units.map((unit) => unit.opacity)).toEqual([0, 0]);
    expect(at(10)).toBeNull();
    expect(at(25)).toMatchObject({ atlas: "block", units: [{ opacity: expect.closeTo(1 - (0.6 ** 3), 6) }] });
    expect(at(29)?.units[0]?.opacity).toBe(0);
    const clip = p.clips.t as TextClip;
    expect(at(0, new Map([["t", { text: clip.text, style: clip.style, editing: true }]]))).toBeNull();
    // Live animations (a field scrub) replace the clip's.
    const live = compositor.evaluate(p, 12, null, null, null, null, new Map([["t", { animIn: { id: "fade", duration: 14 } }]])).layers[0] as TextCompositeLayer;
    expect(live.anim?.atlas).toBe("block");
  });

  it("moves the layer raster for a whole-text animation: slide offset, opacity and blur in texture px", () => {
    const { textures } = setup();
    const slide = new Compositor().evaluate(animated("ab", { animIn: { id: "slideUp", duration: 10, ease: "linear" } }), 5);
    const [layer] = textures.resolve(slide, "idle").layers as TextureLayer[];
    // Half way: 0.5 x 0.6 x 100 px below its place, half opaque.
    expect(applyToPoint(layer?.transform as TextureLayer["transform"], 0, 0)).toEqual({ x: 484, y: 949 });
    expect(layer?.opacity).toBeCloseTo(0.5);
    const blur = new Compositor().evaluate(animated("ab", { animIn: { id: "blurIn", duration: 10, ease: "linear" } }), 5);
    expect((textures.resolve(blur, "idle").layers[0] as TextureLayer).blur).toBeCloseTo(10);
    // Frame 0 of a fade: nothing drawn, the raster still asked for (kept).
    const hidden = new Compositor().evaluate(animated("ab", { animIn: { id: "fade", duration: 10 } }), 0);
    expect(textures.resolve(hidden, "idle").layers).toEqual([]);
  });

  it("draws one quad per unit from the atlas, over the background boxes at the leading unit's opacity", () => {
    const boxes: ResolvedText = { ...raster, texture: { ...texture } };
    const atlas = atlasOf("ab cd", "word");
    const { textures, text } = setup(atlas, boxes);
    const s = style({ background: { ...DEFAULT_TEXT_STYLE.background, enabled: true } });
    // Word fade, 10 frames, 5 apart: the first word is 0.4 in at frame 2, the second not yet.
    const composite = new Compositor().evaluate(animated("ab cd", { style: s, animIn: { id: "wordFade", duration: 10, stagger: 5, ease: "linear" } }), 2);
    const layers = textures.resolve(composite, "idle").layers as TextureLayer[];
    expect(text.resolveAtlas).toHaveBeenCalledWith("t", expect.anything(), s, 1, "word");
    expect(layers).toHaveLength(2);
    expect(layers[0]?.texture).toBe(boxes.texture);
    expect(layers[0]?.opacity).toBeCloseTo(0.4);
    expect(layers[1]?.crop).toEqual(atlas.units?.[0]?.crop);
    expect(layers[1]?.opacity).toBeCloseTo(0.4);
    expect(textures.stats.texts).toBe(1);
  });

  it("scales a popping unit about its middle", () => {
    const atlas = atlasOf("ab", "word");
    const { textures } = setup(atlas);
    const composite = new Compositor().evaluate(animated("ab", { animIn: { id: "wordPop", duration: 10 } }), 7);
    const state = (composite.layers[0] as TextCompositeLayer).anim?.units[0];
    const [layer] = textures.resolve(composite, "idle").layers as TextureLayer[];
    // The middle of the ink (55, baseline - 26) stays where it was: content (0, 0) is project (485, 900).
    const middle = { x: 485 + (state?.ox as number), y: 900 + (state?.oy as number) };
    const rect = atlas.units?.[0]?.rect as { x: number; y: number; width: number; height: number };
    const u = ((state?.ox as number) - rect.x) / rect.width;
    const v = ((state?.oy as number) - rect.y) / rect.height;
    const at = applyToPoint(layer?.transform as TextureLayer["transform"], u, v);
    expect(at.x).toBeCloseTo(middle.x);
    expect(at.y).toBeCloseTo(middle.y);
    expect(state?.scale).not.toBe(1);
  });

  it("cuts a typewriter's lines at the last typed character, and reveals a line through its place", () => {
    const lines = atlasOf("ab\ncd", "line");
    const { textures } = setup(lines);
    // 4 characters in 8 frames: one typed at frame 3 (line 0 cut after "a", line 1 hidden).
    const typing = new Compositor().evaluate(animated("ab\ncd", { animIn: { id: "typewriter", duration: 8 } }), 3);
    const typed = textures.resolve(typing, "idle").layers as TextureLayer[];
    expect(typed).toHaveLength(1);
    const cell = lines.units?.[0] as { rect: { x: number; width: number }; crop: { u0: number; u1: number } };
    expect(typed[0]?.crop.u1).toBeCloseTo(cell.crop.u0 + ((cell.crop.u1 - cell.crop.u0) * (55 - cell.rect.x)) / cell.rect.width);
    const reveal = atlasOf("ab", "line");
    const second = setup(reveal);
    // Line reveal, linear, half way: the line half under its place; the top half of it shows in the bottom half of its place.
    const composite = new Compositor().evaluate(animated("ab", { animIn: { id: "lineReveal", duration: 10, ease: "linear" } }), 5);
    const [layer] = second.textures.resolve(composite, "idle").layers as TextureLayer[];
    const rect = reveal.units?.[0]?.rect as { x: number; y: number; width: number; height: number };
    expect(layer?.crop.v1).toBeCloseTo(0.5);
    expect(applyToPoint(layer?.transform as TextureLayer["transform"], 0, 0).y).toBeCloseTo(900 + rect.y + rect.height / 2);
    expect(applyToPoint(layer?.transform as TextureLayer["transform"], 0, 1).y).toBeCloseTo(900 + rect.y + rect.height);
  });

  it("lists the text clips about to show with their parts, and rasterizes them ahead (one per pass while playing)", () => {
    const p = animated("ab cd", { start: 40, animIn: { id: "wordPop", duration: 10 }, animOut: { id: "typewriter", duration: 10 }, style: style({ background: { ...DEFAULT_TEXT_STYLE.background, enabled: true } }) });
    const compositor = new Compositor();
    expect(compositor.upcomingTexts(p, 0, 30)).toEqual([]);
    const upcoming = compositor.upcomingTexts(p, 20, 30);
    expect(upcoming.map((item) => [item.clipId, item.parts])).toEqual([["t", ["all", "word", "line", "backgrounds"]]]);
    const { textures, text, onChange } = setup();
    textures.resolve(compositor.evaluate(p, 20), "idle", 0, 1, upcoming);
    expect(text.warm).toHaveBeenCalledTimes(4);
    text.warm.mockClear();
    textures.resolve(compositor.evaluate(p, 20), "playback", 0, 1, upcoming);
    expect(text.warm).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalled();
  });

  it("gives Export frame the animated units at their exact scale", async () => {
    const atlas = atlasOf("ab cd", "word");
    const { textures, text } = setup(atlas);
    const composite = new Compositor().evaluate(animated("ab cd", { animIn: { id: "wordFade", duration: 10, stagger: 5, ease: "linear" } }), 7);
    const { list, release } = await textures.resolveExact(composite, 4096);
    expect(text.exact).toHaveBeenCalledWith(expect.anything(), expect.anything(), 1, "word");
    expect(list.layers.map((layer) => layer.opacity)).toEqual([1, expect.closeTo(0.4, 6)]);
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
