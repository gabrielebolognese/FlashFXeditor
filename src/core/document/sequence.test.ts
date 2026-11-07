import { describe, expect, it } from "vitest";
import { frameFileName, parsePattern, sequenceDurationUs, sequenceRecordIssues } from "./sequence.js";

describe("frame patterns", () => {
  it("parses %d and %0Nd patterns with an affix", () => {
    expect(parsePattern("frame_%05d.png")).toEqual({ prefix: "frame_", width: 5, suffix: "", extension: "png" });
    expect(parsePattern("a%d_x.WEBP")).toMatchObject({ width: 0, suffix: "_x", extension: "webp" });
  });
  it("refuses folders, two numbers, other extensions and no number", () => {
    for (const bad of ["a/f_%d.png", "f_%d_%d.png", "f_%d.jpg", "f.png", "f_%00d.png"]) expect(parsePattern(bad)).toBeNull();
  });
  it("names frame n", () => {
    expect(frameFileName("f_%04d.png", 7)).toBe("f_0007.png");
    expect(frameFileName("f_%d.png", 12)).toBe("f_12.png");
    expect(frameFileName("f_%d.png", -1)).toBeNull();
    expect(frameFileName("nope", 1)).toBeNull();
  });
});

describe("sequence records", () => {
  const ok = { dir: "media/s", pattern: "f_%d.png", first: 0, count: 30, fps: { num: 30, den: 1 } };
  it("lasts count frames at its rate, in integer microseconds", () => {
    expect(sequenceDurationUs(ok)).toBe(1_000_000);
    expect(sequenceDurationUs({ count: 30, fps: { num: 30000, den: 1001 } })).toBe(1_001_000);
  });
  it("has no issues when valid and names each problem otherwise", () => {
    expect(sequenceRecordIssues(ok)).toEqual([]);
    expect(sequenceRecordIssues({ ...ok, count: 0, first: -1 })).toHaveLength(2);
    expect(sequenceRecordIssues({ ...ok, dir: "../x" })).toHaveLength(1);
    expect(sequenceRecordIssues({ ...ok, fps: { num: 0, den: 1 } })).toHaveLength(1);
    expect(sequenceRecordIssues({ ...ok, pattern: "x.png" })).toHaveLength(1);
  });
});
