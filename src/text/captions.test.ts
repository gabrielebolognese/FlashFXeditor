import { describe, expect, it } from "vitest";
import type { CaptionStyleOverride } from "../core/document/types.js";
import {
  activeWordIndex,
  captionMiddleY,
  captionPlace,
  cueBoundary,
  cueLine,
  cueMatches,
  cueSlice,
  defaultCaptionStyle,
  effectiveCaptionStyle,
  evenWords,
  isEmptyOverride,
  mergeCues,
  overrideFields,
  overrideWith,
  overrideWithout,
  presetOverride,
  splitCueAt,
  wordCount,
  wordRanges,
} from "./captions.js";

const cue = (text: string, duration: number, words?: { text: string; start: number; end: number }[]) => ({ text, start: 100, duration, ...(words && { words }) });

describe("defaultCaptionStyle", () => {
  it("scales the reference style to the project's short side and width", () => {
    const short = defaultCaptionStyle({ width: 1080, height: 1920 });
    expect(short.text.fontSize).toBe(64);
    expect(short.maxWidth).toBe(900);
    expect(short).toMatchObject({ position: "bottom", maxLines: 2, highlight: { mode: "color" } });
    const wide = defaultCaptionStyle({ width: 1920, height: 1080 });
    expect(wide.text.fontSize).toBe(64);
    expect(wide.maxWidth).toBe(1600);
    expect(defaultCaptionStyle({ width: 720, height: 1280 }).text.fontSize).toBeCloseTo(42.7, 1);
  });
});

describe("captionPlace", () => {
  it("anchors the presets at their edge and custom at its middle", () => {
    expect(captionPlace({ position: "bottom", x: 0, y: 0 }, 1920)).toEqual({ anchorY: 1, x: 0, y: 1920 * 0.78 - 960 });
    expect(captionPlace({ position: "center", x: 40, y: 50 }, 1920)).toEqual({ anchorY: 0.5, x: 0, y: 0 });
    expect(captionPlace({ position: "top", x: 0, y: 0 }, 1000)).toEqual({ anchorY: 0, x: 0, y: -320 });
    // Custom (Batch 53: an x too) puts the middle there.
    expect(captionPlace({ position: "custom", x: -30, y: -120 }, 1920)).toEqual({ anchorY: 0.5, x: -30, y: -120 });
  });

  it("gives the middle a preset shows a box at (where Custom starts)", () => {
    expect(captionMiddleY({ position: "bottom", x: 0, y: 0 }, 1000, 100)).toBe(230);
    expect(captionMiddleY({ position: "top", x: 0, y: 0 }, 1000, 100)).toBe(-270);
  });
});

describe("cue text helpers", () => {
  it("counts words, matches searches and flattens lines", () => {
    expect(wordCount("  Hello  big\nworld ")).toBe(3);
    expect(wordCount("")).toBe(0);
    // Dictionary words (Batch 47): a line without spaces is not one word; punctuation is no word.
    expect(wordCount("Don't stop, it's 3.5 km!")).toBe(5);
    expect(wordCount("— ¿?")).toBe(0);
    expect(wordCount("我们今天去公园散步")).toBeGreaterThan(3);
    expect(wordCount("今日は良い天気ですね")).toBeGreaterThan(3);
    expect(cueMatches("Hello World", "wor")).toBe(true);
    expect(cueMatches("Hello", "  ")).toBe(true);
    expect(cueMatches("Hello", "x")).toBe(false);
    expect(cueLine("one\n two \ntwo")).toBe("one two two");
  });

  it("finds words in reading order, ignoring case when it must", () => {
    expect(wordRanges("the cat and THE dog", [{ text: "the" }, { text: "the" }, { text: "dog" }, { text: "bird" }])).toEqual([[0, 3], [12, 15], [16, 19], null]);
  });
});

