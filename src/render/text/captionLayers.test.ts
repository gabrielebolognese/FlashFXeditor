// Cues through the compositor and the preview's textures (spec §10.5), with the approximate measurer:
// 55 px per character at 100 px, lines 120 px tall (line height 1.2).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { addCaptionTrack, makeCaptionClip, makeProject, makeSolidClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { CaptionClip, CaptionHighlightMode, CaptionStyle, CaptionWord, Project } from "../../core/document/types.js";
import { TexturePool } from "../../media/cache/TexturePool.js";
import { defaultCaptionStyle } from "../../text/captions.js";
import { DEFAULT_TEXT_STYLE } from "../../text/style.js";
import { Compositor } from "../compositor/Compositor.js";
import { HIGHLIGHT_SLOT, type SolidLayer, type TextCompositeLayer, type TextureLayer } from "../compositor/drawList.js";
import type { TextureHandle } from "../gpu/renderer.js";
import { applyToPoint } from "../mat3.js";
import { LayerTextures } from "../preview/LayerTextures.js";
import { captionLook, HIGHLIGHT_SCALE } from "./captionLayout.js";
import { approximateMeasurer, setTextMeasurer, textLayout } from "./layoutCache.js";
import type { ResolvedText } from "./TextRasterCache.js";

beforeAll(() => setTextMeasurer(approximateMeasurer));
afterAll(() => setTextMeasurer(null));

const YELLOW = { r: 1, g: 1, b: 0, a: 1 };
const GREY = { r: 0.5, g: 0.5, b: 0.5, a: 1 };

function captionStyle(patch: Partial<CaptionStyle> = {}, mode: CaptionHighlightMode = "color"): CaptionStyle {
  const base = defaultCaptionStyle({ width: 1080, height: 1920 });
  return {
    ...base,
    text: { ...structuredClone(DEFAULT_TEXT_STYLE), fontSize: 100, lineHeight: 1.2 },
    maxWidth: 900,
    maxLines: 2,
    highlight: { mode, color: YELLOW, inactiveColor: GREY },
    ...patch,
  };
}

const WORDS: CaptionWord[] = [
  { text: "ab", start: 0, end: 10 },
  { text: "cd", start: 10, end: 20 },
];

/** V1 with a full-frame solid, the caption track with one cue at 0..30. */
function project(text = "ab", style: CaptionStyle = captionStyle(), words?: CaptionWord[]): Project {
  const p = makeProject();
  p.tracks = [makeTrack("v1"), makeTrack("a1", "audio")];
  const withTrack = addCaptionTrack(p);
  withTrack.captionTracks.cc = { style };
  return withClips(withTrack, [makeSolidClip({ id: "s", trackId: "v1", start: 0, duration: 100 }), makeCaptionClip({ id: "q", trackId: "cc", start: 0, duration: 30, text, ...(words && { words }) })]);
}

const captionLayer = (p: Project, frame: number, compositor = new Compositor()) => compositor.evaluate(p, frame).layers.find((layer) => layer.kind === "text") as TextCompositeLayer | undefined;

