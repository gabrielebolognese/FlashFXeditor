import { describe, expect, it } from "vitest";
import { edgeStep } from "./autoScroll.js";

describe("edgeStep", () => {
  it("is 0 away from the edges and grows with the depth into the band", () => {
    expect(edgeStep(500, 100, 1000, 24)).toBe(0);
    expect(edgeStep(124, 100, 1000, 24)).toBe(0);
    expect(edgeStep(112, 100, 1000, 24)).toBeCloseTo(-6);
    expect(edgeStep(100, 100, 1000, 24)).toBeCloseTo(-12);
    expect(edgeStep(988, 100, 1000, 24)).toBeCloseTo(6);
    expect(edgeStep(1000, 100, 1000, 24)).toBeCloseTo(12);
  });

  it("keeps growing past the edge, up to three times the speed at the edge", () => {
    expect(edgeStep(76, 100, 1000, 24)).toBeCloseTo(-24);
    expect(edgeStep(-500, 100, 1000, 24)).toBeCloseTo(-36);
    expect(edgeStep(5000, 100, 1000, 24)).toBeCloseTo(36);
  });

  it("picks the nearer edge in a view narrower than two bands, and does nothing without a zone", () => {
    expect(edgeStep(105, 100, 130, 24)).toBeLessThan(0);
    expect(edgeStep(125, 100, 130, 24)).toBeGreaterThan(0);
    expect(edgeStep(100, 100, 1000, 0)).toBe(0);
  });
});
