import { describe, expect, it } from "vitest";
import { applyToPoint, IDENTITY, invert, multiply, multiplyInto, mutableIdentity, rectTransform, scaling, setMat, translation } from "./mat3.js";

describe("mat3", () => {
  it("identity leaves points alone", () => {
    expect(applyToPoint(IDENTITY, 3, -4)).toEqual({ x: 3, y: -4 });
  });

  it("multiply applies the right matrix first", () => {
    const m = multiply(translation(10, 20), scaling(2, 3));
    expect(applyToPoint(m, 1, 1)).toEqual({ x: 12, y: 23 });
    const n = multiply(scaling(2, 3), translation(10, 20));
    expect(applyToPoint(n, 1, 1)).toEqual({ x: 22, y: 63 });
  });

  it("multiplyInto matches multiply and may write over an operand", () => {
    const a = translation(10, 20);
    const b = scaling(2, 3);
    const out = mutableIdentity();
    expect(multiplyInto(out, a, b)).toEqual(multiply(a, b));
    const m = setMat(mutableIdentity(), 1, 2, 3, 4, 5, 6);
    multiplyInto(m, m, translation(1, 1));
    expect(m).toEqual(multiply([1, 2, 3, 4, 5, 6], translation(1, 1)));
  });

  it("rectTransform maps the unit square onto the rectangle", () => {
    const m = rectTransform(5, 6, 100, 50);
    expect(applyToPoint(m, 0, 0)).toEqual({ x: 5, y: 6 });
    expect(applyToPoint(m, 1, 1)).toEqual({ x: 105, y: 56 });
  });

  it("keeps the shear terms in column-major order", () => {
    const shear = [1, 0.5, 0.25, 1, 0, 0] as const;
    expect(applyToPoint(shear, 2, 4)).toEqual({ x: 3, y: 5 });
    expect(multiply(shear, IDENTITY)).toEqual(shear);
  });

  it("invert undoes the matrix", () => {
    const m = multiply(translation(30, -12), multiply(scaling(4, 0.5), [1, 0.25, -0.5, 1, 0, 0]));
    const inverse = invert(m);
    expect(inverse).not.toBeNull();
    const p = applyToPoint(m, 7, 9);
    const back = applyToPoint(inverse ?? IDENTITY, p.x, p.y);
    expect(back.x).toBeCloseTo(7, 9);
    expect(back.y).toBeCloseTo(9, 9);
    expect(invert(scaling(0, 1))).toBeNull();
  });
});