describe("cues in the compositor (spec §10.5)", () => {
  it("draws the cue at the frame above the video tracks, its bottom edge in the lower third", () => {
    const composite = new Compositor().evaluate(project(), 5);
    expect(composite.layers.map((layer) => layer.kind)).toEqual(["solid", "text"]);
    const layer = composite.layers[1] as TextCompositeLayer;
    expect(layer).toMatchObject({ clipId: "q", trackId: "cc", scale: 1, opacity: 1, anim: null, karaoke: null });
    expect(layer.text).toMatchObject({ value: "ab", box: { mode: "auto" } });
    // The 110 x 120 box centered horizontally, its bottom at 78% of 1920.
    const corner = applyToPoint(layer.model, 0, 120);
    expect(corner.x).toBeCloseTo(540 - 55);
    expect(corner.y).toBeCloseTo(1920 * 0.78);
    expect(captionLayer(project(), 30)).toBeUndefined();
  });

  it("places top, center and custom captions", () => {
    expect(applyToPoint(captionLayer(project("ab", captionStyle({ position: "top" })), 5)!.model, 0, 0).y).toBeCloseTo(1920 * 0.18);
    expect(applyToPoint(captionLayer(project("ab", captionStyle({ position: "center" })), 5)!.model, 0, 60).y).toBe(960);
    expect(applyToPoint(captionLayer(project("ab", captionStyle({ position: "custom", y: -200 })), 5)!.model, 0, 60).y).toBe(760);
  });

  it("leaves out hidden tracks, disabled and empty cues", () => {
    const hidden = project();
    hidden.tracks.find((track) => track.id === "cc")!.hidden = true;
    expect(captionLayer(hidden, 5)).toBeUndefined();
    const disabled = project();
    disabled.clips.q = { ...disabled.clips.q!, enabled: false };
    expect(captionLayer(disabled, 5)).toBeUndefined();
    expect(captionLayer(project("  "), 5)).toBeUndefined();
  });

  it("wraps at the max width and draws smaller to keep within the max lines", () => {
    const style = captionStyle({ maxWidth: 300 });
    const look = captionLook("aaaa bbbb cccc", style);
    expect(look.content.box).toEqual({ mode: "fixed", width: 300 });
    expect(look.style.fontSize).toBeLessThan(100);
    expect(look.style.fontSize).toBeGreaterThanOrEqual(50);
    expect(textLayout(look.content, look.style).lines).toHaveLength(2);
    // Cached: the same objects for the same text and style.
    expect(captionLook("aaaa bbbb cccc", style)).toBe(look);
  });

  it("shows the cue list's live text and a style scrub's live style", () => {
    const compositor = new Compositor();
    const live = { texts: new Map([["q", "typed"]]), styles: new Map([["cc", captionStyle({ position: "center" })]]) };
    const layer = compositor.evaluate(project(), 5, null, null, null, null, null, live).layers[1] as TextCompositeLayer;
    expect(layer.text.value).toBe("typed");
    expect(applyToPoint(layer.model, 0, 60).y).toBe(960);
  });
});

describe("word highlight (karaoke)", () => {
  it("draws the other words in the inactive color and the playing one in the highlight color", () => {
    const layer = captionLayer(project("ab cd", captionStyle(), WORDS), 12)!;
    expect(layer.style.fill).toEqual(GREY);
    expect(layer.karaoke).toMatchObject({ from: 1, to: 2, scale: 1, box: null });
    expect(layer.karaoke?.style.fill).toEqual(YELLOW);
    // Between and after the words: the inactive look, nothing highlighted.
    expect(captionLayer(project("ab cd", captionStyle(), WORDS), 25)).toMatchObject({ karaoke: null, style: { fill: GREY } });
  });

  it("grows the word for the scale modes and puts a box behind it for background", () => {
    const scale = captionLayer(project("ab cd", captionStyle({}, "colorAndScale"), WORDS), 3)!.karaoke!;
    expect(scale).toMatchObject({ from: 0, to: 1, scale: HIGHLIGHT_SCALE });
    expect(scale.style.fill).toEqual(YELLOW);
    const box = captionLayer(project("ab cd", captionStyle({}, "background"), WORDS), 3)!.karaoke!;
    expect(box.scale).toBe(1);
    expect(box.style.fill).toEqual(DEFAULT_TEXT_STYLE.fill);
    expect(box.box?.color).toEqual(YELLOW);
    // Around "ab" (110 px), padded by 0.12 em.
    expect(box.box?.rect.x).toBeCloseTo(-12);
    expect(box.box?.rect.width).toBeCloseTo(134);
    // A pill (Batch 34): its corners round by half its height.
    expect(box.box?.radius).toBeCloseTo((box.box?.rect.height ?? 0) / 2);
  });

  it("is off without word timings or with the mode none", () => {
    expect(captionLayer(project("ab cd", captionStyle()), 3)).toMatchObject({ karaoke: null, style: { fill: DEFAULT_TEXT_STYLE.fill } });
    expect(captionLayer(project("ab cd", captionStyle({}, "none"), WORDS), 3)).toMatchObject({ karaoke: null, style: { fill: DEFAULT_TEXT_STYLE.fill } });
  });

  it("lists the cue's raster and both word atlases among the texts about to show", () => {
    const upcoming = new Compositor().upcomingTexts(project("ab cd", captionStyle(), WORDS), 0, 60);
    expect(upcoming.map((item) => [item.clipId, [...item.parts]])).toEqual([
      ["q", ["all", "word"]],
      [`q${HIGHLIGHT_SLOT}`, ["word"]],
    ]);
  });
});

