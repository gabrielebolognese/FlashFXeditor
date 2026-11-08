import { describe, expect, it } from "vitest";
import { ease } from "./keyframes.js";
import { directionVector, HAS_ANGLE, HAS_CENTER, HAS_DIRECTION, TRANSITION_CODE, TRANSITION_GROUPS, TRANSITION_LABELS, transitionDefaults, transitionFx, transitionIssues, transitionMix, travelOffsets, withKind } from "./transitions.js";
import { TRANSITION_KINDS, type Transition } from "./types.js";
import { makeMediaClip, makeProject } from "./fixtures.js";

const base = { id: "t", before: 6, after: 6 } as const;

describe("transitions v2 model (spec §21.16)", () => {
  it("lists every kind with a label, a group and a distinct shader code", () => {
    expect(TRANSITION_KINDS).toHaveLength(13);
    const grouped = TRANSITION_GROUPS.flatMap((group) => group.kinds);
    expect([...grouped].sort()).toEqual([...TRANSITION_KINDS].sort());
    for (const kind of TRANSITION_KINDS) expect(TRANSITION_LABELS[kind]).not.toBe("");
    const codes = TRANSITION_KINDS.filter((kind) => !kind.startsWith("dip") && kind !== "crossDissolve").map((kind) => TRANSITION_CODE[kind]);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.every((code) => code > 0)).toBe(true);
  });

  it("creates the motion kinds with easeInOut and the others with the v1 linear mix", () => {
    for (const kind of ["slide", "push", "whip", "zoomIn", "zoomOut", "wipe", "iris"] as const) expect(transitionDefaults(kind).ease).toBe("easeInOut");
    for (const kind of ["crossDissolve", "dipToBlack", "dipToWhite", "blurDissolve", "glitch", "flash"] as const) expect(transitionDefaults(kind).ease).toBeUndefined();
    expect(transitionDefaults("slide")).toEqual({ direction: "left", ease: "easeInOut" });
    expect(transitionDefaults("wipe")).toMatchObject({ angle: 0, softness: 0.1 });
    expect(transitionDefaults("iris").center).toEqual({ x: 0.5, y: 0.5 });
  });

  it("mixes a transition without ease exactly as before Batch 71", () => {
    const old: Transition = { ...base, kind: "crossDissolve" };
    expect([53, 54, 59, 60, 65].map((frame) => transitionMix(old, 60, frame))).toEqual([0, 1, 6, 7, 12].map((i) => Math.max(0, i) / 13).map((v, i) => (i === 0 ? 0 : v)));
  });

  it("eases the mix through the curve", () => {
    const eased: Transition = { ...base, kind: "push", ease: "easeInOut" };
    for (let frame = 54; frame < 66; frame++) expect(transitionMix(eased, 60, frame)).toBeCloseTo(ease("easeInOut", (frame - 54 + 1) / 13), 12);
    expect(transitionMix(eased, 60, 54)).toBeLessThan(1 / 13);
  });

  it("moves both pictures of a push by exactly the frame width over the transition", () => {
    const end = travelOffsets("push", ease("easeInOut", 1));
    expect(end.from).toBe(1);
    expect(end.to).toBeCloseTo(0, 15);
    const start = travelOffsets("push", ease("easeInOut", 0));
    expect(start.from).toBe(0);
    expect(start.to).toBe(-1);
    for (const t of [0.1, 0.37, 0.5, 0.9]) {
      const o = travelOffsets("push", t);
      expect(o.from - o.to).toBeCloseTo(1, 12);
    }
    expect(travelOffsets("slide", 0.25)).toEqual({ from: 0, to: -0.75 });
  });

  it("reads the direction of travel (left by default)", () => {
    expect(directionVector(undefined)).toEqual([-1, 0]);
    expect(directionVector("right")).toEqual([1, 0]);
    expect(directionVector("up")).toEqual([0, -1]);
    expect(directionVector("down")).toEqual([0, 1]);
    expect(transitionFx({ kind: "slide", direction: "down" })).toMatchObject({ code: 1, dx: 0, dy: 1 });
  });

  it("turns a wipe angle into the edge direction and clamps the softness", () => {
    const fx = transitionFx({ kind: "wipe", angle: 90, softness: 5 });
    expect(fx.code).toBe(3);
    expect(fx.dx).toBeCloseTo(0, 12);
    expect(fx.dy).toBeCloseTo(1, 12);
    expect(fx.softness).toBe(1);
    expect(transitionFx({ kind: "iris", center: { x: 0.25, y: 0.75 } })).toMatchObject({ code: 4, cx: 0.25, cy: 0.75 });
    expect(transitionFx({ kind: "crossDissolve" }).code).toBe(0);
  });

  it("changes kind keeping id and sides, with the parameters of the new kind", () => {
    const slide: Transition = { ...base, kind: "slide", direction: "up", ease: "easeInOut" };
    expect(withKind(slide, "wipe")).toEqual({ id: "t", kind: "wipe", before: 6, after: 6, angle: 0, softness: 0.1, ease: "easeInOut" });
    expect(withKind(slide, "crossDissolve")).toEqual({ id: "t", kind: "crossDissolve", before: 6, after: 6 });
    expect(withKind({ ...base, kind: "slide", ease: "cubicOut" }, "push").ease).toBe("cubicOut");
    expect(HAS_DIRECTION.has("whip") && HAS_ANGLE.has("wipe") && HAS_CENTER.has("iris")).toBe(true);
  });

  it("validates the new fields", () => {
    const p = makeProject();
    const left = makeMediaClip(p, { id: "L", trackId: "v1", start: 0, duration: 30, mediaId: "m", kind: "video" });
    const issuesFor = (transition: Transition) => transitionIssues(p, [{ ...left, transitionOut: transition }], () => "L").filter((issue) => !issue.includes("does not match"));
    expect(issuesFor({ ...base, kind: "slide", direction: "up", ease: "easeInOut" })).toEqual([]);
    expect(issuesFor({ ...base, kind: "slide", direction: "sideways" as never })).toHaveLength(1);
    expect(issuesFor({ ...base, kind: "wipe", softness: 2 })).toHaveLength(1);
    expect(issuesFor({ ...base, kind: "wipe", angle: Number.NaN })).toHaveLength(1);
    expect(issuesFor({ ...base, kind: "iris", center: { x: Number.NaN, y: 0 } })).toHaveLength(1);
    expect(issuesFor({ ...base, kind: "push", ease: "wobble" as never })).toHaveLength(1);
  });
});
