import { describe, expect, it } from "vitest";
import { fitWithin } from "./fitWithin.js";

describe("fitWithin", () => {
  it("caps the long edge and keeps the aspect", () => {
    expect(fitWithin(3840, 2160, 1920)).toEqual({ width: 1920, height: 1080 });
    expect(fitWithin(2160, 3840, 1920)).toEqual({ width: 1080, height: 1920 });
    expect(fitWithin(2704, 1520, 1920)).toEqual({ width: 1920, height: 1079 });
  });

  it("leaves frames that fit, and frames without a cap, as they are", () => {
    expect(fitWithin(1920, 1080, 1920)).toEqual({ width: 1920, height: 1080 });
    expect(fitWithin(1080, 1920, 1920)).toEqual({ width: 1080, height: 1920 });
    expect(fitWithin(3840, 2160)).toEqual({ width: 3840, height: 2160 });
  });
});
