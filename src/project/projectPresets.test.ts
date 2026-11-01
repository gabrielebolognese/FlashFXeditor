import { describe, expect, it } from "vitest";
import { formatFps, FRAME_RATES, fpsKey, parseFpsKey, ratioCommandId, ratioPreset, ratioSize, RESOLUTION_PRESETS, resolutionPresetId } from "./projectPresets.js";

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

  it("gives the Ratio menu each shape at the project's short side (a 4K project stays 4K)", () => {
    const preset = (id: string) => RESOLUTION_PRESETS.find((p) => p.id === id) ?? RESOLUTION_PRESETS[0]!;
    expect(ratioSize(preset("16:9"), { width: 1080, height: 1920 })).toEqual({ width: 1920, height: 1080 });
    expect(ratioSize(preset("9:16"), { width: 1920, height: 1080 })).toEqual({ width: 1080, height: 1920 });
    expect(ratioSize(preset("16:9"), { width: 2160, height: 3840 })).toEqual({ width: 3840, height: 2160 });
    expect(ratioSize(preset("4:5"), { width: 2160, height: 3840 })).toEqual({ width: 2160, height: 2700 });
    expect(ratioSize(preset("1:1"), { width: 720, height: 1280 })).toEqual({ width: 720, height: 720 });
    // The long side stays at most 7680 px.
    expect(ratioSize(preset("16:9"), { width: 7680, height: 7680 })).toEqual({ width: 7680, height: 4320 });
  });

  it("names a size's shape at any resolution, and each shape's command", () => {
    expect(ratioPreset(3840, 2160)?.id).toBe("16:9");
    expect(ratioPreset(2160, 3840)?.id).toBe("9:16");
    expect(ratioPreset(1000, 1234)).toBeNull();
    expect(RESOLUTION_PRESETS.map(ratioCommandId)).toEqual(["project.ratio.vertical", "project.ratio.portrait", "project.ratio.square", "project.ratio.horizontal"]);
  });
});
