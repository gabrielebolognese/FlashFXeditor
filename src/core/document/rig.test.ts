import { describe, expect, it } from "vitest";
import { animatedTransform } from "./keyframes.js";
import { makeProject, makeShapeClip, makeTrack, withClips } from "./fixtures.js";
import { autoSpatialTangents, positionOnSegment, segmentArcLength } from "./positionPath.js";
import { affineOf, ancestorsOf, composeAffine, descendantsOf, invertAffine, RigResolver, worldToLocal } from "./rig.js";
import type { Clip, KeyData, NullClip, Project, ShapeClip, Transform } from "./types.js";
import { validateProject } from "./validate.js";

const T = (patch: Partial<Transform> = {}): Transform => ({ x: 0, y: 0, scale: 1, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false, ...patch });
const shape = (id: string, patch: Partial<ShapeClip> = {}): ShapeClip => makeShapeClip({ id, trackId: "v1", start: 0, duration: 100, ...patch });
const nullClip = (id: string, patch: Partial<NullClip> = {}): NullClip => ({ id, trackId: "v2", kind: "null", name: id, start: 0, duration: 100, enabled: true, size: { w: 100, h: 100 }, transform: T(), ...patch });

function rig(clips: Clip[]): Project {
  const p = makeProject();
  p.tracks = [makeTrack("v1"), makeTrack("v2")];
  return withClips(p, clips);
}

const world = (project: Project, id: string, frame: number): Transform => {
  const resolver = new RigResolver();
  resolver.begin(project, frame, null);
  const clip = project.clips[id] as Clip & { transform: Transform };
  return resolver.resolve(clip, animatedTransform(clip, frame - clip.start, T()), {} as Transform);
};

describe("motion path evaluation", () => {
  const p0: [number, number] = [0, 0];
  const p3: [number, number] = [300, 0];

  it("a straight segment is the line; tangents bend it and the speed stays constant", () => {
    expect(positionOnSegment(p0, p3, undefined, undefined, 0.5)).toEqual([150, 0]);
    const out: [number, number] = [0, 200];
    const into: [number, number] = [0, 200];
    const total = segmentArcLength(p0, p3, out, into);
    expect(total).toBeGreaterThan(300);
    let previous = positionOnSegment(p0, p3, out, into, 0);
    const steps: number[] = [];
    for (let i = 1; i <= 50; i++) {
      const point = positionOnSegment(p0, p3, out, into, i / 50);
      steps.push(Math.hypot(point[0] - previous[0], point[1] - previous[1]));
      previous = point;
    }
    const mean = steps.reduce((a, b) => a + b, 0) / steps.length;
    for (const step of steps) expect(Math.abs(step - mean) / mean).toBeLessThan(0.03);
  });

  it("auto tangents are smooth through a middle point and zero at the ends", () => {
    const t = autoSpatialTangents([0, 0], [100, 100], [200, 0]);
    expect(t.out[1]).toBeCloseTo(0);
    expect(t.out[0]).toBeGreaterThan(0);
    expect(t.in[0]).toBeCloseTo(-t.out[0]);
    expect(Math.abs(autoSpatialTangents(null, [0, 0], [10, 0]).in[0])).toBe(0);
  });

  it("a clip on a path with linear eases follows the drawn curve at constant speed", () => {
    const keys: KeyData[] = [
      { frame: 0, value: [0, 0], ease: "linear", spatialOut: [0, 200] },
      { frame: 100, value: [300, 0], ease: "linear", spatialIn: [0, 200] },
    ];
    const clip = shape("s", { keyframes: { "transform.position": keys } });
    const at = (frame: number) => animatedTransform(clip, frame, T());
    expect(at(0)).toMatchObject({ x: 0, y: 0 });
    expect(at(100)).toMatchObject({ x: 300, y: 0 });
    // The curve leaves the straight line (y is not 0 in the middle) ...
    expect(Math.abs(at(50).y)).toBeGreaterThan(50);
    // ... and equal frame steps are equal distances along it.
    let previous = at(0);
    const steps: number[] = [];
    for (let f = 5; f <= 100; f += 5) {
      const now = { ...at(f) };
      steps.push(Math.hypot(now.x - previous.x, now.y - previous.y));
      previous = now;
    }
    const mean = steps.reduce((a, b) => a + b, 0) / steps.length;
    for (const step of steps) expect(Math.abs(step - mean) / mean).toBeLessThan(0.05);
  });

  it("auto-orient turns the clip along the tangent, added to its rotation", () => {
    const keys: KeyData[] = [
      { frame: 0, value: [0, 0], ease: "linear" },
      { frame: 100, value: [0, 100], ease: "linear" },
    ];
    const clip = shape("s", { keyframes: { "transform.position": keys }, autoOrient: true, transform: T({ rotation: 10 }) });
    // Straight down is 90 degrees clockwise from +x.
    expect(animatedTransform(clip, 50, T()).rotation).toBeCloseTo(100);
    expect(animatedTransform({ ...clip, autoOrient: false }, 50, T()).rotation).toBe(10);
    // After the last key it keeps the last heading.
    expect(animatedTransform(clip, 120, T()).rotation).toBeCloseTo(100);
  });

  it("position keys win over x and y keys", () => {
    const clip = shape("s", { keyframes: { "transform.position": [{ frame: 0, value: [5, 6], ease: "linear" }], "transform.x": [{ frame: 0, value: 99, ease: "linear" }] } });
    expect(animatedTransform(clip, 0, T())).toMatchObject({ x: 5, y: 6 });
  });
});

