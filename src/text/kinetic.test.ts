import { describe, expect, it } from "vitest";
import type { AnimatorSelector, TextAnimator, TextCounter } from "../core/document/types.js";
import { ease } from "../core/document/keyframes.js";
import { newUnitState, type UnitState } from "./anim.js";
import { evaluateAnimators, newAnimator, nextAnimatorId, sanitizeAnimators, sizedStates, tintColor, type AnimatorGeometry } from "./animators.js";
import { counterGlyphs, counterText, counterTextAt, counterValueAt, formatCounterNumber, newCounter, sanitizeCounter } from "./counter.js";
import { DECODE_CHARSET, DECODE_HOLD, decodedChar, decodeSeed, isLocked, scrambleChar } from "./decode.js";
import { selectorWeights, shuffled, unitPosition, weightAt } from "./rangeSelector.js";

const selector = (patch: Partial<AnimatorSelector> = {}): AnimatorSelector => ({ start: 0, end: 1, offset: 0, shape: "rampUp", ease: 0, order: "forward", seed: 1, ...patch });

describe("range selector", () => {
  it("ramps up over the units, the first at 0 and the last at 1", () => {
    expect(selectorWeights(5, selector())).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });

  it("an offset moves the window: a reveal keyed from 0 to 1", () => {
    // Window [0,1] shifted by -1 is all past: every unit full. Shifted by +1: none.
    expect(selectorWeights(4, selector({ offset: 1 }))).toEqual([0, 0, 0, 0]);
    expect(selectorWeights(4, selector({ offset: -1 }))).toEqual([1, 1, 1, 1]);
    const half = selectorWeights(3, selector({ end: 0.5, offset: 0 }));
    expect(half).toEqual([0, 1, 1]);
  });

  it("the shapes: square, rampDown, triangle, round, smooth", () => {
    const at = (shape: AnimatorSelector["shape"], p: number) => weightAt(p, selector({ shape }));
    expect(at("square", 0.5)).toBe(1);
    expect(at("square", 0)).toBe(0);
    expect(at("rampDown", 0.25)).toBeCloseTo(0.75);
    expect(at("triangle", 0.5)).toBe(1);
    expect(at("triangle", 1)).toBe(0);
    expect(at("round", 0.5)).toBeCloseTo(Math.sqrt(0.75));
    expect(at("smooth", 0.5)).toBeCloseTo(0.5);
  });

  it("ease reshapes the ramp and keeps its ends", () => {
    const high = weightAt(0.5, selector({ ease: 1 }));
    const low = weightAt(0.5, selector({ ease: -1 }));
    expect(high).toBeGreaterThan(0.5);
    expect(low).toBeLessThan(0.5);
    expect(weightAt(0, selector({ ease: 1 }))).toBe(0);
    expect(weightAt(1, selector({ ease: -1 }))).toBe(1);
  });

  it("order: reverse mirrors, random is a seeded permutation that never changes", () => {
    expect(selectorWeights(3, selector({ order: "reverse" }))).toEqual([1, 0.5, 0]);
    const a = shuffled(12, 7);
    expect([...a].sort((x, y) => x - y)).toEqual(Array.from({ length: 12 }, (_, i) => i));
    expect(shuffled(12, 7)).toEqual(a);
    expect(shuffled(12, 8)).not.toEqual(a);
    const w1 = selectorWeights(12, selector({ order: "random", seed: 7 }));
    const w2 = selectorWeights(12, selector({ order: "random", seed: 7 }));
    expect(w1).toEqual(w2);
    expect(unitPosition(0, 1, selector())).toBe(0);
  });
});

