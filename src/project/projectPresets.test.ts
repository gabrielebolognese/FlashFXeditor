import { describe, expect, it } from "vitest";
import { formatFps, FRAME_RATES, fpsKey, parseFpsKey, resolutionPresetId } from "./projectPresets.js";

describe("project presets", () => {
  it("formats frame rates", () => {
    expect(FRAME_RATES.map(formatFps)).toEqual(["23.976", "24", "25", "29.97", "30", "50", "59.94", "60"]);
  });

  it("round-trips frame rate keys and rejects bad ones", () => {
    for (const fps of FRAME_RATES) expect(parseFpsKey(fpsKey(fps))).toEqual(fps);
    for (const key of ["30", "30/0", "0/1", "a/b", "30.5/1"]) expect(parseFpsKey(key)).toBeNull();
  });

  it("matches sizes to presets", () => {
    expect(resolutionPresetId(1080, 1920)).toBe("9:16");
    expect(resolutionPresetId(1920, 1080)).toBe("16:9");
    expect(resolutionPresetId(720, 1280)).toBe("custom");
  });
});