describe("highlighted cues in the preview's textures", () => {
  function setup() {
    const handle = (name: string): TextureHandle => ({ width: 64, height: 32, mipLevels: 1, bytes: 1, valid: true, destroy: () => undefined, name }) as TextureHandle;
    const atlas = (texture: TextureHandle): ResolvedText => ({
      texture,
      crop: { u0: 0, v0: 0, u1: 1, v1: 1 },
      rect: { x: 0, y: 0, width: 275, height: 120 },
      scale: 1,
      units: [
        { rect: { x: 0, y: 20, width: 110, height: 90 }, crop: { u0: 0, v0: 0, u1: 0.5, v1: 1 } },
        { rect: { x: 165, y: 20, width: 110, height: 90 }, crop: { u0: 0.5, v0: 0, u1: 1, v1: 1 } },
      ],
    });
    const inactive = atlas(handle("inactive"));
    const active = atlas(handle("active"));
    const text = {
      begin: vi.fn(),
      end: vi.fn(),
      resolve: vi.fn(() => null),
      exact: vi.fn(async () => null),
      resolveAtlas: vi.fn((clipId: string) => (clipId.endsWith(HIGHLIGHT_SLOT) ? active : inactive)),
      resolveBackground: vi.fn(() => null),
      warm: vi.fn(() => false),
    };
    const textures = new LayerTextures({
      frames: { info: () => null, video: () => new Promise(() => undefined), getFrame: () => new Promise(() => undefined), prefetch: async () => 0, lodFor: () => "full" },
      images: { get: () => null, load: async () => null, frameKey: () => null, vectorSize: () => null, refine: async () => null },
      pool: new TexturePool(),
      onChange: () => undefined,
      text,
    });
    return { textures, text, inactive, active };
  }

  it("draws the other words from the cue's atlas and the playing word from the highlight atlas, grown", () => {
    const { textures, text, inactive, active } = setup();
    const composite = new Compositor().evaluate(project("ab cd", captionStyle({}, "scale"), WORDS), 12);
    const list = textures.resolve(composite, "idle", 0, 1);
    expect(text.resolveAtlas).toHaveBeenCalledWith("q", expect.objectContaining({ value: "ab cd" }), expect.objectContaining({ fill: GREY }), 1, "word");
    expect(text.resolveAtlas).toHaveBeenCalledWith(`q${HIGHLIGHT_SLOT}`, expect.anything(), expect.anything(), 1, "word");
    const texts = list.layers.filter((layer): layer is TextureLayer => layer.kind === "texture");
    expect(texts.map((layer) => layer.texture)).toEqual([inactive.texture, active.texture]);
    // The active cell is drawn larger than the inactive one (110 px wide cells).
    const width = (layer: TextureLayer) => Math.hypot(layer.transform[0] as number, layer.transform[1] as number);
    expect(width(texts[1]!) / width(texts[0]!)).toBeCloseTo(HIGHLIGHT_SCALE);
  });

  it("puts the highlight box under the playing word", () => {
    const { textures } = setup();
    const composite = new Compositor().evaluate(project("ab cd", captionStyle({}, "background"), WORDS), 3);
    const list = textures.resolve(composite, "idle", 0, 1);
    expect(list.layers.map((layer) => layer.kind)).toEqual(["solid", "texture", "solid", "texture"]);
    const box = list.layers[2] as SolidLayer;
    expect(box.color).toEqual(YELLOW);
    expect(box.shape?.kind).toBe("box");
    expect(box.shape?.radius).toBeCloseTo((box.shape?.height ?? 0) / 2);
  });
});

