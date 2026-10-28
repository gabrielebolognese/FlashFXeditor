import { describe, expect, it } from "vitest";
import { TexturePool } from "../../media/cache/TexturePool.js";
import { DEFAULT_TEXT_STYLE, textContent } from "../../text/style.js";
import type { RGBA, TextStyle } from "../../core/document/types.js";
import type { CaptionHighlightFrame, Composite, SolidLayer, TextCompositeLayer } from "../compositor/drawList.js";
import type { TextureHandle } from "../gpu/renderer.js";
import { IDENTITY } from "../mat3.js";
import { LayerTextures } from "./LayerTextures.js";

const RED: RGBA = { r: 1, g: 0, b: 0, a: 1 };
const WHITE: RGBA = { r: 1, g: 1, b: 1, a: 1 };
const BLACK: RGBA = { r: 0, g: 0, b: 0, a: 1 };

const handle = (): TextureHandle & { destroyed: boolean } => {
  const value = { width: 64, height: 16, valid: true, destroyed: false, destroy: () => void (value.destroyed = true) };
  return value as unknown as TextureHandle & { destroyed: boolean };
};

/** A text cache whose word atlas has one unit per word. */
function textStub(words: number) {
  const atlas = () => ({
    texture: handle(),
    crop: { u0: 0, v0: 0, u1: 1, v1: 1 },
    rect: { x: 0, y: 0, width: 64, height: 16 },
    scale: 1,
    units: Array.from({ length: words }, (_, i) => ({ crop: { u0: i / words, v0: 0, u1: (i + 1) / words, v1: 1 }, rect: { x: i * 20, y: 0, width: 16, height: 16 } })),
  });
  return {
    begin: () => undefined,
    end: () => undefined,
    resolve: () => null,
    exact: async () => ({ ...atlas(), release: () => undefined }),
    resolveAtlas: () => atlas(),
    resolveBackground: () => null,
    warm: () => false,
  };
}

const box = { color: WHITE, paddingX: 10, paddingY: 5, radius: 6, mode: "word" as const, enabled: true, stroke: { enabled: true, width: 4, color: BLACK }, shadow: { enabled: true, x: 3, y: 3, blur: 0, color: BLACK } };
const style: TextStyle = { ...DEFAULT_TEXT_STYLE, background: box };

function layer(): TextCompositeLayer {
  const rects = [0, 1, 2].map((i) => ({ x: i * 40, y: 0, width: 36, height: 20 }));
  const karaoke: CaptionHighlightFrame = {
    style,
    slot: "#hl",
    from: 1,
    to: 2,
    scale: 1,
    ox: 0,
    oy: 0,
    box: null,
    paints: null,
    unitPaint: [],
    wordBoxes: { rects, shown: [0, 1], active: 1, activeColor: RED, style: box },
  };
  return { kind: "text", trackId: "t", clipId: "c", model: [...IDENTITY] as TextCompositeLayer["model"], opacity: 0.5, text: textContent("a b c"), style, scale: 1, detail: 1, highlight: null, anim: null, karaoke };
}

function setup() {
  const pool = new TexturePool();
  const frames = {} as never;
  const images = {} as never;
  const textures = new LayerTextures({ frames, images, pool, onChange: () => undefined, text: textStub(3) });
  const composite: Composite = { width: 1080, height: 1920, background: BLACK, layers: [layer()] };
  return { textures, composite };
}

const solids = (layers: readonly { kind: string }[]) => layers.filter((l): l is SolidLayer => l.kind === "solid");

describe("LayerTextures: word boxes (Batch 59)", () => {
  it("preview: one solid per shown word, the active one in the highlight color, drawn before the words", () => {
    const { textures, composite } = setup();
    const { layers } = textures.resolve(composite, "playback");
    const boxes = solids(layers);
    expect(boxes).toHaveLength(2);
    expect(boxes.map((b) => b.color)).toEqual([WHITE, RED]);
    expect(boxes.map((b) => b.opacity)).toEqual([0.5, 0.5]);
    expect(boxes[0]?.shape).toMatchObject({ width: 36, height: 20, radius: 6 });
    expect(layers.indexOf(boxes[1] as SolidLayer)).toBeLessThan(layers.findIndex((l) => l.kind === "texture"));
    // The box style's outline (inside) and shadow reach the solid.
    expect(boxes[0]?.style?.stroke).toMatchObject({ width: 4, align: "inside" });
    expect(boxes[0]?.style?.shadow).toMatchObject({ x: 3, y: 3 });
    // Word 2 (not shown) has no box; its position follows its rect.
    expect(boxes[1]?.transform[4]).toBe(40);
  });

  it("export: the same boxes, with the style, from the exact path", async () => {
    const { textures, composite } = setup();
    const { list, release } = await textures.resolveExact(composite, 4096);
    const boxes = solids(list.layers);
    expect(boxes).toHaveLength(2);
    expect(boxes.map((b) => b.color)).toEqual([WHITE, RED]);
    expect(boxes[1]?.style?.stroke).toMatchObject({ width: 4 });
    expect(boxes[0]?.shape).toMatchObject({ radius: 6 });
    release();
  });
});
