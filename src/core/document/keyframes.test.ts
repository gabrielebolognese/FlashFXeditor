import { describe, expect, it } from "vitest";
import {
  animatedOpacity,
  animatedTransform,
  clipAt,
  clipRel,
  ease,
  gainDbAt,
  keyframeIssues,
  maxKeyedScale,
  moveSectionKeys,
  removeSectionKeys,
  retimeKeyframes,
  sampleKeys,
  sectionEaseAt,
  sectionFrames,
  setKey,
  setSectionEase,
  sliceKeyframes,
  writeKeys,
  type Key,
} from "./keyframes.js";
import { EASE_IDS, type EaseId, type Keyframes, type Transform } from "./types.js";

const T: Transform = { x: 0, y: 0, scale: 1, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false };
const keys = (...list: [number, number, EaseId?][]): Key[] => list.map(([frame, value, curve]) => ({ frame, value, ease: curve ?? "linear" }));

describe("ease", () => {
  it("runs every curve from 0 to 1, clamped outside", () => {
    for (const id of EASE_IDS) {
      expect(ease(id, 0)).toBe(0);
      expect(ease(id, 1)).toBe(1);
      expect(ease(id, -2)).toBe(0);
      expect(ease(id, 3)).toBe(1);
    }
  });

  it("gives each curve its shape", () => {
    expect(ease("linear", 0.3)).toBeCloseTo(0.3);
    expect(ease("easeIn", 0.5)).toBeCloseTo(0.125);
    expect(ease("easeOut", 0.5)).toBeCloseTo(0.875);
    expect(ease("easeInOut", 0.25)).toBeCloseTo(0.0625);
    expect(ease("hold", 0.99)).toBe(0);
    // CSS `ease` at the half: about 0.80.
    expect(ease("smooth", 0.5)).toBeCloseTo(0.8024, 3);
    expect(ease("snap", 0.25)).toBeGreaterThan(0.6);
    // The overshoot passes 1 before settling.
    expect(Math.max(...[0.5, 0.6, 0.7, 0.8].map((t) => ease("overshoot", t)))).toBeGreaterThan(1.05);
  });
});

describe("sampling", () => {
  const list = keys([10, 0], [20, 100, "hold"], [30, 50]);

  it("holds the first value before the first key and the last after the last", () => {
    expect(sampleKeys(list, -5)).toBe(0);
    expect(sampleKeys(list, 10)).toBe(0);
    expect(sampleKeys(list, 40)).toBe(50);
  });

  it("interpolates with the left key's ease; hold jumps at the next key", () => {
    expect(sampleKeys(list, 15)).toBeCloseTo(50);
    expect(sampleKeys(list, 15.5)).toBeCloseTo(55);
    expect(sampleKeys(list, 20)).toBe(100);
    expect(sampleKeys(list, 29)).toBe(100);
    expect(sampleKeys(list, 30)).toBe(50);
  });

  it("evaluates the transform, the opacity and the gain, base values where unkeyed", () => {
    const keyframes: Keyframes = { "transform.x": keys([0, 0], [30, 300]), "transform.scale": keys([0, 1], [30, 2]), opacity: keys([0, 1], [10, 0]), "volume.gainDb": keys([0, -6]) };
    const clip = { transform: { ...T, y: 40, rotation: 5 }, keyframes, opacity: 1, volume: { gainDb: 0 }, start: 100, duration: 60 };
    const t = animatedTransform(clip, 15);
    expect(t).toMatchObject({ x: 150, y: 40, scale: 1.5, rotation: 5 });
    expect(t.scaleY).toBeUndefined();
    expect(animatedOpacity(clip, 5)).toBeCloseTo(0.5);
    expect(gainDbAt(clip, 50)).toBe(-6);
    // The same object when the Transform section has no keys.
    const plain = { transform: T, keyframes: { opacity: keys([0, 1]) } };
    expect(animatedTransform(plain, 3)).toBe(T);
    // Allocation-free with `out`.
    const out = { ...T };
    expect(animatedTransform(clip, 30, out)).toBe(out);
    expect(out.x).toBe(300);
  });

  it("shows a clip at a timeline frame, edits outside it written at its nearest frame", () => {
    const clip = { transform: T, opacity: 1, keyframes: { opacity: keys([0, 0], [10, 1]) }, start: 100, duration: 20 };
    expect(clipRel(clip, 90)).toBe(0);
    expect(clipRel(clip, 105)).toBe(5);
    expect(clipRel(clip, 500)).toBe(19);
    expect(clipAt(clip, 105).opacity).toBeCloseTo(0.5);
    expect(clipAt({ ...clip, keyframes: undefined }, 105)).toEqual({ ...clip, keyframes: undefined });
  });

  it("finds the largest keyed scale", () => {
    expect(maxKeyedScale(undefined, { ...T, scale: 0.5, scaleY: -2 })).toBe(2);
    expect(maxKeyedScale({ "transform.scale": keys([0, 1], [6, 3]) }, T)).toBe(3);
  });
});

