/* eslint-disable no-restricted-syntax -- hex strings are the data under test here, not UI colors */
import { describe, expect, it } from "vitest";
import { formatHexColor, parseHexColor } from "./color.js";

describe("parseHexColor", () => {
  it("parses #RRGGBB as opaque", () => {
    expect(parseHexColor("#ff0080")).toEqual({ r: 1, g: 0, b: 128 / 255, a: 1 });
  });

  it("accepts short form, missing #, uppercase and whitespace", () => {
    expect(parseHexColor(" F08 ")).toEqual({ r: 1, g: 0, b: 136 / 255, a: 1 });
  });

  it("reads the alpha byte of #RRGGBBAA", () => {
    expect(parseHexColor("#00000080")?.a).toBeCloseTo(128 / 255);
  });

  it("rejects anything else", () => {
    for (const text of ["", "#", "#12", "#12345", "#1234567", "#gg0000", "red", "#ff00000000"]) {
      expect(parseHexColor(text)).toBeNull();
    }
  });
});

describe("formatHexColor", () => {
  it("formats opaque colors as #rrggbb", () => {
    expect(formatHexColor({ r: 1, g: 0, b: 0.5, a: 1 })).toBe("#ff0080");
  });

  it("adds the alpha byte when translucent and clamps channels", () => {
    expect(formatHexColor({ r: 2, g: -1, b: 0, a: 0.5 })).toBe("#ff000080");
  });

  it("round-trips every byte value", () => {
    for (let v = 0; v < 256; v++) {
      const hex = `#${v.toString(16).padStart(2, "0").repeat(3)}`;
      const parsed = parseHexColor(hex);
      expect(parsed && formatHexColor(parsed)).toBe(hex);
    }
  });
});
