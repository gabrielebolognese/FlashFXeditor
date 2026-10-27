import { describe, expect, it } from "vitest";
import { activeWordIndex, captionMiddleY, captionPlace, cueBoundary, cueLine, cueMatches, cueSlice, defaultCaptionStyle, evenWords, mergeCues, splitCueAt, wordCount, wordRanges } from "./captions.js";

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
    expect(captionPlace({ position: "bottom", y: 0 }, 1920)).toEqual({ anchorY: 1, y: 1920 * 0.78 - 960 });
    expect(captionPlace({ position: "center", y: 50 }, 1920)).toEqual({ anchorY: 0.5, y: 0 });
    expect(captionPlace({ position: "top", y: 0 }, 1000)).toEqual({ anchorY: 0, y: -320 });
    expect(captionPlace({ position: "custom", y: -120 }, 1920)).toEqual({ anchorY: 0.5, y: -120 });
  });

  it("gives the middle a preset shows a box at (where Custom starts)", () => {
    expect(captionMiddleY({ position: "bottom", y: 0 }, 1000, 100)).toBe(230);
    expect(captionMiddleY({ position: "top", y: 0 }, 1000, 100)).toBe(-270);
  });
});

describe("cue text helpers", () => {
  it("counts words, matches searches and flattens lines", () => {
    expect(wordCount("  Hello  big\nworld ")).toBe(3);
    expect(wordCount("")).toBe(0);
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
