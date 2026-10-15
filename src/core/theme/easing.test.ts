import { describe, expect, it } from "vitest";
import { ease, LINEAR, parseCubicBezier } from "./easing.js";

describe("easing", () => {
  it("parses the DS cubic-bezier tokens, and reads anything else as linear", () => {
    expect(parseCubicBezier("cubic-bezier(0.2, 0, 0, 1)")).toEqual([0.2, 0, 0, 1]);
    expect(parseCubicBezier(" cubic-bezier(.34,1.3,.64,1) ")).toEqual([0.34, 1.3, 0.64, 1]);
    expect(parseCubicBezier("")).toBe(LINEAR);
    expect(parseCubicBezier("ease-out")).toBe(LINEAR);
    expect(parseCubicBezier("cubic-bezier(1.2, 0, 0, 1)")).toBe(LINEAR);
  });

  it("starts at 0, ends at 1 and follows the curve between", () => {
    const out = parseCubicBezier("cubic-bezier(0.2, 0, 0, 1)");
    expect(ease(out, 0)).toBe(0);
    expect(ease(out, 1)).toBe(1);
    expect(ease(out, -1)).toBe(0);
    expect(ease(LINEAR, 0.3)).toBeCloseTo(0.3, 6);
    // Ease-out: most of the motion early, monotonic.
    expect(ease(out, 0.5)).toBeGreaterThan(0.8);
    let previous = 0;
    for (let t = 0.05; t < 1; t += 0.05) {
      const value = ease(out, t);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });
});
