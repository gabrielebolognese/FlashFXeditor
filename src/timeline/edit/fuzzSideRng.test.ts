import { describe, expect, it } from "vitest";
import { random, sideRng } from "./fuzzKit.js";

describe("sideRng (Batch 71 review: seed-reproducible transition parameters)", () => {
  it("gives the same stream for the same seed whatever ran before, and leaves the main stream alone", () => {
    const draw = (seed: number) => {
      const rng = random(seed);
      return [sideRng(rng).next(), sideRng(rng).next()];
    };
    const first = draw(9001);
    draw(5); // another run in between
    expect(draw(9001)).toEqual(first);
    expect(draw(9002)).not.toEqual(first);
    const a = random(7);
    const b = random(7);
    sideRng(a).next();
    expect(a.next()).toBe(b.next());
  });
});
