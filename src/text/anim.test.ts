import { describe, expect, it } from "vitest";
import type { TextAnim } from "../core/document/types.js";
import {
  activeAnim,
  animEase,
  animLength,
  animUnit,
  ease,
  fromPresetAnim,
  isPlayable,
  newTextAnim,
  newUnitState,
  POP_FROM,
  presence,
  sameAnim,
  sanitizePresetAnim,
  sanitizeTextAnim,
  SLIDE_EM,
  toPresetAnim,
  typedCount,
  unitProgress,
  unitStagger,
  writeUnitShape,
  type ActiveAnim,
} from "./anim.js";

const FPS30 = { num: 30, den: 1 };
const scratch = (): ActiveAnim => ({ anim: { id: "fade", duration: 1 }, phase: "in", progress: 0, length: 0 });

describe("activeAnim", () => {
  const clip = { duration: 90, animIn: { id: "fade", duration: 15 } as TextAnim, animOut: { id: "pop", duration: 10 } as TextAnim };

  it("plays the in animation from the first frame (progress 0) and the out one to the last (progress 1)", () => {
    expect(activeAnim(clip, 0, scratch())).toMatchObject({ phase: "in", progress: 0, length: 15 });
    expect(activeAnim(clip, 14, scratch())?.progress).toBeCloseTo(14 / 15);
    expect(activeAnim(clip, 15, scratch())).toBeNull();
    expect(activeAnim(clip, 79, scratch())).toBeNull();
    expect(activeAnim(clip, 80, scratch())).toMatchObject({ phase: "out", progress: 0.1, length: 10 });
    expect(activeAnim(clip, 89, scratch())?.progress).toBe(1);
    expect(activeAnim(clip, 90, scratch())).toBeNull();
    expect(activeAnim(clip, -1, scratch())).toBeNull();
  });

  it("clamps each animation to half the clip, so in and out never overlap", () => {
    const short = { ...clip, duration: 21, animIn: { id: "fade", duration: 60 } as TextAnim, animOut: { id: "fade", duration: 60 } as TextAnim };
    expect(animLength(short.animIn, 21)).toBe(10);
    expect(activeAnim(short, 9, scratch())).toMatchObject({ phase: "in", length: 10 });
    expect(activeAnim(short, 10, scratch())).toBeNull();
    expect(activeAnim(short, 11, scratch())).toMatchObject({ phase: "out", progress: 0.1 });
    // A one-frame clip has no room for an animation.
    expect(animLength(clip.animIn, 1)).toBe(0);
    expect(activeAnim({ ...clip, duration: 1 }, 0, scratch())).toBeNull();
  });

  it("ignores animations it cannot play", () => {
    expect(isPlayable({ id: "spin", duration: 10 } as unknown as TextAnim)).toBe(false);
    expect(isPlayable({ id: "fade", duration: 0 })).toBe(false);
    expect(isPlayable({ id: "fade", duration: 2.5 })).toBe(false);
    expect(activeAnim({ duration: 90, animIn: { id: "fade" } as unknown as TextAnim }, 0, scratch())).toBeNull();
  });
});

describe("units", () => {
  it("knows each animation's unit, and perUnit replaces it", () => {
    expect(animUnit({ id: "fade" })).toBe("block");
    expect(animUnit({ id: "wordPop" })).toBe("word");
    expect(animUnit({ id: "typewriter" })).toBe("char");
    expect(animUnit({ id: "lineReveal" })).toBe("line");
    expect(animUnit({ id: "fade", perUnit: "word" })).toBe("word");
  });

  it("spreads the units over the whole duration: the first starts at 0, the last ends at 1", () => {
    const anim = {};
    const n = 12;
    expect(unitProgress(anim, "in", 0, 0, n, 24)).toBe(0);
    expect(unitProgress(anim, "in", 0.5, n - 1, n, 24)).toBe(0);
    expect(unitProgress(anim, "in", 1, n - 1, n, 24)).toBe(1);
    // Auto stagger: each unit takes 2.5 delays.
    const s = unitStagger(anim, n, 24);
    expect(s).toBeCloseTo(24 / 13.5);
    expect(unitProgress(anim, "in", (2.5 * s) / 24, 0, n, 24)).toBeCloseTo(1);
  });

  it("cuts a stagger longer than duration / units, and mirrors the order of an out animation", () => {
    expect(unitStagger({ stagger: 100 }, 4, 20)).toBe(5);
    expect(unitStagger({ stagger: 2 }, 4, 20)).toBe(2);
    expect(unitStagger({ stagger: 2 }, 1, 20)).toBe(0);
    // stagger 5, 4 units in 20 frames: each takes 5. Out: the last unit leaves first.
    expect(unitProgress({ stagger: 5 }, "out", 0.25, 3, 4, 20)).toBe(1);
    expect(unitProgress({ stagger: 5 }, "out", 0.25, 0, 4, 20)).toBe(0);
    expect(unitProgress({ stagger: 5 }, "in", 0.25, 0, 4, 20)).toBe(1);
  });

  it("types units by count and erases them from the end", () => {
    expect(typedCount("in", 0, 10)).toBe(0);
    expect(typedCount("in", 0.35, 10)).toBe(3);
    expect(typedCount("in", 1, 10)).toBe(10);
    expect(typedCount("out", 0.1, 10)).toBe(9);
    expect(typedCount("out", 1, 10)).toBe(0);
  });
});

