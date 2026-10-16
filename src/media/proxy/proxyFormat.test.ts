import { describe, expect, it } from "vitest";
import type { MediaItem } from "../../core/document/types.js";
import { avcLevel, halvingSteps, proxyCodecs, proxySize, wantsProxy } from "./proxyFormat.js";

const video = (width: number, height: number, num: number, den = 1): MediaItem => ({
  id: "m",
  kind: "video",
  name: "v.mp4",
  file: { relPath: "media/v.mp4" },
  durationUs: 1_000_000,
  width,
  height,
  fps: { num, den },
  hasAudio: false,
  analysis: { thumbs: "pending", peaks: "none" },
  addedAt: "2026-10-16T00:00:00.000Z",
});

describe("proxySize", () => {
  it("scales the short edge to the target, keeping the aspect", () => {
    expect(proxySize(3840, 2160, 540)).toEqual({ width: 960, height: 540 });
    expect(proxySize(1080, 1920, 540)).toEqual({ width: 540, height: 960 });
    expect(proxySize(2160, 3840, 720)).toEqual({ width: 720, height: 1280 });
  });

  it("keeps both sides even and never scales up", () => {
    expect(proxySize(1920, 1080, 360)).toEqual({ width: 640, height: 360 });
    // 4096x2160 -> 1024 x 540 exactly; 2048x858 (2.39:1) -> 1289 rounds to an even 1288.
    expect(proxySize(4096, 2160, 540)).toEqual({ width: 1024, height: 540 });
    expect(proxySize(2048, 858, 540)).toEqual({ width: 1288, height: 540 });
    expect(proxySize(640, 360, 540)).toEqual({ width: 640, height: 360 });
    expect(proxySize(641, 361, 540)).toEqual({ width: 642, height: 362 });
  });
});

describe("avcLevel / proxyCodecs", () => {
  it("picks the lowest level holding the size and rate", () => {
    expect(avcLevel(960, 540, 30)).toBe(0x1f);
    expect(avcLevel(960, 540, 60)).toBe(0x20);
    expect(avcLevel(960, 540, 120)).toBe(0x28);
    expect(avcLevel(640, 360, 30)).toBe(0x1e);
    expect(avcLevel(1280, 720, 60)).toBe(0x20);
  });

  it("tries Main first (the spec's avc1.4d401f for 960x540 at 30 fps), then High and Baseline", () => {
    expect(proxyCodecs(960, 540, 30)).toEqual(["avc1.4d401f", "avc1.64001f", "avc1.42e01f"]);
    expect(proxyCodecs(540, 960, 59.94)[0]).toBe("avc1.4d4020");
  });
});

describe("wantsProxy", () => {
  it("default rule: above 1080p on the short edge or above 30 fps", () => {
    expect(wantsProxy(video(3840, 2160, 60), "heavy")).toBe(true);
    expect(wantsProxy(video(3840, 2160, 30), "heavy")).toBe(true);
    expect(wantsProxy(video(1080, 1920, 60), "heavy")).toBe(true);
    expect(wantsProxy(video(1080, 1920, 30), "heavy")).toBe(false);
    expect(wantsProxy(video(1920, 1080, 30000, 1001), "heavy")).toBe(false);
    expect(wantsProxy(video(1920, 1080, 60000, 1001), "heavy")).toBe(true);
  });

  it("large only, all videos, never audio or images", () => {
    expect(wantsProxy(video(1080, 1920, 60), "large")).toBe(false);
    expect(wantsProxy(video(1440, 2560, 30), "large")).toBe(true);
    expect(wantsProxy(video(640, 360, 25), "all")).toBe(true);
    expect(wantsProxy({ ...video(1920, 1080, 30), kind: "image" }, "all")).toBe(false);
    expect(wantsProxy({ ...video(1920, 1080, 30), kind: "audio" }, "all")).toBe(false);
  });
});

describe("halvingSteps", () => {
  it("halves at most per step, ending at the target", () => {
    const target = { width: 960, height: 540 };
    expect(halvingSteps(3840, 2160, target)).toEqual([{ width: 1920, height: 1080 }, target]);
    expect(halvingSteps(1920, 1080, target)).toEqual([target]);
    expect(halvingSteps(2560, 1440, target)).toEqual([{ width: 1920, height: 1080 }, target]);
    expect(halvingSteps(7680, 4320, target)).toEqual([{ width: 3840, height: 2160 }, { width: 1920, height: 1080 }, target]);
    expect(halvingSteps(640, 360, { width: 640, height: 360 })).toEqual([{ width: 640, height: 360 }]);
  });
});
