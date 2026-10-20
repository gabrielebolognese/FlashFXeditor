import { describe, expect, it } from "vitest";
import { buildPeaks, joinLevels, PEAKS_BUCKET, peaksLevel0, readPeaksFile, writePeaksFile } from "./peaks.js";

const stamp = { size: 1234, lastModified: 1_700_000_000_000 };

function ramp(frames: number, scale = 1): Float32Array {
  return Float32Array.from({ length: frames }, (_, i) => (((i % 512) / 511) * 2 - 1) * scale);
}

describe("peaksLevel0", () => {
  it("keeps the min and max of every 256 frames per channel", () => {
    const left = new Float32Array(PEAKS_BUCKET * 2);
    const right = new Float32Array(PEAKS_BUCKET * 2);
    left[10] = 0.5;
    left[20] = -0.25;
    right[PEAKS_BUCKET + 3] = 1;
    right[PEAKS_BUCKET + 4] = -1;
    const level = peaksLevel0([left, right]);
    // Bucket 0: left [-0.25, 0.5], right [0, 0]; bucket 1: left [0, 0], right [-1, 1].
    expect([...level]).toEqual([-32, 64, 0, 0, 0, 0, -127, 127]);
  });

  it("covers a last partial bucket and never under-reports a peak", () => {
    const data = new Float32Array(PEAKS_BUCKET + 1);
    data[PEAKS_BUCKET] = 0.001;
    const level = peaksLevel0([data]);
    expect(level.length).toBe(4);
    expect(level[3]).toBe(1);
    // Overs clamp to full scale.
    expect([...peaksLevel0([Float32Array.of(2, -3)])]).toEqual([-127, 127]);
  });
});

describe("buildPeaks", () => {
  it("halves the resolution level by level down to one bucket", () => {
    const left = ramp(PEAKS_BUCKET * 5, 0.5);
    const right = ramp(PEAKS_BUCKET * 5);
    const peaks = buildPeaks(peaksLevel0([left, right]), { sampleRate: 48_000, frames: left.length, channels: 2 });
    expect(peaks.levels.map((level) => level.length / 4)).toEqual([5, 3, 2, 1]);
    const top = peaks.levels[3] as Int8Array;
    expect([...top]).toEqual([-64, 64, -127, 127]);
  });

  it("gives the same pyramid when level 0 comes in segments", () => {
    const data = ramp(PEAKS_BUCKET * 9 + 17);
    const whole = peaksLevel0([data]);
    const cut = PEAKS_BUCKET * 4;
    const joined = joinLevels([peaksLevel0([data.subarray(0, cut)]), peaksLevel0([data.subarray(cut)])]);
    expect(joined).toEqual(whole);
  });
});

describe("peaks file", () => {
  const peaks = buildPeaks(peaksLevel0([ramp(PEAKS_BUCKET * 7 + 3)]), { sampleRate: 44_100, frames: PEAKS_BUCKET * 7 + 3, channels: 1 });

  it("round-trips", () => {
    const read = readPeaksFile(writePeaksFile(peaks, stamp), stamp);
    expect(read).toEqual(peaks);
  });

  it("reads as null for another source, another format or a damaged file", () => {
    const file = writePeaksFile(peaks, stamp);
    expect(readPeaksFile(file, { ...stamp, size: 1 })).toBeNull();
    expect(readPeaksFile(file, { ...stamp, lastModified: 1 })).toBeNull();
    expect(readPeaksFile(file.slice(0, file.byteLength - 8), stamp)).toBeNull();
    expect(readPeaksFile(new ArrayBuffer(64), stamp)).toBeNull();
    expect(readPeaksFile(new ArrayBuffer(8), stamp)).toBeNull();
  });
});