describe("slicing cues (timeline splits)", () => {
  it("cuts plain text at the space nearest the frame's share of the characters", () => {
    const c = cue("Hello there world", 100);
    expect(cueBoundary(c, 50)).toBe(11);
    expect(cueSlice(c, 100, 150)).toEqual({ text: "Hello there", words: undefined });
    expect(cueSlice(c, 150, 200)).toEqual({ text: "world", words: undefined });
  });

  it("keeps the whole text on both sides of a single word", () => {
    const c = cue("Supercalifragilistic", 60);
    expect(cueBoundary(c, 30)).toBeNull();
    expect(cueSlice(c, 100, 130).text).toBe("Supercalifragilistic");
    expect(cueSlice(c, 130, 160).text).toBe("Supercalifragilistic");
  });

  it("cuts at the first word on the right when the cue has word timings, re-basing them", () => {
    const words = [
      { text: "one", start: 0, end: 10 },
      { text: "two", start: 10, end: 20 },
      { text: "three", start: 20, end: 30 },
    ];
    const c = cue("one two three", 30, words);
    expect(cueSlice(c, 100, 115)).toEqual({ text: "one two", words: [words[0], { text: "two", start: 10, end: 15 }] });
    expect(cueSlice(c, 115, 130)).toEqual({ text: "three", words: [{ text: "three", start: 5, end: 15 }] });
    // A cut before the first spoken word keeps the text on both sides.
    const late = cue("one two", 40, [{ text: "one", start: 10, end: 20 }, { text: "two", start: 20, end: 30 }]);
    expect(cueSlice(late, 100, 105)).toEqual({ text: "one two", words: undefined });
    expect(cueSlice(late, 105, 140).words).toEqual([{ text: "one", start: 5, end: 15 }, { text: "two", start: 15, end: 25 }]);
  });
});

describe("splitCueAt (Enter in the cue list)", () => {
  it("splits the text at the caret and the timing by the share of characters", () => {
    const split = splitCueAt(cue("Hello world again", 90), 11);
    expect(split).toEqual({ at: 62, left: { text: "Hello world", words: undefined }, right: { text: "again", words: undefined } });
  });

  it("keeps at least a frame on each side, refuses cues under 2 frames", () => {
    expect(splitCueAt(cue("abc", 10), 0)?.at).toBe(1);
    expect(splitCueAt(cue("abc", 10), 3)?.at).toBe(9);
    expect(splitCueAt(cue("abc", 1), 1)).toBeNull();
  });

  it("splits at the first right word's start when both sides have word timings", () => {
    const words = [
      { text: "aa", start: 0, end: 6 },
      { text: "bbbbbbbb", start: 6, end: 30 },
    ];
    const split = splitCueAt(cue("aa bbbbbbbb", 30, words), 2);
    expect(split?.at).toBe(6);
    expect(split?.left).toEqual({ text: "aa", words: [{ text: "aa", start: 0, end: 6 }] });
    expect(split?.right).toEqual({ text: "bbbbbbbb", words: [{ text: "bbbbbbbb", start: 0, end: 24 }] });
  });
});

describe("mergeCues (Mod+Backspace)", () => {
  it("joins the texts with a space over both spans, with both cues' words", () => {
    const first = { text: "Hello ", start: 10, duration: 20, words: [{ text: "Hello", start: 0, end: 20 }] };
    const second = { text: " world", start: 40, duration: 10, words: [{ text: "world", start: 0, end: 10 }] };
    expect(mergeCues(first, second)).toEqual({
      text: "Hello world",
      duration: 40,
      words: [
        { text: "Hello", start: 0, end: 20 },
        { text: "world", start: 30, end: 40 },
      ],
      caret: 6,
    });
    expect(mergeCues({ text: "", start: 0, duration: 5 }, { text: "x", start: 5, duration: 5 })).toMatchObject({ text: "x", caret: 0, words: undefined });
  });
});

describe("word timings", () => {
  it("spreads generated words by their length and finds the playing one", () => {
    const words = evenWords("I am here", 100);
    expect(words).toEqual([
      { text: "I", start: 0, end: 20 },
      { text: "am", start: 20, end: 50 },
      { text: "here", start: 50, end: 100 },
    ]);
    expect(activeWordIndex(words, 0)).toBe(0);
    expect(activeWordIndex(words, 40)).toBe(1);
    expect(activeWordIndex(words, 100)).toBe(-1);
    expect(evenWords("a b c", 2).every((word) => word.end > word.start)).toBe(true);
  });
});