describe("counter", () => {
  const counter = (patch: Partial<TextCounter> = {}): TextCounter => ({ ...newCounter(), ...patch });

  it("formats decimals, separators and signs", () => {
    expect(formatCounterNumber(85.6, 1, "")).toBe("85.6");
    expect(formatCounterNumber(1234567.891, 2, ",")).toBe("1,234,567.89");
    expect(formatCounterNumber(1234567.5, 1, ".")).toBe("1.234.567,5");
    expect(formatCounterNumber(1234, 0, " ")).toBe("1 234");
    expect(formatCounterNumber(1234, 0, "'")).toBe("1'234");
    expect(formatCounterNumber(-12.5, 1, "")).toBe("-12.5");
    expect(formatCounterNumber(-0.04, 1, "")).toBe("0.0");
  });

  it("0 to 85.6 over 30 frames with easeOut: the first frame is 0, the last 85.6, each in between right", () => {
    const c = counter({ from: 0, to: 85.6, decimals: 1, suffix: "%", ease: "easeOut" });
    expect(counterTextAt(c, undefined, 0, 30)).toBe("0.0%");
    expect(counterTextAt(c, undefined, 29, 30)).toBe("85.6%");
    // The value follows the shared easeOut curve.
    for (let f = 0; f < 30; f++) {
      const t = f / 29;
      expect(counterValueAt(c, undefined, f, 30)).toBeCloseTo(85.6 * ease("easeOut", t), 9);
    }
    let last = -1;
    for (let f = 0; f < 30; f++) {
      const v = counterValueAt(c, undefined, f, 30);
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
  });

  it("a one-frame clip shows the final value; keys of text.counter.value win", () => {
    const c = counter({ from: 0, to: 10 });
    expect(counterValueAt(c, undefined, 0, 1)).toBe(10);
    const keyed = { "text.counter.value": [{ frame: 0, value: 5, ease: "linear" as const }, { frame: 10, value: 15, ease: "linear" as const }] };
    expect(counterValueAt(c, keyed, 5, 30)).toBe(10);
  });

  it("text and glyph set", () => {
    const c = counter({ prefix: "$", suffix: " k", separator: "," });
    expect(counterText(c, 1500)).toBe("$1,500 k");
    expect(counterGlyphs(c)).toContain("$");
    expect(counterGlyphs(c)).toContain("k");
    expect(new Set([...counterGlyphs(c)]).size).toBe([...counterGlyphs(c)].length);
  });

  it("sanitizes what a file holds", () => {
    expect(sanitizeCounter(null)).toBeUndefined();
    const fixed = sanitizeCounter({ from: "x", to: 5, decimals: 99, prefix: 3, separator: "?", ease: "nope" });
    expect(fixed).toEqual({ from: 0, to: 5, decimals: 6, prefix: "", suffix: "", separator: "", ease: "easeOut" });
  });
});

describe("decode", () => {
  it("is deterministic and only uses its charset", () => {
    const seed = decodeSeed("clip-1");
    expect(decodeSeed("clip-1")).toBe(seed);
    expect(scrambleChar(seed, 3, 9)).toBe(scrambleChar(seed, 3, 9));
    for (let i = 0; i < 50; i++) expect(DECODE_CHARSET).toContain(scrambleChar(seed, i, i * 3));
  });

  it("locks left to right: none at 0, all at 1", () => {
    expect([0, 1, 2, 3].map((i) => isLocked(i, 4, 0))).toEqual([false, false, false, false]);
    expect([0, 1, 2, 3].map((i) => isLocked(i, 4, 0.5))).toEqual([true, true, false, false]);
    expect([0, 1, 2, 3].map((i) => isLocked(i, 4, 1))).toEqual([true, true, true, true]);
  });

  it("a locked character is real; others flicker every DECODE_HOLD frames", () => {
    const seed = decodeSeed("a");
    expect(decodedChar("Z", 0, 4, 1, 3, seed)).toBe("Z");
    expect(decodedChar("Z", 3, 4, 0, 0, seed)).toBe(decodedChar("Z", 3, 4, 0, DECODE_HOLD - 1, seed));
  });
});

describe("animators", () => {
  /** A line of `n` characters (one word). */
  function geometry(n: number, lines = 1): AnimatorGeometry {
    const identity = Array.from({ length: n }, (_, i) => i);
    const per = Math.ceil(n / lines);
    const line = identity.map((i) => Math.floor(i / per));
    return { count: n, line, counts: { char: n, word: 1, line: lines }, index: { char: identity, word: identity.map(() => 0), line }, align: 0 };
  }
  const states = (n: number): UnitState[] => sizedStates([], n).map((s) => Object.assign(s, newUnitState()));

  it("a rampUp reveal keyed from 0 to 1 shows the characters left to right (y +40, opacity 0)", () => {
    const animator: TextAnimator = { ...newAnimator("a1"), props: { y: 40, opacity: 0 } };
    const keys = { "animators.a1.selector.offset": [{ frame: 0, value: 1, ease: "linear" as const }, { frame: 10, value: -1, ease: "linear" as const }] };
    // Offset 1: nobody moves yet.
    let s = states(5);
    evaluateAnimators([animator], keys, 0, geometry(5), s);
    expect(s.map((u) => u.opacity)).toEqual([1, 1, 1, 1, 1]);
    expect(s.map((u) => u.y)).toEqual([0, 0, 0, 0, 0]);
    // Offset 0 (frame 5): amount grows to the right, so the last unit is fully hidden and offset by 40.
    s = states(5);
    evaluateAnimators([animator], keys, 5, geometry(5), s);
    expect(s[0]?.opacity).toBe(1);
    expect(s[4]?.opacity).toBe(0);
    expect(s[4]?.y).toBe(40);
    const opacities = s.map((u) => u.opacity);
    expect([...opacities].sort((a, b) => b - a)).toEqual(opacities);
    // Offset -1: everyone is fully animated away.
    s = states(5);
    evaluateAnimators([animator], keys, 10, geometry(5), s);
    expect(s.map((u) => u.opacity)).toEqual([0, 0, 0, 0, 0]);
  });

  it("scale and opacity move toward their value, multiplying across animators; x, y, rotation, blur add", () => {
    const a: TextAnimator = { ...newAnimator("a1"), selector: selector({ shape: "square", start: -1, end: -0.5 }), props: { x: 10, rotation: 30, blur: 4, scale: 0, opacity: 0.5 } };
    const b: TextAnimator = { ...newAnimator("a2"), selector: selector({ shape: "square", start: -1, end: -0.5 }), props: { x: 5, opacity: 0.5 } };
    const s = states(3);
    evaluateAnimators([a, b], undefined, 0, geometry(3), s);
    for (const u of s) {
      expect(u.x).toBe(15);
      expect(u.rotation).toBe(30);
      expect(u.blur).toBe(4);
      expect(u.scale).toBe(0);
      expect(u.opacity).toBeCloseTo(0.25);
    }
  });

  it("tracking spreads a line apart and a centered line stays centered", () => {
    const animator: TextAnimator = { ...newAnimator("a1"), selector: selector({ shape: "square", start: -1, end: -0.5 }), props: { tracking: 10 } };
    const left = states(4);
    evaluateAnimators([animator], undefined, 0, geometry(4), left);
    expect(left.map((u) => u.x)).toEqual([0, 10, 20, 30]);
    const centered = states(4);
    evaluateAnimators([animator], undefined, 0, { ...geometry(4), align: 0.5 }, centered);
    expect(centered.map((u) => u.x)).toEqual([-15, -5, 5, 15]);
  });

  it("fill tints the units it reaches toward its color", () => {
    const animator: TextAnimator = { ...newAnimator("a1"), props: { fill: { r: 1, g: 0, b: 0, a: 1 } } };
    const s = states(3);
    expect(evaluateAnimators([animator], undefined, 0, geometry(3), s)).toBe(true);
    expect(tintColor).toMatchObject({ r: 1, g: 0, b: 0, a: 1 });
    expect(s.map((u) => u.tint)).toEqual([0, 0.5, 1]);
    expect(evaluateAnimators([newAnimator("a1")], undefined, 0, geometry(3), states(3))).toBe(false);
  });

  it("a coarser unit gives its weight to every unit inside it", () => {
    const animator: TextAnimator = { ...newAnimator("a1"), unit: "word", props: { y: 10 } };
    const g: AnimatorGeometry = { count: 4, line: [0, 0, 0, 0], counts: { char: 4, word: 2, line: 1 }, index: { char: [0, 1, 2, 3], word: [0, 0, 1, 1], line: [0, 0, 0, 0] }, align: 0 };
    const s = states(4);
    evaluateAnimators([animator], undefined, 0, g, s);
    expect(s.map((u) => u.y)).toEqual([0, 0, 10, 10]);
  });

  it("random order is the same on every evaluation", () => {
    const animator: TextAnimator = { ...newAnimator("a1"), selector: selector({ order: "random", seed: 42 }), props: { y: 10 } };
    const a = states(8);
    const b = states(8);
    evaluateAnimators([animator], undefined, 0, geometry(8), a);
    evaluateAnimators([animator], undefined, 0, geometry(8), b);
    expect(a.map((u) => u.y)).toEqual(b.map((u) => u.y));
    expect(a.map((u) => u.y)).not.toEqual(states(8).map(() => 0));
  });

  it("ids and sanitizing", () => {
    expect(nextAnimatorId(undefined)).toBe("a1");
    expect(nextAnimatorId([newAnimator("a1"), newAnimator("a3")])).toBe("a2");
    expect(sanitizeAnimators("x")).toBeUndefined();
    const out = sanitizeAnimators([newAnimator("a1"), { id: "a1", unit: "char" }, { id: "b", unit: "bogus" }, { id: "c", unit: "word", selector: { shape: "x", ease: 5 }, props: { y: "no", x: 3 } }]);
    expect(out?.map((a) => a.id)).toEqual(["a1", "c"]);
    expect(out?.[1]?.selector).toMatchObject({ shape: "rampUp", ease: 1, order: "forward" });
    expect(out?.[1]?.props).toEqual({ x: 3 });
  });
});
