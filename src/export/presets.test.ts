import { describe, expect, it } from "vitest";
import { createProject } from "../core/document/project.js";
import type { Rational } from "../core/document/types.js";
import { exportFormat, exportFps, exportSize, fillFileName, FILE_NAME_TEMPLATE, REELS_PRESET } from "./presets.js";

const fps = (num: number, den = 1): Rational => ({ num, den });

describe("exportSize", () => {
  it("keeps a project at the preset's size or smaller as it is", () => {
    expect(exportSize(1080, 1920, REELS_PRESET)).toEqual({ width: 1080, height: 1920 });
    expect(exportSize(1080, 1080, REELS_PRESET)).toEqual({ width: 1080, height: 1080 });
    expect(exportSize(720, 1280, REELS_PRESET)).toEqual({ width: 720, height: 1280 });
  });

  it("scales a larger project down to the preset's long edge, keeping its aspect", () => {
    expect(exportSize(2160, 3840, REELS_PRESET)).toEqual({ width: 1080, height: 1920 });
    expect(exportSize(3840, 2160, REELS_PRESET)).toEqual({ width: 1920, height: 1080 });
    expect(exportSize(2160, 2160, REELS_PRESET)).toEqual({ width: 1920, height: 1920 });
  });

  it("makes both sides even, rounding down so nothing is scaled up", () => {
    expect(exportSize(1081, 1921, REELS_PRESET)).toEqual({ width: 1080, height: 1920 });
    expect(exportSize(721, 1281, REELS_PRESET)).toEqual({ width: 720, height: 1280 });
    expect(exportSize(1, 1, REELS_PRESET)).toEqual({ width: 2, height: 2 });
    // Scaled sides land on the preset's edge exactly, whatever the float error.
    for (const long of [1921, 1923, 2001, 2999, 3841, 7681]) {
      const size = exportSize(Math.round(long * 0.5625), long, REELS_PRESET);
      expect(size.height).toBe(1920);
      expect(size.width % 2).toBe(0);
      expect(size.width).toBeLessThanOrEqual(1080);
    }
  });
});

describe("exportFps", () => {
  it("keeps rates up to the cap", () => {
    for (const rate of [fps(24000, 1001), fps(24), fps(25), fps(30000, 1001), fps(30)]) expect(exportFps(rate, fps(30))).toEqual(rate);
  });

  it("divides higher rates by the smallest whole number that brings them under the cap", () => {
    expect(exportFps(fps(60), fps(30))).toEqual(fps(30));
    expect(exportFps(fps(60000, 1001), fps(30))).toEqual(fps(30000, 1001));
    expect(exportFps(fps(50), fps(30))).toEqual(fps(25));
    expect(exportFps(fps(120), fps(30))).toEqual(fps(30));
    expect(exportFps(fps(60), fps(60))).toEqual(fps(60));
  });
});

describe("exportFormat", () => {
  it("gives the Reels preset's codec, bitrates and keyframe interval at the project's size", () => {
    const project = createProject({ id: "p", name: "P", now: "2026-10-18T00:00:00.000Z", appVersion: "0" });
    expect(exportFormat(project, REELS_PRESET)).toEqual({
      width: 1080,
      height: 1920,
      fps: fps(30),
      codec: "avc",
      videoBitrate: 12_000_000,
      keyframeSeconds: 2,
      audioBitrate: 192_000,
      sampleRate: 48000,
      channels: 2,
    });
  });
});

describe("fillFileName", () => {
  it("fills the spec's template with the project, the preset and the local day", () => {
    expect(fillFileName(FILE_NAME_TEMPLATE, { project: "My short", preset: "reels", date: new Date(2026, 9, 8, 23, 59) })).toBe("My short-reels-2026-10-08.mp4");
  });

  it("leaves other text alone and fills repeated fields", () => {
    expect(fillFileName("{date} {project} {date} {other}", { project: "A", preset: "b", date: new Date(2027, 0, 2) })).toBe("2027-01-02 A 2027-01-02 {other}");
  });
});