describe("parenting", () => {
  const card = shape("card", { transform: T({ x: 100, y: 0 }), keyframes: { "transform.rotation": [{ frame: 0, value: 0, ease: "linear" }, { frame: 99, value: 90, ease: "linear" }] } });
  const text = shape("text", { parentId: "card", transform: T({ x: 50, y: 0, rotation: 5 }) });

  it("a child follows its rotating parent around the parent's position", () => {
    const p = rig([card, text]);
    const start = world(p, "text", 0);
    expect(start.x).toBeCloseTo(150);
    expect(start.y).toBeCloseTo(0);
    expect(start.rotation).toBeCloseTo(5);
    const end = world(p, "text", 99);
    // Rotated a quarter turn clockwise: the offset (50, 0) points down.
    expect(end.x).toBeCloseTo(100);
    expect(end.y).toBeCloseTo(50);
    expect(end.rotation).toBeCloseTo(95);
    expect(end.scale).toBeCloseTo(1);
  });

  it("a scaled parent scales the child's offset and size", () => {
    const p = rig([shape("a", { transform: T({ x: 10, y: 10, scale: 2 }) }), shape("b", { parentId: "a", transform: T({ x: 30, y: 0 }) })]);
    const b = world(p, "b", 0);
    expect(b.x).toBeCloseTo(70);
    expect(b.y).toBeCloseTo(10);
    expect(b.scale).toBeCloseTo(2);
  });

  it("a parent is read at the frame clamped into its own range", () => {
    const early = nullClip("n", { start: 10, duration: 10, transform: T(), keyframes: { "transform.x": [{ frame: 0, value: 0, ease: "linear" }, { frame: 9, value: 90, ease: "linear" }] } });
    const p = rig([early, shape("c", { parentId: "n", start: 0, duration: 100 })]);
    expect(world(p, "c", 0).x).toBeCloseTo(0);
    expect(world(p, "c", 50).x).toBeCloseTo(90);
  });

  it("a null with five children turns them around the null's position", () => {
    const children = [0, 1, 2, 3, 4].map((i) => shape(`c${i}`, { parentId: "n", transform: T({ x: 100 + i * 10, y: 0 }) }));
    const n = nullClip("n", { transform: T({ x: 20, y: 30, rotation: 180 }) });
    const p = rig([n, ...children]);
    for (let i = 0; i < 5; i++) {
      const w = world(p, `c${i}`, 0);
      expect(w.x).toBeCloseTo(20 - (100 + i * 10));
      expect(w.y).toBeCloseTo(30);
      expect(w.rotation).toBeCloseTo(180);
    }
    expect(descendantsOf(p, "n").sort()).toEqual(["c0", "c1", "c2", "c3", "c4"]);
  });

  it("worldToLocal inverts the resolution", () => {
    const p = rig([card, text]);
    const frame = 37;
    const w = world(p, "text", frame);
    const local = worldToLocal(p, "text", w, frame);
    const original = animatedTransform(p.clips.text as ShapeClip, frame, T());
    expect(local.x).toBeCloseTo(original.x);
    expect(local.y).toBeCloseTo(original.y);
    expect(local.rotation).toBeCloseTo(original.rotation);
    expect(local.scale).toBeCloseTo(original.scale);
  });

  it("affine helpers compose and invert", () => {
    const a = affineOf(T({ x: 10, y: 20, rotation: 30, scale: 2 }));
    const back = composeAffine(invertAffine(a)!, a);
    expect(back.a).toBeCloseTo(1);
    expect(back.d).toBeCloseTo(1);
    expect(back.b).toBeCloseTo(0);
    expect(back.tx).toBeCloseTo(0);
    expect(invertAffine(affineOf(T({ scale: 0 })))).toBeNull();
  });

  it("a cycle or a missing parent does not loop or throw", () => {
    const p = rig([shape("a", { parentId: "b" }), shape("b", { parentId: "a" }), shape("c", { parentId: "gone" })]);
    expect(ancestorsOf(p, p.clips.a as Clip).length).toBeLessThan(5);
    expect(() => world(p, "a", 0)).not.toThrow();
    expect(world(p, "c", 0).x).toBeCloseTo(0);
  });
});

