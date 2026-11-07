import { describe, expect, it } from "vitest";
import { boxPerimeter, cleanStops, colorAt, cornerRadiiOf, fillAsMode, fillAsStops, fillFirstColor, fillLastColor, fillMode, fillWithFirst, fillWithLast, isColorFill, isGradientFill, isTwoStop, linearFill, radialFill } from "./fill.js";
import type { RGBA } from "./types.js";

const red: RGBA = { r: 1, g: 0, b: 0, a: 1 };
const blue: RGBA = { r: 0, g: 0, b: 1, a: 1 };
const black: RGBA = { r: 0, g: 0, b: 0, a: 1 };

describe("fills (Batch 58)", () => {
  it("tells a color, the v1 two-stop gradient and a gradient with stops apart", () => {
    expect([isColorFill(red), isTwoStop(red), isGradientFill(red)]).toEqual([true, false, false]);
    expect([isColorFill({ from: red, to: blue }), isTwoStop({ from: red, to: blue }), isGradientFill({ from: red, to: blue })]).toEqual([false, true, false]);
    expect(isGradientFill(linearFill(red, blue))).toBe(true);
    expect(fillMode(red)).toBe("solid");
    expect(fillMode({ from: red, to: blue })).toBe("linear");
    expect(fillMode(radialFill(red, blue))).toBe("radial");
  });

  it("reads the first and last color of every kind", () => {
    expect(fillFirstColor(red)).toEqual(red);
    expect(fillLastColor(red)).toEqual(red);
    expect(fillFirstColor({ from: red, to: blue })).toEqual(red);
    expect(fillLastColor({ from: red, to: blue })).toEqual(blue);
    const four = { ...linearFill(red, blue), stops: [{ at: 0, color: red }, { at: 0.3, color: black }, { at: 0.6, color: black }, { at: 1, color: blue }] };
    expect(fillFirstColor(four)).toEqual(red);
    expect(fillLastColor(four)).toEqual(blue);
  });

  it("views the v1 gradient as a linear one at angle 0 and a color as two equal stops", () => {
    expect(fillAsStops({ from: red, to: blue })).toEqual(linearFill(red, blue, 0));
    expect(fillAsStops(red).stops.map((stop) => stop.color)).toEqual([red, red]);
  });

  it("changes a fill's first and last color and its mode without losing stops", () => {
    const four = { ...linearFill(red, blue), stops: [{ at: 0, color: red }, { at: 0.3, color: black }, { at: 0.6, color: black }, { at: 1, color: blue }] };
    const edited = fillWithLast(fillWithFirst(four, blue), red);
    expect(isGradientFill(edited) && edited.stops.map((stop) => stop.color)).toEqual([blue, black, black, red]);
    const radial = fillAsMode(four, "radial");
    expect(isGradientFill(radial) && radial.type === "radial" && radial.stops).toHaveLength(4);
    expect(fillAsMode(radial, "solid")).toEqual(red);
    expect(fillAsMode(red, "linear")).toEqual(linearFill(red, black));
    expect(fillWithLast(red, blue)).toEqual(linearFill(red, blue));
  });

  it("sorts, clamps and caps stops", () => {
    const stops = Array.from({ length: 10 }, (_, i) => ({ at: 1 - i / 9, color: red }));
    const clean = cleanStops(stops);
    expect(clean).toHaveLength(8);
    expect(clean.map((stop) => stop.at)).toEqual([...clean.map((stop) => stop.at)].sort((a, b) => a - b));
    expect(cleanStops([{ at: -1, color: red }, { at: 2, color: blue }]).map((stop) => stop.at)).toEqual([0, 1]);
  });

  it("interpolates the color at a position", () => {
    const stops = [{ at: 0, color: black }, { at: 1, color: red }];
    expect(colorAt(stops, 0.5).r).toBeCloseTo(0.5, 6);
    expect(colorAt(stops, -1)).toEqual(black);
    expect(colorAt(stops, 2)).toEqual(red);
  });

  it("gives the four radii of a box, each at most half the shorter side, and its outline length", () => {
    expect(cornerRadiiOf(100, 40, 8)).toEqual([8, 8, 8, 8]);
    expect(cornerRadiiOf(100, 40, 8, [0, 10, 500, 3])).toEqual([0, 10, 20, 3]);
    expect(boxPerimeter(100, 50, [0, 0, 0, 0])).toBeCloseTo(300, 6);
    // A pill (radii of half the height) is two straights and one circle.
    expect(boxPerimeter(100, 50, [25, 25, 25, 25])).toBeCloseTo(100 + Math.PI * 50, 6);
  });
});
