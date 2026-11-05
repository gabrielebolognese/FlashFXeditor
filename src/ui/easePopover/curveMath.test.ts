import { describe, expect, it } from "vitest";
import { BEZIER_PRESETS, clampBezier, cssBezier, curvePath, holdPath, parseCssBezier, presetOf } from "./curveMath.js";

describe("cssBezier", () => {
  it("writes the CSS text, trimmed", () => {
    expect(cssBezier([0.68, -0.55, 0.27, 1.55])).toBe("cubic-bezier(0.68, -0.55, 0.27, 1.55)");
    expect(cssBezier([0, 0, 1, 1])).toBe("cubic-bezier(0, 0, 1, 1)");
    expect(cssBezier([0.333333, 0, 0.66666, 1])).toBe("cubic-bezier(0.333, 0, 0.667, 1)");
    expect(cssBezier([-0.0001, 0.5, 0.5, 0.5])).toBe("cubic-bezier(0, 0.5, 0.5, 0.5)");
  });
  it("round-trips through the parser", () => {
    for (const preset of BEZIER_PRESETS) expect(parseCssBezier(cssBezier(preset.points))).toEqual(preset.points);
  });
});

describe("parseCssBezier", () => {
  it("accepts spaces or none and rejects other text", () => {
    expect(parseCssBezier("cubic-bezier(.25,.1,.25,1)")).toEqual([0.25, 0.1, 0.25, 1]);
    expect(parseCssBezier("  cubic-bezier( 0.68 , -0.55 , 0.27 , 1.55 );")).toEqual([0.68, -0.55, 0.27, 1.55]);
    expect(parseCssBezier("cubic-bezier(1,2,3)")).toBeNull();
    expect(parseCssBezier("ease")).toBeNull();
  });
});

describe("clampBezier", () => {
  it("clamps x to 0..1 and y to -2..3", () => {
    expect(clampBezier([-1, -5, 2, 9])).toEqual([0, -2, 1, 3]);
    expect(clampBezier([0.3, 1.5, 0.7, -0.5])).toEqual([0.3, 1.5, 0.7, -0.5]);
    expect(clampBezier([NaN, 0, 0, 0])[0]).toBe(0);
  });
});

describe("presets and paths", () => {
  it("finds a preset by its points", () => {
    expect(presetOf([0.2, 0, 0, 1])?.id).toBe("snap");
    expect(presetOf([0.21, 0, 0, 1])).toBeNull();
  });
  it("builds a path with 41 samples", () => {
    const d = curvePath((t) => t, 40, 40, 2);
    expect(d.match(/[ML]/g)).toHaveLength(41);
    expect(d.startsWith("M2 38")).toBe(true);
    expect(d.endsWith("L38 2")).toBe(true);
    expect(holdPath(40, 40, 2)).toBe("M2 38L38 38L38 2");
  });
});