describe("key list edits", () => {
  it("sets keys: an existing one keeps its ease, a new one takes its segment's", () => {
    const list = keys([0, 0, "easeOut"], [20, 10]);
    expect(setKey(list, 20, 5)).toEqual(keys([0, 0, "easeOut"], [20, 5]));
    expect(setKey(list, 10, 3)).toEqual(keys([0, 0, "easeOut"], [10, 3, "easeOut"], [20, 10]));
    expect(setKey(list, 30, 3)).toEqual(keys([0, 0, "easeOut"], [20, 10], [30, 3]));
    expect(setKey(list, -5, 3)[0]).toEqual({ frame: -5, value: 3, ease: "linear" });
  });

  it("writes, moves, eases and removes a section's keys together", () => {
    let k = writeKeys(undefined, 0, { "transform.x": 0, "transform.y": 0, "transform.scale": 1, "transform.scaleY": 1, "transform.rotation": 0 });
    k = writeKeys(k, 30, { "transform.x": 100, "transform.y": 0, "transform.scale": 1, "transform.scaleY": 1, "transform.rotation": 0 });
    expect(sectionFrames(k, "transform")).toEqual([0, 30]);
    expect(sectionFrames(k, "opacity")).toEqual([]);
    k = moveSectionKeys(k, "transform", new Set([30]), 10);
    expect(sectionFrames(k, "transform")).toEqual([0, 40]);
    expect(k?.["transform.x"]?.[1]).toEqual({ frame: 40, value: 100, ease: "linear" });
    // A moved key landing on one that stays replaces it.
    k = moveSectionKeys(k, "transform", new Set([40]), -40);
    expect(k?.["transform.x"]).toEqual(keys([0, 100]));
    k = writeKeys(k, 20, { "transform.x": 5 });
    k = setSectionEase(k, "transform", new Set([0]), "hold");
    expect(sectionEaseAt(k, "transform", 0)).toBe("hold");
    expect(sectionEaseAt(k, "transform", 7)).toBeNull();
    k = removeSectionKeys(k, "transform", new Set([0]));
    expect(k).toEqual({ "transform.x": keys([20, 5]) });
    expect(removeSectionKeys(k, "transform", null)).toBeUndefined();
  });

  it("only counts keys inside the clip when given its duration", () => {
    expect(sectionFrames({ opacity: keys([-5, 0], [3, 1], [12, 0]) }, "opacity", 10)).toEqual([3]);
  });
});

