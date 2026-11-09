// The checks of FlashFX-v2 scripts/verify-mask-reveal.mjs (spec §21.18 presets).
import { describe, expect, it } from "vitest";
import { buildMaskReveal, revealBox, type MaskRevealKind } from "./maskReveal.js";

const box = { x: 10, y: 20, w: 300, h: 200 };
const KINDS: MaskRevealKind[] = ["irisIn", "wipeRight", "wipeLeft", "wipeDown", "wipeUp"];

const at = (keys: ReturnType<typeof buildMaskReveal>, field: "x" | "y" | "w" | "h", end: 0 | 1) => keys[field]?.[end].value ?? box[field];

describe("mask reveals", () => {
  it("every kind ends at the box over [start, start + duration]", () => {
    for (const kind of KINDS) {
      const keys = buildMaskReveal(kind, box, 5, 15);
      for (const field of ["x", "y", "w", "h"] as const) {
        expect(at(keys, field, 1)).toBe(box[field]);
        const pair = keys[field];
        if (pair) expect([pair[0].frame, pair[1].frame]).toEqual([5, 20]);
      }
    }
  });

  it("irisIn starts collapsed at the center", () => {
    const keys = buildMaskReveal("irisIn", box, 0, 10);
    expect([at(keys, "x", 0), at(keys, "y", 0), at(keys, "w", 0), at(keys, "h", 0)]).toEqual([160, 120, 0, 0]);
  });

  it("wipes start as a sliver at their edge", () => {
    expect(buildMaskReveal("wipeRight", box, 0, 10)).toEqual({ w: [{ frame: 0, value: 0 }, { frame: 10, value: 300 }] });
    const left = buildMaskReveal("wipeLeft", box, 0, 10);
    expect([at(left, "x", 0), at(left, "w", 0)]).toEqual([310, 0]);
    expect(buildMaskReveal("wipeDown", box, 0, 10)).toEqual({ h: [{ frame: 0, value: 0 }, { frame: 10, value: 200 }] });
    const up = buildMaskReveal("wipeUp", box, 0, 10);
    expect([at(up, "y", 0), at(up, "h", 0)]).toEqual([220, 0]);
  });

  it("the reveal grows for every kind", () => {
    for (const kind of KINDS) {
      const keys = buildMaskReveal(kind, box, 0, 10);
      expect(at(keys, "w", 0) * at(keys, "h", 0)).toBeLessThan(box.w * box.h);
    }
  });

  it("a zero or negative duration still spans one frame", () => {
    expect(buildMaskReveal("wipeRight", box, 3, 0).w?.[1].frame).toBe(4);
    expect(buildMaskReveal("wipeRight", box, 3, -5).w?.[1].frame).toBe(4);
  });

  it("the circle reveal ends on the circle through the box's corners", () => {
    expect(revealBox("wipeRight", 300, 400)).toEqual({ kind: "rect", x: 0, y: 0, w: 300, h: 400 });
    const circle = revealBox("irisIn", 300, 400);
    expect(circle).toEqual({ kind: "ellipse", x: -100, y: -50, w: 500, h: 500 });
  });
});
