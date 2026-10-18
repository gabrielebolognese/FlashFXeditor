import { describe, expect, it } from "vitest";
import { fitFades } from "./fades.js";

describe("fitFades (Batch 50: in + out <= duration)", () => {
  it("keeps fades that fit", () => {
    expect(fitFades({ in: 10, out: 15 }, 30)).toEqual({ in: 10, out: 15 });
    expect(fitFades({ in: 0, out: 30 }, 30)).toEqual({ in: 0, out: 30 });
    expect(fitFades({ in: 0, out: 0 }, 1)).toEqual({ in: 0, out: 0 });
  });

  it("shortens one fade longer than the clip to the clip", () => {
    expect(fitFades({ in: 0, out: 40 }, 25)).toEqual({ in: 0, out: 25 });
    expect(fitFades({ in: 40, out: 0 }, 25)).toEqual({ in: 25, out: 0 });
  });

  it("shortens both in proportion when together they overlap, filling the clip", () => {
    expect(fitFades({ in: 30, out: 40 }, 20)).toEqual({ in: 9, out: 11 });
    expect(fitFades({ in: 10, out: 250 }, 75)).toEqual({ in: 3, out: 72 });
    expect(fitFades({ in: 5, out: 5 }, 5)).toEqual({ in: 3, out: 2 });
  });

  it("never lengthens a fade, never goes negative, and always fits", () => {
    for (let duration = 0; duration <= 24; duration++) {
      for (let a = 0; a <= 30; a += 3) {
        for (let b = 0; b <= 30; b += 4) {
          const fit = fitFades({ in: a, out: b }, duration);
          expect(fit.in).toBeGreaterThanOrEqual(0);
          expect(fit.out).toBeGreaterThanOrEqual(0);
          expect(fit.in).toBeLessThanOrEqual(a);
          expect(fit.out).toBeLessThanOrEqual(b);
          expect(fit.in + fit.out).toBeLessThanOrEqual(duration);
          expect(Number.isInteger(fit.in) && Number.isInteger(fit.out)).toBe(true);
        }
      }
    }
  });
});
