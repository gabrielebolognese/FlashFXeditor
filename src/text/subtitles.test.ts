import { describe, expect, it } from "vitest";
import { random } from "../timeline/edit/fuzzKit.js";
import { formatSubtitles, formatTimestamp, parseSrt, parseSubtitles, parseTimestamp, parseVtt, subtitleFormat } from "./subtitles.js";

describe("timestamps", () => {
  it("reads SRT and VTT times, lenient about hours, separators and fraction digits", () => {
    expect(parseTimestamp("00:01:02,345")).toBe(62_345_000);
    expect(parseTimestamp("01:02.345")).toBe(62_345_000);
    expect(parseTimestamp("1:00:00.5")).toBe(3_600_500_000);
    expect(parseTimestamp("100:00:00,000")).toBe(360_000_000_000);
    expect(parseTimestamp("00:00:07")).toBe(7_000_000);
    expect(parseTimestamp("00:61:00,000")).toBeNull();
    expect(parseTimestamp("abc")).toBeNull();
  });

  it("writes them to the nearest millisecond", () => {
    expect(formatTimestamp(62_345_400, "srt")).toBe("00:01:02,345");
    expect(formatTimestamp(62_345_600, "vtt")).toBe("00:01:02.346");
    expect(formatTimestamp(3_600_000_000 * 12, "srt")).toBe("12:00:00,000");
    expect(formatTimestamp(-5, "srt")).toBe("00:00:00,000");
  });
});

describe("parseSrt", () => {
  it("reads numbered blocks with multi-line text, a BOM and CRLF line ends", () => {
    const file = "﻿1\r\n00:00:01,000 --> 00:00:02,500\r\nHello\r\nworld\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nSecond\r\n";
    const { cues, skipped, format } = parseSrt(file);
    expect(format).toBe("srt");
    expect(skipped).toBe(0);
    expect(cues).toEqual([
      { startUs: 1_000_000, endUs: 2_500_000, text: "Hello\nworld" },
      { startUs: 3_000_000, endUs: 4_000_000, text: "Second" },
    ]);
  });

  it("drops markup, skips blocks without timing and splits blocks that lost their blank line", () => {
    const file = [
      "garbage block",
      "",
      "",
      "1",
      "00:00:01,000 --> 00:00:02,000 X1:10 X2:20",
      "<i>Italic</i> {\\an8}top",
      "2",
      "00:00:02,000 --> 00:00:03,000",
      "<font face=\"Arial\">Red</font>",
      "   ",
      "3",
      "00:00:05,000 --> 00:00:04,000",
      "backwards",
    ].join("\n");
    const { cues, skipped } = parseSrt(file);
    expect(cues.map((cue) => cue.text)).toEqual(["Italic top", "Red"]);
    expect(cues[1]).toMatchObject({ startUs: 2_000_000, endUs: 3_000_000 });
    expect(skipped).toBe(2);
  });

  it("keeps a cue with no text (an empty block after the timing)", () => {
    expect(parseSrt("1\n00:00:00,000 --> 00:00:01,000\n").cues).toEqual([{ startUs: 0, endUs: 1_000_000, text: "" }]);
  });
});

describe("parseVtt", () => {
  it("skips the header, notes and style blocks, reads identifiers, settings, tags and entities", () => {
    const file = [
      "WEBVTT - with a title",
      "Kind: captions",
      "",
      "NOTE this is",
      "a comment",
      "",
      "STYLE",
      "::cue { color: red }",
      "",
      "intro",
      "00:01.000 --> 00:02.000 line:90% align:center",
      "<v Bob>Hi &amp; <b>welcome</b></v>",
      "&lt;tag&gt; &#65;&#x42;",
      "",
      "00:00:03.000 --> 00:00:04.000",
      "Next",
    ].join("\r\n");
    const { cues, skipped } = parseVtt(file);
    expect(skipped).toBe(0);
    expect(cues).toEqual([
      { startUs: 1_000_000, endUs: 2_000_000, text: "Hi & welcome\n<tag> AB" },
      { startUs: 3_000_000, endUs: 4_000_000, text: "Next" },
    ]);
  });

  it("turns inline timestamps into word timings (karaoke)", () => {
    const { cues } = parseVtt("WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nNever <00:00:01.500>drink <00:00:02.000>liquid nitrogen\n");
    expect(cues[0]?.text).toBe("Never drink liquid nitrogen");
    expect(cues[0]?.words).toEqual([
      { text: "Never", startUs: 1_000_000, endUs: 1_500_000 },
      { text: "drink", startUs: 1_500_000, endUs: 2_000_000 },
      { text: "liquid", startUs: 2_000_000, endUs: 2_500_000 },
      { text: "nitrogen", startUs: 2_500_000, endUs: 3_000_000 },
    ]);
  });
});

describe("format detection", () => {
  it("is VTT with a WEBVTT header or a .vtt name, else SRT", () => {
    expect(subtitleFormat("﻿WEBVTT\n\n")).toBe("vtt");
    expect(subtitleFormat("00:01.000 --> 00:02.000\nx", "a.VTT")).toBe("vtt");
    expect(subtitleFormat("1\n00:00:01,000 --> 00:00:02,000\nx", "a.srt")).toBe("srt");
    expect(parseSubtitles("WEBVTT\n\n00:01.000 --> 00:02.000\nx").format).toBe("vtt");
  });
});

