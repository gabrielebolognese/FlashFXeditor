import { describe, expect, it } from "vitest";
import { glitchShift, invert, mirrorSample, pixelateSample, posterize, rgbSplitOffset, rgbSplitPixel, waveSample, type Rect } from "./stylize.js";

const BOX: Rect = [10, 20, 210, 120];

describe("rgbSplitOffset", () => {
  it("points along the angle, scaled to stage px", () => {
    const [x, y] = rgbSplitOffset(8, 0, 2);
    expect(x).toBeCloseTo(16);
    expect(y).toBeCloseTo(0);
    const [dx, dy] = rgbSplitOffset(10, 90, 1);
    expect(dx).toBeCloseTo(0);
    expect(dy).toBeCloseTo(10);
  });

  it("keeps the largest alpha and one channel of each read", () => {
    expect(rgbSplitPixel([0.5, 0.1, 0.1, 0.5], [0.2, 0.3, 0.2, 1], [0, 0, 0, 0])).toEqual([0.5, 0.3, 0, 1]);
  });
});

describe("pixelateSample", () => {
  it("reads the middle of each cell from the box's corner", () => {
    expect(pixelateSample([10.5, 20.5], BOX, 16, 1)).toEqual([18, 28]);
    expect(pixelateSample([25.9, 35.9], BOX, 16, 1)).toEqual([18, 28]);
    expect(pixelateSample([26.1, 36.1], BOX, 16, 1)).toEqual([34, 44]);
  });

  it("scales the cell with the stage", () => {
    expect(pixelateSample([10.5, 20.5], BOX, 16, 0.5)).toEqual([14, 24]);
  });

  it("is the same picture for every pixel of a cell (a 1 px cell is the identity at pixel centers)", () => {
    expect(pixelateSample([12.5, 22.5], BOX, 1, 1)).toEqual([12.5, 22.5]);
  });
});

describe("mirrorSample", () => {
  it("keeps the left half and reflects it onto the right", () => {
    expect(mirrorSample([50, 60], BOX, 0, 0.5)).toEqual([50, 60]);
    expect(mirrorSample([150, 60], BOX, 0, 0.5)).toEqual([70, 60]);
  });

  it("keeps the right half", () => {
    expect(mirrorSample([150, 60], BOX, 1, 0.5)).toEqual([150, 60]);
    expect(mirrorSample([50, 60], BOX, 1, 0.5)).toEqual([170, 60]);
  });

  it("keeps the top or the bottom about a moved line", () => {
    expect(mirrorSample([50, 100], BOX, 2, 0.25)).toEqual([50, -10]);
    expect(mirrorSample([50, 30], BOX, 3, 0.25)).toEqual([50, 60]);
  });

  it("is symmetric: a pixel and its reflection read the same point", () => {
    for (const x of [11, 64, 109.5, 133, 200]) {
      const a = mirrorSample([x, 50], BOX, 0, 0.4);
      const line = BOX[0] + 0.4 * (BOX[2] - BOX[0]);
      const b = mirrorSample([2 * line - x, 50], BOX, 0, 0.4);
      expect(a[0]).toBeCloseTo(b[0]);
    }
  });
});

describe("waveSample", () => {
  it("moves rows along x by at most the amplitude, columns untouched", () => {
    let most = 0;
    for (let y = 20; y < 120; y += 0.5) {
      const [x, yy] = waveSample([100, y], BOX, 20, 200, 0, 0, 1);
      expect(yy).toBe(y);
      most = Math.max(most, Math.abs(x - 100));
    }
    expect(most).toBeLessThanOrEqual(20);
    expect(most).toBeGreaterThan(19.9);
  });

  it("starts at zero at the box's top and repeats every wavelength", () => {
    expect(waveSample([100, 20], BOX, 20, 200, 0, 0, 1)[0]).toBeCloseTo(100);
    expect(waveSample([100, 70], BOX, 20, 200, 0, 0, 1)[0]).toBeCloseTo(120);
    expect(waveSample([100, 70], BOX, 20, 200, 0, 1, 1)[0]).toBeCloseTo(120);
  });

  it("travels with the phase and scales with the stage", () => {
    expect(waveSample([100, 20], BOX, 20, 200, 0, 0.25, 1)[0]).toBeCloseTo(80);
    expect(waveSample([100, 20 + 100], BOX, 20, 200, 0, 0, 2)[0]).toBeCloseTo(140);
  });

  it("moves columns along y when vertical", () => {
    const [x, y] = waveSample([60, 50], BOX, 10, 200, 1, 0, 1);
    expect(x).toBe(60);
    expect(y).toBeCloseTo(60);
  });
});

describe("glitchShift", () => {
  it("moves no band at amount 0 and every band at amount 1", () => {
    for (let y = 20; y < 120; y += 3) {
      expect(glitchShift([0, y], BOX, 0, 8, 50, 0, 0, 1)).toBe(0);
      expect(glitchShift([0, y], BOX, 1, 8, 50, 0, 0, 1)).not.toBe(0);
    }
  });

  it("is one shift per band, within -shift..shift (stage px)", () => {
    for (let band = 0; band < 40; band++) {
      const y = 20 + band * 8;
      const a = glitchShift([0, y + 0.5], BOX, 1, 8, 50, 3, 7, 2);
      const b = glitchShift([0, y + 7.5], BOX, 1, 8, 50, 3, 7, 2);
      expect(a).toBe(b);
      expect(Math.abs(a)).toBeLessThanOrEqual(100);
    }
  });

  it("moves about `amount` of the bands, and a new pattern or seed changes which", () => {
    let moved = 0;
    let differs = 0;
    const bands = 2000;
    for (let band = 0; band < bands; band++) {
      const y = 20 + band * 4 + 1;
      const a = glitchShift([0, y], BOX, 0.3, 4, 50, 0, 0, 1);
      if (a !== 0) moved += 1;
      if (a !== glitchShift([0, y], BOX, 0.3, 4, 50, 0, 1, 1) || a !== glitchShift([0, y], BOX, 0.3, 4, 50, 1, 0, 1)) differs += 1;
    }
    expect(moved / bands).toBeGreaterThan(0.25);
    expect(moved / bands).toBeLessThan(0.35);
    expect(differs).toBeGreaterThan(bands * 0.3);
  });

  it("is a pure function of its inputs (the same frame gives the same picture)", () => {
    expect(glitchShift([3, 77], BOX, 0.6, 12, 40, 5, 9, 1)).toBe(glitchShift([3, 77], BOX, 0.6, 12, 40, 5, 9, 1));
  });
});

describe("posterize and invert", () => {
  it("rounds to the levels and keeps black and white", () => {
    expect(posterize(0, 4)).toBe(0);
    expect(posterize(1, 4)).toBe(1);
    expect(posterize(0.4, 4)).toBeCloseTo(1 / 3);
    expect(posterize(0.6, 2)).toBe(1);
    const values = new Set<number>();
    for (let i = 0; i <= 255; i++) values.add(posterize(i / 255, 6));
    expect(values.size).toBe(6);
  });

  it("inverts by the amount", () => {
    expect(invert(0.2, 1)).toBeCloseTo(0.8);
    expect(invert(0.2, 0)).toBeCloseTo(0.2);
    expect(invert(0.2, 0.5)).toBeCloseTo(0.5);
    expect(invert(0.2, 3)).toBeCloseTo(0.8);
  });
});
