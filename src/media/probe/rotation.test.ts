import { describe, expect, it } from "vitest";
import { displaySize, rotationFromMatrix } from "./rotation.js";

const ONE = 0x10000;
const W = 0x40000000;

describe("rotationFromMatrix", () => {
  it("reads the four quarter turns", () => {
    expect(rotationFromMatrix([ONE, 0, 0, 0, ONE, 0, 0, 0, W])).toBe(0);
    expect(rotationFromMatrix([0, ONE, 0, -ONE, 0, 0, 0, 0, W])).toBe(90);
    expect(rotationFromMatrix([-ONE, 0, 0, 0, -ONE, 0, 0, 0, W])).toBe(180);
    expect(rotationFromMatrix([0, -ONE, 0, ONE, 0, 0, 0, 0, W])).toBe(270);
  });

  it("accepts typed arrays (mp4box)", () => {
    expect(rotationFromMatrix(Int32Array.from([0, ONE, 0, -ONE, 0, 0, 0, 0, W]))).toBe(90);
  });

  it("snaps small skews and handles missing matrices", () => {
    expect(rotationFromMatrix([Math.round(ONE * Math.cos(0.01)), Math.round(ONE * Math.sin(0.01)), 0, 0, ONE, 0, 0, 0, W])).toBe(0);
    expect(rotationFromMatrix(undefined)).toBe(0);
    expect(rotationFromMatrix([0, 0, 0, 0, 0])).toBe(0);
  });
});

describe("displaySize", () => {
  it("swaps width and height for quarter turns", () => {
    expect(displaySize(1920, 1080, 90)).toEqual({ width: 1080, height: 1920 });
    expect(displaySize(1920, 1080, 270)).toEqual({ width: 1080, height: 1920 });
    expect(displaySize(1920, 1080, 180)).toEqual({ width: 1920, height: 1080 });
    expect(displaySize(1920, 1080, undefined)).toEqual({ width: 1920, height: 1080 });
  });
});
