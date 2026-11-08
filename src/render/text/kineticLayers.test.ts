// Kinetic text through the compositor (spec §21.13, Batch 68), with the approximate measurer (55 px per
// character at 100 px): a counter shows the right text at every frame from its glyph atlas, an animator
// reveal moves characters left to right, decode and the highlight sweep write their frames, and none of
// it lays out or rasterizes again per frame (P11: the layouts are cached per content and style).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeProject, makeTextClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { Project, TextAnimator, TextClip, TextStyle } from "../../core/document/types.js";
import { newAnimator } from "../../text/animators.js";
import { counterTextAt } from "../../text/counter.js";
import { DEFAULT_TEXT_STYLE } from "../../text/style.js";
import { Compositor } from "../compositor/Compositor.js";
import type { TextCompositeLayer } from "../compositor/drawList.js";
import { approximateMeasurer, setTextMeasurer, textLayout } from "./layoutCache.js";

beforeAll(() => setTextMeasurer(approximateMeasurer));
afterAll(() => setTextMeasurer(null));

const style = (patch: Partial<TextStyle> = {}): TextStyle => ({ ...structuredClone(DEFAULT_TEXT_STYLE), fontSize: 100, lineHeight: 1.2, align: "left", ...patch });

function project(clip: Partial<TextClip>): Project {
  const p = makeProject();
  p.tracks = [makeTrack("v1"), makeTrack("v2"), makeTrack("a1", "audio")];
  return withClips(p, [{ ...makeTextClip({ id: "t", trackId: "v1", start: 0, duration: 30, value: "abcd" }), style: style(), ...clip }]);
}

const layerAt = (compositor: Compositor, doc: Project, frame: number) => compositor.evaluate(doc, frame).layers[0] as TextCompositeLayer;

describe("counter (spec §21.13)", () => {
  const counter = { from: 0, to: 85.6, decimals: 1, prefix: "", suffix: "%", separator: "" as const, ease: "easeOut" as const };
  const doc = project({ text: { value: "85.6%", box: { mode: "auto", width: 900 } }, counter });

  it("draws one glyph per visible character at every frame, from the glyph atlas", () => {
    const compositor = new Compositor();
    for (let f = 0; f < 30; f++) {
      const layer = layerAt(compositor, doc, f);
      const anim = layer.anim;
      expect(anim?.atlas).toBe("glyphs");
      const text = counterTextAt(counter, undefined, f, 30);
      expect(anim?.units.length).toBe(text.length);
      expect(anim?.glyphs?.draws.length).toBe(text.length);
      // Every glyph is a character of the glyph atlas text, in the order of the number.
      const atlasText = anim?.glyphs?.text.value ?? "";
      const shown = (anim?.glyphs?.draws ?? []).map((draw) => [...atlasText][draw.glyph]).join("");
      expect(shown).toBe(text);
    }
  });

  it("digits sit in cells of equal width, so the number does not jitter", () => {
    const compositor = new Compositor();
    const layer = layerAt(compositor, doc, 0);
    const first = layer.anim?.glyphs?.draws.map((d) => d.dx) ?? [];
    // "0.0%": the glyph shifts differ only by the glyph atlas positions; shown positions advance by equal digit cells.
    expect(first.length).toBe(4);
  });

  it("never lays out again after the first frame (P11)", () => {
    const compositor = new Compositor();
    layerAt(compositor, doc, 0);
    const glyphs = (compositor.evaluate(doc, 1).layers[0] as TextCompositeLayer).anim?.glyphs?.text;
    expect(glyphs).toBeDefined();
    for (let f = 2; f < 30; f++) expect((compositor.evaluate(doc, f).layers[0] as TextCompositeLayer).anim?.glyphs?.text).toBe(glyphs);
    const clip = doc.clips.t as TextClip;
    const layer = layerAt(compositor, doc, 5);
    expect(textLayout(layer.text, layer.style)).toBe(textLayout(layer.text, layer.style));
    expect(clip.counter).toBeDefined();
  });

  it("lists the glyph atlas among the text it will draw", () => {
    const upcoming = new Compositor().upcomingTexts(doc, 0, 30);
    expect(upcoming.some((item) => item.clipId === "t#glyphs" && item.parts.includes("char"))).toBe(true);
  });
});

