import { describe, expect, it } from "vitest";
import { CHARS_PER_LINE, cuesFromWords, cueText, HOLD_US, lineBreaks, MIN_CUE_US, PAUSE_US, phraseCues, WORD_LEAD_US, wordsFromChunks as wordsWithLead, type TimedWord, type WordChunk } from "./transcript.js";

/** Whisper's times as they are (the lead has its own test). */
const wordsFromChunks = (chunks: readonly WordChunk[], durationUs: number) => wordsWithLead(chunks, durationUs, 0);

const chunk = (text: string, start: number | null, end: number | null): WordChunk => ({ text, timestamp: [start, end] });

/** Words of `text` spoken back to back from `startS`, `perWordS` each. */
function spoken(text: string, startS = 0, perWordS = 0.3): TimedWord[] {
  return text.split(" ").map((word, i) => ({ text: word, startUs: Math.round((startS + i * perWordS) * 1e6), endUs: Math.round((startS + (i + 1) * perWordS) * 1e6) }));
}

describe("wordsFromChunks", () => {
  it("trims the words and turns seconds into µs", () => {
    expect(wordsFromChunks([chunk(" Hello", 0.5, 0.86), chunk(" world.", 0.86, 1.2)], 10e6)).toEqual([
      { text: "Hello", startUs: 500_000, endUs: 860_000 },
      { text: "world.", startUs: 860_000, endUs: 1_200_000 },
    ]);
  });

  it("joins punctuation on its own to the word before it", () => {
    const words = wordsFromChunks([chunk(" Wait", 0, 0.4), chunk("...", 0.4, 0.6), chunk(" what", 0.8, 1), chunk("?", 1, 1.1)], 10e6);
    expect(words.map((w) => w.text)).toEqual(["Wait...", "what?"]);
    expect(words[0]?.endUs).toBe(600_000);
  });

  it("drops non-speech annotations, also over several chunks, and music notes", () => {
    const words = wordsFromChunks(
      [chunk(" [Music]", 0, 2), chunk(" Hi", 2, 2.3), chunk(" (laughs)", 2.3, 3), chunk(" [", 3, 3.1), chunk("BLANK_AUDIO", 3.1, 3.5), chunk("]", 3.5, 3.6), chunk(" ♪", 4, 5), chunk(" there", 5, 5.4)],
      10e6,
    );
    expect(words.map((w) => w.text)).toEqual(["Hi", "there"]);
  });

  it("keeps the times in order and inside the audio; an open end lasts half a second", () => {
    const words = wordsFromChunks([chunk(" one", 1, 1.4), chunk(" two", 0.9, 1.6), chunk(" three", 9.9, null), chunk(" four", 11, 12)], 10e6);
    expect(words).toEqual([
      { text: "one", startUs: 1_000_000, endUs: 1_400_000 },
      { text: "two", startUs: 1_000_000, endUs: 1_600_000 },
      { text: "three", startUs: 9_900_000, endUs: 10_000_000 },
      { text: "four", startUs: 10_000_000, endUs: 10_000_001 },
    ]);
    expect(wordsFromChunks([chunk(" late", null, null)], 10e6)).toEqual([{ text: "late", startUs: 0, endUs: 500_000 }]);
  });

  it("moves Whisper's word times WORD_LEAD_US earlier (they trail the voice), never before 0", () => {
    expect(WORD_LEAD_US).toBe(150_000);
    expect(wordsWithLead([chunk(" Hi", 0.1, 0.4), chunk(" there", 0.5, 0.9)], 10e6)).toEqual([
      { text: "Hi", startUs: 0, endUs: 250_000 },
      { text: "there", startUs: 350_000, endUs: 750_000 },
    ]);
  });

  it("gives nothing for empty chunks or punctuation alone", () => {
    expect(wordsFromChunks([chunk(" ", 0, 1), chunk(".", 1, 2)], 10e6)).toEqual([]);
  });
});

describe("lineBreaks and cueText", () => {
  it("keeps a short text on one line", () => {
    expect(lineBreaks(["Hello", "world"], 32)).toEqual([2]);
    expect(cueText(["Hello", "world"])).toBe("Hello world");
    expect(lineBreaks([], 32)).toEqual([]);
  });

  it("breaks a longer text into the fewest, most even lines, the bottom one the longer", () => {
    const words = "Add a generous pinch of salt to the boiling water".split(" ");
    expect(cueText(words)).toBe("Add a generous pinch of\nsalt to the boiling water");
    // Equal halves are not possible: the top line is the shorter one.
    expect(lineBreaks(["aaaa", "bbbb", "cccc"], 9)).toEqual([1, 2]);
    for (const line of cueText(words).split("\n")) expect(line.length).toBeLessThanOrEqual(CHARS_PER_LINE);
  });

  it("gives a word longer than a line a line of its own", () => {
    expect(lineBreaks(["a", "Supercalifragilisticexpialidocious!", "b"], 10)).toEqual([1, 1, 1]);
  });
});

