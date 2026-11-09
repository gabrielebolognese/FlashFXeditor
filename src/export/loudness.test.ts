import { describe, expect, it } from "vitest";
import { measureLoudness } from "../audio/dsp/loudness.js";
import { applyExportLoudness, loudnessText } from "./loudness.js";

const SR = 48000;
const tone = (peak: number, seconds = 6) => {
  const data = new Float32Array(SR * seconds);
  for (let n = 0; n < data.length; n++) data[n] = peak * Math.sin((2 * Math.PI * 997 * n) / SR);
  return [data, data.slice()];
};

describe("export loudness (Batch 77)", () => {
  it("brings a -20 LUFS mix to -14 LUFS (+-0.5 LU) with a true peak under -1 dBTP, and reports it", () => {
    const { planes, report } = applyExportLoudness(tone(0.1), SR, { targetLufs: -14, truePeakDb: -1 });
    const after = measureLoudness(planes, SR);
    expect(Math.abs(after.integrated + 14)).toBeLessThanOrEqual(0.5);
    expect(after.truePeakDb).toBeLessThanOrEqual(-1);
    expect(report?.beforeLufs).toBeCloseTo(-20, 1);
    expect(report?.gainDb).toBeCloseTo(6, 0);
    expect(loudnessText(report!)).toMatch(/-20\.0 → -14\.\d LUFS, peak -\d/);
  });

  it("leaves the audio alone without a target, and reports nothing for silence", () => {
    const input = tone(0.1, 1);
    const none = applyExportLoudness(input, SR, null);
    expect(none.report).toBeNull();
    expect(none.planes[0]).toBe(input[0]);
    const silent = applyExportLoudness([new Float32Array(SR), new Float32Array(SR)], SR, { targetLufs: -14, truePeakDb: -1 });
    expect(silent.report).toBeNull();
  });

  it("lowers a louder mix to the target", () => {
    const { planes } = applyExportLoudness(tone(0.5), SR, { targetLufs: -23, truePeakDb: -1 });
    expect(Math.abs(measureLoudness(planes, SR).integrated + 23)).toBeLessThanOrEqual(0.5);
  });
});