describe("sliceKeyframes", () => {
  /** Every frame of each piece samples as the whole clip did. */
  function expectExact(keyframes: Keyframes, cut: number, duration: number): { left: Keyframes | undefined; right: Keyframes | undefined } {
    const left = sliceKeyframes(keyframes, 0, cut, false, true);
    const right = sliceKeyframes(keyframes, cut, duration, true, false);
    for (const [prop, list] of Object.entries(keyframes)) {
      for (let f = 0; f < duration; f++) {
        const piece = f < cut ? left : right;
        const rel = f < cut ? f : f - cut;
        const own = piece?.[prop];
        expect(own, `${prop} has keys in the piece of frame ${f}`).toBeDefined();
        expect(sampleKeys(own as Key[], rel)).toBeCloseTo(sampleKeys(list, f), 9);
      }
    }
    return { left, right };
  }

  it("adds an edge key inside linear and hold segments", () => {
    const { left, right } = expectExact({ opacity: keys([0, 0], [20, 1], [80, 0.5]), "transform.x": keys([0, 0, "hold"], [80, 10]) }, 50, 100);
    expect(left?.opacity?.map((key) => key.frame)).toEqual([0, 20, 49]);
    expect(right?.opacity?.map((key) => key.frame)).toEqual([0, 30]);
    expect(right?.opacity?.[0]?.value).toBeCloseTo(0.75);
    expect(right?.["transform.x"]).toEqual(keys([0, 0, "hold"], [30, 10]));
  });

  it("keeps the key beyond the edge inside an eased segment", () => {
    const { left, right } = expectExact({ "transform.scale": keys([0, 1, "easeOut"], [60, 2]) }, 25, 60);
    expect(left?.["transform.scale"]?.map((key) => key.frame)).toEqual([0, 60]);
    expect(right?.["transform.scale"]?.map((key) => key.frame)).toEqual([-25, 35]);
  });

  it("keeps a constant value past the last key and before the first", () => {
    const { right } = expectExact({ opacity: keys([0, 0], [10, 0.4]) }, 30, 60);
    expect(right?.opacity).toEqual([{ frame: 0, value: 0.4, ease: "linear" }]);
    const { left } = expectExact({ opacity: keys([40, 0.2], [50, 1]) }, 20, 60);
    expect(left?.opacity).toEqual([{ frame: 19, value: 0.2, ease: "linear" }]);
    // Every eased and cuttable curve, cut anywhere.
    for (const curve of EASE_IDS) for (const cut of [1, 7, 33, 59]) expectExact({ opacity: keys([0, 0.1, curve], [40, 0.9, curve], [55, 0.3]) }, cut, 60);
  });

  it("cuts a middle part on both new edges and keeps the keys past an edge that did not move", () => {
    const keyframes: Keyframes = { opacity: keys([0, 0], [100, 1]) };
    const middle = sliceKeyframes(keyframes, 20, 40, true, true);
    expect(middle?.opacity?.map((key) => [key.frame, key.value])).toEqual([
      [0, 0.2],
      [19, 0.39],
    ]);
    expect(sliceKeyframes({ opacity: keys([-10, 0], [5, 1]) }, 0, 3, false, true)?.opacity?.[0]?.frame).toBe(-10);
  });
});

describe("retimeKeyframes", () => {
  it("scales frames, merging keys that land on one frame (the later one wins), eases kept", () => {
    const retimed = retimeKeyframes({ opacity: keys([0, 0, "hold"], [10, 1], [11, 0.5, "easeIn"], [40, 0]) }, 0.1);
    expect(retimed.opacity).toEqual(keys([0, 0, "hold"], [1, 0.5, "easeIn"], [4, 0]));
    expect(retimeKeyframes({ opacity: keys([0, 0], [10, 1]) }, 2).opacity?.map((key) => key.frame)).toEqual([0, 20]);
  });

  it("never makes a -0 frame of a key before the clip's start (Batch 47 fuzz: JSON writes it as 0)", () => {
    const frame = retimeKeyframes({ opacity: keys([-1, 0], [10, 1]) }, 0.25).opacity?.[0]?.frame;
    expect(Object.is(frame, 0)).toBe(true);
  });
});

describe("keyframeIssues", () => {
  it("accepts sorted keys of known properties and eases, and names what is wrong", () => {
    expect(keyframeIssues({ opacity: keys([0, 1], [5, 0, "hold"]) })).toEqual([]);
    const bad = keyframeIssues({ scale: keys([0, 1]), opacity: [{ frame: 5, value: 0, ease: "linear" }, { frame: 5, value: Number.NaN, ease: "bounce" as EaseId }], "transform.x": [{ frame: 0.5, value: 1, ease: "linear" }], "transform.y": [] });
    expect(bad.join("\n")).toMatch(/unknown property "scale"/);
    expect(bad.join("\n")).toMatch(/frame 5 must come after 5/);
    expect(bad.join("\n")).toMatch(/must be finite/);
    expect(bad.join("\n")).toMatch(/unknown ease "bounce"/);
    expect(bad.join("\n")).toMatch(/frame 0.5 must be an integer/);
    expect(bad.join("\n")).toMatch(/transform.y: an empty list/);
  });
});
