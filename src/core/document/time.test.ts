import { describe, expect, it } from "vitest";
import { FPS_30, formatDurationUs, formatTimecode, frameToUs, parseTimecode, ticksToUs, usPerFrame, usToFrame } from "./time.js";
import type { Rational } from "./types.js";

const NTSC: Rational = { num: 30000, den: 1001 };
const FPS_24: Rational = { num: 24, den: 1 };
const FPS_60: Rational = { num: 60, den: 1 };

describe("frameToUs / usToFrame", () => {
  it("converts integer rates exactly", () => {
    expect(frameToUs(30, FPS_30)).toBe(1_000_000);
    expect(frameToUs(1, FPS_30)).toBe(33_333);
    expect(frameToUs(2, FPS_30)).toBe(66_667);
    expect(usToFrame(1_000_000, FPS_30)).toBe(30);
    expect(frameToUs(1, FPS_24)).toBe(41_667);
  });

  it("round-trips every frame of one hour at 30000/1001", () => {
    const framesPerHour = Math.ceil((3600 * NTSC.num) / NTSC.den);
    for (let frame = 0; frame <= framesPerHour; frame++) {
      if (usToFrame(frameToUs(frame, NTSC), NTSC) !== frame) throw new Error(`frame ${frame} did not round-trip`);
    }
    expect(usToFrame(frameToUs(framesPerHour, NTSC), NTSC)).toBe(framesPerHour);
  });

  it("round-trips one hour at 24, 25, 50 and 60 fps", () => {
    for (const fps of [FPS_24, { num: 25, den: 1 }, { num: 50, den: 1 }, FPS_60]) {
      for (let frame = 0; frame <= 3600 * fps.num; frame++) {
        if (usToFrame(frameToUs(frame, fps), fps) !== frame) throw new Error(`${fps.num} fps frame ${frame}`);
      }
    }
  });

  it("does not drift at 29.97 over 10 minutes (each frame within 0.5 us of the exact time)", () => {
    const frames = Math.ceil((600 * NTSC.num) / NTSC.den);
    let maxError = 0;
    for (let frame = 0; frame <= frames; frame++) {
      const exact = (frame * 1_000_000 * NTSC.den) / NTSC.num;
      maxError = Math.max(maxError, Math.abs(frameToUs(frame, NTSC) - exact));
    }
    expect(maxError).toBeLessThanOrEqual(0.5);
    // Summing per-frame durations lands on the same time as the direct conversion.
    let sum = 0;
    for (let frame = 0; frame < frames; frame++) sum += frameToUs(frame + 1, NTSC) - frameToUs(frame, NTSC);
    expect(sum).toBe(frameToUs(frames, NTSC));
  });

  it("rounds negative values symmetrically", () => {
    expect(frameToUs(-1, FPS_30)).toBe(-33_333);
    expect(usToFrame(-1_000_000, FPS_30)).toBe(-30);
  });

  it("exposes the frame duration", () => {
    expect(usPerFrame(FPS_30)).toBeCloseTo(33_333.333, 2);
    expect(usPerFrame(NTSC)).toBeCloseTo(33_366.667, 2);
  });
});

describe("formatTimecode", () => {
  it("formats mm:ss:ff and adds hours only when needed", () => {
    expect(formatTimecode(0, FPS_30)).toBe("00:00:00");
    expect(formatTimecode(29, FPS_30)).toBe("00:00:29");
    expect(formatTimecode(30, FPS_30)).toBe("00:01:00");
    expect(formatTimecode(30 * 61 + 5, FPS_30)).toBe("01:01:05");
    expect(formatTimecode(30 * 3600, FPS_30)).toBe("01:00:00:00");
    expect(formatTimecode(-15, FPS_30)).toBe("-00:00:15");
  });

  it("formats mm:ss.mmm", () => {
    expect(formatTimecode(0, FPS_30, "ms")).toBe("00:00.000");
    expect(formatTimecode(1, FPS_30, "ms")).toBe("00:00.033");
    expect(formatTimecode(45, FPS_30, "ms")).toBe("00:01.500");
    expect(formatTimecode(30 * 3600, FPS_30, "ms")).toBe("01:00:00.000");
  });

  it("keeps 29.97 seconds on wall-clock time (10 minutes reads 10:00)", () => {
    const tenMinutes = parseTimecode("10:00:00", NTSC);
    expect(tenMinutes).toBe(17983);
    expect(formatTimecode(17983, NTSC)).toBe("10:00:00");
    expect(formatTimecode(17982, NTSC)).toBe("09:59:29");
    expect(frameToUs(17983, NTSC) - 600_000_000).toBeLessThan(usPerFrame(NTSC));
    expect(frameToUs(17983, NTSC)).toBeGreaterThanOrEqual(600_000_000);
  });

  it("round-trips format -> parse for every frame of 10 minutes", () => {
    for (const fps of [FPS_30, NTSC, FPS_24, FPS_60]) {
      for (const mode of ["frames", "ms"] as const) {
        const frames = Math.ceil((600 * fps.num) / fps.den);
        for (let frame = 0; frame <= frames; frame++) {
          if (parseTimecode(formatTimecode(frame, fps, mode), fps, { mode }) !== frame) {
            throw new Error(`${fps.num}/${fps.den} ${mode} frame ${frame}: ${formatTimecode(frame, fps, mode)}`);
          }
        }
      }
    }
  });
});

