import { describe, expect, it } from "vitest";
import { freeLutName, lutFileName } from "./lutController.js";

describe("LUT file names (spec §21.19, Batch 75)", () => {
  it("keeps a safe file name ending in .cube", () => {
    expect(lutFileName("Warm Sunset.cube")).toBe("Warm Sunset.cube");
    expect(lutFileName("Warm.CUBE")).toBe("Warm.cube");
    expect(lutFileName("a:b*c?.cube")).toBe("a-b-c-.cube");
    expect(lutFileName("..hidden.cube")).toBe("hidden.cube");
    expect(lutFileName(".cube")).toBe("lut.cube");
  });

  it("picks the first free name in luts/ (case blind)", () => {
    expect(freeLutName("warm.cube", [])).toBe("warm.cube");
    expect(freeLutName("warm.cube", ["Warm.cube"])).toBe("warm-2.cube");
    expect(freeLutName("warm.cube", ["warm.cube", "warm-2.cube"])).toBe("warm-3.cube");
  });
});
