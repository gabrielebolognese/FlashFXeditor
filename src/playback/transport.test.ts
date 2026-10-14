import { describe, expect, it } from "vitest";
import { shuttleSpeed } from "./transport.js";

describe("shuttleSpeed", () => {
  it("climbs 1x, 2x, 4x, 8x on repeated presses and stays at 8x", () => {
    let speed = 0;
    const seen: number[] = [];
    for (let i = 0; i < 5; i++) seen.push((speed = shuttleSpeed(speed, 1)));
    expect(seen).toEqual([1, 2, 4, 8, 8]);
    speed = 0;
    seen.length = 0;
    for (let i = 0; i < 5; i++) seen.push((speed = shuttleSpeed(speed, -1)));
    expect(seen).toEqual([-1, -2, -4, -8, -8]);
  });

  it("starts at 1x in the pressed direction when playing the other way", () => {
    expect(shuttleSpeed(4, -1)).toBe(-1);
    expect(shuttleSpeed(-8, 1)).toBe(1);
  });
});