describe("styles per cue (spec §20.3)", () => {
  const RED = { r: 1, g: 0, b: 0, a: 1 };
  const GREEN = { r: 0, g: 1, b: 0, a: 1 };

  /** Two cues: q (0..30) with `override`, r (30..60) without. */
  function twoCues(override: CaptionClip["styleOverride"], words?: CaptionWord[]): Project {
    const p = project("ab cd", captionStyle(), words);
    p.clips.q = { ...(p.clips.q as CaptionClip), ...(override && { styleOverride: override }) };
    p.clips.r = makeCaptionClip({ id: "r", trackId: "cc", start: 30, duration: 30, text: "ab cd", ...(words && { words }) });
    p.tracks.find((track) => track.id === "cc")!.clipIds.push("r");
    return p;
  }

  it("draws a cue in its own style and at its own position, the others in the track's", () => {
    const p = twoCues({ text: { fontSize: 200, fill: RED }, position: "custom", x: 100, y: -500 });
    const own = captionLayer(p, 5)!;
    expect(own.style.fontSize).toBe(200);
    expect(own.style.fill).toEqual(RED);
    // A 2-line box? No: 5 chars at 200 px = 550 px wide, within 900; its middle at (640, 460).
    const middle = applyToPoint(own.model, 275, 120);
    expect(middle.x).toBeCloseTo(540 + 100);
    expect(middle.y).toBeCloseTo(960 - 500);
    const other = captionLayer(p, 35)!;
    expect(other.style.fontSize).toBe(100);
    expect(applyToPoint(other.model, 0, 120).y).toBeCloseTo(1920 * 0.78);
  });

  it("highlights the spoken word in each cue's own colors", () => {
    const p = twoCues({ highlight: { color: GREEN, inactiveColor: RED } }, WORDS);
    const own = captionLayer(p, 12)!;
    expect(own.style.fill).toEqual(RED);
    expect(own.karaoke?.style.fill).toEqual(GREEN);
    const other = captionLayer(p, 42)!;
    expect(other.style.fill).toEqual(GREY);
    expect(other.karaoke?.style.fill).toEqual(YELLOW);
  });

  it("changes a cue with what it does not override when the track style changes", () => {
    const p = twoCues({ text: { fill: RED } });
    p.captionTracks.cc = { style: { ...captionStyle(), position: "top" } };
    const own = captionLayer(p, 5)!;
    expect(own.style.fill).toEqual(RED);
    expect(applyToPoint(own.model, 0, 0).y).toBeCloseTo(1920 * 0.18);
  });

  it("shows a cue's live style, a canvas drag's position and the inline editor's draft with its selection", () => {
    const p = twoCues(undefined);
    const compositor = new Compositor();
    const moved = { x: 0, y: -300, scale: 1, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false };
    const highlight = { rects: [{ x: 0, y: 0, width: 10, height: 10 }], color: "selection" };
    const live = { texts: new Map([["q", "typed"]]), styles: null, cueStyles: new Map([["q", captionStyle({ text: { ...captionStyle().text, fontSize: 50 } })]]), editing: { cueId: "q", highlight } };
    const layer = compositor.evaluate(p, 5, new Map([["q", moved]]), null, null, null, null, live).layers[1] as TextCompositeLayer;
    expect(layer.text.value).toBe("typed");
    expect(layer.style.fontSize).toBe(50);
    expect(layer.highlight).toBe(highlight);
    expect(applyToPoint(layer.model, 0, 30).y).toBeCloseTo(960 - 300);
  });

  it("lists each cue about to show in its own style", () => {
    const p = twoCues({ text: { fontSize: 200 } });
    const upcoming = new Compositor().upcomingTexts(p, 0, 60);
    expect(upcoming.map((item) => item.style.fontSize)).toEqual([100, 200]);
  });
});
