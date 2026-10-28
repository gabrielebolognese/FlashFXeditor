import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cuesFromSubtitles } from "../timeline/edit/captions.js";
import { CHUNK_LIMITS, DEFAULT_CHUNKS, parseWordsJson, wordsToCues, WordsImportError } from "./wordsImport.js";

const FPS = { num: 30, den: 1 };
const fixture = () => readFileSync("fixtures/interop/captions-v2/words.json", "utf8");

describe("parseWordsJson (spec §21.8)", () => {
  it("reads an array of { word, start, end } in seconds", () => {
    const { words, cues, skipped } = parseWordsJson(JSON.stringify([{ word: " Hello ", start: 0.5, end: 0.9 }, { text: "world", start: 1, end: 1.4 }, { word: "", start: 2, end: 3 }]));
    expect(words).toEqual([
      { text: "Hello", startUs: 500_000, endUs: 900_000 },
      { text: "world", startUs: 1_000_000, endUs: 1_400_000 },
    ]);
    expect(cues).toBeNull();
    expect(skipped).toBe(1);
  });

  it("reads milliseconds from startMs / endMs, start_ms / end_ms and from a file with unit ms", () => {
    const a = parseWordsJson(JSON.stringify([{ word: "a", startMs: 100, endMs: 250 }])).words[0];
    const b = parseWordsJson(JSON.stringify([{ word: "a", start_ms: 100, end_ms: 250 }])).words[0];
    const c = parseWordsJson(JSON.stringify({ unit: "ms", words: [{ word: "a", start: 100, end: 250 }] })).words[0];
    for (const word of [a, b, c]) expect(word).toEqual({ text: "a", startUs: 100_000, endUs: 250_000 });
  });

  it("reads Whisper segments and keeps word order and a start never before the word before", () => {
    const { words } = parseWordsJson(JSON.stringify({ segments: [{ words: [{ word: "a", start: 1, end: 2 }] }, { words: [{ word: "b", start: 0.5, end: 0.6 }, { word: "c", start: 3, end: 3 }] }] }));
    expect(words.map((word) => word.startUs)).toEqual([1_000_000, 1_000_000, 3_000_000]);
    expect(words.every((word) => word.endUs > word.startUs)).toBe(true);
  });

  it("refuses files that are not words, and bad chunk lists, saying what is wrong", () => {
    expect(() => parseWordsJson("{nope")).toThrow(WordsImportError);
    expect(() => parseWordsJson("42")).toThrow(/no words/);
    expect(() => parseWordsJson("[]")).toThrow(/No word/);
    const two = [{ word: "a", start: 0, end: 1 }, { word: "b", start: 1, end: 2 }];
    expect(() => parseWordsJson(JSON.stringify({ words: two, cues: [{ from: 0, to: 5 }] }))).toThrow(/outside/);
    expect(() => parseWordsJson(JSON.stringify({ words: two, cues: [{ from: 0, to: 1 }, { from: 1, to: 1 }] }))).toThrow(/overlaps/);
    expect(() => parseWordsJson(JSON.stringify({ words: two, cues: "x" }))).toThrow(/list/);
  });
});

describe("wordsToCues", () => {
  it("makes exactly the listed cues of the fixture's words.json, with the right emphasis words", () => {
    const imported = parseWordsJson(fixture());
    expect(imported.words).toHaveLength(8);
    const cues = wordsToCues(imported, DEFAULT_CHUNKS);
    expect(cues.map((cue) => cue.words?.map((word) => word.text))).toEqual([["You", "will", "never", "guess"], ["what", "happens", "next", "today"]]);
    // Exactly the first word's start to the last word's end.
    expect(cues[0]).toMatchObject({ startUs: 0, endUs: 800_000 });
    expect(cues[1]).toMatchObject({ startUs: 1_667_000, endUs: 2_933_000 });
    expect(cues[0]?.words?.map((word) => word.emphasis === true)).toEqual([false, false, true, false]);
    expect(cues[1]?.words?.some((word) => word.emphasis)).toBe(false);
    // On the frame grid, the words keep their emphasis (the project's cues).
    const framed = cuesFromSubtitles(cues, FPS).cues;
    expect(framed.map((cue) => [cue.start, cue.duration])).toEqual([[0, 24], [50, 38]]);
    expect(framed[0]?.words?.[2]).toMatchObject({ text: "never", emphasis: true });
  });

  it("without chunks chunks the words by the dialog's rules: words per cue, pauses, punctuation", () => {
    const list = "one two three four five six seven eight nine ten".split(" ").map((word, i) => ({ word, startMs: i * 300, endMs: i * 300 + 250 }));
    const imported = parseWordsJson(JSON.stringify(list));
    const wordsOf = (options: Partial<typeof DEFAULT_CHUNKS>) => wordsToCues(imported, { ...DEFAULT_CHUNKS, ...options }).map((cue) => cue.words?.length);
    expect(wordsOf({ maxWords: 4 })).toEqual([4, 3, 3]);
    expect(wordsOf({ maxWords: 1 })).toEqual(Array(10).fill(1));
    expect(wordsOf({ maxWords: 12, maxLines: 2 })).toEqual([10]);
    // A pause of 300 ms ends a cue when the limit is below it.
    expect(wordsOf({ maxWords: 12, pauseMs: 40 })).toEqual(Array(10).fill(1));
    const sentences = parseWordsJson(JSON.stringify([{ word: "Hi.", start: 0, end: 0.2 }, { word: "There", start: 0.25, end: 0.4 }, { word: "you", start: 0.45, end: 0.6 }]));
    expect(wordsToCues(sentences, { ...DEFAULT_CHUNKS, maxWords: 12 }).map((cue) => cue.words?.length)).toEqual([1, 2]);
    expect(wordsToCues(sentences, { ...DEFAULT_CHUNKS, maxWords: 12, breakAtPunctuation: false }).map((cue) => cue.words?.length)).toEqual([3]);
  });

  it("keeps the emphasis flag of items through the chunking", () => {
    const imported = parseWordsJson(JSON.stringify([{ word: "a", start: 0, end: 1 }, { word: "b", start: 1, end: 2, emphasis: true }]));
    expect(wordsToCues(imported, DEFAULT_CHUNKS)[0]?.words?.map((word) => word.emphasis === true)).toEqual([false, true]);
  });

  it("limits the dialog's fields", () => {
    expect(CHUNK_LIMITS.maxWords).toEqual({ min: 1, max: 12 });
  });
});
