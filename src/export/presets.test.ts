import { describe, expect, it } from "vitest";
import { createProject } from "../core/document/project.js";
import type { Project, Rational } from "../core/document/types.js";
import {
  autoBitrate,
  customFrom,
  DEFAULT_CUSTOM_SETTINGS,
  estimateBytes,
  exportFormat,
  exportFps,
  exportSize,
  fillFileName,
  FILE_NAME_TEMPLATE,
  formatSummary,
  fpsChoices,
  presetSlug,
  REELS_PRESET,
  sanitizeExportSettings,
  sanitizeUserPresets,
  SHORTS_PRESET,
  TIKTOK_PRESET,
  withExtension,
  type ExportSettings,
} from "./presets.js";

const fps = (num: number, den = 1): Rational => ({ num, den });
const REELS = REELS_PRESET.settings;

function project(width = 1080, height = 1920, rate: Rational = fps(30)): Project {
  const p = createProject({ id: "p", name: "P", now: "2026-10-18T00:00:00.000Z", appVersion: "0" });
  return { ...p, settings: { ...p.settings, width, height, fps: rate } };
}

describe("exportSize", () => {
  it("keeps a project at the preset's size or smaller as it is", () => {
    expect(exportSize(1080, 1920, REELS)).toEqual({ width: 1080, height: 1920 });
    expect(exportSize(1080, 1080, REELS)).toEqual({ width: 1080, height: 1080 });
    expect(exportSize(720, 1280, REELS)).toEqual({ width: 720, height: 1280 });
  });

  it("scales a larger project down to the preset's long edge, keeping its aspect", () => {
    expect(exportSize(2160, 3840, REELS)).toEqual({ width: 1080, height: 1920 });
    expect(exportSize(3840, 2160, REELS)).toEqual({ width: 1920, height: 1080 });
    expect(exportSize(2160, 2160, REELS)).toEqual({ width: 1920, height: 1920 });
  });

  it("makes both sides even, rounding down so nothing is scaled up", () => {
    expect(exportSize(1081, 1921, REELS)).toEqual({ width: 1080, height: 1920 });
    expect(exportSize(721, 1281, REELS)).toEqual({ width: 720, height: 1280 });
    expect(exportSize(1, 1, REELS)).toEqual({ width: 2, height: 2 });
    // Scaled sides land on the preset's edge exactly, whatever the float error.
    for (const long of [1921, 1923, 2001, 2999, 3841, 7681]) {
      const size = exportSize(Math.round(long * 0.5625), long, REELS);
      expect(size.height).toBe(1920);
      expect(size.width % 2).toBe(0);
      expect(size.width).toBeLessThanOrEqual(1080);
    }
  });

  it("applies the resolution scale before the cap (Custom: no cap)", () => {
    const custom = { ...DEFAULT_CUSTOM_SETTINGS };
    expect(exportSize(2160, 3840, custom)).toEqual({ width: 2160, height: 3840 });
    expect(exportSize(2160, 3840, { ...custom, scale: 75 })).toEqual({ width: 1620, height: 2880 });
    expect(exportSize(1080, 1920, { ...custom, scale: 50 })).toEqual({ width: 540, height: 960 });
    expect(exportSize(1080, 1920, { ...REELS, scale: 75 })).toEqual({ width: 810, height: 1440 });
  });

  it("gives YouTube Shorts 2160x3840 for a 4K project and 1080x1920 otherwise", () => {
    const shorts = SHORTS_PRESET.settings;
    expect(exportSize(2160, 3840, shorts)).toEqual({ width: 2160, height: 3840 });
    expect(exportSize(1440, 2560, shorts)).toEqual({ width: 1080, height: 1920 });
    expect(exportSize(1080, 1920, shorts)).toEqual({ width: 1080, height: 1920 });
    expect(exportSize(4320, 7680, shorts)).toEqual({ width: 2160, height: 3840 });
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

  it("offers Custom the project's rate and its whole divisions down to about 10 fps", () => {
    expect(fpsChoices(fps(60))).toEqual([fps(60), fps(30), fps(20), fps(15), fps(12), fps(10)]);
    expect(fpsChoices(fps(30))).toEqual([fps(30), fps(15), fps(10)]);
    expect(fpsChoices(fps(30000, 1001))).toEqual([fps(30000, 1001), fps(15000, 1001), fps(10000, 1001)]);
    expect(fpsChoices(fps(24))).toEqual([fps(24), fps(12)]);
    // Each choice gives itself back as a cap.
    for (const rate of fpsChoices(fps(60))) expect(exportFps(fps(60), rate)).toEqual(rate);
  });
});

describe("exportFormat", () => {
  it("gives the Reels preset's codec, bitrates and keyframe interval at the project's size", () => {
    expect(exportFormat(project(), REELS)).toEqual({
      width: 1080,
      height: 1920,
      fps: fps(30),
      codec: "avc",
      bitrateMode: "variable",
      videoBitrate: 12_000_000,
      maxBitrate: 12_000_000,
      keyframeSeconds: 2,
      audioBitrate: 192_000,
      hardware: "no-preference",
      sampleRate: 48000,
      channels: 2,
    });
    expect(exportFormat(project(), TIKTOK_PRESET.settings).videoBitrate).toBe(10_000_000);
  });

  it("gives Shorts 60 fps for a 60 fps project and YouTube's bitrate for its output", () => {
    const sixty = exportFormat(project(1080, 1920, fps(60)), SHORTS_PRESET.settings);
    expect(sixty).toMatchObject({ width: 1080, height: 1920, fps: fps(60), videoBitrate: 12_000_000, maxBitrate: 18_000_000 });
    const thirty = exportFormat(project(), SHORTS_PRESET.settings);
    expect(thirty).toMatchObject({ fps: fps(30), videoBitrate: 8_000_000 });
    const uhd = exportFormat(project(2160, 3840, fps(30)), SHORTS_PRESET.settings);
    expect(uhd).toMatchObject({ width: 2160, height: 3840, videoBitrate: 45_000_000 });
    expect(autoBitrate(720, 1280, fps(60))).toBe(7_500_000);
    expect(autoBitrate(1440, 2560, fps(30))).toBe(16_000_000);
  });

  it("keeps the peak at least the target, and equal to it for a constant bitrate", () => {
    const settings: ExportSettings = { ...DEFAULT_CUSTOM_SETTINGS, videoBitrate: 20_000_000, maxBitrate: 8_000_000 };
    expect(exportFormat(project(), settings).maxBitrate).toBe(20_000_000);
    expect(exportFormat(project(), { ...settings, maxBitrate: 30_000_000 }).maxBitrate).toBe(30_000_000);
    expect(exportFormat(project(), { ...settings, maxBitrate: 30_000_000, bitrateMode: "constant" }).maxBitrate).toBe(20_000_000);
  });
});

describe("customFrom", () => {
  it("gives Custom settings with the same output as the preset", () => {
    for (const [w, h, rate] of [
      [1080, 1920, fps(30)],
      [2160, 3840, fps(60)],
      [1440, 2560, fps(30)],
      [720, 1280, fps(25)],
    ] as const) {
      const p = project(w, h, rate);
      for (const preset of [REELS_PRESET, TIKTOK_PRESET, SHORTS_PRESET]) {
        const custom = customFrom(preset.settings, p);
        expect(custom.maxLongEdge).toBeNull();
        expect(typeof custom.videoBitrate).toBe("number");
        expect(exportFormat(p, custom)).toEqual(exportFormat(p, preset.settings));
      }
    }
  });
});

describe("estimateBytes and formatSummary", () => {
  it("estimates the size from both bitrates, with about 1% of container", () => {
    expect(estimateBytes({ videoBitrate: 12_000_000, audioBitrate: 192_000 }, 60)).toBe(Math.round((12_192_000 * 60 * 1.01) / 8));
    expect(estimateBytes({ videoBitrate: 12_000_000, audioBitrate: 192_000 }, 0)).toBe(0);
  });

  it("summarizes a format in one line", () => {
    expect(formatSummary(exportFormat(project(), REELS))).toBe("1080×1920 · 30 fps · H.264 · 12 Mbps · AAC 192 kbps");
    expect(formatSummary(exportFormat(project(1080, 1920, fps(30000, 1001)), { ...REELS, videoBitrate: 7_500_000, bitrateMode: "constant", codec: "hevc" }))).toBe(
      "1080×1920 · 29.97 fps · HEVC · 7.5 Mbps CBR · AAC 192 kbps",
    );
  });
});

describe("file names", () => {
  it("fills the spec's template with the project, the preset and the local day", () => {
    expect(fillFileName(FILE_NAME_TEMPLATE, { project: "My short", preset: "reels", date: new Date(2026, 9, 8, 23, 59) })).toBe("My short-reels-2026-10-08.mp4");
  });

  it("leaves other text alone and fills repeated fields", () => {
    expect(fillFileName("{date} {project} {date} {other}", { project: "A", preset: "b", date: new Date(2027, 0, 2) })).toBe("2027-01-02 A 2027-01-02 {other}");
  });

  it("puts the export's extension at the end, replacing a known one", () => {
    expect(withExtension("clip.mp4", "mp4")).toBe("clip.mp4");
    expect(withExtension("clip.mp4", "wav")).toBe("clip.wav");
    expect(withExtension("clip", "m4a")).toBe("clip.m4a");
    expect(withExtension("v1.2 final.MP4", "png")).toBe("v1.2 final.png");
    expect(withExtension("  .mp4 ", "mp4")).toBe("export.mp4");
  });

  it("names presets by id, one's own by a slug of the name", () => {
    expect(presetSlug(REELS_PRESET)).toBe("reels");
    expect(presetSlug({ id: "custom", name: "Custom" })).toBe("custom");
    expect(presetSlug({ id: "u1", name: "My 4K Master!" })).toBe("my-4k-master");
    expect(presetSlug({ id: "u2", name: "***" })).toBe("preset");
  });
});

describe("sanitizing", () => {
  it("keeps valid settings and replaces each invalid field by its fallback", () => {
    const valid: ExportSettings = { ...DEFAULT_CUSTOM_SETTINGS, codec: "av1", scale: 75, fps: fps(15), bitrateMode: "constant", videoBitrate: 5_000_000, maxBitrate: "auto", keyframeSeconds: 1, audioBitrate: 320_000, hardware: "prefer-software" };
    expect(sanitizeExportSettings(JSON.parse(JSON.stringify(valid)))).toEqual(valid);
    const broken = sanitizeExportSettings({ codec: "vp9", scale: 60, fps: { num: 0, den: 1 }, videoBitrate: 1, maxBitrate: "x", keyframeSeconds: 5, audioBitrate: 100, hardware: 1, maxLongEdge: 2.5, maxLongEdge4k: null });
    expect(broken).toEqual({ ...DEFAULT_CUSTOM_SETTINGS, maxLongEdge4k: null });
    expect(sanitizeExportSettings(null)).toEqual(DEFAULT_CUSTOM_SETTINGS);
    expect(sanitizeExportSettings({ fps: { num: 60000, den: 2002 } }).fps).toEqual(fps(30000, 1001));
  });

  it("keeps one's own presets with unique ids and a name, never a built-in id", () => {
    const presets = sanitizeUserPresets([
      { id: "a", name: " Mine ", settings: { codec: "hevc" } },
      { id: "a", name: "Duplicate" },
      { id: "reels", name: "Shadow" },
      { id: "b", name: "" },
      { id: "c", name: "x".repeat(80), settings: null },
      "junk",
    ]);
    expect(presets.map((p) => [p.id, p.name.length])).toEqual([
      ["a", 4],
      ["c", 40],
    ]);
    expect(presets[0]?.settings.codec).toBe("hevc");
    expect(sanitizeUserPresets("x")).toEqual([]);
  });
});