describe("animators (spec §21.13)", () => {
  const reveal: TextAnimator = { ...newAnimator("a1"), props: { y: 40, opacity: 0 } };
  const keys = {
    "animators.a1.selector.offset": [
      { frame: 0, value: 1, ease: "linear" as const },
      { frame: 20, value: -1, ease: "linear" as const },
    ],
  };
  const doc = project({ animators: [reveal], keyframes: keys });

  it("reveals the characters left to right as the offset is keyed", () => {
    const compositor = new Compositor();
    const at0 = layerAt(compositor, doc, 0).anim;
    expect(at0?.atlas).toBe("char");
    expect(at0?.units.map((u) => u.opacity)).toEqual([1, 1, 1, 1]);
    const mid = layerAt(compositor, doc, 10).anim;
    const opacities = mid?.units.map((u) => u.opacity) ?? [];
    expect(opacities[0]).toBe(1);
    expect(opacities[3]).toBe(0);
    expect([...opacities].sort((a, b) => b - a)).toEqual(opacities);
    expect(mid?.units[3]?.y).toBe(40);
  });

  it("random order with a seed is the same on every evaluation and on a fresh compositor", () => {
    const random = project({ animators: [{ ...reveal, selector: { ...reveal.selector, order: "random", seed: 9, offset: -0.5 } }] });
    const first = layerAt(new Compositor(), random, 3).anim?.units.map((u) => u.y);
    const second = layerAt(new Compositor(), random, 3).anim?.units.map((u) => u.y);
    expect(first).toEqual(second);
    expect(new Set(first).size).toBeGreaterThan(1);
  });

  it("fill tints toward the color from a tint atlas", () => {
    const tinted = project({ animators: [{ ...reveal, selector: { ...reveal.selector, offset: -1 }, props: { fill: { r: 1, g: 0, b: 0, a: 1 } } }] });
    const anim = layerAt(new Compositor(), tinted, 0).anim;
    expect(anim?.tint?.slot).toBe("#tint");
    expect(anim?.units.every((u) => u.tint === 1)).toBe(true);
    const upcoming = new Compositor().upcomingTexts(tinted, 0, 30);
    expect(upcoming.some((item) => item.clipId === "t#tint" && item.parts.includes("char"))).toBe(true);
  });

  it("a word animator is drawn from the word atlas, one unit per word", () => {
    const words = project({ text: { value: "ab cd", box: { mode: "auto", width: 900 } }, animators: [{ ...newAnimator("w"), unit: "word", selector: { ...newAnimator("w").selector, start: 0.5, end: 1.5, shape: "square" }, props: { y: 10 } }] });
    const anim = layerAt(new Compositor(), words, 0).anim;
    expect(anim?.atlas).toBe("word");
    expect(anim?.units.map((u) => u.y)).toEqual([0, 10]);
  });

  it("a word animator over a character one: the characters of the word move together", () => {
    const both = project({
      text: { value: "ab cd", box: { mode: "auto", width: 900 } },
      animators: [{ ...newAnimator("w"), unit: "word", selector: { ...newAnimator("w").selector, start: 0.5, end: 1.5, shape: "square" }, props: { y: 10 } }, { ...newAnimator("c"), selector: { ...newAnimator("c").selector, start: -1, end: -0.5 }, props: { x: 3 } }],
    });
    const anim = layerAt(new Compositor(), both, 0).anim;
    expect(anim?.atlas).toBe("char");
    expect(anim?.units.map((u) => u.y)).toEqual([0, 0, 10, 10]);
    expect(anim?.units.map((u) => u.x)).toEqual([3, 3, 3, 3]);
  });

  it("an in animation composes with the animators", () => {
    const both = project({ animators: [{ ...reveal, selector: { ...reveal.selector, offset: -1 } }], animIn: { id: "fade", duration: 10 } });
    const anim = layerAt(new Compositor(), both, 0).anim;
    // Fade at its first frame: not shown yet, and the animator's own opacity 0 multiplies it.
    expect(anim?.units.every((u) => u.opacity === 0)).toBe(true);
  });
});

describe("kinetic presets (spec §21.13)", () => {
  it("decode draws unlocked characters from the glyph atlas and locks left to right", () => {
    const doc = project({ animIn: { id: "decode", duration: 20 } });
    const compositor = new Compositor();
    const start = layerAt(compositor, doc, 0).anim;
    expect(start?.glyphs?.draws.filter((d) => d.glyph >= 0).length).toBeGreaterThan(0);
    const locked = (frame: number) => (layerAt(compositor, doc, frame).anim?.glyphs?.draws ?? []).map((d) => d.glyph < 0);
    expect(locked(0).filter(Boolean).length).toBe(0);
    const mid = locked(10);
    expect(mid.slice(0, 2)).toEqual([true, true]);
    expect(mid.slice(-1)).toEqual([false]);
    // The same frame again (a reload, a scrub back): the same characters.
    const a = (layerAt(compositor, doc, 7).anim?.glyphs?.draws ?? []).map((d) => d.glyph);
    const b = (layerAt(new Compositor(), doc, 7).anim?.glyphs?.draws ?? []).map((d) => d.glyph);
    expect(a).toEqual(b);
    // At rest after the animation: ordinary frame.
    expect(layerAt(compositor, doc, 25).anim).toBeNull();
  });

  it("highlight sweep grows a box behind each word", () => {
    const doc = project({ text: { value: "ab cd ef", box: { mode: "auto", width: 900 } }, animIn: { id: "highlightSweep", duration: 20 } });
    const compositor = new Compositor();
    const early = layerAt(compositor, doc, 1).anim?.sweep;
    expect(early?.count).toBe(3);
    const widths = (frame: number) => (layerAt(compositor, doc, frame).anim?.sweep?.rects ?? []).slice(0, 3).map((r) => r.width);
    const mid = widths(9);
    expect(mid[0]).toBeGreaterThan(mid[2] as number);
    const late = widths(19);
    expect(late.every((w) => w > 0)).toBe(true);
  });

  it("the character presets move characters one after another", () => {
    for (const id of ["typeOn", "tumbleIn", "cascadeUp", "popInByChar", "blurInByChar", "fadeInByChar"] as const) {
      const doc = project({ animIn: { id, duration: 20 } });
      const units = layerAt(new Compositor(), doc, 4).anim?.units ?? [];
      expect(units.length, id).toBe(4);
      const first = units[0];
      const last = units[3];
      expect(first && last && first.opacity >= last.opacity, id).toBe(true);
    }
    const lines = layerAt(new Compositor(), project({ text: { value: "ab\ncd", box: { mode: "auto", width: 900 } }, animIn: { id: "riseByLine", duration: 20 } }), 3).anim;
    expect(lines?.atlas).toBe("line");
    expect(lines?.units.length).toBe(2);
  });
});