describe("parseTimecode", () => {
  it("parses absolute timecodes with right-aligned fields", () => {
    expect(parseTimecode("00:01:15", FPS_30)).toBe(45);
    expect(parseTimecode("1:00:00:00", FPS_30)).toBe(108_000);
    expect(parseTimecode("2:15", FPS_30)).toBe(75);
    expect(parseTimecode("2.15", FPS_30)).toBe(75);
    expect(parseTimecode("2.", FPS_30)).toBe(60);
    expect(parseTimecode("  45 ", FPS_30)).toBe(45);
    expect(parseTimecode("00:00:45", FPS_30)).toBe(45);
  });

  it("parses relative input: +30 / -15 frames, +2. seconds", () => {
    expect(parseTimecode("+30", FPS_30, { current: 100 })).toBe(130);
    expect(parseTimecode("-15", FPS_30, { current: 100 })).toBe(85);
    expect(parseTimecode("+2.", FPS_30, { current: 100 })).toBe(160);
    expect(parseTimecode("-2.", FPS_30, { current: 100 })).toBe(40);
    expect(parseTimecode("+1.15", FPS_30, { current: 0 })).toBe(45);
    expect(parseTimecode("-50", FPS_30, { current: 10 })).toBe(0);
  });

  it("parses ms mode, where the dot starts decimal seconds", () => {
    expect(parseTimecode("00:01.500", FPS_30, { mode: "ms" })).toBe(45);
    expect(parseTimecode("1:00.000", FPS_30, { mode: "ms" })).toBe(1800);
    expect(parseTimecode("+2.", FPS_30, { mode: "ms", current: 10 })).toBe(70);
    expect(parseTimecode("+0.5", FPS_30, { mode: "ms", current: 10 })).toBe(25);
    expect(parseTimecode("+30", FPS_30, { mode: "ms", current: 10 })).toBe(40);
  });

  it("rejects invalid input", () => {
    for (const text of ["", " ", "+", "abc", "1:2:3:4:5", ".", "1..2x", "1:a", "--5"]) {
      expect(parseTimecode(text, FPS_30), text).toBeNull();
    }
    expect(parseTimecode("1.2.3", FPS_30, { mode: "ms" })).toBeNull();
  });
});

describe("ticksToUs", () => {
  it("converts track ticks to the nearest microsecond", () => {
    expect(ticksToUs(90_000, 90_000)).toBe(1_000_000);
    expect(ticksToUs(1001, 30_000)).toBe(33_367);
    expect(ticksToUs(20, 600)).toBe(33_333);
    expect(ticksToUs(44_100 * 61 + 1, 44_100)).toBe(61_000_023);
    // One hour at a 90 kHz timescale stays exact.
    expect(ticksToUs(90_000 * 3600, 90_000)).toBe(3_600_000_000);
  });
});

describe("formatDurationUs", () => {
  it("formats badges in whole seconds, at least 1 s when not empty", () => {
    expect(formatDurationUs(0)).toBe("00:00");
    expect(formatDurationUs(400_000)).toBe("00:01");
    expect(formatDurationUs(12_499_999)).toBe("00:12");
    expect(formatDurationUs(12_500_000)).toBe("00:13");
    expect(formatDurationUs(3_723_000_000)).toBe("01:02:03");
  });

  it("formats precise durations with milliseconds", () => {
    expect(formatDurationUs(12_345_678, true)).toBe("00:12.345");
    expect(formatDurationUs(61_000_023, true)).toBe("01:01.000");
  });
});
