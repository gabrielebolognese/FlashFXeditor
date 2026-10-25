/* eslint-disable no-restricted-syntax -- hex strings are the data under test here, not UI colors */
import { describe, expect, it } from "vitest";
import { MAX_RECENT_COLORS, pushRecentColor } from "../project/appSettings.js";
import { hsvToRgb, rgbToHsv } from "./colorMath.js";

describe("color math (spec §11 color picker)", () => {
  it("converts the primaries, greys and back", () => {
    expect(rgbToHsv({ r: 1, g: 0, b: 0 })).toEqual({ h: 0, s: 1, v: 1 });
    expect(rgbToHsv({ r: 0, g: 1, b: 0 })).toEqual({ h: 120, s: 1, v: 1 });
    expect(rgbToHsv({ r: 0, g: 0, b: 1 })).toEqual({ h: 240, s: 1, v: 1 });
    expect(rgbToHsv({ r: 0.5, g: 0.5, b: 0.5 })).toEqual({ h: 0, s: 0, v: 0.5 });
    expect(rgbToHsv({ r: 0, g: 0, b: 0 })).toEqual({ h: 0, s: 0, v: 0 });
    for (const color of [
      { r: 0.85, g: 0.65, b: 0.13 },
      { r: 0.2, g: 0.9, b: 0.6 },
      { r: 0.7, g: 0.1, b: 0.95 },
      { r: 1, g: 0.2, b: 0.4 },
    ]) {
      const back = hsvToRgb(rgbToHsv(color));
      expect(back.r).toBeCloseTo(color.r, 12);
      expect(back.g).toBeCloseTo(color.g, 12);
      expect(back.b).toBeCloseTo(color.b, 12);
    }
    expect(hsvToRgb({ h: 360, s: 1, v: 1 })).toEqual({ r: 1, g: 0, b: 0 });
    expect(hsvToRgb({ h: 60, s: 1, v: 1 })).toEqual({ r: 1, g: 1, b: 0 });
  });

  it("keeps the recent colors (newest first, unique, capped)", () => {
    expect(pushRecentColor(["#aaaaaa", "#bbbbbb"], "#BBBBBB")).toEqual(["#bbbbbb", "#aaaaaa"]);
    const many = Array.from({ length: 10 }, (_, i) => `#00000${i}`);
    const recent = pushRecentColor(many, "#ffffff");
    expect(recent).toHaveLength(MAX_RECENT_COLORS);
    expect(recent[0]).toBe("#ffffff");
  });
});