describe("validation of parents and nulls", () => {
  it("accepts a null with children", () => {
    expect(validateProject(rig([nullClip("n"), shape("c", { parentId: "n" })]))).toEqual([]);
  });

  it("refuses a cycle and a self parent; ignores a missing parent", () => {
    const issues = validateProject(rig([shape("a", { parentId: "b" }), shape("b", { parentId: "a" }), shape("c", { parentId: "c" }), shape("d", { parentId: "zz" })]));
    expect(issues.some((i) => i.includes("loops back"))).toBe(true);
    expect(issues.some((i) => i.includes("own parent"))).toBe(true);
    expect(issues.some((i) => i.includes("zz"))).toBe(false);
  });

  it("refuses a parent in another sequence and a null without a size", () => {
    const p = rig([shape("a"), nullClip("n", { size: { w: 0, h: 10 } })]);
    p.sequences.s = { id: "s", name: "S", size: { w: 100, h: 100 }, duration: 100, background: null, tracks: [makeTrack("iv")] };
    const inner = shape("i", { trackId: "iv", parentId: "a" });
    p.clips.i = inner;
    (p.sequences.s as { tracks: { clipIds: string[] }[] }).tracks[0]!.clipIds.push("i");
    const issues = validateProject(p);
    expect(issues.some((i) => i.includes("another sequence"))).toBe(true);
    expect(issues.some((i) => i.includes("null size"))).toBe(true);
  });

  it("validates position keys: points of two numbers and tangent pairs", () => {
    const bad = shape("s", { keyframes: { "transform.position": [{ frame: 0, value: 5, ease: "linear" }, { frame: 1, value: [1, 2], ease: "linear", spatialOut: [1] as unknown as [number, number] }] } });
    const issues = validateProject(rig([bad]));
    expect(issues.some((i) => i.includes("must be a point"))).toBe(true);
    expect(issues.some((i) => i.includes("tangents"))).toBe(true);
  });
});

describe("cost of the rig (P1: 100 parented animated layers)", () => {
  it("resolves 100 keyed children of keyed nulls well inside a 60 fps frame", () => {
    const nulls = [0, 1, 2, 3, 4].map((i) => nullClip(`n${i}`, { keyframes: { "transform.rotation": [{ frame: 0, value: 0, ease: "linear" }, { frame: 99, value: 360, ease: "linear" }] } }));
    const kids = Array.from({ length: 100 }, (_, i) =>
      shape(`k${i}`, { parentId: `n${i % 5}`, transform: T({ x: i }), keyframes: { "transform.x": [{ frame: 0, value: 0, ease: "linear" }, { frame: 99, value: 100, ease: "linear" }] } }),
    );
    const p = rig([...nulls, ...kids]);
    const resolver = new RigResolver();
    const out = {} as Transform;
    const scratch = T();
    const run = (frames: number) => {
      for (let f = 0; f < frames; f++) {
        resolver.begin(p, f % 100, null);
        for (const kid of kids) resolver.resolve(kid, animatedTransform(kid, f % 100, scratch), out);
      }
    };
    run(200);
    const start = performance.now();
    run(2000);
    const perFrame = (performance.now() - start) / 2000;
    console.log(`rig: 100 parented keyed layers resolve in ${perFrame.toFixed(4)} ms per frame`);
    expect(perFrame).toBeLessThan(2);
  });
});
