import { describe, expect, it } from "vitest";
import { automationAt, automationCurve, automationRegions, envelopeAt, envelopeCurve, envelopeRegions, keyedGainAt, MIN_RAMP_SECONDS } from "./envelope.js";

const FPS = 30;
const t = (before: number, after: number) => ({ id: "t", kind: "crossDissolve" as const, before, after });
const NONE = { in: 0, out: 0 };

describe("audio envelope (Batch 36)", () => {
  it("fades in and out with equal power, 1 in between", () => {
    const clip = { start: 0, duration: 90, fades: { in: 30, out: 15 } };
    expect(envelopeAt(clip, FPS, 0)).toBe(0);
    expect(envelopeAt(clip, FPS, 0.5)).toBeCloseTo(Math.SQRT1_2, 9);
    expect(envelopeAt(clip, FPS, 2)).toBe(1);
    expect(envelopeAt(clip, FPS, 2.75)).toBeCloseTo(Math.SQRT1_2, 9);
    expect(envelopeRegions(clip, FPS)).toEqual([
      { start: 0, end: 1 },
      { start: 2.5, end: 3 },
    ]);
  });

  it("crossfades the two clips of a transition at constant power over its frames", () => {
    const left = { start: 0, duration: 60, fades: NONE, transitionOut: t(6, 6) };
    const right = { start: 60, duration: 60, fades: NONE, transitionIn: t(6, 6) };
    for (let s = 1.8; s <= 2.2; s += 0.01) expect(envelopeAt(left, FPS, s) ** 2 + envelopeAt(right, FPS, s) ** 2).toBeCloseTo(1, 9);
    expect(envelopeAt(left, FPS, 1.8)).toBe(1);
    expect(envelopeAt(right, FPS, 2.2)).toBe(1);
    expect(envelopeRegions(right, FPS)).toEqual([{ start: 1.8, end: 2.2 }]);
    const curve = envelopeCurve(right, FPS, 1.8, 2.2);
    expect(curve[0]).toBe(0);
    expect(curve[curve.length - 1]).toBeCloseTo(1, 9);
  });

  it("fits a ramp into the audio there is: silent by the media end, rising from the media start", () => {
    // The left clip's media ends at the cut (2 s), the right one's starts there.
    const left = { start: 0, duration: 60, fades: NONE, transitionOut: t(7, 8) };
    const right = { start: 60, duration: 60, fades: NONE, transitionIn: t(7, 8) };
    expect(envelopeAt(left, FPS, 2, { start: 0, end: 2 })).toBeCloseTo(0, 9);
    expect(envelopeAt(left, FPS, 2 - 7 / 30, { start: 0, end: 2 })).toBe(1);
    expect(envelopeAt(right, FPS, 2, { start: 2, end: 10 })).toBe(0);
    expect(envelopeAt(right, FPS, 2 + 8 / 30, { start: 2, end: 10 })).toBe(1);
    // A transition all after a cut with no audio past it: a minimal ramp ends on the media end.
    const late = { start: 0, duration: 60, fades: NONE, transitionOut: t(0, 8) };
    expect(envelopeRegions(late, FPS, { start: 0, end: 2 })).toEqual([{ start: 2 - MIN_RAMP_SECONDS, end: 2 }]);
  });
});

describe("keyed gain automation (Batch 37)", () => {
  const keys = [
    { frame: 30, value: 0, ease: "linear" as const },
    { frame: 60, value: -20, ease: "linear" as const },
  ];
  const clip = { start: 30, duration: 90, fades: { in: 15, out: 0 }, volume: { gainDb: -6, muted: false }, keyframes: { "volume.gainDb": keys } };

  it("multiplies the envelope by the keyed gain, interpolated in dB between whole-frame keys", () => {
    // Clip second 1 (frame 30) holds 0 dB before it; frame 45 is -10 dB; after frame 60, -20 dB.
    expect(keyedGainAt(clip, FPS, 1.5)).toBeCloseTo(1, 9);
    expect(keyedGainAt(clip, FPS, 2.5)).toBeCloseTo(10 ** (-10 / 20), 9);
    expect(keyedGainAt(clip, FPS, 3.5)).toBeCloseTo(0.1, 9);
    expect(automationAt(clip, FPS, 1.25)).toBeCloseTo(Math.SQRT1_2, 9);
    expect(automationAt(clip, FPS, 2.5)).toBeCloseTo(10 ** (-10 / 20), 9);
    // The base gain (-6 dB) is not part of it: it is the clip gain node's when no keys exist.
    expect(keyedGainAt({ ...clip, keyframes: {} }, FPS, 2.5)).toBe(1);
  });

  it("moves between the first and last key, merged with the fade regions", () => {
    expect(automationRegions(clip, FPS)).toEqual([
      { start: 1, end: 1.5 },
      { start: 2, end: 3 },
    ]);
    const flat = { ...clip, keyframes: { "volume.gainDb": keys.map((key) => ({ ...key, value: -3 })) } };
    expect(automationRegions(flat, FPS)).toEqual([{ start: 1, end: 1.5 }]);
    const curve = automationCurve(clip, FPS, 2, 3);
    expect(curve).toHaveLength(201);
    expect(curve[100]).toBeCloseTo(10 ** (-10 / 20), 6);
  });
});
