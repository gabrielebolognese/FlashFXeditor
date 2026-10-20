import { describe, expect, it } from "vitest";
import { firstFrameOfSecond, formatTimecode } from "../../core/document/time.js";
import type { Rational } from "../../core/document/types.js";
import { layoutRuler, majorLevel, minorLevel, RULER_LEVELS, tickFrames, type RulerLayout } from "./ruler.js";

const RATES: Rational[] = [
  { num: 24, den: 1 },
  { num: 25, den: 1 },
  { num: 30000, den: 1001 },
  { num: 30, den: 1 },
  { num: 50, den: 1 },
  { num: 60, den: 1 },
];
const FPS = { num: 30, den: 1 };
const NTSC = { num: 30000, den: 1001 };
// About the width of 11 px mono digits.
const measure = (text: string) => text.length * 6.6;
const GAP = 8;
const WIDTH = 800;

function layout(pxPerFrame: number, fps: Rational, scrollFrame = 0): RulerLayout {
  return layoutRuler({
    from: scrollFrame,
    to: scrollFrame + WIDTH / pxPerFrame,
    frameToX: (frame) => (frame - scrollFrame) * pxPerFrame,
    pxPerFrame,
    fps,
    measure,
    labelGap: GAP,
    minorMinPx: 8,
  });
}

function expectNoOverlap(result: RulerLayout): void {
  for (let i = 1; i < result.labels.length; i++) {
    const prev = result.labels[i - 1]!;
    const next = result.labels[i]!;
    expect(next.x, `"${prev.text}" then "${next.text}"`).toBeGreaterThanOrEqual(prev.x + measure(prev.text) + GAP - 1e-9);
  }
}

