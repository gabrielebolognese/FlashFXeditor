import { describe, expect, it } from "vitest";
import { animatedTransform } from "../../core/document/keyframes.js";
import { makeProject, makeShapeClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import { RigResolver } from "../../core/document/rig.js";
import type { Clip, KeyData, NullClip, Project, ShapeClip, Transform } from "../../core/document/types.js";
import { validateProject } from "../../core/document/validate.js";
import type { Command } from "../../core/commands/command.js";
import { addNull, convertFromMotionPath, convertToMotionPath, parentCandidates, parentProblem, setAutoOrient, setParent, setPathKeys, smoothMotionPath } from "./rig.js";

const T = (patch: Partial<Transform> = {}): Transform => ({ x: 0, y: 0, scale: 1, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false, ...patch });
const key = (frame: number, value: number | number[], extra: Partial<KeyData> = {}): KeyData => ({ frame, value, ease: "linear", ...extra });
const shape = (id: string, trackId: string, patch: Partial<ShapeClip> = {}): ShapeClip => makeShapeClip({ id, trackId, start: 0, duration: 100, ...patch });
const nul = (id: string, trackId: string, patch: Partial<NullClip> = {}): NullClip => ({ id, trackId, kind: "null", name: id, start: 0, duration: 100, enabled: true, size: { w: 100, h: 100 }, transform: T(), ...patch });

function rig(clips: Clip[]): Project {
  const p = makeProject();
  p.tracks = [makeTrack("v1"), makeTrack("v2"), makeTrack("v3")];
  return withClips(p, clips);
}

const run = (p: Project, command: Command | null, playhead = 0): Project => {
  if (!command) return p;
  const next = structuredClone(p);
  command.run(next as never, { playhead } as never);
  expect(validateProject(next)).toEqual([]);
  return next;
};

const world = (project: Project, id: string, frame: number): Transform => {
  const resolver = new RigResolver();
  resolver.begin(project, frame, null);
  const clip = project.clips[id] as Clip & { transform: Transform };
  return { ...resolver.resolve(clip, animatedTransform(clip, Math.min(Math.max(frame - clip.start, 0), clip.duration - 1), T()), {} as Transform) };
};

describe("set and clear a parent", () => {
  const card = () => shape("card", "v1", { transform: T({ x: 100, y: 20, rotation: 30, scale: 1.5 }), keyframes: { "transform.rotation": [key(0, 30), key(60, 120)] } });

  it("keeps the child's world placement at the playhead, then again when cleared", () => {
    let p = rig([card(), shape("text", "v2", { transform: T({ x: -40, y: 70, rotation: 15, scale: 0.8 }) })]);
    const before = world(p, "text", 25);
    p = run(p, setParent(p, ["text"], "card", 25), 25);
    expect(p.clips.text?.parentId).toBe("card");
    const after = world(p, "text", 25);
    for (const k of ["x", "y", "rotation", "scale"] as const) expect(after[k]).toBeCloseTo(before[k], 6);
    // Now it follows: later the card has turned, so the text has moved.
    expect(world(p, "text", 60).x).not.toBeCloseTo(before.x, 1);
    // Clearing at the playhead leaves it where it was there.
    const there = world(p, "text", 40);
    p = run(p, setParent(p, ["text"], null, 40), 40);
    expect(p.clips.text?.parentId).toBeUndefined();
    const cleared = world(p, "text", 40);
    for (const k of ["x", "y", "rotation", "scale"] as const) expect(cleared[k]).toBeCloseTo(there[k], 6);
  });

  it("keeps a keyed child exact at each of its keys", () => {
    const child = shape("kid", "v2", { transform: T(), keyframes: { "transform.x": [key(0, 0), key(50, 200)], "transform.y": [key(0, 0), key(50, 80)] } });
    let p = rig([card(), child]);
    const worlds = [0, 50].map((f) => world(p, "kid", f));
    p = run(p, setParent(p, ["kid"], "card", 0));
    [0, 50].forEach((f, i) => {
      const w = world(p, "kid", f);
      expect(w.x).toBeCloseTo((worlds[i] as Transform).x, 5);
      expect(w.y).toBeCloseTo((worlds[i] as Transform).y, 5);
    });
  });

  it("refuses cycles, itself, other kinds and nothing-changes", () => {
    const p = rig([shape("a", "v1"), shape("b", "v2", { parentId: "a" }), nul("n", "v3")]);
    expect(parentProblem(p, "a", "b")).toMatch(/loop/);
    expect(parentProblem(p, "a", "a")).toMatch(/own parent/);
    expect(parentProblem(p, "b", "n")).toBeNull();
    expect(setParent(p, ["a"], "b", 0)).toBeNull();
    expect(setParent(p, ["b"], "a", 0)).toBeNull();
    expect(setParent(p, ["a"], null, 0)).toBeNull();
    expect(parentCandidates(p, "a").map((c) => c.id)).toEqual(["n"]);
  });

  it("moves a null's children around its position without touching them", () => {
    const kids = [0, 1, 2, 3, 4].map((i) => shape(`k${i}`, "v1", { transform: T({ x: 100 + i * 10 }) }));
    // One clip per track slot in time: five children one after the other on one track, the null on its own.
    const p = rig([nul("n", "v3", { transform: T({ x: 50, y: 50 }) }), ...kids.map((k, i) => ({ ...k, trackId: "v1", start: i * 100, duration: 100, parentId: "n" }) as Clip)]);
    const turned = structuredClone(p);
    (turned.clips.n as NullClip).transform.rotation = 90;
    for (let i = 0; i < 5; i++) {
      const w = world(turned, `k${i}`, i * 100);
      expect(w.x).toBeCloseTo(50);
      expect(w.y).toBeCloseTo(50 + 100 + i * 10);
    }
  });
});

describe("motion paths", () => {
  const keyed = () => shape("s", "v1", { transform: T({ x: 5, y: 6 }), keyframes: { "transform.x": [key(0, 0), key(40, 100, { ease: "easeInOut" })], "transform.y": [key(0, 0), key(40, -50)] } });

  it("converts x and y keys to a path and back, keeping the places at the keys", () => {
    let p = rig([keyed()]);
    p = run(p, convertToMotionPath(p, ["s"], 0));
    const path = (p.clips.s as ShapeClip).keyframes;
    expect(path?.["transform.x"]).toBeUndefined();
    expect(path?.["transform.position"]).toEqual([
      { frame: 0, value: [0, 0], ease: "linear" },
      { frame: 40, value: [100, -50], ease: "easeInOut" },
    ].map((k, i) => (i === 0 ? { ...k, ease: "linear" } : k)));
    expect(animatedTransform(p.clips.s as ShapeClip, 40, T())).toMatchObject({ x: 100, y: -50 });
    p = run(p, convertFromMotionPath(p, ["s"]));
    expect((p.clips.s as ShapeClip).keyframes?.["transform.x"]?.map((k) => k.value)).toEqual([0, 100]);
    expect((p.clips.s as ShapeClip).keyframes?.["transform.y"]?.map((k) => k.value)).toEqual([0, -50]);
    expect((p.clips.s as ShapeClip).keyframes?.["transform.position"]).toBeUndefined();
  });

  it("a clip with no keys gets one path key at the playhead", () => {
    let p = rig([shape("s", "v1", { transform: T({ x: 9, y: 8 }) })]);
    p = run(p, convertToMotionPath(p, ["s"], 30));
    expect((p.clips.s as ShapeClip).keyframes?.["transform.position"]).toEqual([{ frame: 30, value: [9, 8], ease: "linear" }]);
    expect(convertToMotionPath(p, ["s"], 30)).toBeNull();
  });

  it("smooths the path, edits keys and tangents, and toggles auto-orient", () => {
    let p = rig([shape("s", "v1", { keyframes: { "transform.position": [key(0, [0, 0]), key(30, [100, 100]), key(60, [200, 0])] } })]);
    p = run(p, smoothMotionPath(p, ["s"]));
    const keys = (p.clips.s as ShapeClip).keyframes?.["transform.position"] as KeyData[];
    expect(keys[0]?.spatialIn).toBeUndefined();
    expect(keys[1]?.spatialOut?.[0]).toBeGreaterThan(0);
    expect(keys[2]?.spatialOut).toBeUndefined();
    p = run(p, setPathKeys(p, "s", new Map([[30, { value: [120, 90], spatialOut: [10, 0], spatialIn: null }]]), "Edit path"));
    const edited = (p.clips.s as ShapeClip).keyframes?.["transform.position"]?.[1] as KeyData;
    expect(edited.value).toEqual([120, 90]);
    expect(edited.spatialOut).toEqual([10, 0]);
    expect(edited.spatialIn).toBeUndefined();
    expect(setPathKeys(p, "s", new Map([[30, { value: [120, 90] }]]), "x")).toBeNull();
    p = run(p, setAutoOrient(p, ["s"], true));
    expect(p.clips.s?.autoOrient).toBe(true);
    expect(setAutoOrient(p, ["s"], true)).toBeNull();
    p = run(p, setAutoOrient(p, ["s"], false));
    expect(p.clips.s?.autoOrient).toBeUndefined();
  });

  it("a parent change converts the path under the new parent", () => {
    const path = shape("s", "v1", { keyframes: { "transform.position": [key(0, [0, 0], { spatialOut: [100, 0] }), key(40, [200, 0], { spatialIn: [-100, 0] })] } });
    let p = rig([path, nul("n", "v2", { transform: T({ x: 30, y: 10, rotation: 90 }) })]);
    const before = [0, 20, 40].map((f) => world(p, "s", f));
    p = run(p, setParent(p, ["s"], "n", 0));
    [0, 20, 40].forEach((f, i) => {
      const w = world(p, "s", f);
      expect(w.x).toBeCloseTo((before[i] as Transform).x, 4);
      expect(w.y).toBeCloseTo((before[i] as Transform).y, 4);
    });
  });
});

describe("add a null", () => {
  it("adds an invisible controller on a free top track, or a new track", () => {
    const p = rig([shape("a", "v3")]);
    const free = addNull(p, 10, (() => { let n = 0; return () => `id${n++}`; })());
    let next = run(p, free.command, 10);
    expect(next.clips[free.clipId]).toMatchObject({ kind: "null", start: 10, size: { w: 100, h: 100 } });
    expect(next.tracks).toHaveLength(4);
    next = run(next, addNull(next, 10, (() => { let n = 10; return () => `id${n++}`; })()).command, 10);
    expect(next.tracks.length).toBeGreaterThanOrEqual(4);
  });
});

describe("copies and compounds keep parent links whole", () => {
  it("a copy follows the parent copied with it; one left behind stays the parent", async () => {
    const { copyClips } = await import("./duplicate.js");
    const a = shape("a", "v1");
    const b = shape("b", "v2", { parentId: "a" });
    let n = 0;
    const both = copyClips([a, b], () => `n${n++}`, { links: true, transitions: true });
    expect(both[1]?.parentId).toBe(both[0]?.id);
    const alone = copyClips([b], () => `m${n++}`, { links: true, transitions: true });
    expect(alone[0]?.parentId).toBe("a");
  });

  it("make compound refuses to split a parent from its children", async () => {
    const { makeCompoundProblem } = await import("./compound.js");
    const p = rig([shape("a", "v1"), shape("b", "v2", { parentId: "a" })]);
    expect(makeCompoundProblem(p, ["a"])).toMatch(/together/);
    expect(makeCompoundProblem(p, ["a", "b"])).toBeNull();
  });
});
