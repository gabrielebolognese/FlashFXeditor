import { describe, expect, it } from "vitest";
import type { Command } from "../../core/commands/command.js";
import { makeMedia, makeMediaClip, makeProject, makeSolidClip, makeTextClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { Clip, Effect, Keyframes, Project } from "../../core/document/types.js";
import { validateProject } from "../../core/document/validate.js";
import { packEffects, EFFECT_BLOCK, paramOffset } from "../../core/effects/effectEval.js";
import { addEffect, effectParamAt, effectParamKeyed, moveEffect, nextEffectId, removeAllEffects, removeEffect, setEffectEnabled, setEffectParam, setEffectStopwatch, takesEffects, toggleEffectKey } from "./effects.js";

function doc(): Project {
  const p = makeProject();
  p.media.m1 = { ...makeMedia("m1", "video"), width: 1920, height: 1080 };
  p.tracks = [makeTrack("v1"), makeTrack("v2"), makeTrack("v3"), makeTrack("a1", "audio")];
  const next = withClips(p, [
    makeMediaClip(p, { id: "v", trackId: "v1", start: 0, duration: 60, mediaId: "m1" }),
    makeTextClip({ id: "t", trackId: "v2", start: 10, duration: 30, value: "Title" }),
    makeSolidClip({ id: "s", trackId: "v3", start: 0, duration: 30 }),
    makeMediaClip(p, { id: "a", trackId: "a1", start: 0, duration: 30, mediaId: "m1", kind: "audio" }),
  ]);
  expect(validateProject(next)).toEqual([]);
  return next;
}

const run = (p: Project, command: Command | null): Project => {
  expect(command).not.toBeNull();
  const next = structuredClone(p);
  command?.run(next as never, { playhead: 0 } as never);
  expect(validateProject(next)).toEqual([]);
  return next;
};

const fx = (p: Project, id: string) => (p.clips[id] as Clip & { effects?: Effect[] }).effects ?? [];
const kf = (p: Project, id: string) => (p.clips[id] as Clip & { keyframes?: Keyframes }).keyframes;

describe("effect edits (spec §21.19, Batch 74)", () => {
  it("adds an effect with its defaults to every visual clip, never to audio", () => {
    const p = doc();
    expect(takesEffects(p.clips.a as Clip)).toBe(false);
    const next = run(p, addEffect(p, ["v", "t", "a"], "glow"));
    expect(fx(next, "v")).toEqual([{ id: "fx1", type: "glow", enabled: true, params: { mode: "outer", radius: 20, intensity: 1, threshold: 0, color: [1, 1, 1, 1] } }]);
    expect(fx(next, "t")[0]?.id).toBe("fx1");
    expect(fx(next, "a")).toEqual([]);
    expect(nextEffectId(fx(next, "v"))).toBe("fx2");
    expect(addEffect(p, ["a"], "glow")).toBeNull();
  });

  it("reorders a stack, and the order changes what is packed for the renderer", () => {
    let p = doc();
    p = run(p, addEffect(p, ["s"], "gaussianBlur"));
    p = run(p, addEffect(p, ["s"], "outline"));
    const order = (q: Project) => fx(q, "s").map((e) => e.type);
    expect(order(p)).toEqual(["gaussianBlur", "outline"]);
    const swapped = run(p, moveEffect(p, "s", "fx2", 0));
    expect(order(swapped)).toEqual(["outline", "gaussianBlur"]);
    const pack = (q: Project) => {
      const out = new Float32Array(2 * EFFECT_BLOCK);
      packEffects(q.clips.s as never, 0, out);
      return Array.from(out);
    };
    expect(pack(swapped)).not.toEqual(pack(p));
    expect(moveEffect(p, "s", "fx1", 0)).toBeNull();
  });

  it("disables an effect in one step that undoes by its patches", () => {
    let p = doc();
    p = run(p, addEffect(p, ["s"], "dropShadow"));
    const off = run(p, setEffectEnabled(p, "s", "fx1", false));
    expect(fx(off, "s")[0]?.enabled).toBe(false);
    expect(packEffects(off.clips.s as never, 0, new Float32Array(EFFECT_BLOCK))).toBe(0);
    expect(setEffectEnabled(off, "s", "fx1", false)).toBeNull();
  });

  it("writes a parameter as its base, clamped, or as a key when its stopwatch is on", () => {
    let p = doc();
    p = run(p, addEffect(p, ["t"], "glow"));
    p = run(p, setEffectParam(p, "t", "fx1", "radius", 900, 15));
    expect(fx(p, "t")[0]?.params.radius).toBe(500);
    expect(setEffectParam(p, "t", "fx1", "radius", 500, 15)).toBeNull();
    expect(setEffectParam(p, "t", "fx1", "mode", "sideways", 15)).toBeNull();
    p = run(p, setEffectParam(p, "t", "fx1", "mode", "inner", 15));
    expect(fx(p, "t")[0]?.params.mode).toBe("inner");
    // Glow intensity keyed 0 -> 1 over the clip.
    p = run(p, setEffectStopwatch(p, "t", "fx1", "intensity", true, 10));
    expect(effectParamKeyed(p.clips.t as never, "fx1", "intensity")).toBe(true);
    p = run(p, setEffectParam(p, "t", "fx1", "intensity", 0, 10));
    p = run(p, setEffectParam(p, "t", "fx1", "intensity", 1, 39));
    expect(kf(p, "t")?.["effects.fx1.intensity"]?.map((k) => [k.frame, k.value])).toEqual([
      [0, 0],
      [29, 1],
    ]);
    const clip = p.clips.t as Clip & { effects: Effect[] };
    const at = (frame: number) => effectParamAt(clip, clip.effects[0] as Effect, "intensity", frame) as number;
    expect(at(10)).toBe(0);
    expect(at(39)).toBe(1);
    expect(at(25)).toBeGreaterThan(0);
    expect(at(25)).toBeLessThan(1);
    // Packed intensity follows the keys.
    const out = new Float32Array(EFFECT_BLOCK);
    packEffects(clip, 15, out);
    expect(out[paramOffset("glow", "intensity")]).toBeCloseTo(at(25), 5);
    // A choice cannot be keyed.
    expect(setEffectStopwatch(p, "t", "fx1", "mode", true, 10)).toBeNull();
  });

  it("keys colors as vectors and toggles a key at the playhead", () => {
    let p = doc();
    p = run(p, addEffect(p, ["s"], "outline"));
    p = run(p, setEffectStopwatch(p, "s", "fx1", "color", true, 0));
    p = run(p, setEffectParam(p, "s", "fx1", "color", [1, 0, 0, 2], 20));
    expect(kf(p, "s")?.["effects.fx1.color"]?.at(-1)?.value).toEqual([1, 0, 0, 1]);
    p = run(p, toggleEffectKey(p, "s", "fx1", "color", 20));
    expect(kf(p, "s")?.["effects.fx1.color"]?.length).toBe(1);
    p = run(p, toggleEffectKey(p, "s", "fx1", "color", 5));
    expect(kf(p, "s")?.["effects.fx1.color"]?.length).toBe(2);
    // The stopwatch off keeps the shown value as the base.
    p = run(p, setEffectStopwatch(p, "s", "fx1", "color", false, 5));
    expect(kf(p, "s")?.["effects.fx1.color"]).toBeUndefined();
    expect(fx(p, "s")[0]?.params.color).toEqual([1, 1, 1, 1]);
  });

  it("removes an effect with its keys, or all of them", () => {
    let p = doc();
    p = run(p, addEffect(p, ["s", "v"], "gaussianBlur"));
    p = run(p, setEffectStopwatch(p, "s", "fx1", "radius", true, 0));
    p = run(p, addEffect(p, ["s"], "directionalBlur"));
    const removed = run(p, removeEffect(p, "s", "fx1"));
    expect(fx(removed, "s").map((e) => e.id)).toEqual(["fx2"]);
    expect(kf(removed, "s")).toBeUndefined();
    const cleared = run(p, removeAllEffects(p, ["s", "v"]));
    expect(fx(cleared, "s")).toEqual([]);
    expect(fx(cleared, "v")).toEqual([]);
    expect(removeAllEffects(cleared, ["s"])).toBeNull();
  });
});
