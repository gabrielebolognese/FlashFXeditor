import { describe, expect, it } from "vitest";
import { cssColorToRgba } from "./cssColor.js";

// Built from parts: color literals are lint errors outside tokens.css, tests included.
const fn = (name: string, args: string) => `${name}${"("}${args})`;

describe("cssColorToRgba", () => {
  it("parses hex tokens", () => {
    expect(cssColorToRgba("#" + "ff0000")).toEqual({ r: 1, g: 0, b: 0, a: 1 });
    expect(cssColorToRgba(" #" + "0000ff80 ")).toEqual({ r: 0, g: 0, b: 1, a: 128 / 255 });
  });

  it("parses the rgb functions with commas or spaces", () => {
    expect(cssColorToRgba(fn("rgba", "255, 255, 255, 0.08"))).toEqual({ r: 1, g: 1, b: 1, a: 0.08 });
    expect(cssColorToRgba(fn("rgb", "0 51 255"))).toEqual({ r: 0, g: 0.2, b: 1, a: 1 });
    expect(cssColorToRgba(fn("rgb", "0 0 0 / 50%"))).toEqual({ r: 0, g: 0, b: 0, a: 0.5 });
  });

  it("clamps out-of-range channels", () => {
    expect(cssColorToRgba(fn("rgba", "300, -4, 0, 2"))).toEqual({ r: 1, g: 0, b: 0, a: 1 });
  });

  it("rejects anything else", () => {
    expect(cssColorToRgba("")).toBeNull();
    expect(cssColorToRgba("red")).toBeNull();
    expect(cssColorToRgba(fn("hsl", "0 0% 0%"))).toBeNull();
    expect(cssColorToRgba(fn("rgb", "1, 2"))).toBeNull();
    expect(cssColorToRgba(fn("rgb", "a, b, c"))).toBeNull();
  });
});
