// Vitest twin of the per-pixel checks of FlashFX-v2 scripts/verify-mattes.mjs @ a91c675 (the pairing
// checks are not ported: the editor names its matte clip by id, see trackMatte.ts).
import { describe, expect, it } from "vitest";
import { matteCode, matteCoverage, matteFlags, matteLuma } from "./trackMatte.js";

const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 9);

describe("track matte pixel rule (verify-mattes)", () => {
  it("matteFlags: luma vs alpha and inversion", () => {
    expect(matteFlags("alpha")).toEqual({ luma: false, invert: false });
    expect(matteFlags("alphaInverted")).toEqual({ luma: false, invert: true });
    expect(matteFlags("luma")).toEqual({ luma: true, invert: false });
    expect(matteFlags("lumaInverted")).toEqual({ luma: true, invert: true });
  });

  it("matteLuma: Rec.709 weights", () => {
    near(matteLuma(0, 0, 0), 0);
    near(matteLuma(1, 1, 1), 1);
    near(matteLuma(1, 0, 0), 0.2126);
    near(matteLuma(0, 1, 0), 0.7152);
    near(matteLuma(0, 0, 1), 0.0722);
  });

  it("matteCoverage: alpha mode keeps the source alpha; alphaInverted flips it", () => {
    const f = matteFlags("alpha");
    const fi = matteFlags("alphaInverted");
    near(matteCoverage(0.7, 0.3, f), 0.7);
    near(matteCoverage(0.7, 0.3, fi), 1 - 0.7);
    near(matteCoverage(0, 0.9, f), 0);
    near(matteCoverage(1, 0.1, f), 1);
  });

  it("matteCoverage: luma mode keys on luminance; lumaInverted flips it; clamps", () => {
    const f = matteFlags("luma");
    const fi = matteFlags("lumaInverted");
    near(matteCoverage(1, 0.42, f), 0.42);
    near(matteCoverage(1, 0.42, fi), 1 - 0.42);
    near(matteCoverage(1, 1.5, f), 1);
    near(matteCoverage(1, -0.2, f), 0);
  });

  it("shader codes: 0 none, 1 alpha, 2 alpha inverted, 3 luma, 4 luma inverted", () => {
    expect(matteCode(null)).toBe(0);
    expect(matteCode("alpha")).toBe(1);
    expect(matteCode("alphaInverted")).toBe(2);
    expect(matteCode("luma")).toBe(3);
    expect(matteCode("lumaInverted")).toBe(4);
  });
});
