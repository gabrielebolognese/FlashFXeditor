import { describe, expect, it } from "vitest";
import { cueAnimAt, cueAnimFrames, newCueAnimState, POP_FROM, SLIDE_BOX } from "./cueAnim.js";

const at = (anim: Parameters<typeof cueAnimAt>[0], rel: number, duration: number) => ({ ...cueAnimAt(anim, rel, duration, newCueAnimState()) });

describe("cue animations (spec §21.8)", () => {
  it("a 2-frame fade in is 50% on the first frame and at rest on the second", () => {
    const anim = { in: { kind: "fade", frames: 2 } } as const;
    expect(at(anim, 0, 30)).toMatchObject({ opacity: 0.5, scale: 1, dy: 0, active: true });
    expect(at(anim, 1, 30)).toMatchObject({ opacity: 1, active: false });
    expect(at(anim, 15, 30)).toMatchObject({ opacity: 1, active: false });
  });

  it("a pop out shrinks and fades over the last frames", () => {
    const anim = { out: { kind: "pop", frames: 2 } } as const;
    expect(at(anim, 27, 30).active).toBe(false);
    const first = at(anim, 28, 30);
    const last = at(anim, 29, 30);
    expect(first).toMatchObject({ opacity: 1, scale: 1, active: false });
    expect(last.active).toBe(true);
    expect(last.opacity).toBeCloseTo(0.5);
    expect(last.scale).toBeGreaterThan(POP_FROM);
    expect(last.scale).toBeLessThan(1);
  });

  it("clamps each animation to half the cue", () => {
    expect(cueAnimFrames({ kind: "fade", frames: 20 }, 6)).toBe(3);
    expect(cueAnimFrames({ kind: "fade", frames: 20 }, 1)).toBe(0);
    expect(cueAnimFrames({ kind: "fade", frames: 0 }, 30)).toBe(0);
    const anim = { in: { kind: "fade", frames: 20 }, out: { kind: "fade", frames: 20 } } as const;
    // A 6-frame cue: 3 frames in, 3 out, no overlap.
    [1 / 3, 2 / 3, 1, 1, 2 / 3, 1 / 3].forEach((want, rel) => expect(at(anim, rel, 6).opacity).toBeCloseTo(want));
  });

  it("slides up into place and mirrors for slideDown", () => {
    const up = at({ in: { kind: "slideUp", frames: 4 } }, 0, 30);
    const down = at({ in: { kind: "slideDown", frames: 4 } }, 0, 30);
    expect(up.dy).toBeGreaterThan(0);
    expect(up.dy).toBeLessThanOrEqual(SLIDE_BOX);
    expect(down.dy).toBe(-up.dy);
    expect(at({ out: { kind: "slideUp", frames: 4 } }, 29, 30).dy).toBeLessThan(0);
  });

  it("does nothing without an animation", () => {
    expect(at(undefined, 0, 30)).toEqual({ opacity: 1, scale: 1, dy: 0, active: false });
    expect(at({}, 0, 30).active).toBe(false);
  });
});