describe("formatSubtitles", () => {
  const cues = [
    { startUs: 0, endUs: 1_234_567, text: "One\n\nline & <two>" },
    { startUs: 2_000_000, endUs: 3_000_000, text: "   " },
    { startUs: 3_600_000_000, endUs: 3_601_000_000, text: "Late" },
  ];

  it("writes SRT blocks numbered from 1, empty cues left out", () => {
    expect(formatSubtitles(cues, "srt")).toBe("1\n00:00:00,000 --> 00:00:01,235\nOne\nline & <two>\n\n2\n01:00:00,000 --> 01:00:01,000\nLate\n");
  });

  it("writes VTT with the header and escaped text", () => {
    expect(formatSubtitles(cues, "vtt")).toBe("WEBVTT\n\n00:00:00.000 --> 00:00:01.235\nOne\nline &amp; &lt;two&gt;\n\n01:00:00.000 --> 01:00:01.000\nLate\n");
  });

  it("reads back what it writes, in both formats", () => {
    const sample = [
      { startUs: 1_000_000, endUs: 2_000_000, text: "A & B" },
      { startUs: 2_000_000, endUs: 4_500_000, text: "two\nlines" },
    ];
    for (const format of ["srt", "vtt"] as const) expect(parseSubtitles(formatSubtitles(sample, format)).cues).toEqual(sample);
  });
});

describe("round trips and edge cases (Batch 47)", () => {
  /** What a written text reads back as: lines trimmed, blank lines closed up (subtitles.ts `writableText`). */
  const readBack = (text: string) =>
    text
      .split(/\r\n?|\n/)
      .map((line) => line.trim())
      .filter((line) => line !== "")
      .join("\n");
  const ms = (us: number) => Math.max(0, Math.round(us / 1000)) * 1000;

  // SRT writes text as it is (no escaping), so its lines hold no markup; VTT escapes &, < and >.
  const SRT_LINES = ["Hello", "Ünïcødé text", "Emoji 🎬🔥👍🏽", "\u200Fمرحبا بالعالم", "שלום\u200E", "A & B", "12345", "a -> b", "tab\tinside", "  padded  ", "", "   ", " \t ", "x\u00A0y", "Ça va? ¡Sí!"];
  const VTT_LINES = [...SRT_LINES, "<i>not a tag</i>", "a < b > c", "&amp; stays literal", "x --> y", "<00:00:01.000>no karaoke", "&lt;3"];

  function randomCues(seed: number, lines: readonly string[], count: number) {
    const rng = random(seed);
    let at = rng.int(0, 5_000_000);
    return Array.from({ length: count }, () => {
      // Now and then hours past 99 (a 3-digit hour field).
      const startUs = rng.chance(0.05) ? rng.int(100, 400) * 3_600_000_000 + rng.int(0, 3_599_999_999) : (at += rng.int(0, 4_000_000));
      const endUs = startUs + rng.int(0, 6_000_000);
      const text = Array.from({ length: rng.int(1, 4) }, () => rng.pick(lines)).join(rng.pick(["\n", "\r\n", "\n\n"]));
      return { startUs, endUs, text };
    });
  }

  it("reads back the times (to the millisecond) and the text of random cues, in both formats", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      for (const format of ["srt", "vtt"] as const) {
        const cues = randomCues(seed, format === "srt" ? SRT_LINES : VTT_LINES, 60);
        const parsed = parseSubtitles(formatSubtitles(cues, format));
        const expected = cues.filter((cue) => readBack(cue.text) !== "").map((cue) => ({ startUs: ms(cue.startUs), endUs: ms(cue.endUs), text: readBack(cue.text) }));
        expect(parsed, `seed ${seed} ${format}`).toEqual({ format, cues: expected, skipped: 0 });
      }
    }
  });

  it("reads files with CR-only line ends and whitespace-only separator lines", () => {
    const srt = "1\r00:00:01,000 --> 00:00:02,000\rOne\rtwo\r\r2\r00:00:03,000 --> 00:00:04,000\rThree\r";
    expect(parseSrt(srt).cues).toEqual([
      { startUs: 1_000_000, endUs: 2_000_000, text: "One\ntwo" },
      { startUs: 3_000_000, endUs: 4_000_000, text: "Three" },
    ]);
    const vtt = "WEBVTT\r\r00:01.000 --> 00:02.000\rOne\r \t\r00:03.000 --> 00:04.000\rTwo";
    expect(parseVtt(vtt).cues.map((cue) => cue.text)).toEqual(["One", "Two"]);
    const spaced = "1\n00:00:01,000 --> 00:00:02,000\nA\n   \n2\n00:00:03,000 --> 00:00:04,000\nB\n\t\n";
    expect(parseSrt(spaced)).toEqual({ format: "srt", cues: [{ startUs: 1_000_000, endUs: 2_000_000, text: "A" }, { startUs: 3_000_000, endUs: 4_000_000, text: "B" }], skipped: 0 });
  });

  it("reads a file with only the WEBVTT header as no cues", () => {
    for (const text of ["WEBVTT", "WEBVTT\n", "\uFEFFWEBVTT\r\n\r\n", "WEBVTT - a title\n\nNOTE nothing here\n"]) expect(parseSubtitles(text)).toEqual({ format: "vtt", cues: [], skipped: 0 });
    expect(parseSubtitles("")).toEqual({ format: "srt", cues: [], skipped: 0 });
  });

  it("parses a huge file (10,000 cues) in reasonable time", () => {
    const cues = Array.from({ length: 10_000 }, (_, i) => ({ startUs: i * 2_000_000, endUs: i * 2_000_000 + 1_500_000, text: `Line ${i}\nsecond line & more` }));
    for (const format of ["srt", "vtt"] as const) {
      const text = formatSubtitles(cues, format);
      const t0 = performance.now();
      const parsed = parseSubtitles(text);
      const elapsed = performance.now() - t0;
      expect(parsed.cues).toHaveLength(10_000);
      expect(parsed.cues[9_999]).toEqual(cues[9_999]);
      // About 50 ms here; generous for a loaded parallel run.
      expect(elapsed).toBeLessThan(5_000);
    }
  });
});
