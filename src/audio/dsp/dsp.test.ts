import { describe, expect, it } from "vitest";
import { detectBeats, beatFrames } from "./beats.js";
import { LoudnessMeter, measureLoudness } from "./loudness.js";
import { limitTruePeak, normalizeLoudness } from "./normalize.js";

const SR = 48000;
const sine = (freq: number, seconds: number, amp: number, channels = 2) => {
  const data = new Float32Array(Math.round(seconds * SR));
  for (let n = 0; n < data.length; n++) data[n] = amp * Math.sin((2 * Math.PI * freq * n) / SR);
  return Array.from({ length: channels }, () => data);
};

describe("loudness (BS.1770-4)", () => {
  it("reads a 997 Hz stereo sine of -20 dBFS peak per channel as -20 LUFS (the reference tone)", () => {
    // EBU Tech 3341: a stereo 997 Hz sine of peak level L dBFS reads L LUFS.
    expect(measureLoudness(sine(997, 6, 0.1), SR).integrated).toBeCloseTo(-20, 1);
  });
  it("is 10 LU lower for a 10 dB lower tone, and silence is -Infinity", () => {
    const a = measureLoudness(sine(997, 4, 0.2), SR).integrated;
    const b = measureLoudness(sine(997, 4, 0.2 / 10 ** 0.5), SR).integrated;
    expect(a - b).toBeCloseTo(10, 1);
    expect(measureLoudness([new Float32Array(SR * 2), new Float32Array(SR * 2)], SR).integrated).toBe(-Infinity);
  });
  it("gates out silence: a tone with a long silent tail reads as the tone alone", () => {
    const tone = sine(997, 12, 0.2);
    const padded = tone.map((c) => {
      const out = new Float32Array(c.length * 3);
      out.set(c);
      return out;
    });
    expect(measureLoudness(padded, SR).integrated).toBeCloseTo(measureLoudness(tone, SR).integrated, 0);
  });
  it("streams: the same result in any chunking, and the windows fill in time", () => {
    const x = sine(440, 4, 0.3);
    const meter = new LoudnessMeter(SR, 2);
    meter.push(x.map((c) => c.subarray(0, 100)));
    expect(meter.reading().momentary).toBe(-Infinity);
    meter.push(x.map((c) => c.subarray(100, 3000)));
    meter.push(x.map((c) => c.subarray(3000)));
    const r = meter.reading();
    expect(Number.isFinite(r.shortTerm)).toBe(true);
    expect(r.integrated).toBeCloseTo(measureLoudness(x, SR).integrated, 1);
  });
  it("true peak sees an inter-sample peak above the sample peak", () => {
    // A sine at fs/4 with a 45 degree phase: samples at +-0.7071 of a peak 1.
    const data = new Float32Array(SR);
    for (let n = 0; n < data.length; n++) data[n] = Math.sin((Math.PI / 2) * n + Math.PI / 4);
    const m = measureLoudness([data], SR);
    expect(m.truePeakDb).toBeGreaterThan(-3.01 + 2.5);
    expect(m.truePeakDb).toBeLessThan(0.3);
  });
});

describe("normalizeLoudness", () => {
  it("brings a -20 LUFS mix to -14 LUFS within 0.5 LU with a true peak at or below -1 dBTP", () => {
    const tone = sine(997, 8, 0.1);
    const before = measureLoudness(tone, SR).integrated;
    const result = normalizeLoudness(tone, SR, { targetLufs: -14, truePeakDb: -1 });
    expect(Math.abs(result.after.integrated + 14)).toBeLessThan(0.5);
    expect(result.after.truePeakDb).toBeLessThanOrEqual(-1);
    expect(result.gainDb).toBeCloseTo(-14 - before, 0);
  });
  it("limits a peaky mix: loudness near target, peak under the ceiling", () => {
    const x = sine(220, 8, 0.12);
    // Short loud bursts every second.
    for (let s = 0; s < 8; s++) for (let n = 0; n < 400; n++) for (const c of x) c[s * SR + n] = 0.9 * Math.sin((2 * Math.PI * 3000 * n) / SR);
    const result = normalizeLoudness(x, SR, { targetLufs: -14, truePeakDb: -1 });
    expect(result.after.truePeakDb).toBeLessThanOrEqual(-1);
    expect(Math.abs(result.after.integrated + 14)).toBeLessThan(1);
  });
  it("leaves silence alone", () => {
    const silent = [new Float32Array(SR), new Float32Array(SR)];
    const result = normalizeLoudness(silent, SR, { targetLufs: -14, truePeakDb: -1 });
    expect(result.gainDb).toBe(0);
  });
  it("the limiter does not change what is under the ceiling", () => {
    const x = sine(440, 1, 0.2);
    const out = limitTruePeak(x, SR, -1);
    for (let n = 1000; n < 2000; n++) expect(out[0]?.[n]).toBeCloseTo(x[0]?.[n] ?? 0, 6);
  });
});

describe("beats", () => {
  const click = (bpm: number, seconds: number) => {
    const data = new Float32Array(Math.round(seconds * SR));
    const period = (60 / bpm) * SR;
    for (let t = 0; t * period < data.length; t++) {
      const at = Math.round(t * period);
      for (let n = 0; n < 300 && at + n < data.length; n++) data[at + n] = 0.8 * Math.sin((2 * Math.PI * 1500 * n) / SR) * (1 - n / 300);
    }
    return data;
  };
  it("finds every beat of a 120 BPM click track and its tempo", () => {
    const { beats, bpm } = detectBeats(click(120, 10), SR);
    expect(bpm).toBe(120);
    expect(beats.length).toBe(20);
    beats.forEach((time, i) => expect(Math.abs(time - i * 0.5)).toBeLessThanOrEqual(0.011));
  });
  it("maps beats to frames within one frame of the exact beat", () => {
    const { beats } = detectBeats(click(120, 10), SR);
    const frames = beatFrames(beats, { start: 30, duration: 300, in: 0, speed: 1 }, { num: 30, den: 1 });
    frames.forEach((f, i) => expect(Math.abs(f - (30 + i * 15))).toBeLessThanOrEqual(1));
    expect(frames.length).toBe(20);
  });
  it("respects the clip's in point and range", () => {
    const frames = beatFrames([0.5, 1, 1.5, 2], { start: 100, duration: 30, in: 1_000_000, speed: 1 }, { num: 30, den: 1 });
    expect(frames).toEqual([100, 115]);
  });
});