describe("ruler labels", () => {
  it("never overlap at any zoom, frame rate or position (including hour timecodes)", () => {
    for (const fps of RATES) {
      for (let px = 0.01; px <= 400; px *= 1.09) {
        for (const scroll of [0, 7.3, 107_000]) {
          const result = layout(px, fps, scroll);
          expectNoOverlap(result);
          expect(result.labels.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("shows frame numbers between the seconds at frame-level zoom", () => {
    const close = layout(40, FPS);
    expect(close.level).toEqual({ unit: "frames", n: 1 });
    expect(close.labels.slice(0, 4).map((label) => label.text)).toEqual(["00:00:00", "02", "03", "04"]);
    const across = layout(40, FPS, 25);
    // "29" ends 8 px before the second label; "01" would touch the second label, "02" clears it.
    expect(across.labels.slice(0, 7).map((label) => label.text)).toEqual(["25", "26", "27", "28", "29", "00:01:00", "02"]);
    expect(across.labels.find((label) => label.text === "00:01:00")?.x).toBe(5 * 40);

    const medium = layout(5, FPS);
    expect(medium.level).toEqual({ unit: "frames", n: 5 });
    const texts = medium.labels.map((label) => label.text);
    // "05" and "10" would touch the second label before them; "15", "20", "25" fit before the next.
    expect(texts.slice(0, 5)).toEqual(["00:00:00", "15", "20", "25", "00:01:00"]);
    expect(medium.labels.filter((label) => label.kind === "frame").length).toBeGreaterThan(0);

    const far = layout(0.5, FPS);
    expect(far.level.unit).toBe("seconds");
    expect(far.labels.every((label) => label.kind === "second")).toBe(true);
  });

  it("gives every frame tick its whole timecode once they are far enough apart", () => {
    // 61 px per frame fits "00:00:00" (52.8 px) plus the gap: no second boundary needs to be in view.
    const far = layout(90, FPS, 1785);
    // The last tick sits at the right edge, just outside the 800 px (the canvas clips it).
    expect(far.labels.map((label) => label.text)).toEqual(["00:59:15", "00:59:16", "00:59:17", "00:59:18", "00:59:19", "00:59:20", "00:59:21", "00:59:22", "00:59:23", "00:59:24"]);
    expect(far.labels.every((label) => label.kind === "frame")).toBe(true);
    expectNoOverlap(far);
  });

  it("labels seconds with their timecodes on wall-clock seconds at 29.97", () => {
    const result = layout(0.2, NTSC);
    for (const label of result.labels) {
      const frame = Math.round(label.x / 0.2);
      expect(label.text).toBe(formatTimecode(frame, NTSC));
      expect(label.text.endsWith(":00")).toBe(true);
    }
    expect(tickFrames({ unit: "seconds", n: 10 }, 0, 1000, NTSC)).toEqual([0, 300, 600, 900]);
    // Frame ticks restart at each second: second 1 of 29.97 starts at frame 30, second 2 at 60.
    expect(tickFrames({ unit: "frames", n: 10 }, 0, 65, NTSC)).toEqual([0, 10, 20, 30, 40, 50, 60]);
    expect(tickFrames({ unit: "frames", n: 10 }, 0, 100, { num: 25, den: 1 })).toEqual([0, 10, 20, 25, 35, 45, 50, 60, 70, 75, 85, 95, 100]);
    expect(firstFrameOfSecond(33, NTSC)).toBe(990);
  });

  it("coarsens the major level as the zoom goes out", () => {
    let previous = 0;
    for (let px = 400; px >= 0.01; px /= 1.2) {
      const level = majorLevel({ to: WIDTH / px, pxPerFrame: px, fps: FPS, measure, labelGap: GAP });
      const index = RULER_LEVELS.findIndex((l) => l.unit === level.unit && l.n === level.n);
      expect(index).toBeGreaterThanOrEqual(previous);
      previous = index;
    }
    expect(previous).toBeGreaterThan(RULER_LEVELS.findIndex((l) => l.unit === "seconds" && l.n === 300) - 1);
  });

  it("subdivides majors with minor ticks at least the minimum apart", () => {
    expect(minorLevel({ unit: "frames", n: 10 }, 3, FPS, 8)).toEqual({ unit: "frames", n: 5 });
    expect(minorLevel({ unit: "frames", n: 5 }, 10, FPS, 8)).toEqual({ unit: "frames", n: 1 });
    expect(minorLevel({ unit: "frames", n: 1 }, 100, FPS, 8)).toBeNull();
    expect(minorLevel({ unit: "seconds", n: 60 }, 0.05, FPS, 8)).toEqual({ unit: "seconds", n: 10 });
    expect(minorLevel({ unit: "seconds", n: 1 }, 1, FPS, 8)).toEqual({ unit: "frames", n: 10 });
    expect(minorLevel({ unit: "seconds", n: 30 }, 0.2, FPS, 8)).toEqual({ unit: "seconds", n: 2 });
    const result = layout(3, FPS);
    for (const x of result.minors) expect(result.majors).not.toContain(x);
  });

  it("labels in milliseconds when the preview's toggle says so, the parts between seconds as .mmm", () => {
    const ms = (pxPerFrame: number) =>
      layoutRuler({ from: 0, to: WIDTH / pxPerFrame, frameToX: (frame) => frame * pxPerFrame, pxPerFrame, fps: FPS, mode: "ms", measure, labelGap: GAP, minorMinPx: 8 });
    const seconds = ms(1);
    expect(seconds.labels[0]?.text).toBe("00:00.000");
    expect(seconds.labels.every((label) => label.kind === "second" && /^\d\d:\d\d\.\d{3}$/.test(label.text))).toBe(true);
    expectNoOverlap(seconds);
    // Zoomed in: the frames between seconds get their millisecond part, never overlapping.
    const frames = ms(12);
    const between = frames.labels.filter((label) => label.kind === "frame");
    expect(between.length).toBeGreaterThan(0);
    expect(between[0]?.text).toMatch(/^(\.\d{3}|\d\d:\d\d\.\d{3})$/);
    expect(between.some((label) => label.text === ".500")).toBe(true);
    expectNoOverlap(frames);
  });
});
