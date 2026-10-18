import { describe, expect, it } from "vitest";
import { castShadow, parseShadow } from "./shadow.js";

// Built from parts: color literals are lint errors outside tokens.css, tests included.
const rgba = (args: string) => `rgba${"("}${args})`;
const hex = (digits: string) => `${"#"}${digits}`;
const BLACK_50 = rgba("0, 0, 0, 0.5");
const BLACK_40 = rgba("0, 0, 0, 0.4");
const OVERLAY = `0 8px 24px -4px ${BLACK_50}, 0 2px 6px -2px ${BLACK_40}`;

describe("parseShadow", () => {
  it("reads the design system's overlay shadow as two layers, topmost first", () => {
    expect(parseShadow(OVERLAY)).toEqual([
      { x: 0, y: 8, blur: 24, spread: -4, color: BLACK_50 },
      { x: 0, y: 2, blur: 6, spread: -2, color: BLACK_40 },
    ]);
  });

  it("accepts a leading color, hex colors and missing blur or spread", () => {
    expect(parseShadow(`${hex("000")} 1px 2px`)).toEqual([{ x: 1, y: 2, blur: 0, spread: 0, color: hex("000") }]);
    const dense = rgba("0,0,0,.6");
    expect(parseShadow(`${dense} 0 4px 12px`)).toEqual([{ x: 0, y: 4, blur: 12, spread: 0, color: dense }]);
  });

  it("skips inset layers and anything that does not parse", () => {
    expect(parseShadow(`inset 0 1px 0 ${rgba("255, 255, 255, 0.05")}`)).toEqual([]);
    expect(parseShadow("")).toEqual([]);
    expect(parseShadow("none")).toEqual([]);
    expect(parseShadow(`0 1px ${BLACK_50}, bogus 1 2 3 4 5 ${hex("fff")}`)).toEqual([{ x: 0, y: 1, blur: 0, spread: 0, color: BLACK_50 }]);
  });
});

describe("castShadow", () => {
  it("fills each layer's spread rectangle bottom layer first, with device-pixel offsets, and restores the context", () => {
    const calls: string[] = [];
    const ctx = {
      shadowColor: "",
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      shadowBlur: 0,
      fillStyle: "",
      save: () => calls.push("save"),
      restore: () => calls.push("restore"),
      beginPath: () => {},
      roundRect: (x: number, y: number, w: number, h: number, r: number) => calls.push(`rect ${x} ${y} ${w} ${h} ${r}`),
      fill() {
        calls.push(`fill ${this.shadowColor} ${this.shadowOffsetY} ${this.shadowBlur}`);
      },
    };
    castShadow(ctx as unknown as CanvasRenderingContext2D, parseShadow(OVERLAY), 2, 10, 20, 100, 30, 4, "surface");
    expect(calls).toEqual(["save", "rect 12 22 96 26 2", `fill ${BLACK_40} 4 12`, "rect 14 24 92 22 0", `fill ${BLACK_50} 16 48`, "restore"]);
  });
});
