import { describe, expect, it } from "vitest";
import { buildPeaks, peaksLevel0 } from "../../media/cache/peaks.js";
import { thumbLayout, type ThumbLayout } from "../../media/cache/thumbSheets.js";
import { makeMedia } from "../../core/document/fixtures.js";
import { columnPeaks, createWants, peaksLevel, planFilmstrip, tileThumb, wantPeaks, wantSheet } from "./clipVisuals.js";

const layout = thumbLayout({ ...makeMedia("v", "video", 60_000_000), width: 1920, height: 1080, fps: { num: 30, den: 1 } }) as ThumbLayout;

describe("filmstrips", () => {
  it("tiles from the clip start and picks the level that gives each tile its own frame", () => {
    // 64 px tiles at 1 px per frame (30 fps, speed 1): a tile spans 64 frames = 2.13 s -> LOD0.
    const usPerPx = 1_000_000 / 30;
    const plan = planFilmstrip(layout, 100, 64, 300, 500, usPerPx);
    expect(plan.level).toBe(0);
    expect([plan.first, plan.end]).toEqual([3, 7]);
    // Zoomed 4x: 16 frames per tile = 0.53 s -> LOD1; 16x: 4 frames -> LOD2.
    expect(planFilmstrip(layout, 0, 64, 0, 100, usPerPx / 4).level).toBe(1);
    expect(planFilmstrip(layout, 0, 64, 0, 100, usPerPx / 16).level).toBe(2);
    // A clip that starts off screen to the right has no tile on screen.
    expect(planFilmstrip(layout, 900, 64, 0, 500, usPerPx).end).toBe(0);
  });

  it("shows each tile's source time, honoring the in point and the speed", () => {
    const usPerPx = (1_000_000 / 30) * 2; // speed 2
    const plan = planFilmstrip(layout, 0, 64, 0, 640, usPerPx);
    expect(plan.tileUs).toBeCloseTo(4_266_667, -1);
    expect(plan.level).toBe(0);
    // In point 10 s: tile 0 shows 10 s (LOD0 thumb 5), tile 1 14.27 s (thumb 7).
    expect(tileThumb(layout, 0, 10_000_000, 0, plan.tileUs)).toBe(5);
    expect(tileThumb(layout, 0, 10_000_000, 1, plan.tileUs)).toBe(7);
    // Clamped to the media's last thumbnail.
    expect(tileThumb(layout, 0, 59_000_000, 9, plan.tileUs)).toBe(29);
  });

  it("collects each wanted sheet and peaks once per pass", () => {
    const wants = createWants();
    wantSheet(wants, "v", 1, 0);
    wantSheet(wants, "v", 1, 0);
    wantSheet(wants, "v", 2, 0);
    wantPeaks(wants, "a");
    wantPeaks(wants, "a");
    expect(wants.sheets).toEqual([
      { mediaId: "v", level: 1, sheet: 0 },
      { mediaId: "v", level: 2, sheet: 0 },
    ]);
    expect(wants.peaks).toEqual(["a"]);
  });
});

describe("waveforms", () => {
  // 48 kHz stereo: a 1000 Hz full-scale tone on the left for 0.5 s, then silence; the right at half scale throughout.
  const frames = 48_000;
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    left[i] = i < frames / 2 ? Math.sin((2 * Math.PI * 1000 * i) / 48_000) : 0;
    right[i] = 0.5 * Math.sin((2 * Math.PI * 1000 * i) / 48_000);
  }
  const peaks = buildPeaks(peaksLevel0([left, right]), { sampleRate: 48_000, frames, channels: 2 });

  it("reads the level whose bucket is closest to one CSS px", () => {
    expect(peaksLevel(peaks, 256)).toBe(0);
    expect(peaksLevel(peaks, 100)).toBe(0);
    expect(peaksLevel(peaks, 1024)).toBe(2);
    expect(peaksLevel(peaks, 1400)).toBe(2);
    expect(peaksLevel(peaks, 1e9)).toBe(peaks.levels.length - 1);
    expect(peaksLevel(peaks, 0)).toBe(0);
  });

  it("gives each column the loudest channel's peak of the samples it covers", () => {
    const out = new Float32Array(4);
    // Four columns of 48 level-0 buckets: the tone, the tone, then the right channel alone.
    columnPeaks(peaks, 0, 0, 48 * 256, out, 4);
    expect(out[0]).toBeCloseTo(1, 1);
    expect(out[1]).toBeCloseTo(1, 1);
    expect(out[2]).toBeCloseTo(0.5, 1);
    expect(out[3]).toBeCloseTo(0.5, 1);
  });

  it("reads silence outside the media and interpolates columns narrower than a bucket", () => {
    const out = new Float32Array(3);
    columnPeaks(peaks, 0, -5000, 1000, out, 3);
    expect([...out]).toEqual([0, 0, 0]);
    columnPeaks(peaks, 0, frames + 10, 1000, out, 1);
    expect(out[0]).toBe(0);
    // Around the end of the tone (frame 24 000), 128 columns of 4 frames go from ~1 down to ~0.5.
    const fine = new Float32Array(128);
    columnPeaks(peaks, 0, 24_000 - 256, 4, fine, 128);
    expect(fine[0]).toBeCloseTo(1, 1);
    expect(fine[127]).toBeCloseTo(0.5, 1);
    for (let i = 1; i < 128; i++) expect(fine[i]).toBeLessThanOrEqual((fine[i - 1] as number) + 1e-6);
  });
});