describe("cuesFromWords", () => {
  it("makes cues of at most two lines of about 32 characters, in order, never overlapping", () => {
    const text =
      "Welcome to the editor today we are going to make a short video about cooking pasta at home first fill a large pot with water and bring it to a boil add a generous pinch of salt because the water should taste like the sea";
    const words = spoken(text);
    const cues = cuesFromWords(words, { maxLines: 2, durationUs: 60e6 });
    expect(cues.length).toBeGreaterThan(2);
    let previousEnd = 0;
    const all: string[] = [];
    for (const cue of cues) {
      const lines = cue.text.split("\n");
      expect(lines.length).toBeLessThanOrEqual(2);
      for (const line of lines) expect(line.length).toBeLessThanOrEqual(CHARS_PER_LINE);
      expect(cue.startUs).toBeGreaterThanOrEqual(previousEnd);
      expect(cue.endUs).toBeGreaterThan(cue.startUs);
      expect(cue.startUs).toBe(cue.words?.[0]?.startUs);
      previousEnd = cue.endUs;
      all.push(...(cue.words ?? []).map((w) => w.text));
    }
    // Every word once, in order; the cue texts are made of them.
    expect(all.join(" ")).toBe(text);
    expect(cues.map((cue) => cue.text.replace(/\n/g, " ")).join(" ")).toBe(text);
  });

  it("follows the caption style's max lines", () => {
    const words = spoken("one two three four five six seven eight nine ten eleven twelve thirteen");
    expect(cuesFromWords(words, { maxLines: 2, durationUs: 60e6 })).toHaveLength(2);
    for (const cue of cuesFromWords(words, { maxLines: 1, durationUs: 60e6 })) expect(cue.text).not.toContain("\n");
    const three = cuesFromWords(words, { maxLines: 3, durationUs: 60e6 });
    expect(three).toHaveLength(1);
    expect(three[0]?.text.split("\n")).toHaveLength(3);
  });

  it("ends a cue at a sentence end, and keeps a phrase that fits in one cue", () => {
    const cues = cuesFromWords(spoken("Hi there. How are you? Fine, thanks"), { maxLines: 2, durationUs: 60e6 });
    expect(cues.map((cue) => cue.text)).toEqual(["Hi there.", "How are you?", "Fine, thanks"]);
    const fits = cuesFromWords(spoken("When the water is boiling and bubbling, add the spaghetti"), { maxLines: 2, durationUs: 60e6 });
    expect(fits.map((cue) => cue.text)).toEqual(["When the water is boiling and\nbubbling, add the spaghetti"]);
  });

  it("splits a long sentence into even cues, at a comma when there is one, never leaving a word or two alone", () => {
    const comma = cuesFromWords(spoken("Add a generous pinch of salt, because the water should taste like the sea."), { maxLines: 2, durationUs: 60e6 });
    expect(comma.map((cue) => cue.text)).toEqual(["Add a generous pinch of salt,", "because the water should\ntaste like the sea."]);
    // 69 characters that do not fit two lines of 32: two cues in three lines, not a full one and "at home.".
    const even = cuesFromWords(spoken("Today we are going to make a short video about cooking pasta at home."), { maxLines: 2, durationUs: 60e6 });
    expect(even.map((cue) => cue.text)).toEqual(["Today we are going to make a", "short video about\ncooking pasta at home."]);
    expect(phraseCues([], 2, 32)).toEqual([]);
    expect(phraseCues(["a", "b"], 2, 32)).toEqual([2]);
  });

  it("ends a cue at a pause, and holds a cue up to the next one when it follows soon", () => {
    const words = [...spoken("first part", 0), ...spoken("second part", 0.6 + PAUSE_US / 1e6), ...spoken("third", 1.2 + PAUSE_US / 1e6 + 0.4)];
    const cues = cuesFromWords(words, { maxLines: 2, durationUs: 60e6 });
    expect(cues.map((cue) => cue.text)).toEqual(["first part", "second part third"]);
    // After the pause: held HOLD_US past the last word.
    expect(cues[0]?.endUs).toBe(600_000 + HOLD_US);
    // A comma break followed at once: no gap between the cues.
    const joined = cuesFromWords(spoken("This sentence is long enough that it has to break here, and then it goes on for a while"), { maxLines: 2, durationUs: 60e6 });
    expect(joined).toHaveLength(2);
    expect(joined[0]?.endUs).toBe(joined[1]?.startUs);
  });

  it("gives a short cue at least MIN_CUE_US where there is room, and never runs past the audio or the next cue", () => {
    const words: TimedWord[] = [
      { text: "Yes.", startUs: 1_000_000, endUs: 1_100_000 },
      { text: "No.", startUs: 5_000_000, endUs: 5_100_000 },
      { text: "Maybe.", startUs: 5_300_000, endUs: 5_400_000 },
    ];
    const cues = cuesFromWords(words, { maxLines: 2, durationUs: 5_500_000 });
    expect(cues.map((cue) => [cue.startUs, cue.endUs])).toEqual([
      [1_000_000, 1_000_000 + MIN_CUE_US],
      [5_000_000, 5_300_000],
      [5_300_000, 5_500_000],
    ]);
  });

  it("gives no cue without words", () => {
    expect(cuesFromWords([], { maxLines: 2, durationUs: 1e6 })).toEqual([]);
  });
});
