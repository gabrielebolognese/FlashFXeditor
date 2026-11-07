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
  sampleVector,
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

  it("keeps a key's bezier and spring points when only its value changes", () => {
    const bz: [number, number, number, number] = [0.68, -0.55, 0.27, 1.55];
    const list: Key[] = [{ frame: 0, value: 0, ease: "bezier", bezier: bz }, { frame: 30, value: 100, ease: "spring", spring: { damping: 0.3, frequency: 6 } }];
    expect(setKey(list, 0, 5)[0]).toEqual({ frame: 0, value: 5, ease: "bezier", bezier: bz });
    expect(setKey(list, 30, 7)[1]).toEqual({ frame: 30, value: 7, ease: "spring", spring: { damping: 0.3, frequency: 6 } });
    // A new ease drops the old parameters.
    expect(setKey(list, 0, 5, "linear")[0]).toEqual({ frame: 0, value: 5, ease: "linear" });
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
    const bad = keyframeIssues({ scale: keys([0, 1]), opacity: [{ frame: 5, value: 0, ease: "linear" }, { frame: 5, value: Number.NaN, ease: "wobble" as EaseId }], "transform.x": [{ frame: 0.5, value: 1, ease: "linear" }], "transform.y": [] });
    expect(bad.join("\n")).toMatch(/unknown property "scale"/);
    expect(bad.join("\n")).toMatch(/frame 5 must come after 5/);
    expect(bad.join("\n")).toMatch(/must be a finite number/);
    expect(bad.join("\n")).toMatch(/unknown ease "wobble"/);
    expect(bad.join("\n")).toMatch(/frame 0.5 must be an integer/);
    expect(bad.join("\n")).toMatch(/transform.y: an empty list/);
  });
});

describe("keyframeIssues for the Batch 60 properties", () => {
  const color = (frame: number, value: unknown = [1, 0, 0, 1]) => ({ frame, value: value as number[], ease: "linear" as const });
  const num = (frame: number, value = 1) => ({ frame, value, ease: "linear" as const });

  it("accepts each property on the clips it belongs to", () => {
    expect(keyframeIssues({ "transform.anchor.x": [num(0)], "crop.left": [num(0)], cornerRadius: [num(0)] }, { kind: "video" })).toEqual([]);
    expect(keyframeIssues({ cornerRadius: [num(0)], "crop.top": [num(0)] }, { kind: "image" })).toEqual([]);
    const solidKeys = { "size.w": [num(0)], "size.h": [num(0)], cornerRadius: [num(0)], fill: [color(0)], "stroke.width": [num(0)], "stroke.color": [color(0)], "stroke.dashOffset": [num(0)], "shadow.x": [num(0)], "shadow.y": [num(0)], "shadow.blur": [num(0)], "shadow.spread": [num(0)], "shadow.color": [color(0)] };
    expect(keyframeIssues(solidKeys, { kind: "solid", fill: { r: 1, g: 0, b: 0, a: 1 } })).toEqual([]);
    expect(keyframeIssues({ "style.fontSize": [num(0)], "style.letterSpacing": [num(0)], "style.fill": [color(0)], "transform.anchor.y": [num(0)] }, { kind: "text" })).toEqual([]);
  });

  it("names a property on a clip that does not have it", () => {
    expect(keyframeIssues({ "size.w": [num(0)] }, { kind: "text" }).join()).toMatch(/size.w: not a property of a text clip/);
    expect(keyframeIssues({ "crop.left": [num(0)] }, { kind: "solid" }).join()).toMatch(/crop.left: not a property of a solid clip/);
    expect(keyframeIssues({ "style.fontSize": [num(0)] }, { kind: "video" }).join()).toMatch(/style.fontSize: not a property of a video clip/);
    expect(keyframeIssues({ cornerRadius: [num(0)] }, { kind: "text" }).join()).toMatch(/cornerRadius/);
  });

  it("wants a color on a vector property and a number on the others", () => {
    expect(keyframeIssues({ fill: [color(0, 5)] }, { kind: "solid", fill: { r: 1, g: 0, b: 0, a: 1 } }).join()).toMatch(/must be a color/);
    expect(keyframeIssues({ fill: [color(0, [1, 0, 0])] }, { kind: "solid", fill: { r: 1, g: 0, b: 0, a: 1 } }).join()).toMatch(/must be a color/);
    expect(keyframeIssues({ "style.fill": [color(0, [1, 0, Number.NaN, 1])] }, { kind: "text" }).join()).toMatch(/must be a color/);
    expect(keyframeIssues({ "size.w": [color(0)] }, { kind: "solid" }).join()).toMatch(/must be a finite number/);
  });

  it("refuses a fill key on a gradient fill", () => {
    const gradient = { from: { r: 0, g: 0, b: 0, a: 1 }, to: { r: 1, g: 1, b: 1, a: 1 } };
    expect(keyframeIssues({ fill: [color(0)] }, { kind: "solid", fill: gradient }).join()).toMatch(/not a plain color/);
  });

  it("checks bezier points and spring parameters", () => {
    const withEase = (extra: object) => ({ opacity: [{ frame: 0, value: 1, ease: "linear" as const, ...extra }] });
    expect(keyframeIssues(withEase({ ease: "bezier", bezier: [0.68, -0.55, 0.27, 1.55] }))).toEqual([]);
    expect(keyframeIssues(withEase({ ease: "bezier" }))).toEqual([]);
    expect(keyframeIssues(withEase({ ease: "bezier", bezier: [1.5, 0, 0.5, 1] })).join()).toMatch(/bezier/);
    expect(keyframeIssues(withEase({ ease: "bezier", bezier: [0, 0, 1] })).join()).toMatch(/bezier/);
    expect(keyframeIssues(withEase({ ease: "spring", spring: { damping: 0.5, frequency: 3 } }))).toEqual([]);
    expect(keyframeIssues(withEase({ ease: "spring", spring: { damping: -1, frequency: 3 } })).join()).toMatch(/spring/);
    expect(keyframeIssues(withEase({ ease: "spring", spring: { damping: 1, frequency: 0 } })).join()).toMatch(/spring/);
  });
});