describe("shapes", () => {
  it("eases with the animation's curve, mirrored for an out", () => {
    expect(animEase({ id: "fade" }, "in")).toBe("easeOut");
    expect(animEase({ id: "fade" }, "out")).toBe("easeIn");
    expect(animEase({ id: "pop" }, "out")).toBe("linear");
    expect(animEase({ id: "fade", ease: "easeInOut" }, "out")).toBe("easeInOut");
    expect(ease("easeOut", 0.5)).toBeCloseTo(0.875);
    expect(ease("easeIn", 0.5)).toBeCloseTo(0.125);
    expect(ease("easeInOut", 0.25)).toBeCloseTo(0.0625);
    expect(presence({ id: "fade" }, "in", 1)).toBe(1);
    expect(presence({ id: "fade" }, "out", 1)).toBe(0);
  });

  it("slides keep the direction they name in and out", () => {
    const s = newUnitState();
    writeUnitShape(s, "slideUp", "in", 0, 100, 50);
    expect([s.x, s.y, s.opacity]).toEqual([0, SLIDE_EM * 100, 0]);
    writeUnitShape(s, "slideUp", "out", 0, 100, 50);
    expect(s.y).toBe(-SLIDE_EM * 100);
    writeUnitShape(s, "slideRight", "in", 0.5, 100, 50);
    expect(s.x).toBeCloseTo(-0.5 * SLIDE_EM * 100);
    expect(s.opacity).toBe(0.5);
    writeUnitShape(s, "slideLeft", "out", 0, 100, 50);
    expect(s.x).toBe(-SLIDE_EM * 100);
  });

  it("pops and bounces from small to rest, with an overshoot", () => {
    const s = newUnitState();
    writeUnitShape(s, "wordPop", "in", 0, 100, 50);
    expect(s.scale).toBeCloseTo(POP_FROM);
    expect(s.opacity).toBe(0);
    writeUnitShape(s, "wordPop", "in", 0.7, 100, 50);
    expect(s.scale).toBeGreaterThan(1);
    writeUnitShape(s, "scaleBounce", "in", 0.4, 100, 50);
    expect(s.scale).toBeGreaterThan(1.1);
    writeUnitShape(s, "scaleBounce", "in", 1, 100, 50);
    expect([s.scale, s.opacity]).toEqual([1, 1]);
  });

  it("reveals lines through a mask and blurs into focus", () => {
    const s = newUnitState();
    writeUnitShape(s, "lineReveal", "in", 0.25, 100, 40);
    expect([s.y, s.masked, s.opacity]).toEqual([30, true, 1]);
    writeUnitShape(s, "lineReveal", "out", 0.75, 100, 40);
    expect(s.y).toBeCloseTo(-10);
    writeUnitShape(s, "blurIn", "in", 0, 100, 40);
    expect(s.blur).toBeCloseTo(20);
    writeUnitShape(s, "blurIn", "in", 1, 100, 40);
    expect([s.blur, s.opacity, s.masked]).toEqual([0, 1, false]);
  });
});

describe("editing and files", () => {
  it("starts an animation at its own length, or keeps the previous one's timing", () => {
    expect(newTextAnim("fade", FPS30)).toEqual({ id: "fade", duration: 15 });
    expect(newTextAnim("typewriter", { num: 60, den: 1 })).toEqual({ id: "typewriter", duration: 60 });
    expect(newTextAnim("pop", FPS30, { id: "fade", duration: 20, stagger: 2, ease: "linear", perUnit: "word" })).toEqual({ id: "pop", duration: 20, stagger: 2, ease: "linear" });
  });

  it("sanitizes animations and rejects ones without an id or a duration", () => {
    expect(sanitizeTextAnim({ id: "wordPop", duration: 12.4, stagger: -1, ease: "bogus", perUnit: "line" })).toEqual({ id: "wordPop", duration: 12, perUnit: "line" });
    expect(sanitizeTextAnim({ id: "fade" })).toBeNull();
    expect(sanitizeTextAnim({ id: "nope", duration: 10 })).toBeNull();
    expect(sanitizeTextAnim(null)).toBeNull();
    expect(sanitizePresetAnim({ id: "fade", durationMs: 500, staggerMs: 33.3, ease: "easeIn" })).toEqual({ id: "fade", durationMs: 500, staggerMs: 33, ease: "easeIn" });
    expect(sanitizePresetAnim({ id: "fade", duration: 15 })).toBeNull();
  });

  it("stores preset animations in milliseconds and brings them back in the project's frames", () => {
    const anim: TextAnim = { id: "wordPop", duration: 24, stagger: 3, ease: "easeOut" };
    const stored = toPresetAnim(anim, FPS30);
    expect(stored).toEqual({ id: "wordPop", durationMs: 800, staggerMs: 100, ease: "easeOut" });
    expect(fromPresetAnim(stored, FPS30)).toEqual(anim);
    expect(fromPresetAnim(stored, { num: 60, den: 1 })).toEqual({ id: "wordPop", duration: 48, stagger: 6, ease: "easeOut" });
    // 29.97: 15 frames are 500.5 ms, and come back as 15.
    const ntsc = { num: 30000, den: 1001 };
    expect(fromPresetAnim(toPresetAnim({ id: "fade", duration: 15 }, ntsc), ntsc)).toEqual({ id: "fade", duration: 15 });
    expect(fromPresetAnim({ id: "fade", durationMs: 1 }, FPS30).duration).toBe(1);
  });

  it("compares animations by value", () => {
    expect(sameAnim(undefined, undefined)).toBe(true);
    expect(sameAnim({ id: "fade", duration: 10 }, { id: "fade", duration: 10 })).toBe(true);
    expect(sameAnim({ id: "fade", duration: 10 }, { id: "fade", duration: 11 })).toBe(false);
    expect(sameAnim({ id: "fade", duration: 10 }, undefined)).toBe(false);
  });
});