describe("styles per cue (spec §20.3)", () => {
  const track = () => defaultCaptionStyle({ width: 1080, height: 1920 });

  it("draws a cue without an override in the track's own style object", () => {
    const style = track();
    expect(effectiveCaptionStyle(style, undefined)).toBe(style);
  });

  it("puts the override's fields over the track's, the stroke, shadow, box and highlight part by part", () => {
    const style = track();
    const override: CaptionStyleOverride = { text: { fontFamily: "Anton", stroke: { width: 9 } }, position: "custom", x: 40, y: -300, highlight: { color: { r: 0, g: 1, b: 0, a: 1 } } };
    const effective = effectiveCaptionStyle(style, override);
    expect(effective.text.fontFamily).toBe("Anton");
    expect(effective.text.fontSize).toBe(style.text.fontSize);
    expect(effective.text.stroke).toEqual({ ...style.text.stroke, width: 9 });
    expect(effective).toMatchObject({ position: "custom", x: 40, y: -300, maxWidth: style.maxWidth });
    expect(effective.highlight).toEqual({ ...style.highlight, color: { r: 0, g: 1, b: 0, a: 1 } });
    // One object per override and track style (the caches keyed by style objects hold).
    expect(effectiveCaptionStyle(style, override)).toBe(effective);
    const changed = { ...style, maxLines: 3 };
    const again = effectiveCaptionStyle(changed, override);
    expect(again).not.toBe(effective);
    expect(again.maxLines).toBe(3);
  });

  it("writes only what an edit changed, parts one by one, and keeps what the override had", () => {
    const style = track();
    const after = { ...style, text: { ...style.text, fontSize: 90, shadow: { ...style.text.shadow, blur: 3 } } };
    const override = overrideWith({ maxLines: 1 }, style, after);
    expect(override).toEqual({ maxLines: 1, text: { fontSize: 90, shadow: { blur: 3 } } });
    expect(overrideWith(undefined, style, structuredClone(style))).toBeUndefined();
    const highlighted = overrideWith(undefined, style, { ...style, highlight: { ...style.highlight, mode: "scale" } });
    expect(highlighted).toEqual({ highlight: { mode: "scale" } });
  });

  it("lists the overridden fields as paths and drops fields or groups, nothing left being no override", () => {
    const override: CaptionStyleOverride = { text: { fill: { r: 1, g: 0, b: 0, a: 1 }, stroke: { width: 2, color: { r: 0, g: 0, b: 0, a: 1 } } }, y: 10, highlight: { inactiveColor: { r: 1, g: 1, b: 1, a: 1 } } };
    expect(overrideFields(override).sort()).toEqual(["highlight.inactiveColor", "text.fill", "text.stroke.color", "text.stroke.width", "y"]);
    expect(overrideWithout(override, ["text.stroke.width"])?.text?.stroke).toEqual({ color: { r: 0, g: 0, b: 0, a: 1 } });
    const less = overrideWithout(override, ["text.stroke", "y"]);
    expect(less).toEqual({ text: { fill: { r: 1, g: 0, b: 0, a: 1 } }, highlight: { inactiveColor: { r: 1, g: 1, b: 1, a: 1 } } });
    expect(overrideWithout(less, ["text.fill", "highlight.inactiveColor"])).toBeUndefined();
    expect(isEmptyOverride({ text: {} })).toBe(true);
    expect(isEmptyOverride(undefined)).toBe(true);
    // The input is not changed.
    expect(overrideFields(override)).toHaveLength(5);
  });

  it("takes a preset's whole text style (not its anchor), its highlight and, when it applies one, its position as Custom", () => {
    const style = track();
    const text = { ...style.text, fontFamily: "Bebas Neue", verticalAnchor: "top" as const };
    const plain = presetOverride({ maxLines: 1 }, { style: text, position: null });
    expect(plain.maxLines).toBe(1);
    expect(plain.text?.fontFamily).toBe("Bebas Neue");
    expect(plain.text).not.toHaveProperty("verticalAnchor");
    expect(plain).not.toHaveProperty("position");
    const placed = presetOverride(undefined, { style: text, position: { x: 10.4, y: -99.6 } }, { mode: "background", color: { r: 1, g: 1, b: 0, a: 1 }, inactiveColor: { r: 1, g: 1, b: 1, a: 1 } });
    expect(placed).toMatchObject({ position: "custom", x: 10, y: -100, highlight: { mode: "background" } });
  });
});