describe("random keys of the new properties (property test)", () => {
  // A small deterministic generator: every key list built from it validates, samples to finite values
  // inside the range its keys span (plus the overshoot of back, elastic, bezier and spring) and never throws.
  const seed = (n: number) => () => ((n = (n * 1664525 + 1013904223) >>> 0) / 2 ** 32);

  it("stays valid and finite for 400 random lists of every ease", () => {
    const random = seed(60);
    const eases = EASE_IDS;
    for (let run = 0; run < 400; run++) {
      const count = 1 + Math.floor(random() * 5);
      let frame = Math.floor(random() * 10) - 5;
      const vector = random() < 0.4;
      const keys = Array.from({ length: count }, () => {
        frame += 1 + Math.floor(random() * 20);
        const ease = eases[Math.floor(random() * eases.length)] as EaseId;
        const value = vector ? [random(), random(), random(), random()] : random() * 200 - 100;
        return {
          frame,
          value,
          ease,
          ...(ease === "bezier" && { bezier: [random(), random() * 3 - 1, random(), random() * 3 - 1] as [number, number, number, number] }),
          ...(ease === "spring" && { spring: { damping: random() * 2, frequency: 0.5 + random() * 8 } }),
        };
      });
      expect(keyframeIssues({ [vector ? "fill" : "size.w"]: keys }, { kind: "solid", fill: { r: 0, g: 0, b: 0, a: 1 } })).toEqual([]);
      for (let at = (keys[0]?.frame ?? 0) - 3; at <= frame + 3; at += 1.5) {
        const sampled = vector ? sampleVector(keys, at, []) : [sampleKeys(keys, at)];
        for (const channel of sampled) expect(Number.isFinite(channel)).toBe(true);
      }
      const last = keys[keys.length - 1] as (typeof keys)[number];
      const end = vector ? sampleVector(keys, frame + 100, []) : [sampleKeys(keys, frame + 100)];
      expect(end).toEqual(Array.isArray(last.value) ? last.value : [last.value]);
    }
  });

  it("every key lands exactly on its value", () => {
    const random = seed(61);
    for (let run = 0; run < 200; run++) {
      const keys = [0, 10, 25].map((frame) => ({ frame, value: random() * 50, ease: EASE_IDS[Math.floor(random() * EASE_IDS.length)] as EaseId }));
      for (const key of keys) expect(sampleKeys(keys, key.frame)).toBe(key.value);
    }
  });
});
