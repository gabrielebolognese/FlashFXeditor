import { describe, expect, it } from "vitest";
import { directionalSampleCount, directionalTapOffset, directionalUvOffset, whipShift, whipSpread, WHIP_TAPS } from "./directionalBlur.js";

describe("directional blur taps (ported from FlashFX-v2 fs_directional, Batch 71)", () => {
  it("averages 2 * taps + 1 samples at symmetric offsets from -1 to 1", () => {
    expect(directionalSampleCount(15)).toBe(31);
    expect(directionalSampleCount(WHIP_TAPS)).toBe(9);
    expect(directionalTapOffset(-WHIP_TAPS, WHIP_TAPS)).toBe(-1);
    expect(directionalTapOffset(0, WHIP_TAPS)).toBe(0);
    expect(directionalTapOffset(WHIP_TAPS, WHIP_TAPS)).toBe(1);
    expect(directionalTapOffset(3, 0)).toBe(0);
  });

  it("offsets a tap by cos/sin of the angle times strength over the picture size", () => {
    const right = directionalUvOffset(15, 15, 0, 54, 1080, 1920);
    expect(right.x).toBeCloseTo(0.05, 9);
    expect(right.y).toBeCloseTo(0, 9);
    const down = directionalUvOffset(-15, 15, Math.PI / 2, 96, 1080, 1920);
    expect(down.x).toBeCloseTo(0, 9);
    expect(down.y).toBeCloseTo(-0.05, 9);
  });

  it("the whip spreads by sin(pi t): none at the ends, peak at the cut, tap shifts symmetric", () => {
    expect(whipSpread(0)).toBeCloseTo(0, 9);
    expect(whipSpread(1)).toBeCloseTo(0, 9);
    expect(whipSpread(0.5)).toBeCloseTo(0.08, 9);
    for (let k = 1; k <= WHIP_TAPS; k++) expect(whipShift(-k, 0.3)).toBeCloseTo(-whipShift(k, 0.3), 12);
    expect(whipShift(WHIP_TAPS, 0.5)).toBeCloseTo(0.08, 9);
    // The shader's own step: `k * spread * 0.25`.
    expect(whipShift(3, 0.25)).toBeCloseTo(3 * whipSpread(0.25) * 0.25, 12);
  });
});
